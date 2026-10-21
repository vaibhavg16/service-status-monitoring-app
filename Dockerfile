# syntax=docker/dockerfile:1

# ==========================================
# Stage 1: Install dependencies only
# ==========================================
FROM node:20-alpine AS deps
WORKDIR /app

# Install native dependencies if needed by packages (e.g., bcrypt/sqlite/etc.)
RUN apk add --no-cache libc6-compat

# Copy package files
COPY package.json package-lock.json ./
RUN npm ci


# ==========================================
# Stage 2: Build the Next.js application
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* variables are inlined into the browser JS bundle at BUILD
# TIME by Next.js — setting them later as a container/Beanstalk runtime env
# var has zero effect on an already-built bundle. This ARG lets the build
# receive the real value from `docker build --build-arg ...` (passed by
# docker-compose.yml locally, and by the CI workflow in production).
ARG NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
ENV NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
# Provide a dummy database URL so build-time checks/imports don't fail 
# (Real runtime credentials are injected via environment variables at runtime)
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/app_db"
ENV NEXT_TELEMETRY_DISABLED=1

# Build the app in standalone mode
RUN npm run build


# ==========================================
# Stage 3: Minimal production runner image
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create a secure non-root system user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built public assets and standalone server output
# COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Ensure the .next directory has correct permissions for runtime cache writes
RUN mkdir -p .next && chown nextjs:nodejs .next

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
