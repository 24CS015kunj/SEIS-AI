# Node.js 22 LTS lightweight Alpine image
FROM node:22-alpine

WORKDIR /app

# Install curl for container healthcheck
RUN apk add --no-cache curl

# Copy package manifests first to leverage Docker layer caching
COPY package*.json ./

RUN npm ci --only=production

# Copy application source code, plus constant.js (repo-root-level file --
# src/config/db.js imports it as "../../constant.js") which a src/-only
# COPY left missing, crashing the container on boot with
# ERR_MODULE_NOT_FOUND.
COPY src/ ./src/
COPY constant.js ./constant.js

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

# Container health check querying Express gateway health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

CMD ["node", "src/server.js"]
