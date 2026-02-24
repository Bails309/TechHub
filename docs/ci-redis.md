## CI and Redis

This file documents the CI changes that ensure tests run with Redis available.

- The GitHub Actions workflow (`.github/workflows/ci.yml`) starts a Redis service for the `build-and-test` job and sets the following environment variables for the job:
  - `REDIS_URL=redis://localhost:6379`
  - `RATE_LIMIT_STORE=redis`

- For the `docker-build` smoke test job, the workflow starts a small Redis container and links it into the container started from the built image. The launched container receives `REDIS_URL=redis://redis:6379` and `RATE_LIMIT_STORE=redis`.

Why this matters:

- Tests exercise Redis-backed behavior and the server-side cache to validate production-like paths.
- Starting Redis in CI reduces the chance of diverging behavior between local and CI runs.

If you want the CI to run without Redis, remove the Redis service block and omit the environment variables — tests will fall back to the in-memory stores, but that is not recommended for production parity.
