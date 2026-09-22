import { Router } from "express";
import { callAppsScript } from "../lib/appsScript.js";
import { bearerToken } from "../lib/authHeader.js";
import { authLimiter } from "../lib/rateLimiters.js";
import {
  isValidEmail,
  isValidPassword,
  isSelfServeRole,
  normalizeEmail,
} from "../lib/validation.js";

export const authRouter = Router();

authRouter.post("/register", authLimiter, async (req, res) => {
  const { email, password, role } = req.body || {};

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: "Invalid email" });
  }
  if (!isValidPassword(password)) {
    return res
      .status(400)
      .json({ success: false, message: "Password must be at least 8 characters" });
  }
  if (!isSelfServeRole(role)) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }

  try {
    const { statusCode, body } = await callAppsScript("register", {
      email: normalizeEmail(email),
      password,
      role,
    });
    res.status(statusCode).json(body);
  } catch (err) {
    res.status(err.statusCode || 502).json({ success: false, message: err.message });
  }
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const { email, password } = req.body || {};

  if (!isValidEmail(email) || !isValidPassword(password)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid email or password" });
  }

  try {
    const { statusCode, body } = await callAppsScript("login", {
      email: normalizeEmail(email),
      password,
    });
    res.status(statusCode).json(body);
  } catch (err) {
    res.status(err.statusCode || 502).json({ success: false, message: err.message });
  }
});

authRouter.get("/me", async (req, res) => {
  const token = bearerToken(req);

  if (!token) {
    return res.status(401).json({ success: false, message: "Missing token" });
  }

  try {
    const { statusCode, body } = await callAppsScript("validateToken", { token });
    res.status(statusCode).json(body);
  } catch (err) {
    res.status(err.statusCode || 502).json({ success: false, message: err.message });
  }
});
