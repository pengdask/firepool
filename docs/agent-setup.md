# Agent 安装与首次使用指南 / Agent onboarding

这是给 Agent 执行的流程，不是让用户手动照做的教程。默认中文，跟随用户语言。用户提供仓库地址并要求安装，即接手完成以下工作；已提供 Key 时直接配置，不再问一次。仅在缺少信息、权限或运行能力时说明具体阻碍，并只请求解决该阻碍所需的输入。

This is an executable onboarding guide for agents, not a manual checklist to hand back to the user. Handle installation and configuration yourself. Follow the user's language; use Chinese by default. Process supplied keys immediately. Ask only for missing inputs or an actual permissions/runtime blocker.

## 1. 安装到当前 Agent / Install for the current agent

- 先发现当前平台的 Skill 安装机制和目录；可用内置 Skill 安装器时优先使用，将完整仓库安装为 firepool。Codex 使用 `$CODEX_HOME/skills/firepool`，未设置时使用 `~/.codex/skills/firepool`。其他平台遵循其自己的机制，不照搬 Codex 路径。
- 无安装器时，用 Git 将 `https://github.com/pengdask/firepool.git` 克隆到发现的 Skill 目录。无 Git 时使用宿主的下载/解压能力获取 GitHub 仓库归档，安装完整目录，确保 SKILL.md、scripts/ 和 lib/ 同级可用。
- 已安装则检查来源和本地修改：干净的同源 Git 克隆可 fast-forward 更新；有本地修改或目录来源不同则保留原内容，说明冲突后再处理，禁止覆盖。
- 检查 Node.js 版本，要求 22+；本项目无运行时第三方依赖，无需 npm install、全局 npm 包或常驻服务。缺少 Node 时优先复用本机可用版本管理器，在当前用户范围安装受支持版本。若宿主没有执行能力、安装机制或必需权限，只解释实际阻碍，不声称已完成。
- 执行 `node <skill-directory>/scripts/firepool.mjs --help` 验证。当前会话可直接读取 SKILL.md 并运行脚本，不要求用户为了首次配置重启；只有宿主确实需重新加载 Skill 时，最后简短告知。

Discover this agent platform's Skill installation mechanism first; prefer its installer. Otherwise clone the full repository into its Skill directory (Codex uses `$CODEX_HOME/skills`, falling back to `~/.codex/skills`). A host archive downloader can substitute for Git. Preserve existing installations with local changes or a different origin. Require Node 22+, reuse a user-level version manager if needed. No runtime packages, npm install or daemon are needed. Verify `--help`, then load SKILL.md directly for the current session. Report only concrete execution/permission blockers.

## 2. 接收并导入 Key / Receive and import keys

无账号也未收到 Key 时，只需对用户说：“把你要加入账号池的 Firecrawl API Key 发给我，多个可以一起提供；也可以给我本机 Key 文件路径。”已有 Key 或已有账号则继续，不再次索取。用户直接交给 Agent 的 Key 可处理，但不回显，不写入项目文件或临时命令脚本。

使用执行工具的 stdin 通道或可信进程内存传入 `add` / `import --stdin`，不要把真实值插入 Shell 命令字符串、参数或日志。批量 stdin 接受每行一个 Key，也接受 JSON 数组或 `{accounts:[...]}`；文件导入使用 `import --file PATH`。默认自动生成非敏感标识、优先级为 100；除非用户提出优先顺序，不让用户填写这些字段。导入回包只含数量，不含 Key。

Ask for missing Firecrawl keys once (one or several, or a local file path). Use keys already supplied. Pass them through the execution tool's stdin channel or trusted process memory to add/import; never interpolate secrets into shell text, argv, source files or logs. `import --stdin` accepts newline-separated keys, a JSON array or an accounts object. Default generated IDs and priority 100 need no user decisions. Import output is redacted.

示例只表示命令结构，stdin 由工具传入，不把凭证写进命令：

```text
node <skill-directory>/scripts/firepool.mjs import --stdin
node <skill-directory>/scripts/firepool.mjs list
node <skill-directory>/scripts/firepool.mjs refresh --id <新账号标识>
```

## 3. 验证并接入 / Verify and connect

- 导入后 list 获取脱敏标识，再对新导入账号执行 refresh 验证官方余额接口。认证失效或额度耗尽时，按协议反馈和引导修复；查询失败要说“余额暂未确认”，不能当作验证成功或零余额。
- 检查用户已有 Firecrawl 工具。支持每次传 Key 的工具，按 SKILL.md 的 acquire → 外部工具 → report 流程接入；切换、冷却、优先级由脚本决定。
- 固定凭据工具不能直接自动切换。优先检查已有 Firecrawl SDK/API 调用方式是否能动态传 Key；不要擅自覆盖共享工具的固定凭据。确实没有可接入工具时，明确“账号池已配置，还需要接入 Firecrawl 工具”，引导用户选择或授权安装该工具后继续，不把问题留给用户自行研究。firepool 本身不新增抓取能力。
- 不为了测试提交额外的付费抓取任务。用户已有明确任务且工具就绪时直接完成；否则配置完成后询问要处理的网页或任务。

After import, list redacted IDs and refresh newly added accounts to verify credentials. Unknown balance is not verified success or zero. Connect an existing tool that accepts a per-call key, using the Skill's acquire/tool/report loop. For fixed-credential tools, check an available SDK/API integration first without overwriting shared credentials. If none is available, explain that the pool is ready but a Firecrawl tool still needs connecting; guide that choice and continue. Do not issue paid test jobs. Execute an already requested task when ready; otherwise ask for the task.

## 4. 简短交付 / Finish briefly

只报告：“firepool 已就绪，已导入 N 个账号；以后直接告诉我需要抓取或搜索的内容即可。”仅在余额未确认、工具尚未接入或宿主确需重新加载时补一句实际状态。导入成功不等于工具接入成功；不可用账号不算可用账号。Key 的本机目录、完整命令、协议细节只在排错需要时读取 [接入协议](protocol.md)，不要默认向用户输出一长串教程。

Report the account count and readiness in one or two sentences. State a real unresolved balance/tool/reload issue if present. Imported keys do not imply a working integration. Keep implementation details in the [protocol](protocol.md), read only when relevant.
