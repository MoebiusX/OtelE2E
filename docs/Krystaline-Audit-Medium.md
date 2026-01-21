---
title: Lessons from a Day: Auditing and Hardening a TypeScript Trading App
subtitle: How focused observability, safe fixes, and incremental monitoring made a complex app more resilient
author: Krystaline Engineering — summary by the audit bot
date: 2026-01-20
tags: [observability, telemetry, typescript, devops, monitoring]
---
title: Weekly Work Summary — Audit & Hardening (last week)
author: Krystaline Engineering — factual summary
date: 2026-01-20
tags: [summary, audit, fixes]

The repo is a full-stack TypeScript app: an Express-based API (esbuild-bundled server), a Vite + React frontend, Vitest tests, OpenTelemetry tracing, and RabbitMQ flows for order processing. The initial goals were simple: keep tests green, avoid risky repo-wide style churn, make traces useful for debugging, and prototype an automated anomaly monitor.

What I changed (high-impact, low-risk)

- Restored test hygiene: ensured `tsc` + `vitest` run cleanly in CI candidates.
- Fixed a blocking runtime bug in `server/storage.ts` where a stray `walletId` reference caused a ReferenceError during demo initialization.
- Made the logger test-friendly: exported a `createLogger()` factory so tests can inject mocks while production uses structured pino logs.
- Added a small OpenTelemetry initializer and a dev-friendly in-memory TraceCollector to inspect spans locally and forward them to Jaeger/OTLP when desired.
- Designed and implemented a monitoring prototype (polling Jaeger, computing baselines, anomaly detector, UI) with a manual "Recalculate Baselines" endpoint to validate thresholds.

Observability fixes that mattered

- Context propagation: fixed several places where spans were created as roots instead of children (notably the RabbitMQ publish/consume flow), which made end-to-end traces fragment across services.
- Response sibling spans: propagated the original HTTP parent context through message headers so the response-processing span appears as a sibling of the initial publish (gives correct trace hierarchy).
- Lightweight dev collector: storing recent spans in memory made interactive debugging and test-time trace inspection easy without standing up external services.

Monitoring architecture (prototype)

- TraceProfiler: polls Jaeger API and computes per-(service,operation,day-of-week,hour) incremental stats: count, mean, sum_of_squares.
- Time-aware baselines: 1-hour buckets (168 buckets per span) with 30-day history; nightly recalculation to compute updated means and σ.
- Adaptive thresholds: nightly-derived percentiles (95/99/99.9) mapped to SEV1–SEV5 levels so severity is data-driven rather than arbitrary.
- AnomalyDetector: compares live spans to the time-aware baseline and maps deviation to SEV level; stores history for trend analysis.
- AnalysisService: when an anomaly occurs, gather trace + attributes and ask a local Ollama model for human-readable reasoning and remediation suggestions.

Why the incremental approach

- Avoids massive diffs: behavioral fixes were kept separate from stylistic changes (ESLint/Prettier), which were rolled back on request.
- Prioritizes stability: tests remained green (after the storage fix and logger adjustments) so we could iterate safely.
- Makes monitoring actionable: time-aware baselines and adaptive thresholds reduce false positives during known busy windows.

Concrete results

- Tests green after revert and targeted fixes.
- End-to-end traces now show correct parent/child/sibling relationships across browser → API → RabbitMQ → matcher → response.
- Prototype monitor collected baselines and produced SEV1–SEV5 thresholds; UI shows badges and allows manual recalculation.

Recommended next steps (practical, ordered)
1. Add a minimal CI workflow: `tsc --noEmit` + `vitest` on PRs as non-blocking checks.
2. Persist baselines in SQLite (or lightweight DB) and schedule the nightly recalculation job (cron or service).
3. Harden tracing config for production (OTLP endpoint, sampling, secure credentials).
4. Incrementally adopt ESLint/Prettier in a focused PR (editorconfig + pre-commit hooks), not mixed with functional changes.
5. Add alerting hooks later (webhook/Slack) after SEV thresholds stabilize.
6. Expand LLM analysis prompts and collect feedback to improve automated recommendations.

---
title: Lessons from a Day: Auditing and Hardening a TypeScript Trading App
subtitle: What we built, the problems we hit, and how we fixed them
author: Krystaline Engineering — audit summary
date: 2026-01-20
tags: [observability, telemetry, typescript, devops, monitoring, postmortem]
---

Summary — work performed last week

This file records the concrete work completed during last week's audit and hardening effort. It intentionally lists actions, fixes, files, branches, and verification steps — format is not important.

1) Branches & commits
- Created branch: `feat/tooling/eslint-fixes` (later deleted during rollback).
- Large auto-fix commit applied then reverted per request. Revert commits were pushed to `dev` to restore pre-change state.

2) Key behavioral fixes (code)
- `server/storage.ts`: removed stray `walletId` reference in `initializeDemoData()` that caused ReferenceError; made initialization idempotent.
- `server/lib/logger.ts`: introduced `createLogger()` factory and preserved `logger` default export so tests can mock logging.
- `server/otel.ts` & RabbitMQ client/matcher: fixed context propagation — used `context.with()` / `trace.setSpan()` and explicit header injection (`x-parent-traceparent`) so traces remain connected across services.

3) Monitoring and observability
- Added a dev in-memory TraceCollector for quick span inspection.
- Implemented `monitor` backend prototypes: `TraceProfiler`, baseline storage, `AnomalyDetector`, `AnalysisService` (Ollama integration prototype).
- UI: added `/monitor` page showing baselines, anomalies, SEV1–SEV5 badges, and manual "Recalculate Baselines" button.

4) CI / Tooling (what happened)
- Proposed CI: `tsc --noEmit` + `vitest` + optional linting/security checks.
- Implemented ESLint/Prettier configs and auto-fix commit, but user requested a rollback; the styling/CI changes were reverted and the feature branch removed.

5) Tests and verification
- After behavioral fixes and revert, test suite runs green: 42 test files, 931 tests passing (local verification reported).

6) Operational notes & fixes
- Port conflicts: adjusted docker-compose and dev config to avoid Jaeger/Windows ephemeral port conflicts during local runs.
- Vite proxy: added proxy rules so the Vite dev server (5173) forwards API calls to the Express backend (5000).

7) Outstanding items and next steps
- Persist baselines (SQLite) and schedule nightly recalculation (30-day lookback, 1-hour buckets).
- Add minimal CI (non-blocking) to run `tsc` + `vitest` on PRs.
- Incrementally reintroduce linting/formatting in a small PR.
- Optionally: commit this summary document and/or open the CI PR.

Verification artifacts and references
- Tests: `tests/` (Vitest) — all tests passed locally after fixes.
- Key files edited: `server/storage.ts`, `server/lib/logger.ts`, `server/otel.ts`, `server/services/rabbitmq-client.ts`, `server/monitor/*`, `client/src/pages/monitor.tsx`.
- Branches: `feat/tooling/eslint-fixes` (created → later deleted). Revert commits exist on `dev`.

If you want a different filename or additional detail (commit SHAs, exact PR links, or a changelog format), tell me and I will add it. 


