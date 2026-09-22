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
 *   5. role             - pirumar_kainkaryam | tirtha_kainkaryam | admin
 *   6. created_at       - ISO timestamp
 *   7. last_login_at    - ISO timestamp, blank until first login
 *
 * No plaintext password is ever stored.
 */

var USERS_SHEET_NAME = "Users";
var SELF_SERVE_ROLES = ["pirumar_kainkaryam", "tirtha_kainkaryam"];
var DEFAULT_TOKEN_TTL_SECONDS = 43200; // 12 hours

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

  sheet.appendRow([userId, email, salt, hash, role, createdAt, ""]);

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
    ]);
  }
  return sheet;
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
  return payload;
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

function normalizeEmail_(email) {
  return String(email || "").trim().toLowerCase();
}
