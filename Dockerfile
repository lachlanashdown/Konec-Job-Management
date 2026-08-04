FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=80

# /data is the Konec Showroom platform's documented data-mount-path
# convention — the operator mounts a persistent volume here so db.json and
# uploaded files survive service updates/restarts (see service-image-guide §2.4).
VOLUME ["/data"]

EXPOSE 80

# Shell form (not exec-array) so $PORT/$BASE_PATH expand at container runtime —
# BASE_PATH is only known once the platform injects it via `docker run -e`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://localhost:${PORT:-80}${BASE_PATH}/health" || exit 1

CMD ["node", "server.js"]
