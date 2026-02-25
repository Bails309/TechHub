# TechHub

TechHub is a secure, admin-managed internal app-launcher portal built with Next.js, Prisma, and Docker. This README documents local development, Docker deployment, the new Nginx reverse-proxy setup, and production security recommendations.

---

## Quick overview

- Next.js (App Router) + TypeScript + Tailwind
- Authentication: NextAuth (SSO providers + optional local credentials)
- Database: PostgreSQL (Prisma)
- Redis: optional local Redis for caching and Redis-backed rate limiting
- Reverse proxy: Nginx (recommended). See TLS guidance below — Nginx does not
  automatically provision certificates.

---

## What's new / important changes

- Redis and the app no longer bind to all interfaces by default. They are bound to `127.0.0.1` in the compose file to prevent accidental exposure.
- The seed script no longer contains a hardcoded admin password — it will generate and print a one-time password if `ADMIN_PASSWORD` is not set.
- Test-only auth fallback now requires an explicit guard: set `UNSAFE_TEST_AUTH=true` in your test environment to enable it; otherwise tests should use dependency injection or mocks.
- A production-ready Nginx reverse proxy has been added and configured with strong security headers and logging. TLS
  provisioning is not automatic; see the TLS section for recommended approaches.

---

## Repository layout (high level)

- `src/` — application source
- `prisma/` — Prisma schema and `seed.ts`
`nginx/default.conf` — Nginx configuration used by docker-compose
- `docker-compose.yml` — development/production docker compose (app, db, redis, proxy)
- `TESTING.md` — testing guidance
- `docs/` — additional deployment and infra notes

---

## Requirements

- Node.js 20+ (for local dev)
- Docker & Docker Compose (for containerized runs)

---

## Environment variables

Core variables (short list — see `.env` for full set):

- `NEXTAUTH_SECRET` — required for NextAuth JWT signing (use a strong, random value)
- `NEXTAUTH_URL` — base URL (e.g. `https://app.example.com`)
- `DATABASE_URL` — Postgres connection string
- `SSO_MASTER_KEY` — base64 32‑byte key for encrypting SSO provider secrets
- `REQUIRE_PREPROVISIONED_USERS` — recommended: `true` to prevent SSO self-registration
- `REDIS_URL`, `REDIS_PASSWORD`, `REDIS_TLS` — Redis connection settings
- `DOMAIN` — (optional) public domain used for routing and certificate management
  (if you provision certificates).
- `TLS_CERT_PATH`, `TLS_KEY_PATH` — paths to TLS certificate and private key when
  mounting certs into the `nginx` container. Alternatively use an external
  certificate provisioning workflow (certbot container, cloud LB, etc.).
- `ADMIN_EMAIL` — seeded admin email
- `ADMIN_PASSWORD` — leave blank to force generated one-time password at seed time

Security notes
- Never commit secrets to git. Use host secret stores or your orchestrator's secret manager.
- Keep `SSO_MASTER_KEY` offline/secure; losing it can make stored SSO secrets unrecoverable.

---

## Local development

1. Copy `.env.example` to `.env` and set values for local dev. Leave `DOMAIN` empty for local runs.
2. Install dependencies:

```bash
npm install
```

3. Start Postgres and Redis via Docker compose (recommended):

```bash
docker-compose up -d db redis
```

4. Generate Prisma client and run migrations/push:

```bash
npm run prisma:generate
npm run prisma:push
```

5. Seed data (the seed will print a one-time admin password if `ADMIN_PASSWORD` is empty):

```bash
npm run prisma:seed
```

6. Run the app locally:

```bash
npm run dev
```

Visit `http://localhost:3000`.

---

## Dockerized app (recommended development and simple production)

The repository includes a `docker-compose.yml` that defines services for `app`, `db`, `redis`, and `proxy` (nginx).

Build and run all services:

```bash
docker-compose up -d --build
```

Notes:
- The `app` service is intentionally bound to `127.0.0.1:3000:3000` to avoid accidental exposure.
- The `proxy` (nginx) listens on host port `80` by default and routes to `app:3000`.
- To enable HTTPS you must provide TLS certificates to Nginx (see below) or
  terminate TLS at a load balancer in front of the host.
- The seed runs during startup and prints a generated admin password if none is provided in `.env`. Check the `app` logs to retrieve it:

```bash
docker-compose logs app --tail 200
```

---

## Nginx reverse proxy (production-ready guidance)

We provide an `nginx/default.conf` and a `proxy` service in `docker-compose.yml` that routes external requests to `app:3000`.

Key points
- Nginx does not automatically provision ACME certificates. You have three common options to enable HTTPS:
  - Mount valid TLS certs into the container and set `TLS_CERT_PATH`/`TLS_KEY_PATH` in your host `.env`.
  - Run a separate ACME/certbot container to obtain certificates and mount them into Nginx.
  - Terminate TLS at a cloud load balancer (recommended for managed infra) and keep Nginx behind it.

How to enable HTTPS with mounted certs
1. Place your `fullchain.pem` and `privkey.pem` on the host and mount them into the `nginx` service (see `docker-compose.yml`).
2. Set `TLS_CERT_PATH` and `TLS_KEY_PATH` in your host `.env` to the in-container paths where the certs are mounted.
3. Open host firewall for port 443 and restart the stack:

```bash
docker-compose up -d --build
```

Monitor the proxy logs with:

```bash
docker-compose logs proxy --follow
```

Replacing TLS certificates

- To replace the TLS certs used by the compose `nginx` proxy, place your
  `fullchain.pem` and `privkey.pem` files into the `./nginx/certs` directory
  on the host (or mount a secret volume there). The `init-cert.sh` script
  will copy them into the container at `/etc/nginx/certs` on startup.
- After replacing certs on the host, reload or restart the proxy to pick up
  the new files:

```bash
docker-compose exec proxy nginx -s reload
# or
docker-compose restart proxy
```

- For automation, consider using a certbot container that writes certs to
  `./nginx/certs` and signals Nginx to reload when certificates are renewed.

Proxy health-check

- The `proxy` service includes a Docker health-check that verifies cert files
  exist and attempts a basic HTTP probe. Check the container health with:

```bash
docker inspect --format='{{.State.Health.Status}}' $(docker-compose ps -q proxy)
```

- If you replace certs manually, confirm the health-check returns `healthy` after
  reloading Nginx.

Security and production hardening
- Run the proxy on a host with minimal services and enable host-level firewall rules that only allow necessary sources.
- Mount certificates from a secure location or integrate with your secret manager; do not keep private keys in the repo.
- Rotate and secure access logs: the compose setup writes proxy logs to the container and they can be streamed with `docker-compose logs proxy`.
- If you need stricter access, put a WAF or IP allow-list in front of the proxy, or terminate TLS at a managed load balancer.

---

## Recommended production checklist

- Provide secrets to the runtime via a secrets manager (do NOT commit secrets to `.env` in the repo).
- Set `REQUIRE_PREPROVISIONED_USERS=true` to avoid SSO self-registration.
- Use an external, managed Redis with strong auth and TLS; set `REDIS_URL` and `REDIS_PASSWORD` in production.
- Set `RATE_LIMIT_STORE=redis` for a distributed rate limiter.
- Set `TRUST_PROXY=true` and `TRUSTED_PROXIES` to your proxy CIDRs if you run behind proxies or load balancers.
- Ensure `NEXTAUTH_URL` reflects the external URL (https://...)
- Ensure `NEXTAUTH_SECRET` is a long random value and rotated securely.
- Ensure `SSO_MASTER_KEY` is provisioned and backed up securely.

---

## Logs and monitoring

- App logs are streamed from the container; use `docker-compose logs app --follow` for live logs.
- Caddy logs are stored in `/var/log/caddy` inside the `caddy_logs` volume (mounted by compose). Rotate and ship them to your log aggregator.
- Monitor health endpoint at `/api/health` for basic uptime checks.

---

## Tests

See `TESTING.md` for details. Key points:
- Unit/integration tests run using Vitest.
- The test-time auth fallback now requires `UNSAFE_TEST_AUTH=true` if you rely on the fallback; prefer explicit mocks / DI in tests.
- To run tests inside Docker (recommended):

```bash
docker-compose build app
docker-compose run --rm app sh -c "CI=true npm test --reporter=verbose"
```

---

## Troubleshooting

- If the admin UI is not reachable, ensure:
  - `app` is running: `docker-compose ps`
  - The app is bound to localhost and the `nginx` proxy is routing requests (check `proxy` logs)
  - You used the seeded admin password printed by the seed step or set `ADMIN_PASSWORD` securely

- If Redis errors occur, verify `REDIS_URL`/`REDIS_PASSWORD` and that the `redis` service is reachable from `app` (compose network). For production, prefer a managed Redis instance.

---

## Contributing

- Follow repository coding conventions and run `npm run lint` before creating a PR.
- Don't commit secrets. Use `.env.example` to document expected env vars.

---

If you'd like, I can also:
- Add a sample GitHub Actions workflow that sets secrets and runs Docker-based tests.
- Provide an optional Nginx configuration instead of Caddy.
- Configure log forwarding to a host directory or syslog for easier collection.

