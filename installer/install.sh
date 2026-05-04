#!/usr/bin/env bash
set -euo pipefail

# Cleanroom AI — Installation Script
# Supports: Ubuntu 22.04 LTS, RHEL 8+

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# ── Help ──────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo ""
  echo -e "${BOLD}Cleanroom AI — Installer${NC}"
  echo ""
  echo "Usage: bash installer/install.sh [--help]"
  echo ""
  echo "Installs and starts the Cleanroom AI platform on this server."
  echo "Requires Docker and Docker Compose (will offer to install Docker if missing)."
  echo ""
  exit 0
fi

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║       Cleanroom AI — Installer       ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── OS Check ─────────────────────────────────────────────────────────────────
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  OS_ID="${ID:-unknown}"
  OS_VERSION="${VERSION_ID:-unknown}"
  info "Detected OS: $PRETTY_NAME"
  if [[ "$OS_ID" != "ubuntu" && "$OS_ID" != "rhel" && "$OS_ID" != "centos" && "$OS_ID" != "rocky" ]]; then
    warn "This installer is tested on Ubuntu 22.04 and RHEL 8+. Proceeding anyway."
  fi
else
  warn "Could not detect OS. Proceeding without OS check."
fi

# ── GPU Check ─────────────────────────────────────────────────────────────────
if command -v nvidia-smi &>/dev/null; then
  GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | head -1 || true)
  if [[ -n "$GPU_INFO" ]]; then
    success "GPU detected: $GPU_INFO"
  else
    warn "nvidia-smi found but no GPU detected. Running in CPU-only mode (slower inference)."
  fi
else
  warn "No GPU detected (nvidia-smi not found). AI inference will run on CPU — adequate for light use with llama3.1:8b."
fi

# ── Docker Check ─────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  warn "Docker not found."
  read -rp "Install Docker automatically? [y/N] " INSTALL_DOCKER
  if [[ "${INSTALL_DOCKER,,}" == "y" ]]; then
    info "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    success "Docker installed. You may need to log out and back in for group changes."
  else
    error "Docker is required. Install it from https://docs.docker.com/engine/install/ and re-run this script."
  fi
fi

DOCKER_VERSION=$(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',')
success "Docker: $DOCKER_VERSION"

if ! docker compose version &>/dev/null; then
  error "Docker Compose (v2) not found. Install it from https://docs.docker.com/compose/install/"
fi
COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
success "Docker Compose: $COMPOSE_VERSION"

# ── Environment Setup ─────────────────────────────────────────────────────────
cd "$REPO_ROOT"

if [[ ! -f .env ]]; then
  info "Creating .env from .env.example..."
  cp .env.example .env

  # Generate a random JWT secret
  if command -v openssl &>/dev/null; then
    JWT_SECRET=$(openssl rand -hex 32)
    sed -i "s|change-this-to-a-random-secret-in-production|${JWT_SECRET}|g" .env
    success "Generated JWT secret."
  else
    warn "openssl not found — please manually set JWT_SECRET in .env before going to production."
  fi

  # Use PostgreSQL for production install
  sed -i 's|^DATABASE_URL=sqlite.*|DATABASE_URL=postgresql+asyncpg://cleanroom:cleanroom@postgres:5432/cleanroom|' .env
  sed -i 's|^# DATABASE_URL=postgresql.*|DATABASE_URL=postgresql+asyncpg://cleanroom:cleanroom@postgres:5432/cleanroom|' .env

  success ".env created."
else
  info ".env already exists, skipping."
fi

# ── Pull Images ───────────────────────────────────────────────────────────────
info "Pulling Docker images (this may take a few minutes on first run)..."
docker compose pull --quiet
success "Images ready."

# ── Start Services ────────────────────────────────────────────────────────────
info "Starting services..."
docker compose up -d
success "Services started."

# ── Wait for API health ───────────────────────────────────────────────────────
info "Waiting for API server to be healthy..."
ATTEMPTS=0
MAX_ATTEMPTS=24
until curl -sf http://localhost:8000/health >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [[ $ATTEMPTS -ge $MAX_ATTEMPTS ]]; then
    warn "API server did not respond within 2 minutes. Check logs with: docker compose logs server"
    break
  fi
  sleep 5
done

if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
  success "API server is healthy."
fi

# ── Pull AI Model ─────────────────────────────────────────────────────────────
info "Pulling AI model (llama3.1:8b — ~5GB, runs once)..."
info "This will take several minutes depending on your internet connection."
if docker compose exec -T ollama ollama pull llama3.1:8b; then
  success "Model llama3.1:8b ready."
else
  warn "Model pull failed or timed out. Run manually: make pull-model"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   Cleanroom AI installed successfully!   ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Dashboard:   ${CYAN}http://localhost:5173${NC}"
echo -e "  API docs:    ${CYAN}http://localhost:8000/docs${NC}"
echo -e "  Grafana:     ${CYAN}http://localhost:3001${NC}  (admin / admin)"
echo -e "  Prometheus:  ${CYAN}http://localhost:9090${NC}"
echo ""
echo -e "  Default login: ${BOLD}admin / admin${NC}"
echo ""
echo -e "${YELLOW}${BOLD}SECURITY:${NC} Change the default admin password immediately after first login."
echo -e "          Edit ${CYAN}.env${NC} and set a strong ${CYAN}JWT_SECRET${NC} before exposing to your network."
echo ""
