import { Router } from "express";
import { callAppsScript } from "../lib/appsScript.js";
import { bearerToken } from "../lib/authHeader.js";
import { readThroughCache } from "../lib/readCache.js";
import { writeLimiter } from "../lib/rateLimiters.js";
import { isValidVacationId, isValidVacationRange } from "../lib/validation.js";

export const vacationsRouter = Router();

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

vacationsRouter.get("/", async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const payload = { token };
  try {
    const { statusCode, body } = await readThroughCache(
      "listVacations",
      payload,
      () => callAppsScript("listVacations", payload),
      { ttlMs: 30_000 },
    );
    res.status(statusCode).json(body);
  } catch (err) {
    res.status(err.statusCode || 502).json({ success: false, message: err.message });
  }
});

vacationsRouter.post("/", writeLimiter, async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { startDate, endDate } = req.body || {};
  if (!isValidVacationRange(startDate, endDate)) {
    return res.status(400).json({ success: false, message: "Invalid vacation date range" });
  }

  await forward(res, "createVacation", { token, startDate, endDate });
});

vacationsRouter.delete("/:vacationId", writeLimiter, async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  if (!isValidVacationId(req.params.vacationId)) {
    return res.status(400).json({ success: false, message: "Invalid vacation" });
  }

  await forward(res, "deleteVacation", { token, vacationId: req.params.vacationId });
});
