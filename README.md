# TechHub

TechHub is a secure, admin-managed internal app-launcher portal built with Next.js, Prisma, and Docker.

---

## Quick Overview

- **Framework:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Auth:** NextAuth (SSO providers + optional local credentials)
- **Database:** PostgreSQL via Prisma
- **Cache & Rate Limiting:** Redis (required in production)
- **Reverse Proxy:** Nginx — TLS is not automatic; see the [TLS section](#nginx-reverse-proxy) below

---

## What's New

- Redis and the app no longer bind to all interfaces by default — they are bound to `127.0.0.1` in the compose file to prevent accidental exposure.
- The seed script no longer contains a hardcoded admin password — it generates and prints a one-time password if `ADMIN_PASSWORD` is not set.
- Test-only auth fallback now requires an explicit guard: set `UNSAFE_TEST_AUTH=true` in your test environment to enable it; prefer mocks or dependency injection instead.
- A production-ready Nginx reverse proxy has been added with strong security headers and logging. TLS provisioning is not automatic; see the [TLS section](#how-to-enable-https-with-mounted-certs) for recommended approaches.

---

## Repository Layout

```
├── src/                    Application source code
├── prisma/                 Prisma schema and seed.ts
├── test/                   Vitest test files
├── nginx/                  Nginx config, certs, and scripts
├── docs/                   Additional deployment and infra notes
├── scripts/                Runtime utility scripts (prestart checks, etc.)
├── .github/workflows/      CI workflows (ci.yml, test.yml)
├── docker-compose.yml      Docker Compose (app, db, redis, proxy)
├── Dockerfile              Multi-stage production build
├── .env.example            Documented environment variable template
├── TESTING.md              Testing guide
└── README.md               This file
```

---

## Requirements

- **Node.js 20+** (for local development)
- **Docker & Docker Compose** (for containerized runs)

---

## Environment Variables

Core variables (see `.env.example` for the full set with inline documentation):

| Variable | Purpose |
|----------|---------|
| `NEXTAUTH_SECRET` | Required — JWT signing key (use a strong random value) |
| `NEXTAUTH_URL` | Base URL (e.g. `https://app.example.com`) |
| `DATABASE_URL` | Postgres connection string |
| `SSO_MASTER_KEY` | Base64 32-byte key for encrypting SSO provider secrets |
| `REQUIRE_PREPROVISIONED_USERS` | Recommended `true` to prevent SSO self-registration |
| `REDIS_URL` | Redis connection string |
| `REDIS_PASSWORD` | Redis auth password (if required) |
| `REDIS_TLS` | Set `true` for TLS connections |
| `RATE_LIMIT_STORE` | Must be `redis` in production |
| `DOMAIN` | (Optional) Public domain for routing |
| `TLS_CERT_PATH` / `TLS_KEY_PATH` | Paths to TLS certificate and key inside the Nginx container |
| `ADMIN_EMAIL` | Seeded admin email |
| `ADMIN_PASSWORD` | Leave blank to generate a one-time password at seed time |
| `NODE_ENV` | Controls runtime mode (see below) |

### NODE_ENV Behavior

The runtime image sets `NODE_ENV=production` by default (see `Dockerfile`). A prestart security check will refuse to start in production if insecure database credentials (e.g. `techhub/techhub` or a missing/short password) are detected. For local development, set `NODE_ENV=development` in your host `.env` or via `docker-compose.yml` to avoid the production-only fatal check.

### Security Notes

- Never commit secrets to git. Use host secret stores or your orchestrator's secret manager.
- Keep `SSO_MASTER_KEY` offline/secure; losing it can make stored SSO secrets unrecoverable.

---

## Upload Storage (Local, S3, Azure Blob)

By default, uploads are saved to the local filesystem under `/uploads` in the app container. For multi-host or HA environments, configure object storage.

### S3-Compatible

- Set `STORAGE_PROVIDER=s3`
- Set `S3_BUCKET`, `S3_REGION`, and AWS credentials via environment
- Optional: `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE` for S3-compatible services

### Azure Blob Storage

- Set `STORAGE_PROVIDER=azure`
- Provide either `AZURE_STORAGE_CONNECTION_STRING` or `AZURE_STORAGE_ACCOUNT` + `AZURE_STORAGE_KEY`
- Set `AZURE_BLOB_CONTAINER` (e.g. `uploads`)
- Optional: `AZURE_BLOB_ENDPOINT` for emulators/private endpoints
- Optional: `AZURE_SAS_TTL_MINUTES` to control SAS expiry for admin-issued tokens

### Admin UI

The admin page includes a storage panel with a provider dropdown (local, S3, Azure). Secrets saved via the UI are encrypted using `SSO_MASTER_KEY`.

See [docs/azure-blob.md](docs/azure-blob.md) for Azure examples, SAS token usage, and best practices.

---

## Local Development

1. Copy `.env.example` to `.env` and set values for local dev. Ensure `NODE_ENV=development` is present. Leave `DOMAIN` empty for local runs.

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start Postgres and Redis via Docker Compose:

   ```bash
   docker-compose up -d db redis
   ```

4. Generate Prisma client and push the schema:

   ```bash
   npm run prisma:generate
   npm run prisma:push
   ```

5. Seed data (prints a one-time admin password if `ADMIN_PASSWORD` is empty):

   ```bash
   npm run prisma:seed
   ```

6. Run the app:

   ```bash
   npm run dev
   ```

Visit `http://localhost:3000`.

---

## Docker Deployment

The repository includes a `docker-compose.yml` that defines services for `app`, `db`, `redis`, and `proxy` (Nginx).

Build and run all services:

```bash
docker-compose up -d --build
```

### Notes

- The `app` service is not published to the host directly — all traffic goes through the `proxy` service.
- The `proxy` (Nginx) listens on host ports `80` and `443` and routes to `app:3000`.
- To enable HTTPS, provide TLS certificates to Nginx (see below) or terminate TLS at a load balancer in front of the host.
- The seed runs during startup. Check the `app` logs for the generated admin password:

  ```bash
  docker-compose logs app --tail 200
  ```

---

## Nginx Reverse Proxy

An `nginx/default.conf` and a `proxy` service in `docker-compose.yml` route external requests to `app:3000`.

### Key Points

- Nginx does **not** automatically provision ACME certificates. Three common options:
  1. Mount valid TLS certs into the container and set `TLS_CERT_PATH`/`TLS_KEY_PATH` in your host `.env`.
  2. Run a separate ACME/certbot container to obtain certificates and mount them into Nginx.
  3. Terminate TLS at a cloud load balancer (recommended for managed infra) and keep Nginx behind it.

### How to Enable HTTPS with Mounted Certs

1. Place your `fullchain.pem` and `privkey.pem` on the host and mount them into the `nginx` service (see `docker-compose.yml`).
2. Set `TLS_CERT_PATH` and `TLS_KEY_PATH` in your host `.env` to the in-container paths.
3. Open host firewall for port 443 and restart the stack:

   ```bash
   docker-compose up -d --build
   ```

### Replacing TLS Certificates

- Place `fullchain.pem` and `privkey.pem` files into the `./nginx/certs` directory on the host. The `init-cert.sh` script copies them into the container at `/etc/nginx/certs` on startup.
- After replacing certs, reload or restart the proxy:

  ```bash
  docker-compose exec proxy nginx -s reload
  # or
  docker-compose restart proxy
  ```

- For automation, consider a certbot container that writes certs to `./nginx/certs` and signals Nginx to reload on renewal.

### Proxy Health Check

The `proxy` service includes a Docker health check that verifies cert files exist and attempts a basic HTTP probe:

```bash
docker inspect --format='{{.State.Health.Status}}' $(docker-compose ps -q proxy)
```

### Security and Production Hardening

- Run the proxy on a host with minimal services and enable host-level firewall rules.
- Mount certificates from a secure location or integrate with your secret manager — do not keep private keys in the repo.
- Rotate and secure access logs. Proxy logs can be streamed with `docker-compose logs proxy`.
- For stricter access, put a WAF or IP allow-list in front of the proxy, or terminate TLS at a managed load balancer.

---

## Production Checklist

- [ ] Provide secrets via a secrets manager — do **not** commit secrets to `.env` in the repo.
- [ ] Set strong, unique `POSTGRES_USER` and `POSTGRES_PASSWORD` — the runtime refuses to start with default `techhub/techhub` credentials in production.
- [ ] Set `REQUIRE_PREPROVISIONED_USERS=true` to prevent SSO self-registration.
- [ ] Use an external, managed Redis with strong auth and TLS. Set `REDIS_URL` and `REDIS_PASSWORD`.
- [ ] Set `RATE_LIMIT_STORE=redis` — the app will fail fast in production without a Redis-backed rate limiter.
- [ ] Set `TRUST_PROXY=true` and `TRUSTED_PROXIES` to your proxy CIDRs if behind proxies or load balancers.
- [ ] Ensure `NEXTAUTH_URL` reflects the external URL (`https://...`).
- [ ] Ensure `NEXTAUTH_SECRET` is a long random value and rotated securely.
- [ ] Ensure `SSO_MASTER_KEY` is provisioned and backed up securely.

---

## Logs and Monitoring

- **App logs:** `docker-compose logs app --follow`
- **Proxy logs:** `docker-compose logs proxy --follow` (Nginx access/error logs are stored in the `nginx_logs` volume)
- **Health endpoint:** `/api/health` for basic uptime checks

---

## Tests

See [TESTING.md](TESTING.md) for the full testing guide.

- **Framework:** Vitest (unit and integration tests)
- **Test directory:** `test/` (14 test files)
- **CI workflows:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) and [`.github/workflows/test.yml`](.github/workflows/test.yml)

Quick run:

```bash
npm test
```

Run inside Docker (recommended to match CI):

```bash
docker-compose build app
docker-compose run --rm app sh -c "CI=true npm test -- --run"
```

---

## Contributing

- Follow repository coding conventions and run `npm run lint` before creating a PR.
- Don't commit secrets. Use `.env.example` to document expected env vars.
