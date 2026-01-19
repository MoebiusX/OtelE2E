Title: Add ESLint, Prettier and lint scripts

Description:
Add a baseline ESLint + Prettier setup to enforce code quality and formatting. Keep rules conservative initially (warnings for new stricter rules) and add `npm` scripts for linting and formatting.

Tasks:
- Add `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-config-prettier`, `prettier` to devDependencies
- Add `.eslintrc.cjs` with recommended TypeScript config and `no-explicit-any` set to `warn` initially
- Add `prettier.config.js` and ensure ESLint `prettier` config applied
- Add `npm` scripts: `lint`, `lint:fix`, `format`
- Add a warning lint step in CI (non-blocking)

Acceptance criteria:
- `npm run lint` runs and returns warnings/errors
- `npm run format` formats repo
- CI contains a lint step that does not fail the job but prints warnings

Estimate: 1 day
Labels: tooling, low-effort