# Security policy

Please report vulnerabilities privately to the repository owner before opening a public issue. Include the affected Codex++ version, ChatGPT build, reproduction steps, and whether the issue crosses the trusted `app://-` main-frame boundary.

Supported releases are the current tagged source release and the ChatGPT builds listed as reviewed in `README.md`. Unknown ChatGPT builds fail closed when signature or structural validation fails.

Codex++ modifies and re-signs a local ChatGPT installation. Review the source and keep the original backup until the patched app has been exercised successfully.
