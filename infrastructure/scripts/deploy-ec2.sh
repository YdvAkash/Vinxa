#!/usr/bin/env bash
# ==============================================================================
# Vinxa Live ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â AWS EC2 Automated Continuous Deployment Script
# ==============================================================================
# Executed by the GitHub Actions CD pipeline (or manually on EC2) after
# ec2-preflight-setup.sh has verified/installed all prerequisites.
#
# Supports two deployment strategies (controlled via DEPLOY_MODE):
#   - DEPLOY_MODE=native (default): Runs Spring Boot 3 JAR as a systemd service
#     (vinxa-backend.service) and serves React Dashboard + proxies /api & /ws
#     via Nginx on port 80.
#   - DEPLOY_MODE=docker: Runs the full stack using docker-compose.prod.yml.
#
# Includes automatic backup & rollback if the post-deploy health check fails.
# ==============================================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/vinxa}"
DEPLOY_USER="${DEPLOY_USER:-$(whoami)}"
DEPLOY_MODE="${DEPLOY_MODE:-native}"
BACKEND_PORT="${SERVER_PORT:-8080}"
HEALTH_URL="http://127.0.0.1:${BACKEND_PORT}/actuator/health"
TIMESTAMP="$(date -u '+%Y%m%d_%H%M%S')"

log_info()  { echo -e "\033[1;34m[DEPLOY-INFO]\033[0m  $*"; }
log_ok()    { echo -e "\033[1;32m[DEPLOY-OK]\033[0m    $*"; }
log_warn()  { echo -e "\033[1;33m[DEPLOY-WARN]\033[0m  $*"; }
log_error() { echo -e "\033[1;31m[DEPLOY-ERROR]\033[0m $*" >&2; }

echo "=============================================================================="
echo " Vinxa Live ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Starting CD Deployment on AWS EC2"
echo " Mode        : ${DEPLOY_MODE}"
echo " App Dir     : ${APP_DIR}"
echo " Timestamp   : ${TIMESTAMP}"
echo "=============================================================================="

# ------------------------------------------------------------------------------
# 1. Safety Check: Ensure Pre-Flight Prerequisites Exist
# ------------------------------------------------------------------------------
if ! command -v java >/dev/null 2>&1 || ! command -v nginx >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
    log_warn "One or more prerequisites missing. Running ec2-preflight-setup.sh first..."
    bash "${APP_DIR}/infrastructure/scripts/ec2-preflight-setup.sh"
fi

# ------------------------------------------------------------------------------
# 2. Configure Environment File (/opt/vinxa/.env)
# ------------------------------------------------------------------------------
ENV_FILE="${APP_DIR}/.env"
log_info "Configuring runtime environment variables at ${ENV_FILE}..."

# Preserve existing .env if no new variables were injected via CI environment
if [ ! -f "${ENV_FILE}" ]; then
    touch "${ENV_FILE}"
fi

chmod 600 "${ENV_FILE}"

update_env_var() {
    local key="$1"
    local val="$2"
    if [ -n "${val}" ]; then
        if grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
            sed -i "s|^${key}=.*|${key}=${val}|" "${ENV_FILE}"
        else
            echo "${key}=${val}" >> "${ENV_FILE}"
        fi
    fi
}

update_env_var "SERVER_PORT" "${BACKEND_PORT}"
update_env_var "SPRING_PROFILES_ACTIVE" "${SPRING_PROFILES_ACTIVE:-prod}"
update_env_var "SPRING_DATASOURCE_URL" "${SPRING_DATASOURCE_URL:-}"
update_env_var "SPRING_DATASOURCE_USERNAME" "${SPRING_DATASOURCE_USERNAME:-}"
update_env_var "SPRING_DATASOURCE_PASSWORD" "${SPRING_DATASOURCE_PASSWORD:-}"
update_env_var "JWT_SECRET" "${JWT_SECRET:-}"
update_env_var "DEEPGRAM_API_KEY" "${DEEPGRAM_API_KEY:-}"
update_env_var "GEMINI_API_KEY" "${GEMINI_API_KEY:-}"
update_env_var "GEMINI_MODEL" "${GEMINI_MODEL:-gemini-flash-lite-latest}"

log_ok "Environment file updated."

# ------------------------------------------------------------------------------
# 3. Backup Current Release for Instant Rollback
# ------------------------------------------------------------------------------
BACKUP_DIR="${APP_DIR}/backups/${TIMESTAMP}"
mkdir -p "${BACKUP_DIR}"
HAS_BACKUP=0

if [ -f "${APP_DIR}/backend/vinxa-live-backend.jar" ]; then
    cp "${APP_DIR}/backend/vinxa-live-backend.jar" "${BACKUP_DIR}/vinxa-live-backend.jar"
    HAS_BACKUP=1
    log_info "Backed up previous backend JAR to ${BACKUP_DIR}/vinxa-live-backend.jar"
fi

if [ -d "${APP_DIR}/dashboard/dist" ] && [ "$(ls -A "${APP_DIR}/dashboard/dist" 2>/dev/null || true)" ]; then
    cp -r "${APP_DIR}/dashboard/dist" "${BACKUP_DIR}/dashboard_dist"
    log_info "Backed up previous dashboard build to ${BACKUP_DIR}/dashboard_dist"
fi

# Keep only the 5 most recent backups so disk never fills up
ls -dt "${APP_DIR}/backups"/* 2>/dev/null | tail -n +6 | xargs -r rm -rf || true

# ------------------------------------------------------------------------------
# 4. Deploy Mode: Docker Compose OR Native Systemd + Nginx
# ------------------------------------------------------------------------------
if [ "${DEPLOY_MODE}" = "docker" ]; then
    log_info "Deploying via Docker Compose (infrastructure/docker-compose.prod.yml)..."
    cd "${APP_DIR}"
    sudo docker compose -f infrastructure/docker-compose.prod.yml --env-file "${ENV_FILE}" up -d --build --remove-orphans
else
    # 4a. If source repo was synced without prebuilt artifacts, build on EC2
    if [ ! -f "${APP_DIR}/backend/vinxa-live-backend.jar" ] && [ -f "${APP_DIR}/backend/pom.xml" ]; then
        log_info "Building Spring Boot backend JAR on EC2..."
        cd "${APP_DIR}/backend"
        mvn clean package -DskipTests -B
        cp target/vinxa-live-backend-*.jar "${APP_DIR}/backend/vinxa-live-backend.jar"
    fi

    if [ ! -f "${APP_DIR}/dashboard/dist/index.html" ] && [ -f "${APP_DIR}/package.json" ]; then
        log_info "Building Frontend Dashboard & Extension on EC2..."
        cd "${APP_DIR}"
        rm -f package-lock.json apps/dashboard/package-lock.json apps/extension/package-lock.json
        npm install --include=optional --no-audit --no-fund
        npm run build:dashboard
        npm run build:extension
        mkdir -p "${APP_DIR}/dashboard/dist"
        cp -r "${APP_DIR}/apps/dashboard/dist/"* "${APP_DIR}/dashboard/dist/"
    fi

    # 4b. Install & Restart systemd service for Spring Boot backend
    log_info "Configuring systemd service (vinxa-backend.service)..."
    SERVICE_SRC="${APP_DIR}/infrastructure/systemd/vinxa-backend.service"
    if [ -f "${SERVICE_SRC}" ]; then
        sed -e "s|__DEPLOY_USER__|${DEPLOY_USER}|g" \
            -e "s|__APP_DIR__|${APP_DIR}|g" \
            "${SERVICE_SRC}" | sudo tee /etc/systemd/system/vinxa-backend.service >/dev/null
    fi

    sudo systemctl daemon-reload
    sudo systemctl enable vinxa-backend.service
    sudo systemctl restart vinxa-backend.service
    log_ok "vinxa-backend.service restarted."

    # 4c. Configure & Reload Nginx Reverse Proxy
    log_info "Configuring Nginx for Vinxa Live Dashboard & WebSocket proxy..."
    NGINX_SRC="${APP_DIR}/infrastructure/nginx/vinxa.conf"
    if [ -f "${NGINX_SRC}" ]; then
        # Ensure Nginx worker user can traverse to /opt/vinxa/dashboard/dist
        sudo chmod 755 "${APP_DIR}" "${APP_DIR}/dashboard" "${APP_DIR}/dashboard/dist"

        if [ -d /etc/nginx/sites-available ]; then
            sed "s|__APP_DIR__|${APP_DIR}|g" "${NGINX_SRC}" | sudo tee /etc/nginx/sites-available/vinxa >/dev/null
            sudo ln -sfn /etc/nginx/sites-available/vinxa /etc/nginx/sites-enabled/vinxa
            sudo rm -f /etc/nginx/sites-enabled/default
        else
            sed "s|__APP_DIR__|${APP_DIR}|g" "${NGINX_SRC}" | sudo tee /etc/nginx/conf.d/vinxa.conf >/dev/null
        fi
    fi

    sudo nginx -t
    sudo systemctl reload nginx
    log_ok "Nginx configuration validated and reloaded."
fi

# ------------------------------------------------------------------------------
# 5. Post-Deployment Health Checks & Automatic Rollback
# ------------------------------------------------------------------------------
log_info "Waiting for backend health check at ${HEALTH_URL} (up to 60s)..."
HEALTHY=0
for attempt in $(seq 1 30); do
    if curl -fsS "${HEALTH_URL}" 2>/dev/null | grep -q '"status":"UP"'; then
        HEALTHY=1
        break
    fi
    sleep 2
done

if [ "${HEALTHY}" -eq 1 ]; then
    log_ok "Backend health check PASSED (${HEALTH_URL} -> status: UP)."
else
    log_error "Backend health check FAILED after 60 seconds!"
    sudo journalctl -u vinxa-backend.service -n 50 --no-pager || true

    if [ "${HAS_BACKUP}" -eq 1 ] && [ "${DEPLOY_MODE}" = "native" ]; then
        log_warn "Initiating automatic rollback to previous JAR (${BACKUP_DIR}/vinxa-live-backend.jar)..."
        cp "${BACKUP_DIR}/vinxa-live-backend.jar" "${APP_DIR}/backend/vinxa-live-backend.jar"
        sudo systemctl restart vinxa-backend.service
        log_warn "Rollback completed."
    fi
    exit 1
fi

log_info "Verifying Nginx Frontend Dashboard response on http://127.0.0.1:80/ ..."
if curl -fsS "http://127.0.0.1:80/" | grep -qi "Vinxa Live"; then
    log_ok "Frontend Web Dashboard check PASSED (React SPA served on port 80)."
else
    log_error "Nginx Frontend Web Dashboard check FAILED on port 80!"
    exit 1
fi

PUBLIC_IP="$(curl -fsS --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || hostname -I | awk '{print $1}')"
echo "=============================================================================="
echo " VINXA LIVE FULL-STACK (FRONTEND + BACKEND) DEPLOYMENT SUCCEEDED!"
echo " Frontend Dashboard (Domain) : http://vinxa.ogakash.xyz/"
echo " Frontend Dashboard (IP)     : http://${PUBLIC_IP}/"
echo " Backend REST API            : http://api.vinxa.ogakash.xyz/api/v1"
echo " Backend Health              : http://api.vinxa.ogakash.xyz/actuator/health (UP)"
echo " Live Audio WebSocket        : ws://api.vinxa.ogakash.xyz/ws/audio"
echo "=============================================================================="
