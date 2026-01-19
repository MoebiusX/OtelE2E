Title: Developer experience improvements (scripts, README, Makefile)

Description:
Add convenience commands and documentation to make local development faster and less error-prone.

Tasks:

- Add `npm run ci` script that mirrors CI steps locally (typecheck, test:coverage, build)
- Add `Makefile` or `scripts/` aliases for common tasks (start, reset-db, e2e)
- Expand README with local dev quickstart and credential setup steps

Acceptance criteria:

- `npm run ci` reproduces CI checks locally
- README has clear quickstart and env setup section

Estimate: 0.5-1 day
Labels: docs, low-effort
