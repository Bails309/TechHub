# Azure Deployment Guide (ACA)

TechHub is optimized for deployment as an **Azure Container App (ACA)**. This guide details the mandatory configuration and infrastructure requirements for a production-ready environment.

## 1. Mandatory Environment Variables

Only the following variables are strictly required to get TechHub running securely behind the Azure Ingress.

| Variable | Required | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | **Yes** | Connection string for Azure Database for PostgreSQL. |
| `REDIS_URL` | **Yes** | `rediss://<name>.redis.azure.net:10000` (Use **rediss** for TLS). |
| `REDIS_PASSWORD` | **Yes** | Primary Access Key for Azure Cache for Redis. |
| `REDIS_TLS` | **Yes** | Set to `true` (Mandatory for Azure Redis). |
| `NEXTAUTH_SECRET` | **Yes** | 32-character random string for session signing. |
| `NEXTAUTH_URL` | **Yes** | Your public HTTPS domain (e.g., `https://hub.company.com`). |
| `SSO_MASTER_KEY` | **Yes** | 32-byte base64 string for database-side encryption. |
| `TRUST_PROXY` | **Yes** | Set to `true` to trust Azure's Ingress headers. |
| `ALLOW_MISSING_REMOTE_IP` | **Yes** | Set to `true` for Azure Container Apps. |
| `NODE_ENV` | **Yes** | Set to `production`. |

## 2. Infrastructure Setup

### Azure Database for PostgreSQL (Flexible Server)
- **Networking**: Enable "Public access (allowed IP addresses)" or use a VNet with a Private Endpoint.
- **SSL**: Ensure `sslmode=require` is appended to your `DATABASE_URL`.
- **Health**: TechHub automatically synchronizes its schema on startup via `prisma db push`.

### Azure Cache for Redis
- **Tier**: **Standard C1** or higher is recommended (Standard supports TLS and production SLA).
- **Port**: 10000 (standard for Azure Managed Redis) or 6380 (Legacy Azure Cache).
- **Policy**: Set eviction policy to `allkeys-lru` to protect sessions if memory hits limits.

### Azure Blob Storage (Optional)
Recommended for persistent icon storage in a scaled ACA environment.
- **Provider**: Set `STORAGE_PROVIDER="azure"`.
- **Variables**: Provide `AZURE_STORAGE_ACCOUNT` and `AZURE_STORAGE_KEY`.

## 3. Azure Container App Configuration

### Ingress Settings
- **Ingress**: Enabled.
- **Client Affinity**: Not required (TechHub is stateless; sessions are in Redis).
- **Target Port**: **3000**.
- **Transport**: `Auto` (supports HTTP/1.1 and HTTP/2).

### Secret Management
Use **Azure Key Vault** referenced directly in your Container App's "Secrets" section. Map these secrets to the environment variables listed in Section 1.

## 4. Hardening Behind Azure Proxy

TechHub is designed to be "Proxy Aware." Because Azure Container Apps terminates TLS and forwards the request via its internal ingress, the application must be told to trust the incoming headers.

### Why `ALLOW_MISSING_REMOTE_IP` is Mandatory
In many Azure Container App configurations, the immediate TCP socket IP is obscured by the internal ingress mesh. 
- If `TRUST_PROXY=true` but `ALLOW_MISSING_REMOTE_IP=false`, the application may reject requests because it cannot verify the immediate proxy is a "trusted" one.
- Setting `ALLOW_MISSING_REMOTE_IP=true` tells TechHub to trust the `X-Forwarded-*` headers supplied by Azure even when the socket sender IP is not available.

## 5. Deployment Checklist

- [ ] Create Resource Group, ACA Environment, and Managed Postgres/Redis.
- [ ] Build and push the TechHub image to **Azure Container Registry (ACR)**.
- [ ] Configure Ingress on Port 3000.
- [ ] Input all mandatory secrets and environment variables.
- [ ] Verify the "Health" tab in the Admin dashboard after first boot.
