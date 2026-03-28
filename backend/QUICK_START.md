# 🚀 Quick Start - Fitsi AI Backend

## ✅ Sistema Listo Para Usar

El sistema está completamente inicializado y testeado. Puedes comenzar inmediatamente.

---

## 🌐 Información del Servidor

```
Host:     localhost
Port:     8000
API URL:  http://localhost:8000
API Docs: http://localhost:8000/docs
Redoc:    http://localhost:8000/redoc
```

---

## 🔐 Credenciales de Prueba

```
Email:    test@calendar.com
Password: testpass123
```

---

## ⚡ Comandos Rápidos

### Iniciar el Servidor (Automático con Navegador)
```bash
cd backend
./start_server.sh
```

Este script:
- ✅ Activa el entorno virtual
- ✅ Verifica PostgreSQL
- ✅ Inicia el servidor FastAPI
- ✅ Abre automáticamente el navegador en la documentación

### Iniciar el Servidor (Manual)
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host localhost --port 8000
```

### Ejecutar Tests
```bash
cd backend
./run_tests.sh
```

### Ver Documentación API
```
http://localhost:8000/docs
```

### Login (ejemplo curl)
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@calendar.com", "password": "testpass123"}'
```

---

## 📊 Estado del Sistema

✅ **39/39 tests pasando**
✅ **100% cobertura en modelos y servicios**
✅ **Base de datos inicializada**
✅ **Datos de prueba cargados**
✅ **Documentación completa**

---

## 📚 Documentación Disponible

- **INITIALIZATION_COMPLETE.md** - Resumen completo del sistema
- **TESTING_REPORT.md** - Reporte detallado de tests
- **SEED_DATA_README.md** - Información de datos de prueba
- **README.md** - Documentación general

---

## 🆘 Solución de Problemas

### Re-inicializar Datos
```bash
python seed_data.py
```

### Verificar PostgreSQL
```bash
pg_isready -h localhost -p 5432
```

### Ejecutar Tests Completos
```bash
./run_tests.sh coverage
```

---

## 🎯 Características Testeadas

✅ Autenticación de usuarios
✅ CRUD de actividades
✅ Validación de datos
✅ Seguridad (passwords hasheados)
✅ Integridad referencial
✅ Consultas por fecha
✅ Timestamps automáticos

---

**Todo está listo. ¡Comienza a desarrollar!** 🎉