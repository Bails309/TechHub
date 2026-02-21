# TechHub
Modern app-launcher portal for internal teams with SSO, credential fallback, and admin-managed catalogues.

## Features
- Next.js App Router + TypeScript + Tailwind
- Microsoft Entra ID SSO with optional credentials fallback
- Prisma + Postgres catalogue with role-based visibility
- Drag-and-drop ordering per user (guests stored locally)
- Search, category headings toggle, and theme switcher
- Docker build + compose database
- Security headers, CSP with per-request nonce, and credential rate limiting

## Tech stack
- Next.js 15, React 18
- NextAuth (JWT sessions)
- Prisma 5 + Postgres 16
- Tailwind CSS

## Quick start (local)
1. Install Node.js 20+ and Docker Desktop.
2. Copy `.env.example` to `.env` and set values.
3. Install dependencies: `npm install`
4. Start database: `docker compose up -d db`
5. Generate Prisma client: `npm run prisma:generate`
6. Apply schema: `npm run prisma:push`
7. Seed sample data: `npm run prisma:seed`
8. Start app: `npm run dev`

## Quick start (Docker)
1. Copy `.env.example` to `.env` and set values.
2. Build and run: `docker compose up --build`

The compose entrypoint runs `prisma db push` and `prisma db seed` before `npm start`.

## Environment variables
- `NEXTAUTH_SECRET`: required for NextAuth JWT signing
- `NEXTAUTH_URL`: app base URL (use `http://localhost:3000` locally)
- `AZURE_AD_CLIENT_ID`: Entra ID application (optional)
- `AZURE_AD_CLIENT_SECRET`: Entra ID secret (optional)
- `AZURE_AD_TENANT_ID`: Entra ID tenant (optional)
- `ADMIN_EMAIL`: seeded admin user email
- `ADMIN_PASSWORD`: seeded admin user password
- `DATABASE_URL`: Postgres connection string

## Scripts
- `npm run dev`: start development server
- `npm run build`: build production bundle
- `npm run start`: run production server
- `npm run lint`: lint
- `npm run prisma:generate`: generate Prisma client
- `npm run prisma:push`: push schema to database
- `npm run prisma:migrate`: create dev migration
- `npm run prisma:migrate:deploy`: apply migrations
- `npm run prisma:seed`: seed roles, admin user, and sample apps

## Admin workflow
- Visit `/admin` to create, edit, and remove apps.
- Admin access requires the `admin` role on the user.
- Promote users by adding a `UserRole` entry (or update the seed and re-run `npm run prisma:seed`).

## App ordering and search
- Signed-in users store ordering in Postgres via `/api/app-order`.
- Guests store ordering and search state in local storage.

## Uploads
- Icon uploads are stored in `uploads/` and served via `/uploads/*`.
- Icons are limited to PNG and JPEG only.
- Max icon upload size is 2 MB.
- Docker compose mounts a named volume at `/app/uploads` to persist icons.

## Security notes
- CSP is applied via middleware with a per-request nonce for scripts and styles.
- `/api/app-order` returns 400 for invalid JSON or payloads.

## Production notes
- Set a strong `NEXTAUTH_SECRET` and change the seeded admin password.
- If you prefer migrations, use `prisma:migrate` and `prisma:migrate:deploy` instead of `prisma:push`.
- Restrict access to `/admin` behind role assignment and SSO as appropriate.
