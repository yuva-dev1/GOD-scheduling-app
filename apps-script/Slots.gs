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
 *  12. recurrence_end_date  - YYYY-MM-DD when this is part of a weekly series
 *  13. confirmation_sent_at - ISO timestamp for participant confirmation
 *  14. admin_notification_sent_at - ISO timestamp for admin notification
 *  15. reminder_sent_at     - ISO timestamp for upcoming reminder
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
  var userVacations = getUserVacations_(claims.user.userId);
  var slots = [];
  for (var i = 0; i < days; i++) {
    var date = addDays_(startDate, i);
    var windows = windowsForRoleOnDate_(role, date);
    if (!windows) continue;
    for (var windowName in windows) {
      var key = slotKey_(date, windowName, role);
      var slot = existing[key];
      var assignments = slot ? slot.assignments : [];
      var activeAssignments = activeAssignmentsForSlot_(assignments, date, windowName, userVacations);
      var ownAssignment = assignments.find(function (assignment) {
        return assignment.userId === claims.user.userId;
      });
      if (ownAssignment && activeAssignments.indexOf(ownAssignment) === -1) {
        ownAssignment = null;
      }
      var isOnVacation = vacationContainsDate_(userVacations, date, windowName);
      slots.push({
        date: date,
        day: parseDate_(date).getDay(),
        window: windowName,
        start: windows[windowName].start,
        end: windows[windowName].end,
        status: activeAssignments.length > 0 ? "booked" : "open",
        bookedCount: activeAssignments.length,
        bookedByMe: Boolean(ownAssignment),
        isOnVacation: isOnVacation,
        bookable: !isOnVacation,
        unavailableReason: isOnVacation ? "vacation" : null,
        recurrenceStartDate: ownAssignment ? ownAssignment.recurrenceStartDate : null,
        recurrenceEndDate: ownAssignment ? ownAssignment.recurrenceEndDate : null,
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
  if (body.recurrenceEndDate !== undefined &&
      (!isValidDateString_(body.recurrenceEndDate) || body.recurrenceEndDate < body.date)) {
    return { success: false, statusCode: 400, message: "Invalid recurrence end date" };
  }
  if (isPastDate_(body.date)) {
    return { success: false, statusCode: 400, message: "Cannot book a date in the past" };
  }
  if (isUserOnVacation_(claims.user.userId, body.date, body.window)) {
    return { success: false, statusCode: 409, message: "You are on vacation for this date" };
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
    sheet.getRange(openRow.rowIndex, 12).setValue(body.recurrenceEndDate || "");
    sheet.getRange(openRow.rowIndex, 13).setValue("");
    sheet.getRange(openRow.rowIndex, 14).setValue("");
    sheet.getRange(openRow.rowIndex, 15).setValue("");
    if (!body.recurrenceEndDate) {
      sendBookingNotifications_(sheet, openRow.rowIndex, "Self-service booking");
    }
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
      body.recurrenceEndDate || "",
      "",
      "",
      "",
    ]);
    if (!body.recurrenceEndDate) {
      sendBookingNotifications_(sheet, sheet.getLastRow(), "Self-service booking");
    }
  }

  return { success: true, statusCode: 200 };
}

function Slots_notifySeries(body) {
  var claims = verifyToken_(body.token);
  if (!claims) {
    return { success: false, statusCode: 401, message: "Invalid or expired token" };
  }
  if (SELF_SERVE_ROLES.indexOf(claims.user.role) === -1) {
    return { success: false, statusCode: 403, message: "Only self-serve roles can notify their own booking" };
  }
  if (
    !isValidDateString_(body.date) ||
    ["morning", "evening"].indexOf(body.window) === -1 ||
    !isValidDateString_(body.recurrenceEndDate) ||
    body.recurrenceEndDate < body.date
  ) {
    return { success: false, statusCode: 400, message: "Invalid recurring booking request" };
  }

  return sendBookingSeriesNotifications_(getSlotsSheet_(), {
    startDate: body.date,
    endDate: body.recurrenceEndDate,
    window: body.window,
    role: claims.user.role,
    userId: claims.user.userId,
    email: claims.user.email,
  }, "Self-service recurring booking");
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
  if (role === "tirtha_kainkaryam" && day === 5) {
    return { evening: FRIDAY_SCHEDULE_.evening };
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
  var normalized = normalizeDateString_(dateStr);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  return formatDate_(parseDate_(normalized)) === normalized;
}

function normalizeDateString_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return formatDate_(value);
  }
  var text = String(value == null ? "" : value).trim();
  var isoDate = text.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/);
  return isoDate ? isoDate[1] : text;
}

function normalizeWindow_(value) {
  var normalized = String(value == null ? "" : value).trim().toLowerCase();
  if (normalized === "am") return "morning";
  if (normalized === "pm") return "evening";
  return normalized;
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
      "recurrence_end_date",
      "confirmation_sent_at",
      "admin_notification_sent_at",
      "reminder_sent_at",
    ]);
  }
  if (sheet.getRange(1, 12).getValue() !== "recurrence_end_date") {
    sheet.getRange(1, 12).setValue("recurrence_end_date");
  }
  ensureNotificationColumns_(sheet);
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
  sheet.getRange(rowIndex, 12).setValue("");
  sheet.getRange(rowIndex, 13).setValue("");
  sheet.getRange(rowIndex, 14).setValue("");
  sheet.getRange(rowIndex, 15).setValue("");
}

function clearUserAssignmentsInRange_(userId, startDate, endDate, vacationSession) {
  var sheet = getSlotsSheet_();
  var values = sheet.getDataRange().getValues();
  var cleared = 0;
  for (var i = 1; i < values.length; i++) {
    var date = sheetDateString_(values[i][1]);
    if (
      values[i][7] === "booked" &&
      String(values[i][8]) === String(userId) &&
      date >= startDate &&
      date <= endDate &&
      (vacationSession === "full_day" || vacationSession === undefined || values[i][3] === vacationSession)
    ) {
      clearAssignmentRow_(sheet, i + 1);
      cleared++;
    }
  }
  return cleared;
}

// One-time repair for assignments that were written before vacation
// enforcement was deployed. This is intentionally idempotent: rerunning it
// only scans booked rows and clears rows that still overlap a vacation.
function repairVacationOverlappingAssignments() {
  var sheet = getSlotsSheet_();
  var vacations = listAllVacations_();
  var values = sheet.getDataRange().getValues();
  var cleared = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row[7] !== "booked") continue;

    var date = sheetDateString_(row[1]);
    var windowName = String(row[3]);
    var conflict = vacations.find(function (vacation) {
      return String(vacation.userId) === String(row[8]) &&
        vacation.startDate <= date && vacation.endDate >= date &&
        (vacation.session === "full_day" || vacation.session === windowName);
    });
    if (!conflict) continue;

    cleared.push({
      row: i + 1,
      date: date,
      window: windowName,
      email: String(row[9]),
      vacationId: conflict.vacationId,
    });
    clearAssignmentRow_(sheet, i + 1);
  }

  return {
    success: true,
    clearedCount: cleared.length,
    cleared: cleared,
  };
}

// A vacation is a hard availability constraint. The write paths clear
// existing rows when a vacation is created or edited, but reads must also
// defend against older rows, bulk-series rows, and any stale sheet/cache
// state. Only assignments whose owner is available for this exact date and
// session are exposed as active coverage.
function activeAssignmentsForSlot_(assignments, date, windowName, vacations) {
  return assignments.filter(function (assignment) {
    return !vacations.some(function (vacation) {
      return String(vacation.userId) === String(assignment.userId) &&
        vacation.startDate <= date && vacation.endDate >= date &&
        (vacation.session === "full_day" || vacation.session === windowName);
    });
  });
}

function indexSlotsByKey_(sheet) {
  var values = sheet.getDataRange().getValues();
  var index = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var date = sheetDateString_(row[1]);
    var key = slotKey_(date, row[3], row[4]);
    if (!index[key]) index[key] = { assignments: [] };
    if (row[7] === "booked") {
      index[key].assignments.push({
        userId: row[8],
        email: row[9],
        date: date,
        window: row[3],
        role: row[4],
        recurrenceStartDate: null,
        recurrenceEndDate: row[11] ? sheetDateString_(row[11]) : null,
      });
    }
  }
  annotateRecurringAssignments_(index);
  return index;
}

function annotateRecurringAssignments_(index) {
  var groups = {};
  for (var key in index) {
    index[key].assignments.forEach(function (assignment) {
      // A person's assignments on other weekdays must not interrupt a
      // weekly series for this weekday. For example, Friday's recurring
      // assignment should remain a series even when the same person is also
      // assigned on Thursday or Saturday.
      var weekday = parseDate_(assignment.date).getDay();
      var groupKey = assignment.userId + "|" + assignment.window + "|" + assignment.role + "|" + weekday;
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(assignment);
    });
  }

  for (var groupKey in groups) {
    var assignments = groups[groupKey].sort(function (a, b) {
      return a.date.localeCompare(b.date);
    });
    var series = [];
    assignments.forEach(function (assignment) {
      if (series.length === 0 || addDays_(series[series.length - 1].date, 7) === assignment.date) {
        series.push(assignment);
        return;
      }
      applyRecurringSeries_(series);
      series = [assignment];
    });
    applyRecurringSeries_(series);
  }
}

function applyRecurringSeries_(series) {
  if (series.length === 0) return;
  var explicitEndDate = null;
  series.forEach(function (assignment) {
    if (assignment.recurrenceEndDate &&
        (!explicitEndDate || assignment.recurrenceEndDate > explicitEndDate)) {
      explicitEndDate = assignment.recurrenceEndDate;
    }
  });
  if (series.length < 2 && !explicitEndDate) return;

  var startDate = series[0].date;
  var endDate = explicitEndDate || series[series.length - 1].date;
  series.forEach(function (assignment) {
    assignment.recurrenceStartDate = startDate;
    assignment.recurrenceEndDate = endDate;
  });
}
