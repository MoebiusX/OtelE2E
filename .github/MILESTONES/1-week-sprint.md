Milestone: Week 1 - CI & Quality Foundations

Start: 2026-01-19
End: 2026-01-26
Owner: @lead-developer

Scope (must-do for this milestone):
- Replace stray `console.log` usages with structured logger (Issue: 02_replace_console_logs.md)
- Harden config validation and add `.env.example` (Issue: 03_harden_config.md)
- Add ESLint + Prettier with conservative rules and scripts (Issue: 01_eslint_prettier.md)
- Run dependency audit and fix critical/high findings (Issue: 04_dependency_audit.md)
- Create `.github/ISSUES` entries for remaining backlog items to pick in following sprints

Acceptance Criteria:
- All 4 scope items have PRs open or merged
- CI runs without high/critical npm audit findings
- README updated with env variable guidance

How to create GitHub issues from these files (optional):
If you have GitHub CLI available (`gh`), run the helper script:

  scripts/create-github-issues.sh .github/ISSUES/*.md

This will create issues using file `Title:` line and the rest of the file as the issue body.

Notes:
- This milestone is intentionally conservative to deliver high-value safety improvements without blocking developer velocity.
