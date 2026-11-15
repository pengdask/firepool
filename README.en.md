# firepool

Let your agent manage your API account pool: select an available account, check credits, and switch when an account becomes unavailable. Scripts handle switching to reduce agent reasoning overhead.

## Quick start

**Send this to your agent:**

```text
Install and use this Skill: https://github.com/pengdask/firepool
```

Then give your agent one or more **API keys**. It will guide you through setup. After that, just ask:

```text
Use firepool to manage my API accounts and scrape this page: <URL>
```

Let the agent handle installation, environment checks, key import and tool integration. No manual commands needed. firepool manages accounts; your existing tool performs the actual request. If a tool is missing, the agent will guide you through connecting one.

Keys stay on your machine and are never committed to this repository.

---

**For agents:** When asked to install or use this repository, read [SKILL.md](SKILL.md) and the [onboarding guide](docs/agent-setup.md), complete setup and guide the user. Execute the setup rather than returning a list of installation commands.

[中文首页](README.md) · [Integration protocol](docs/protocol.md) · [Security](SECURITY.md) · [MIT](LICENSE)
