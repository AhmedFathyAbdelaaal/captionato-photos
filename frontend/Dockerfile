# ── Build stage ──────────────────────────────────────────────────────────
# Node 18 builds Angular 16 cleanly (local Node 16 is only used for dev).
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Serve stage ──────────────────────────────────────────────────────────
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/captionato-photos-web /usr/share/nginx/html
# Renders /assets/config.json from API_BASE_URL at container start
# (nginx:alpine runs every /docker-entrypoint.d/*.sh before launching).
COPY docker-entrypoint.sh /docker-entrypoint.d/40-captionato-config.sh
RUN chmod +x /docker-entrypoint.d/40-captionato-config.sh
EXPOSE 80
