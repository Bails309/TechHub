# Production Deployment Guide 🚀

TechHub is designed to run as a **Standalone Container**. This guide details how to deploy it to production, with **Azure Container Apps** as the primary recommended platform.

---

## 📋 Software Requirements

Before deploying TechHub, ensure your target environment meets these minimum specifications:

- **Compute**: Node.js **20.x (LTS)** or higher.
- **Database**: PostgreSQL **13**, **14**, **15**, or **16+**.
- **Caching**: Redis **6.2** or higher (Redis 7.x recommended for Azure Managed Redis).
- **Runtime**: Docker Engine **24.x** or higher (if using containerized deployment).

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
| `REDIS_URL` | **Required** | Connection string. See [Redis Configuration](#redis-configuration) below. |
| `REDIS_PASSWORD` | **Required** | The Primary Access Key for your Redis instance. |
| `REDIS_TLS` | **Required** | Set to `true` for all Azure Redis services. |
| `RATE_LIMIT_STORE`| **Required** | Set to `redis` in production to ensure centralized protection. |
| `NEXTAUTH_SECRET` | **Required** | A random 32-character string for session signing. |
| `NEXTAUTH_URL` | **Required** | Your public domain (e.g., `https://portal.company.com`). |
| `AUTH_TRUST_HOST` | **Required** | Set to `true` when using custom domains/CNAMEs in Azure. |
| `SSO_MASTER_KEY` | **Required** | Used to encrypt storage/SSO secrets in your database. |
| `TRUST_PROXY` | **Required** | Set to `true` behind Azure's Ingress/Load Balancer. |
| `NODE_ENV` | **Required** | Set to `production`. |

### 2. Standalone Configuration
- **Ingress**: Enable Ingress on Port **3000**.
- **Target Port**: 3000.
- **Transport**: Auto (supports HTTP/1.1 and HTTP/2).
- **TLS**: Managed by Azure. Reference your certificate from **Azure Key Vault** or use **Managed Certificates**.

### 3. Service Tier & Sizing Requirements
- **Azure Cache for Redis**: **Standard C1 (1GB)** or higher is recommended. While the application's memory footprint is low (~128MB-256MB per 1k concurrent users), the **Standard** tier is required for **TLS support** (mandatory for TechHub) and a production SLA. Avoid the "Basic" tier.
- **Azure Managed Redis**: All tiers supported. Balanced B1 (6GB) is a powerful modern alternative.
- **Eviction Policy**: Set Redis to `allkeys-lru`. This ensures that if the cache fills up, the oldest sessions are removed first rather than crashing the app.

---

## 🗄️ Redis Configuration

TechHub supports two types of Azure Redis services. The configuration depends on which one you choose.

### Option A: Azure Managed Redis (Recommended)
This is the modern, high-performance option.
- **Port**: 10000 (TLS)
- **URL Format**: `rediss://<name>.uksouth.redis.azure.net:10000`
- **Networking**: Ensure **Public network access** is enabled (or use VNET integration) and add a firewall rule to allow your ACA Outbound IPs.

### Option B: Azure Cache for Redis (Legacy/Standard)
This is the original Azure Redis offering (retiring in 2028).
- **Port**: 6380 (TLS)
- **URL Format**: `rediss://<name>.redis.cache.windows.net:6380`
- **Networking**: Standard public access or Private Endpoints.

> [!IMPORTANT]
> Always use the `rediss://` prefix (double 's') and set `REDIS_TLS=true` to ensure encrypted communication.

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
- [ ] **Voluntary Password Change**: Admins and local users can update their passwords at any time via the "Change Password" button in the sidebar.

---

## � Updating a Live Instance

When preparing to update an existing deployment (e.g., adding favicons or new metadata fields), follow this sequence:

### 1. Cloud Update (Azure Container Apps)
1. **Push Image**: Build and push your new Docker image to your registry (e.g., ACR).
2. **Update Deployment**: Update the Container App to use the new image.
3. **Run Synchronization**: Execute a one-time **Azure Container Job** with the following command to apply schema changes. 
   - **Recommended**: `npx prisma@5.18.0 db push --skip-generate` (Prevents errors in production-pruned containers).
   - **Arguments**: `prisma@5.18.0`, `db`, `push`, `--skip-generate`

### 2. Local Update (Docker Compose)
If you are developing or running locally with Docker Compose:
1. **Rebuild**: `docker-compose up --build -d`
2. **Apply Update**: Run the synchronization command from your host machine against the running container:
   ```bash
   docker-compose exec app npx prisma@5.18.0 db push --skip-generate
   ```

---

## 🗄️ Database Lifecycle Management

In production, database changes and initial setup should be handled explicitly to ensure the web application starts reliably.

### 1. Schema Synchronization
When deployment includes database changes, you must synchronize the schema.
- **Option A (Migrations)**: Use `npx prisma@5.18.0 migrate deploy`.
- **Option B (Direct Push)**: Use `npx prisma@5.18.0 db push --skip-generate`. This is faster for environments where migrations are not explicitly tracked. The `--skip-generate` flag is required when running inside the production container to prevent issues with pruned `node_modules`.

### 2. First-Time Setup & Seeding
If you are deploying to a brand new database, you must initialize it with the required seed data (e.g., initial admin account, default settings).
- **Recommended**: Run as a one-time **Azure Container Job**.
- **ACA Job Configuration**:
  - **Command override**: `npm`
  - **Arguments override**: `run`, `prisma:seed`
- **Behavior**: The seeding script is designed to be idempotent; it will only create the initial admin and required records if they do not already exist.

### 3. Automation Strategy (ACA)
For a fully automated CI/CD pipeline, consider:
1. **Init Container**: Not supported natively in ACA, but you can use an **Azure Container Job** triggered before the App Update.
### 4. Forcing an Image Pull (latest tag)
If you are using the `latest` tag and have pushed a new version, Azure Container Apps might not pull it automatically. To force a pull:

- **Via Azure CLI**:
  ```bash
  az containerapp update -n <app-name> -g <resource-group> --image <registry>/<image>:latest
  ```
- **Via Portal**:
  1. Navigate to your **Container App**.
  2. Go to **Containers**.
  3. Click **Edit and deploy**.
  4. Select the container and click **Edit**.
  5. (Optional) Append a dummy environment variable to force a configuration change, or just click **Save** and **Deploy**. This will create a new revision and force a pull.

---

## 💡 Key Concept: Port Mapping vs. docker-compose

One common source of confusion when moving from local development to Azure Container Apps is how ports are handled:

1. **ACA ignores `docker-compose.yml`**: Azure Container Apps does not read your `docker-compose` files. It only uses the **Image** and the **Target Port** defined in the Azure Portal or via the CLI.
2. **Target Port**: This MUST match the port your application is actually listening on *inside* the container (port 3000 in this project).
3. **Internal vs. External**: Azure's Ingress automatically maps public HTTP (80) and HTTPS (443) traffic to your defined **Target Port**. You do not need to (and cannot) specify a "host port" like you do in `80:3000` locally.
4. **Environment Variables**: The `PORT` environment variable inside your container should match the **Target Port** configured in the Azure Ingress settings.

---

## 🔐 Admin Password Recovery

If the initial generated administrator password is lost or rotate and reset is required:

1. **Set Environment Variables**: In your Azure Container Job, you **must** configure the following (Jobs do not share environment variables with the main App):
   - `ADMIN_PASSWORD`: Your new strong password.
   - `DATABASE_URL`: Your database connection string.
   - `SSO_MASTER_KEY`: Your master encryption key.
2. **Execute Seeding**: Run the database seeding command via an **Azure Container Job**.
   - **Command override**: `node`
   - **Arguments override**: `prisma/seed.js`
3. **Verification**:
   - In the Azure Portal, go to your **Container App Job**.
   - Select **Execution history**.
   - Check the status of the latest run (should be **Succeeded**).
   - Click on the execution to view **Logs**. Look for the message:
     `SEED: Successfully updated admin password for admin@techhub.local`
   - The script will also reset their `mustChangePassword` flag to `true`, forcing a change upon next login.
