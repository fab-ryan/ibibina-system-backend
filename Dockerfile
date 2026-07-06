FROM node:22-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 5100

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

RUN mkdir -p logs && chown nestjs:nodejs logs

USER nestjs

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]