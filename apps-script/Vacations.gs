/**
 * User and admin vacation periods, backed by the "Vacations" sheet tab.
 *
 * Vacations are availability blocks. They prevent new self-bookings and
 * admin assignments during the saved date range, but do not silently delete
 * bookings that already exist. A person can still cancel an existing booking
 * during vacation.
 *
 * Vacations sheet columns:
 *   1. vacation_id - UUID
 *   2. user_id     - user UUID
 *   3. email       - normalized account email
 *   4. role        - self-serve role at creation time
 *   5. start_date  - YYYY-MM-DD
 *   6. end_date    - YYYY-MM-DD, inclusive
 *   7. created_at  - ISO timestamp
 */

var VACATIONS_SHEET_NAME = "Vacations";
var MAX_VACATION_DAYS = 366;

function Vacations_list(body) {
  var claims = verifyToken_(body.token);
  if (!claims) {
    return { success: false, statusCode: 401, message: "Invalid or expired token" };
  }
  if (SELF_SERVE_ROLES.indexOf(claims.user.role) === -1) {
    return { success: false, statusCode: 403, message: "Vacation access is only available to self-serve roles" };
  }

  return { success: true, statusCode: 200, vacations: getUserVacations_(claims.user.userId) };
}

function Vacations_create(body) {
  var claims = verifyToken_(body.token);
  if (!claims) {
    return { success: false, statusCode: 401, message: "Invalid or expired token" };
  }
  if (SELF_SERVE_ROLES.indexOf(claims.user.role) === -1) {
    return { success: false, statusCode: 403, message: "Vacation access is only available to self-serve roles" };
  }
  if (!isRealDateString_(body.startDate) || !isRealDateString_(body.endDate) || body.endDate < body.startDate) {
    return { success: false, statusCode: 400, message: "Invalid vacation date range" };
  }
  if (isPastDate_(body.startDate)) {
    return { success: false, statusCode: 400, message: "Vacation must start today or later" };
  }
  if (vacationDayCount_(body.startDate, body.endDate) > MAX_VACATION_DAYS) {
    return { success: false, statusCode: 400, message: "Vacation cannot be longer than one year" };
  }

  var sheet = getVacationsSheet_();
  var existing = getUserVacations_(claims.user.userId);
  var overlaps = existing.some(function (vacation) {
    return body.startDate <= vacation.endDate && body.endDate >= vacation.startDate;
  });
  if (overlaps) {
    return { success: false, statusCode: 409, message: "This vacation overlaps an existing vacation" };
  }

  var vacation = {
    vacationId: Utilities.getUuid(),
    userId: claims.user.userId,
    email: claims.user.email,
    role: claims.user.role,
    startDate: body.startDate,
    endDate: body.endDate,
    createdAt: new Date().toISOString(),
  };
  sheet.appendRow([
    vacation.vacationId,
    vacation.userId,
    vacation.email,
    vacation.role,
    vacation.startDate,
    vacation.endDate,
    vacation.createdAt,
  ]);

  var clearedAssignmentCount = clearUserAssignmentsInRange_(
    claims.user.userId,
    vacation.startDate,
    vacation.endDate,
  );

  return {
    success: true,
    statusCode: 200,
    vacation: vacation,
    clearedAssignmentCount: clearedAssignmentCount,
  };
}

function Vacations_delete(body) {
  var claims = verifyToken_(body.token);
  if (!claims) {
    return { success: false, statusCode: 401, message: "Invalid or expired token" };
  }
  if (SELF_SERVE_ROLES.indexOf(claims.user.role) === -1) {
    return { success: false, statusCode: 403, message: "Vacation access is only available to self-serve roles" };
  }

  var sheet = getVacationsSheet_();
  var row = findVacationRow_(sheet, body.vacationId, claims.user.userId);
  if (!row) {
    return { success: false, statusCode: 404, message: "Vacation not found" };
  }
  sheet.deleteRow(row.rowIndex);
  return { success: true, statusCode: 200 };
}

function Admin_listVacations(body) {
  var claims = requireAdmin_(body.token);
  if (!claims.ok) return claims.error;

  var startDate = isRealDateString_(body.startDate) ? body.startDate : todayString_();
  var days = Math.min(Math.max(Number(body.days) || DEFAULT_LIST_DAYS, 1), MAX_LIST_DAYS);
  var endDate = addDays_(startDate, days - 1);
  var role = body.role;
  if (role && SELF_SERVE_ROLES.indexOf(role) === -1) {
    return { success: false, statusCode: 400, message: "Invalid role" };
  }

  var vacations = listAllVacations_().filter(function (vacation) {
    return (!role || vacation.role === role) &&
      vacation.startDate <= endDate && vacation.endDate >= startDate;
  });
  return { success: true, statusCode: 200, vacations: vacations };
}

function Admin_createVacation(body) {
  var claims = requireAdmin_(body.token);
  if (!claims.ok) return claims.error;

  var rangeError = validateAdminVacationRange_(body.startDate, body.endDate);
  if (rangeError) return rangeError;

  var email = normalizeEmail_(body.email);
  var userRow = findUserRow_(getUsersSheet_(), email);
  if (!userRow || SELF_SERVE_ROLES.indexOf(userRow.values[4]) === -1) {
    return { success: false, statusCode: 404, message: "Self-serve user not found" };
  }

  var userId = String(userRow.values[0]);
  var existing = getUserVacations_(userId);
  if (vacationRangeOverlaps_(existing, body.startDate, body.endDate, null)) {
    return { success: false, statusCode: 409, message: "This vacation overlaps an existing vacation" };
  }

  var vacation = {
    vacationId: Utilities.getUuid(),
    userId: userId,
    email: String(userRow.values[1]),
    role: String(userRow.values[4]),
    startDate: body.startDate,
    endDate: body.endDate,
    createdAt: new Date().toISOString(),
  };
  getVacationsSheet_().appendRow([
    vacation.vacationId,
    vacation.userId,
    vacation.email,
    vacation.role,
    vacation.startDate,
    vacation.endDate,
    vacation.createdAt,
  ]);

  var clearedAssignmentCount = clearUserAssignmentsInRange_(userId, vacation.startDate, vacation.endDate);
  return {
    success: true,
    statusCode: 200,
    vacation: vacation,
    clearedAssignmentCount: clearedAssignmentCount,
  };
}

function Admin_updateVacation(body) {
  var claims = requireAdmin_(body.token);
  if (!claims.ok) return claims.error;

  var rangeError = validateAdminVacationRange_(body.startDate, body.endDate);
  if (rangeError) return rangeError;

  var sheet = getVacationsSheet_();
  var row = findVacationRow_(sheet, body.vacationId, null);
  if (!row) {
    return { success: false, statusCode: 404, message: "Vacation not found" };
  }

  var vacation = {
    vacationId: String(row.values[0]),
    userId: String(row.values[1]),
    email: String(row.values[2]),
    role: String(row.values[3]),
    startDate: body.startDate,
    endDate: body.endDate,
    createdAt: String(row.values[6] || ""),
  };
  if (vacationRangeOverlaps_(getUserVacations_(vacation.userId), body.startDate, body.endDate, vacation.vacationId)) {
    return { success: false, statusCode: 409, message: "This vacation overlaps an existing vacation" };
  }

  sheet.getRange(row.rowIndex, 5, 1, 2).setValues([[vacation.startDate, vacation.endDate]]);
  var clearedAssignmentCount = clearUserAssignmentsInRange_(vacation.userId, vacation.startDate, vacation.endDate);
  return {
    success: true,
    statusCode: 200,
    vacation: vacation,
    clearedAssignmentCount: clearedAssignmentCount,
  };
}

function Admin_deleteVacation(body) {
  var claims = requireAdmin_(body.token);
  if (!claims.ok) return claims.error;

  var sheet = getVacationsSheet_();
  var row = findVacationRow_(sheet, body.vacationId, null);
  if (!row) {
    return { success: false, statusCode: 404, message: "Vacation not found" };
  }
  sheet.deleteRow(row.rowIndex);
  return { success: true, statusCode: 200 };
}

function validateAdminVacationRange_(startDate, endDate) {
  if (!isRealDateString_(startDate) || !isRealDateString_(endDate) || endDate < startDate) {
    return { success: false, statusCode: 400, message: "Invalid vacation date range" };
  }
  if (isPastDate_(startDate)) {
    return { success: false, statusCode: 400, message: "Vacation must start today or later" };
  }
  if (vacationDayCount_(startDate, endDate) > MAX_VACATION_DAYS) {
    return { success: false, statusCode: 400, message: "Vacation cannot be longer than one year" };
  }
  return null;
}

function vacationRangeOverlaps_(vacations, startDate, endDate, excludedVacationId) {
  return vacations.some(function (vacation) {
    return vacation.vacationId !== excludedVacationId &&
      startDate <= vacation.endDate && endDate >= vacation.startDate;
  });
}

function getUserVacations_(userId) {
  return listAllVacations_().filter(function (vacation) {
    return vacation.userId === userId;
  });
}

function listAllVacations_() {
  var values = getVacationsSheet_().getDataRange().getValues();
  var vacations = [];
  for (var i = 1; i < values.length; i++) {
    if (!values[i][0]) continue;
    vacations.push({
      vacationId: String(values[i][0]),
      userId: String(values[i][1]),
      email: String(values[i][2]),
      role: String(values[i][3]),
      startDate: sheetDateString_(values[i][4]),
      endDate: sheetDateString_(values[i][5]),
      createdAt: String(values[i][6] || ""),
    });
  }
  return vacations.sort(function (a, b) {
    return a.startDate.localeCompare(b.startDate);
  });
}

function isUserOnVacation_(userId, dateStr) {
  return vacationContainsDate_(getUserVacations_(userId), dateStr);
}

function vacationContainsDate_(vacations, dateStr) {
  return vacations.some(function (vacation) {
    return vacation.startDate <= dateStr && vacation.endDate >= dateStr;
  });
}

function findVacationRow_(sheet, vacationId, userId) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (
      String(values[i][0]) === String(vacationId) &&
      (userId === null || String(values[i][1]) === String(userId))
    ) {
      return { rowIndex: i + 1, values: values[i] };
    }
  }
  return null;
}

function getVacationsSheet_() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(VACATIONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(VACATIONS_SHEET_NAME);
    sheet.appendRow([
      "vacation_id",
      "user_id",
      "email",
      "role",
      "start_date",
      "end_date",
      "created_at",
    ]);
  }
  return sheet;
}

function vacationDayCount_(startDate, endDate) {
  return Math.floor((parseDate_(endDate) - parseDate_(startDate)) / 86400000) + 1;
}

function isRealDateString_(dateStr) {
  if (!isValidDateString_(dateStr)) return false;
  return formatDate_(parseDate_(dateStr)) === dateStr;
}
