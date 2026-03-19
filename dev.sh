#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dev.sh — Levanta TODO el sistema Cal AI en desarrollo
#
# Uso:
#   ./dev.sh          # levanta todo (DB + Redis + Backend + Mobile)
#   ./dev.sh stop     # para todos los contenedores Docker del proyecto
#   ./dev.sh logs     # muestra logs de contenedores
#   ./dev.sh reset    # borra volúmenes Docker (DB limpia)
#
# Requisitos: Docker (corriendo), Python 3.11+, Node.js 18+
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
MOBILE="$ROOT/mobile"
COMPOSE="docker compose -f $ROOT/docker-compose.dev.yml"
LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"

BACKEND_PID=""
MOBILE_PID=""

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo -e "${BOLD}${BLUE}[dev]${NC} $*"; }
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }
err()  { echo -e "${RED}  ✗${NC} $*"; }
sep()  { echo -e "${BLUE}────────────────────────────────────────────────────${NC}"; }

port_in_use() { lsof -i :"$1" &>/dev/null; }

cleanup() {
  echo ""
  log "Deteniendo servicios..."
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null && ok "Backend detenido"
  [[ -n "$MOBILE_PID"  ]] && kill "$MOBILE_PID"  2>/dev/null && ok "Mobile detenido"
  # Solo detener los contenedores que NOSOTROS levantamos (no los pre-existentes)
  if [[ "${_STARTED_DOCKER:-false}" == "true" ]]; then
    $COMPOSE stop 2>/dev/null && ok "Docker (Postgres + Redis) detenidos"
  fi
  sep
  echo -e "${BOLD}Bye!${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── Subcomandos ───────────────────────────────────────────────────────────────
case "${1:-}" in
  stop)
    log "Parando contenedores..."
    $COMPOSE down
    ok "Contenedores detenidos"
    exit 0
    ;;
  logs)
    $COMPOSE logs -f
    exit 0
    ;;
  reset)
    warn "Esto borrará TODOS los datos (PostgreSQL + Redis). ¿Seguro? (y/N)"
    read -r confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || { log "Cancelado."; exit 0; }
    $COMPOSE down -v
    ok "Volúmenes borrados. Próximo ./dev.sh empezará con DB limpia."
    exit 0
    ;;
esac

# ═══════════════════════════════════════════════════════════════════════════════
clear
echo -e "${BOLD}${CYAN}"
echo "  ██████╗ █████╗ ██╗      █████╗ ██╗"
echo " ██╔════╝██╔══██╗██║     ██╔══██╗██║"
echo " ██║     ███████║██║     ███████║██║"
echo " ██║     ██╔══██║██║     ██╔══██║██║"
echo " ╚██████╗██║  ██║███████╗██║  ██║██║"
echo "  ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  dev"
echo -e "${NC}"
sep

# ── 1. Verificar herramientas ─────────────────────────────────────────────────
log "Verificando requisitos..."

for cmd in docker node python3; do
  if command -v "$cmd" &>/dev/null; then ok "$cmd encontrado"
  else err "$cmd NO encontrado — instalar antes de continuar"; exit 1; fi
done

if ! docker info &>/dev/null; then
  err "Docker no está corriendo. Abre Docker Desktop y vuelve a intentar."
  exit 1
fi
ok "Docker daemon activo"

# ── 2. .env del backend ───────────────────────────────────────────────────────
sep
log "Configuración backend (.env)..."

if [[ ! -f "$BACKEND/.env" ]]; then
  warn ".env no encontrado → creando con valores de desarrollo"
  cat > "$BACKEND/.env" << 'ENVEOF'
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/calendar_db
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=dev-secret-key-change-in-production-32ch
REFRESH_SECRET_KEY=dev-refresh-secret-change-in-prod-32ch
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30
CORS_ORIGINS=["http://localhost:8081","exp://localhost:8081","http://localhost:19006","http://localhost:8000"]
# OPENAI_API_KEY=sk-...   ← descomenta y pega tu key para el AI food scan
ENVEOF
  ok ".env de desarrollo creado"
else
  ok ".env ya existe"
fi

# ── 3. Docker: Postgres + Redis ───────────────────────────────────────────────
sep
log "Verificando PostgreSQL + Redis..."
_STARTED_DOCKER=false

# Función para esperar que postgres acepte conexiones
wait_postgres() {
  local retries=30
  while ! docker exec "$(docker ps -q --filter "publish=5432")" \
        pg_isready -q 2>/dev/null; do
    retries=$((retries - 1))
    [[ $retries -eq 0 ]] && { err "Postgres no respondió"; return 1; }
    sleep 1
  done
}

# Función para esperar redis
wait_redis() {
  local retries=20
  while ! docker exec "$(docker ps -q --filter "publish=6379")" \
        redis-cli ping 2>/dev/null | grep -q PONG; do
    retries=$((retries - 1))
    [[ $retries -eq 0 ]] && { err "Redis no respondió"; return 1; }
    sleep 1
  done
}

POSTGRES_OK=false
REDIS_OK=false

# Verificar si postgres ya responde en 5432
if port_in_use 5432; then
  ok "PostgreSQL ya está corriendo en :5432  (reutilizando)"
  POSTGRES_OK=true
fi

# Verificar si redis ya responde en 6379
if port_in_use 6379; then
  ok "Redis ya está corriendo en :6379  (reutilizando)"
  REDIS_OK=true
fi

# Levantar sólo lo que falte
if [[ "$POSTGRES_OK" == "false" || "$REDIS_OK" == "false" ]]; then
  log "Iniciando contenedores que faltan..."
  if [[ "$POSTGRES_OK" == "true" ]]; then
    $COMPOSE up -d redis 2>&1 | grep -v "^$" | sed "s/^/  [docker] /"
  elif [[ "$REDIS_OK" == "true" ]]; then
    $COMPOSE up -d postgres 2>&1 | grep -v "^$" | sed "s/^/  [docker] /"
  else
    $COMPOSE up -d 2>&1 | grep -v "^$" | sed "s/^/  [docker] /"
  fi
  _STARTED_DOCKER=true

  # Esperar que estén listos
  if [[ "$POSTGRES_OK" == "false" ]]; then
    log "Esperando PostgreSQL..."
    RETRIES=30
    until port_in_use 5432; do
      RETRIES=$((RETRIES-1)); [[ $RETRIES -eq 0 ]] && { err "Postgres timeout"; exit 1; }; sleep 1
    done
    sleep 2  # dar tiempo al healthcheck interno
    ok "PostgreSQL listo"
  fi

  if [[ "$REDIS_OK" == "false" ]]; then
    log "Esperando Redis..."
    RETRIES=20
    until port_in_use 6379; do
      RETRIES=$((RETRIES-1)); [[ $RETRIES -eq 0 ]] && { err "Redis timeout"; exit 1; }; sleep 1
    done
    ok "Redis listo"
  fi
fi

echo -e "  ${BOLD}PostgreSQL${NC}   localhost:5432"
echo -e "  ${BOLD}Redis${NC}        localhost:6379"

# ── 4. Python venv + dependencias ─────────────────────────────────────────────
sep
log "Preparando entorno Python..."
cd "$BACKEND"

if [[ ! -d "venv" ]]; then
  log "Creando virtualenv..."
  python3 -m venv venv
  ok "venv creado"
else
  ok "venv existe"
fi

PYTHON="$BACKEND/venv/bin/python"
PIP="$BACKEND/venv/bin/pip"

log "Instalando/verificando dependencias Python..."
# Excluir psycopg2-binary (usamos asyncpg)
DEPS=$(grep -v "psycopg2" "$BACKEND/requirements.txt" | tr '\n' ' ')
$PIP install --quiet --upgrade pip
$PIP install --quiet $DEPS
ok "Dependencias Python OK"

# ── 5. Backend FastAPI ─────────────────────────────────────────────────────────
sep
log "Iniciando backend FastAPI..."

# Si ya está corriendo en 8000, matarlo primero para que el reload funcione limpio
if port_in_use 8000; then
  warn "Puerto 8000 ocupado — intentando usar el backend existente"
  if curl -sf http://localhost:8000/ &>/dev/null; then
    ok "Backend ya está corriendo en :8000  (reutilizando)"
    BACKEND_PID=""
    BACKEND_REUSED=true
  else
    err "Puerto 8000 ocupado pero el backend no responde. Libera el puerto y vuelve a intentar."
    exit 1
  fi
else
  BACKEND_REUSED=false
  cd "$BACKEND"
  "$PYTHON" -m uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --reload \
    --log-level info \
    > "$LOG_DIR/backend.log" 2>&1 &
  BACKEND_PID=$!

  log "Esperando backend..."
  RETRIES=40
  until curl -sf http://localhost:8000/ &>/dev/null; do
    RETRIES=$((RETRIES-1))
    if [[ $RETRIES -eq 0 ]]; then
      err "Backend no respondió. Últimas líneas:"
      tail -30 "$LOG_DIR/backend.log"
      cleanup; exit 1
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      err "Backend crasheó:"; cat "$LOG_DIR/backend.log"; exit 1
    fi
    sleep 1
  done
  ok "Backend listo"
fi

# ── 6. Node modules ───────────────────────────────────────────────────────────
sep
log "Preparando entorno Node (Expo)..."
cd "$MOBILE"

if [[ ! -d "node_modules" ]]; then
  log "Instalando dependencias npm (puede tardar 1-2 min la primera vez)..."
  npm install --silent
  ok "node_modules instalado"
else
  ok "node_modules existe"
fi

# ── 7. Expo ───────────────────────────────────────────────────────────────────
sep
log "Iniciando Expo..."
cd "$MOBILE"

# Limpiar log anterior para que el detector de "listo" funcione bien
> "$LOG_DIR/mobile.log"

npx expo start \
  > "$LOG_DIR/mobile.log" 2>&1 &
MOBILE_PID=$!

log "Esperando Expo Metro bundler..."
RETRIES=90
until grep -qE "Metro waiting on|exp://|localhost:8081" "$LOG_DIR/mobile.log" 2>/dev/null; do
  RETRIES=$((RETRIES-1))
  if [[ $RETRIES -eq 0 ]]; then
    warn "Expo tardó más de 90s — puede que aún esté iniciando"
    break
  fi
  if ! kill -0 "$MOBILE_PID" 2>/dev/null; then
    err "Expo crasheó:"; cat "$LOG_DIR/mobile.log"; cleanup; exit 1
  fi
  sleep 1
done

# ── 8. Resumen ────────────────────────────────────────────────────────────────
sep
echo ""
echo -e "${BOLD}${GREEN}  ✅ SISTEMA LEVANTADO${NC}"
echo ""
echo -e "  ${BOLD}Infraestructura:${NC}"
echo -e "    PostgreSQL   ${GREEN}localhost:5432${NC}  db=calendar_db"
echo -e "    Redis        ${GREEN}localhost:6379${NC}"
echo ""
echo -e "  ${BOLD}Backend (FastAPI):${NC}"
echo -e "    API          ${GREEN}http://localhost:8000${NC}"
echo -e "    Swagger UI   ${GREEN}http://localhost:8000/docs${NC}"
if [[ "${BACKEND_REUSED:-false}" == "false" ]]; then
echo -e "    Log          ${CYAN}tail -f $LOG_DIR/backend.log${NC}"
fi
echo ""
echo -e "  ${BOLD}Mobile (Expo):${NC}"
echo -e "    Web          ${GREEN}http://localhost:8081${NC}"
echo -e "    Log/QR       ${CYAN}tail -f $LOG_DIR/mobile.log${NC}"
echo ""
echo -e "  ${BOLD}Comandos:${NC}"
echo -e "    ${CYAN}./dev.sh stop${NC}   → para contenedores Docker"
echo -e "    ${CYAN}./dev.sh reset${NC}  → borrar DB y empezar limpio"
echo -e "    ${CYAN}./dev.sh logs${NC}   → logs Docker"
echo ""
echo -e "  ${YELLOW}Ctrl+C para parar todo${NC}"
sep
echo ""

# ── 9. Stream logs en tiempo real ─────────────────────────────────────────────
if [[ "${BACKEND_REUSED:-false}" == "false" && -f "$LOG_DIR/backend.log" ]]; then
  tail -f "$LOG_DIR/backend.log" | sed "s/^/$(printf "${GREEN}[api]${NC}") /" &
fi
tail -f "$LOG_DIR/mobile.log" | sed "s/^/$(printf "${CYAN}[expo]${NC}") /" &

wait "${BACKEND_PID:-}" "${MOBILE_PID:-}" 2>/dev/null || true
# Si los procesos terminaron solos, limpiar igual
cleanup
