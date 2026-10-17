# tooling/ — easyreview 的 CLI 与助手源码

便携包 zip 里 `src/` 下的同一批文件（这里方便直接翻）。都是纯文本、可直接复用。

| 文件 | 干什么 |
| --- | --- |
| `easyreview-portable.ts` | 便携包 CLI 入口：`render` / `feedback` / `install` / `serve` / `stop` / `detect` / `--version`。内嵌技能模板（`install` 写进项目的那份）。 |
| `easyreview-render.ts` | 渲染器：Markdown → 单文件审阅页。注入 boot 变量（文档指纹 / 会话 / 助手地址 / 路径 / `--lite` 标记）、启动并复用本机助手、**重渲护栏**（页面有未发回批注时另存 `-v2` 不覆盖）、按目录稳定端口。 |
| `easyreview-boot.ts` | 把 boot 变量安全地写进 HTML（JSON 里转义 `<`、U+2028/29）。 |
| `easyreview-host.ts` | 身份识别（`auto` → codex / opencode / kiro / cursor / manual）。 |
| `serve-review.mjs` | 本机助手（只监听 127.0.0.1）：静态服务页面、`/feedback` 落盘（+ 可选投递回会话）、`/reveal`、`/draft`（草稿镜像，护栏的数据来源）、`/health`、`/shutdown`；token 按目录稳定存在 `.easyreview-helper.token`。 |
| `probe-write.mjs` | 启动器用来探测"这个 bun 能不能写文件"（受限机器自动回退）。 |
| `easyreview-smoke.mjs` | 官方冒烟：五身份渲染 / 反馈落盘与读回 / `/draft` 往返 / 护栏产出 `-v2` / 助手重启后 URL 与 token 稳定 / 安装与幂等。 |

**界面层不是这里**：审阅页是一份预编译的单文件 HTML（内联字体、主题、小墨素材），构建方式见 [`docs/BUILD.md`](../docs/BUILD.md)。界面基于 [plannotator](https://github.com/backnotprop/plannotator) 的修改分支（基线 0.28.3，MIT OR Apache-2.0）——上游源码在上游仓库，本 fork 的改动是水墨主题 + 反馈协议 + 小墨模式，见 `docs/BUILD.md` 与 `THIRD-PARTY-NOTICES.md`。

许可：沿用上游双许可 `LICENSE-MIT` / `LICENSE-APACHE`；内置字体为 SIL OFL（见 `licenses/`）。