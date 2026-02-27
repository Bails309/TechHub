# Production Deployment Guide 🚀

TechHub is designed to run as a **Standalone Container**. This guide details how to deploy it to production, with **Azure Container Apps** as the primary recommended platform.

---

## 🏛️ Architecture Overview

In a production environment, TechHub leverages managed cloud services for reliability:

- **Compute**: Azure Container Apps (ACA) - *Standalone App Router mode*.
- **Database**: Azure Database for PostgreSQL (Flexible Server).
- **Caching**: Azure Cache for Redis.
- **Storage**: Azure Blob Storage.
- **TLS/Ingress**: Handled by the cloud platform (Azure Front Door, Application Gateway, or ACA Ingress).

---

## 🌩️ Primary Method: Azure Container Apps (ACA)

This is the most streamlined way to deploy TechHub. The application's built-in security headers (HSTS, CSP) are compatible with Azure's managed Ingress.

### 1. Minimum Environment Variables
Only these variables are strictly required to get the portal running securely in ACA:

| Variable | Requirement | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | **Required** | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `REDIS_URL` | **Required** | `rediss://:pass@host:6380` (use `rediss` for TLS) |
| `NEXTAUTH_SECRET` | **Required** | A random 32-character string for session signing. |
| `NEXTAUTH_URL` | **Required** | Your public domain (e.g., `https://portal.company.com`). |
| `SSO_MASTER_KEY` | **Required** | Used to encrypt storage/SSO secrets in your database. |
| `NODE_ENV` | **Required** | Set to `production`. |

### 2. Standalone Configuration
- **Ingress**: Enable Ingress on Port **3000**.
- **Target Port**: 3000.
- **Transport**: Auto (supports HTTP/1.1 and HTTP/2).
- **TLS**: Managed by Azure. Reference your certificate from **Azure Key Vault** or use **Managed Certificates**.

### 3. Service Optimizations
- **Redis Tier**: Standard C1 or higher (Basic does not support TLS).
- **Eviction Policy**: Set Redis to `allkeys-lru`.

---

## 🏠 Secondary Method: Local or VPS Deployment

If you are deploying TechHub on a virtual machine (Ubuntu, Windows Server) or a local server, you **must** provide your own reverse proxy.

### Requirements:
1. **Docker**: Run the `app` container on a restricted internal port (e.g., 3000).
2. **Reverse Proxy (Nginx/Apache/Caddy)**:
   - Handle SSL termination (Port 443).
   - Forward traffic to the container (Port 3000).
   - **Crucial**: Ensure headers like `X-Forwarded-For` and `X-Forwarded-Proto` are passed to the app so NextAuth works correctly.

---

## 🛡️ Security Header Note
TechHub includes native security headers via `next.config.mjs`. When deployed behind a proxy (like Azure's Ingress):
- The app sends headers (HSTS, etc.) via HTTP to the proxy.
- The proxy relays these headers to the user over **HTTPS**.
- **Strict CSP**: The application enforces a strict, nonce-based Content Security Policy that forbids `'unsafe-inline'`. This provides deep protection against XSS attacks.
- Browsers respect these headers as they arrive over a secure connection.

---

## 🛠️ Post-Deployment Checklist

- [ ] **Prisma Migration**: Run `npx prisma migrate deploy` against your production database.
- [ ] **Storage Setup**: Configure Azure Blob Storage via the **Admin > Settings** UI (or via env vars).
- [ ] **SSO Configuration**: Connect your Azure AD (Entra ID) client via the **Admin > SSO** UI.
- [ ] **Admin Account**: Verify the initial seed admin can log in and change their password.

---

## 🗄️ Database Lifecycle Management

In production, database changes and initial setup should be handled explicitly to ensure the web application starts reliably.

### 1. Schema Updates (Migrations)
When deployment includes database changes, run the Prisma migration deploy command.
- **Recommended**: Run as an **Azure Container Job** using the same image.
- **Command**: `npx prisma migrate deploy`

### 2. First-Time Setup & Seeding
If you are deploying to a brand new database, you must initialize it with the required seed data (e.g., initial admin account, default settings).
- **Recommended**: Run as a one-time **Azure Container Job**.
- **Command**: `npm run prisma:seed`
- **Behavior**: The seeding script is designed to be idempotent; it will only create the initial admin and required records if they do not already exist.

### 3. Automation Strategy (ACA)
For a fully automated CI/CD pipeline, consider:
1. **Init Container**: Not supported natively in ACA, but you can use an **Azure Container Job** triggered before the App Update.
2. **Manual Trigger**: If preferred, run the commands via the Azure CLI or Portal for the first-time setup.
