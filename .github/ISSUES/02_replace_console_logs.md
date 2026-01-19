Title: Replace stray console.log with structured logger

Description:
Replace `console.log` / `console.*` calls in server startup and config code with `createLogger(...)` usage (Pino). Avoid logging secrets.

Tasks:

- Search for `console.log` usages and identify startup/config files
- Replace with `createLogger` calls and add structured messages
- Ensure startup logs do not reveal sensitive values (never log JWT or DB passwords)
- Add unit tests where reasonable to assert logger calls (basic coverage)

Acceptance criteria:

- No `console.log` calls in server startup/config files (server, storage, otel, vite)
- Logs show structured JSON via Pino and include `component` binding

Estimate: 0.5 day
Labels: infra, low-effort
