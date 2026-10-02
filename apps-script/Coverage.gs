/**
 * Read-only coverage data for signed-in self-serve users.
 *
 * This intentionally shares the same slot index and vacation records as the
 * admin calendar, but never exposes any admin mutation handler.
 */

function Coverage_list(body) {
  var claims = verifyToken_(body.token);
  if (!claims) {
    return { success: false, statusCode: 401, message: "Invalid or expired token" };
  }
  if (SELF_SERVE_ROLES.indexOf(claims.user.role) === -1) {
    return { success: false, statusCode: 403, message: "Coverage access is only available to self-serve roles" };
  }

  var startDate = isValidDateString_(body.startDate) ? body.startDate : todayString_();
  var days = Math.min(Math.max(Number(body.days) || DEFAULT_LIST_DAYS, 1), MAX_LIST_DAYS);
  var endDate = addDays_(startDate, days - 1);
  var existing = indexSlotsByKey_(getSlotsSheet_());
  var allVacations = listAllVacations_();
  var slots = [];

  SELF_SERVE_ROLES.forEach(function (role) {
    for (var i = 0; i < days; i++) {
      var date = addDays_(startDate, i);
      var windows = windowsForRoleOnDate_(role, date);
      if (!windows) continue;

      for (var windowName in windows) {
        var slot = existing[slotKey_(date, windowName, role)];
        var assignments = activeAssignmentsForSlot_(
          slot ? slot.assignments : [],
          date,
          windowName,
          allVacations,
        );
        var assignedEmails = assignments.map(function (assignment) {
          return assignment.email;
        });
        var assignedAssignments = assignments.map(function (assignment) {
          return {
            email: assignment.email,
            recurrenceStartDate: assignment.recurrenceStartDate,
            recurrenceEndDate: assignment.recurrenceEndDate,
          };
        });
        slots.push({
          date: date,
          day: parseDate_(date).getDay(),
          window: windowName,
          role: role,
          start: windows[windowName].start,
          end: windows[windowName].end,
          status: assignments.length > 0 ? "booked" : "open",
          assignedCount: assignments.length,
          assignedEmails: assignedEmails,
          assignedAssignments: assignedAssignments,
        });
      }
    }
  });

  var vacations = allVacations.filter(function (vacation) {
    return vacation.startDate <= endDate && vacation.endDate >= startDate;
  });
  var userValues = getUsersSheet_().getDataRange().getValues();
  var perumalUserCount = userValues.slice(1).filter(function (row) {
    return String(row[4]) === "perumal_kainkaryam";
  }).length;
  return {
    success: true,
    statusCode: 200,
    slots: slots,
    vacations: vacations,
    perumalUserCount: perumalUserCount,
  };
}
