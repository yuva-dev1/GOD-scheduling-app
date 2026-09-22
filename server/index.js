import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");

const PORT = process.env.PORT || 8080;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: CORS_ORIGINS.length > 0 ? CORS_ORIGINS : true,
  }),
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "god-scheduling-app" });
});

app.use("/api/auth", authRouter);

// Slot booking and admin-assignment routes are added in follow-up PRs. Each
// will forward requests to the Apps Script web app configured via
// APPS_SCRIPT_URL, attaching APPS_SCRIPT_TOKEN so Apps Script can verify the
// request came from this server.

if (fs.existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`god-scheduling-app server listening on port ${PORT}`);
});
