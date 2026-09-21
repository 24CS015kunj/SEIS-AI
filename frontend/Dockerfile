# Stage 1: Build React 19 application
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve static production assets with Nginx
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx client-side routing fallback configuration
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

# 127.0.0.1, not localhost: this image's /etc/hosts resolves "localhost" to
# ::1 first, but nginx only listens on 0.0.0.0 (IPv4) -- wget then hits a
# real IPv6 connection-refused, permanently failing the healthcheck despite
# nginx serving real traffic correctly over IPv4 the whole time.
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
