# ────────────────
# 1. BUILD STAGE
# ────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build


# ────────────────
# 2. PRODUCTION STAGE
# ────────────────
FROM node:22-alpine AS production

WORKDIR /app

RUN apk add --no-cache dumb-init

# create user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

RUN npm install --omit=dev

USER nestjs

EXPOSE 5100

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]