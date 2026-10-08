// apps/opencode-plugin/easyreview-v2.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
var execute = promisify(execFile);
var defaultRun = async (binary, args, cwd, signal) => {
  const result = await execute(binary, args, { cwd, signal, windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" });
  return result.stdout;
};
function projectPath(project, input) {
  const root = realpathSync(project);
  const target = resolve(root, input);
  const contained = (path) => {
    const a = root.toLowerCase(), b = path.toLowerCase();
    return b === a || b.startsWith(a + sep);
  };
  if (!contained(target))
    throw new Error("easyreview 文件与输出必须在当前项目内");
  let ancestor = target;
  while (!existsSync(ancestor))
    ancestor = dirname(ancestor);
  if (!contained(realpathSync(ancestor)))
    throw new Error("easyreview 路径越过项目边界");
  return target;
}
function createEasyreviewV2Plugin(run = defaultRun) {
  return {
    id: "easyreview",
    async setup(ctx) {
      const project = realpathSync(ctx.location.directory);
      const runtime = projectPath(project, "tools/easyreview/bin/bun.exe");
      const binary = existsSync(runtime) ? runtime : projectPath(project, "tools/easyreview/bin/easyreview.exe");
      const prefix = existsSync(runtime) ? [projectPath(project, "tools/easyreview/src/scripts/easyreview-portable.ts")] : [];
      const registration = await ctx.tool.transform((editor) => {
        editor.add({
          name: "easyreview_render",
          description: "Render a project Markdown plan in easyreview for human review. Returns a local URL; no review decision is inferred.",
          input: { type: "object", properties: { file: { type: "string" }, out: { type: "string" } }, required: ["file"], additionalProperties: false },
          options: { permission: "execute" },
          async execute(input, context) {
            const request = input;
            const file = projectPath(project, request.file);
            if (!file.toLowerCase().endsWith(".md"))
              throw new Error("easyreview_render 需要 Markdown 文件");
            const out = projectPath(project, request.out ?? "reviews/easyreview");
            const content = await run(binary, [...prefix, "render", file, "--out", out, "--agent", "opencode", "--delivery", "local"], project, context.signal);
            return { content: content + `
等待用户保存；用户要求继续时使用 easyreview_feedback 读取。` };
          }
        });
        editor.add({
          name: "easyreview_feedback",
          description: "Read the human-saved feedback for a project review page and verify the current Markdown fingerprint. Use only after the human requests continuation.",
          input: { type: "object", properties: { file: { type: "string" } }, required: ["file"], additionalProperties: false },
          options: { permission: "execute" },
          async execute(input, context) {
            const file = projectPath(project, input.file);
            if (!file.toLowerCase().endsWith(".review.html"))
              throw new Error("easyreview_feedback 需要审阅页路径");
            const record = JSON.parse(await run(binary, [...prefix, "feedback", file], project, context.signal));
            if (typeof record.source !== "string" || !/^[a-f0-9]{64}$/.test(record.docHash ?? ""))
              throw new Error("反馈缺少源文档或指纹，请重新审阅");
            const source = projectPath(project, record.source);
            const currentHash = createHash("sha256").update(readFileSync(source, "utf8").replace(/\r\n?/g, `
`)).digest("hex");
            if (record.docHash !== currentHash)
              throw new Error("源文档已变化：旧反馈不能批准当前版本，请重新生成审阅页");
            return { content: JSON.stringify(record, null, 2) };
          }
        });
      });
      return () => registration.dispose();
    }
  };
}
var easyreview_v2_default = createEasyreviewV2Plugin();
export {
  projectPath,
  easyreview_v2_default as default,
  createEasyreviewV2Plugin
};
