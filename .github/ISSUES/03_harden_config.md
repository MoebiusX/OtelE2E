Title: Harden config validation and add .env.example

Description:
Make production deployments require explicit secrets and fail fast if missing. Use Zod validation for required variables when `NODE_ENV=production`. Add `.env.example` and document required envs in README.

Tasks:

- Update `server/config/index.ts` to require critical vars (JWT_SECRET, DB credentials, RABBITMQ_URL) when env=production
- Add `.env.example` with commented descriptions of each var
- Add README section describing required envs and how to use `.env` for local dev
- Add a small test to assert config loader fails when essential envs are missing in production mode

Acceptance criteria:

- App exits with a clear error message if production-required env vars are missing
- `.env.example` and README doc added

Estimate: 1 day
Labels: security, high-impact
