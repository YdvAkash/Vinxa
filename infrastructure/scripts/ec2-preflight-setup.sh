#!/usr/bin/env bash
# ==============================================================================
# Vinxa Live â€” AWS EC2 Pre-Flight Check & Auto-Provisioning Script
# ==============================================================================
# Checks all required runtime dependencies on an AWS EC2 instance before code
# is deployed. Any missing or outdated component is automatically installed:
#   1. Core system packages (git, curl, wget, unzip, jq, tar, lsof)
#   2. Swap space (2GB swapfile if instance has < 4GB RAM and no swap)
#   3. Java 21 (OpenJDK 21 / Amazon Corretto 21)
#   4. Apache Maven 3.9+
#   5. Node.js 20 LTS & npm
#   6. Docker Engine & Docker Compose v2
#   7. Nginx Web Server & Reverse Proxy
#   8. Deployment directories (/opt/vinxa/*)
# ==============================================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/vinxa}"
DEPLOY_USER="${DEPLOY_USER:-$(whoami)}"

log_info()  { echo -e "\033[1;34m[PREFLIGHT-INFO]\033[0m  $*"; }
log_ok()    { echo -e "\033[1;32m[PREFLIGHT-OK]\033[0m    $*"; }
log_warn()  { echo -e "\033[1;33m[PREFLIGHT-INSTALL]\033[0m $*"; }
log_error() { echo -e "\033[1;31m[PREFLIGHT-ERROR]\033[0m $*" >&2; }

echo "=============================================================================="
echo " Vinxa Live â€” EC2 Pre-Flight Environment Check & Auto-Installer"
echo " Hostname : $(hostname)"
echo " User     : ${DEPLOY_USER}"
echo " App Dir  : ${APP_DIR}"
echo " Date     : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "=============================================================================="

# ------------------------------------------------------------------------------
# 0. Detect Linux Distribution & Package Manager
# ------------------------------------------------------------------------------
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_LIKE="${ID_LIKE:-}"
else
    OS_ID="unknown"
    OS_LIKE=""
fi

PKG_MGR=""
if command -v apt-get >/dev/null 2>&1; then
    PKG_MGR="apt"
elif command -v dnf >/dev/null 2>&1; then
    PKG_MGR="dnf"
elif command -v yum >/dev/null 2>&1; then
    PKG_MGR="yum"
else
    log_error "Unsupported package manager on OS: ${OS_ID}"
    exit 1
fi

log_info "Detected OS: ${OS_ID} (Package manager: ${PKG_MGR})"

update_pkg_cache() {
    if [ "${PKG_CACHE_UPDATED:-0}" -eq 0 ]; then
        log_info "Updating package manager cache..."
        if [ "${PKG_MGR}" = "apt" ]; then
            sudo DEBIAN_FRONTEND=noninteractive apt-get update -y -qq
        elif [ "${PKG_MGR}" = "dnf" ]; then
            sudo dnf makecache -y -q || true
        else
            sudo yum makecache -y -q || true
        fi
        PKG_CACHE_UPDATED=1
    fi
}

install_packages() {
    update_pkg_cache
    if [ "${PKG_MGR}" = "apt" ]; then
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@"
    elif [ "${PKG_MGR}" = "dnf" ]; then
        sudo dnf install -y -q "$@"
    else
        sudo yum install -y -q "$@"
    fi
}

# ------------------------------------------------------------------------------
# 1. Core System Utilities (git, curl, wget, unzip, jq, tar, lsof)
# ------------------------------------------------------------------------------
log_info "Checking core utilities (git, curl, wget, unzip, jq, tar, lsof)..."
MISSING_UTILS=()
for cmd in git curl wget unzip jq tar lsof; do
    if ! command -v "${cmd}" >/dev/null 2>&1; then
        MISSING_UTILS+=("${cmd}")
    fi
done

if [ "${#MISSING_UTILS[@]}" -gt 0 ]; then
    log_warn "Missing core utilities: ${MISSING_UTILS[*]}. Installing now..."
    if [ "${PKG_MGR}" = "apt" ]; then
        install_packages git curl wget unzip jq tar lsof ca-certificates gnupg lsb-release
    else
        install_packages git curl wget unzip jq tar lsof ca-certificates
    fi
    log_ok "Core utilities installed."
else
    log_ok "All core utilities are already installed."
fi

# ------------------------------------------------------------------------------
# 2. Swap Space Check (Prevent OOM on t2.micro / t3.micro / t3.small instances)
# ------------------------------------------------------------------------------
log_info "Checking memory and swap configuration..."
TOTAL_RAM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
TOTAL_SWAP_MB=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)

if [ "${TOTAL_SWAP_MB}" -lt 512 ] && [ "${TOTAL_RAM_MB}" -lt 4096 ]; then
    log_warn "Low RAM (${TOTAL_RAM_MB} MB) and insufficient swap (${TOTAL_SWAP_MB} MB). Creating 2GB swapfile..."
    if [ ! -f /swapfile ]; then
        sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile
        sudo swapon /swapfile
        if ! grep -q '/swapfile' /etc/fstab; then
            echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
        fi
        log_ok "2GB swapfile created and enabled."
    else
        sudo swapon /swapfile || true
        log_ok "Existing /swapfile activated."
    fi
else
    log_ok "Memory OK (RAM: ${TOTAL_RAM_MB} MB, Swap: ${TOTAL_SWAP_MB} MB)."
fi

# ------------------------------------------------------------------------------
# 3. Check & Install Java 21 (Required for Spring Boot 3 Backend)
# ------------------------------------------------------------------------------
log_info "Checking Java 21 installation..."
JAVA_MAJOR=0
if command -v java >/dev/null 2>&1; then
    JAVA_VER_STR=$(java -version 2>&1 | head -n 1)
    # Extract major version (handles "21.0.x" or "1.8.0")
    JAVA_MAJOR=$(echo "${JAVA_VER_STR}" | sed -E 's/.*"([0-9]+)(\.[0-9]+.*)?".*/\1/' || echo "0")
fi

if [ "${JAVA_MAJOR}" != "21" ]; then
    log_warn "Java 21 not found (detected major=${JAVA_MAJOR}). Installing OpenJDK 21..."
    if [ "${PKG_MGR}" = "apt" ]; then
        update_pkg_cache
        if ! sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openjdk-21-jdk; then
            log_warn "Adding Eclipse Temurin / Ubuntu PPA repository for OpenJDK 21..."
            install_packages software-properties-common
            sudo add-apt-repository -y ppa:openjdk-r/ppa || true
            sudo DEBIAN_FRONTEND=noninteractive apt-get update -y -qq
            sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openjdk-21-jdk
        fi
    elif [ "${PKG_MGR}" = "dnf" ]; then
        sudo dnf install -y java-21-amazon-corretto-devel || sudo dnf install -y java-21-openjdk-devel
    else
        sudo yum install -y java-21-amazon-corretto-devel || sudo yum install -y java-21-openjdk-devel
    fi
    log_ok "Java 21 installed: $(java -version 2>&1 | head -n 1)"
else
    log_ok "Java 21 is already installed: $(java -version 2>&1 | head -n 1)"
fi

# ------------------------------------------------------------------------------
# 4. Check & Install Apache Maven
# ------------------------------------------------------------------------------
log_info "Checking Apache Maven installation..."
if ! command -v mvn >/dev/null 2>&1; then
    log_warn "Maven is not installed. Installing Maven..."
    if [ "${PKG_MGR}" = "apt" ]; then
        install_packages maven
    else
        MAVEN_VER="3.9.9"
        log_info "Installing Apache Maven ${MAVEN_VER} binary to /opt/maven..."
        curl -fsSL "https://archive.apache.org/dist/maven/maven-3/${MAVEN_VER}/binaries/apache-maven-${MAVEN_VER}-bin.tar.gz" -o /tmp/maven.tar.gz
        sudo tar -xzf /tmp/maven.tar.gz -C /opt
        sudo ln -sfn "/opt/apache-maven-${MAVEN_VER}" /opt/maven
        sudo ln -sfn /opt/maven/bin/mvn /usr/local/bin/mvn
        rm -f /tmp/maven.tar.gz
    fi
    log_ok "Maven installed: $(mvn -version | head -n 1)"
else
    log_ok "Maven is already installed: $(mvn -version | head -n 1)"
fi

# ------------------------------------------------------------------------------
# 5. Check & Install Node.js 20 LTS & npm
# ------------------------------------------------------------------------------
log_info "Checking Node.js 20+ and npm..."
NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
    NODE_MAJOR=$(node -v | sed -E 's/^v([0-9]+).*/\1/' || echo "0")
fi

if [ "${NODE_MAJOR}" -lt 20 ]; then
    log_warn "Node.js 20+ not found (detected v${NODE_MAJOR}). Installing Node.js 20 LTS..."
    if [ "${PKG_MGR}" = "apt" ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
    else
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        install_packages nodejs
    fi
    log_ok "Node.js installed: $(node -v), npm: $(npm -v)"
else
    log_ok "Node.js is already installed: $(node -v), npm: $(npm -v)"
fi

# ------------------------------------------------------------------------------
# 6. Check & Install Docker Engine & Docker Compose v2
# ------------------------------------------------------------------------------
log_info "Checking Docker & Docker Compose installation..."
if ! command -v docker >/dev/null 2>&1; then
    log_warn "Docker not found. Installing Docker Engine..."
    if [ "${PKG_MGR}" = "apt" ]; then
        curl -fsSL https://get.docker.com | sudo sh
    elif [ "${PKG_MGR}" = "dnf" ]; then
        sudo dnf install -y docker
    else
        sudo yum install -y docker
    fi
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo usermod -aG docker "${DEPLOY_USER}" || true
    log_ok "Docker installed: $(docker --version)"
else
    if ! sudo systemctl is-active --quiet docker; then
        log_warn "Docker service is not running. Starting Docker..."
        sudo systemctl enable docker
        sudo systemctl start docker
    fi
    sudo usermod -aG docker "${DEPLOY_USER}" || true
    log_ok "Docker is already installed and active: $(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
    log_warn "Docker Compose plugin not found. Installing Docker Compose v2..."
    if [ "${PKG_MGR}" = "apt" ]; then
        install_packages docker-compose-plugin || true
    fi
    if ! docker compose version >/dev/null 2>&1; then
        COMPOSE_ARCH=$(uname -m)
        sudo mkdir -p /usr/local/lib/docker/cli-plugins
        sudo curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${COMPOSE_ARCH}" \
            -o /usr/local/lib/docker/cli-plugins/docker-compose
        sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
        sudo ln -sfn /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
    fi
    log_ok "Docker Compose installed."
else
    log_ok "Docker Compose is available."
fi

# ------------------------------------------------------------------------------
# 7. Check & Install Nginx Reverse Proxy
# ------------------------------------------------------------------------------
log_info "Checking Nginx installation..."
if ! command -v nginx >/dev/null 2>&1; then
    log_warn "Nginx not found. Installing Nginx..."
    install_packages nginx
    sudo systemctl enable nginx
    sudo systemctl start nginx
    log_ok "Nginx installed: $(nginx -v 2>&1)"
else
    if ! sudo systemctl is-active --quiet nginx; then
        log_warn "Nginx service is stopped. Starting Nginx..."
        sudo systemctl enable nginx
        sudo systemctl start nginx
    fi
    log_ok "Nginx is already installed and running: $(nginx -v 2>&1)"
fi

# ------------------------------------------------------------------------------
# 8. Prepare Application Directory Structure & Firewall Ports
# ------------------------------------------------------------------------------
log_info "Preparing application directories under ${APP_DIR}..."
sudo mkdir -p \
    "${APP_DIR}/backend" \
    "${APP_DIR}/dashboard/dist" \
    "${APP_DIR}/extension/dist" \
    "${APP_DIR}/infrastructure/nginx" \
    "${APP_DIR}/infrastructure/systemd" \
    "${APP_DIR}/infrastructure/scripts" \
    "${APP_DIR}/logs" \
    "${APP_DIR}/backups"

sudo chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}"
log_ok "Directory structure verified and owned by ${DEPLOY_USER}."

# If UFW is active on Ubuntu, ensure ports 22, 80, 443, 8080 are allowed
if command -v ufw >/dev/null 2>&1; then
    if sudo ufw status | grep -q "Status: active"; then
        log_info "UFW is active. Ensuring OpenSSH, HTTP (80), HTTPS (443), and Backend (8080) are allowed..."
        sudo ufw allow OpenSSH >/dev/null 2>&1 || true
        sudo ufw allow 80/tcp >/dev/null 2>&1 || true
        sudo ufw allow 443/tcp >/dev/null 2>&1 || true
        sudo ufw allow 8080/tcp >/dev/null 2>&1 || true
        log_ok "UFW rules updated."
    fi
fi

# ------------------------------------------------------------------------------
# 9. Final Verification Report
# ------------------------------------------------------------------------------
echo ""
echo "=============================================================================="
echo " EC2 PRE-FLIGHT CHECK PASSED â€” ALL REQUIRED DEPENDENCIES READY"
echo "=============================================================================="
echo " Java           : $(java -version 2>&1 | head -n 1)"
echo " Maven          : $(mvn -version 2>&1 | head -n 1)"
echo " Node.js        : $(node -v)"
echo " npm            : $(npm -v)"
echo " Docker         : $(docker --version)"
echo " Nginx          : $(nginx -v 2>&1)"
echo " Git            : $(git --version)"
echo " Free Disk      : $(df -h / | awk 'NR==2 {print $4 " available (" $5 " used)"}')"
echo " Memory / Swap  : RAM ${TOTAL_RAM_MB} MB / Swap $(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo) MB"
echo "=============================================================================="
