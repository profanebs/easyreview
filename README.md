# easyreview v1.0b（公测版）

把 **AI 写好的 Markdown（计划 / 方案 / 报告）** 渲染成一张**可以批注的审阅页**：
选中文字写批注、划掉已审任务、点选决策点、右栏底部写整体意见，最后一键把反馈送回给 AI。

一句话场景：AI 交付一大篇，你不想"看完了只回一句看起来行"——那就让它做成审阅页，你在界面上审，反馈原样回到 AI 手里，它按你的批注精确改。

## 这个包是什么

**一个技能包**：整个 `easyreview` 文件夹就是你那个 AI 的技能目录内容，里面自带工具（免安装、免联网）。

```
easyreview/
├─ SKILL.md              ← 你的 AI 读这个（操作手册：怎么渲染、怎么交付、怎么按反馈改）
├─ bin/
│  ├─ easyreview-render.exe   ← 生成审阅页（核心，零依赖）
│  ├─ easyreview.exe          ← 可选：会话模式（起本地服务 + 打开浏览器 + 决定回到命令行）
│  └─ easyreview-helper.exe   ← 可选：本机助手（"在文件夹中显示" + OpenCode 一键发回）
├─ cmd/                  ← .cmd 包装（给习惯用命令行的人）
├─ references/
│  ├─ plan-v1.md         ← 计划模板（AI 写计划时按这个格式）
│  └─ serve-review.mjs   ← 助手源码（参考，可不理）
├─ examples/demo.md      ← 示例文档，拿来验证
├─ LICENSE-MIT / LICENSE-APACHE
└─ VERSION               ← 1.0b
```

## 装到你的 AI 上

把整个 `easyreview` 文件夹拷进对应目录即可（没有就新建）：

| 你的 AI | 拷到哪 |
| --- | --- |
| OpenCode | `%USERPROFILE%\.config\opencode\skills\easyreview\` |
| Claude Code | `%USERPROFILE%\.claude\skills\easyreview\` |
| Codex | `%USERPROFILE%\.agents\skills\easyreview\` |
| Kiro | `%USERPROFILE%\.kiro\skills\easyreview\` |
| Cursor | 技能目录不适用：把 `cursor/easyreview.mdc` 放进项目的 `.cursor\rules\`（或把 SKILL.md 的内容加到 `AGENTS.md`），并把本包放一个固定路径，告诉它路径 |

装完对 AI 说一句就行：

> 用 easyreview 审一下 `D:\path\plan.md`

它就会：渲染审阅页 → 把路径给你（或直接帮你打开）→ 等你审完把反馈贴回去 → 按你的批注改。

## 手动用（不想装技能也行）

```bat
:: 渲染一张审阅页（输出在 md 旁边，文件名 xxx.review.html）
easyreview\bin\easyreview-render.exe "D:\path\plan.md" --lang zh

:: 对外分享的版本（不在页面里留本机路径）
easyreview\bin\easyreview-render.exe "D:\path\plan.md" --lang zh --no-paths

:: 生成英文版
easyreview\bin\easyreview-render.exe "D:\path\plan.en.md" --lang en
```

产出的是一个**单文件 HTML**（约 22 MB，内含整个审阅界面）：双击用浏览器打开就能批注，不需要服务器、不需要联网。

审完怎么把反馈送回来：

- **OpenCode 一键发回（默认就绪）**：渲染时页面已经自动接好本机助手；点右栏底部「审完了，发回给 AI 开始处理」（两次确认）即可，反馈直接进你当前那个会话；
- **复制粘贴**（任何 AI 都能用）：点「复制反馈」，粘进对话即可；
- 手动起助手（一般不需要，渲染会自动拉起）：`easyreview\cmd\easyreview-serve.cmd "<审阅页所在目录>"`

## 页面上有什么

- **左栏「计划」**：任务列表，每个任务可标「要改 / 放行」（可撤回），正文同步变化；展开看 这是啥 / 因为啥 / 会咋坏 / 咋修复 / 证据，验收逐条可点跳转；
- **正文**：选中文字 → 批注 / 标删 / 快捷标签；点选模式下点元素也能评论；
- **右栏「批注」**：批注列表；顶部「接着咋整」是文档里的决策点（可点选项、可跳转）；底部「全局反馈」是整体意见 + 一键发回；
- **选项菜单**：主题、字号（默认「大」）、文件位置。

## 已知限制（公测版照实说）

1. **自动发回只支持 OpenCode**；Codex / Kiro / Cursor 走「复制粘贴」，效果一样，只多一步手动；
2. 自带二进制是 **Windows x64**；macOS / Linux 目前需要源码方式：clone 仓库后 `bun install && bun run --cwd apps/review build && bun run build:hook`，再用 `bun run easyreview <md>`；
3. 单页 22 MB，第一次打开稍慢（之后就快了）；
4. 批注进度存在浏览器本地（cookie），换机器/换浏览器不会带走；
5. 页面里"打印 / 存为 PDF"用的是浏览器打印对话框，样式以屏幕版为准。

## 版权

本项目是 [plannotator](https://github.com/backnotprop/plannotator)（作者 backnotprop，MIT OR Apache-2.0）的修改版，按原许可分发，见 `LICENSE-MIT`、`LICENSE-APACHE`。修改内容：中文界面与中文反馈导出、计划面板（任务三态 / 四问 / 验收 / 决策点）、全局反馈一键发回、字号整体缩放、免依赖生成器与这些打包脚本。

---

### English (short)

`easyreview` turns a Markdown plan into a single-file, annotatable review page (no server, no install).
Install: copy the `easyreview` folder into your agent's skills directory
(OpenCode `~/.config/opencode/skills/`, Claude Code `~/.claude/skills/`, Codex `~/.agents/skills/`, Kiro `~/.kiro/skills/`; Cursor: use `cursor/easyreview.mdc`).
Then say: *"review `plan.md` with easyreview"*.
Render manually: `easyreview\bin\easyreview-render.exe plan.md --lang en`.
Feedback returns by copy-paste on any agent; the one-click send-back is OpenCode-only.
Binaries are Windows x64; other platforms build from source. Fork of plannotator (MIT OR Apache-2.0).
