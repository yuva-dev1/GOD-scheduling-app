import { Router } from "express";
import { callAppsScript } from "../lib/appsScript.js";
import { bearerToken } from "../lib/authHeader.js";
import {
  isValidDateString,
  isValidWindow,
  isValidEmail,
  isSelfServeRole,
  normalizeEmail,
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

adminRouter.get("/users", async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const role = req.query.role;
  if (role !== undefined && !isSelfServeRole(role)) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }

  await forward(res, "adminListUsers", { token, role });
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

  await forward(res, "adminListSlots", { token, role, startDate, days });
});

adminRouter.post("/assign", async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { date, window, role, email } = req.body || {};
  if (
    !isValidDateString(date) ||
    !isValidWindow(window) ||
    !isSelfServeRole(role) ||
    !isValidEmail(email)
  ) {
    return res.status(400).json({ success: false, message: "Invalid assignment request" });
  }

  await forward(res, "adminAssignSlot", {
    token,
    date,
    window,
    role,
    email: normalizeEmail(email),
  });
});

adminRouter.post("/unassign", async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { date, window, role } = req.body || {};
  if (!isValidDateString(date) || !isValidWindow(window) || !isSelfServeRole(role)) {
    return res.status(400).json({ success: false, message: "Invalid request" });
  }

  await forward(res, "adminUnassignSlot", { token, date, window, role });
});
