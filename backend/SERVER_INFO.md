# 🌐 Server Information - Fitsi AI Backend

## ✅ Servidor Activo y Funcionando

El servidor FastAPI está corriendo y el navegador se ha abierto automáticamente en la documentación interactiva.

---

## 🌐 URLs del Servidor

| Servicio          | URL                                    | Descripción                           |
|-------------------|----------------------------------------|---------------------------------------|
| **API Base**      | http://localhost:8000                  | Endpoint principal de la API          |
| **API Docs**      | http://localhost:8000/docs             | Documentación interactiva (Swagger)   |
| **ReDoc**         | http://localhost:8000/redoc            | Documentación alternativa (ReDoc)     |
| **OpenAPI JSON**  | http://localhost:8000/openapi.json     | Especificación OpenAPI en JSON        |

---

## 🔐 Credenciales de Prueba

```
Email:    test@calendar.com
Password: testpass123
```

**Datos del Usuario:**
- First Name: Test
- Last Name: User
- Status: Active
- Actividades: 5 actividades de ejemplo en octubre 2025

---

## ⚙️ Configuración del Servidor

| Parámetro           | Valor                |
|---------------------|----------------------|
| Host                | localhost            |
| Port                | 8000                 |
| Reload              | Activado             |
| Database            | PostgreSQL           |
| Database Host       | localhost:5432       |
| Database Name       | calendar_db          |

---

## 🔌 Endpoints Disponibles

### Autenticación

#### POST /auth/register
Registrar nuevo usuario
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "password123",
    "first_name": "New",
    "last_name": "User"
  }'
```

#### POST /auth/login
Iniciar sesión
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@calendar.com",
    "password": "testpass123"
  }'
```

### Actividades

#### GET /activities/
Obtener todas las actividades del usuario
```bash
curl -X GET http://localhost:8000/activities/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### POST /activities/
Crear nueva actividad
```bash
curl -X POST http://localhost:8000/activities/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Nueva Actividad",
    "description": "Descripción de la actividad",
    "start_time": "2025-10-01T10:00:00",
    "end_time": "2025-10-01T11:00:00",
    "status": "scheduled"
  }'
```

#### GET /activities/{activity_id}
Obtener actividad específica
```bash
curl -X GET http://localhost:8000/activities/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### PUT /activities/{activity_id}
Actualizar actividad
```bash
curl -X PUT http://localhost:8000/activities/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Actividad Actualizada",
    "status": "completed"
  }'
```

#### DELETE /activities/{activity_id}
Eliminar actividad
```bash
curl -X DELETE http://localhost:8000/activities/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🚀 Usar la Documentación Interactiva

### Swagger UI (http://localhost:8000/docs)

1. **Autenticarse:**
   - Haz clic en "POST /auth/login"
   - Click en "Try it out"
   - Ingresa las credenciales:
     ```json
     {
       "email": "test@calendar.com",
       "password": "testpass123"
     }
     ```
   - Click en "Execute"
   - Copia el `access_token` de la respuesta

2. **Autorizar:**
   - Click en el botón "Authorize" 🔓 (arriba a la derecha)
   - Ingresa: `Bearer YOUR_TOKEN` (reemplaza YOUR_TOKEN con el token copiado)
   - Click en "Authorize"

3. **Probar Endpoints:**
   - Ahora puedes probar cualquier endpoint
   - Todos los requests incluirán automáticamente tu token

### Ejemplos de Uso

#### Listar Actividades
1. Click en "GET /activities/"
2. Click en "Try it out"
3. Click en "Execute"
4. Verás las 5 actividades de ejemplo

#### Crear Nueva Actividad
1. Click en "POST /activities/"
2. Click en "Try it out"
3. Modifica el JSON de ejemplo
4. Click en "Execute"

#### Actualizar Actividad
1. Click en "PUT /activities/{activity_id}"
2. Click en "Try it out"
3. Ingresa el ID de la actividad (ejemplo: 1)
4. Modifica los campos que quieras actualizar
5. Click en "Execute"

---

## 🛑 Detener el Servidor

Para detener el servidor, presiona **Ctrl+C** en la terminal donde está corriendo.

O desde otra terminal:
```bash
lsof -ti:8000 | xargs kill -9
```

---

## 🔄 Reiniciar el Servidor

Si hiciste cambios en el código, el servidor se recargará automáticamente gracias al modo `--reload`.

Para reiniciar manualmente:
```bash
./start_server.sh
```

---

## 📊 Monitoreo

### Ver Logs en Tiempo Real
Los logs se muestran automáticamente en la terminal donde ejecutaste el servidor.

### Verificar Estado del Servidor
```bash
curl http://localhost:8000/
```

Respuesta esperada:
```json
{"message":"Fitsi API is running!"}
```

### Verificar Base de Datos
```bash
pg_isready -h localhost -p 5432
```

---

## 🐛 Solución de Problemas

### Puerto 8000 ya en uso
```bash
# Ver qué proceso usa el puerto
lsof -i :8000

# Matar el proceso
lsof -ti:8000 | xargs kill -9

# Reiniciar servidor
./start_server.sh
```

### PostgreSQL no está corriendo
```bash
# Verificar estado
pg_isready -h localhost -p 5432

# En macOS (si instalado con Homebrew)
brew services start postgresql@14
```

### Error de autenticación
Re-ejecutar seeds para resetear la contraseña:
```bash
python seed_data.py
```

---

## 📚 Más Información

- **Documentación Completa:** `INITIALIZATION_COMPLETE.md`
- **Guía Rápida:** `QUICK_START.md`
- **Reporte de Tests:** `TESTING_REPORT.md`
- **Datos de Prueba:** `SEED_DATA_README.md`

---

**Servidor Iniciado:** $(date)
**Estado:** ✅ ACTIVO Y FUNCIONANDO
**Documentación:** http://localhost:8000/docs