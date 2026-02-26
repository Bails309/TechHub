# TechHub 🚀

**TechHub** is a high-performance, secure, admin-managed internal application portal. Built with **Next.js**, **Prisma**, and **Docker**, it serves as the central jumping-off point for your organization's internal tools and services.

[![Next.js](https://img.shields.io/badge/Framework-Next.js-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Security](https://img.shields.io/badge/Security-Hardened-emerald)](docs/security.md)

---

## ✨ Key Features

- **Centralized App Management**: Admins can add, categorize, and control visibility for internal apps.
- **Smart User Assignment**: High-performance autocomplete for assigning apps to specific users (no more loading massive user lists).
- **Flexible Storage**: First-class support for Local Storage, AWS S3, and Azure Blob Storage.
- **Security First**: 
  - Integrated SSO (Azure AD, Keycloak) and Local Credentials.
  - Robust Password Policies & Mandatory Password Change.
  - Session protection (Idle & Absolute timeouts).
  - Rate Limiting and CSRF protection.
- **Automated Maintenance**: Built-in tools for cleaning up orphaned storage objects.
- **Full Auditing**: Detailed audit logs for all administrative and security actions.

---

## 🏛️ Architecture & Security

To maintain a clean and focused workspace, we've moved deep technical documentation to dedicated guides:

- 🏗️ **[Architecture Overview](docs/architecture.md)** — Learn about the data flow between Nginx, Next.js, Redis, and Storage Providers.
- 🛡️ **[Security & Hardening](docs/security.md)** — A detailed breakdown of our session management, RBAC, and rate-limiting strategies.
- ☁️ **[Storage Providers](docs/azure-blob.md)** — Detailed instructions for S3 and Azure Blob integration.

---

## 🚀 Quick Start

### 1. Requirements
- **Node.js 20+**
- **Docker & Docker Compose**

### 2. Initial Setup
```bash
# 1. Clone & Copy environment template
cp .env.example .env

# 2. Spin up the infrastructure (DB, Redis, Nginx, App)
docker-compose up -d --build

# 3. Check logs for your unique admin password (if not set in .env)
docker-compose logs app | grep "SEED"
```

### 3. Visit the Portal
Open `http://localhost:3000` (or your configured `DOMAIN`).

---

## 🛠️ Local Development

If you prefer to run the application layer natively on your host:

```bash
# Install dependencies
npm install

# Start development services (DB & Redis)
docker-compose up -d db redis

# Setup database
npm run prisma:generate
npm run prisma:push
npm run prisma:seed

# Start Next.js in dev mode
npm run dev
```

---

## ⚙️ Environment Configuration

TechHub uses centralized environment variables. The main required keys are:

| Category | Key | Description |
|----------|-----|-------------|
| **Core** | `NEXTAUTH_SECRET` | Required for session encryption. |
| **Auth** | `SSO_MASTER_KEY` | Key for encrypting stored SSO secrets. |
| **Storage**| `STORAGE_PROVIDER` | `local`, `s3`, or `azure`. |
| **Production** | `RATE_LIMIT_STORE` | Must be `redis` in production. |

*See [.env.example](.env.example) for a complete list of all 50+ configuration options.*

---

## 🧪 Testing

TechHub features a comprehensive test suite powered by **Vitest**.

```bash
# Run unit & integration tests
npm test

# Run tests in a Docker container (recommended for parity with CI)
docker-compose run --rm app npm test
```
See [TESTING.md](TESTING.md) for detailed test scenarios.

---

## 🤝 Contributing

We welcome contributions! Please ensure you:
1. Run `npm run lint` before committing.
2. Follow the security guidelines in [docs/security.md](docs/security.md).
3. **Never** commit secrets.

---

Built with ❤️ by the TechHub team.
