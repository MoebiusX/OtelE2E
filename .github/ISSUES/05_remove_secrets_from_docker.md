Title: Remove hard-coded credentials from `docker-compose.yml` and support `.env`

Description:
Replace embedded credentials (Postgres, RabbitMQ, Kong) with env vars and document use of Docker secrets for production. Keep `docker-compose.yml` friendly for local dev via `.env`.

Tasks:
- Replace env values in `docker-compose.yml` with `${VAR}` references
- Add `.env.example` entries for Docker run values (kept in sync with server `.env.example`)
- Add docs describing how to use Docker secrets for production
- Run Trivy scan (already in CI) and resolve any image issues

Acceptance criteria:
- No credentials hard-coded in repo files
- Local dev still works with `.env` and documented steps

Estimate: 1 day
Labels: infra, medium-effort