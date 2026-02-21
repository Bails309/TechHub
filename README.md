# TechHub
Modern MyApps-style gateway for launching internal tools, with SSO + credentials, role-based access, and a premium UI.

## Highlights
- Next.js App Router + TypeScript + Tailwind
- Microsoft Entra ID (Azure AD) SSO + credentials fallback
- Prisma + Postgres with admin-managed catalogue
- Role-based app visibility
- Drag-and-drop ordering per user (guests stored locally)
- Search and headings toggle in the top bar
- Dockerized build + Postgres via compose
- Security headers, strict session handling, rate limit hook

## Quick start (local)
1. Install Node.js 20+ and Docker Desktop.
2. Copy `.env.example` to `.env` and fill values.
3. Install deps: `npm install`
4. Start database: `docker compose up -d db`
5. Run Prisma: `npm run prisma:generate` and `npm run prisma:push`
6. Seed: `npm run prisma:seed`
7. Start app: `npm run dev`

## Quick start (Docker)
1. Copy `.env.example` to `.env` and fill values.
2. Run: `docker compose up --build`

## Environment
- `NEXTAUTH_SECRET`: required for NextAuth
- `NEXTAUTH_URL`: set to `http://localhost:3000`
- `AZURE_AD_*`: Entra ID app credentials
- `ADMIN_EMAIL`/`ADMIN_PASSWORD`: seeded admin user
- `DATABASE_URL`: Postgres connection string

## Admin
Visit `/admin` to manage app links. Admin access is granted to users with the `admin` role.

To promote a user, add a role entry in the database or update the seed, then re-run:
`npm run prisma:seed`

## Seeding
Docker startup runs `prisma db push` and `prisma db seed` automatically. The seed includes a few sample apps to get you started.
