# ═══════════════════════════════════════════════════════════
#  Stage 1 – Builder
#  Installs all dependencies and compiles TypeScript → dist/
# ═══════════════════════════════════════════════════════════
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first for better layer caching
COPY package.json package-lock.json ./

RUN npm ci

# Copy source
COPY . .

# Compile TypeScript (outputs to dist/)
RUN npm run build

# ═══════════════════════════════════════════════════════════
#  Stage 2 – Production image
#  Only production deps + compiled output
# ═══════════════════════════════════════════════════════════
FROM node:22-alpine AS production

# Install dumb-init for proper PID-1 / signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

ENV NODE_ENV=production

# Copy manifests and install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled app from builder stage
COPY --from=builder /app/dist ./dist

# Copy i18n and email templates (copied by nest-cli as assets)
COPY --from=builder /app/dist ./dist

# Expose the application port
EXPOSE 5100

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nestjs -u 1001

# Create logs directory and assign ownership
RUN mkdir -p logs && chown nestjs:nodejs logs

USER nestjs

# Use dumb-init as PID 1 so signals are forwarded correctly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
