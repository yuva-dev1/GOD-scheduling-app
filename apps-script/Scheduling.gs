/**
 * Kainkaryam Scheduler — Apps Script web app.
 *
 * Bind this script to the scheduling spreadsheet and deploy it as a Web App
 * (Execute as: Me, Who has access: Anyone with the link). The Cloud Run
 * server (server/index.js) is the only intended caller; it forwards
 * APPS_SCRIPT_TOKEN on every request, which this script must verify.
 *
 * Actions (register, login, validateToken, listSlots, bookSlot,
 * assignSlot, ...) are implemented in follow-up PRs. This file only wires
 * the entry points and the shared token check so the deployment exists and
 * can be pointed at from server/index.js.
 *
 * Required Script Properties (Project Settings > Script Properties):
 *   SPREADSHEET_ID        - ID of the scheduling spreadsheet
 *   APPS_SCRIPT_TOKEN      - must match the server's APPS_SCRIPT_TOKEN
 *   TOKEN_SIGNING_SECRET   - used to sign/verify session tokens
 *
 * Expected sheet tabs (created by a follow-up PR):
 *   Users       - user_id, email, password_hash, role, created_at
 *   Slots       - slot_id, date, day_of_week, window (morning|evening),
 *                 start_time, end_time, role, assigned_user_id, status
 */

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

  return jsonResponse_(
    { success: false, message: "Not implemented yet" },
    501,
  );
}

function isAuthorized_(body) {
  var expected = PropertiesService.getScriptProperties().getProperty(
    "APPS_SCRIPT_TOKEN",
  );
  return Boolean(expected) && body.token === expected;
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
