Title: Perform dependency audit and upgrade critical packages

Description:
Run `npm audit` and address critical/high vulnerabilities. Verify and upgrade outdated/suspicious packages (e.g., `esbuild`, React types). Ensure CI audit step is present and fails on high/critical.

Tasks:
- Run `npm audit` locally and in CI to gather findings
- Upgrade or patch vulnerable packages; pin versions if necessary
- Run full test suite and build after upgrades
- Document upgrade decisions in PR notes

Acceptance criteria:
- No high/critical vulnerabilities reported by `npm audit`
- Tests and build succeed after upgrades

Estimate: 1-2 days
Labels: security, medium-effort