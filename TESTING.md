# Testing

This project uses [Vitest](https://vitest.dev) for unit and integration tests and [Playwright](https://playwright.dev) for end-to-end tests.

**Current coverage:** 76 unit/integration test files, 641 tests, 4 E2E suites. Enforced thresholds: 90% statements, 90% lines, 75% branches, 88% functions.

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

### Authentication & Session
| File | Description |
|------|-------------|
| `test/auth.jwt_coherence.test.ts` | JWT coherence and token validity checks |
| `test/auth.session.test.ts` | Session handling tests |
| `test/auth.sessionLifetime.test.ts` | Session absolute/idle timeout enforcement |
| `test/auth-config.test.ts` | `getSessionMaxAgeSeconds` and `getSessionIdleTimeoutMs` with env var parsing and defaults |
| `test/authConfig.test.ts` | Auth config additional tests |
| `test/auth.gap.test.ts` | Auth gap coverage — providers, callbacks, credentials authorize, JTI blacklisting, session dedup, concurrent session tracking |
| `test/sessionTracker.test.ts` | Concurrent session tracker — Redis sorted set tracking, audit logging, error resilience |
| `test/credentials.authorize.test.ts` | Credentials provider authorization logic |
| `test/credentials.rateLimit.test.ts` | Rate limiting on credential attempts |
| `test/linkSsoAccount.test.ts` | SSO account linking transactionality |
| `test/sso.decrypt.test.ts` | SSO secret decryption |
| `test/sso.gap.test.ts` | SSO gap coverage — build-phase, loadFn error, multi-provider, decrypt paths |

### Security & CSRF
| File | Description |
|------|-------------|
| `test/csrf.test.ts` | CSRF token validation |
| `test/csrf.replay.test.ts` | CSRF replay attack prevention |
| `test/csrf.signin-render.test.ts` | CSRF token rendering on sign-in flows |
| `test/csrf.public.test.ts` | Public CSRF flow tests |
| `test/csrf.gap.test.ts` | CSRF gap coverage — withCsrf, validateApiCsrf, visitor tokens, signature mismatches |
| `test/validateActionCsrf.test.ts` | Server action CSRF validation |
| `test/security.multi_fix.test.ts` | Multi-vector security fix verification |
| `test/ssrf.dns_rebinding.test.ts` | DNS rebinding / TOCTOU protection |
| `test/ssrf.smoke.test.ts` | SSRF basic smoke tests |
| `test/ssrf.assertUrlNotPrivate.test.ts` | `assertUrlNotPrivate` unit tests |
| `test/ssrf.gap.test.ts` | SSRF gap coverage — unparseable IPs, catch branches |

### Proxy Pipeline (formerly Middleware)
| File | Description |
|------|-------------|
| `test/middleware.headers.test.ts` | Security headers (CSP, HSTS, X-Frame) |
| `test/middleware.revocation.test.ts` | Session revocation (integration) |
| `test/middleware.revocation.unit.test.ts` | Session revocation (unit) |
| `test/middleware.password_change.test.ts` | Must-change-password enforcement |
| `test/middleware.activity.loop.test.ts` | Activity tracking loop prevention |
| `test/middleware.activity.unit.test.ts` | Activity tracking unit tests |
| `test/proxy.csrf.test.ts` | Proxy CSRF token injection |
| `test/proxy.utils.test.ts` | Proxy utility functions |
| `test/proxy.gap.test.ts` | Proxy gap coverage — CSP, HSTS, idle timeout, revocation, auth guard, activity cookie |
| `test/pinnedClient.test.ts` | Pinned HTTP client core tests |
| `test/pinnedClient.gap.test.ts` | Pinned client gap coverage — real HTTP server, headers, errors, AWS handler, timeout |

### Cryptography & Secrets
| File | Description |
|------|-------------|
| `test/crypto.test.ts` | Multi-key rotation, key ring parsing (legacy, CSV, JSON) |
| `test/crypto.envelope.test.ts` | Envelope encryption (V3), V2 default, key rotation, `getSecretKeyId`, `encryptSecretWithKeyId` |
| `test/crypto.gap.test.ts` | Crypto gap coverage — getSecretKeyState, hasSecretKey, V3 missing parts, multi-key fallback |

### Core Libraries
| File | Description |
|------|-------------|
| `test/password.test.ts` | Password complexity validation, hashing, and verification |
| `test/passwordPolicy.test.ts` | `getPasswordPolicy` — DB result, null/error fallback, field mapping |
| `test/userCache.test.ts` | `getUserMeta` memCache hit, TTL expiry, DB fallback, cache clearing |
| `test/userCache.gap.test.ts` | User cache gap coverage — Redis read/miss/error, DB fallback, invalidation, clearMemCache |
| `test/ip.normalizeIp.test.ts` | IP normalization, private range detection, header reading |
| `test/ip.gap.test.ts` | IP gap coverage — getServerActionIp, bracket IPv6, x-azure-clientip, x-forwarded-for |
| `test/ip.trustedProxy.test.ts` | Trusted proxy CIDR matching and proxy chain validation |
| `test/getClientIp.test.ts` | `getClientIp` and `getRateLimitKey` (proxy/no-proxy) |
| `test/rateLimit.test.ts` | Rate limiter (memory + mocked Redis) |
| `test/rateLimit.gap.test.ts` | Rate limit gap coverage — Redis limiter init, limiterInitPromise reset |
| `test/redis.gap.test.ts` | Redis gap coverage — cluster, TLS, circuit breaker, ping timeout, production fallback |
| `test/sanitizeIconUrl.test.ts` | Icon URL sanitization |
| `test/sanitizeIconUrl.gap.test.ts` | Sanitize icon gap coverage — Azure Blob, Azurite, localhost, malformed URLs |
| `test/siteConfig.test.ts` | `chooseLogo` for dark/light/fallback themes |
| `test/svgProcessor.test.ts` | `getRGB`, `isVibrant`, `isNearBlack`, `parseCssBlocks`, `styleToAttrMap` |
| `test/svgProcessor.gap.test.ts` | SVG processor gap coverage — achromatic HSL |
| `test/svg_hardening.test.ts` | SVG upload sanitization and XSS prevention |
| `test/storageConfig.test.ts` | Storage provider mapping and secret decryption |
| `test/storageConfig.gap.test.ts` | Storage config gap coverage — invalidateCache, build-phase, no-secret, loadFn error |
| `test/storage.test.ts` | Local storage adapter (file save/delete) |
| `test/storage.gap.test.ts` | Storage gap coverage — save/read/delete for Local, S3, Azure; MIME types, error paths |
| `test/audit.unit.test.ts` | Audit log writing |
| `test/audit.details.test.ts` | Audit log detail fields |
| `test/audit.gap.test.ts` | Audit gap coverage — custom limit, DB error, details, all categories |

### Health & System
| File | Description |
|------|-------------|
| `test/health.unit.test.ts` | Individual health check functions |
| `test/health.system.test.ts` | `getSystemHealth` aggregation, DB/Redis/storage/schema checks |
| `test/health.gap.test.ts` | Health gap coverage — checkStorageHealth, Redis maxmemory, schema mismatch |
| `test/auto-migrate.test.ts` | Auto-migration script tests |

### Server Actions
| File | Description |
|------|-------------|
| `test/change-password.test.ts` | `changePassword` server action — mocked Prisma, concurrency and history |
| `test/admin.forcePasswordReset.test.ts` | Admin force password reset action |
| `test/admin.security_wiring.test.ts` | Admin security wiring verification |
| `test/admin.actions.test.ts` | Admin actions CRUD |
| `test/createApp-orphan.test.ts` | App creation and orphan record handling |
| `test/category.actions.test.ts` | Category CRUD — CSRF, auth, validation, DB errors |
| `test/favoriteApps.actions.test.ts` | Toggle favorites, `getFavoriteApps` — CSRF, auth, error paths |
| `test/personalApp.actions.test.ts` | Personal app CRUD with rate limiting |
| `test/profile.actions.test.ts` | Profile update actions |

### API Routes
| File | Description |
|------|-------------|
| `test/api.launch.test.ts` | App launch API route |
| `test/api.appOrder.test.ts` | App ordering API |
| `test/api.cronCleanup.test.ts` | Cron cleanup — bearer auth, execution, error handling |

### E2E Tests (Playwright)
| File | Description |
|------|-------------|
| `test/e2e/admin.spec.ts` | Admin management flows |
| `test/e2e/app.spec.ts` | App interaction flows |
| `test/e2e/auth.spec.ts` | Authentication flows |
| `test/e2e/personal-apps.spec.ts` | Personal apps CRUD |

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

Three GitHub Actions workflows run tests and security checks automatically:

- [`.github/workflows/ci.yml`](/.github/workflows/ci.yml) — Full CI: lint, test (inside Docker builder stage), Next.js build, Docker image smoke test, and E2E tests. Starts Postgres and Redis service containers. Includes unit test coverage reporting via `@vitest/coverage-v8` with artifact upload.
- [`.github/workflows/security.yml`](/.github/workflows/security.yml) — Security scanning: CodeQL static analysis on push/PR/weekly schedule (JavaScript/TypeScript), dependency review on PRs with high-severity failure threshold.

### Coverage

Unit test coverage is generated using `@vitest/coverage-v8` and reported in three formats:
- **text** — Console summary during CI runs.
- **json-summary** — Machine-readable summary for dashboards.
- **lcov** — Compatible with most coverage visualization tools.

Coverage configuration is in `vitest.config.ts` and targets `src/lib/**/*.ts` and `src/proxy.ts`. Enforced minimums:

| Metric | Threshold |
|--------|-----------|
| Statements | 90% |
| Lines | 90% |
| Branches | 75% |
| Functions | 88% |

### Dependency Management

[`.github/dependabot.yml`](/.github/dependabot.yml) keeps dependencies current:
- Weekly npm updates grouped by dev/production dependencies (ignoring major bumps).
- Weekly GitHub Actions version updates.
