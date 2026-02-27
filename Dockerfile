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
RUN npm run build

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

# Prisma client and scripts are needed for runtime/management
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/scripts ./scripts

RUN mkdir -p /app/uploads

EXPOSE 3000

# Use node直接启动 instead of npm start to avoid shell overhead and 
# to ensure signals (SIGTERM) are handled correctly.
CMD ["node", "server.js"]
