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
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
RUN mkdir -p /app/uploads
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
	# The Next.js build output in `/.next` contains the compiled server code.
	# Copying the `src` directory into the runtime image is unnecessary when
	# using the standard Next build output. If you switch to Next's
	# `output: 'standalone'` mode, prefer copying `/.next/standalone` and
	# `/.next/static` instead and omit `src` entirely.
	# COPY --from=builder /app/src ./src
	RUN mkdir -p /app/uploads
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next-env.d.ts ./next-env.d.ts
COPY --from=builder /app/eslint.config.cjs ./eslint.config.cjs
# Include utility scripts required at runtime (prestart checks, healthchecks)
COPY --from=builder /app/scripts ./scripts
EXPOSE 3000
CMD ["npm", "start"]
