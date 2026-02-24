## Redis configuration and usage

This document describes how TechHub uses Redis, the local `docker-compose` defaults, and how to configure an external Redis for production or CI.

### What Redis is used for

- Server-side user metadata cache (roles and `mustChangePassword`). This keeps sessions authoritative without forcing every request to hit the database.
- Optional rate-limiter backend when `RATE_LIMIT_STORE=redis`.

### Local development (out of the box)

- The repository's `docker-compose.yml` starts a Redis container named `redis` and sets `REDIS_URL` in the `app` service to `redis://redis:6379` by default. Running `docker compose up --build` will provide a working Redis instance for local development.
- The compose file also sets `RATE_LIMIT_STORE=redis` by default for local runs so the rate limiter uses Redis instead of the in-memory store.

### Using an external Redis

- To use an external Redis (recommended for production), set `REDIS_URL` in your environment to point to the external host, for example:

```
REDIS_URL=redis://:password@redis.example.com:6379
```

- Optionally set `REDIS_PASSWORD` and `REDIS_TLS=true` if your provider requires separate password/TLS flags. The app will pass TLS options to `ioredis` when `REDIS_TLS=true`.

- Ensure `RATE_LIMIT_STORE=redis` is set in your production environment to enable the Redis-backed rate limiter.

### Failure and behavior

- The application treats Redis as the authoritative store for user metadata and (when `RATE_LIMIT_STORE=redis`) for rate limiting. There is no silent in-memory fallback in this mode. If `RATE_LIMIT_STORE=redis` and `REDIS_URL` is not set or Redis cannot be reached, the application will fail fast. This prevents TOCTOU/inconsistency issues and enforces production parity during development and CI.

- For local development run `docker compose up --build` — the included compose file starts a `redis` service and the app will default to `REDIS_URL=redis://redis:6379`. In CI and production ensure `REDIS_URL` points to a reachable Redis endpoint (TLS/password support available via `rediss://` and `REDIS_PASSWORD`).

### Security and operations

- Use ACLs, network rules, and TLS when running Redis in production. Don't expose Redis directly to the public internet.
- Monitor latency and eviction metrics. When using Redis for rate limiting, misconfiguration can cause service disruptions if Redis becomes unavailable.

### CI

- CI workflows in `.github/workflows/ci.yml` now start a Redis service and set `REDIS_URL=redis://localhost:6379` and `RATE_LIMIT_STORE=redis` for pipeline runs so tests exercise the Redis-backed behavior.

### Azure Container Apps / Deployment notes

- When deploying to Azure Container Apps (or other container platforms), prefer injecting `REDIS_URL` and `REDIS_PASSWORD` as runtime environment variables (platform UI, `az` CLI, or linked Key Vault) rather than baking them into the image.

- Example: using Azure Container Apps with plain env-vars (quick, less secure):

```bash
az containerapp create \
	--name techhub-app \
	--resource-group my-rg \
	--image myregistry/techhub:latest \
	--env-vars REDIS_URL="rediss://my-redis.redis.cache.windows.net:6380" REDIS_PASSWORD="<your-password>"
```

- Recommended: store the Redis password in Azure Key Vault and reference it from the Container App as a secret. This keeps secrets out of CI logs and the image.

1. Create or import the secret into Key Vault:

```bash
az keyvault secret set --vault-name my-kv --name REDIS-PASSWORD --value "<your-password>"
```

2. Grant the Container App access to the Key Vault and reference the secret as an environment variable in the Container App configuration. In the Container App YAML or via `az containerapp update` you can reference Key Vault secrets; the platform will inject the value at runtime as `REDIS_PASSWORD`.

- If you use Azure Cache for Redis, prefer the provided `rediss://` endpoints for TLS. Ensure the client in `src/lib/userCache.ts` and `src/lib/rateLimit.ts` are configured to use TLS when `REDIS_TLS=true` or when a `rediss://` scheme is present.

- Summary: platform env-vars override local `.env` behavior. Keep secrets in Key Vault and wire them into Container Apps at runtime for best security.
