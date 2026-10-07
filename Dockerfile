FROM node:22-alpine AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/prisma ./prisma
COPY server/tsconfig.json server/eslint.config.js ./
COPY server/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
ENV WEB_DIST_DIR=/app/web-dist

COPY --from=server-builder /app/server/node_modules ./node_modules
COPY --from=server-builder /app/server/package*.json ./
COPY --from=server-builder /app/server/prisma ./prisma
COPY --from=server-builder /app/server/dist ./dist
COPY server/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=web-builder /app/web/dist /app/web-dist

RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3001
CMD ["./docker-entrypoint.sh"]
