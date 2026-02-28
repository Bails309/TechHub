# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g npm@11.10.1
COPY package.json package-lock.json* ./
RUN npm install --prefer-offline --no-audit --no-fund

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g npm@11.10.1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run prisma:generate
# Increase Node heap for builds to avoid worker crashes (SIGBUS/OOM)
ENV NODE_OPTIONS=--max-old-space-size=4096
# Next.js 15 static generation requires a DATABASE_URL even during build time for metadata generation
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npm run build

# Compile the seed script to JS so we don't need ts-node/devDependencies in production
# We bundle bcryptjs because it's a small JS-only library, but keep @prisma/client external
RUN npx esbuild prisma/seed.ts --bundle --platform=node --outfile=prisma/seed.js --external:@prisma/client

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g npm@11.10.1
ENV NODE_ENV=production
ENV PORT=3000
# Faster networking for standalone mode
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma schema and the COMPILED seed script
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts

RUN mkdir -p /app/uploads

EXPOSE 3000

# Use node直接启动 instead of npm start to avoid shell overhead and 
# to ensure signals (SIGTERM) are handled correctly.
CMD ["node", "server.js"]
