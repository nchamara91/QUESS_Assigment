#!/bin/sh
# Runs from the nginx image's /docker-entrypoint.d before nginx starts.
# Vite bakes import.meta.env at build time; this writes the browser-visible
# configuration at run time instead, so changing a URL is a restart, not a
# rebuild.
set -eu

cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  transactionsApiUrl: "${VITE_TRANSACTIONS_API_URL:-http://localhost:8080}",
  categoriesApiUrl: "${VITE_CATEGORIES_API_URL:-http://localhost:8081}",
  accessToken: "${VITE_ACCESS_TOKEN:-}"
};
EOF
