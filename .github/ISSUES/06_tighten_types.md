Title: Reduce `any` usage and centralize shared types

Description:
Improve type-safety by replacing `any` with `unknown`+validation or explicit interfaces and moving shared DTOs to `shared/`.

Tasks:

- Add ESLint rule `@typescript-eslint/no-explicit-any` (warn initially)
- Incrementally fix major `any` hotspots in `server/` and `tests/`
- Create shared types for API payloads and responses in `shared/schema.ts` or a new `shared/types/` folder
- Add tests where necessary to ensure type assumptions are validated

Acceptance criteria:

- Fewer `any` occurrences in critical server modules
- Shared DTOs exist and are used by server and client where applicable

Estimate: iterative; initial sprint 2 days
Labels: quality, medium-effort
