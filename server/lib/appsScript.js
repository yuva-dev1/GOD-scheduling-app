/**
 * Thin client for calling the Apps Script web app. Every request carries
 * APPS_SCRIPT_TOKEN (as `authToken`) so Apps Script can verify it came from
 * this server (the "WAF" check described in the project brief).
 *
 * `authToken` is a distinct field from any `token` a payload carries (e.g.
 * validateToken's session token) so the two can never collide/overwrite
 * each other.
 */
export async function callAppsScript(action, payload = {}) {
  const url = process.env.APPS_SCRIPT_URL;
  const authToken = process.env.APPS_SCRIPT_TOKEN;

  if (!url || !authToken) {
    const err = new Error(
      "APPS_SCRIPT_URL / APPS_SCRIPT_TOKEN are not configured",
    );
    err.statusCode = 500;
    throw err;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, action, authToken }),
  });

  const body = await res.json().catch(() => ({}));
  return { statusCode: statusCodeFor(res, body), body };
}

// Apps Script web apps cannot set a real HTTP status code, so Scheduling.gs
// puts the intended status in the JSON body instead. Fall back to the
// transport-level status if that field is missing.
function statusCodeFor(res, body) {
  if (typeof body.statusCode === "number") {
    return body.statusCode;
  }
  return res.status;
}
