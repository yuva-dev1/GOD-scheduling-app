import { Router } from "express";
import { callAppsScript } from "../lib/appsScript.js";
import { bearerToken } from "../lib/authHeader.js";
import { authLimiter, writeLimiter } from "../lib/rateLimiters.js";
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

authRouter.post("/password-reset/request", authLimiter, async (req, res) => {
  const email = req.body?.email;
  const response = {
    success: true,
    message: "If an account exists for that email, password reset instructions will be sent shortly.",
  };

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: "Enter a valid email address" });
  }

  try {
    await callAppsScript("requestPasswordReset", { email: normalizeEmail(email) });
  } catch (err) {
    // Keep the public response identical for known and unknown accounts.
    console.error("Password reset request could not be processed", err);
  }
  return res.status(200).json(response);
});

authRouter.post("/password-reset/complete", authLimiter, async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== "string" || token.length > 128 || !isValidPassword(password)) {
    return res.status(400).json({ success: false, message: "Invalid or expired reset link, or password is too short" });
  }

  try {
    const { statusCode, body } = await callAppsScript("completePasswordReset", { token, password });
    return res.status(statusCode).json(body);
  } catch (err) {
    return res.status(err.statusCode || 502).json({ success: false, message: err.message });
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

authRouter.patch("/account/role", writeLimiter, async (req, res) => {
  const token = bearerToken(req);

  if (!token) {
    return res.status(401).json({ success: false, message: "Missing token" });
  }
  if (!isSelfServeRole(req.body?.role)) {
    return res.status(400).json({ success: false, message: "Invalid Kainkaryam role" });
  }

  try {
    const { statusCode, body } = await callAppsScript("changeRole", {
      token,
      role: req.body.role,
    });
    res.status(statusCode).json(body);
  } catch (err) {
    res.status(err.statusCode || 502).json({ success: false, message: err.message });
  }
});

authRouter.delete("/account", writeLimiter, async (req, res) => {
  const token = bearerToken(req);

  if (!token) {
    return res.status(401).json({ success: false, message: "Missing token" });
  }

  try {
    const { statusCode, body } = await callAppsScript("deleteAccount", { token });
    res.status(statusCode).json(body);
  } catch (err) {
    res.status(err.statusCode || 502).json({ success: false, message: err.message });
  }
});
