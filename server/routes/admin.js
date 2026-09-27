import { Router } from "express";
import { callAppsScript } from "../lib/appsScript.js";
import { bearerToken } from "../lib/authHeader.js";
import { authLimiter, writeLimiter } from "../lib/rateLimiters.js";
import { readThroughCache } from "../lib/readCache.js";
import {
  isValidDateString,
  isValidWindow,
  isValidEmail,
  isSelfServeRole,
  normalizeEmail,
  isValidRecurrenceEndDate,
  isValidVacationId,
  isValidVacationRange,
} from "../lib/validation.js";

export const adminRouter = Router();

const MAX_LIST_DAYS = 60;

function requireToken(req, res) {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "Missing token" });
    return null;
  }
  return token;
}

async function forward(res, action, payload) {
  try {
    const { statusCode, body } = await callAppsScript(action, payload);
    res.status(statusCode).json(body);
  } catch (err) {
    res.status(err.statusCode || 502).json({ success: false, message: err.message });
  }
}

adminRouter.post("/login", authLimiter, async (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== "string" || password.length === 0) {
    return res.status(400).json({ success: false, message: "Password required" });
  }

  await forward(res, "adminLogin", { password });
});

adminRouter.get("/users", async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const role = req.query.role;
  if (role !== undefined && !isSelfServeRole(role)) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }

  const payload = { token, role };
  try {
    const { statusCode, body } = await readThroughCache(
      "adminListUsers",
      payload,
      () => callAppsScript("adminListUsers", payload),
      { ttlMs: 60_000 },
    );
    res.status(statusCode).json(body);
  } catch (err) {
    res.status(err.statusCode || 502).json({ success: false, message: err.message });
  }
});

adminRouter.get("/slots", async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const role = req.query.role;
  if (!isSelfServeRole(role)) {
    return res.status(400).json({ success: false, message: "role must be a self-serve role" });
  }

  const startDate = req.query.startDate;
  if (startDate !== undefined && !isValidDateString(startDate)) {
    return res.status(400).json({ success: false, message: "Invalid startDate" });
  }

  const days = req.query.days !== undefined ? Number(req.query.days) : undefined;
  if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > MAX_LIST_DAYS)) {
    return res.status(400).json({ success: false, message: `days must be 1-${MAX_LIST_DAYS}` });
  }

  const payload = { token, role, startDate, days };
  try {
    const { statusCode, body } = await readThroughCache(
      "adminListSlots",
      payload,
      () => callAppsScript("adminListSlots", payload),
    );
    res.status(statusCode).json(body);
  } catch (err) {
    res.status(err.statusCode || 502).json({ success: false, message: err.message });
  }
});

adminRouter.get("/vacations", async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const role = req.query.role;
  if (role !== undefined && !isSelfServeRole(role)) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }

  const startDate = req.query.startDate;
  if (startDate !== undefined && !isValidDateString(startDate)) {
    return res.status(400).json({ success: false, message: "Invalid startDate" });
  }

  const days = req.query.days !== undefined ? Number(req.query.days) : undefined;
  if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > MAX_LIST_DAYS)) {
    return res.status(400).json({ success: false, message: `days must be 1-${MAX_LIST_DAYS}` });
  }

  const payload = { token, role, startDate, days };
  try {
    const { statusCode, body } = await readThroughCache(
      "adminListVacations",
      payload,
      () => callAppsScript("adminListVacations", payload),
      { ttlMs: 30_000 },
    );
    res.status(statusCode).json(body);
  } catch (err) {
    res.status(err.statusCode || 502).json({ success: false, message: err.message });
  }
});

adminRouter.post("/vacations", writeLimiter, async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { email, startDate, endDate } = req.body || {};
  if (!isValidEmail(email) || !isValidVacationRange(startDate, endDate)) {
    return res.status(400).json({ success: false, message: "Invalid vacation request" });
  }

  await forward(res, "adminCreateVacation", {
    token,
    email: normalizeEmail(email),
    startDate,
    endDate,
  });
});

adminRouter.patch("/vacations/:vacationId", writeLimiter, async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { startDate, endDate } = req.body || {};
  if (!isValidVacationId(req.params.vacationId) || !isValidVacationRange(startDate, endDate)) {
    return res.status(400).json({ success: false, message: "Invalid vacation request" });
  }

  await forward(res, "adminUpdateVacation", {
    token,
    vacationId: req.params.vacationId,
    startDate,
    endDate,
  });
});

adminRouter.delete("/vacations/:vacationId", writeLimiter, async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  if (!isValidVacationId(req.params.vacationId)) {
    return res.status(400).json({ success: false, message: "Invalid vacation id" });
  }

  await forward(res, "adminDeleteVacation", {
    token,
    vacationId: req.params.vacationId,
  });
});

adminRouter.post("/assign", writeLimiter, async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { date, window, role, email, recurrenceEndDate } = req.body || {};
  if (
    !isValidDateString(date) ||
    !isValidWindow(window) ||
    !isSelfServeRole(role) ||
    !isValidEmail(email) ||
    !isValidRecurrenceEndDate(date, recurrenceEndDate)
  ) {
    return res.status(400).json({ success: false, message: "Invalid assignment request" });
  }

  await forward(res, "adminAssignSlot", {
    token,
    date,
    window,
    role,
    email: normalizeEmail(email),
    recurrenceEndDate,
  });
});

adminRouter.post("/unassign", writeLimiter, async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { date, window, role, email } = req.body || {};
  if (
    !isValidDateString(date) ||
    !isValidWindow(window) ||
    !isSelfServeRole(role) ||
    (email !== undefined && !isValidEmail(email))
  ) {
    return res.status(400).json({ success: false, message: "Invalid request" });
  }

  await forward(res, "adminUnassignSlot", {
    token,
    date,
    window,
    role,
    email: email === undefined ? undefined : normalizeEmail(email),
  });
});
