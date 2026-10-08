# 构建说明（1.1.0 便携版）

本项目的界面层是 [plannotator](https://github.com/backnotprop/plannotator) 的**修改分支**（fork，基线 `0.28.3`，MIT OR Apache-2.0）。

## 分发形态（1.1.0 起变化）

不再发布编译好的独立 exe（部分 Windows 机器会用应用控制拦截新编译的 exe），改为**便携包**：

```
easyreview-universal-1.1.0-win-x64/
  bin/        官方 Bun 运行时 + 启动器 easyreview.cmd（选一个能写文件的 bun）
  src/        脚本（render / install / feedback / stop / helper）+ 预编译单文件页面 HTML
  references/ plan/v1 模板、四端接入说明、验证记录
  examples/   示例文档
  adapters/   OpenCode V2 原生插件
  licenses/   上游双许可 + 字体 SIL OFL
  manifest.sha256   逐文件校验值
```

目标机器**不需要**安装 Bun/Node，不需要仓库，不需要联网。

## 怎么用

```powershell
& "<包>\bin\easyreview.cmd" render "<文档.md>" --out "<审阅目录>" --agent codex
& "<包>\bin\easyreview.cmd" install --project "<项目目录>" --agent auto
& "<包>\bin\easyreview.cmd" feedback "<审阅页.review.html>"
& "<包>\bin\easyreview.cmd" stop "<审阅目录>"
```

`--agent` 可为 `auto | codex | opencode | kiro | cursor | dsh`；OpenCode 可加 `--session $env:OPENCODE_SESSION_ID --delivery opencode` 开启一键发回。

## 包是怎么做出来的（维护者）

1. **改界面**（fork 内）：`bun install && bun run --cwd apps/review build && bun run build:hook`；产物 `apps/hook/dist/index.html` 就是单文件页面（含内联字体、主题、小墨素材）。
2. **组装便携包**：把 `scripts/easyreview-*.ts`、`serve-review.mjs`、`probe-write.mjs`、`easyreview-smoke.mjs` 放进 `src/scripts/`，页面放进 `src/apps/hook/dist/`，主题与小墨素材放 `src/theme/`、`src/xiaomo/`，官方 Bun 放 `bin/`。
3. **写校验**：逐文件 SHA256 写进 `manifest.sha256`（排除 manifest 自身）。
4. **冒烟**：`bin/bun.exe src/easyreview-smoke.mjs <包目录>` —— **用能写文件的 bun 当运行器**（见下）。
5. **打包**：压缩整个目录为 `easyreview-universal-<版本>-win-x64.zip`，附同名 `.sha256`。

## 已知环境限制（重要）

- 某些 Windows 机器给**包内 bun** 限制了"写用户目录"（`%TEMP%` 等，表现为 `EPERM`）：`bin/easyreview.cmd` 启动前会用 `src/scripts/probe-write.mjs` 探测，失败就回退到 PATH 上能写的 bun；也可显式指定 `EASYREVIEW_BUN`。启动器还会尝试 `%APPDATA%\npm\node_modules\bun\bin\bun.exe`（npm 装的 bun 的真身，PATH 上的 `bun` 往往只是 `.ps1` 壳）。
- 受限身份会**传给子进程**：包内 bun 拉起的 `opencode` 写不了自己的日志，导致一键发回的发现步骤失败（`service-not-found`）。换用不受限的 bun 即正常。
- OpenCode V2 原生插件已通过宿主夹具验证，**未**在真实登录的 V2 会话中验证。

## 许可

沿用上游双许可：`LICENSE-MIT` / `LICENSE-APACHE`；内置字体为 SIL OFL（见 `licenses/` 与 `THIRD-PARTY-NOTICES.md`）。分发二进制时请一并保留这些文件与上游署名。
