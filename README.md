# TechHub

Modern app-launcher portal for internal teams with SSO, credential fallback, and an admin-managed catalogue.

**Important:** SSO sign-in now requires users to be pre-provisioned with a local account. Admins must explicitly link SSO accounts to local users via the admin UI. Self-registration via SSO is blocked by default for security.

## Highlights
- Next.js App Router + TypeScript + Tailwind
- Microsoft Entra ID and Keycloak SSO, with optional local credentials
- **SSO sign-in requires pre-provisioned users; SSO accounts must be linked by an admin**
- Admin-managed catalogue with role-based and user-specific access
- Configurable password policy and forced first-login reset for local users
- Per-user app ordering, search, and theme toggle
- Docker build + Postgres 16 + Prisma 5

## Tech stack
- Next.js 15, React 18
- NextAuth (JWT sessions)
- Prisma 5 + Postgres 16
- Tailwind CSS

## Quick start (local)
1. Install Node.js 20+ and Docker Desktop.
2. Copy `.env.example` to `.env` and set values.
3. Install dependencies: `npm install`
4. Start database: `docker compose up -d db`
5. Generate Prisma client: `npm run prisma:generate`
6. Apply schema: `npm run prisma:push`
7. Seed sample data: `npm run prisma:seed`
8. Start app: `npm run dev`

## Quick start (Docker)
1. Copy `.env.example` to `.env` and set values.
2. Build and run: `docker compose up --build`

The compose entrypoint runs `prisma db push` and `prisma db seed` before `npm start`.


## Environment variables
- `NEXTAUTH_SECRET`: required for NextAuth JWT signing
- `NEXTAUTH_URL`: app base URL (use `http://localhost:3000` locally)
- `DATABASE_URL`: Postgres connection string
- `SSO_MASTER_KEY`: base64-encoded 32-byte key for encrypting SSO secrets in the database (single-key mode)
- `SSO_ENVELOPE_ENCRYPTION`: set to `true` to use envelope encryption (per-secret data keys wrapped by the master key)
- `ADMIN_EMAIL`: seeded admin user email (initial admin only)
- `ADMIN_PASSWORD`: seeded admin user password (initial admin only; user must change on first login)
- `AZURE_AD_CLIENT_ID`: Entra ID client ID (optional fallback if no DB config)
- `AZURE_AD_CLIENT_SECRET`: Entra ID client secret (optional fallback if no DB config)
- `AZURE_AD_TENANT_ID`: Entra ID tenant ID (optional fallback if no DB config)
- `KEYCLOAK_CLIENT_ID`: Keycloak client ID (optional fallback if no DB config)
- `KEYCLOAK_CLIENT_SECRET`: Keycloak client secret (optional fallback if no DB config)
- `KEYCLOAK_ISSUER`: Keycloak issuer URL (optional fallback if no DB config)
- `ENABLE_CREDENTIALS`: set to `false` to disable local credentials login when no DB config exists
- `ALLOW_SSO_EMAIL_LINKING`: set to `true` to auto-link SSO users to existing local accounts by email (default: `false`). When `false`, SSO accounts must be linked by an admin.
- `TRUST_PROXY`: set to `true` when running behind a trusted reverse proxy to trust `X-Forwarded-For` and related headers.
- `TRUSTED_PROXIES`: optional comma-separated list of CIDRs/IPs for immediate trusted proxies (e.g. `10.0.0.0/8,203.0.113.5`). When set, proxy headers are only trusted if the immediate remote address matches one of these CIDRs.
- `REQUIRE_PREPROVISIONED_USERS`: set to `true` (default/recommended) to block SSO sign-in unless a local user exists. Prevents SSO self-registration.

- `REDIS_URL`: optional Redis connection string (e.g. `redis://redis:6379`). When set, the app uses Redis for the server-side user metadata cache and (optionally) the rate limiter. If not set, the app falls back to an in-memory cache suitable for single-process development only.

- `USER_META_CACHE_TTL_SEC`: optional TTL in seconds for cached user metadata (roles and `mustChangePassword`). Defaults to `300` (5 minutes). Tune for your deployment's freshness vs. load trade-offs.

Generate a master key with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> Note: key-ring rotation support has been removed in this branch — the app uses a single
> `SSO_MASTER_KEY` for encrypting and decrypting SSO provider secrets. Keep a secure copy
> of the master key before changing it; existing secrets encrypted with this key will not
> be recoverable if the key is lost.


## Authentication flow
- Local credentials are optional and can be disabled globally or via the admin UI.
- SSO providers are configured in the admin UI and stored encrypted using `SSO_MASTER_KEY`.
- First-time local users must change their password at `/auth/change-password`.
- **SSO sign-in is only allowed for users who already exist locally.**
- **Admins must explicitly link SSO accounts to local users via the admin UI.**
 - Automatic email-based linking is disabled. Admins must explicitly link SSO accounts to local users via the admin UI.
 - The `ALLOW_SSO_EMAIL_LINKING` option is deprecated and not recommended; enabling it may expose accounts to unintended linking risks.


## Admin workflow
- Visit `/admin` to manage apps, roles, users, and SSO settings.
- Admin access requires the `admin` role on the user.
- Configure SSO providers from the "SSO configuration" section (requires `SSO_MASTER_KEY` to save secrets).
- Create local users, roles, and user-specific app assignments from the admin UI.
- **Link SSO accounts to local users using the "Link SSO Account" form in the admin UI.**
	- The form includes a helper to extract the provider account ID (`sub`) from a JWT or raw ID string.
	- SSO accounts cannot be linked automatically unless `ALLOW_SSO_EMAIL_LINKING` is enabled.

Default password policy:
- Minimum length: 12
- Uppercase, lowercase, number, and symbol required
- Last 5 passwords cannot be reused
- Admins can change the policy from `/admin`

## App access rules
- `PUBLIC`: visible to everyone
- `AUTHENTICATED`: visible to signed-in users
- `ROLE`: visible to users with the assigned role
- `USER`: visible only to explicitly assigned users

## Uploads
- Icon uploads are stored in `uploads/` and served via `/uploads/*`.
- Icons are limited to PNG and JPEG only.
- Max icon upload size is 2 MB.
- Docker compose mounts a named volume at `/app/uploads` to persist icons.

## Tests

- Unit and integration tests run with Vitest. Tests are executed in CI mode inside the `app` Docker service to provide a reproducible environment with Postgres seeded.
- To run tests inside Docker (recommended):

```bash
docker compose up --build -d
docker compose exec app sh -c "CI=true npm test --reporter=verbose"
```

- To run tests locally without Docker (requires local Postgres and Prisma setup):

```bash
npm install
# ensure DATABASE_URL points to a running Postgres instance
npm run prisma:push
npm run prisma:seed
CI=true npm test --reporter=verbose
```

## Notable recent changes

- `ioredis` upgraded to v5; `ioredis-mock` bumped to 8.x for test compatibility.
- S3 client now uses a module-level singleton to reduce SDK client churn and improve connection reuse for AWS SDK v3.
- Admin actions enforce `mustChangePassword` for credential-based sessions; several server-action guards and safe cleanup logic were added to prevent orphaned uploads on DB failures.
- If you maintain CI, ensure the Docker-based test step runs before merging and that `SSO_MASTER_KEY` and other secrets are provided to the environment where needed.

## Scripts
- `npm run dev`: start development server
- `npm run build`: build production bundle
- `npm run start`: run production server
- `npm run lint`: lint
- `npm run prisma:generate`: generate Prisma client
- `npm run prisma:push`: push schema to database
- `npm run prisma:migrate`: create dev migration
- `npm run prisma:migrate:deploy`: apply migrations
- `npm run prisma:seed`: seed roles, admin user, and sample apps


## Security notes
- CSP is applied via middleware with a per-request nonce for scripts and styles (tightened to nonce-only for scripts/styles).
- SSRF protection is enforced for SSO issuer validation (DNS/IP validation).
- Rate limiting is hardened and respects the `TRUST_PROXY` flag.
- When running behind a reverse proxy, set `TRUST_PROXY=true` and configure `TRUSTED_PROXIES` to the immediate proxy IPs/CIDRs. The application parses `X-Forwarded-For` from right-to-left and uses the first public IP that is not in the immediate trusted proxy set; this prevents clients from spoofing headers when proxies are correctly configured.
- See [docs/proxy-trust.md](docs/proxy-trust.md) for deployment guidance and testing instructions to verify proxy/no-proxy behavior.
- `/api/app-order` returns 400 for invalid JSON or payloads.
- SSO secrets are encrypted at rest using AES-256-GCM with `SSO_MASTER_KEY`.

## Production notes
- Set a strong `NEXTAUTH_SECRET` and rotate the seeded admin password.
- If you prefer migrations, use `prisma:migrate` and `prisma:migrate:deploy` instead of `prisma:push`.
- Restrict access to `/admin` behind role assignment and SSO as appropriate.
