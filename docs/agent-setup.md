# 首次接入：检查 → 复用或合并 → 验证 → 使用

这是面向 Agent 的执行说明。用户不需要认识底层服务、安装插件或操作终端。firepool 当前管理 Firecrawl 的网页搜索与采集凭证；不能把其他 API 平台的 Key 当成可互换账号。来源有歧义时只确认 Key 对应的服务，不索取密码、邮箱或注册资料。

## 1. 检查已有安装和账号

获取完整仓库或发布包，读取 SKILL.md；包内必须包含 lib、scripts 和 docs。先确认 Node.js 22+ 和 npm 可执行；缺少时由 Agent 用本机版本管理器或官方发行版准备当前用户的运行时。不修改系统网络设置。

执行 `node <下载目录>/scripts/inspect.mjs`，同时参考宿主实际的已安装技能列表。脚本仅检查已知目录和当前池，返回安装位置、脱敏账号、汇总、环境中是否有对应 Key，不联网、不创建空池，也不输出凭证。

- 已安装且可用就复用。重复收到链接不代表需要重装或升级。
- 已有账号先复用；新 Key 合并去重，保留原标识、优先级、启停、故障状态和已有工具配置。不同本机 Agent 默认共享同一用户池；尊重已有 FIREPOOL_HOME。
- 环境已有对应 Key，可运行 `setup --environment` 在本地直接合并，无需读取或回显 Key。
- 其他旧配置只检查已知服务工具的实际配置位置，确认凭证属于同一服务后在本地合并。保留原文件，不全盘搜索秘密、不改固定凭据插件。
- 旧数据损坏或存在本地定制时，按维护文档保留现场并恢复，不能清空后冒充迁移成功。

## 2. 安装当前宿主的 Skill

优先使用宿主原生安装机制，否则由 Agent 执行：

| 宿主 | 安装动作 |
| --- | --- |
| Codex | `node <下载目录>/scripts/install.mjs --agent codex`，尊重 CODEX_HOME |
| Claude Code | `node <下载目录>/scripts/install.mjs --agent claude` |
| WorkBuddy | 使用客户端技能导入工具；发现实际 Skill 目录时用 `install.mjs --target <实际目录>/firepool`；仅支持上传时下载最新发布的 firepool.zip 并代为导入 |
| 其他 Agent / Claude Cowork | 使用宿主实际声明的目录或导入机制，目录安装可用 `install.mjs --target <实际目录>/firepool` |

安装器会复用相同文件，只升级通过旧安装清单校验的版本；有自定义修改或未知文件则保留并报冲突。Git 克隆按维护文档更新。只安装当前宿主，当前会话可直接读取 Skill；客户端确需重新加载时才提示。

WorkBuddy 自定义包导入、宿主授权或环境准备若必须由用户点击，只交付那个具体动作及已准备好的包。没有本地脚本执行能力的宿主不能直接运行此 Skill，不声称所有聊天客户端都支持。

## 3. 合并 Key 并准备使用

已收到 Key 时，提取用户明确提供的值，经执行工具 stdin 传入：

```text
node <安装目录>/scripts/firepool.mjs setup --stdin
```

输入为每行一个 Key 或 JSON 数组，已有文件可用 `setup --file PATH`。直接粘贴是正常路径，不要求用户撤回或换输入框。不要把凭证拼入命令参数、源码、Shell 历史或诊断日志。

已有池不需要新 Key：执行 `setup`。当前环境已有 Key：执行 `setup --environment`。setup 统一管理旧池与新账号，复用 15 分钟余额缓存及冷却状态，仅按需验证；准备用户数据目录内的官方 CLI，不全局安装、不持久化登录。用户只查状态时用 list，不跑 setup。

没有任何 Key：告知“Skill 已安装，把你的网页采集 Key 发给我即可”，不用先安装额外工具、打开输入页或要求用户理解插件。

用户偏好不发到对话，或宿主明确限制处理聊天凭证时，才用可选的本机输入页：

```text
node <安装目录>/scripts/configure.mjs --open
```

只向用户提供本机页面，不读取输入框、截图或转发凭证。页面仅监听 127.0.0.1，10 分钟过期，结果仅含脱敏信息。无法代开浏览器时把返回链接给用户。firepool 本地文件采用用户权限保护、未额外加密；已发进聊天的内容仍受宿主记录策略约束。

## 4. 返回结果并继续任务

根据 setup 的全池汇总简短回复，例如：“新增 2 个，重复 1 个；当前共 4 个可用。现在可以直接告诉我需要处理的网页。”有输入时 submission 是本次提交账号的独立结果（含重复 Key），issues 仅列未就绪的脱敏账号标识和状态。依据该字段说明本次验证问题，不把旧池可用说成所有新 Key 验证成功。

只有 toolReady 且 available > 0 才报告已就绪。没任务时不发起付费抓取；已有任务则通过 run --stdin 继续，无需让用户重复任务。命令格式见 SKILL.md。

| 未完成原因 | Agent 下一步 |
| --- | --- |
| 工具下载或验证失败 | Key 已保留，网络恢复后 prepare，再 setup，不重索取 Key |
| 余额未知 / 缓存过期 | 说明查询未完成；用户要最新时 refresh，再 list；不当作额度为零 |
| 账号冷却 | 给出 retryNotBefore 的本地时间，停止立即重试 |
| 无效或额度耗尽 | 分别解释需替换凭证或补充额度；有其他可用账号继续使用 |
| 宿主不准处理聊天 Key | 先安装无凭证部分，再提供本机输入页 |
| 宿主不能启动本机页面 | 若用户愿意，在用户终端执行不含 Key 的 configure 命令；不能运行任何脚本则说明需要本地执行能力 |

这不是绕过宿主权限的工具。只在实际卡点请求最小协助，保留已有数据和完成进度；不要交还一套安装教程。

平台依据：[Claude Code Skills](https://code.claude.com/docs/en/skills) · [WorkBuddy 技能导入](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market) · [官方调用工具](https://github.com/firecrawl/cli)。
