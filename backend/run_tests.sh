#!/bin/bash

# Script para ejecutar tests del backend de Fitsi AI
# Autor: Fitsi AI Team
# Fecha: 2025-09-29

set -e  # Exit on error

echo "=============================================="
echo "  Fitsi AI Backend - Test Runner"
echo "=============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Activate virtual environment
echo -e "${BLUE}[1/4]${NC} Activando entorno virtual..."
source venv/bin/activate

# Check if PostgreSQL is running
echo -e "${BLUE}[2/4]${NC} Verificando conexión a PostgreSQL..."
if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} PostgreSQL está corriendo"
else
    echo -e "${RED}✗${NC} PostgreSQL no está corriendo"
    echo "Por favor inicia PostgreSQL antes de ejecutar los tests de integración"
    exit 1
fi

# Run tests
echo -e "${BLUE}[3/4]${NC} Ejecutando tests..."
echo ""

# Parse command line arguments
if [ "$1" == "unit" ]; then
    echo "Ejecutando solo tests unitarios..."
    pytest -m unit -v --cov=app --cov-report=term --cov-report=html
elif [ "$1" == "integration" ]; then
    echo "Ejecutando solo tests de integración..."
    pytest -m integration -v --cov=app --cov-report=term --cov-report=html
elif [ "$1" == "fast" ]; then
    echo "Ejecutando tests rápidos (sin cobertura)..."
    pytest -v --tb=short
elif [ "$1" == "coverage" ]; then
    echo "Ejecutando tests con reporte de cobertura detallado..."
    pytest -v --cov=app --cov-report=term-missing --cov-report=html --cov-report=xml
else
    echo "Ejecutando todos los tests..."
    pytest -v --cov=app --cov-report=term-missing --cov-report=html
fi

# Check test result
TEST_RESULT=$?

echo ""
echo -e "${BLUE}[4/4]${NC} Generando reportes..."

if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Todos los tests pasaron!"
    echo ""
    echo "Reportes generados:"
    echo "  - Cobertura HTML: htmlcov/index.html"
    if [ "$1" == "coverage" ]; then
        echo "  - Cobertura XML: coverage.xml"
    fi
    echo ""
    echo "Para ver el reporte de cobertura:"
    echo "  open htmlcov/index.html"
else
    echo -e "${RED}✗${NC} Algunos tests fallaron"
    exit 1
fi

echo ""
echo "=============================================="
echo "  Test execution completed"
echo "=============================================="