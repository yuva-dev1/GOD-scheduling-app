/**
 * Booking confirmations, admin notifications, and scheduled reminders.
 *
 * Script Properties:
 *   ADMIN_NOTIFICATION_EMAILS - comma/semicolon/newline-separated admin emails
 *   REMINDER_HOURS_BEFORE      - optional lead time; defaults to 24 hours
 *
 * Run Notifications_installReminderTrigger once after deployment. The trigger
 * runs hourly and sends reminders that are due, so trigger jitter cannot make
 * a booking miss its reminder.
 */

var ADMIN_NOTIFICATION_EMAILS_PROPERTY_ = "ADMIN_NOTIFICATION_EMAILS";
var REMINDER_HOURS_BEFORE_PROPERTY_ = "REMINDER_HOURS_BEFORE";
var REMINDER_TRIGGER_FUNCTION_ = "Notifications_sendDueReminders";
var DEFAULT_REMINDER_HOURS_BEFORE_ = 24;

var SLOT_CONFIRMATION_SENT_COLUMN_ = 13;
var SLOT_ADMIN_NOTIFICATION_SENT_COLUMN_ = 14;
var SLOT_REMINDER_SENT_COLUMN_ = 15;

function ensureNotificationColumns_(sheet) {
  var headers = [
    "confirmation_sent_at",
    "admin_notification_sent_at",
    "reminder_sent_at",
  ];
  headers.forEach(function (header, index) {
    var column = 13 + index;
    if (sheet.getRange(1, column).getValue() !== header) {
      sheet.getRange(1, column).setValue(header);
    }
  });
}

function sendBookingNotifications_(sheet, rowIndex, sourceLabel) {
  ensureNotificationColumns_(sheet);
  var row = sheet.getRange(rowIndex, 1, 1, SLOT_REMINDER_SENT_COLUMN_).getValues()[0];
  var details = bookingDetailsFromRow_(row);
  if (!details.email || !isValidEmail_(details.email)) {
    console.warn("Booking notification skipped: invalid participant email", rowIndex);
    return;
  }

  var source = sourceLabel || "Self-service booking";
  var participantSubject = "Kainkaryam booking confirmed - " + details.date;
  var participantBody = bookingEmailBody_(details, "Your booking is confirmed.", source);
  if (!row[SLOT_CONFIRMATION_SENT_COLUMN_ - 1]) {
    try {
      MailApp.sendEmail(details.email, participantSubject, participantBody);
      sheet.getRange(rowIndex, SLOT_CONFIRMATION_SENT_COLUMN_).setValue(new Date().toISOString());
    } catch (err) {
      console.error("Participant booking confirmation failed", rowIndex, err);
    }
  }

  var adminEmails = notificationAdminEmails_();
  if (adminEmails.length === 0) {
    console.warn("Admin booking notification skipped: ADMIN_NOTIFICATION_EMAILS is empty");
    return;
  }
  if (!row[SLOT_ADMIN_NOTIFICATION_SENT_COLUMN_ - 1]) {
    var adminSubject = "New Kainkaryam booking - " + details.date;
    var adminBody = bookingEmailBody_(
      details,
      "A new booking was recorded.",
      source + ". Notify the participant only if follow-up is needed.",
    );
    try {
      MailApp.sendEmail(adminEmails.join(","), adminSubject, adminBody);
      sheet.getRange(rowIndex, SLOT_ADMIN_NOTIFICATION_SENT_COLUMN_).setValue(new Date().toISOString());
    } catch (err) {
      console.error("Admin booking notification failed", rowIndex, err);
    }
  }
}

function Notifications_sendDueReminders() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var sheet = getSlotsSheet_();
    ensureNotificationColumns_(sheet);
    var values = sheet.getDataRange().getValues();
    var now = new Date();
    var leadMs = reminderHoursBefore_() * 60 * 60 * 1000;

    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (row[7] !== "booked" || row[SLOT_REMINDER_SENT_COLUMN_ - 1]) continue;
      var details = bookingDetailsFromRow_(row);
      if (!details.email || !isValidEmail_(details.email)) continue;

      var eventAt = slotDateTime_(details.date, details.start);
      if (!eventAt || eventAt <= now || eventAt.getTime() - leadMs > now.getTime()) continue;

      var subject = "Reminder: Kainkaryam booking on " + details.date;
      var body = bookingEmailBody_(
        details,
        "This is a reminder for your upcoming booking.",
        "Please arrive in time for the scheduled service.",
      );
      try {
        MailApp.sendEmail(details.email, subject, body);
        sheet.getRange(i + 1, SLOT_REMINDER_SENT_COLUMN_).setValue(new Date().toISOString());
      } catch (err) {
        console.error("Booking reminder failed", i + 1, err);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function Notifications_installReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === REMINDER_TRIGGER_FUNCTION_) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger(REMINDER_TRIGGER_FUNCTION_).timeBased().everyHours(1).create();
  return "Installed hourly booking reminder trigger";
}

function notificationAdminEmails_() {
  var raw = PropertiesService.getScriptProperties().getProperty(
    ADMIN_NOTIFICATION_EMAILS_PROPERTY_,
  );
  if (!raw) return [];
  return raw
    .split(/[;,\n]/)
    .map(function (email) { return normalizeEmail_(email); })
    .filter(function (email, index, all) {
      return isValidEmail_(email) && all.indexOf(email) === index;
    });
}

function reminderHoursBefore_() {
  var raw = Number(PropertiesService.getScriptProperties().getProperty(
    REMINDER_HOURS_BEFORE_PROPERTY_,
  ));
  return isFinite(raw) && raw > 0 ? raw : DEFAULT_REMINDER_HOURS_BEFORE_;
}

function bookingDetailsFromRow_(row) {
  return {
    date: sheetDateString_(row[1]),
    window: String(row[3] || ""),
    role: String(row[4] || ""),
    start: String(row[5] || ""),
    end: String(row[6] || ""),
    email: normalizeEmail_(row[9]),
  };
}

function bookingEmailBody_(details, opening, closing) {
  var roleLabel = details.role === "tirtha_kainkaryam"
    ? "Tirtha Kainkaryam"
    : details.role === "coordinator"
      ? "Coordinator"
      : "Perumal Kainkaryam";
  var windowLabel = details.window === "morning" ? "Morning" : "Evening";
  var dateLabel = formatBookingDate_(details.date);
  return [
    opening,
    "",
    "Date: " + dateLabel,
    "Time: " + windowLabel + " (" + details.start + " - " + details.end + ")",
    "Service: " + roleLabel,
    "Participant: " + details.email,
    "",
    closing,
    "",
    "Kainkaryam Scheduler",
  ].join("\n");
}

function slotDateTime_(dateString, timeString) {
  var dateParts = String(dateString || "").split("-").map(Number);
  var timeParts = String(timeString || "").split(":").map(Number);
  if (dateParts.length !== 3 || timeParts.length < 2 || dateParts.some(isNaN) || timeParts.some(isNaN)) {
    return null;
  }
  return new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], 0);
}

function formatBookingDate_(dateString) {
  var date = slotDateTime_(dateString, "00:00");
  return date
    ? Utilities.formatDate(date, Session.getScriptTimeZone(), "EEEE, MMMM d, yyyy")
    : dateString;
}
