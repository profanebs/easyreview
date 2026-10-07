// Minimal static file server for delivering files into the OpenCode Review pane.
// (browser.preview is broken on Windows desktop: it turns "D:\path" into
//  "https://d/path", so local files never load. Serving over loopback HTTP
//  and opening the URL with browser.tabs.open works.)
//
// It also answers /reveal?path=<abs>, which spawns Explorer with the file
// selected — the page cannot launch Explorer itself (browsers forbid it), and
// the OpenCode desktop app wires its own reveal only to the session header.
// Only paths inside the served root are revealed.
//
// Pure ASCII on purpose: non-ASCII source breaks on some encoding paths.
//
// Usage:
//   node serve-review.mjs --root <dir> [--port 7803]

import { createServer } from "node:http";
import { readFileSync, statSync, existsSync, appendFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { extname, join, normalize, resolve, sep, isAbsolute } from "node:path";
import { spawn } from "node:child_process";
import { homedir } from "node:os";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const ROOT = resolve(arg("--root", process.cwd()));
const PORT = Number(arg("--port", "7803"));
const LOG = join(ROOT, ".serve-review.log");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon",
};

const log = (line) => {
  try {
    appendFileSync(LOG, new Date().toISOString() + " " + line + "\n");
  } catch {
    /* logging must never break the server */
  }
};

/** A path is revealable when it is the root itself or sits inside it. */
function insideRoot(target) {
  const t = resolve(target);
  return t === ROOT || t.startsWith(ROOT + sep);
}

function reveal(target) {
  if (!insideRoot(target)) return { ok: false, reason: "outside-root" };
  if (!existsSync(target)) return { ok: false, reason: "missing" };
  const isDir = statSync(target).isDirectory();
  const args = isDir ? [target] : ["/select," + target];
  try {
    const child = spawn("explorer", args, { detached: true, stdio: "ignore" });
    child.unref();
    return { ok: true, isDir };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

// ── Sending feedback back into the OpenCode session ───────────────────────
// The page cannot talk to the OpenCode service itself (no auth, no CORS from
// file://), so it hands the text to this helper: the helper stores it under
// feedback/, then posts it to the session's prompt endpoint as a user message.

const SERVICE_CONFIG = join(homedir(), ".config", "opencode", "service.json");
let cachedService = null;

/** The service password lives in OpenCode's own config; read it, never copy. */
function servicePassword() {
  try {
    return JSON.parse(readFileSync(SERVICE_CONFIG, "utf8")).password ?? null;
  } catch {
    return null;
  }
}

/** Discover the service URL through the CLI (it owns discovery + auth). */
function discoverService() {
  return new Promise((resolvePromise) => {
    if (cachedService) {
      resolvePromise(cachedService);
      return;
    }
    const child = spawn("opencode", ["api", "get", "/api/info"], { shell: true });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("error", () => resolvePromise(null));
    child.on("close", () => {
      try {
        const info = JSON.parse(out.trim().split("\n").pop());
        const url = (info.urls ?? []).find((u) => u.startsWith("http://127.0.0.1"));
        cachedService = url ? { url } : null;
      } catch {
        cachedService = null;
      }
      resolvePromise(cachedService);
    });
    setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolvePromise(null);
    }, 8000);
  });
}

async function sendToSession(sessionId, text) {
  if (!/^ses_[A-Za-z0-9]+$/.test(sessionId)) return { ok: false, reason: "bad-session-id" };
  const password = servicePassword();
  if (!password) return { ok: false, reason: "no-service-password" };
  const auth = "Basic " + Buffer.from("opencode:" + password).toString("base64");
  // A restarting session/server answers 502 (or refuses the connection) for a
  // few seconds; retry over ~8s before giving up. The feedback is already on
  // disk either way, and the page offers the copy fallback on failure.
  let last = "service-not-found";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const service = await discoverService();
    if (service) {
      try {
        const res = await fetch(`${service.url}/api/session/${sessionId}/prompt`, {
          method: "POST",
          headers: { authorization: auth, "content-type": "application/json" },
          body: JSON.stringify({ text, delivery: "queue" }),
        });
        if (res.ok) return { ok: true };
        // A restarted service has a new port; drop the cache so the next
        // attempt rediscovers instead of failing again.
        cachedService = null;
        last = `HTTP ${res.status}`;
        if (res.status < 500 && res.status !== 429) break; // real rejection, not a restart
      } catch (e) {
        cachedService = null;
        last = String(e && e.message ? e.message : e);
      }
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt === 1 ? 800 : 2400));
  }
  return { ok: false, reason: last };
}

function readJsonBody(req, limitBytes = 512 * 1024) {
  return new Promise((resolvePromise) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        resolvePromise(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolvePromise(null);
      }
    });
    req.on("error", () => resolvePromise(null));
  });
}

const server = createServer((req, res) => {
  const raw = decodeURIComponent((req.url || "/").split("?")[0]);
  const query = new URLSearchParams((req.url || "").split("?")[1] || "");

  // A page opened from file:// posts cross-origin; answer the preflight.
  if (req.method === "OPTIONS" && (raw === "/feedback" || raw === "/reveal")) {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "600",
    });
    res.end();
    return;
  }

  // Feedback endpoint: the review page's "send to AI" button posts here.
  if (raw === "/feedback" && req.method === "POST") {
    void (async () => {
      const body = await readJsonBody(req);
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
      const title = typeof body?.title === "string" ? body.title : "review";
      if (!text) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
        res.end(JSON.stringify({ ok: false, reason: "empty" }));
        return;
      }
      // 1) Keep a copy on disk first: the send must never lose the feedback.
      let file = null;
      try {
        const dir = join(ROOT, "feedback");
        mkdirSync(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const slug = title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "review";
        file = join(dir, `${stamp}-${slug}.md`);
        writeFileSync(file, text, "utf8");
        writeFileSync(join(dir, "latest.md"), text, "utf8");
      } catch (e) {
        log("FEEDBACK write failed: " + String(e));
      }
      // 2) Then deliver it into the session as a user message.
      const sent = await sendToSession(sessionId, text);
      log("FEEDBACK session=" + sessionId + " file=" + file + " sent=" + JSON.stringify(sent));
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ ok: true, file, delivered: sent.ok, reason: sent.reason ?? null }));
    })();
    return;
  }

  // Reveal endpoint: the page's "show in folder" button calls this.
  if (raw === "/reveal") {
    const target = query.get("path") || "";
    const result = isAbsolute(target) && insideRoot(target)
      ? reveal(target)
      : { ok: false, reason: "bad-path" };
    log("REVEAL " + target + " -> " + JSON.stringify(result));
    res.writeHead(result.ok ? 204 : 400, {
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
      ...(result.ok ? {} : { "content-type": "text/plain; charset=utf-8" }),
    });
    res.end(result.ok ? "" : result.reason);
    return;
  }

  if (raw === "/" || raw === "") {
    const files = readDirSafe(ROOT).filter((f) => extname(f) !== ".log");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      "<!doctype html><meta charset=utf-8><title>Review files</title>" +
        "<body style='font:14px/1.6 system-ui;padding:24px'>" +
        "<h2>Review pane files</h2><ul>" +
        files
          .map(
            (f) =>
              `<li><a href="/${encodeURIComponent(f)}">${f}</a> ` +
              `<span style='color:#888'>${(statSync(join(ROOT, f)).size / 1048576).toFixed(1)} MB</span></li>`,
          )
          .join("") +
        "</ul></body>",
    );
    log("GET / (index)");
    return;
  }
  const rel = normalize(raw).replace(/^[/\\]+/, "");
  const target = join(ROOT, rel);
  // Refuse anything that escapes the root (path traversal).
  if (!insideRoot(target)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("forbidden");
    log("GET " + raw + " -> 403");
    return;
  }
  try {
    if (!existsSync(target) || !statSync(target).isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      log("GET " + raw + " -> 404");
      return;
    }
    const body = readFileSync(target);
    res.writeHead(200, {
      "content-type": MIME[extname(target).toLowerCase()] || "application/octet-stream",
      "content-length": body.length,
      "cache-control": "no-store",
    });
    res.end(body);
    log("GET " + raw + " -> 200 (" + body.length + " bytes)");
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(String(e));
    log("GET " + raw + " -> 500 " + String(e));
  }
});

function readDirSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

server.listen(PORT, "127.0.0.1", () => {
  const line = "serving " + ROOT + " on http://127.0.0.1:" + PORT + "/";
  console.log(line);
  console.log("reveal endpoint: http://127.0.0.1:" + PORT + "/reveal?path=<abs path inside root>");
  log("UP " + line);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));

