/**
 * User registration, login, and session-token validation, backed by the
 * "Users" sheet tab. Called from Scheduling.gs's action router — this file
 * defines no doGet/doPost of its own.
 *
 * Users sheet columns:
 *   1. user_id        - UUID
 *   2. email           - lowercased, unique
 *   3. password_salt   - random hex string
 *   4. password_hash   - SHA-256(salt + password), hex
 *   5. role             - perumal_kainkaryam | tirtha_kainkaryam | admin
 *   6. created_at       - ISO timestamp
 *   7. last_login_at    - ISO timestamp, blank until first login
 *   8. signup_confirmation_sent_at - ISO timestamp after the welcome email
 *   9-11. reset token hash, expiry, and request throttle timestamp
 *   12. password_changed_at - invalidates sessions issued before a reset
 *
 * No plaintext password is ever stored.
 */

var USERS_SHEET_NAME = "Users";
var SELF_SERVE_ROLES = ["perumal_kainkaryam", "tirtha_kainkaryam", "coordinator"];
var DEFAULT_TOKEN_TTL_SECONDS = 43200; // 12 hours
var PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
var PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;

function Users_register(body) {
  var email = normalizeEmail_(body.email);
  var password = body.password;
  var role = body.role;

  if (!isValidEmail_(email) || !password || password.length < 8) {
    return { success: false, statusCode: 400, message: "Invalid email or password" };
  }
  if (SELF_SERVE_ROLES.indexOf(role) === -1) {
    return { success: false, statusCode: 400, message: "Invalid role" };
  }

  var sheet = getUsersSheet_();
  if (findUserRow_(sheet, email)) {
    return { success: false, statusCode: 409, message: "An account with this email already exists" };
  }

  var salt = Utilities.getUuid().replace(/-/g, "");
  var hash = hashPassword_(salt, password);
  var userId = Utilities.getUuid();
  var createdAt = new Date().toISOString();

  ensureUserNotificationColumn_(sheet);
  sheet.appendRow([userId, email, salt, hash, role, createdAt, "", ""]);
  sendSignupConfirmation_(sheet, sheet.getLastRow(), "New account signup");

  var user = { userId: userId, email: email, role: role };
  return { success: true, statusCode: 200, token: signToken_(user), user: user };
}

function Users_login(body) {
  var email = normalizeEmail_(body.email);
  var password = body.password;

  var sheet = getUsersSheet_();
  var row = findUserRow_(sheet, email);
  if (!row) {
    return { success: false, statusCode: 404, message: "No account found for this email" };
  }

  var expectedHash = hashPassword_(row.values[2], password);
  if (expectedHash !== row.values[3]) {
    return { success: false, statusCode: 401, message: "Incorrect email or password" };
  }

  sheet.getRange(row.rowIndex, 7).setValue(new Date().toISOString());

  var user = { userId: row.values[0], email: row.values[1], role: row.values[4] };
  return { success: true, statusCode: 200, token: signToken_(user), user: user };
}

function Users_validateToken(body) {
  var claims = verifyToken_(body.token);
  if (!claims) {
    return { success: false, statusCode: 401, message: "Invalid or expired token" };
  }
  return { success: true, statusCode: 200, user: claims.user };
}

function Users_changeRole(body) {
  var claims = verifyToken_(body.token);
  if (!claims) {
    return { success: false, statusCode: 401, message: "Invalid or expired token" };
  }
  if (SELF_SERVE_ROLES.indexOf(claims.user.role) === -1) {
    return { success: false, statusCode: 403, message: "Only self-serve accounts can change Kainkaryam" };
  }
  if (SELF_SERVE_ROLES.indexOf(body.role) === -1) {
    return { success: false, statusCode: 400, message: "Invalid Kainkaryam role" };
  }

  var usersSheet = getUsersSheet_();
  var userRow = findUserRowById_(usersSheet, claims.user.userId);
  if (!userRow) {
    return { success: false, statusCode: 404, message: "Account not found" };
  }

  var clearedAssignmentCount = clearAllUserAssignments_(claims.user.userId);
  var updatedVacationCount = updateUserVacationRoles_(claims.user.userId, body.role);
  usersSheet.getRange(userRow.rowIndex, 5).setValue(body.role);

  var user = {
    userId: String(userRow.values[0]),
    email: String(userRow.values[1]),
    role: body.role,
  };
  return {
    success: true,
    statusCode: 200,
    token: signToken_(user),
    user: user,
    clearedAssignmentCount: clearedAssignmentCount,
    updatedVacationCount: updatedVacationCount,
  };
}

function Users_deleteAccount(body) {
  var claims = verifyToken_(body.token);
  if (!claims) {
    return { success: false, statusCode: 401, message: "Invalid or expired token" };
  }
  if (SELF_SERVE_ROLES.indexOf(claims.user.role) === -1) {
    return { success: false, statusCode: 403, message: "Only self-serve accounts can be deleted" };
  }

  var usersSheet = getUsersSheet_();
  var userRow = findUserRowById_(usersSheet, claims.user.userId);
  if (!userRow) {
    return { success: false, statusCode: 404, message: "Account not found" };
  }

  var clearedAssignmentCount = clearAllUserAssignments_(claims.user.userId);
  var removedVacationCount = removeAllUserVacations_(claims.user.userId);
  usersSheet.deleteRow(userRow.rowIndex);

  return {
    success: true,
    statusCode: 200,
    clearedAssignmentCount: clearedAssignmentCount,
    removedVacationCount: removedVacationCount,
  };
}

// --- helpers ---------------------------------------------------------

function getUsersSheet_() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
    sheet.appendRow([
      "user_id",
      "email",
      "password_salt",
      "password_hash",
      "role",
      "created_at",
      "last_login_at",
      "signup_confirmation_sent_at",
    ]);
  }
  ensureUserNotificationColumn_(sheet);
  return sheet;
}

function Users_requestPasswordReset(body) {
  var email = normalizeEmail_(body.email);
  if (!isValidEmail_(email)) {
    return { success: false, statusCode: 400, message: "Invalid email" };
  }

  var sheet = getUsersSheet_();
  var row = findUserRow_(sheet, email);
  if (!row) return { success: true, statusCode: 200 };

  var now = Date.now();
  var lastRequested = Date.parse(String(row.values[10] || ""));
  if (Number.isFinite(lastRequested) && now - lastRequested < PASSWORD_RESET_COOLDOWN_MS) {
    return { success: true, statusCode: 200 };
  }

  var token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  var tokenHash = hashResetToken_(token);
  sheet.getRange(row.rowIndex, 9, 1, 3).setValues([[
    tokenHash,
    new Date(now + PASSWORD_RESET_TTL_MS).toISOString(),
    new Date(now).toISOString(),
  ]]);

  if (!sendPasswordResetEmail_(email, token)) {
    sheet.getRange(row.rowIndex, 9, 1, 3).clearContent();
  }
  return { success: true, statusCode: 200 };
}

function Users_completePasswordReset(body) {
  var token = body.token;
  var password = body.password;
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/i.test(token) || !password || password.length < 8) {
    return { success: false, statusCode: 400, message: "Invalid or expired reset link, or password is too short" };
  }

  var sheet = getUsersSheet_();
  var tokenHash = hashResetToken_(token);
  var values = sheet.getDataRange().getValues();
  var rowIndex = 0;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][8] || "") === tokenHash) {
      rowIndex = i + 1;
      break;
    }
  }
  if (!rowIndex) {
    return { success: false, statusCode: 400, message: "Invalid or expired reset link" };
  }

  var expiresAt = Date.parse(String(sheet.getRange(rowIndex, 10).getValue() || ""));
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    sheet.getRange(rowIndex, 9, 1, 3).clearContent();
    return { success: false, statusCode: 400, message: "Invalid or expired reset link" };
  }

  var salt = Utilities.getUuid().replace(/-/g, "");
  sheet.getRange(rowIndex, 3, 1, 2).setValues([[salt, hashPassword_(salt, password)]]);
  sheet.getRange(rowIndex, 9, 1, 4).clearContent();
  sheet.getRange(rowIndex, 12).setValue(new Date().toISOString());
  return { success: true, statusCode: 200, message: "Password updated. You can now log in with your new password." };
}

function ensureUserNotificationColumn_(sheet) {
  if (sheet.getRange(1, 8).getValue() !== "signup_confirmation_sent_at") {
    sheet.getRange(1, 8).setValue("signup_confirmation_sent_at");
  }
  [
    "password_reset_token_hash",
    "password_reset_expires_at",
    "password_reset_requested_at",
    "password_changed_at",
  ].forEach(function (header, index) {
    var column = index + 9;
    var existingHeader = sheet.getRange(1, column).getValue();
    if (existingHeader && existingHeader !== header) {
      throw new Error("Unexpected Users sheet header in column " + column);
    }
    if (!existingHeader) {
      sheet.getRange(1, column).setValue(header);
    }
  });
}

function findUserRow_(sheet, email) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][1]).toLowerCase() === email) {
      return { rowIndex: i + 1, values: values[i] };
    }
  }
  return null;
}

function findUserRowById_(sheet, userId) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(userId)) {
      return { rowIndex: i + 1, values: values[i] };
    }
  }
  return null;
}

function clearAllUserAssignments_(userId) {
  var sheet = getSlotsSheet_();
  var values = sheet.getDataRange().getValues();
  var cleared = 0;
  for (var i = 1; i < values.length; i++) {
    if (values[i][7] === "booked" && String(values[i][8]) === String(userId)) {
      clearAssignmentRow_(sheet, i + 1);
      cleared++;
    }
  }
  return cleared;
}

function removeAllUserVacations_(userId) {
  var sheet = getVacationsSheet_();
  var values = sheet.getDataRange().getValues();
  var removed = 0;
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][1]) === String(userId)) {
      sheet.deleteRow(i + 1);
      removed++;
    }
  }
  return removed;
}

function updateUserVacationRoles_(userId, role) {
  var sheet = getVacationsSheet_();
  var values = sheet.getDataRange().getValues();
  var updated = 0;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][1]) === String(userId) && String(values[i][3]) !== String(role)) {
      sheet.getRange(i + 1, 4).setValue(role);
      updated++;
    }
  }
  return updated;
}

function hashPassword_(salt, password) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + ":" + password,
  );
  return digest
    .map(function (byte) {
      return ("0" + (byte & 0xff).toString(16)).slice(-2);
    })
    .join("");
}

function signToken_(user) {
  var secret = PropertiesService.getScriptProperties().getProperty("TOKEN_SIGNING_SECRET");
  var ttl = Number(
    PropertiesService.getScriptProperties().getProperty("TOKEN_TTL_SECONDS"),
  ) || DEFAULT_TOKEN_TTL_SECONDS;

  var payload = {
    user: user,
    issuedAtMs: Date.now(),
    expiresAtMs: Date.now() + ttl * 1000,
  };
  var payloadB64 = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  var signature = Utilities.computeHmacSha256Signature(payloadB64, secret);
  var sigB64 = Utilities.base64EncodeWebSafe(signature);
  return payloadB64 + "." + sigB64;
}

function verifyToken_(token) {
  if (!token || token.indexOf(".") === -1) {
    return null;
  }
  var secret = PropertiesService.getScriptProperties().getProperty("TOKEN_SIGNING_SECRET");
  var parts = token.split(".");
  var payloadB64 = parts[0];
  var sigB64 = parts[1];

  var expectedSig = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payloadB64, secret),
  );
  if (expectedSig !== sigB64) {
    return null;
  }

  var payload;
  try {
    payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString());
  } catch (err) {
    return null;
  }

  if (!payload.expiresAtMs || Date.now() > payload.expiresAtMs) {
    return null;
  }
  if (payload.user && payload.user.role !== "admin") {
    var currentUser = findUserRowById_(getUsersSheet_(), payload.user.userId);
    if (
      !currentUser ||
      normalizeEmail_(currentUser.values[1]) !== normalizeEmail_(payload.user.email) ||
      currentUser.values[4] !== payload.user.role ||
      Date.parse(String(currentUser.values[11] || "")) > Number(payload.issuedAtMs || 0)
    ) {
      return null;
    }
  }
  return payload;
}

function hashResetToken_(token) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token);
  return digest.map(function (byte) {
    return ("0" + (byte & 0xff).toString(16)).slice(-2);
  }).join("");
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

function normalizeEmail_(email) {
  return String(email || "").trim().toLowerCase();
}
