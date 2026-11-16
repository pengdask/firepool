# firepool

让 Agent 管理你的 API 账号池，自动选择可用账号、检查余额、在账号不可用时切换。切换由脚本完成，减少 Agent 的推理开销。

## 快速上手

**把下面这句话发给你的 Agent：**

```text
帮我安装并使用这个 Skill：https://github.com/pengdask/firepool
```

Agent 会先检查已有安装和 Key，复用已有账号，新 Key 合并去重，不覆盖旧配置。

然后把你的一个或多个 **API Key** 直接发给 Agent，它会自动完成配置；也可以让它打开本机输入页。之后直接说：

```text
帮我抓取这个网页：<网页地址>
查一下我的 Key 情况
```

支持 Codex、Claude Code、WorkBuddy 等具备 Skill 和脚本执行能力的 Agent。无需了解底层服务，也无需提前安装插件；环境检查、Key 导入和调用工具由 Agent 准备。客户端若要求确认导入，Agent 会给出那一步操作。

firepool 将 Key 保存在你的本机，不会提交到本仓库。

---

**给 Agent：** 收到此仓库地址并被要求安装或使用时，读取 [Skill](SKILL.md) 和 [安装与首次使用指南](docs/agent-setup.md)，直接完成安装并引导用户配置；不要把安装命令清单交回给用户。

[English](README.en.md) · [接入协议](docs/protocol.md) · [安全说明](SECURITY.md) · [MIT](LICENSE)
