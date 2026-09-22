/**
 * Admin-only actions: viewing coverage across both self-serve roles and
 * assigning other people into slots. Multiple people may be assigned to the
 * same date/window/role. Called from
 * Scheduling.gs's action router — this file defines no doGet/doPost of its
 * own.
 *
 * Admin access is a single shared password (Script Property
 * ADMIN_PASSWORD), not a user account — there is no admin signup/role
 * promotion. Admin_login exchanges that password for the same kind of
 * signed session token self-serve login issues, with a synthetic
 * { userId: "admin", email: "admin", role: "admin" } identity, so the rest
 * of the admin actions below can keep using requireAdmin_/verifyToken_
 * unchanged.
 */

function Admin_login(body) {
  var expected = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD");
  if (!expected || body.password !== expected) {
    return { success: false, statusCode: 401, message: "Incorrect password" };
  }
  var user = { userId: "admin", email: "admin", role: "admin" };
  return { success: true, statusCode: 200, token: signToken_(user), user: user };
}

function Admin_listUsers(body) {
  var claims = requireAdmin_(body.token);
  if (!claims.ok) return claims.error;

  var role = body.role;
  var sheet = getUsersSheet_();
  var values = sheet.getDataRange().getValues();
  var users = [];
  for (var i = 1; i < values.length; i++) {
    var rowRole = values[i][4];
    if (role && rowRole !== role) continue;
    if (rowRole === "admin") continue;
    users.push({ userId: values[i][0], email: values[i][1], role: rowRole });
  }
  return { success: true, statusCode: 200, users: users };
}

function Admin_listSlots(body) {
  var claims = requireAdmin_(body.token);
  if (!claims.ok) return claims.error;

  var role = body.role;
  if (SELF_SERVE_ROLES.indexOf(role) === -1) {
    return { success: false, statusCode: 400, message: "role must be a self-serve role" };
  }

  var startDate = isValidDateString_(body.startDate) ? body.startDate : todayString_();
  var days = Math.min(Math.max(Number(body.days) || DEFAULT_LIST_DAYS, 1), MAX_LIST_DAYS);

  var existing = indexSlotsByKey_(getSlotsSheet_());
  var slots = [];
  for (var i = 0; i < days; i++) {
    var date = addDays_(startDate, i);
    var windows = windowsForRoleOnDate_(role, date);
    if (!windows) continue;
    for (var windowName in windows) {
      var key = slotKey_(date, windowName, role);
      var slot = existing[key];
      var assignments = slot ? slot.assignments : [];
      var assignedEmails = assignments.map(function (assignment) {
        return assignment.email;
      });
      slots.push({
        date: date,
        day: parseDate_(date).getDay(),
        window: windowName,
        start: windows[windowName].start,
        end: windows[windowName].end,
        status: assignments.length > 0 ? "booked" : "open",
        assignedCount: assignments.length,
        assignedEmails: assignedEmails,
        // Keep the original field for older clients; new clients should use
        // assignedEmails so overlaps are not hidden.
        assignedEmail: assignedEmails.length > 0 ? assignedEmails[0] : null,
      });
    }
  }
  return { success: true, statusCode: 200, slots: slots };
}

function Admin_assignSlot(body) {
  var claims = requireAdmin_(body.token);
  if (!claims.ok) return claims.error;

  if (SELF_SERVE_ROLES.indexOf(body.role) === -1) {
    return { success: false, statusCode: 400, message: "role must be a self-serve role" };
  }
  if (!isValidDateString_(body.date) || ["morning", "evening"].indexOf(body.window) === -1) {
    return { success: false, statusCode: 400, message: "Invalid date or window" };
  }

  var windows = windowsForRoleOnDate_(body.role, body.date);
  if (!windows) {
    return { success: false, statusCode: 400, message: "This role is not open on that day" };
  }

  var targetUser = findUserRow_(getUsersSheet_(), normalizeEmail_(body.email));
  if (!targetUser) {
    return { success: false, statusCode: 404, message: "No account found for that email" };
  }
  if (targetUser.values[4] !== body.role) {
    return { success: false, statusCode: 400, message: "That person is not signed up for this role" };
  }

  var win = windows[body.window];
  var sheet = getSlotsSheet_();
  var existingAssignment = findUserSlotRow_(
    sheet,
    body.date,
    body.window,
    body.role,
    targetUser.values[0],
  );
  if (existingAssignment) {
    return { success: false, statusCode: 409, message: "That person is already assigned to this slot" };
  }

  var openRow = findOpenSlotRow_(sheet, body.date, body.window, body.role);
  var assignedAt = new Date().toISOString();

  if (openRow) {
    sheet.getRange(openRow.rowIndex, 8).setValue("booked");
    sheet.getRange(openRow.rowIndex, 9).setValue(targetUser.values[0]);
    sheet.getRange(openRow.rowIndex, 10).setValue(targetUser.values[1]);
    sheet.getRange(openRow.rowIndex, 11).setValue(assignedAt);
  } else {
    sheet.appendRow([
      Utilities.getUuid(),
      body.date,
      parseDate_(body.date).getDay(),
      body.window,
      body.role,
      win.start,
      win.end,
      "booked",
      targetUser.values[0],
      targetUser.values[1],
      assignedAt,
    ]);
  }

  return { success: true, statusCode: 200 };
}

function Admin_unassignSlot(body) {
  var claims = requireAdmin_(body.token);
  if (!claims.ok) return claims.error;

  if (SELF_SERVE_ROLES.indexOf(body.role) === -1) {
    return { success: false, statusCode: 400, message: "role must be a self-serve role" };
  }
  if (!isValidDateString_(body.date) || ["morning", "evening"].indexOf(body.window) === -1) {
    return { success: false, statusCode: 400, message: "Invalid date or window" };
  }

  var sheet = getSlotsSheet_();
  var normalizedEmail = body.email ? normalizeEmail_(body.email) : null;
  var row = normalizedEmail
    ? findAssignedEmailRow_(sheet, body.date, body.window, body.role, normalizedEmail)
    : findSlotRow_(sheet, body.date, body.window, body.role);
  if (!row || row.values[7] !== "booked") {
    return { success: false, statusCode: 404, message: "No active assignment found" };
  }

  sheet.getRange(row.rowIndex, 8).setValue("open");
  sheet.getRange(row.rowIndex, 9).setValue("");
  sheet.getRange(row.rowIndex, 10).setValue("");
  sheet.getRange(row.rowIndex, 11).setValue("");

  return { success: true, statusCode: 200 };
}

// --- helpers -------------------------------------------------------------

function requireAdmin_(token) {
  var claims = verifyToken_(token);
  if (!claims) {
    return { ok: false, error: { success: false, statusCode: 401, message: "Invalid or expired token" } };
  }
  if (claims.user.role !== "admin") {
    return { ok: false, error: { success: false, statusCode: 403, message: "Admin access required" } };
  }
  return { ok: true, claims: claims };
}
