/**
 * Kainkaryam Scheduler — Apps Script web app.
 *
 * Bind this script to the scheduling spreadsheet and deploy it as a Web App
 * (Execute as: Me, Who has access: Anyone with the link). The Cloud Run
 * server (server/index.js) is the only intended caller; it forwards
 * APPS_SCRIPT_TOKEN on every request, which this script must verify.
 *
 * Actions register/login/validateToken are implemented in Users.gs.
 * Actions listSlots/bookSlot/cancelSlot are implemented in Slots.gs.
 * Actions adminLogin/adminListUsers/adminListSlots/adminAssignSlot/
 * adminUnassignSlot are implemented in Admin.gs. This file only wires the
 * entry points, the shared token check, and the action router.
 *
 * Required Script Properties (Project Settings > Script Properties):
 *   SPREADSHEET_ID        - ID of the scheduling spreadsheet
 *   APPS_SCRIPT_TOKEN      - must match the server's APPS_SCRIPT_TOKEN
 *   TOKEN_SIGNING_SECRET   - used to sign/verify session tokens
 *   TOKEN_TTL_SECONDS      - optional, defaults to 43200 (12 hours)
 *   ADMIN_PASSWORD          - shared password that unlocks /admin (see Admin.gs)
 *
 * Sheet tabs:
 *   Users (see Users.gs)  - created automatically on first register.
 *   Slots (see Slots.gs)   - created automatically on first booking
 */

var ACTION_HANDLERS = {
  register: Users_register,
  login: Users_login,
  validateToken: Users_validateToken,
  listSlots: Slots_list,
  bookSlot: Slots_book,
  cancelSlot: Slots_cancel,
  adminLogin: Admin_login,
  adminListUsers: Admin_listUsers,
  adminListSlots: Admin_listSlots,
  adminAssignSlot: Admin_assignSlot,
  adminUnassignSlot: Admin_unassignSlot,
};

function doGet(e) {
  return handleRequest_(e);
}

function doPost(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  var body = parseBody_(e);

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

function jsonResponse_(payload, statusCode) {
  // Apps Script web apps cannot set HTTP status codes directly; statusCode is
  // included in the payload so the Cloud Run server can translate it.
  payload = Object.assign({ statusCode: statusCode || 200 }, payload);
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
