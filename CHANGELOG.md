# Changelog

All notable changes to TechHub are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
