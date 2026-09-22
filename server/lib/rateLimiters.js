import rateLimit from "express-rate-limit";

function jsonRateLimitHandler(_req, res) {
  res.status(429).json({ success: false, message: "Too many requests, please try again later" });
}

// Login/register are the most abuse-prone (credential stuffing, account
// spam) — kept tight.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});

// Booking/assignment writes: looser, since legitimate repeat use (browsing
// and toggling several slots) is expected.
export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});
