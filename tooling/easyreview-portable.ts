import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync, cpSync, statSync } from 'node:fs';
import { resolve, join, dirname, sep, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolveAgent, agents } from './easyreview-host';

export const VERSION = '1.2';
const MANAGED = '<!-- easyreview portable adapter v1 -->';
const inside = (root: string, path: string) => {
  const a = realpathSync(root).toLowerCase();
  const b = realpathSync(path).toLowerCase();
  return b === a || b.startsWith(a + sep);
};

export function readFeedback(input: string) {
  const file = resolve(input);
  const content = readFileSync(file, 'utf8');
  const artifact = file.endsWith('.review.html');
  const hash = artifact ? content.match(/window\.__PN_DOC_HASH__="([a-f0-9]{64})"/)?.[1]
    : createHash('sha256').update(content.replace(/\r\n?/g, '\n')).digest('hex');
  if (!hash) throw new Error('缺少文档指纹，请使用 easyreview 生成的审阅页');
  const dir = join(dirname(file), 'feedback');
  const indexFile = join(dir, `${hash}.latest.json`);
  if (!inside(dirname(file), dir) || !inside(dir, indexFile)) throw new Error('反馈目录或索引越界');
  const index = JSON.parse(readFileSync(indexFile, 'utf8'));
  if (index.docHash !== hash || typeof index.record !== 'string' || !inside(dir, index.record)) throw new Error('反馈索引不匹配');
  const record = JSON.parse(readFileSync(index.record, 'utf8'));
  if (record.schema !== 'easyreview/feedback-v1' || record.docHash !== hash) throw new Error('反馈文档不匹配');
  if (artifact && resolve(record.artifact).toLowerCase() !== file.toLowerCase()) throw new Error('反馈来自另一份审阅页');
  return record;
}

export function detectOpenCodeVersion(): '1' | '2' {
  const result = spawnSync('opencode', ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  return /^1\./.test(result.stdout?.trim() ?? '') ? '1' : '2';
}

export function installAdapters(bundle: string, projectPath: string, requested = 'auto', opencodeVersion = 'auto') {
  const project = realpathSync(resolve(projectPath));
  if (!statSync(project).isDirectory()) throw new Error('--project 必须是项目目录');
  if (!['auto', 'all', ...agents].includes(requested)) throw new Error('不支持的 agent');
  if (!['auto', '1', '2'].includes(opencodeVersion)) throw new Error('--opencode-version: auto | 1 | 2');
  if (requested === 'manual') throw new Error('manual 无需安装技能，直接运行 render');
  if (requested === 'dsh') throw new Error('dsh 的项目技能目录尚未确认，不猜测路径：安装请用 --agent codex（通用 .agents/skills 入口），渲染时再用 --agent dsh');
  let selected = requested === 'all' ? ['codex', 'opencode', 'cursor', 'kiro'] : [requested];
  if (requested === 'auto') {
    selected = ['codex', 'opencode', 'cursor', 'kiro'].filter(host => existsSync(join(project, ({ codex: '.agents', opencode: '.opencode', cursor: '.cursor', kiro: '.kiro' } as Record<string, string>)[host])));
    if (!selected.length) selected = ['codex', 'opencode', 'cursor', 'kiro'];
  }
  const folders = [...new Set(selected.map(host => host === 'kiro' ? '.kiro/skills/easyreview' : host === 'opencode' ? '.opencode/skills/easyreview' : '.agents/skills/easyreview'))];
  const body = (folder: string) => {
    const identity = folder.startsWith('.opencode') ? 'opencode' : folder.startsWith('.kiro') ? 'kiro' : '<当前客户端名：codex 或 cursor；未知时 auto>';
    return `---\nname: easyreview\ndescription: 用本地 easyreview 审阅 Markdown 计划与报告，读取定位批注、任务三态及决策答复继续修改。\n---\n\n${MANAGED}\n\n先读取项目根目录 tools/easyreview/SKILL.md 和 tools/easyreview/references/plan-v1.md。\n在项目根目录执行 tools/easyreview/bin/easyreview.cmd render <文档.md> --out <项目内审阅目录> --agent ${identity} --delivery local。\n程序接口也可直接调用 tools/easyreview/bin/bun.exe，第一参数 tools/easyreview/src/scripts/easyreview-portable.ts，后续参数同上，无需 shell。\n渲染器自动启动本机助手并输出文件路径与本地 URL，打开 URL 供用户审阅。\n用户保存后，执行 tools/easyreview/bin/easyreview.cmd feedback <审阅页.review.html>，核对当前源文档指纹后按反馈修改。\nOpenCode V2 可用 easyreview_render 与 easyreview_feedback 原生工具；工具不可用时执行上述 CLI。\n测试批注不代表用户批准。发布、推送、发消息仍需用户授权。\n`;
  };
  const pluginFolder = '.opencode/plugins/easyreview';
  const resolvedOpenCodeVersion = selected.includes('opencode') ? (opencodeVersion === 'auto' ? detectOpenCodeVersion() : opencodeVersion) : null;
  const nativeV2 = resolvedOpenCodeVersion === '2';
  const pluginSource = join(bundle, 'adapters/opencode-v2/index.js');
  const pluginDestination = join(project, pluginFolder, 'index.js');
  if (nativeV2 && !existsSync(pluginSource)) throw new Error('泛用包缺少 OpenCode V2 适配器，请使用完整解压包');
  // Preflight every destination before writing anything. Preserve user skills.
  for (const folder of [...folders, 'tools/easyreview', ...(nativeV2 ? [pluginFolder] : [])]) {
    let current = project;
    for (const part of folder.split('/')) {
      current = join(current, part);
      if (existsSync(current) && (!inside(project, current) || !statSync(current).isDirectory())) throw new Error(`目录不可安全写入：${current}`);
    }
  }
  for (const folder of folders) {
    const file = join(project, folder, 'SKILL.md');
    if (existsSync(file) && readFileSync(file, 'utf8') !== body(folder)) throw new Error(`保留已有技能，请选择空目录：${file}`);
  }
  if (nativeV2 && existsSync(pluginDestination) && readFileSync(pluginDestination, 'utf8') !== readFileSync(pluginSource, 'utf8')) throw new Error(`保留已有 OpenCode 插件：${pluginDestination}`);
  const target = join(project, 'tools/easyreview');
  if (existsSync(target)) {
    if (!existsSync(join(target, 'VERSION')) || readFileSync(join(target, 'VERSION'), 'utf8').trim() !== VERSION) throw new Error(`保留已有 tools/easyreview；请选择新的安装目录或自行备份：${target}`);
  } else {
    mkdirSync(target, { recursive: true });
    for (const name of ['bin', 'adapters', 'references', 'examples', 'src', 'demo.cmd', 'SKILL.md', 'README.md', 'VERSION', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'licenses', 'manifest.sha256']) {
      const source = join(bundle, name);
      if (existsSync(source)) cpSync(source, join(target, name), { recursive: true, errorOnExist: true, force: false });
    }
  }
  for (const folder of folders) {
    mkdirSync(join(project, folder), { recursive: true });
    writeFileSync(join(project, folder, 'SKILL.md'), body(folder), 'utf8');
  }
  if (nativeV2) {
    mkdirSync(join(project, pluginFolder), { recursive: true });
    cpSync(pluginSource, pluginDestination);
  }
  return { project, installedFor: selected, bundle: target, skills: folders.map(folder => join(project, folder, 'SKILL.md')), opencodeVersion: resolvedOpenCodeVersion, opencodeV2Plugin: nativeV2 ? pluginDestination : null };
}

// The bundle root is derived from where this script lives, not from the runtime's
// location: bin/easyreview.cmd may run it with a different (working) bun.
const defaultBundle = () => basename(process.execPath).toLowerCase() === 'easyreview.exe'
  ? resolve(dirname(process.execPath), '..')
  : resolve(import.meta.dir, '..', '..');

export async function main(argv: string[], bundle = defaultBundle()) {
  const [command, ...args] = argv;
  if (!command || ['help', '--help', '-h'].includes(command)) {
    console.log(`easyreview ${VERSION} (Windows x64, portable)\nrender <file.md> [--out dir] [--agent auto|codex|opencode|kiro|cursor]\nserve <review-dir> [--agent opencode] [--delivery local|opencode]\nfeedback <file.review.html>\ninstall --project <dir> [--agent auto|all|codex|opencode|kiro|cursor] [--opencode-version auto|1|2]\nstop <review-dir>\ndetect\n无需登录；审阅页与反馈留在项目内。`); return;
  }
  if (['--version', 'version'].includes(command)) { console.log(VERSION); return; }
  if (command === 'detect') { console.log(resolveAgent()); return; }
  if (command === 'helper') {
    const { runHelper } = await import('../serve-review.mjs');
    runHelper(args); return;
  }
  if (command === 'stop') {
    if (args.length !== 1) throw new Error('stop <review-dir>');
    const root = realpathSync(resolve(args[0]));
    const registry = JSON.parse(readFileSync(join(root, '.easyreview-helper.json'), 'utf8'));
    const url = new URL(registry.url);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password) throw new Error('助手地址无效');
    const info = await (await fetch(url.origin + '/health', { signal: AbortSignal.timeout(2000) })).json();
    if (info.name !== 'easyreview-helper' || resolve(info.root).toLowerCase() !== root.toLowerCase()) throw new Error('助手不属于该审阅目录');
    const result = await fetch(url.origin + '/shutdown', { method: 'POST', headers: { 'x-easyreview-token': info.token }, signal: AbortSignal.timeout(2000) });
    if (!result.ok) throw new Error('助手停止失败');
    console.log('已停止本目录的 easyreview 助手'); return;
  }
  if (command === 'serve') {
    // Revive (or start) the local helper for a review directory, on the port the
    // page already carries, so a link whose helper died opens again. Without a
    // registry the port is the directory's stable one (same as a render picks).
    const root = realpathSync(resolve(args[0] ?? '.'));
    const arg = (name: string, fallback: string) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1] ?? fallback; };
    const agent = arg('--agent', 'opencode');
    const delivery = arg('--delivery', 'opencode');
    if (!['local', 'opencode'].includes(delivery)) throw new Error('--delivery 仅支持 local、opencode');
    const check = async (url: string) => {
      try { const info = await (await fetch(url + '/health', { signal: AbortSignal.timeout(1500) })).json(); return info.name === 'easyreview-helper'; } catch { return false; }
    };
    let port = Number(arg('--port', '0'));
    if (!port) {
      try { port = Number(new URL(JSON.parse(readFileSync(join(root, '.easyreview-helper.json'), 'utf8')).url).port); } catch { port = 0; }
    }
    if (!port) {
      const { stablePortFor } = await import('./easyreview-render');
      port = stablePortFor(root);
    }
    const url = `http://127.0.0.1:${port}`;
    if (await check(url)) { console.log('URL: ' + url + '/'); return; }
    const helperScript = join(import.meta.dir, '..', 'serve-review.mjs');
    const extra = arg('--service-config', '');
    const child = spawn(process.execPath, [helperScript, '--root', root, '--port', String(port), '--agent', agent, '--delivery', delivery, ...(extra ? ['--service-config', extra] : [])], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await check(url)) {
        writeFileSync(join(root, '.easyreview-helper.json'), JSON.stringify({ url, root, delivery }), 'utf8');
        console.log('URL: ' + url + '/'); return;
      }
    }
    throw new Error('助手启动失败');
  }
  if (command === 'render') {
    const binary = join(bundle, 'bin/easyreview-render.exe');
    if (!existsSync(binary)) { await import('./easyreview-render'); return; }
    const child = spawnSync(binary, args, { stdio: 'inherit', windowsHide: true });
    if (child.error) throw child.error;
    process.exitCode = child.status ?? 1; return;
  }
  if (command === 'feedback') {
    if (args.length !== 1) throw new Error('feedback <file.review.html>');
    console.log(JSON.stringify(readFeedback(args[0]), null, 2)); return;
  }
  if (command === 'install') {
    let project: string | undefined; let agent = 'auto'; let opencodeVersion = 'auto';
    for (let i = 0; i < args.length; i++) {
      if (!['--project', '--agent', '--opencode-version'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('install --project <dir> [--agent auto|all|codex|opencode|kiro|cursor] [--opencode-version auto|1|2]');
      if (args[i] === '--project') project = args[++i]; else if (args[i] === '--agent') agent = args[++i]; else opencodeVersion = args[++i];
    }
    if (!project) throw new Error('请明确指定 --project，不修改用户的全局配置');
    console.log(JSON.stringify(installAdapters(bundle, project, agent, opencodeVersion), null, 2)); return;
  }
  throw new Error(`未知命令：${command}`);
}

if (import.meta.main || (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)) {
  try { await main(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
