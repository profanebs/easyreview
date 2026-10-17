import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync, readdirSync, writeFileSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, join, resolve, sep, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const json = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
};
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

export function createReviewHelper({ root, port = 7803, agent = 'codex', delivery = 'local', deliver = async () => ({ ok: false, reason: 'no-service-config' }), reveal = null }) {
  const ROOT = realpathSync(resolve(root));
  // easyreview fork: the helper token is STABLE per review directory. It used
  // to be random per process, so reviving a dead helper (serve), upgrading the
  // package, or a reboot left every existing page holding a stale token — its
  // send-back then answered 403 with no recovery short of a re-render. The
  // token file is a dotfile, which the static route below refuses to serve.
  const tokenFile = join(ROOT, '.easyreview-helper.token');
  let token;
  try {
    const existing = readFileSync(tokenFile, 'utf8').trim();
    token = /^[a-f0-9]{64}$/.test(existing) ? existing : randomBytes(32).toString('hex');
  } catch { token = randomBytes(32).toString('hex'); }
  try { writeFileSync(tokenFile, token, { encoding: 'utf8', flag: 'wx' }); } catch { /* already there or unwritable */ }
  const inside = (path) => {
    const resolved = resolve(path);
    if (resolved !== ROOT && !resolved.startsWith(ROOT + sep)) return false;
    if (!existsSync(resolved)) return false;
    const real = realpathSync(resolved);
    return real === ROOT || real.startsWith(ROOT + sep);
  };
  const server = createServer(async (req, res) => {
    try {
      const address = server.address();
      const actualPort = typeof address === 'object' ? address.port : port;
      const hosts = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`];
      if (!hosts.includes(req.headers.host)) return json(res, 403, { ok: false, reason: 'bad-host' });
      const origin = req.headers.origin;
      const localOrigin = origin === `http://127.0.0.1:${actualPort}` || origin === `http://localhost:${actualPort}`;
      if (origin && !localOrigin && origin !== 'null') return json(res, 403, { ok: false, reason: 'bad-origin' });
      if (origin) {
        res.setHeader('access-control-allow-origin', origin);
        res.setHeader('vary', 'Origin');
      }
      const url = new URL(req.url, `http://127.0.0.1:${actualPort}`);
      const pathname = decodeURIComponent(url.pathname);
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, x-easyreview-token' });
        return res.end();
      }
      if (pathname === '/health' && req.method === 'GET') {
        if (origin && !localOrigin) return json(res, 403, { ok: false });
        return json(res, 200, { name: 'easyreview-helper', version: 1, root: ROOT, agent, delivery, token });
      }
      if (pathname === '/shutdown' || pathname === '/feedback' || pathname === '/reveal' || pathname === '/draft') {
        if (req.headers['x-easyreview-token'] !== token) return json(res, 403, { ok: false, reason: 'bad-token' });
        if (pathname === '/shutdown') {
          if (req.method !== 'POST') return json(res, 405, { ok: false });
          json(res, 200, { ok: true });
          server.close(); server.closeIdleConnections?.(); return;
        }
        if (pathname === '/reveal') {
          const target = url.searchParams.get('path');
          // The page reveals the paths it was rendered with — the source markdown
          // and its folder — which normally live OUTSIDE this helper's root. The
          // token above is the guard; require an existing absolute path and answer
          // a miss instead of throwing.
          if (req.method !== 'GET' || !target || !isAbsolute(target) || !existsSync(target)) return json(res, 404, { ok: false, reason: 'bad-path' });
          if (reveal) await reveal(target);
          else {
            try {
              const child = spawn('explorer', [statSync(target).isDirectory() ? target : `/select,${target}`], { detached: true, stdio: 'ignore', windowsHide: true });
              await new Promise((done, fail) => { child.once('spawn', done); child.once('error', fail); });
              child.unref();
            } catch {
              return json(res, 500, { ok: false, reason: 'reveal-failed' });
            }
          }
          res.writeHead(204); return res.end();
        }
        if (pathname === '/draft') {
          // easyreview fork: the page mirrors its annotation draft here. It
          // survives a re-render, another browser or a moved port — and the
          // renderer checks this directory before overwriting a page, so a round
          // of unsaved annotations can never be silently replaced.
          const draftsDir = join(ROOT, '.easyreview-drafts');
          const keyOf = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 32);
          if (req.method === 'POST') {
            let size = 0; const chunks = [];
            for await (const chunk of req) {
              size += chunk.length;
              if (size > 4 * 1024 * 1024) return json(res, 413, { ok: false, reason: 'too-large' });
              chunks.push(chunk);
            }
            let body;
            try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
            catch { return json(res, 400, { ok: false, reason: 'bad-json' }); }
            const pageId = typeof body.pageId === 'string' && body.pageId ? body.pageId : null;
            const docHash = typeof body.docHash === 'string' ? body.docHash : null;
            if (!pageId && !docHash) return json(res, 400, { ok: false, reason: 'no-key' });
            mkdirSync(draftsDir, { recursive: true });
            const record = {
              v: 1, pageId, docHash,
              annotations: Array.isArray(body.annotations) ? body.annotations : [],
              attachments: Array.isArray(body.attachments) ? body.attachments : [],
              savedAt: Date.now(),
            };
            const file = join(draftsDir, keyOf(pageId ?? docHash) + '.json');
            writeFileSync(file, JSON.stringify(record), 'utf8');
            return json(res, 200, { ok: true, file });
          }
          if (req.method === 'GET') {
            const pageId = url.searchParams.get('pageId');
            const docHash = url.searchParams.get('docHash');
            if (!pageId && !docHash) return json(res, 400, { ok: false, reason: 'no-key' });
            try {
              const record = JSON.parse(readFileSync(join(draftsDir, keyOf(pageId ?? docHash) + '.json'), 'utf8'));
              return json(res, 200, { ok: true, record });
            } catch { return json(res, 404, { ok: false, reason: 'none' }); }
          }
          if (req.method === 'DELETE') {
            const pageId = url.searchParams.get('pageId');
            const docHash = url.searchParams.get('docHash');
            if (!pageId && !docHash) return json(res, 400, { ok: false, reason: 'no-key' });
            try { rmSync(join(draftsDir, keyOf(pageId ?? docHash) + '.json'), { force: true }); } catch { /* ignore */ }
            return json(res, 200, { ok: true });
          }
          return json(res, 405, { ok: false });
        }
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        let size = 0; const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1024 * 1024) return json(res, 413, { ok: false, reason: 'too-large' });
          chunks.push(chunk);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { return json(res, 400, { ok: false, reason: 'bad-json' }); }
        if (typeof body.text !== 'string' || !body.text.trim()) return json(res, 400, { ok: false, reason: 'empty' });
        if (!/^[a-f0-9]{64}$/.test(body.docHash ?? '') || typeof body.artifact !== 'string' || !inside(body.artifact) || !body.artifact.endsWith('.review.html')) return json(res, 409, { ok: false, reason: 'stale-document' });
        const page = readFileSync(body.artifact, 'utf8');
        if (!page.includes(`window.__PN_DOC_HASH__="${body.docHash}"`)) return json(res, 409, { ok: false, reason: 'stale-document' });
        const dir = join(ROOT, 'feedback');
        mkdirSync(dir, { recursive: true });
        if (!inside(dir)) return json(res, 403, { ok: false, reason: 'bad-feedback-path' });
        const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID();
        const file = join(dir, `${id}.md`);
        const record = { schema: 'easyreview/feedback-v1', receivedAt: new Date().toISOString(), agent: body.agent ?? agent, title: body.title, docHash: body.docHash, source: body.source ?? null, artifact: body.artifact, text: body.text.trim(), feedback: body.feedback ?? null };
        writeFileSync(file, record.text, { encoding: 'utf8', flag: 'wx' });
        writeFileSync(join(dir, `${id}.json`), JSON.stringify(record, null, 2), { encoding: 'utf8', flag: 'wx' });
        writeFileSync(join(dir, 'latest.md'), record.text, 'utf8');
        writeFileSync(join(dir, `${body.docHash}.latest.json`), JSON.stringify({ file, record: join(dir, `${id}.json`), docHash: body.docHash }, null, 2), 'utf8');
        const saved = { ok: true, saved: true, file, delivered: false, reason: null };
        if (delivery === 'opencode' && agent === 'opencode' && body.agent === 'opencode') {
          const sent = await deliver(body.sessionId, record.text);
          return json(res, 200, { ...saved, delivered: sent.ok, reason: sent.reason ?? null });
        }
        return json(res, 200, saved);
      }
      if (req.method !== 'GET') return json(res, 405, { ok: false });
      if (pathname === '/') {
        const files = readdirSync(ROOT).filter((f) => f.endsWith('.review.html') && inside(join(ROOT, f)));
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end('<!doctype html><meta charset="utf-8"><title>easyreview 本地审阅</title><ul>' + files.map((f) => `<li><a href="/${encodeURIComponent(f)}">${escapeHtml(f)}</a></li>`).join('') + '</ul>');
      }
      const target = resolve(ROOT, '.' + pathname);
      // Only render assets are public; feedback/config/dotfiles are read on disk.
      if (!inside(target) || pathname.split('/').some((part) => part.startsWith('.') || part === 'feedback') || !MIME[extname(target).toLowerCase()] || !statSync(target).isFile()) return json(res, 404, { ok: false });
      res.writeHead(200, { 'content-type': MIME[extname(target).toLowerCase()], 'cache-control': 'no-store' });
      res.end(readFileSync(target));
    } catch (error) {
      if (!res.headersSent) json(res, error instanceof URIError || error instanceof SyntaxError ? 400 : 500, { ok: false, reason: 'request-failed' });
      else res.end();
    }
  });
  return { server, token, root: ROOT };
}

// OpenCode delivery remains opt-in. The caller supplies an authorized config
// path; Codex mode never discovers a service or reads user-home credentials.
export function openCodeDelivery(configPath) {
  const discoverUrl = () => new Promise((done) => {
    const child = spawn('opencode', ['api', 'get', '/api/info'], { shell: true, windowsHide: true });
    let out = ''; let settled = false;
    const finish = (url) => { if (!settled) { settled = true; clearTimeout(timer); done(url); } };
    const timer = setTimeout(() => { child.kill(); finish(null); }, 8000);
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.on('error', () => finish(null));
    child.on('close', () => {
      try { finish((JSON.parse(out.trim().split('\n').pop()).urls ?? []).find((u) => /^http:\/\/127\.0\.0\.1(?::\d+)?\/?$/.test(u)) ?? null); }
      catch { finish(null); }
    });
  });
  return async (sessionId, text) => {
    if (!/^ses_[A-Za-z0-9]+$/.test(sessionId ?? '')) return { ok: false, reason: 'bad-session-id' };
    try {
      // Read only on an explicitly selected OpenCode delivery. Keep the
      // original service-password discovery for existing OpenCode callers.
      const config = JSON.parse(readFileSync(configPath ?? join(homedir(), '.config', 'opencode', 'service.json'), 'utf8'));
      const serviceUrl = config.url ?? await discoverUrl();
      if (!serviceUrl) return { ok: false, reason: 'service-not-found' };
      const url = new URL(serviceUrl);
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:' || !config.password) return { ok: false, reason: 'bad-service-config' };
      const response = await fetch(`${url.origin}/api/session/${sessionId}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Basic ' + Buffer.from('opencode:' + config.password).toString('base64') }, body: JSON.stringify({ text, delivery: 'queue' }), signal: AbortSignal.timeout(8000) });
      return { ok: response.ok, reason: response.ok ? null : `HTTP ${response.status}` };
    } catch { return { ok: false, reason: 'service-not-found' }; }
  };
}

export function runHelper(argv) {
  const arg = (name, fallback) => { const at = argv.indexOf(name); return at < 0 ? fallback : argv[at + 1]; };
  const port = Number(arg('--port', '7803'));
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  const delivery = arg('--delivery', 'local');
  if (!['local', 'opencode'].includes(delivery)) throw new Error('Invalid delivery');
  const helper = createReviewHelper({ root: arg('--root', process.cwd()), port, agent: arg('--agent', 'codex'), delivery, deliver: delivery === 'opencode' ? openCodeDelivery(arg('--service-config', null)) : undefined });
  helper.server.listen(port, '127.0.0.1', () => console.log(`easyreview helper: http://127.0.0.1:${helper.server.address().port}/ (${helper.root})`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => helper.server.close(() => process.exit(0)));
}

// Bun's compiled bundle shares import.meta.main across bundled modules. The
// unified CLI invokes runHelper itself, so do not start a second listener.
if (process.argv[2] !== 'helper' && (import.meta.main || (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href))) runHelper(process.argv.slice(2));
