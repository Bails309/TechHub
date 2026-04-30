# TechHub API Documentation 🛠️

This document details the public and internal API endpoints available in TechHub. Most endpoints require authentication and proper CSRF tokens.

## 1. Authentication (`/api/auth`)

TechHub uses **NextAuth.js** for authentication.

- **`GET /api/auth/session`**: Returns the current session object.
- **`POST /api/auth/signin/:provider`**: Initiates the sign-in flow for a specific provider (`azure-ad`, `keycloak`, or `credentials`).
- **`POST /api/auth/signout`**: Terminates the current session.
- **`POST /api/auth/callback/:provider`**: Callback URL for SSO providers.

## 2. SSO Direct Links

- **`/sso`**: A short-link that redirects to `/auth/sso`.
- **`/auth/sso`**: A dedicated page that automatically triggers the `signIn('keycloak')` flow. This is intended for seamless SSO integration from other corporate portals.

## 3. System Health (`/api/health`)

- **`GET /api/health`**: Returns the health status of the system components.
    - **Authentication**: None required.
    - **Response**:
        ```json
        {
          "status": "healthy",
          "database": "connected",
          "redis": "connected",
          "storage": "connected",
          "version": "2.3.0"
        }
        ```

## 4. Application Management

- **`POST /api/app-order`**: Persists the user's custom application order.
    - **Authentication**: Required.
    - **CSRF**: Required (`x-csrf-token` header).
    - **Payload**: `{ "order": ["app-id-1", "app-id-2", ...] }`

- **`/api/launch`**: (Internal) Tracks application launches for analytics.
    - **Method**: `POST`
    - **Payload**: `{ "appId": "string" }`

## 5. Storage & Media

- **`GET /api/storage/icons/[...path]`**: Proxies requests to the configured storage backend (Local, S3, or Azure) to retrieve application icons.
    - **Security**: Validates path segments to prevent traversal. Forces `Content-Disposition: attachment` for SVGs.

## 6. Administration & Maintenance

- **`POST /api/cron/cleanup`**: Triggers a cleanup task for orphaned storage assets.
    - **Authentication**: Requires a Bearer token in the `Authorization` header matching `CRON_SECRET`.

---

> [!NOTE]
> All state-changing requests (POST, PUT, DELETE) must include a valid CSRF token. For Server Actions, this is handled via the `withCsrf` wrapper. For API routes, use the `x-csrf-token` header.
