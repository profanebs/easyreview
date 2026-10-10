# easyreview 快速上手（给下载的人）

把 AI 写好的 Markdown（计划 / 方案 / 报告）变成一张**能批注的单文件审阅页**：选中文字写批注、左栏给任务划结论、右栏回答决策问题和写整体意见，一键把反馈送回给 AI。

## 1. 解开就能用

解压 `easyreview-universal-1.1.1-win-x64.zip` 到任意目录（路径可以带中文和空格）。**不需要**安装 Bun / Node，不需要联网。

想先看一眼效果：双击 `demo.cmd`，终端会打印一个本机网址，复制到浏览器打开（示例文档的审阅页）。

## 2. 接到你的 AI 上（推荐：装进项目）

```powershell
& "<解压目录>\bin\easyreview.cmd" install --project "<你的项目目录>" --agent auto
```

- `auto` 会看项目里已有的客户端目录；没有就装四端入口：Codex / Cursor → `.agents/skills/easyreview`，OpenCode → `.opencode/skills/easyreview`（V2 另有原生插件 `.opencode/plugins/easyreview/`），Kiro → `.kiro/skills/easyreview`。
- 只写这个项目，**不动你的全局配置**；程序放在 `<项目>\tools\easyreview`，可以随项目一起搬走。
- 想显式装全部：`--agent all`；只装一个：`--agent codex|opencode|kiro|cursor`。

## 3. 让 AI 渲染一页（两种唤起方式）

**① 全局技能**：对 AI 说「**用 easyreview 审 `<你的文档>.md`**」。

**② 命令手动唤起**（支持 `/` 命令的客户端，如 OpenCode）：`/easyreview`
- `/easyreview <文件.md>` → 审指定文件；
- **把文件拖进对话 / 当附件**，配一句 `/easyreview` → 审你添加的那份；
- 只发 `/easyreview` → 审本会话上一个交付审阅的 md（找不到会问你）。

命令行直接跑也行：

```powershell
& "<解压目录>\bin\easyreview.cmd" render "<文档.md>" --out "<审阅目录>" --agent codex
```

会打印 HTML 路径和一个本机 `URL:`。**打开那个 URL 审**（反馈要存回本地靠这个本机助手）；直接双击 HTML 只能离线看。

## 4. 审完把反馈交回去（两种方式）

审阅页右栏底部「全局反馈」区有**两个按钮**，给的是同一份内容（定位批注 + 任务结论 + 决策回答 + 整体反馈）：

**① 一键发回**（推荐）
1. 点「**审完了，发回给 AI 开始处理**」（本地保存模式显示「保存给 …」）→ 再点一次确认；
2. 回到对话说：**「读取 easyreview 反馈」**，AI 执行：

```powershell
& "<解压目录>\bin\easyreview.cmd" feedback "<审阅页.review.html>"
```

**② 复制反馈**（换会话 / 换 AI / 发给别人）
- 点「**复制反馈（给对话或别人）**」→ 粘贴到任意对话，或直接发给同事。

- 反馈按文档 SHA256 归档，不会串文档；默认只存本地，不自动唤醒会话。
- OpenCode 用户可以开"一键发回"：渲染时加 `--session $env:OPENCODE_SESSION_ID --delivery opencode`，页面按钮会把反馈直接送进当前会话。

## 5. 审阅页打不开 / 助手没在跑？

「一键发回」依赖一个**本机助手**（只监听 127.0.0.1）。它可能因为重启、关机或被清理而消失，这时那个 `http://127.0.0.1:…` 链接就会显示「无法访问 URL」。

- **只想看文档**：直接**双击那份 `.review.html`**——离线也能看（正文就烘在页面里）。反馈用「复制反馈（给对话或别人）」交给 AI 或别人。
- **想把「一键发回」救回来**：让 AI 跑
  ```powershell
  & "<解压目录>\bin\easyreview.cmd" serve "<审阅目录>"
  ```
  它会在**这页原本的端口**上把助手拉起来（URL 不变），刷新页面即可。
- 端口**按目录固定**：同一个审阅目录永远同一个端口，重渲或复活都不会换链接。

## 6. 常见问题

- **打开是空白 / 一直转圈**：单页约 31 MB（字体和素材内嵌），第一次打开慢几秒；确认你打开的是终端打印的 `URL:`，不是双击 HTML 文件。
- **报 `no usable bun found`**：这台机器限制了包内 bun 写文件。装一个 bun（`npm i -g bun`）再跑，或设 `EASYREVIEW_BUN` 指向可用的 `bun.exe`。
- **反馈按钮点不动 / 提示"还没审任何东西"**：先写一条批注，或在右栏「全局反馈」里写一句，按钮才会亮。
- **想发给别人看**：用 `--no-paths` 渲染（去掉本机路径并关掉助手），把生成的 `.review.html` 单独发过去，对方双击就能看。
- **平台**：只保证 Windows x64；其它平台按 `docs/BUILD.md` 自行组装。
- **反馈存在哪**：审阅目录下的 `feedback\`（`latest.md` 是最近一次，`*.json` 是结构化记录）。
