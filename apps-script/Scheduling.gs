/**
 * Kainkaryam Scheduler — Apps Script web app.
 *
 * Bind this script to the scheduling spreadsheet and deploy it as a Web App
 * (Execute as: Me, Who has access: Anyone with the link). The Cloud Run
 * server (server/index.js) is the only intended caller; it forwards
 * APPS_SCRIPT_TOKEN on every request, which this script must verify.
 *
 * Actions register/login/validateToken are implemented in Users.gs.
 * Actions changeRole/deleteAccount are implemented in Users.gs.
 * Actions listSlots/bookSlot/cancelSlot are implemented in Slots.gs.
 * Action listCoverage is implemented in Coverage.gs.
 * Actions listVacations/createVacation/deleteVacation are implemented in
 * Vacations.gs.
 * Actions adminLogin/adminListUsers/adminListSlots/adminListVacations/
 * adminAssignSlot/adminUnassignSlot/adminCreateVacation/adminUpdateVacation/
 * adminDeleteVacation are implemented in Admin.gs and Vacations.gs. This file only wires the entry points, the shared token
 * check, and the action router.
 *
 * Required Script Properties (Project Settings > Script Properties):
 *   SPREADSHEET_ID        - ID of the scheduling spreadsheet
 *   APPS_SCRIPT_TOKEN      - must match the server's APPS_SCRIPT_TOKEN
 *   TOKEN_SIGNING_SECRET   - used to sign/verify session tokens
 *   TOKEN_TTL_SECONDS      - optional, defaults to 43200 (12 hours)
 *   ADMIN_PASSWORD          - shared password that unlocks /admin (see Admin.gs)
 *   ADMIN_NOTIFICATION_EMAILS - comma-separated admin notification recipients
 *   APP_BASE_URL            - optional public app URL used in HTML emails
 *   REMINDER_HOURS_BEFORE   - optional reminder lead time, defaults to 24
 *
 * Sheet tabs:
 *   Users (see Users.gs)  - created automatically on first register.
 *   Slots (see Slots.gs)   - created automatically on first booking
 */

var ACTION_HANDLERS = {
  register: Users_register,
  login: Users_login,
  requestPasswordReset: Users_requestPasswordReset,
  completePasswordReset: Users_completePasswordReset,
  validateToken: Users_validateToken,
  changeRole: Users_changeRole,
  deleteAccount: Users_deleteAccount,
  listSlots: Slots_list,
  listCoverage: Coverage_list,
  bookSlot: Slots_book,
  notifyBookingSeries: Slots_notifySeries,
  cancelSlot: Slots_cancel,
  listVacations: Vacations_list,
  createVacation: Vacations_create,
  deleteVacation: Vacations_delete,
  adminLogin: Admin_login,
  adminListUsers: Admin_listUsers,
  adminListSlots: Admin_listSlots,
  adminListVacations: Admin_listVacations,
  adminCreateVacation: Admin_createVacation,
  adminUpdateVacation: Admin_updateVacation,
  adminDeleteVacation: Admin_deleteVacation,
  adminAssignSlot: Admin_assignSlot,
  adminNotifyBookingSeries: Admin_notifySeries,
  adminUnassignSlot: Admin_unassignSlot,
};

function doGet(e) {
  return handleRequest_(e);
}

function doPost(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  // Normalize values once at the web-app boundary. Browser clients and older
  // deployed clients have sent date-only ISO values with whitespace and have
  // used AM/PM labels for the two scheduling windows. The internal handlers
  // use the canonical YYYY-MM-DD and morning/evening forms.
  var body = normalizeRequest_(parseBody_(e));

  if (!isAuthorized_(body)) {
    return jsonResponse_({ success: false, message: "Unauthorized" }, 403);
  }

  var handler = ACTION_HANDLERS[body.action];
  if (!handler) {
    return jsonResponse_({ success: false, message: "Unknown action" }, 400);
  }

  return jsonResponse_(handler(body));
}

function isAuthorized_(body) {
  var expected = PropertiesService.getScriptProperties().getProperty(
    "APPS_SCRIPT_TOKEN",
  );
  return Boolean(expected) && body.authToken === expected;
}

function parseBody_(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      return {};
    }
  }
  return (e && e.parameter) || {};
}

function normalizeRequest_(body) {
  var normalized = Object.assign({}, body || {});
  ["date", "startDate", "endDate", "recurrenceEndDate"].forEach(function (field) {
    if (normalized[field] !== undefined) {
      normalized[field] = normalizeDateString_(normalized[field]);
    }
  });
  if (normalized.window !== undefined) {
    normalized.window = normalizeWindow_(normalized.window);
  }
  return normalized;
}

function jsonResponse_(payload, statusCode) {
  // Apps Script web apps cannot set HTTP status codes directly; statusCode is
  // included in the payload so the Cloud Run server can translate it.
  payload = Object.assign({ statusCode: statusCode || 200 }, payload);
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
