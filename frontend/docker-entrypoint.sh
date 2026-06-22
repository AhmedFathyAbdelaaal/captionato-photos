#!/bin/sh
# Render the SPA's runtime config from container env vars (Coolify-injected),
# so API_BASE_URL drives the frontend without a rebuild.
set -e

: "${API_BASE_URL:=https://api.photos.captionato.tech}"

cat > /usr/share/nginx/html/assets/config.json <<EOF
{
  "apiBaseUrl": "${API_BASE_URL}"
}
EOF

echo "[captionato] runtime config: API=${API_BASE_URL}"
