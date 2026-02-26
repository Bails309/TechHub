# TechHub Security & Hardening

Security is a core pillar of TechHub. The application implements multiple layers of protection to ensure administrative integrity and user safety.

## 1. Authentication & Session Management

- **Provider Diversity**: Supports SSO (Azure AD, Keycloak) and Local Credentials.
- **Must Change Password**: New credential-based users are forced to change their password on the first login.
- **Session Guards**:
  - **Idle Timeout**: Automatically terminates sessions after 20 minutes of inactivity.
  - **Absolute Timeout**: Forces re-authentication after 8 hours to rotate keys and session signatures.
  - **Anti-Loop Protection**: `SessionGuard` prevents rapid-fire redirection loops by tracking state transitions.
- **Secure Key Rotation**: SSO provider secrets are encrypted at rest using a master key (`SSO_MASTER_KEY`).

## 2. Access Control

- **Role-Based Access Control (RBAC)**: Apps are assigned visibility based on roles (e.g., `admin`, `staff`) or specific user IDs.
- **Server-Side Validation**: Every Administrative Server Action enforces strict role checks using `getServerAuthSession`.
- **Pre-Provisioning**: The `REQUIRE_PREPROVISIONED_USERS` flag prevents unknown users from self-registering via SSO, ensuring only authorized employees gain access.

## 3. Infrastructure Security

- **Reverse Proxy**: Nginx provides a buffer against the public internet, adding a layer of TLS termination and strict header enforcement.
- **Redis-Backed Rate Limiting**: In production, rate limiting is centralized in Redis. This prevents "password spraying" or DoS attacks that target multiple container instances simultaneously.
- **Database Hardening**:
  - **Pre-Start Checks**: The application refuses to start in production if weak database passwords (e.g., `techhub/techhub`) are detected.
  - **Prisma Transactions**: Critical operations use database transactions to ensure data consistency.

## 4. Audit Logging

Every security-relevant event is captured in a permanent audit log:
- **Login Events**: Successes, failures (including "missing client IP" diagnostics), and sign-outs.
- **User Management**: Role updates, password changes, and account deletions.
- **App Management**: Catalogue updates and storage cleanup jobs.

Audit logs capture the **Actor**, the **Action**, the **Target**, and technical details like the **Client IP** for forensic analysis.

## 5. Defensive Implementation Details

- **Input Validation**: All forms are validated server-side using `Zod` schemas.
- **CSRF Protection**: Native CSRF tokens are enforced on all Server Actions.
- **Secure Storage**: Application icons are protected by a decoupled storage layer that handles path traversal prevention and ensures no unauthenticated access to the underlying filesystem objects.
