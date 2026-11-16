# Agent 零基础首次使用指南

用户只提供仓库链接和 Key，也应完成安装。默认中文，跟随用户语言。用户不需要认识服务名称、选择插件、设置环境变量或运行安装命令。已收到 Key 时直接处理，不重复索取，不强制重新输入。

## 先检查，再复用和合并

先执行 `node <下载目录>/scripts/inspect.mjs`。它只检查已知 Skill 目录和当前账号池，输出安装位置、脱敏账号状态，以及当前环境是否已有 Key，不输出凭证、不联网，也不新建空账号池。WorkBuddy 等使用宿主实际暴露的已安装列表补充检查。

- 已安装且可用：直接复用；无更新需求不重复安装。不同 Agent 的 firepool 默认共用同一用户账号池；尊重已有 FIREPOOL_HOME，不另建第二套。
- 已有 Key：先复用，不要求重新提供；新 Key 仅合并导入，重复项跳过，保留旧账号的标识、优先级、启停和状态，不清空、不替换。
- 当前环境或既有工具已有对应服务的 Key：可在本地进程内读取并通过 setup 合并，不打印；只检查已知配置位置，不全盘搜索秘密、不修改原工具配置。凭证属于其他服务或来源不清楚时不导入。
- 旧池损坏、安装目录有自定义修改或不同来源同名 Skill：保留原内容，说明具体冲突；不能删除重装或覆盖来继续。

日常只需两种动作：“直接使用”和“查一下 Key 情况”。查情况默认执行 `list`；用户明确查最新余额时才执行 `refresh`，再 `list`，向用户汇总数量、余额、停用/失效/冷却情况，不显示 Key。不要为普通查询重新跑 setup 或全池安装验证。

## 安装与平台适配

1. 获取完整仓库，读取 SKILL.md。优先使用当前宿主的安装器；没有安装器则下载仓库/发布包到临时目录，由 Agent 完成安装。不要只下载 SKILL.md。
2. 检查 Node.js 22+。缺少时通过本机版本管理器或可信官方发行版准备当前用户可用的运行时和 npm；只在实际权限或宿主能力不足时请求最小协助。不修改 VPN、代理、DNS 或全局网络设置。
3. 用平台原生安装机制，或执行下面的安装脚本。已有同源 Git 克隆可在无本地修改时 fast-forward；安装脚本遇到不同内容会保留原目录并报冲突，不覆盖用户修改。当前会话直接读取新 Skill 执行，只在宿主确实需要时提示重新加载。

| 宿主 | Agent 的安装动作 |
| --- | --- |
| Codex | `node <下载目录>/scripts/install.mjs --agent codex`，尊重 CODEX_HOME |
| Claude Code | `node <下载目录>/scripts/install.mjs --agent claude`，安装到用户 Skill 目录 |
| WorkBuddy | 优先使用客户端已暴露的技能导入工具；若已发现实际 Skill 目录，执行 `install.mjs --agent workbuddy --target <实际目录>/firepool`。不要凭空猜目录。客户端仅支持上传时，下载发布页 firepool.zip，代为导入；不能操作界面则只请用户完成“上传此包”这一步 |
| 其他 Agent / Claude Cowork | 使用宿主声明的 Skill 目录或包导入机制；可用 `install.mjs --target <实际目录>/firepool`，不能将 Claude Code 本机目录误当成云端/Cowork 的目录 |

只在当前宿主安装，不顺带改其他 Agent 的配置。路径由 Agent 发现，不让零基础用户选择目录。宿主无执行能力时，不声称可以执行本地脚本；提供适用的包导入下一步。

## 两种 Key 输入方式，都支持

**用户直接粘贴 Key：** 接受这种做法。提取用户明确提供的 Key，经执行工具的 stdin 通道传入下列命令。不要回显、写进命令文本、源码或仓库，也不要要求用户撤回、改格式或转用输入框。仅格式确实有歧义时问最小问题。多个 Key 使用每行一个，或 JSON 数组；用户已有文件则用 --file。

```text
node <安装目录>/scripts/firepool.mjs setup --stdin
```

setup 在本机导入并去重、自动准备固定版本的官方 CLI、检查余额，只输出脱敏摘要。Key 已在池中时，`setup` 不加输入参数即可复查。不要让用户选择 SDK、MCP 或插件；无相关插件也能使用默认本地调用路径。准备工具只安装到用户数据目录，不全局安装、不持久化登录、不改变其他工具配置。

**用户没提供 Key、偏好不进对话，或宿主阻止处理聊天里的凭证：** 启动本机输入页并打开浏览器，让用户粘贴：

```text
node <安装目录>/scripts/configure.mjs --open
```

向用户说“在打开的本机页面粘贴 Key，保存后我继续”。不要读取输入框内容、截取凭证或把表单内容交回 Agent。服务仅监听 127.0.0.1，10 分钟过期，结果只返回账号数量和验证状态。不要承诺聊天中已出现的 Key 可以从宿主记录中消失；本地凭证文件未额外加密，只按当前用户权限保护。

### 宿主限制时的下一步

按实际卡点继续，不能将“Key 是明文”作为笼统拒绝安装 Skill 的理由，也不绕过宿主的明确权限或安全策略。

- 能安装但不允许 Agent 处理 Key：先完成不含凭证的安装和 `prepare`，再打开本机输入页。
- 能执行但没有浏览器控制：把脚本返回的本机页面链接给用户，用户点开输入，Agent 等待 configuration_result。
- 不允许启动本机服务：让用户在本机终端执行上面的 configure 命令（命令不含 Key），输入完后再继续；不能假装服务已启动。
- 不允许任何脚本：只提供客户端能导入的发布包，明确还需要一次本机可执行环境；不要求用户将 Key 再发一次。
- 依赖下载或网络不可用：保留已经导入的账号，报告未完成的具体步骤；恢复后重新 setup。禁止修改用户的系统网络配置来解决。

## 使用与验收

默认调用官方 CLI 的本地适配器，不需要用户安装插件。由 Agent 将下列 JSON 经 stdin 传给 `node <安装目录>/scripts/firepool.mjs run --stdin`：

```json
{"command":"scrape","args":["https://example.com","--json"]}
```

适配器在本地领取 Key，仅注入子进程环境，成功后自动完成回执；给 Agent 返回内容和脱敏状态。支持 scrape、search、map；先用官方工具对应子命令的 --help 确认参数。不要为了验收发起付费抓取，没有任务时只准备工具和验证余额。有任务时直接完成。

失败返回脱敏输出、round 和 id。仅确认是账号认证/额度/限流错误时，可向 run 提交同一请求并附上 round、id、outcome（invalid/exhausted/rate_limit）和可选 retryAfter，脚本选下一账号并执行。目标错误不轮换；未知错误、超时和可能已创建的付费任务不自动重提，按接入协议关闭或诊断回执。已有外部工具且已验证支持动态 Key 时仍可沿用 acquire → 工具 → report。

只有 setup 返回 ok:true，才说“firepool 已就绪，已验证 N 个可用账号，直接告诉我需要处理的网页或任务即可”。工具安装失败、无效 Key、余额未知或全部耗尽时分别说明具体状态和下一步；不将已导入误称为已可用。若有你无法执行的客户端确认，只请用户完成那一步，不交还整套安装教程。

[详细接入协议](protocol.md) · [官方 CLI](https://github.com/firecrawl/cli) · [Claude Code Skill 机制](https://code.claude.com/docs/en/skills) · [WorkBuddy 技能导入](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market)

## English routing

Agents should follow the Chinese workflow above in the user's language. Accept directly pasted keys without forcing re-entry; `setup --stdin` imports, provisions the private official CLI and verifies balances. A localhost-only optional configuration page keeps new keys out of chat. Never bypass host policy: install credential-free components first and provide only the specific remaining local/import action. Codex and Claude Code have explicit installer targets; WorkBuddy and other hosts use their actual exposed directory/import mechanism, not a guessed folder. Use `run --stdin` for a private local key handoff; report readiness only after verification.
