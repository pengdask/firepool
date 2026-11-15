# Integration protocol / 接入协议

## Commands and output / 命令与输出

Use `node /absolute/path/to/firepool/scripts/firepool.mjs --help` for syntax. All commands except help return one JSON object. Exit status: 0 success, 2 pool unavailable, 1 invalid input/storage/operation failure. Errors are stable codes, not server messages.

除 help 外，命令返回单个 JSON 对象。退出码：0 成功，2 无可用账号，1 输入、存储或执行错误。错误仅含固定代号，不包含服务端原文。

| Command | Behavior / 行为 |
| --- | --- |
| `add [--id NAME] [--priority N]` | Hidden prompt or stdin; default priority 100. 隐藏输入或标准输入；优先级默认为 100，数字越小越优先。 |
| `import --stdin` / `import --file PATH` | Import all rows atomically; same key deduplicated, conflicting IDs rejected. 整批校验后导入，同 Key 去重，标识冲突报错。 |
| `list` | Redacted status, no network. 脱敏状态，不联网。 |
| `enable/disable/remove --id ID` | Explicit management; enable resets failure state. 启用会重置故障状态。 |
| `refresh [--id ID]` | Force credit checks for enabled accounts; no business calls. 强制检查启用账号的余额。 |
| `acquire` | Start a round, return `{ok,round,id,apiKey}`. 开始一轮并返回凭证。 |
| `report --round UUID --id ID --outcome VALUE` | Complete round, or return next credential automatically. 结束或自动返回下一账号凭证。 |

`report` can also accept `--retry-after SECONDS_OR_HTTP_DATE` for throttling. Both acquire and report may disclose a credential; all other commands are redacted. An unavailable pool returns `{ok:false,error:"pool_unavailable",retryNotBefore:TIMESTAMP_OR_NULL}`. Successful completion returns `{ok:true,done:true}`. Timestamps are Unix milliseconds. A null retry time means no automatic recovery time is known; fix configuration/credentials before starting a new operation.

`report` 的限流结果可附带 `--retry-after 秒数或HTTP日期`。acquire 和 report 都可能返回凭证，其余命令脱敏。无可用账号时返回 pool_unavailable 和最早恢复时间（Unix 毫秒）；时间为 null 表示需人工检查配置或凭证。完成时返回 done:true。

## Outcome mapping / 结果分类

| Outcome | Evidence / 判据 | Script behavior / 脚本行为 |
| --- | --- | --- |
| `success` | Operation completed / 调用完成 | Close receipt / 结束本轮 |
| `invalid` | Firecrawl API authentication 401/403, not target status / Firecrawl 凭证错误 | Disable until explicit enable / 停用直到手动启用 |
| `exhausted` | Firecrawl billing 402 / 额度不足 | Recheck eligible after 5 minutes / 5 分钟后可复查 |
| `rate_limit` | Firecrawl 429 / 账号限流 | Cooldown per Retry-After, default 60s / 按响应冷却，默认 60 秒 |
| `temporary` | Confirmed safe-to-retry network/408/5xx failure / 确认可重试的临时错误 | 60s cooldown / 冷却 60 秒 |
| `target_error` | Website rejection, captcha, target 401/403, invalid request / 目标站挑战或请求错误 | Close without changing account / 结束，不换账号 |

Retry-After is bounded to 1 second–24 hours. Missing balance is unknown, not zero; quota-query failure permits use of an unknown account and is cached for 15 minutes. Known exhaustion is rechecked after 5 minutes. Account authentication failures remain disabled even if an explicit balance refresh later succeeds; use enable after fixing credentials. Balance reports are team-wide; multiple keys in one Firecrawl team share quota and do not create additional allowance.

Retry-After 限制在 1 秒至 24 小时。余额未知不当作零，查询失败可继续使用该账号并缓存 15 分钟；已知耗尽 5 分钟后复查。认证失效须修复后 enable，刷新余额不会自动解除停用。同一 Firecrawl 团队内多个 Key 共享额度，不增加可用额度。

Classify by structured provider errors, not arbitrary text or a nested target HTTP code. If uncertain, stop and inspect the external tool's documented error schema. Only retry operations known to be safe. A timeout may hide a completed paid job; do not automatically submit it again. Keep the original key for asynchronous jobs and their polling; account-local job IDs cannot move to a new account.

按服务提供方的结构化错误分类，不能只看目标 HTTP 状态或自由文本。无法确认时先停止并查看工具错误定义。超时可能已有付费任务完成；不确定的任务不自动重提。异步任务和轮询保留原账号，任务 ID 不跨账号迁移。

## Cost, concurrency and recovery / 开销、并发与恢复

Selection and retry routing are deterministic code, not model reasoning. Acquire checks only candidate accounts as needed, reuses a 15-minute quota cache and keeps the healthy current account. List does not query; refresh is the explicit full-pool operation. A round tries each account at most once and expires after 1 hour. Stop when unavailable; starting new rounds to retry the same failing operation would defeat the limit. Up to 1,000 unfinished rounds are retained.

选择和切换均为确定性脚本；acquire 按需检查候选账号，复用 15 分钟缓存。list 不联网，refresh 才主动刷新全池。一轮最多尝试每个账号一次，凭据回执 1 小时后过期，最多保留 1000 个未结束轮次。无可用账号后停止，不能不断重新 acquire 绕过限制。

A local exclusive lock serializes state updates, including balance queries. Calls to external tools happen outside that lock. There is no quota reservation or multi-user coordination; simultaneous tools may use the same healthy account. CLI lock wait is 60 seconds. Crashes leave a `.lock` file intentionally: stop all firepool processes first, then remove only `.lock` inside the data directory and retry. Never delete a lock while any process may own it. A corrupt JSON file fails closed as invalid_storage; restore your own backup or move it aside with all processes stopped, then re-import credentials. State reset forgets cooldowns and receipt history.

本地锁串行更新状态和余额查询，外部工具调用不占锁。允许并行任务使用同一健康账号，不预留额度，也不支持多人调度。等锁 60 秒后报错；崩溃遗留锁时，先停止所有 firepool 进程，再删除数据目录内的 .lock。存储损坏会报 invalid_storage，不静默覆盖；停进程后从自备备份恢复或移走损坏文件再导入。重置状态会丢失冷却和回执历史。

## Credentials and hosting / 凭证与运行宿主

Keys are plaintext in credentials.json outside the checkout. state.json stores account identifiers, balance cache and receipts, never keys. Unix uses 0700/0600; Windows relies on the user's directory ACL. CLI refuses data paths within its own checkout, including symlink redirects. Use only a trusted local directory; filesystem locks are not designed for network shares or hostile local users. Do not set FIREPOOL_HOME to another Git repository or synced/public folder.

凭证明文保存在仓库外 credentials.json，state.json 只存标识、缓存和回执。Unix 使用 0700/0600，Windows 依赖用户目录 ACL。数据路径不能位于本项目仓库内，也不能用符号链接绕过；请勿选择其他 Git 仓库或同步/公开目录，不支持网络共享盘及不可信本地用户环境。

CLI never logs credentials, but acquire/report must hand them to the caller. An AI host may record tool output and subsequent API arguments. If it cannot keep those private, use the exported Pool class inside a trusted local adapter and expose only redacted results to the assistant. firepool cannot erase or suppress another host's transcripts. Process user-supplied keys locally without quoting them back. Keep keys out of command arguments, bug reports and screenshots. Import source files are user-owned: protect and remove them yourself after import.

CLI 不记录凭证，但领取和重试时必须交给调用者。AI 宿主可能保存工具输出及 API 参数；无法隐藏时，应在可信本地适配器内使用 Pool 类，只向助手返回脱敏结果。firepool 无法控制第三方宿主的记录。用户已交给 Agent 的凭证应直接在本机处理且不回显，勿放入命令行参数、问题报告或截图；导入源文件由用户保护并在导入后自行清理。

Official quota contract / 官方余额接口：[Firecrawl credit usage](https://docs.firecrawl.dev/api-reference/endpoint/credit-usage). Only GET to the fixed official v2 endpoint is used; redirects are refused. There is no custom API origin setting and no scrape/search request here.
