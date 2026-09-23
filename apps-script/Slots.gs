/**
 * Slot listing, self-booking, and self-cancellation, backed by the "Slots"
 * sheet tab. Called from Scheduling.gs's action router — this file defines
 * no doGet/doPost of its own.
 *
 * Only self-serve roles (perumal_kainkaryam, tirtha_kainkaryam) can list or
 * book their own slots here. Multiple people may share the same date/window/
 * role; each assignment is stored as its own row.
 *
 * Open (date, window) slots are *derived* from the scheduling rules below,
 * not pre-seeded — a sheet row only exists once a slot is booked. Multiple
 * booked rows may share a date/window/role when overlaps are allowed. This file
 * mirrors src/config/schedulingRules.ts's constants exactly (Apps Script
 * can't import that module); keep the two in sync if the open hours ever
 * change.
 *
 * Slots sheet columns:
 *   1. slot_id            - UUID, created at first booking
 *   2. date                - YYYY-MM-DD
 *   3. day_of_week         - 0 (Sun) - 6 (Sat)
 *   4. window              - morning | evening
 *   5. role                 - perumal_kainkaryam | tirtha_kainkaryam
 *   6. start_time           - HH:MM
 *   7. end_time             - HH:MM
 *   8. status                - booked | open (row is deleted-equivalent by
 *                              resetting to open on cancel, rather than
 *                              removing the row, to keep slot_id stable)
 *   9. assigned_user_id
 *  10. assigned_email
 *  11. booked_at            - ISO timestamp
 */

var SLOTS_SHEET_NAME = "Slots";
var MAX_LIST_DAYS = 60;
var DEFAULT_LIST_DAYS = 14;

// Monday-Thursday schedule. Friday has its own evening window below.
var WEEKDAY_SCHEDULE_ = {
  morning: { start: "06:00", end: "11:00" },
  evening: { start: "16:00", end: "21:00" },
};
var FRIDAY_SCHEDULE_ = {
  morning: { start: "06:00", end: "11:00" },
  evening: { start: "18:15", end: "20:15" },
};
var WEEKEND_SCHEDULE_ = {
  morning: { start: "08:45", end: "13:15" },
  evening: { start: "17:45", end: "20:15" },
};

function Slots_list(body) {
  var claims = verifyToken_(body.token);
  if (!claims) {
    return { success: false, statusCode: 401, message: "Invalid or expired token" };
  }
  var role = claims.user.role;
  if (SELF_SERVE_ROLES.indexOf(role) === -1) {
    return { success: false, statusCode: 400, message: "Only self-serve roles can list their own slots" };
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
      slots.push({
        date: date,
        day: parseDate_(date).getDay(),
        window: windowName,
        start: windows[windowName].start,
        end: windows[windowName].end,
        status: assignments.length > 0 ? "booked" : "open",
        bookedCount: assignments.length,
        bookedByMe: assignments.some(function (assignment) {
          return assignment.userId === claims.user.userId;
        }),
      });
    }
  }
  return { success: true, statusCode: 200, slots: slots };
}

function Slots_book(body) {
  var claims = verifyToken_(body.token);
  if (!claims) {
    return { success: false, statusCode: 401, message: "Invalid or expired token" };
  }
  var role = claims.user.role;
  if (SELF_SERVE_ROLES.indexOf(role) === -1) {
    return { success: false, statusCode: 400, message: "Admins do not self-book; use slot assignment instead" };
  }
  if (!isValidDateString_(body.date) || ["morning", "evening"].indexOf(body.window) === -1) {
    return { success: false, statusCode: 400, message: "Invalid date or window" };
  }
  if (isPastDate_(body.date)) {
    return { success: false, statusCode: 400, message: "Cannot book a date in the past" };
  }

  var windows = windowsForRoleOnDate_(role, body.date);
  if (!windows) {
    return { success: false, statusCode: 400, message: "This role is not open on that day" };
  }
  var win = windows[body.window];

  var sheet = getSlotsSheet_();
  var userRow = findUserSlotRow_(sheet, body.date, body.window, role, claims.user.userId);
  if (userRow) {
    return { success: false, statusCode: 409, message: "This slot is already booked" };
  }

  var bookedAt = new Date().toISOString();
  var openRow = findOpenSlotRow_(sheet, body.date, body.window, role);
  if (openRow) {
    sheet.getRange(openRow.rowIndex, 8).setValue("booked");
    sheet.getRange(openRow.rowIndex, 9).setValue(claims.user.userId);
    sheet.getRange(openRow.rowIndex, 10).setValue(claims.user.email);
    sheet.getRange(openRow.rowIndex, 11).setValue(bookedAt);
  } else {
    sheet.appendRow([
      Utilities.getUuid(),
      body.date,
      parseDate_(body.date).getDay(),
      body.window,
      role,
      win.start,
      win.end,
      "booked",
      claims.user.userId,
      claims.user.email,
      bookedAt,
    ]);
  }

  return { success: true, statusCode: 200 };
}

function Slots_cancel(body) {
  var claims = verifyToken_(body.token);
  if (!claims) {
    return { success: false, statusCode: 401, message: "Invalid or expired token" };
  }
  if (!isValidDateString_(body.date) || ["morning", "evening"].indexOf(body.window) === -1) {
    return { success: false, statusCode: 400, message: "Invalid date or window" };
  }

  var sheet = getSlotsSheet_();
  var rows = findUserSlotRows_(sheet, body.date, body.window, claims.user.role, claims.user.userId);
  if (rows.length === 0) {
    var anyRow = findSlotRow_(sheet, body.date, body.window, claims.user.role);
    if (anyRow && anyRow.values[7] === "booked") {
      return { success: false, statusCode: 403, message: "You can only cancel your own booking" };
    }
    return { success: false, statusCode: 404, message: "No active booking found" };
  }

  rows.forEach(function (row) {
    clearAssignmentRow_(sheet, row.rowIndex);
  });

  return { success: true, statusCode: 200 };
}

// --- scheduling rules (mirrors src/config/schedulingRules.ts) --------

function windowsForRoleOnDate_(role, dateStr) {
  var day = parseDate_(dateStr).getDay();
  if (role === "tirtha_kainkaryam" && [5, 6, 0].indexOf(day) === -1) {
    return null;
  }
  if (day === 5) return FRIDAY_SCHEDULE_;
  var isWeekend = day === 0 || day === 6;
  return isWeekend ? WEEKEND_SCHEDULE_ : WEEKDAY_SCHEDULE_;
}

// --- date helpers ------------------------------------------------------

function todayString_() {
  return formatDate_(new Date());
}

function addDays_(dateStr, days) {
  var d = parseDate_(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate_(d);
}

function parseDate_(dateStr) {
  var parts = dateStr.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function formatDate_(d) {
  var y = d.getFullYear();
  var m = ("0" + (d.getMonth() + 1)).slice(-2);
  var day = ("0" + d.getDate()).slice(-2);
  return y + "-" + m + "-" + day;
}

function isPastDate_(dateStr) {
  return parseDate_(dateStr) < parseDate_(todayString_());
}

function isValidDateString_(dateStr) {
  return typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

// --- sheet helpers -------------------------------------------------------

function getSlotsSheet_() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(SLOTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SLOTS_SHEET_NAME);
    sheet.appendRow([
      "slot_id",
      "date",
      "day_of_week",
      "window",
      "role",
      "start_time",
      "end_time",
      "status",
      "assigned_user_id",
      "assigned_email",
      "booked_at",
    ]);
  }
  return sheet;
}

function slotKey_(date, window, role) {
  return date + "|" + window + "|" + role;
}

// Google Sheets may return the date column as a JavaScript Date even though
// the API stores and receives date-only values as YYYY-MM-DD strings. Always
// normalize the sheet value before comparing or indexing it so existing
// assignments remain visible and reusable.
function sheetDateString_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  var text = String(value == null ? "" : value).trim();
  var match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : text;
}

function findSlotRow_(sheet, date, window, role) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (sheetDateString_(values[i][1]) === date && values[i][3] === window && values[i][4] === role) {
      return { rowIndex: i + 1, values: values[i] };
    }
  }
  return null;
}

function findOpenSlotRow_(sheet, date, window, role) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (
      sheetDateString_(values[i][1]) === date &&
      values[i][3] === window &&
      values[i][4] === role &&
      values[i][7] !== "booked"
    ) {
      return { rowIndex: i + 1, values: values[i] };
    }
  }
  return null;
}

function findUserSlotRow_(sheet, date, window, role, userId) {
  var rows = findUserSlotRows_(sheet, date, window, role, userId);
  return rows.length > 0 ? rows[0] : null;
}

function findUserSlotRows_(sheet, date, window, role, userId) {
  var values = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    if (
      sheetDateString_(values[i][1]) === date &&
      values[i][3] === window &&
      values[i][4] === role &&
      values[i][7] === "booked" &&
      values[i][8] === userId
    ) {
      rows.push({ rowIndex: i + 1, values: values[i] });
    }
  }
  return rows;
}

function findAssignedEmailRow_(sheet, date, window, role, email) {
  var rows = findAssignedEmailRows_(sheet, date, window, role, email);
  return rows.length > 0 ? rows[0] : null;
}

function findAssignedEmailRows_(sheet, date, window, role, email) {
  var values = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    if (
      sheetDateString_(values[i][1]) === date &&
      values[i][3] === window &&
      values[i][4] === role &&
      values[i][7] === "booked" &&
      normalizeEmail_(values[i][9]) === email
    ) {
      rows.push({ rowIndex: i + 1, values: values[i] });
    }
  }
  return rows;
}

function clearAssignmentRow_(sheet, rowIndex) {
  sheet.getRange(rowIndex, 8).setValue("open");
  sheet.getRange(rowIndex, 9).setValue("");
  sheet.getRange(rowIndex, 10).setValue("");
  sheet.getRange(rowIndex, 11).setValue("");
}

function indexSlotsByKey_(sheet) {
  var values = sheet.getDataRange().getValues();
  var index = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var key = slotKey_(sheetDateString_(row[1]), row[3], row[4]);
    if (!index[key]) index[key] = { assignments: [] };
    if (row[7] === "booked") {
      index[key].assignments.push({ userId: row[8], email: row[9] });
    }
  }
  return index;
}
