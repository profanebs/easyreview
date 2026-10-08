# easyreview

**下载**：最新版见 [Releases](https://github.com/profanebs/easyreview/releases/latest) —— 附件 `easyreview-universal-1.1.1-win-x64.zip`（约 57 MB，自带 Bun 运行时，目标机器无需安装 Bun / Node，无需联网）。包内 `manifest.sha256` 可逐文件核对。

> 本仓库只放文档、技能与接入说明；**可运行的便携包在 Release 附件里**。构建方式见 `docs/BUILD.md`。

---

# easyreview 宣纸 · 水墨泛用版

Windows x64 本地便携启动包，版本 1.1.1。本轮保留已确认的设计，标签采用用户指定的东北话原句；工具条 👍 为“还行嗷！”，移除 Match existing patterns 默认标签。保留 easyreview 原来的三栏、工具条、任务三态、四问卡、批注、问答、导入/导出、打印和字号。浅色保留暖宣纸；深色重做为炭墨底与米灰文字，增加纸纤维、墨晕与标题笔触。宋体随页面内置，按钮仍用黑体，代码仍用等宽字体。

已同步最新小墨：顶部「墨」开关、坐姿、跑动与挂边动画，首次默认开启，记住用户的关闭选择。最新批注或回复挂一只小墨；开关不重置批注编辑框。动画只受「墨」开关控制（本版已移除“减少动态效果”下的停用守卫）。

## 开始使用

完整解压，可先双击 `demo.cmd`，在终端输出的本地 URL 打开示例；已附带 Bun 1.3.14 运行时，不用安装 Node、Bun 或登录 GitHub。

```powershell
& "<解压目录>/bin/easyreview.cmd" render "<文档.md>" --out "<审阅目录>" --agent codex
```

`--agent` 可以是 codex、opencode、kiro、cursor、dsh、auto。auto 优先采用 EASYREVIEW_AGENT、OpenCode、Codex 或 Kiro 会话的身份（dsh 暂无已确认的环境信号，用 --agent dsh 或 EASYREVIEW_AGENT=dsh 指定）；不确定时显示 AI。原生技能会按当前客户端显式选择身份，避免猜错。

输出为独立 `.review.html` 与本机 HTTP URL。URL 对应的助手只监听 127.0.0.1，自动选空闲端口；同目录可复用，不和另一项目抢端口。双击 HTML 也可离线阅读；需要保存反馈时使用输出的 HTTP URL。

## 接入 AI 客户端

```powershell
& "<解压目录>/bin/easyreview.cmd" install --project "<项目目录>" --agent auto
```

auto 检测该项目现有客户端目录；没有标记则安装四端入口。想明确启用全部时用 `--agent all`，也可只选某一个客户端。安装只写该项目：程序在 `tools/easyreview`，Codex/Cursor 技能在 `.agents/skills/easyreview`，OpenCode 在 `.opencode/skills/easyreview`，Kiro 在 `.kiro/skills/easyreview`。不修改全局设置，保留已有同名用户技能或插件。

OpenCode 接入按 V2 的原生插件 API 实现，提供 `easyreview_render` 和 `easyreview_feedback`，插件放在 `.opencode/plugins/easyreview/index.js`。安装器只运行 `opencode --version` 检查版本；检测到 1.x 时仅安装技能，避免旧版加载 V2 插件；未检测到程序时按 V2 安装。明确面向 V2 项目时：

```powershell
& "<解压目录>/bin/easyreview.cmd" install --project "<项目目录>" --agent opencode --opencode-version 2
```

`--opencode-version 1` 强制只装技能。插件使用同一个便携程序和同一套水墨/小墨页面，核对源文档指纹后返回用户保存的反馈。升级到 V2 后，在未安装 V2 插件的同版本项目中再次运行上述命令即可补装。

整个项目可一起移动。包单独移动后请重新为新项目安装；更新版本前保留已有 tools/easyreview，自行备份或使用新项目副本。Kiro 自定义 agent 的技能加载方式见 `references/host-adapters.md`。

## 审阅与回流

1. 选文字或使用点选模式写定位批注；左栏「计划」给任务划结论；右栏回答决策问题和写整体意见。
2. 点右下角「保存给当前客户端」，确认保存。
3. 回到当前对话说「读取 easyreview 反馈」。客户端执行：

```powershell
& "./tools/easyreview/bin/easyreview.cmd" feedback "<审阅页.review.html>"
```

反馈同时存为 Markdown 与结构化 JSON，保留定位、任务三态和原始问答。每份文档按 SHA256 找自己的反馈，不能用别份文档的 latest.md。AI 在修改前还需核对当前源文档 SHA256，避免拿旧批准处理新版本。

默认本地保存不会自动唤醒或向客户端发消息。V2 原生工具读取本地反馈，不依赖服务凭据。旧版服务投递入口保留为显式选项：`--agent opencode --session ses_xxx --delivery opencode`；真实服务鉴权与投递未验证，只有获得用户的配置访问与会话投递授权后使用。

完成审阅后停止该目录助手：

```powershell
& "<解压目录>/bin/easyreview.cmd" stop "<审阅目录>"
```

助手重启会更换 token；重新渲染后打开新 URL。旧页可复制反馈。草稿保存在浏览器当前端口下，换浏览器/端口不会自动迁移；已保存反馈在项目目录内继续有效。

`--no-helper` 生成纯离线页；`--no-paths` 去掉本机绝对路径并关闭助手，适合对外分享副本。`--lang en` 英文界面。包仅保证 Windows x64 本地程序；四端接入的是项目技能与同一反馈协议，不代表所有客户端版本的真实会话均已实测。

## 来源和验证

基于 profanebs/easyreview 本地源码，已合入 Z 盘最新 cf08028（包含此前未提交的小墨改动）；同步清单见 references/latest-source-sync.json。原始 Plannotator 采用 MIT OR Apache-2.0，字体采用 SIL OFL。此版本只在本地交付，未认证或更新 GitHub。

测试、浏览器验证和限制见 references/validation.md；文件校验值见 manifest.sha256。

本机 Windows 应用程序控制阻止了新编译的独立 easyreview.exe，发布包因此使用附带的 Bun 运行时 + easyreview.cmd 启动。未修改系统策略；程序接口可直接执行 bin/bun.exe src/scripts/easyreview-portable.ts，后接 render / install / feedback 参数，不需要 shell。被阻止的独立 EXE 不在发布包中。
