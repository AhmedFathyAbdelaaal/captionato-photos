#!/bin/sh
# Render the SPA's runtime config from container env vars (Coolify-injected),
# so API_BASE_URL / TURNSTILE_SITE_KEY drive the frontend without a rebuild.
set -e

: "${API_BASE_URL:=https://api.photos.captionato.tech}"
: "${TURNSTILE_SITE_KEY:=}"

cat > /usr/share/nginx/html/assets/config.json <<EOF
{
  "apiBaseUrl": "${API_BASE_URL}",
  "turnstileSiteKey": "${TURNSTILE_SITE_KEY}"
}
EOF

echo "[captionato] runtime config: API=${API_BASE_URL} turnstile=${TURNSTILE_SITE_KEY:+on}"
