# firepool

Let your agent manage your API account pool: select an available account, check credits, and switch when an account becomes unavailable. Scripts handle switching to reduce agent reasoning overhead.

## Quick start

**Send this to your agent:**

```text
Install and use this Skill: https://github.com/pengdask/firepool
```

The agent checks existing installations and accounts first, reuses your pool and merges new keys without overwriting old settings.

Paste one or more **API keys** directly to your agent. It handles setup; a local input page is also available if preferred. After that, just ask:

```text
Scrape this page: <URL>
Check my keys and credits
```

Works with Skill-capable agents that can execute local scripts, including Codex, Claude Code and WorkBuddy. No prior plugin or service knowledge needed: the agent prepares the runtime, accounts and calling tool. If the client requires an import confirmation, the agent gives that specific next step.

firepool stores keys on your machine and never commits them to this repository.

---

**For agents:** When asked to install or use this repository, read [SKILL.md](SKILL.md) and the [onboarding guide](docs/agent-setup.md), complete setup and guide the user. Execute the setup rather than returning a list of installation commands.

[中文首页](README.md) · [Integration protocol](docs/protocol.md) · [Security](SECURITY.md) · [MIT](LICENSE)
