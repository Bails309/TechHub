## Redis Configuration and Usage

This document describes how TechHub uses Redis, the local `docker-compose` defaults, and how to configure an external Redis for production or CI.

### What Redis Is Used For

- **Server-side user metadata cache** (roles and `mustChangePassword`). Keeps sessions authoritative without forcing every request to hit the database.
- **Rate-limiter backend** when `RATE_LIMIT_STORE=redis`.

### Local Development (Out of the Box)

The repository's `docker-compose.yml` starts a Redis container named `redis` and sets `REDIS_URL` in the `app` service to `redis://redis:6379` by default. Running `docker compose up --build` provides a working Redis instance. The compose file also sets `RATE_LIMIT_STORE=redis` by default so the rate limiter uses Redis locally.

### Using an External Redis

To use an external Redis (recommended for production), set `REDIS_URL` in your environment:

```
REDIS_URL=redis://:password@redis.example.com:6379
```

- Optionally set `REDIS_PASSWORD` and `REDIS_TLS=true` if your provider requires separate password/TLS flags. The app passes TLS options to `ioredis` when `REDIS_TLS=true`.
- Ensure `RATE_LIMIT_STORE=redis` is set in your production environment.

> **Note:** In production the application enforces a centralized rate limiter. If `RATE_LIMIT_STORE` is not set to `redis`, the application will refuse to start (fail fast) to avoid insecure memory-based rate limiting across multiple instances. Use the in-memory store only for single-process local testing.

### Failure Behavior

The application treats Redis as the authoritative store for user metadata and (when `RATE_LIMIT_STORE=redis`) for rate limiting. There is no silent in-memory fallback. If `RATE_LIMIT_STORE=redis` and Redis cannot be reached, the application will fail fast. This prevents TOCTOU/inconsistency issues and enforces production parity.

**Operational guidance:**

- For production, provide a highly available Redis (clustered or managed service) and point `REDIS_URL` at it. Configure `REDIS_PASSWORD`/`REDIS_TLS` as needed.
- If you must run without Redis in development, set `RATE_LIMIT_STORE=memory` locally, but do not use this in any multi-host environment.

### Security and Operations

- Use ACLs, network rules, and TLS when running Redis in production. Don't expose Redis directly to the public internet.
- Monitor latency and eviction metrics. Misconfiguration can cause service disruptions if Redis becomes unavailable.

### CI

CI workflows in `.github/workflows/ci.yml` start a Redis service and set `REDIS_URL=redis://localhost:6379` and `RATE_LIMIT_STORE=redis` so tests exercise the Redis-backed behavior.

For the `docker-build` smoke test job, the workflow starts a Redis container and links it into the container built from the app image, passing `REDIS_URL=redis://redis:6379` and `RATE_LIMIT_STORE=redis`.

If you want CI to run without Redis, remove the Redis service block and omit the environment variables — tests will fall back to in-memory stores, but that is not recommended for production parity.

### Azure Container Apps / Deployment Notes

When deploying to Azure Container Apps (or other container platforms), inject `REDIS_URL` and `REDIS_PASSWORD` as runtime environment variables rather than baking them into the image.

**Quick (less secure):**

```bash
az containerapp create \
  --name techhub-app \
  --resource-group my-rg \
  --image myregistry/techhub:latest \
  --env-vars REDIS_URL="rediss://my-redis.redis.cache.windows.net:6380" REDIS_PASSWORD="<your-password>"
```

**Recommended — store secrets in Azure Key Vault:**

1. Create or import the secret:

   ```bash
   az keyvault secret set --vault-name my-kv --name REDIS-PASSWORD --value "<your-password>"
   ```

2. Grant the Container App access to Key Vault and reference the secret as an environment variable in the Container App configuration. The platform injects the value at runtime as `REDIS_PASSWORD`.

If you use Azure Cache for Redis, prefer the `rediss://` endpoints for TLS. Ensure the clients in `src/lib/userCache.ts` and `src/lib/rateLimit.ts` use TLS when `REDIS_TLS=true` or when a `rediss://` scheme is present.
