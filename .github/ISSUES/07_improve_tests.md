Title: Improve tests and typed mocking helpers

Description:
Replace `as any` in tests with typed helpers and add deterministic integration tests to run in CI.

Tasks:
- Add typed mocking utilities and fixtures in `tests/helpers/`
- Replace `as any` casts in most critical test files
- Add one lightweight integration test that exercises order flow end-to-end (using in-memory DB or docker test container) and run it in CI

Acceptance criteria:
- Reduced `as any` usage in tests
- Integration test added and passing in CI

Estimate: 2-3 days
Labels: tests, medium-effort