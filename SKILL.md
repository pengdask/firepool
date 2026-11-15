---
name: firepool
description: 管理 Firecrawl 本地账号池，导入 API Key、查看余额，并在账号故障时通过脚本自动切换；与支持动态凭证的 Firecrawl 工具配合使用。
---

# firepool

默认中文交流，跟随用户的语言。安装与首次配置时，执行 [Agent 首次使用指南](docs/agent-setup.md)：自行完成安装和验证，只向用户索取缺少的 Key 或任务信息。收到用户提供的 Key 后直接在本机导入，不重复索取或回显。

CLI：`node <skill-directory>/scripts/firepool.mjs`。命令语法用 `--help` 查询。首次接入外部 Firecrawl 工具时，读取 [接入协议](docs/protocol.md) 确认错误分类、异步任务及重试边界。

## 调用流程

1. 检查用户的 Firecrawl 工具是否接受动态凭证；固定凭证工具按首次使用指南处理接入。无 Key 时引导用户提供，已有账号时直接使用。
2. 每个独立操作调用一次 `acquire`。将返回的 apiKey 私下交给外部工具，保留 round 和 id。优先在可信本地适配器内交接凭证，只向助手返回脱敏结果；受宿主限制无法隐藏记录时说明具体限制，不承诺宿主绝不保存。
3. 按协议将结果反馈给 `report --round UUID --id ID --outcome OUTCOME`，限流时可附带 Retry-After。脚本更新状态并直接返回下一可用账号；继续使用返回值，不让模型比较账号或重新扫描全池。
4. 收到 done:true 或 pool_unavailable 即停止。同一失败任务不重新 acquire 绕过每账号一次的限制。回执 1 小时过期，不自动重提结果不确定的付费或异步任务。

只将 Firecrawl 认证错误反馈为 invalid；目标网站的 401/403、验证码及挑战反馈为 target_error。错误不明确时停止并排查。异步任务和轮询使用原账号，任务 ID 不跨账号迁移。

## 凭证与维护

用户交给你的 Key 通过 stdin 导入：单个用 add，批量用 `import --stdin`。使用执行工具的标准输入通道或本地进程内存传递，避免把 Key 拼进命令、Shell 历史、源码或日志。Key 已存在于用户提供的受限文件时，可使用 `import --file PATH`。凭证只落地到仓库外的用户配置目录；返回账号标识、数量和脱敏状态即可。

`list` 离线查看；`refresh` 按需检查余额，首次配置时验证新导入账号。正常调用已有候选余额缓存，不额外执行全池刷新。启停、移除及恢复步骤按 `--help` 和接入协议执行。
