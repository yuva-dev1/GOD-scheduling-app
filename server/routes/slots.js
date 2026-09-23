import { Router } from "express";
import { callAppsScript } from "../lib/appsScript.js";
import { bearerToken } from "../lib/authHeader.js";
import { writeLimiter } from "../lib/rateLimiters.js";
import { isValidDateString, isValidWindow, isValidRecurrenceEndDate } from "../lib/validation.js";

export const slotsRouter = Router();

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

slotsRouter.get("/", async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const startDate = req.query.startDate;
  if (startDate !== undefined && !isValidDateString(startDate)) {
    return res.status(400).json({ success: false, message: "Invalid startDate" });
  }

  const days = req.query.days !== undefined ? Number(req.query.days) : undefined;
  if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > MAX_LIST_DAYS)) {
    return res.status(400).json({ success: false, message: `days must be 1-${MAX_LIST_DAYS}` });
  }

  await forward(res, "listSlots", { token, startDate, days });
});

slotsRouter.post("/book", writeLimiter, async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { date, window, recurrenceEndDate } = req.body || {};
  if (!isValidDateString(date) || !isValidWindow(window) || !isValidRecurrenceEndDate(date, recurrenceEndDate)) {
    return res.status(400).json({ success: false, message: "Invalid date or window" });
  }

  await forward(res, "bookSlot", { token, date, window, recurrenceEndDate });
});

slotsRouter.post("/cancel", writeLimiter, async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { date, window } = req.body || {};
  if (!isValidDateString(date) || !isValidWindow(window)) {
    return res.status(400).json({ success: false, message: "Invalid date or window" });
  }

  await forward(res, "cancelSlot", { token, date, window });
});
