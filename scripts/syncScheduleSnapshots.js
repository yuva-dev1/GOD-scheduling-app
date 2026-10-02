import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callAppsScript } from "../server/lib/appsScript.js";

const ROLES = ["perumal_kainkaryam", "tirtha_kainkaryam", "coordinator"];
const MAX_LIST_DAYS = 60;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_DIR = path.join(ROOT, ".local-data", "snapshots");
const CHANGES_PATH = path.join(ROOT, ".local-data", "changes.jsonl");
const LAST_RUN_PATH = path.join(ROOT, ".local-data", "last-run.json");

function localDateString(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function dateFromString(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function snapshotRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Current month plus the following three calendar months, through month end.
  const end = new Date(start.getFullYear(), start.getMonth() + 4, 0);
  return { startDate: localDateString(start), endDate: localDateString(end) };
}

function rangesFor(startDate, endDate) {
  const ranges = [];
  let cursor = dateFromString(startDate);
  const end = dateFromString(endDate);
  while (cursor <= end) {
    const count = Math.min(MAX_LIST_DAYS, Math.floor((end - cursor) / 86_400_000) + 1);
    ranges.push({ startDate: localDateString(cursor), days: count });
    cursor.setDate(cursor.getDate() + count);
  }
  return ranges;
}

async function invoke(action, payload = {}) {
  const { statusCode, body } = await callAppsScript(action, payload);
  if (statusCode < 200 || statusCode >= 300 || body.success !== true) {
    throw new Error(`${action} failed (${statusCode}): ${body.message || "Apps Script returned an unsuccessful response"}`);
  }
  return body;
}

async function readPreviousSnapshot(role) {
  const filePath = path.join(SNAPSHOT_DIR, `${role}.json`);
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function indexRecords(records, keyFor) {
  return new Map(records.map((record) => [keyFor(record), record]));
}

function collectChanges(role, previous, current, checkedAt) {
  if (!previous) return [];
  const changes = [];
  const collections = [
    ["users", (row) => row.userId],
    ["slots", (row) => `${row.date}|${row.window}`],
    ["vacations", (row) => row.vacationId],
  ];
  for (const [collection, keyFor] of collections) {
    const before = indexRecords(previous[collection] || [], keyFor);
    const after = indexRecords(current[collection] || [], keyFor);
    for (const [key, record] of before) {
      if (!after.has(key)) changes.push({ checkedAt, role, collection, key, change: "removed", previous: record });
    }
    for (const [key, record] of after) {
      if (!before.has(key)) {
        changes.push({ checkedAt, role, collection, key, change: "added", current: record });
      } else if (JSON.stringify(before.get(key)) !== JSON.stringify(record)) {
        changes.push({ checkedAt, role, collection, key, change: "updated", previous: before.get(key), current: record });
      }
    }
  }
  return changes;
}

async function atomicWrite(filePath, contents) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, contents, "utf8");
  await fs.rename(temporaryPath, filePath);
}

async function sync() {
  const requiredVariables = ["APPS_SCRIPT_URL", "APPS_SCRIPT_TOKEN", "LOCAL_TEST_ADMIN_PASSWORD"];
  const missingVariables = requiredVariables.filter((name) => {
    const value = process.env[name];
    return !value || /replace-with|\bXXX\b/i.test(value);
  });
  if (missingVariables.length > 0) {
    throw new Error(`Configure these variables in the ignored local .env file: ${missingVariables.join(", ")}.`);
  }

  const checkedAt = new Date().toISOString();
  const range = snapshotRange();
  const ranges = rangesFor(range.startDate, range.endDate);
  const login = await invoke("adminLogin", { password: process.env.LOCAL_TEST_ADMIN_PASSWORD });
  if (!login.token) throw new Error("Apps Script admin login did not return a session token.");
  const token = login.token;

  const { users = [] } = await invoke("adminListUsers", { token });
  const allVacations = [];
  for (const part of ranges) {
    const result = await invoke("adminListVacations", { token, ...part });
    allVacations.push(...(result.vacations || []));
  }

  const nextSnapshots = {};
  for (const role of ROLES) {
    const slots = [];
    for (const part of ranges) {
      const result = await invoke("adminListSlots", { token, role, ...part });
      slots.push(...(result.slots || []));
    }
    nextSnapshots[role] = {
      schemaVersion: 1,
      generatedAt: checkedAt,
      range,
      role,
      users: users.filter((user) => user.role === role),
      slots,
      vacations: allVacations.filter((vacation) => vacation.role === role),
    };
  }

  const changes = [];
  for (const role of ROLES) {
    const previous = await readPreviousSnapshot(role);
    changes.push(...collectChanges(role, previous, nextSnapshots[role], checkedAt));
  }

  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
  for (const role of ROLES) {
    await atomicWrite(path.join(SNAPSHOT_DIR, `${role}.json`), `${JSON.stringify(nextSnapshots[role], null, 2)}\n`);
  }
  await atomicWrite(path.join(SNAPSHOT_DIR, "admin.json"), `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: checkedAt,
    range,
    roles: nextSnapshots,
  }, null, 2)}\n`);
  if (changes.length > 0) {
    await fs.appendFile(CHANGES_PATH, changes.map((change) => JSON.stringify(change)).join("\n") + "\n", "utf8");
  }

  const summary = {
    status: "success",
    checkedAt,
    range,
    files: ["admin.json", ...ROLES.map((role) => `${role}.json`)],
    changesRecorded: changes.length,
  };
  await atomicWrite(LAST_RUN_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

sync().catch(async (error) => {
  const failure = { status: "failed", checkedAt: new Date().toISOString(), message: error.message };
  await fs.mkdir(path.dirname(LAST_RUN_PATH), { recursive: true }).catch(() => {});
  await atomicWrite(LAST_RUN_PATH, `${JSON.stringify(failure, null, 2)}\n`).catch(() => {});
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
});
