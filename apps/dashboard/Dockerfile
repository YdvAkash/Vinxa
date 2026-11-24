# Stage 1: Build React Dashboard
FROM node:20-alpine AS builder
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/dashboard/package.json ./apps/dashboard/package.json
COPY apps/extension/package.json ./apps/extension/package.json
RUN npm ci
COPY apps/dashboard ./apps/dashboard
RUN npm run build --workspace=apps/dashboard

# Stage 2: Serve with Nginx
FROM nginx:1.27-alpine
COPY --from=builder /workspace/apps/dashboard/dist /opt/vinxa/dashboard/dist
COPY infrastructure/nginx/vinxa.conf /etc/nginx/conf.d/default.conf
RUN sed -i 's|__APP_DIR__|/opt/vinxa|g; s|127.0.0.1:8080|backend:8080|g' /etc/nginx/conf.d/default.conf
EXPOSE 80
