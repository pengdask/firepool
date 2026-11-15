# firepool

默认使用中文，用户使用其他语言时跟随用户语言。

用户把仓库地址交给你并要求安装或使用时，执行 [docs/agent-setup.md](docs/agent-setup.md) 的首次使用流程。由你完成环境检查、安装、凭证导入和接入验证，用户只需提供 Key 及任务。已收到 Key 时直接导入，不重复索取，不回显。

修改本项目时，先阅读 [SKILL.md](SKILL.md) 和涉及的接入文档。凭证保存在仓库外，测试只使用 MOCK_ 模拟值。发布前运行 `npm test`、`npm run scan` 并审阅暂存文件。协议或 CLI 改动同步更新面向 Agent 的说明；README.md 保持中文快速上手，不堆叠安装命令和实现细节。
