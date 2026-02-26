# Testing

This project uses [Vitest](https://vitest.dev) for unit and integration tests.

## Quick Commands

### Local

```bash
npm install
npm test

# run a single file
npx vitest run test/getClientIp.test.ts
```

### Docker (recommended — matches CI environment)

```bash
docker-compose build app
docker-compose run --rm app sh -c "npx vitest run --reporter verbose"
```

## Test Files

| File | Description |
|------|-------------|
| `test/auth.jwt_coherence.test.ts` | JWT coherence and token validity checks |
| `test/auth.session.test.ts` | Session handling tests |
| `test/change-password.test.ts` | `changePassword` server action — mocked Prisma, concurrency and history checks |
| `test/createApp-orphan.test.ts` | App creation and orphan record handling |
| `test/credentials.authorize.test.ts` | Credentials provider authorization logic |
| `test/credentials.rateLimit.test.ts` | Rate limiting on credential attempts |
| `test/csrf.test.ts` | CSRF token validation |
| `test/getClientIp.test.ts` | `getClientIp` and `getRateLimitKey` behavior (proxy/no-proxy scenarios) |
| `test/linkSsoAccount.test.ts` | SSO account linking logic |
| `test/middleware.revocation.test.ts` | Middleware session revocation (integration) |
| `test/middleware.revocation.unit.test.ts` | Middleware session revocation (unit) |
| `test/rateLimit.test.ts` | Rate limiter (memory + mocked Redis) ensuring limit enforcement |
| `test/sso.decrypt.test.ts` | SSO secret decryption |
| `test/storage.test.ts` | Local storage adapter (file save/delete) |

## Test Setup Notes

- `vitest.config.ts` provides alias mapping (`@` → `src`) and sets `environment: 'node'`.
- `src/test-exports.ts` exposes convenience re-exports used in tests (helps with module resolution inside the Docker image).
- Tests mock external services (Redis via `ioredis-mock`, Prisma via local mocks) to avoid network dependencies.

## Test-Mode Authentication Guard

The codebase does **not** grant an implicit admin session when `NODE_ENV === 'test'`. If you need a lightweight test-only fallback for `getServerAuthSession`, set the explicit guard:

```bash
UNSAFE_TEST_AUTH=true npm test
```

> **Prefer dependency injection or explicit mocks** instead of relying on the unsafe fallback. This ensures tests exercise authentication logic and prevents accidental privilege elevation.

## Debugging Failures

- **`@/` alias issues locally:** ensure `vitest.config.ts` is used — `npx vitest` auto-loads it.
- **Docker runs:** rebuild the `app` image after adding test files so the runtime image includes `test/` and `vitest.config.ts`:
  ```bash
  docker-compose build app
  ```
- **Redis/service connection errors:** check the test file for proper mocking — tests mock `ioredis` before importing the rate limiter module.

## CI Workflows

Two GitHub Actions workflows run tests automatically:

- [`.github/workflows/ci.yml`](/.github/workflows/ci.yml) — Full CI: lint, test (inside Docker builder stage), Next.js build, and Docker image smoke test. Starts Postgres and Redis service containers.
- [`.github/workflows/test.yml`](/.github/workflows/test.yml) — Lightweight test runner: installs deps via `npm ci`, pushes schema, seeds DB, and runs `npm test`. Starts a Postgres service container.
