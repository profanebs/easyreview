# 四端原生接入

| 客户端 | 本包使用的项目入口 | 用法 |
| --- | --- | --- |
| Codex | .agents/skills/easyreview/SKILL.md | 在对话要求「用 easyreview 审阅」，技能使用 --agent codex |
| OpenCode V2 | .opencode/skills/easyreview/SKILL.md + .opencode/plugins/easyreview/index.js | 加载 @easyreview，使用 easyreview_render / easyreview_feedback；CLI 为后备入口 |
| Cursor | .agents/skills/easyreview/SKILL.md | 要求使用 easyreview 技能，使用 --agent cursor |
| Kiro | .kiro/skills/easyreview/SKILL.md | 默认 agent 自动加载，使用 --agent kiro |

技能入口依据官方说明：[Codex](https://developers.openai.com/codex/skills/)、[OpenCode V2](https://opencode.ai/v2/docs/skills/)、[Cursor](https://cursor.com/docs/skills)、[Kiro](https://kiro.dev/docs/skills/)。V2 插件按 [官方插件 API](https://opencode.ai/v2/docs/build/plugins/) 使用 setup、ctx.tool.transform 和卸载清理，未复用 V1 hooks。

安装器检查 opencode --version：1.x 只安装 OpenCode 技能；2.x 或未发现程序时安装 V2 插件。可用 --opencode-version 1 或 2 指定。V1 使用 CLI 完成相同的渲染与反馈；V2 工具通过便携程序生成相同页面，包含水墨主题和小墨模式。默认反馈由用户保存到本地，再由用户要求客户端读取；不自动给会话发送提示。

本机 OpenCode 为 1.18.33，未更换安装。V2 已做 @opencode/plugin 2.0.14 类型验证、插件注册/卸载、取消信号和实际便携程序夹具验证，尚未登录真实 V2 会话。本包为 Windows x64 程序；路径支持中文与空格，渲染/反馈工具限制在当前项目内。

Kiro 自定义 agent 若显式声明 resources，应在用户指定的 agent 配置中加入 `skill://.kiro/skills/*/SKILL.md`；本安装器保留既有配置，不自动改它。IDE 若未发现技能，可按官方流程导入该项目技能目录。

客户端升级后发现规则可能变化，可直接把项目 tools/easyreview/SKILL.md 指给当前 AI 阅读，渲染和反馈命令仍然有效。此适配不依赖私有会话 API。

项目移动后，入口引用保持项目相对路径。含空格或中文的路径在 PowerShell 中使用 `& "程序路径"`，参数分别加引号。
