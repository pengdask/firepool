# firepool

把网页采集 Key 交给 Agent，统一管理、查余额，账号不可用时由脚本选择下一个。

## 快速上手

把这句话发给你的 Agent：

```text
帮我安装并使用这个 Skill：https://github.com/pengdask/firepool
```

Agent 会先检查已有安装和账号。已有 Key 直接复用；新 Key 可以直接粘贴给 Agent，自动合并去重，保留旧配置。也可选择本机输入页。

准备好后，直接说：

```text
帮我抓取这个网页：<网页地址>
查一下我的 Key 情况
查一下最新余额
再加上这几个 Key
```

无需提前安装插件或了解底层工具。支持具备本地脚本执行能力的 Codex、Claude Code、WorkBuddy 等 Agent；客户端若需要确认导入，Agent 会准备好文件并告诉你剩下的那一步。

Key 保存在本机用户目录，不进入本仓库；直接粘贴的内容仍受所用 Agent 的聊天记录策略约束。已有工具和账号配置会保留。

---

**给 Agent：** 先读 [SKILL.md](SKILL.md)，按用户意图完成接入或使用。面向用户只交付结果和必要的下一步。

[English](README.en.md) · [使用与恢复](docs/maintenance.md) · [安全说明](SECURITY.md) · [MIT](LICENSE)
