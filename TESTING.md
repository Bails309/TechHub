# Testing

This project uses Vitest for unit/integration tests and includes helper tests that run inside Docker.

Quick commands

- Install dependencies (local):
  ```bash
  npm install
  npm test
  # run a single file
  npx vitest run test/getClientIp.test.ts
  ```

- Run tests inside Docker (recommended to match CI environment):
  ```bash
  docker-compose build app
  docker-compose run --rm app sh -c "npx vitest run --reporter verbose"
  ```

Which tests are included

- `test/getClientIp.test.ts` — unit tests for `getClientIp` and `getRateLimitKey` behavior (proxy/no-proxy scenarios).
- `test/rateLimit.test.ts` — unit tests for the rate limiter (memory + mocked redis) ensuring limit enforcement.
- `test/change-password.test.ts` — integration-style test for `changePassword` server action; uses mocked Prisma and password helpers to simulate concurrency and history checks.
- `test/storage.test.ts` — tests for the local storage adapter (file save/delete).

Notes about the test setup

- `vitest.config.ts` provides alias mapping for `@` -> `src` and sets `environment: 'node'`.
- A small re-export `src/test-exports.ts` exposes convenience exports used in tests (helps with module resolution when running inside built Docker image).
- Tests mock external services (Redis via `ioredis-mock`, Prisma via local mocks) where needed to avoid network dependencies.

Test-mode authentication guard

- For safety, the codebase no longer grants an implicit admin session whenever `NODE_ENV === 'test'`.
- If you need a lightweight test-only fallback for `getServerAuthSession`, set the explicit guard `UNSAFE_TEST_AUTH=true` in your test environment. Example (not recommended for CI unless you understand the risk):

```bash
# Local run enabling the unsafe test fallback
UNSAFE_TEST_AUTH=true npm test
```

- Prefer dependency injection or explicit mocks in tests instead of relying on the unsafe fallback. This helps ensure tests exercise authentication logic and prevents accidental elevation in CI or shared environments.

Debugging failures

- If tests can't import `@/` aliases locally, ensure `vitest.config.ts` is used by running `npx vitest` (Vitest auto-loads this file).
- For Docker runs, rebuild the `app` image after adding tests so the runtime image includes `test/` and `vitest.config.ts`:
  ```bash
  docker-compose build app
  ```
- If a test tries to connect to Redis or other services, check the test file for proper mocking (the tests included mock `ioredis` before importing the rateLimiter module).

CI suggestion (GitHub Actions minimal)

```yaml
name: tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      db:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: techhub
          POSTGRES_PASSWORD: techhub
          POSTGRES_DB: techhub
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install deps
        run: npm ci
      - name: Run tests
        run: npm test
```

If you want, I can add the GitHub Actions workflow file in `.github/workflows/test.yml`.
