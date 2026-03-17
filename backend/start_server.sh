#!/bin/bash

# Script para iniciar el servidor FastAPI y abrir el navegador automáticamente
# Autor: Calendar App Team
# Fecha: 2025-09-29

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Server configuration
SERVER_HOST="${SERVER_HOST:-localhost}"
SERVER_PORT="${SERVER_PORT:-8000}"
API_URL="http://${SERVER_HOST}:${SERVER_PORT}"
DOCS_URL="${API_URL}/docs"

clear

echo "============================================================"
echo "  🚀 Calendar App Backend - Server Launcher"
echo "============================================================"
echo ""

# Activate virtual environment
echo -e "${BLUE}[1/5]${NC} Activando entorno virtual..."
if [ ! -d "venv" ]; then
    echo -e "${RED}✗${NC} Entorno virtual no encontrado"
    echo "Por favor crea el entorno virtual primero: python3 -m venv venv"
    exit 1
fi
source venv/bin/activate
echo -e "${GREEN}✓${NC} Entorno virtual activado"

# Check if PostgreSQL is running
echo -e "${BLUE}[2/5]${NC} Verificando conexión a PostgreSQL..."
if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} PostgreSQL está corriendo"
else
    echo -e "${YELLOW}⚠${NC} PostgreSQL no está corriendo"
    echo "Advertencia: El servidor puede no funcionar correctamente sin PostgreSQL"
    read -p "¿Deseas continuar de todos modos? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if port is available
echo -e "${BLUE}[3/5]${NC} Verificando disponibilidad del puerto ${SERVER_PORT}..."
if lsof -Pi :${SERVER_PORT} -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}⚠${NC} Puerto ${SERVER_PORT} está en uso"
    echo "Deteniendo proceso anterior..."
    lsof -ti:${SERVER_PORT} | xargs kill -9 2>/dev/null || true
    sleep 2
fi
echo -e "${GREEN}✓${NC} Puerto ${SERVER_PORT} disponible"

# Display server information
echo ""
echo "============================================================"
echo -e "${BLUE}[4/5]${NC} Información del Servidor:"
echo "============================================================"
echo -e "  Host:       ${GREEN}${SERVER_HOST}${NC}"
echo -e "  Port:       ${GREEN}${SERVER_PORT}${NC}"
echo -e "  API URL:    ${GREEN}${API_URL}${NC}"
echo -e "  API Docs:   ${GREEN}${DOCS_URL}${NC}"
echo "============================================================"
echo ""

# Wait a moment for user to read
sleep 1

# Start server in background
echo -e "${BLUE}[5/5]${NC} Iniciando servidor FastAPI..."
echo ""

# Function to open browser after server is ready
open_browser() {
    # Wait for server to be ready
    echo "Esperando a que el servidor esté listo..."
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if curl -s "${API_URL}" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} Servidor listo!"
            echo ""

            # Open browser
            echo "Abriendo navegador en ${DOCS_URL}..."
            sleep 1

            # Try to open browser (works on macOS, Linux, WSL)
            if command -v open &> /dev/null; then
                open "${DOCS_URL}"
            elif command -v xdg-open &> /dev/null; then
                xdg-open "${DOCS_URL}"
            elif command -v wslview &> /dev/null; then
                wslview "${DOCS_URL}"
            else
                echo -e "${YELLOW}⚠${NC} No se pudo abrir el navegador automáticamente"
                echo "Por favor abre manualmente: ${DOCS_URL}"
            fi

            echo ""
            echo "============================================================"
            echo -e "  ${GREEN}✅ SERVIDOR EN EJECUCIÓN${NC}"
            echo "============================================================"
            echo ""
            echo "Credenciales de prueba:"
            echo "  Email:    test@calendar.com"
            echo "  Password: testpass123"
            echo ""
            echo "URLs disponibles:"
            echo "  • API Docs (Swagger): ${DOCS_URL}"
            echo "  • API Docs (Redoc):   ${API_URL}/redoc"
            echo "  • Health Check:       ${API_URL}/"
            echo ""
            echo "Para detener el servidor, presiona Ctrl+C"
            echo "============================================================"
            echo ""

            break
        fi

        attempt=$((attempt + 1))
        sleep 1
    done

    if [ $attempt -eq $max_attempts ]; then
        echo -e "${RED}✗${NC} El servidor tardó demasiado en iniciar"
        echo "Por favor revisa los logs arriba para más información"
    fi
}

# Run browser opener in background
open_browser &

# Start server (this will block)
uvicorn app.main:app --reload --host ${SERVER_HOST} --port ${SERVER_PORT}

# This will only run if server exits
echo ""
echo "============================================================"
echo "  Servidor detenido"
echo "============================================================"