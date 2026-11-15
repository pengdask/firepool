# firepool

让 Agent 管理你的 API 账号池，自动选择可用账号、检查余额、在账号不可用时切换。切换由脚本完成，减少 Agent 的推理开销。

## 快速上手

**把下面这句话发给你的 Agent：**

```text
帮我安装并使用这个 Skill：https://github.com/pengdask/firepool
```

然后把你的一个或多个 **API Key** 交给 Agent，它会引导你完成配置。之后直接说：

```text
用 firepool 管理我的 API 账号，帮我抓取这个网页：<网页地址>
```

安装、环境检查、Key 导入和工具接入都交给 Agent，无需自己执行命令。firepool 管理账号池，抓取由你已有的工具完成；缺少工具时，Agent 会继续引导配置。

Key 只保存在你的本机，不会提交到本仓库。

---

**给 Agent：** 收到此仓库地址并被要求安装或使用时，读取 [Skill](SKILL.md) 和 [安装与首次使用指南](docs/agent-setup.md)，直接完成安装并引导用户配置；不要把安装命令清单交回给用户。

[English](README.en.md) · [接入协议](docs/protocol.md) · [安全说明](SECURITY.md) · [MIT](LICENSE)
