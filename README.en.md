# firepool

Let your agent manage web collection keys, check credits and select the next account when one becomes unavailable.

## Quick start

Send your agent:

```text
Install and use this Skill: https://github.com/pengdask/firepool
```

The agent checks existing installations and accounts first. Existing keys are reused; directly pasted new keys are merged and deduplicated while preserving old settings. A local input page is optional.

Then ask:

```text
Scrape this page: <URL>
Check my keys
Check the latest credits
Add these keys
```

No plugin setup or knowledge of the underlying tools needed. Works with agents that can run local scripts, including Codex, Claude Code and WorkBuddy. If the client requires an import confirmation, the agent prepares the file and gives that specific next step.

Keys are stored in your local user directory and kept out of this repository. Pasted keys remain subject to your agent's chat retention policies. Existing tool and account settings are preserved.

---

**For agents:** Read [SKILL.md](SKILL.md) and follow the user's intent. Complete setup or usage; return the result and only the next action actually needed.

[中文](README.md) · [Maintenance](docs/maintenance.md) · [Security](SECURITY.md) · [MIT](LICENSE)
