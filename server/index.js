import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { slotsRouter } from "./routes/slots.js";
import { adminRouter } from "./routes/admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");

const PORT = process.env.PORT || 8080;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.use(express.json());
app.use("/api", (_req, res, next) => {
  // API responses include user-specific booking state and must not be cached
  // by a browser, proxy, or CDN. The server-side read cache is token-keyed.
  res.set("Cache-Control", "no-store");
  next();
});

// The SPA always calls /api/* on its own origin (Vite's dev proxy in
// development, the same Cloud Run service in production), so CORS is only
// needed if a frontend is ever hosted on a different origin. Default to
// permissive in development for convenience; in production, require
// CORS_ORIGINS to be set explicitly rather than silently allowing any origin.
if (CORS_ORIGINS.length > 0) {
  app.use(cors({ origin: CORS_ORIGINS }));
} else if (process.env.NODE_ENV !== "production") {
  app.use(cors());
} else {
  console.warn(
    "CORS_ORIGINS is not set — cross-origin requests will be rejected. " +
      "Set it if the frontend is hosted on a different origin than this API.",
  );
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "god-scheduling-app" });
});

app.use("/api/auth", authRouter);
app.use("/api/slots", slotsRouter);
app.use("/api/admin", adminRouter);

if (fs.existsSync(path.join(distDir, "index.html"))) {
  // Vite asset filenames are content-hashed, so they can be kept in the
  // browser cache for a year. The HTML shell must remain revalidated so a
  // deployment can point at the newest asset bundle immediately.
  app.use(
    "/assets",
    express.static(path.join(distDir, "assets"), {
      maxAge: "1y",
      immutable: true,
    }),
  );
  app.use(express.static(distDir, {
    setHeaders(res, filePath) {
      if (path.basename(filePath) === "index.html") res.setHeader("Cache-Control", "no-cache");
    },
  }));
  app.get("*", (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`god-scheduling-app server listening on port ${PORT}`);
});
