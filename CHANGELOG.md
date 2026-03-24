# Changelog

All notable changes to TechHub are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.2] - 2026-03-24

### Fixed
- **CodeQL unused-variable alerts** — Resolved ~60 "Unused variable, import, function or class" alerts across 23 source and test files, removing dead imports (`path`, `cookies`, `lookup`, `randomUUID`, `createHttpHeaders`, `isPublicIp`, `useMemo`, `useNonce`, `LayoutGrid`, `Home`, `ShieldCheck`, `X`, `beforeEach`, `NextResponse`, `IORedis`, `RedisOptions`, etc.), dead functions (`saveLocal`, `saveS3`, `saveAzure`, `parseAzureConnectionString` in `storage.ts`), dead constants (`STORAGE_PROVIDER`, `allowMissingRemoteIp`, `baseUrl`), and unused destructured variables.
- **TypeScript compilation errors** — Fixed `NODE_ENV` read-only assignment in test files, `NextResponse` custom property access in proxy tests, and `UserMeta` type mismatches in userCache tests. `npx tsc --noEmit` now passes cleanly.
- **Prisma binary target** — Added `binaryTargets = ["native", "debian-openssl-1.1.x", "debian-openssl-3.0.x"]` to `schema.prisma` generator, fixing `PrismaClientInitializationError` on Windows and ensuring Docker compatibility. Test suite now exits with code 0.
- **Dead access query in users page** — Removed unused `usersForAccess` Prisma query and associated pagination variables (`accessSkip`, `accessTotalPages`, `prevAccessPage`, `nextAccessPage`, `showAccessPaneInline`) from the admin users page, eliminating a wasted DB round-trip.

### Changed
- **CodeQL v4** — Upgraded all `github/codeql-action/*` references from `@v3` to `@v4` in `security.yml`.
- **GitHub Actions** — Bumped action versions across CI and security workflows:
  - `actions/checkout` v4 → v6
  - `actions/setup-node` v4 → v6
  - `actions/upload-artifact` v4 → v7
  - `docker/setup-buildx-action` v3 → v4

### Updated Dependencies
| Package | From | To |
|---|---|---|
| `lucide-react` | 0.453.0 | 0.577.0 |
| `@aws-sdk/client-s3` | 3.1001.0 | 3.1015.0 |
| `ioredis` | 5.10.0 | 5.10.1 |
| `sanitize-html` | 2.17.1 | 2.17.2 |
| `esbuild` | 0.27.3 | 0.27.4 |
| `eslint` | 9.39.3 | 9.39.4 |
| `@types/ioredis-mock` | 8.2.6 | 8.2.7 |
| `@types/sanitize-html` | 2.16.0 | 2.16.1 |

---

## [2.2.1] - 2026-03-24

### Security
- **fast-xml-parser** — Override bumped from 5.3.8 to 5.5.9 to fix entity expansion limit bypass (GHSA-jp2q-39xq-3w4g, GHSA-8gc5-j5rx-235r).
- **undici** — Bumped from ^6.23.0 to ^6.24.0 to fix WebSocket overflow crash, HTTP request smuggling, unbounded memory consumption, unhandled exception, and CRLF injection (5 CVEs).
- **effect** — Override added at 3.21.0 to fix AsyncLocalStorage context loss under concurrent load (GHSA-38f7-945m-qr2g), pulled transitively by Prisma.
- **flatted** — Override added at 3.4.2 to fix unbounded recursion DoS and prototype pollution in `parse()` (GHSA-25h7-pfq9-p65f, GHSA-rf6f-7fwh-wjgh), pulled transitively by ESLint.

### Changed
- **Dockerfile** — npm updated from 11.10.1 to 11.12.0 across all three stages.
- **Vitest** — Upgraded from ^1.6.1 to ^2.1.9 (with `@vitest/coverage-v8` ^2.1.9), eliminating deprecated `glob@7`/`inflight` transitive dependencies.
- **zod** — Bumped from ^3.24.4 to ^3.25.76, resolving peer dependency conflict with `zod-validation-error` from `eslint-plugin-react-hooks`.
- **test-exclude** — Override added at 8.0.0 to pull `glob@13` instead of deprecated `glob@10`.

---

## [2.2.0] - 2026-03-24

### Added
- **76 unit/integration test files** — Expanded from 46 to 76 test files (641 tests total), covering every module in `src/lib/` and `src/proxy.ts`.
- **17 gap-coverage test files** — Targeted tests for previously uncovered branches and edge cases:
  `audit.gap`, `auth.gap`, `crypto.gap`, `csrf.gap`, `health.gap`, `ip.gap`,
  `pinnedClient.gap`, `proxy.gap`, `rateLimit.gap`, `redis.gap`, `sanitizeIconUrl.gap`,
  `sso.gap`, `ssrf.gap`, `storage.gap`, `storageConfig.gap`, `svgProcessor.gap`, `userCache.gap`.
- **Coverage thresholds enforced** — Vitest now enforces minimum coverage: 90% statements, 90% lines, 75% branches, 88% functions.

### Changed
- **Coverage jump** — Statement coverage raised from 64.63% to 92.42%; branch coverage from 69.98% to 79.98%; function coverage from 69.78% to 90.6%.
- **`.gitignore` hardened** — Added patterns for temporary output files (`*-output.txt`, `*-result.txt`, `coverage_*.txt`, `pinned*.txt`, `test_svg_*.js`) to prevent workspace clutter.

### Removed
- **22 stale files cleaned up** — Removed ad-hoc debug scripts (`scripts/azure_test.js`, `scripts/debug-import.js`), database inspection scripts (`test/check-db-*.js`, `test/check-db-sso.ts`), decryption debug scripts (`test/debug-decrypt.js`, `test/test-decryption.js`, `test/test-providers-api.js`), superseded SVG test scripts (`test_svg_*.js`), and temporary coverage/test output files.

---

## [2.1.0] - 2026-03-23

### Changed
- **Middleware → Proxy** — Renamed `src/middleware.ts` to `src/proxy.ts` and exported function from `middleware()` to `proxy()` per Next.js 16 convention. Updated all test imports accordingly.
- **Tailwind CSS v4** — Migrated from Tailwind CSS v3 to v4 with CSS-first configuration.
  - Replaced `@tailwind base/components/utilities` directives with `@import "tailwindcss"` in `globals.css`.
  - Moved all theme customisations (colors, fonts, shadows, background images) from `tailwind.config.ts` into `@theme { }` block in `globals.css`.
  - Added `@variant dark` directive for selector-based dark mode (`data-theme="dark"`).
  - Replaced `theme('backgroundImage.hero-grid')` calls with `var(--background-image-hero-grid)` CSS variables.
  - Updated `postcss.config.js` to use `@tailwindcss/postcss` plugin.

### Added
- **`@tailwindcss/postcss`** — New PostCSS plugin for Tailwind CSS v4.

### Removed
- **`autoprefixer`** — No longer needed (bundled into Tailwind CSS v4).
- **`tailwind.config.ts`** — Deprecated; all configuration now lives in CSS-first `@theme` directives.

### Updated Dependencies
| Package | From | To |
|---|---|---|
| `tailwindcss` | ^3.4.10 | ^4.0.0 |
| `@tailwindcss/postcss` | — | (new) |
| `autoprefixer` | ^10.4.20 | (removed) |

---

## [2.0.0] - 2026-03-23

### Breaking Changes
- **Node.js 24** — Minimum Node.js version raised from 20 to 24. Dockerfile, CI, and `engines` field updated.
- **Next.js 16** — Upgraded from Next.js 15 to 16 (Turbopack default). Webpack config removed in favor of native `tsconfig.json` path aliases.

### Changed
- **Dockerfile** — Base images updated from `node:20-bookworm-slim` to `node:24-bookworm-slim` across all three stages (deps, builder, runner).
- **CI workflow** — GitHub Actions `setup-node` updated from Node 20 to Node 24.
- **next.config.mjs** — Removed `webpack()` alias config (now handled natively by Turbopack via `tsconfig.json` paths). Removed deprecated `experimental.serverActions` block. Removed invalid top-level `serverActions` key.
- **`revalidateTag` API** — Updated `safeRevalidateTag` to pass required second `profile` argument per Next.js 16 API change.
- **`unstable_cache` removal** — Replaced `unstable_cache` (removed in Next.js 16) with simple TTL-based in-memory caching in `storageConfig.ts`. Added `invalidateStorageConfigCache()` export. Removed unused `unstable_cache` import from `sso.ts`.
- **Storage config invalidation** — Admin actions that save or test storage now call `invalidateStorageConfigCache()` alongside `safeRevalidateTag`.

### Added
- **`.nvmrc`** — Added with value `24` for team consistency.
- **`engines` field** — Added `"node": ">=24.0.0"` to `package.json`.

### Updated Dependencies
| Package | From | To |
|---|---|---|
| `next` | ^15.1.0 | ^16.0.0 |
| `next-auth` | ^4.24.7 | ^4.24.13 |
| `@next/eslint-plugin-next` | ^15.5.12 | ^16.0.0 |
| `eslint-config-next` | ^15.1.0 | ^16.0.0 |
| `@playwright/test` | ^1.49.1 | ^1.51.1 |
| `@types/node` | ^20.19.35 | ^24.0.0 |

---

## [1.0.1] - 2025-06-20

### Security
- **CRITICAL: Cookie parsing** — Fixed `getSessionIdFromCookie()` splitting on all `=` characters, corrupting base64 JWT session IDs. Now splits only on the first `=`.
- **Rate limiting on personal app actions** — Added `assertRateLimit` to `createPersonalApp`, `updatePersonalApp`, and `deletePersonalApp` to prevent abuse.
- **Rate limiting on profile image upload** — Added `assertRateLimit` to `updateProfileImage`.
- **Self-delete check reordering** — Moved self-deletion guard in `deleteUser` before DB lookup and rate-limit consumption to prevent resource waste on invalid requests.
- **Role deletion race condition** — Wrapped `deleteRole` in a Prisma `$transaction` with inner count check to prevent concurrent assignment/deletion races.
- **Key ring cache invalidation** — `loadKeyRing()` now hashes the environment key and invalidates cache on mismatch, preventing stale keys after rotation.
- **CSRF wrapper utility** — Added generic `withCsrf<T>()` helper in csrf.ts for consistent server action CSRF enforcement.
- **Termination cache unbounded growth** — Added `TERMINATION_CACHE_MAX` (1000) and `pruneTerminationCache()` to bound the `logSessionTerminationOnce` Map.
- **Auth options caching** — `getAuthOptions()` now caches results for 60 seconds, avoiding repeated DB/config reads on every request.
- **SVG data URI tightening** — Removed `data:` from global allowed schemes in SVG sanitizer; only `<image>` tags may use `data:image/(png|jpeg|gif|webp);base64,` URIs.
- **S3 path traversal guard** — `deleteS3` now validates key starts with `uploads/` before issuing delete.
- **SSRF blocklist approach** — Changed `isPublicIp` from allow-match (`unicast`) to explicit blocklist of private/loopback/reserved ranges.
- **Production logging** — Suppressed `console.log` of provider list when `NODE_ENV === 'production'`.

### Changed
- **Magic byte deduplication** — Extracted `detectImageType()` helper in storage.ts, replacing four duplicated magic-byte blocks in `saveLocal`, `saveS3`, `saveAzure`, and `saveIcon`.
- **TypeScript cleanup** — Replaced `@ts-ignore` comments in userCache.ts with proper `(prisma.user as any)` casts.
- **Documentation** — Added inline comment explaining `allowEmailLinking = false` security rationale.

### Fixed
- **Test regression** — Added `assertRateLimit` mock to `personalApp.actions.test.ts` to prevent in-memory rate limiter exhaustion across test suite.

---

## [1.0.0] - 2026-03-23

### Added

#### Testing & Quality
- **46 unit test files** covering 254 assertions across all critical modules.
- Password policy unit tests (`test/passwordPolicy.test.ts`) — DB result, null fallback, error fallback, field mapping.
- User cache unit tests (`test/userCache.test.ts`) — memCache hit, TTL expiry, DB fallback, cache clearing.
- Crypto envelope encryption tests (`test/crypto.envelope.test.ts`) — V3 envelope mode, V2 default, key rotation with V3, `getSecretKeyId`, `encryptSecretWithKeyId`, invalid payloads.
- Health system tests (`test/health.system.test.ts`) — database, Redis, storage (local/S3/Azure), schema sync, and `getSystemHealth` aggregation.
- Category management action tests (`test/category.actions.test.ts`) — CRUD operations with CSRF, auth, must-change-password, validation, and DB error handling.
- Favorite apps action tests (`test/favoriteApps.actions.test.ts`) — toggle add/remove, CSRF, auth guards, `getFavoriteApps` list/unauthed/error paths.
- Cron cleanup API route tests (`test/api.cronCleanup.test.ts`) — bearer auth, cleanup execution, internal error handling.
- Password complexity and hashing tests (`test/password.test.ts`).
- Site config logo resolution tests (`test/siteConfig.test.ts`).
- Auth config session lifetime tests (`test/authConfig.test.ts`).
- SVG processor utility tests (`test/svgProcessor.test.ts`).
- IP normalization and private range detection tests (`test/ip.normalizeIp.test.ts`).
- Storage config provider mapping tests (`test/storageConfig.test.ts`).
- **4 E2E test suites** with Playwright: admin flows, app interactions, auth flows, personal apps.

#### CI/CD
- GitHub Actions security workflow (`.github/workflows/security.yml`) — CodeQL analysis on push/PR/weekly schedule, dependency review on PRs with high-severity failure threshold.
- Dependabot configuration (`.github/dependabot.yml`) — weekly npm and GitHub Actions updates with grouped dev/production dependencies.
- Unit test coverage reporting in CI — `@vitest/coverage-v8` with text, JSON summary, and LCOV reporters, uploaded as build artifacts.
- Redis service container added to E2E test job.

#### Core Features
- Envelope encryption (V3) for SSO secrets with AES-256-GCM wrapped data keys.
- Multi-key rotation support for SSO master keys (comma-separated, JSON array, JSON object formats).
- Password policy enforcement with configurable complexity rules and password history.
- User metadata caching with Redis primary and in-memory fallback.
- Health dashboard with database, Redis, storage, and schema sync checks.
- Category management (create, update, delete) with audit logging.
- Favorite apps toggle and retrieval for personalized dashboards.
- Personal apps CRUD with per-user limits and URL scheme validation.
- Profile image management with storage-agnostic icon handling.
- Cron-based orphaned icon cleanup with bearer token authentication.
- App launch tracking with audit logging and latency measurement.
- App ordering API with per-user persistence.
- SSRF protection with pinned IP clients and DNS rebinding prevention.
- SVG upload sanitization with magic-byte validation.
- Nonce-based strict CSP — no `unsafe-inline` for scripts or styles.
- Rate limiting with Redis-backed distributed enforcement.
- Session revocation via `securityStamp` rotation on security events.
- Idle and absolute session timeouts with configurable durations.
- CSRF protection for both authenticated and public flows via HMAC-signed tokens.
- Flexible storage backend — Local filesystem, AWS S3, and Azure Blob Storage.
- Admin audit logging for all state-changing operations.
- Command palette (Ctrl+K) for instant search across apps and admin pages.
- Dark/light theme with glassmorphism UI design.

### Fixed
- `linkSsoAccount` test failing due to missing rate limiter mock — added `@/lib/rateLimit` mock to bypass Redis dependency in test environment.

---

## [0.1.0] - Initial Development

### Added
- Initial project scaffolding with Next.js 15, React 19, TypeScript 5, and Prisma 6.
- Docker-based deployment with standalone container output.
- Core authentication with NextAuth v4 (Azure AD, Keycloak, Credentials).
- PostgreSQL database with Prisma ORM.
- Redis integration for caching and rate limiting.
- Basic admin dashboard and app catalogue.
