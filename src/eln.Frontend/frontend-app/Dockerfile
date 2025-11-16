#
# Multi-stage Dockerfile to build the Angular application once and
# ship the static bundle via NGINX.
#
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Build
COPY . .
RUN npm run build


FROM nginx:stable-alpine AS runner
COPY --from=builder /app/dist/frontend-app/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
