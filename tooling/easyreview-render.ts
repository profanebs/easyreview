/**
 * easyreview-render — 把 Markdown 渲染成**单文件**审阅页（不启服务、不开浏览器）
 *
 * 为什么能这么做：plannotator 的分享链接把「文档 + 批注」压成 deflate-raw +
 * base64url 塞在 URL hash 里，页面启动时读它还原文档（useSharing.loadFromHash）。
 * 所以只要在一个自包含 HTML 里预先把 hash 设好，同一套 UI 就能脱离服务器跑起来。
 *
 * 用法：
 *   bun run easyreview <file.md> [更多.md ...] [--out <目录>]
 *
 * 产出：<md 同目录>/<basename>.review.html（单文件，双击即可看）
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, dirname, resolve, join, isAbsolute } from "node:path";
import { compress } from "../packages/core/compress";
import { createHash } from "node:crypto";
import { bootScript } from "./easyreview-boot";
import { resolveAgent } from "./easyreview-host";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
// The app HTML is a TEXT IMPORT on purpose: `bun run` resolves it from the
// build output, and `bun build --compile` embeds it in easyreview-render.exe —
// which is what makes the portable package work on a machine with no bun, no
// repo and no build step.
// @ts-expect-error bun text import (no .d.ts for html text modules)
import appHtmlText from "../apps/hook/dist/index.html" with { type: "text" };

const APP_HTML = resolve(import.meta.dir, "..", "apps", "hook", "dist", "index.html");

/** 与 packages/ui/hooks/useSharing.ts 的 looksLikeSharePayload 同一条判据。 */
function looksLikeSharePayload(hash: string): boolean {
  return hash.length >= 30 && /^[A-Za-z0-9_-]+$/.test(hash) && /[A-Z]/.test(hash);
}

/**
 * 在第一个 <script 之前插入 hash 引导脚本。
 *
 * 不能锚 `</head>`：打包后的 JS 里也有 `</head>` 这个字符串（HTML 模板字面
 * 量），indexOf 会命中 bundle 内部，把脚本插进字符串中间 → 整段语法错误。
 * 第一个 `<script` 一定是 bundle 自身的标签（它之前不会有别的脚本）。
 */
function injectHash(
  html: string,
  hash: string,
  title: string,
  locale: string,
  paths: Record<string, string>,
  helper: string | null,
  sessionId: string | null,
  docHash: string,
  docText: string,
  lite = false,
): string {
  const at = html.indexOf("<script");
  const headClose = html.indexOf("</head>");
  if (at === -1 || (headClose !== -1 && at > headClose)) {
    throw new Error("构建产物结构异常：找不到 <head> 里的入口脚本");
  }
  // __PN_DOC_TITLE__ is read by App.tsx for the browser tab title, so two open
  // review pages are told apart at a glance. __PN_LOCALE__ selects the UI
  // language ('zh' uses the translation table; anything else is upstream's
  // English, byte for byte). __PN_PATHS__ carries the absolute paths so the
  // Options menu can show "where is this file", __PN_HELPER__ is the local
  // helper server (reveal + one-click send-back), and __PN_SESSION_ID__ is the
  // agent session the feedback goes back into.
  const boot = bootScript({
    __PN_DOC_TITLE__: title, __PN_LOCALE__: locale, __PN_PATHS__: paths,
    __PN_SHARE_PAYLOAD__: hash, __PN_DOC_HASH__: docHash, __PN_DOC_TEXT__: docText, __PN_AGENT__: agent, __PN_THEME__: "xuan-ink", __PN_DELIVERY__: delivery, __PN_VERSION__: "1.2",
    ...(lite ? { __PN_LITE__: "1" } : {}),
    ...(helper ? { __PN_HELPER__: helper, __PN_HELPER_TOKEN__: helperToken } : {}),
    ...(sessionId ? { __PN_SESSION_ID__: sessionId } : {}),
  });
  return html.slice(0, at) + boot + html.slice(at);
}

/**
 * 文档的简略标题：front matter 的 title 优先，其次文件名去扩展名。
 * 交给运行时当标签标题（App.tsx 读 window.__PN_DOC_TITLE__），这样两个同时
 * 打开的审阅页在标签上一眼能分清，而不是都叫同一个产品名。
 */
export function docTitle(markdown: string, filePath: string): string {
  const fm = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fromFm = fm?.[1]
    ?.split("\n")
    .map((l) => l.match(/^title\s*:\s*(.+)$/i)?.[1]?.trim())
    .find(Boolean);
  if (fromFm) return fromFm.replace(/^["']|["']$/g, "");
  return basename(filePath).replace(/\.[^.]+$/, "");
}

async function renderOne(
  mdPath: string,
  outDir: string | null,
  locale: string,
  helper: string | null,
  sessionId: string | null,
  emitPaths: boolean,
  requirePlan: boolean,
): Promise<string> {
  const md = resolve(mdPath);
  if (!existsSync(md)) throw new Error(`找不到文件：${md}`);
  const markdown = readFileSync(md, "utf8").replace(/\r\n?/g, "\n");

  // Plan/v1 shape check. This is a NOTE, not a gate: the page's Plan panel
  // (tasks, four questions, acceptance jumps, decision points) only exists for
  // a structured document, and the agent is the one who should have written
  // the structure. The note tells it why the panel will be missing.
  const hasTasks = /^##\s+(?:(?:Task|任务)\s+)?T\d+\s*[:：]/im.test(markdown);
  if (!hasTasks && !lite) {
    const hasPlanFields = /^\*\*(这是啥|做什么|What|验收|Acceptance|证据|Proof)\*\*/im.test(markdown) || /^:::question/m.test(markdown);
    console.error(
      hasPlanFields
        ? "[note] 检测到计划字段但没有任务标题（任务标题要写成 `## T1: 标题`）→ 这一页不会有「计划」面板"
        : "[note] 没有任务结构（`## T1: 标题`）→ 这一页只有批注，没有「计划」面板；若本该是计划，按 easyreview 技能把每段写透再渲染",
    );
  }

  const hash = await compress({ p: markdown, a: [] });
  if (!looksLikeSharePayload(hash)) {
    throw new Error(`载荷形状不对（${hash.length} 字符），页面会拒绝还原`);
  }
  const app = appHtmlText ?? readFileSync(APP_HTML, "utf8");
  const base = basename(md).replace(/\.md$/i, "");
  // A file that already carries the locale in its name (`x.en.md`) must not
  // grow a second suffix.
  const suffix =
    locale === "zh" || base.toLowerCase().endsWith(`.${locale}`) ? "" : `.${locale}`;
  const outPath = join(outDir ?? dirname(md), `${base}${suffix}.review.html`);
  // easyreview fork: never silently replace a page whose reviewer still has
  // unsaved annotations. The page mirrors its draft to the helper
  // (<out>/.easyreview-drafts/<key>.json, keyed by the source path); when that
  // draft holds annotations and the target file already exists, write a NEW file
  // next to it and say so — the old page stays reviewable.
  let finalPath = outPath;
  if (existsSync(finalPath)) {
    const draft = readPortableDraft(join(outDir ?? dirname(md), '.easyreview-drafts'), md);
    if (draft && Array.isArray(draft.annotations) && draft.annotations.length > 0) {
      let n = 2;
      while (existsSync(join(dirname(finalPath), `${base}${suffix}-v${n}.review.html`))) n++;
      finalPath = join(dirname(finalPath), `${base}${suffix}-v${n}.review.html`);
      const when = draft.savedAt ? new Date(draft.savedAt).toLocaleString('zh-CN') : '未知时间';
      console.error(`[guard] 原页有 ${draft.annotations.length} 条未提交批注（保存于 ${when}）→ 不覆盖原页，改存新页：${basename(finalPath)}（原页保留，可继续审/提交）`);
    }
  }
  const paths = emitPaths
    ? { source: md, artifact: finalPath, folder: dirname(finalPath) }
    : {};
  const docHash = createHash("sha256").update(markdown).digest("hex");
  writeFileSync(finalPath, injectHash(app, hash, docTitle(markdown, md), locale, paths, helper, sessionId, docHash, markdown, lite), "utf8");
  return finalPath;
}

const argv = process.argv.slice(process.argv[2] === 'render' ? 3 : 2);
let outDir: string | null = null;
let locale = "zh";
let helper: string | null = null;
let sessionId: string | null = process.env.OPENCODE_SESSION_ID ?? null;
let agent = resolveAgent();
let delivery = "local";
let lite = false;
let helperToken: string | null = null;
let emitPaths = true;
let allowAutoHelper = true;
let requirePlan = false;
const inputs: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (["--out", "--lang", "--helper", "--session", "--agent", "--delivery"].includes(argv[i]) && (!argv[i + 1] || argv[i + 1].startsWith("--"))) {
    throw new Error(`缺少参数值：${argv[i]}`);
  }
  if (argv[i] === "--agent") agent = resolveAgent(argv[++i]);
  else if (argv[i] === "--delivery") delivery = argv[++i];
  else if (argv[i] === "--out") outDir = resolve(argv[++i]);
  else if (argv[i] === "--lang") locale = (argv[++i] ?? "zh").toLowerCase();
  else if (argv[i] === "--helper") helper = argv[++i] ?? null;
  else if (argv[i] === "--session") sessionId = argv[++i] ?? null;
  else if (argv[i] === "--no-session") sessionId = null;
  // Kept as a no-op so a command cached from the short-lived --require-plan
  // build does not break (the skill now drives authoring, not the renderer).
  else if (argv[i] === "--require-plan") continue;
  // No helper in the page at all: the send-back button falls back to "copy".
  else if (argv[i] === "--no-helper") { allowAutoHelper = false; helper = null; }
  // Sharing a page outside the machine that made it: drop the absolute paths
  // so the Options menu's "where is this file" block stays empty.
  else if (argv[i] === "--no-paths") emitPaths = false;
  // ezrl (easyreview lite): the document is meant to be read, not to carry the
  // plan/v1 scaffolding — no missing-structure note, and the page is marked lite.
  else if (argv[i] === "--lite") lite = true;
  else if (argv[i].startsWith("--")) throw new Error(`未知参数：${argv[i]}`);
  else inputs.push(argv[i]);
}
if (!["local", "opencode"].includes(delivery)) throw new Error("--delivery 仅支持 local、opencode");
if (delivery === "opencode" && (agent !== "opencode" || !sessionId)) throw new Error("OpenCode 会话投递需要 --agent opencode 和 --session");
if (helper) {
  const url = new URL(helper);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('--helper 必须是本机 HTTP 助手地址');
}

// ── Local helper (one-click send-back / reveal) ────────────────────────────
// The page's send button only works when the helper URL is baked in at render
// time, and asking every caller to remember `--helper` was a real footgun: a
// page rendered without it silently degrades to "copy feedback". So when no
// explicit --helper is given we look for the helper on the default port and,
// if it is not running, start it detached for this render.
const HELPER_PORT = 7803;
const HELPER_URL = `http://127.0.0.1:${HELPER_PORT}`;

async function helperAlive(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    try {
      const res = await fetch(`${url.replace(/\/+$/, "")}/health`, { signal: controller.signal });
      if (!res.ok) return false;
      const info = await res.json();
      if (info.name !== "easyreview-helper" || info.version !== 1 || typeof info.token !== "string" || (info.delivery ?? "local") !== delivery || (delivery === "opencode" && info.agent !== agent)) return false;
      if (resolve(info.root) !== resolve(helperRoot)) throw new Error("助手服务目录不同，请指定本次输出目录的助手");
      helperToken = info.token;
      return true;
    } finally { clearTimeout(timer); }
  } catch {
    return false;
  }
}

async function startHelper(root: string, port: number): Promise<string | null> {
  const candidates: Array<{ cmd: string; args: string[] }> = [];
  // Unified portable binary: the same executable runs the helper subcommand.
  if (basename(process.execPath).toLowerCase() === 'easyreview.exe') {
    candidates.push({ cmd: process.execPath, args: ['helper', '--root', root, '--port', String(port), '--agent', agent, '--delivery', delivery] });
  }
  // Packaged layout: the helper sits next to this binary.
  const devScript = resolve(import.meta.dir, "..", "serve-review.mjs");
  if (existsSync(devScript)) {
    // The runtime package carries Bun itself, so helpers need no system Node.
    if (['bun.exe', 'bun'].includes(basename(process.execPath).toLowerCase())) {
      candidates.push({ cmd: process.execPath, args: [devScript, "--root", root, "--port", String(port), "--agent", agent, "--delivery", delivery] });
    }
    candidates.push({ cmd: "node", args: [devScript, "--root", root, "--port", String(port), "--agent", agent, "--delivery", delivery] });
  }
  const packaged = join(dirname(process.execPath), "easyreview-helper.exe");
  if (existsSync(packaged)) {
    candidates.push({ cmd: packaged, args: ["--root", root, "--port", String(port), "--agent", agent, "--delivery", delivery] });
  }
  // Dev checkout: repo bin/, else the workspace helper script under node.
  const devExe = resolve(import.meta.dir, "..", "bin", "easyreview-helper.exe");
  if (existsSync(devExe)) {
    candidates.push({ cmd: devExe, args: ["--root", root, "--port", String(port), "--agent", agent, "--delivery", delivery] });
  }
  for (const c of candidates) {
    try {
      const child = spawn(c.cmd, c.args, { detached: true, stdio: "ignore", windowsHide: true });
      await new Promise<void>((done, fail) => { child.once("spawn", done); child.once("error", fail); });
      child.unref();
      return c.cmd;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/** Deterministic helper port for a review directory: same folder -> same URL,
 *  so a re-render never moves the link and a stopped helper can be restarted on
 *  the port the page already carries. */
export function stablePortFor(root: string): number {
  const s = resolve(root).toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 46000 + ((h >>> 0) % 3000);
}

async function freeLoopbackPort(): Promise<number> {
  return await new Promise<number>((done, fail) => {
    const probe = createServer(); probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => { const address = probe.address(); const p = typeof address === 'object' && address ? address.port : 0; probe.close(() => done(p)); });
  });
}

function readPortableDraft(draftsDir: string, pageId: string): { annotations?: unknown[]; savedAt?: number } | null {
  try {
    const key = createHash("sha256").update(String(pageId)).digest("hex").slice(0, 32);
    const file = join(draftsDir, key + ".json");
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8"));
  } catch { return null; }
}

async function resolveHelper(root: string): Promise<string | null> {
  if (!allowAutoHelper || !emitPaths) return null;
  if (helper) {
    if (!(await helperAlive(helper))) throw new Error("指定的助手不可用，或不是兼容的 easyreview 助手");
    return helper;
  }
  const registry = join(root, ".easyreview-helper.json");
  try {
    const previous = JSON.parse(readFileSync(registry, "utf8"));
    const url = new URL(previous.url);
    if (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && !url.username && !url.password && await helperAlive(url.origin)) return url.origin;
  } catch { /* stale registry, start a fresh helper */ }
  if (await helperAlive(HELPER_URL)) return HELPER_URL;
  // easyreview fork: the helper port is DETERMINISTIC for the output directory.
  // A random free port made every review link disposable — the reviewer kept a
  // URL whose helper had died (or a re-render moved it to another port) and the
  // page could never be opened again. Same folder, same port: re-rendering keeps
  // the link, and restarting the helper restores it. Fall back to a free port
  // only when something else already holds the stable one.
  for (const port of [stablePortFor(root), await freeLoopbackPort()]) {
    const url = `http://127.0.0.1:${port}`;
    if (!(await startHelper(root, port))) continue;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await helperAlive(url)) {
        writeFileSync(registry, JSON.stringify({ url, root, delivery }), "utf8");
        console.error(`[helper] ${url}`); return url;
      }
    }
  }
  throw new Error("本机助手启动失败。可用 --no-helper 渲染纯离线页，或手动指定 --helper。");
}

if (inputs.length === 0) {
  console.error(
    "用法：easyreview-render <file.md> [更多.md ...] [--out <目录>] [--lang zh|en] [--helper http://127.0.0.1:7803] [--session ses_xxx] [--lite]",
  );
  process.exit(1);
}
if (!appHtmlText && !existsSync(APP_HTML)) {
  console.error(`找不到构建产物：${APP_HTML}\n先跑 bun run --cwd apps/review build && bun run build:hook`);
  process.exit(1);
}
if (outDir && !isAbsolute(outDir)) outDir = resolve(outDir);
if (outDir) mkdirSync(outDir, { recursive: true });

const helperRoot = outDir ?? dirname(resolve(inputs[0]));
if (!outDir && inputs.some(input => dirname(resolve(input)) !== helperRoot)) throw new Error("多个目录的输入请用 --out 指定共同输出目录");
const activeHelper = await resolveHelper(helperRoot);
if (activeHelper && delivery === "opencode" && !sessionId) {
  console.error(
    "[helper] no session id (OPENCODE_SESSION_ID unset and no --session): feedback will be archived next to the page but not delivered",
  );
}

const results: string[] = [];
for (const input of inputs) {
  try {
    results.push(await renderOne(input, outDir, locale, activeHelper, sessionId, emitPaths, requirePlan));
  } catch (e) {
    console.error(`✗ ${input}: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
for (const path of results) {
  console.log(path);
  if (activeHelper) console.log(`URL: ${activeHelper.replace(/\/$/, '')}/${encodeURIComponent(basename(path))}`);
}
