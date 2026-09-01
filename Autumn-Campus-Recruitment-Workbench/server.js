#!/usr/bin/env node

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = __dirname;
const OUTPUT_DIR = path.join(ROOT, "outputs");
const DATA_FILE = path.join(OUTPUT_DIR, "data", "boss-jobs.json");
const BACKUP_FILE = path.join(ROOT, "work", "boss-jobs.last-success.json");
const SCRAPER = path.join(ROOT, "work", "scrapers", "boss-zhipin.js");
const NODE = process.env.JOBLENS_NODE || process.execPath;
const PORT = Number(process.env.PORT || 4173);
const SYNC_MINUTES = Math.max(10, Number(process.env.BOSS_SYNC_MINUTES || 30));
const QUERY = process.env.BOSS_QUERY || "前端 React";
const CITY = process.env.BOSS_CITY || "101020100";
const LIMIT = Number(process.env.BOSS_LIMIT || 30);
const MODE = process.env.BOSS_MODE || "api";

let syncRunning = false;
let lastAttemptAt = null;
let lastError = null;
let nextSyncAt = new Date(Date.now() + SYNC_MINUTES * 60_000).toISOString();

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { meta: { source: "boss", status: "empty" }, jobs: [] };
  }
}

function writeCurrent(payload) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2) + "\n");
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "data", "boss-jobs.js"),
    "window.BOSS_JOBS_META = " + JSON.stringify(payload.meta) + ";\nwindow.BOSS_JOBS = " + JSON.stringify(payload.jobs) + ";\n"
  );
}

function preserveLatestSuccessfulData() {
  const payload = readJson(DATA_FILE);
  if (payload.meta && payload.meta.status === "ok" && payload.jobs && payload.jobs.length) {
    fs.mkdirSync(path.dirname(BACKUP_FILE), { recursive: true });
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(payload, null, 2) + "\n");
  }
  return payload;
}

function restoreAfterFailedSync(failedPayload) {
  const backup = readJson(BACKUP_FILE);
  if (!backup.jobs || !backup.jobs.length) return failedPayload;
  backup.meta = Object.assign({}, backup.meta, {
    status: "stale",
    syncStatus: failedPayload.meta && failedPayload.meta.status || "error",
    syncMessage: failedPayload.meta && failedPayload.meta.message || "本次同步失败，继续使用上一次成功数据。",
    lastAttemptAt
  });
  writeCurrent(backup);
  return backup;
}

function runSync(reason) {
  reason = reason || "scheduled";
  if (syncRunning) return Promise.resolve({ accepted: false, reason: "sync_running" });
  syncRunning = true;
  lastAttemptAt = new Date().toISOString();
  lastError = null;
  preserveLatestSuccessfulData();

  const args = [SCRAPER, "--mode", MODE, "--query", QUERY, "--city", CITY, "--limit", String(LIMIT)];
  if (process.env.BOSS_COOKIE_FILE) args.push("--cookie-file", process.env.BOSS_COOKIE_FILE);

  return new Promise((resolve) => {
    const child = spawn(NODE, args, { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => { stderr += error.message; });
    child.on("close", (code) => {
      let payload = readJson(DATA_FILE);
      if (code !== 0 || !payload.meta || payload.meta.status !== "ok" || !payload.jobs || !payload.jobs.length) {
        lastError = payload.meta && payload.meta.message || stderr.trim() || "采集器退出码 " + code;
        payload = restoreAfterFailedSync(payload);
      } else {
        preserveLatestSuccessfulData();
      }
      syncRunning = false;
      nextSyncAt = new Date(Date.now() + SYNC_MINUTES * 60_000).toISOString();
      resolve({ accepted: true, reason, code, status: payload.meta && payload.meta.status, count: payload.jobs && payload.jobs.length || 0 });
    });
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(body);
}

function serveFile(req, res) {
  const requested = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const relative = requested === "/" ? "index.html" : requested.replace(/^\//, "");
  const file = path.resolve(OUTPUT_DIR, relative);
  if (!file.startsWith(OUTPUT_DIR + path.sep)) return sendJson(res, 403, { error: "forbidden" });
  fs.readFile(file, (error, data) => {
    if (error) return sendJson(res, 404, { error: "not_found" });
    const ext = path.extname(file);
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
    res.writeHead(200, { "content-type": types[ext] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type"
    });
    return res.end();
  }
  if (req.method === "GET" && url.pathname === "/api/jobs") {
    const payload = readJson(DATA_FILE);
    return sendJson(res, 200, Object.assign({}, payload, {
      runtime: { syncRunning, lastAttemptAt, lastError, nextSyncAt, syncMinutes: SYNC_MINUTES }
    }));
  }
  if (req.method === "POST" && url.pathname === "/api/sync") {
    if (syncRunning) return sendJson(res, 409, { accepted: false, reason: "sync_running" });
    runSync("manual");
    return sendJson(res, 202, { accepted: true, startedAt: new Date().toISOString() });
  }
  if (req.method === "POST" && url.pathname === "/api/import") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        const incoming = JSON.parse(body);
        const jobs = Array.isArray(incoming.jobs) ? incoming.jobs : [];
        const valid = jobs
          .filter((job) => job && job.source === "boss" && /^https:\/\/www\.zhipin\.com\/job_detail\//.test(job.url || ""))
          .slice(0, LIMIT);
        if (!valid.length) return sendJson(res, 400, { accepted: false, error: "no_valid_boss_jobs" });
        const payload = {
          meta: {
            source: "boss",
            status: "ok",
            query: incoming.query || QUERY,
            city: incoming.city || CITY,
            count: valid.length,
            collectionMode: "authenticated_chrome_extension",
            fetchedAt: new Date().toISOString()
          },
          jobs: valid
        };
        writeCurrent(payload);
        preserveLatestSuccessfulData();
        lastAttemptAt = payload.meta.fetchedAt;
        lastError = null;
        nextSyncAt = new Date(Date.now() + SYNC_MINUTES * 60_000).toISOString();
        return sendJson(res, 200, { accepted: true, count: valid.length, fetchedAt: payload.meta.fetchedAt });
      } catch (error) {
        return sendJson(res, 400, { accepted: false, error: error.message });
      }
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, syncRunning, nextSyncAt });
  }
  return serveFile(req, res);
});

preserveLatestSuccessfulData();
setInterval(() => runSync("scheduled"), SYNC_MINUTES * 60_000).unref();
server.listen(PORT, "127.0.0.1", () => {
  console.log("JobLens running at http://127.0.0.1:" + PORT);
  console.log("BOSS sync interval: " + SYNC_MINUTES + " minutes (" + MODE + " mode)");
});
