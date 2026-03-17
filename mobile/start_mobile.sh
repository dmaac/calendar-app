#!/bin/bash

# Script para iniciar la aplicación mobile React Native Expo
# Autor: Calendar App Team
# Fecha: 2025-09-29

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
EXPO_PORT="${EXPO_PORT:-19006}"
API_URL="${API_URL:-http://localhost:8000}"

clear

echo "============================================================"
echo "  📱 Calendar App Mobile - Expo Launcher"
echo "============================================================"
echo ""

# Check if node_modules exists
echo -e "${BLUE}[1/4]${NC} Verificando dependencias..."
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠${NC} node_modules no encontrado. Instalando dependencias..."
    npm install
else
    echo -e "${GREEN}✓${NC} Dependencias instaladas"
fi

# Check if backend is running
echo -e "${BLUE}[2/4]${NC} Verificando conexión al backend..."
if curl -s "${API_URL}" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Backend está corriendo en ${API_URL}"
else
    echo -e "${YELLOW}⚠${NC} Backend no está corriendo en ${API_URL}"
    echo "Advertencia: La app móvil necesita el backend para funcionar"
    read -p "¿Deseas continuar de todos modos? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Inicia el backend primero con: cd ../backend && ./start_server.sh"
        exit 1
    fi
fi

# Display information
echo ""
echo "============================================================"
echo -e "${BLUE}[3/4]${NC} Información de la Aplicación:"
echo "============================================================"
echo -e "  Backend API:    ${GREEN}${API_URL}${NC}"
echo -e "  Expo Web:       ${GREEN}http://localhost:${EXPO_PORT}${NC}"
echo -e "  Expo DevTools:  ${GREEN}http://localhost:19002${NC}"
echo "============================================================"
echo ""

# Wait a moment for user to read
sleep 1

# Function to open browser after expo is ready
open_browser() {
    echo "Esperando a que Expo esté listo..."
    local max_attempts=60
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        # Check if Expo DevTools is ready
        if curl -s "http://localhost:19002" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} Expo listo!"
            echo ""

            # Wait a bit more for web to be ready
            sleep 3

            # Open browser
            echo "Abriendo navegador en http://localhost:${EXPO_PORT}..."

            # Try to open browser (works on macOS, Linux, WSL)
            if command -v open &> /dev/null; then
                open "http://localhost:${EXPO_PORT}"
            elif command -v xdg-open &> /dev/null; then
                xdg-open "http://localhost:${EXPO_PORT}"
            elif command -v wslview &> /dev/null; then
                wslview "http://localhost:${EXPO_PORT}"
            else
                echo -e "${YELLOW}⚠${NC} No se pudo abrir el navegador automáticamente"
                echo "Por favor abre manualmente: http://localhost:${EXPO_PORT}"
            fi

            echo ""
            echo "============================================================"
            echo -e "  ${GREEN}✅ EXPO EN EJECUCIÓN${NC}"
            echo "============================================================"
            echo ""
            echo "Credenciales de prueba:"
            echo "  Email:    test@calendar.com"
            echo "  Password: testpass123"
            echo ""
            echo "URLs disponibles:"
            echo "  • Expo Web:      http://localhost:${EXPO_PORT}"
            echo "  • Expo DevTools: http://localhost:19002"
            echo "  • Backend API:   ${API_URL}"
            echo "  • API Docs:      ${API_URL}/docs"
            echo ""
            echo "Opciones de visualización:"
            echo "  • Web Browser: Ya abierto automáticamente"
            echo "  • iOS: Escanea el QR con la app Expo Go"
            echo "  • Android: Escanea el QR con la app Expo Go"
            echo ""
            echo "Para detener Expo, presiona Ctrl+C"
            echo "============================================================"
            echo ""

            break
        fi

        attempt=$((attempt + 1))
        sleep 1
    done

    if [ $attempt -eq $max_attempts ]; then
        echo -e "${RED}✗${NC} Expo tardó demasiado en iniciar"
        echo "Por favor revisa los logs arriba para más información"
    fi
}

# Start browser opener in background
echo -e "${BLUE}[4/4]${NC} Iniciando Expo..."
echo ""

open_browser &

# Start Expo (this will block)
npm start

# This will only run if Expo exits
echo ""
echo "============================================================"
echo "  Expo detenido"
echo "============================================================"