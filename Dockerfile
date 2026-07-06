FROM node:22-alpine AS production

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY package*.json ./
# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Generate i18n types
RUN npm run i18n:generate

RUN npm run build

RUN npm prune --omit=dev

ENV NODE_ENV=production


# Copy built application and necessary files from builder stage
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/src/i18n ./src/i18n
COPY --from=builder --chown=nestjs:nodejs /app/src/templates ./src/templates

# Create uploads directory with proper permissions
RUN mkdir -p uploads/resumes && \
    chown -R nestjs:nodejs uploads

EXPOSE 5100



RUN mkdir -p logs && chown nestjs:nodejs logs

USER nestjs

ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main.js"]