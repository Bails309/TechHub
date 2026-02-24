# syntax=docker/dockerfile:1
FROM node:20-bullseye-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline --no-audit --no-fund

FROM node:20-bullseye-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run prisma:generate
# Increase Node heap for builds to avoid worker crashes (SIGBUS/OOM)
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

FROM node:20-bullseye-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
RUN mkdir -p /app/uploads
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/test ./test
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["npm", "start"]
