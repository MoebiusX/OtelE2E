Title: Improve Baseline Calculator performance and memory usage

Description:
Make baseline calculation streaming/batched to handle large trace volumes without memory spikes. Add configuration for sample limits and timeouts.

Tasks:
- Update `baseline-calculator` to fetch traces in pages and process incrementally
- Add configurable max samples and timeout values via config
- Add tests simulating large trace sets and confirm memory remains bounded

Acceptance criteria:
- Baseline recalculation works for large datasets without OOM or excessive latency
- Config options documented and defaults tuned

Estimate: 3-5 days
Labels: performance, medium-effort