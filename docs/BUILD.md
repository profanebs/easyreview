# 构建说明（给想自己编译的人）

本项目的界面层是 [plannotator](https://github.com/backnotprop/plannotator) 的**修改分支**（fork，基线 `0.28.3`，MIT OR Apache-2.0）。改动包括：

- 中文界面 + 中文反馈导出（另一套 `--lang en` 与上游一致）；
- 「计划」面板：任务三态、四问卡（这是啥 / 因为啥 / 会咋坏 / 咋修复 / 证据）、验收逐条可跳转、决策点；
- 右栏「接着咋整」（决策点集中）与「全局反馈」（整体意见 + 一键发回）；
- 字号整体缩放（含浮层坐标校准）；
- 隐藏并移除了用不上的设置面（Vim / 钩子 / 集成四件套）与面板底部的复制分享条；
- 免依赖生成器与打包脚本。

## 二进制怎么来的

```
# 1) 构建界面（改 UI 后要重建两个 app）
bun install
bun run --cwd apps/review build
bun run build:hook

# 2) 免依赖生成器（把界面 HTML 内嵌进二进制：scripts/easyreview-render.ts 用的是
#    Bun 文本导入 `with { type: "text" }`，编译时整页打进 exe）
bun build scripts/easyreview-render.ts --compile --outfile bin/easyreview-render.exe

# 3) 会话模式 CLI 与本机助手
bun build apps/hook/server/index.ts --compile --no-compile-autoload-bunfig --outfile bin/easyreview.exe
bun build serve-review.mjs --compile --outfile bin/easyreview-helper.exe
```

- 三个二进制都是 **Windows x64**（bun 的默认目标）；macOS / Linux 请在对应平台按上面步骤自行编译，或直接用 `bun run easyreview <md>`（需要仓库源码与 Bun）；
- `easyreview-render.exe` 约 127 MB：Bun 运行时 + 内嵌的约 23 MB 单页界面，所以目标机器**不需要** Bun、不需要仓库、不需要联网。

## 生成器做了什么事

`scripts/easyreview-render.ts` 把 Markdown 压成 plannotator 的分享载荷（deflate-raw + base64url），并把「改 `location.hash` 的引导脚本」插在第一个 `<script` 之前——这样同一套界面能脱离服务器以单文件运行。注入点不能锚 `</head>`（打包后的 JS 里也有这个字符串）。

## 许可

沿用上游双许可：`LICENSE-MIT` / `LICENSE-APACHE`。分发二进制时请一并保留这两个文件与上游署名。
