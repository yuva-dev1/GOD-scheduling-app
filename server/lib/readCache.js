import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Cloud Run instances have an ephemeral writable filesystem. This is a warm-
// instance optimization, not durable storage or a replacement for Sheets.
const CACHE_FILE = process.env.CACHE_FILE_PATH || path.join(os.tmpdir(), "god-scheduling-cache.json");
const DEFAULT_TTL_MS = Number(process.env.READ_CACHE_TTL_MS) || 15_000;
const MAX_ENTRIES = 200;

const entries = new Map();
const inFlight = new Map();
let loaded = false;

function cacheKey(action, payload) {
  // Include the token so personalized fields such as bookedByMe cannot cross
  // users. Hashing keeps credentials out of cache.json.
  const source = JSON.stringify({ action, payload });
  return crypto.createHash("sha256").update(source).digest("hex");
}

function loadCache() {
  if (loaded) return;
  loaded = true;

  try {
    const saved = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    const now = Date.now();
    Object.entries(saved).forEach(([key, entry]) => {
      if (entry && entry.expiresAt > now && entry.value) entries.set(key, entry);
    });
  } catch {
    // A missing, corrupt, or inaccessible cache is simply a cache miss.
  }
}

function persistCache() {
  try {
    const directory = path.dirname(CACHE_FILE);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryFile = `${CACHE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(Object.fromEntries(entries)), "utf8");
    fs.renameSync(temporaryFile, CACHE_FILE);
  } catch {
    // Cache persistence is an optimization and must never fail a request.
  }
}

function trimEntries() {
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
}

export async function readThroughCache(action, payload, loader, options = {}) {
  loadCache();
  const key = cacheKey(action, payload);
  const now = Date.now();
  const cached = entries.get(key);

  if (cached && cached.expiresAt > now) return { ...cached.value, cacheHit: true };
  if (cached) entries.delete(key);

  const existingRequest = inFlight.get(key);
  if (existingRequest) return existingRequest;

  const request = Promise.resolve()
    .then(loader)
    .then((value) => {
      if (value.statusCode >= 200 && value.statusCode < 300) {
        entries.set(key, {
          expiresAt: Date.now() + (options.ttlMs || DEFAULT_TTL_MS),
          value,
        });
        trimEntries();
        persistCache();
      }
      return { ...value, cacheHit: false };
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, request);
  return request;
}

export function invalidateReadCache() {
  loadCache();
  entries.clear();
  persistCache();
}
