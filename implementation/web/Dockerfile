# --- build: install, typecheck and produce the static bundle -----------------
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# --- serve: static files, SPA fallback, runtime config -----------------------
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Rewrites /config.js from the container environment before nginx starts, so the
# API URLs can change without rebuilding the image.
COPY docker-entrypoint.sh /docker-entrypoint.d/40-app-config.sh
RUN chmod +x /docker-entrypoint.d/40-app-config.sh
EXPOSE 80
