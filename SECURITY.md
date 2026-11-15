# Security / 安全

Never attach account files, credentials, unredacted tool results or private URLs to public issues. For sensitive reports, use GitHub private vulnerability reporting if enabled; otherwise open an issue requesting a private contact channel without including secrets. For accidental exposure, revoke affected keys first.

公开问题中不要附带账号文件、凭证、未脱敏工具结果或私人地址。敏感问题优先使用 GitHub 私密漏洞报告（如已启用）；否则仅公开请求私下联系渠道，不发送秘密。发生泄露先撤销相关凭证。

This project stores plaintext local credentials and supports a trusted single-user machine. It is not a vault, multi-tenant service, or defense against malware running as your OS user. Secrets are never needed in CI. Review staged changes and run `npm run scan` before every publication. The scanner is intentionally conservative but cannot detect every possible secret format.

本项目服务于可信单用户电脑，本地凭证明文存储，不是保险库或多租户服务，不能抵御以当前用户运行的恶意程序。CI 无需真实凭证。每次发布前审阅暂存内容并执行扫描；扫描器不能识别所有秘密格式。
