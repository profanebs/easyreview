# 发布版 1.1.0

对外版本号由 1.1.0-local.5 改为 1.1.0（内容相同：local.5 的三处修复 + 小墨动画在“减少动态效果”下的守卫已按产品方要求移除）。以下为构建期验证记录。

# 跨 harness 修复验证 · 1.1.0-local.5

在 local.4 基础上只改三处，界面、主题、反馈协议不变：
1. `bin/easyreview.cmd` 启动前探测包内 bun 能否写文件，不能就改用 PATH 上能写的 bun（`EASYREVIEW_BUN` 可显式指定）。依据：在一台 Windows 机器的 Kiro 会话里，包内 bun 1.3.14 读文件正常，但创建目录、写文件全部 EPERM；PATH 上的 bun 1.4.2 和 node 正常。
2. `resolveAgent` 识别 `KIRO_SESSION_ID`（在真实 Kiro 会话里确认存在）→ kiro。
3. `--agent dsh` 作为合法标签。dsh 没有已确认的环境信号和项目技能目录，所以 auto 不会识别它，`install --agent dsh` 会明确拒绝，不猜路径。
另：包目录改为按脚本位置推出，换 bun 运行时 `install` 才找得到适配器。

冒烟测试（src/easyreview-smoke.mjs，已更新）：codex、opencode、kiro、cursor、dsh 五个身份的渲染、保存、读回，项目安装与重复安装、助手重启，detect 的优先级，dsh 安装被拒，启动脚本自动选 bun，全部通过。冒烟用 EASYREVIEW_BUN 指向 PATH 上的 bun 1.4.2 运行，因为包内 bun 在该机器的 shell 里无法写文件。另用 `easyreview.cmd`（不设 EASYREVIEW_BUN）在 Kiro 会话中渲染 demo：自动回退到可写的 bun，页面标签 kiro、本地保存、经 HTTP 可打开。

未验证 / 未改：
- 真实登录的 OpenCode V2 会话。
- OpenCode V2 插件仍直接调用包内 bun.exe，在包内 bun 不能写的机器上会同样失败，本版没改。
- 没在用户自己的终端里确认包内 bun 是否也会 EPERM，只在 Kiro 命令会话里观察到。
- dsh 的会话信号与技能目录。
- 页面（预编译 HTML）未改动。
# 指定标签验证 · 1.1.0-local.4

本轮使用用户指定的文字及标点，移除 Match existing patterns 内置标签，Looks good 改为“还行嗷！”。主题、字体、布局和小墨设计保持原样。旧中文/英文内置标签可迁移，自定义内容保留，历史批注仍能识别。

本轮 5 项标签回归（19 断言）、UI 类型检查和生产构建通过。最终便携包四端安装、渲染、反馈落盘/读取、重启及 OpenCode V2 编译插件宿主夹具通过。V2 真实登录会话未经验证；默认本地反馈；未更新 GitHub。

以下是上轮验证记录，供追溯：

# 中文文案补齐验证 · 1.1.0-local.3

已确认的主题、字体、布局与小墨设计保持原样。本轮补齐快捷标签、实际批注、内置 AI 指令、标签颜色、设置和操作提示的中文，部分文案用简短东北口吻。自定义标签和指令保留，旧英文批注仍可识别。编辑中文标签保留内部编号。

本轮验证：
- 189 项功能测试（746 个断言）、35 项 DOM 测试（110 个断言）通过，合计 224 项。
- packages/ui TypeScript 检查通过，review/hook 生产构建通过。
- 最终包内 Bun + CLI 实际跑通 Codex、OpenCode、Kiro、Cursor 的渲染、反馈保存和读取，以及四端安装、重复安装和助手重启。
- OpenCode V2 编译插件通过宿主夹具验证，包含实际渲染、反馈读取、原始决策、过期文档拒绝、取消、目录边界和卸载；本机 V1 自动分流通过。未测试真实登录的 V2 会话。
- 浏览器实机确认标签输入框、颜色选项、指令提示和快捷键说明均为中文。截图 translation-labels.png。

既有边界：Windows x64 便携包使用官方 Bun 1.3.14，不依赖全局安装；未修改系统安全策略。反馈默认本地保存，测试记录不表示用户批准。整仓已有类型问题，本轮 UI 类型检查通过，未宣称整仓全部通过。未认证、推送或更新 GitHub。

源码同步到用户明确指定的 Z 盘项目；覆盖前文件备份保存在 D:/work/CodexWorkspace/easyreview-source/artifacts/z-delivery-backup-local3。旧发行包保留。ZIP 带逐文件 SHA256，已校验 CRC 与每个条目哈希。
