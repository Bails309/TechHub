# TechHub Architecture

> **Version 2.2.1** — See [CHANGELOG.md](CHANGELOG.md) for release history.

TechHub is a high-performance, secure application portal designed for enterprise environments. It follows a **Standalone Container** architecture, consolidating its request pipeline, security enforcement, and data orchestration into a single, scalable unit.

## 1. System Overview

TechHub leverages a modern web stack to balance development velocity with robust security.

```mermaid
graph TD
    User([User / Admin]) --> Ingress[Cloud Ingress / Proxy]
    Ingress -- "HTTPS" --> Web[Next.js TechHub App]
    
    subgraph "Application Core"
        Web -- "Session & Rate Limit" --> Redis[(Azure Redis Cache)]
        Web -- "Relational Data" --> DB[(PostgreSQL)]
        Web -- "Icon Storage" --> Storage{Unified Storage Interface}
    end
    
    subgraph "Storage Providers"
        Storage -- "Public Cloud" --> S3[AWS S3]
        Storage -- "Enterprise" --> Azure[Azure Blob Storage]
        Storage -- "Developer" --> Local[Local Filesystem]
    end
```

## 2. Component Breakdown

### Infrastructure Layer
- **Standalone Container**: The application is built as a self-contained unit using the `node:24-bookworm-slim` base image. It is optimized for **Azure Container Apps** and standard Kubernetes environments.
- **Proxy Pipeline**: A high-performance request interceptor ([`src/proxy.ts`](src/proxy.ts)) that handles:
  - **Security Headers**: Injecting Nonce-based CSP, HSTS, and Frame protection.
  - **Session Guards**: Enforcing idle/absolute timeouts and revocation.
  - **CSRF Token Generation**: Injecting signed HMAC tokens.

### Application Layer (`src/app`)
- **App Router**: Uses Next.js 16 App Router with Turbopack for optimized server-side rendering (SSR) and streaming.
- **Server Actions**: All mutations (e.g., updating user profiles, adding apps) are handled via safe Server Actions that enforce RBAC and CSRF protection natively.
- **Admin Module**: A dedicated area for managing the catalogue, user roles, SSO configuration, and system health.

### Logic & Security Layer (`src/lib`)
- **`auth.ts`**: The core authentication engine using Next-Auth. Handles credential validation, SSO provider mapping, and JWT consistency checks.
- **`security/`**: A suite of specialized utilities:
  - `csrf.ts`: HMAC-signed token validation.
  - `ssrf.ts`: Resolve-time DNS validation with **Pinned IP Clients** to prevent TOCTOU/DNS Rebinding attacks.
  - `pinnedClient.ts`: Shared logic for creating security-hardened Azure and AWS SDK clients.
  - `crypto.ts`: Envelope encryption for storing cloud secrets in the database.
- **`storage.ts`**: An abstraction layer that provides a consistent API for reading and writing icons regardless of the underlying cloud provider, with built-in **Magic Byte** detection for secure file handling.

## 3. Data Lifecycle

### Authentication Flow
1. **Initiation**: User hits `/auth/signin`.
2. **Provider Redirect**: Handled via Next-Auth (Azure AD, Keycloak, or Credentials).
3. **JWT Issue**: On success, a JWT is issued with an **Absolute Lifetime** (8 hours).
4. **Session Guard**: Every subsequent request is checked against a **Redis-backed Idle Timer** (20 minutes).
5. **Revocation**: Critical security events (password changes) rotate the user's `securityStamp`. The `jwt` callback detects this mismatch and revokes all active sessions across devices in real-time.

### Request Flow
1. **Proxy**: Headers are set, and the session is validated.
2. **Page Load**: Next.js fetches meta-data from Redis (roles, profile pic) to avoid DB overhead.
3. **App Rendering**: The catalogue is rendered based on the user's specific roles and audience permissions.
4. **Feedback**: Audit logs are generated for all state changes (`writeAuditLog`).

## 4. Key Dependencies

| Dependency | Purpose |
| :--- | :--- |
| **Next.js** | Core framework for SSR and API routes. |
| **Prisma** | Type-safe ORM for PostgreSQL. |
| **Next-Auth** | Authentication and session management. |
| **Redis (ioredis)** | Distributed caching and rate limiting. |
| **Zod** | End-to-end schema validation. |
| **Lucide React** | Consistent, high-quality iconography. |
| **ipaddr.js** | Precise IP/CIDR validation for proxy trust logic. |

## 5. Testing & CI/CD

TechHub maintains comprehensive automated testing across multiple layers:

- **Unit & Integration Tests** (Vitest): 76 test files covering 641 tests across authentication, cryptography, proxy pipeline, server actions, API routes, and core library functions. Tests mock external services (Redis, Prisma) to run without infrastructure dependencies.
- **End-to-End Tests** (Playwright): 4 test suites covering admin flows, app interactions, authentication, and personal apps across Chromium, Firefox, and WebKit.
- **CI Pipeline** (GitHub Actions): Automated lint, test, build, and Docker image verification on every push and PR. Includes CodeQL security scanning and dependency review.
- **Coverage Reporting**: `@vitest/coverage-v8` generates text, JSON summary, and LCOV reports for `src/lib/**/*.ts` and `src/proxy.ts`. Enforced thresholds: 90% statements, 90% lines, 75% branches, 88% functions.

See [TESTING.md](TESTING.md) for the complete test inventory and CI workflow details.
