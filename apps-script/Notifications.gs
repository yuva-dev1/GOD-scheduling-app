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
var APP_BASE_URL_PROPERTY_ = "APP_BASE_URL";
var DEFAULT_APP_BASE_URL_ = "https://scheduling.asptemple.org";
var REMINDER_HOURS_BEFORE_PROPERTY_ = "REMINDER_HOURS_BEFORE";
var REMINDER_TRIGGER_FUNCTION_ = "Notifications_sendDueReminders";
var DEFAULT_REMINDER_HOURS_BEFORE_ = 24;
var WEEKLY_DIGEST_TRIGGER_FUNCTION_ = "Notifications_sendWeeklyDigest";
var WEEKLY_DIGEST_HOUR_ = 8;

// This is intentionally a narrow, one-time allowlist. The remaining seed rows
// have unrelated data and must not be removed by this migration.
var SEED_ACCOUNT_MIGRATIONS_ = [
  {
    seedEmail: "aravind.seed@example.com",
    liveEmail: "aravind.thathachari@gmail.com",
  },
  {
    seedEmail: "dwaraka.seed@example.com",
    liveEmail: "dwaraka1@gmail.com",
  },
  {
    seedEmail: "sriram.seed@example.com",
    liveEmail: "sriram115@gmail.com",
  },
  {
    seedEmail: "srinand.seed@example.com",
    liveEmail: "dnanirs@gmail.com",
  },
];

var USER_SIGNUP_CONFIRMATION_SENT_COLUMN_ = 8;

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
  var participantHtml = bookingEmailHtml_(
    details,
    "Booking confirmed",
    "Your booking is confirmed.",
    source,
    { startDate: details.date, endDate: details.date, count: 1 },
    "View Your Schedule",
    appBaseUrl_() + "/schedule",
  );
  if (!row[SLOT_CONFIRMATION_SENT_COLUMN_ - 1]) {
    try {
      MailApp.sendEmail({
        to: details.email,
        subject: participantSubject,
        body: participantBody,
        htmlBody: participantHtml,
        name: "Kainkaryam Scheduler",
      });
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
    var adminHtml = bookingEmailHtml_(
      details,
      "New booking recorded",
      "A new booking was recorded.",
      source + ". Notify the participant only if follow-up is needed.",
      { startDate: details.date, endDate: details.date, count: 1 },
      "Open Admin Dashboard",
      appBaseUrl_() + "/admin",
    );
    try {
      MailApp.sendEmail({
        to: adminEmails.join(","),
        subject: adminSubject,
        body: adminBody,
        htmlBody: adminHtml,
        name: "Kainkaryam Scheduler",
      });
      sheet.getRange(rowIndex, SLOT_ADMIN_NOTIFICATION_SENT_COLUMN_).setValue(new Date().toISOString());
    } catch (err) {
      console.error("Admin booking notification failed", rowIndex, err);
    }
  }
}

function sendBookingSeriesNotifications_(sheet, series, sourceLabel) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureNotificationColumns_(sheet);
    var values = sheet.getDataRange().getValues();
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var date = sheetDateString_(row[1]);
      var matchesUser = series.userId && String(row[8] || "") === String(series.userId);
      var matchesEmail = series.email && normalizeEmail_(row[9]) === normalizeEmail_(series.email);
      if (
        row[7] === "booked" &&
        date >= series.startDate &&
        date <= series.endDate &&
        row[3] === series.window &&
        row[4] === series.role &&
        row[11] && sheetDateString_(row[11]) === series.endDate &&
        (matchesUser || matchesEmail)
      ) {
        rows.push({ rowIndex: i + 1, values: row });
      }
    }
    if (rows.length === 0) {
      return { success: false, statusCode: 404, message: "No booked dates found for this recurring booking" };
    }

    rows.sort(function (a, b) {
      return sheetDateString_(a.values[1]).localeCompare(sheetDateString_(b.values[1]));
    });
    var first = bookingDetailsFromRow_(rows[0].values);
    var summary = {
      startDate: sheetDateString_(rows[0].values[1]),
      endDate: sheetDateString_(rows[rows.length - 1].values[1]),
      count: rows.length,
    };
    var source = sourceLabel || "Self-service booking";
    var participantSent = false;
    var adminSent = false;
    var errors = [];

    if (rows.some(function (item) { return !item.values[SLOT_CONFIRMATION_SENT_COLUMN_ - 1]; })) {
      try {
        MailApp.sendEmail({
          to: first.email,
          subject: "Kainkaryam booking confirmed - weekly through " + summary.endDate,
          body: bookingEmailBody_(first, "Your recurring booking is confirmed.", source, summary),
          htmlBody: bookingEmailHtml_(
            first,
            "Recurring booking confirmed",
            "Your recurring booking is confirmed.",
            source,
            summary,
            "View Your Schedule",
            appBaseUrl_() + "/schedule",
          ),
          name: "Kainkaryam Scheduler",
        });
        rows.forEach(function (item) {
          sheet.getRange(item.rowIndex, SLOT_CONFIRMATION_SENT_COLUMN_).setValue(new Date().toISOString());
        });
        participantSent = true;
      } catch (err) {
        errors.push("participant: " + String(err));
        console.error("Recurring participant confirmation failed", err);
      }
    } else {
      participantSent = true;
    }

    var adminEmails = notificationAdminEmails_();
    if (adminEmails.length === 0) {
      errors.push("ADMIN_NOTIFICATION_EMAILS is empty");
    } else if (rows.some(function (item) { return !item.values[SLOT_ADMIN_NOTIFICATION_SENT_COLUMN_ - 1]; })) {
      try {
        MailApp.sendEmail({
          to: adminEmails.join(","),
          subject: "New Kainkaryam booking - weekly through " + summary.endDate,
          body: bookingEmailBody_(
            first,
            "A recurring booking was recorded.",
            source + ". Notify the participant only if follow-up is needed.",
            summary,
          ),
          htmlBody: bookingEmailHtml_(
            first,
            "Recurring booking recorded",
            "A recurring booking was recorded.",
            source + ". Notify the participant only if follow-up is needed.",
            summary,
            "Open Admin Dashboard",
            appBaseUrl_() + "/admin",
          ),
          name: "Kainkaryam Scheduler",
        });
        rows.forEach(function (item) {
          sheet.getRange(item.rowIndex, SLOT_ADMIN_NOTIFICATION_SENT_COLUMN_).setValue(new Date().toISOString());
        });
        adminSent = true;
      } catch (err) {
        errors.push("admin: " + String(err));
        console.error("Recurring admin notification failed", err);
      }
    } else {
      adminSent = true;
    }

    return {
      success: errors.length === 0,
      statusCode: errors.length === 0 ? 200 : 502,
      count: rows.length,
      participantSent: participantSent,
      adminSent: adminSent,
      message: errors.length === 0 ? "Recurring booking notifications sent" : errors.join("; "),
    };
  } finally {
    lock.releaseLock();
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
      var htmlBody = bookingEmailHtml_(
        details,
        "Booking reminder",
        "This is a reminder for your upcoming booking.",
        "Please arrive in time for the scheduled service.",
        { startDate: details.date, endDate: details.date, count: 1 },
        "View Your Schedule",
        appBaseUrl_() + "/schedule",
      );
      try {
        MailApp.sendEmail({
          to: details.email,
          subject: subject,
          body: body,
          htmlBody: htmlBody,
          name: "Kainkaryam Scheduler",
        });
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

function Notifications_installWeeklyDigestTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === WEEKLY_DIGEST_TRIGGER_FUNCTION_) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger(WEEKLY_DIGEST_TRIGGER_FUNCTION_)
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(WEEKLY_DIGEST_HOUR_)
    .create();
  return "Installed Sunday 8 AM weekly digest trigger";
}

function Notifications_sendWeeklyDigest() {
  var startDate = todayString_();
  var endDate = addDays_(startDate, 6);
  var users = getUsersSheet_().getDataRange().getValues().slice(1).map(function (row) {
    return {
      email: normalizeEmail_(row[1]),
      role: String(row[4] || ""),
    };
  }).filter(function (user, index, all) {
    return SELF_SERVE_ROLES.indexOf(user.role) !== -1 &&
      isValidEmail_(user.email) &&
      all.findIndex(function (candidate) { return candidate.email === user.email; }) === index;
  });
  var slotValues = getSlotsSheet_().getDataRange().getValues();
  var vacations = listAllVacations_().filter(function (vacation) {
    return vacation.startDate <= endDate && vacation.endDate >= startDate;
  });
  var perumalUsers = users.filter(function (user) { return user.role === "perumal_kainkaryam"; });
  var report = { sent: 0, failed: 0, recipients: [], startDate: startDate, endDate: endDate };

  users.forEach(function (user) {
    var assignments = [];
    slotValues.slice(1).forEach(function (row) {
      var date = sheetDateString_(row[1]);
      if (row[7] !== "booked" || date < startDate || date > endDate) return;
      if (normalizeEmail_(row[9]) !== user.email) return;
      assignments.push({
        date: date,
        window: String(row[3] || ""),
        role: String(row[4] || ""),
        start: String(row[5] || ""),
        end: String(row[6] || ""),
      });
    });
    assignments.sort(function (a, b) {
      return a.date.localeCompare(b.date) || a.window.localeCompare(b.window);
    });
    var userVacations = vacations.filter(function (vacation) {
      return vacation.email === user.email;
    });
    var riskRows = [];
    for (var i = 0; i < 7; i++) {
      var date = addDays_(startDate, i);
      var awayEmails = {};
      vacations.forEach(function (vacation) {
        if (vacation.role === "perumal_kainkaryam" && vacation.startDate <= date && vacation.endDate >= date) {
          awayEmails[vacation.email] = true;
        }
      });
      var available = Math.max(0, perumalUsers.length - Object.keys(awayEmails).length);
      var status = available <= 1 ? "R" : available === 2 ? "Y" : "G";
      riskRows.push({ date: date, available: available, total: perumalUsers.length, status: status });
    }

    var subject = "Kainkaryam weekly digest - " + formatBookingDate_(startDate);
    var body = weeklyDigestText_(user, assignments, userVacations, riskRows, startDate, endDate);
    var htmlBody = weeklyDigestHtml_(user, assignments, userVacations, riskRows, startDate, endDate);
    try {
      MailApp.sendEmail({
        to: user.email,
        subject: subject,
        body: body,
        htmlBody: htmlBody,
        name: "Kainkaryam Scheduler",
      });
      report.sent++;
      report.recipients.push(user.email);
    } catch (err) {
      report.failed++;
      console.error("Weekly digest failed for " + user.email, err);
    }
  });
  return report;
}

function weeklyDigestText_(user, assignments, vacations, riskRows, startDate, endDate) {
  var lines = [
    "Upcoming week: " + formatBookingDate_(startDate) + " through " + formatBookingDate_(endDate),
    "Role: " + roleLabel_(user.role),
    "",
    "Your assignments:",
  ];
  if (assignments.length === 0) lines.push("None recorded.");
  assignments.forEach(function (assignment) {
    lines.push(formatBookingDate_(assignment.date) + " - " +
      (assignment.window === "morning" ? "AM" : "PM") + " " + roleLabel_(assignment.role) +
      " (" + assignment.start + "-" + assignment.end + ")");
  });
  lines.push("", "Your OUT days:");
  if (vacations.length === 0) lines.push("None recorded.");
  vacations.forEach(function (vacation) {
    lines.push(formatBookingDate_(vacation.startDate) + " through " + formatBookingDate_(vacation.endDate) +
      " - " + vacationSessionLabel_(vacation.session) + (vacation.note ? " - " + vacation.note : ""));
  });
  lines.push("", "Perumal risk report:");
  riskRows.forEach(function (row) {
    lines.push(formatBookingDate_(row.date) + " - " + row.status + " - " + row.available + "/" + row.total + " available");
  });
  lines.push("", "View the schedule: " + appBaseUrl_() + "/schedule", "", "Kainkaryam Scheduler");
  return lines.join("\n");
}

function weeklyDigestHtml_(user, assignments, vacations, riskRows, startDate, endDate) {
  var assignmentRows = assignments.map(function (assignment) {
    return "<tr><td style=\"padding:7px;border-bottom:1px solid #eadfd2\">" + escapeHtml_(formatBookingDate_(assignment.date)) +
      "</td><td style=\"padding:7px;border-bottom:1px solid #eadfd2\">" + escapeHtml_(assignment.window === "morning" ? "AM" : "PM") +
      "</td><td style=\"padding:7px;border-bottom:1px solid #eadfd2\">" + escapeHtml_(roleLabel_(assignment.role)) +
      " (" + escapeHtml_(assignment.start + "-" + assignment.end) + ")</td></tr>";
  }).join("");
  var outRows = vacations.map(function (vacation) {
    return "<li style=\"margin:0 0 6px\">" + escapeHtml_(formatBookingDate_(vacation.startDate) + " through " + formatBookingDate_(vacation.endDate) +
      " - " + vacationSessionLabel_(vacation.session) + (vacation.note ? " - " + vacation.note : "")) + "</li>";
  }).join("");
  var riskRowsHtml = riskRows.map(function (row) {
    return "<tr><td style=\"padding:7px;border-bottom:1px solid #eadfd2\">" + escapeHtml_(formatBookingDate_(row.date)) +
      "</td><td style=\"padding:7px;border-bottom:1px solid #eadfd2;font-weight:700\">" + row.status +
      "</td><td style=\"padding:7px;border-bottom:1px solid #eadfd2\">" + row.available + "/" + row.total + " available</td></tr>";
  }).join("");
  var content = "<p style=\"margin:0 0 8px;color:#625548;font-size:14px\"><strong>Role:</strong> " + escapeHtml_(roleLabel_(user.role)) + "</p>" +
    "<p style=\"margin:16px 0 8px;color:#49392d;font-weight:700\">Your assignments</p>" +
    "<table role=\"presentation\" style=\"width:100%;border-collapse:collapse;color:#625548;font-size:13px\"><tr><th align=\"left\" style=\"padding:7px;background:#f4eadf\">Date</th><th align=\"left\" style=\"padding:7px;background:#f4eadf\">Session</th><th align=\"left\" style=\"padding:7px;background:#f4eadf\">Service</th></tr>" +
    (assignmentRows || "<tr><td colspan=\"3\" style=\"padding:7px\">None recorded.</td></tr>") + "</table>" +
    "<p style=\"margin:16px 0 8px;color:#49392d;font-weight:700\">Your OUT days</p>" +
    (outRows ? "<ul style=\"padding-left:20px;color:#625548;font-size:13px\">" + outRows + "</ul>" : "<p style=\"color:#625548;font-size:13px\">None recorded.</p>") +
    "<p style=\"margin:16px 0 8px;color:#49392d;font-weight:700\">Perumal risk report</p>" +
    "<table role=\"presentation\" style=\"width:100%;border-collapse:collapse;color:#625548;font-size:13px\"><tr><th align=\"left\" style=\"padding:7px;background:#f4eadf\">Date</th><th align=\"left\" style=\"padding:7px;background:#f4eadf\">R/Y/G</th><th align=\"left\" style=\"padding:7px;background:#f4eadf\">Coverage</th></tr>" +
    riskRowsHtml + "</table>";
  return emailShellHtml_(
    "Weekly schedule digest",
    "Upcoming week: " + formatBookingDate_(startDate) + " through " + formatBookingDate_(endDate),
    content,
    "View Your Schedule",
    appBaseUrl_() + "/schedule",
  );
}

function vacationSessionLabel_(session) {
  if (session === "morning") return "AM only";
  if (session === "evening") return "PM only";
  return "All day";
}

/**
 * One-time operational migration. Run this from the Apps Script editor only
 * after reviewing the returned preflight report. It migrates the four explicit
 * seed accounts, removes only those seed Users rows, emails every remaining
 * non-seed valid user, and sends one HTML summary to the configured admins.
 */
function Notifications_migrateSeedAccountsAndNotify() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var usersSheet = getUsersSheet_();
    var slotsSheet = getSlotsSheet_();
    var vacationsSheet = getVacationsSheet_();
    var userValues = usersSheet.getDataRange().getValues();
    var usersByEmail = {};
    for (var i = 1; i < userValues.length; i++) {
      var user = {
        rowIndex: i + 1,
        userId: String(userValues[i][0] || ""),
        email: normalizeEmail_(userValues[i][1]),
        role: String(userValues[i][4] || ""),
      };
      if (user.email) usersByEmail[user.email] = user;
    }

    var migrations = [];
    SEED_ACCOUNT_MIGRATIONS_.forEach(function (mapping) {
      var seed = usersByEmail[normalizeEmail_(mapping.seedEmail)];
      var live = usersByEmail[normalizeEmail_(mapping.liveEmail)];
      if (!seed || !live) {
        throw new Error("Migration account missing: " + mapping.seedEmail + " -> " + mapping.liveEmail);
      }
      if (seed.userId === live.userId) {
        throw new Error("Migration source and destination are identical: " + mapping.liveEmail);
      }
      if (seed.role !== live.role) {
        throw new Error("Role mismatch for " + mapping.liveEmail + ": " + seed.role + " vs " + live.role);
      }
      migrations.push({ seed: seed, live: live });
    });

    var slotValues = slotsSheet.getDataRange().getValues();
    var vacationValues = vacationsSheet.getDataRange().getValues();
    migrations.forEach(function (migration) {
      var destinationSlotCount = countRowsForUser_(slotValues, 8, 9, migration.live.userId, migration.live.email);
      var sourceSlotCount = countRowsForUser_(slotValues, 8, 9, migration.seed.userId, migration.seed.email);
      var destinationVacationCount = countRowsForUser_(vacationValues, 1, 2, migration.live.userId, migration.live.email);
      var sourceVacationCount = countRowsForUser_(vacationValues, 1, 2, migration.seed.userId, migration.seed.email);
      if (destinationSlotCount > 0 || destinationVacationCount > 0) {
        throw new Error("Destination already has data for " + migration.live.email);
      }
      migration.sourceSlotCount = sourceSlotCount;
      migration.sourceVacationCount = sourceVacationCount;
    });

    var migratedSlotRows = 0;
    for (var slotRow = 1; slotRow < slotValues.length; slotRow++) {
      var slotUserId = String(slotValues[slotRow][8] || "");
      var slotEmail = normalizeEmail_(slotValues[slotRow][9]);
      var slotMigration = migrations.find(function (migration) {
        return slotUserId === migration.seed.userId || slotEmail === migration.seed.email;
      });
      if (!slotMigration) continue;
      slotsSheet.getRange(slotRow + 1, 9, 1, 2).setValues([[
        slotMigration.live.userId,
        slotMigration.live.email,
      ]]);
      migratedSlotRows++;
    }

    var migratedVacationRows = 0;
    for (var vacationRow = 1; vacationRow < vacationValues.length; vacationRow++) {
      var vacationUserId = String(vacationValues[vacationRow][1] || "");
      var vacationEmail = normalizeEmail_(vacationValues[vacationRow][2]);
      var vacationMigration = migrations.find(function (migration) {
        return vacationUserId === migration.seed.userId || vacationEmail === migration.seed.email;
      });
      if (!vacationMigration) continue;
      vacationsSheet.getRange(vacationRow + 1, 2, 1, 2).setValues([[
        vacationMigration.live.userId,
        vacationMigration.live.email,
      ]]);
      migratedVacationRows++;
    }

    migrations
      .map(function (migration) { return migration.seed.rowIndex; })
      .sort(function (a, b) { return b - a; })
      .forEach(function (rowIndex) { usersSheet.deleteRow(rowIndex); });

    var signupReport = Notifications_sendSignupConfirmations_();
    var adminReport = Notifications_sendMigrationAdminSummary_(migrations, {
      migratedSlotRows: migratedSlotRows,
      migratedVacationRows: migratedVacationRows,
      deletedSeedUsers: migrations.length,
      signupReport: signupReport,
    });

    return {
      success: true,
      migratedUsers: migrations.map(function (migration) {
        return {
          from: migration.seed.email,
          to: migration.live.email,
          slotRows: migration.sourceSlotCount,
          vacationRows: migration.sourceVacationCount,
        };
      }),
      migratedSlotRows: migratedSlotRows,
      migratedVacationRows: migratedVacationRows,
      deletedSeedUsers: migrations.length,
      signupReport: signupReport,
      adminReport: adminReport,
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * One-time migration for the remaining Krishna seed account. This is kept
 * separate from the original batch migration so it does not re-run the
 * already-completed seed allowlist or resend signup confirmations.
 */
function Notifications_migrateKrishnaSeedAccount() {
  var seedEmail = "krishna.seed@example.com";
  var liveEmail = "krishna_chak@yahoo.com";
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var usersSheet = getUsersSheet_();
    var slotsSheet = getSlotsSheet_();
    var vacationsSheet = getVacationsSheet_();
    var userValues = usersSheet.getDataRange().getValues();
    var usersByEmail = {};
    for (var i = 1; i < userValues.length; i++) {
      var user = {
        rowIndex: i + 1,
        userId: String(userValues[i][0] || ""),
        email: normalizeEmail_(userValues[i][1]),
        role: String(userValues[i][4] || ""),
      };
      if (user.email) usersByEmail[user.email] = user;
    }

    var seed = usersByEmail[normalizeEmail_(seedEmail)];
    var live = usersByEmail[normalizeEmail_(liveEmail)];
    if (!seed || !live) throw new Error("Migration account missing: " + seedEmail + " -> " + liveEmail);
    if (seed.userId === live.userId) throw new Error("Migration source and destination are identical: " + liveEmail);
    if (seed.role !== live.role) throw new Error("Role mismatch for " + liveEmail + ": " + seed.role + " vs " + live.role);

    var slotValues = slotsSheet.getDataRange().getValues();
    var vacationValues = vacationsSheet.getDataRange().getValues();
    var destinationSlotCount = countRowsForUser_(slotValues, 8, 9, live.userId, live.email);
    var destinationVacationCount = countRowsForUser_(vacationValues, 1, 2, live.userId, live.email);
    if (destinationSlotCount > 0 || destinationVacationCount > 0) {
      throw new Error("Destination already has data for " + live.email);
    }

    var migratedSlotRows = 0;
    for (var slotRow = 1; slotRow < slotValues.length; slotRow++) {
      var slotUserId = String(slotValues[slotRow][8] || "");
      var slotEmail = normalizeEmail_(slotValues[slotRow][9]);
      if (slotUserId !== seed.userId && slotEmail !== seed.email) continue;
      slotsSheet.getRange(slotRow + 1, 9, 1, 2).setValues([[live.userId, live.email]]);
      migratedSlotRows++;
    }

    var migratedVacationRows = 0;
    for (var vacationRow = 1; vacationRow < vacationValues.length; vacationRow++) {
      var vacationUserId = String(vacationValues[vacationRow][1] || "");
      var vacationEmail = normalizeEmail_(vacationValues[vacationRow][2]);
      if (vacationUserId !== seed.userId && vacationEmail !== seed.email) continue;
      vacationsSheet.getRange(vacationRow + 1, 2, 1, 2).setValues([[live.userId, live.email]]);
      migratedVacationRows++;
    }

    usersSheet.deleteRow(seed.rowIndex);
    var adminReport = Notifications_sendMigrationAdminSummary_([{
      seed: seed,
      live: live,
      sourceSlotCount: migratedSlotRows,
      sourceVacationCount: migratedVacationRows,
    }], {
      migratedSlotRows: migratedSlotRows,
      migratedVacationRows: migratedVacationRows,
      deletedSeedUsers: 1,
      signupReport: { sent: 0, skipped: 0, failed: 0 },
    });
    return {
      success: true,
      from: seed.email,
      to: live.email,
      role: live.role,
      migratedSlotRows: migratedSlotRows,
      migratedVacationRows: migratedVacationRows,
      deletedSeedUser: true,
      adminReport: adminReport,
    };
  } finally {
    lock.releaseLock();
  }
}

/** Send the KC migration summary after a migration that completed before its
 * original admin-summary helper was available in the live project. */
function Notifications_sendKrishnaMigrationAdminEmail() {
  var liveEmail = "krishna_chak@yahoo.com";
  var users = getUsersSheet_().getDataRange().getValues();
  var live = null;
  for (var i = 1; i < users.length; i++) {
    if (normalizeEmail_(users[i][1]) === liveEmail) {
      live = { userId: String(users[i][0] || ""), email: liveEmail, role: String(users[i][4] || "") };
      break;
    }
  }
  if (!live) throw new Error("Live KC account not found: " + liveEmail);

  var slotValues = getSlotsSheet_().getDataRange().getValues();
  var vacationValues = getVacationsSheet_().getDataRange().getValues();
  var migratedSlotRows = countRowsForUser_(slotValues, 8, 9, live.userId, live.email);
  var migratedVacationRows = countRowsForUser_(vacationValues, 1, 2, live.userId, live.email);
  return Notifications_sendMigrationAdminSummary_([{
    seed: { email: "krishna.seed@example.com", role: live.role },
    live: live,
    sourceSlotCount: migratedSlotRows,
    sourceVacationCount: migratedVacationRows,
  }], {
    migratedSlotRows: migratedSlotRows,
    migratedVacationRows: migratedVacationRows,
    deletedSeedUsers: 1,
    signupReport: { sent: 0, skipped: 0, failed: 0 },
  });
}

function Notifications_sendSignupConfirmations_() {
  var sheet = getUsersSheet_();
  var values = sheet.getDataRange().getValues();
  var sent = 0;
  var skipped = 0;
  var failed = 0;
  for (var i = 1; i < values.length; i++) {
    var email = normalizeEmail_(values[i][1]);
    if (!isValidEmail_(email) || isSeedEmail_(email)) {
      skipped++;
      continue;
    }
    if (values[i][USER_SIGNUP_CONFIRMATION_SENT_COLUMN_ - 1]) {
      skipped++;
      continue;
    }
    if (sendSignupConfirmation_(sheet, i + 1, "Existing account signup")) {
      sent++;
    } else {
      failed++;
    }
  }
  return { sent: sent, skipped: skipped, failed: failed };
}

function sendSignupConfirmation_(sheet, rowIndex, sourceLabel) {
  ensureUserNotificationColumn_(sheet);
  var row = sheet.getRange(rowIndex, 1, 1, USER_SIGNUP_CONFIRMATION_SENT_COLUMN_).getValues()[0];
  var email = normalizeEmail_(row[1]);
  var role = String(row[4] || "");
  if (!isValidEmail_(email) || isSeedEmail_(email) || row[USER_SIGNUP_CONFIRMATION_SENT_COLUMN_ - 1]) {
    return false;
  }

  var subject = "Welcome to Kainkaryam Scheduler";
  var body = signupEmailText_(email, role, sourceLabel);
  var htmlBody = signupEmailHtml_(email, role, sourceLabel);
  try {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body,
      htmlBody: htmlBody,
      name: "Kainkaryam Scheduler",
    });
    sheet.getRange(rowIndex, USER_SIGNUP_CONFIRMATION_SENT_COLUMN_).setValue(new Date().toISOString());
    return true;
  } catch (err) {
    console.error("Signup confirmation failed for " + email, err);
    return false;
  }
}

function sendPasswordResetEmail_(email, token) {
  var resetUrl = appBaseUrl_() + "/reset-password?token=" + encodeURIComponent(token);
  var subject = "Reset your Kainkaryam Scheduler password";
  var body = "A password reset was requested for this account. Use this link within one hour to choose a new password:\n\n" + resetUrl + "\n\nIf you did not request this, you can ignore this email.";
  var content = "<p style=\"margin:0;color:#625548;font-size:14px;line-height:1.55\">This link expires in one hour and can only be used once. If you did not request a password reset, you can ignore this email.</p>";
  try {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body,
      htmlBody: emailShellHtml_("Reset your password", "We received a request to reset your Kainkaryam Scheduler password.", content, "Choose a new password", resetUrl),
      name: "Kainkaryam Scheduler",
    });
    return true;
  } catch (err) {
    console.error("Password reset email failed", err);
    return false;
  }
}

function Notifications_sendMigrationAdminSummary_(migrations, report) {
  var adminEmails = notificationAdminEmails_();
  if (adminEmails.length === 0) {
    console.warn("Migration admin summary skipped: ADMIN_NOTIFICATION_EMAILS is empty");
    return { sent: false, reason: "ADMIN_NOTIFICATION_EMAILS is empty" };
  }

  var userValues = getUsersSheet_().getDataRange().getValues();
  var liveUsers = 0;
  var seedUsers = 0;
  for (var i = 1; i < userValues.length; i++) {
    var email = normalizeEmail_(userValues[i][1]);
    if (!isValidEmail_(email)) continue;
    if (isSeedEmail_(email)) seedUsers++;
    else liveUsers++;
  }

  var subject = "Kainkaryam Scheduler: account migration complete";
  var body = migrationAdminText_(migrations, report, liveUsers, seedUsers);
  var htmlBody = migrationAdminHtml_(migrations, report, liveUsers, seedUsers);
  try {
    MailApp.sendEmail({
      to: adminEmails.join(","),
      subject: subject,
      body: body,
      htmlBody: htmlBody,
      name: "Kainkaryam Scheduler",
    });
    return { sent: true, recipients: adminEmails, liveUsers: liveUsers, seedUsers: seedUsers };
  } catch (err) {
    console.error("Migration admin summary failed", err);
    return { sent: false, recipients: adminEmails, error: String(err) };
  }
}

function countRowsForUser_(values, userIdIndex, emailIndex, userId, email) {
  var count = 0;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][userIdIndex] || "") === userId || normalizeEmail_(values[i][emailIndex]) === email) {
      count++;
    }
  }
  return count;
}

function isSeedEmail_(email) {
  return /\.seed@example\.com$/i.test(normalizeEmail_(email));
}

function appBaseUrl_() {
  var configured = PropertiesService.getScriptProperties().getProperty(APP_BASE_URL_PROPERTY_);
  return String(configured || DEFAULT_APP_BASE_URL_).replace(/\/$/, "");
}

function signupEmailText_(email, role, sourceLabel) {
  return [
    "Thank you for signing up for Kainkaryam Scheduler.",
    "",
    "Account: " + email,
    "Role: " + roleLabel_(role),
    "Source: " + sourceLabel,
    "",
    "View your time slots: " + appBaseUrl_() + "/schedule",
    "",
    "Kainkaryam Scheduler",
  ].join("\n");
}

function signupEmailHtml_(email, role, sourceLabel) {
  return emailShellHtml_(
    "Welcome to Kainkaryam Scheduler",
    "Thank you for signing up. Your account is ready to use.",
    "<p style=\"margin:0 0 8px;color:#625548;font-size:14px\"><strong>Account:</strong> " + escapeHtml_(email) + "</p>" +
      "<p style=\"margin:0 0 8px;color:#625548;font-size:14px\"><strong>Role:</strong> " + escapeHtml_(roleLabel_(role)) + "</p>" +
      "<p style=\"margin:0;color:#8b7765;font-size:12px\">" + escapeHtml_(sourceLabel) + "</p>",
    "View Your Time Slots",
    appBaseUrl_() + "/schedule",
  );
}

function migrationAdminText_(migrations, report, liveUsers, seedUsers) {
  return [
    "Account migration completed.",
    "",
    "Live users: " + liveUsers,
    "Remaining seed users: " + seedUsers,
    "Migrated users: " + migrations.length,
    "Migrated slot rows: " + report.migratedSlotRows,
    "Migrated vacation rows: " + report.migratedVacationRows,
    "Signup confirmations sent: " + report.signupReport.sent,
    "Signup confirmations failed: " + report.signupReport.failed,
    "",
    "Admin page: " + appBaseUrl_() + "/admin",
  ].join("\n");
}

function migrationAdminHtml_(migrations, report, liveUsers, seedUsers) {
  var rows = migrations.map(function (migration) {
    return "<tr><td style=\"padding:8px;border-bottom:1px solid #eadfd2\">" + escapeHtml_(migration.seed.email) +
      "</td><td style=\"padding:8px;border-bottom:1px solid #eadfd2\">" + escapeHtml_(migration.live.email) +
      "</td></tr>";
  }).join("");
  var details = "<table role=\"presentation\" style=\"width:100%;border-collapse:collapse;margin:18px 0;color:#49392d;font-size:13px\">" +
    "<tr><th align=\"left\" style=\"padding:8px;background:#f4eadf\">Seed account</th><th align=\"left\" style=\"padding:8px;background:#f4eadf\">Live account</th></tr>" +
    rows + "</table>" +
    "<p style=\"margin:8px 0;color:#625548;font-size:14px\"><strong>Live users:</strong> " + liveUsers +
    " &nbsp; <strong>Remaining seeds:</strong> " + seedUsers + "</p>" +
    "<p style=\"margin:8px 0;color:#625548;font-size:14px\"><strong>Slot rows migrated:</strong> " + report.migratedSlotRows +
    " &nbsp; <strong>Vacation rows migrated:</strong> " + report.migratedVacationRows + "</p>" +
    "<p style=\"margin:8px 0;color:#625548;font-size:14px\"><strong>Signup confirmations sent:</strong> " + report.signupReport.sent +
    " &nbsp; <strong>Failed:</strong> " + report.signupReport.failed + "</p>";
  return emailShellHtml_(
    "Account migration complete",
    "The requested live-account migration finished successfully.",
    details,
    "Open Admin Dashboard",
    appBaseUrl_() + "/admin",
  );
}

function emailShellHtml_(title, intro, content, buttonLabel, buttonUrl) {
  return "<!doctype html><html><body style=\"margin:0;background:#f7f1e8;font-family:Arial,sans-serif;color:#49392d\"><div style=\"max-width:620px;margin:0 auto;padding:28px 16px\"><div style=\"background:#fffdf9;border:1px solid #eadfd2;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(73,57,45,.08)\"><div style=\"padding:24px 28px;background:#345b4c;color:#fffdf9\"><div style=\"font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.8\">Kainkaryam Scheduler</div><h1 style=\"margin:10px 0 0;font-size:28px;line-height:1.15\">" + escapeHtml_(title) + "</h1></div><div style=\"padding:26px 28px\"><p style=\"margin:0 0 18px;font-size:16px;line-height:1.55;color:#625548\">" + escapeHtml_(intro) + "</p>" + content + "<div style=\"margin-top:24px\"><a href=\"" + escapeHtml_(buttonUrl) + "\" style=\"display:inline-block;padding:13px 20px;border-radius:8px;background:#b86f35;color:#fff;text-decoration:none;font-weight:700\">" + escapeHtml_(buttonLabel) + "</a></div></div><div style=\"padding:16px 28px;background:#f4eadf;color:#8b7765;font-size:12px\">This is an automated message from Kainkaryam Scheduler.</div></div></div></body></html>";
}

function roleLabel_(role) {
  if (role === "tirtha_kainkaryam") return "Tirtha Kainkaryam";
  if (role === "coordinator") return "Coordinator";
  return "Perumal Kainkaryam";
}

function escapeHtml_(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function bookingEmailBody_(details, opening, closing, summary) {
  var roleLabel = roleLabel_(details.role);
  var windowLabel = details.window === "morning" ? "Morning" : "Evening";
  var dateLabel = formatBookingDate_(details.date);
  return [
    opening,
    "",
    summary && summary.count > 1
      ? "Booking period: " + formatBookingDate_(summary.startDate) + " through " + formatBookingDate_(summary.endDate)
      : "Date: " + dateLabel,
    summary && summary.count > 1 ? "Weekly occurrences: " + summary.count : null,
    "Time: " + windowLabel + " (" + details.start + " - " + details.end + ")",
    "Service: " + roleLabel,
    "Participant: " + details.email,
    "",
    closing,
    "",
    "Kainkaryam Scheduler",
  ].filter(function (line) { return line !== null; }).join("\n");
}

function bookingEmailHtml_(details, title, intro, closing, summary, buttonLabel, buttonUrl) {
  var windowLabel = details.window === "morning" ? "Morning" : "Evening";
  var period = summary && summary.count > 1
    ? "<p style=\"margin:0 0 8px;color:#625548;font-size:14px\"><strong>Booking period:</strong> " + escapeHtml_(formatBookingDate_(summary.startDate)) + " through " + escapeHtml_(formatBookingDate_(summary.endDate)) + "</p>" +
      "<p style=\"margin:0 0 8px;color:#625548;font-size:14px\"><strong>Weekly occurrences:</strong> " + escapeHtml_(summary.count) + "</p>"
    : "<p style=\"margin:0 0 8px;color:#625548;font-size:14px\"><strong>Date:</strong> " + escapeHtml_(formatBookingDate_(details.date)) + "</p>";
  var content = period +
    "<p style=\"margin:0 0 8px;color:#625548;font-size:14px\"><strong>Time:</strong> " + escapeHtml_(windowLabel) + " (" + escapeHtml_(details.start) + " - " + escapeHtml_(details.end) + ")</p>" +
    "<p style=\"margin:0 0 8px;color:#625548;font-size:14px\"><strong>Service:</strong> " + escapeHtml_(roleLabel_(details.role)) + "</p>" +
    "<p style=\"margin:0 0 8px;color:#625548;font-size:14px\"><strong>Participant:</strong> " + escapeHtml_(details.email) + "</p>" +
    "<p style=\"margin:16px 0 0;color:#8b7765;font-size:12px\">" + escapeHtml_(closing) + "</p>";
  return emailShellHtml_(title, intro, content, buttonLabel, buttonUrl);
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
