# ═══════════════════════════════════════════════════════════
#  Build & Run — uses npm scripts from package.json
#    npm run build  →  nest build  (compiles TS → dist/)
#    npm run start:prod  →  node dist/main  (runs the build)
# ═══════════════════════════════════════════════════════════
FROM node:22-alpine

# dumb-init ensures signals (SIGTERM etc.) reach the Node process
RUN apk add --no-cache dumb-init

WORKDIR /app

# ── Install ALL deps first (devDeps needed for nest build) ───────
#    NOTE: do NOT set NODE_ENV=production here — npm would skip
#    devDependencies and the `nest` CLI binary would not be installed
COPY package.json package-lock.json ./
RUN npm ci

# ── Copy source and run: npm run build (nest build → dist/) ─────
COPY . .
RUN npm run build

# ── Drop dev dependencies after build to keep the image lean ────
RUN npm prune --omit=dev

# ── Set production mode AFTER the build ─────────────────────────
ENV NODE_ENV=production

# ── Expose app port ─────────────────────────────────────────────
EXPOSE 5100

# ── Non-root user for security ──────────────────────────────────
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nestjs -u 1001
RUN mkdir -p logs && chown nestjs:nodejs logs

USER nestjs

# ── Start: npm run start:prod (= node dist/main) ────────────────
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start:prod"]
