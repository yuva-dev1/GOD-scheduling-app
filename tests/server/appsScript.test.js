import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callAppsScript } from "../../server/lib/appsScript.js";

describe("callAppsScript", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.APPS_SCRIPT_URL = "https://script.google.com/macros/s/fake/exec";
    process.env.APPS_SCRIPT_TOKEN = "test-token";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("posts the action and shared token to Apps Script", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ success: true, statusCode: 200 }),
    });

    await callAppsScript("login", { email: "a@b.com" });

    expect(global.fetch).toHaveBeenCalledWith(
      process.env.APPS_SCRIPT_URL,
      expect.objectContaining({ method: "POST" }),
    );
    const call = global.fetch.mock.calls[0][1];
    const sentBody = JSON.parse(call.body);
    expect(sentBody).toEqual({
      email: "a@b.com",
      action: "login",
      authToken: "test-token",
    });
  });

  it("keeps a payload's own token field distinct from the shared authToken", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ success: true, statusCode: 200 }),
    });

    await callAppsScript("validateToken", { token: "user-session-token" });

    const call = global.fetch.mock.calls[0][1];
    const sentBody = JSON.parse(call.body);
    expect(sentBody.token).toBe("user-session-token");
    expect(sentBody.authToken).toBe("test-token");
  });

  it("prefers the statusCode embedded in the Apps Script response body", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ success: false, statusCode: 403, message: "Unauthorized" }),
    });

    const { statusCode, body } = await callAppsScript("login", {});
    expect(statusCode).toBe(403);
    expect(body.message).toBe("Unauthorized");
  });

  it("falls back to the HTTP status when the body has none", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 502,
      json: async () => ({}),
    });

    const { statusCode } = await callAppsScript("login", {});
    expect(statusCode).toBe(502);
  });

  it("throws a 500 when Apps Script env vars are missing", async () => {
    delete process.env.APPS_SCRIPT_URL;
    await expect(callAppsScript("login", {})).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
