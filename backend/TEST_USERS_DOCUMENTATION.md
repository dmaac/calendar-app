# 👥 Documentación de Usuarios de Prueba - Calendar App

## ✅ Resumen

Se han creado **21 usuarios de prueba** en la base de datos PostgreSQL:
- **1 usuario principal** (test@calendar.com)
- **20 usuarios adicionales** (user1 a user20)
- Cada usuario tiene **2-3 actividades de ejemplo** creadas
- Total de **55 actividades** en el sistema

---

## 🔐 Usuario Principal

El usuario principal para testing inicial:

```
Email:    test@calendar.com
Password: testpass123
Nombre:   Test User
```

Este usuario fue creado con el script `seed_data.py` y tiene 5 actividades de ejemplo.

---

## 👤 20 Usuarios de Simulación

Estos usuarios fueron creados con el script `seed_20_users.py`:

| # | Email | Password | Nombre Completo |
|---|-------|----------|-----------------|
| 1 | user1@calendar.com | userpass1 | Juan García |
| 2 | user2@calendar.com | userpass2 | María Rodríguez |
| 3 | user3@calendar.com | userpass3 | Carlos Martínez |
| 4 | user4@calendar.com | userpass4 | Ana López |
| 5 | user5@calendar.com | userpass5 | Luis González |
| 6 | user6@calendar.com | userpass6 | Carmen Pérez |
| 7 | user7@calendar.com | userpass7 | José Sánchez |
| 8 | user8@calendar.com | userpass8 | Isabel Ramírez |
| 9 | user9@calendar.com | userpass9 | Miguel Torres |
| 10 | user10@calendar.com | userpass10 | Laura Flores |
| 11 | user11@calendar.com | userpass11 | Pedro Rivera |
| 12 | user12@calendar.com | userpass12 | Sofía Gómez |
| 13 | user13@calendar.com | userpass13 | Diego Díaz |
| 14 | user14@calendar.com | userpass14 | Valentina Cruz |
| 15 | user15@calendar.com | userpass15 | Javier Morales |
| 16 | user16@calendar.com | userpass16 | Camila Reyes |
| 17 | user17@calendar.com | userpass17 | Ricardo Gutiérrez |
| 18 | user18@calendar.com | userpass18 | Daniela Ortiz |
| 19 | user19@calendar.com | userpass19 | Fernando Jiménez |
| 20 | user20@calendar.com | userpass20 | Gabriela Hernández |

---

## 📊 Estadísticas

| Métrica | Valor |
|---------|-------|
| Total Usuarios | 21 |
| Usuario Principal | 1 (test@calendar.com) |
| Usuarios de Simulación | 20 (user1-20) |
| Total Actividades | 55 |
| Actividades por Usuario | 2-3 |
| Base de Datos | PostgreSQL |
| Estado de Usuarios | Todos activos (is_active=true) |

---

## 🔍 Formato de Credenciales

### Usuario Principal
```
Email:    test@calendar.com
Password: testpass123
```

### Usuarios de Simulación
```
Email:    user{número}@calendar.com
Password: userpass{número}

Ejemplos:
- user1@calendar.com  / userpass1
- user5@calendar.com  / userpass5
- user20@calendar.com / userpass20
```

---

## 🧪 Cómo Probar

### Método 1: Login en Frontend (http://localhost:8081)

1. Abre el navegador en http://localhost:8081
2. Selecciona cualquier usuario de la lista
3. Ingresa las credenciales
4. Verás las actividades asociadas al usuario

**Ejemplo:**
```
Email:    user1@calendar.com
Password: userpass1
```

### Método 2: API Docs (http://localhost:8000/docs)

1. Abre http://localhost:8000/docs
2. Ve a `POST /auth/login`
3. Click en "Try it out"
4. Ingresa las credenciales en formato JSON:
   ```json
   {
     "username": "user1@calendar.com",
     "password": "userpass1"
   }
   ```
5. Click en "Execute"
6. Copia el access_token
7. Click en "Authorize" 🔓
8. Ingresa: `Bearer {access_token}`
9. Prueba los endpoints de actividades

### Método 3: cURL desde Terminal

```bash
# Login
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=user1@calendar.com&password=userpass1"

# Respuesta esperada:
# {"access_token":"eyJhbGc...","token_type":"bearer"}

# Usar el token para obtener actividades
TOKEN="tu_token_aqui"
curl -X GET http://localhost:8000/activities \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📝 Tipos de Actividades

Cada usuario tiene entre 2-3 actividades aleatorias de los siguientes tipos:

1. **Reunión de Equipo** - Reunión semanal del equipo (1 hora)
2. **Revisión de Proyecto** - Revisión del progreso (2 horas)
3. **Capacitación Técnica** - Nuevas tecnologías (3 horas)
4. **Presentación de Resultados** - Resultados del mes (1.5 horas)
5. **Planning Session** - Planificación estratégica (2 horas)
6. **Code Review** - Revisión de código (1 hora)
7. **Cliente Meeting** - Reunión con cliente (1.5 horas)
8. **Sprint Retrospective** - Retrospectiva (1 hora)
9. **Desarrollo Backend** - Nuevas funcionalidades (4 horas)
10. **Testing QA** - Pruebas de calidad (2 horas)

Las actividades están programadas aleatoriamente en los próximos 30 días.

---

## 🔄 Re-ejecutar Scripts

### Re-crear Usuario Principal
```bash
cd backend
source venv/bin/activate
python seed_data.py
```

### Re-crear 20 Usuarios de Simulación
```bash
cd backend
source venv/bin/activate
python seed_20_users.py
```

**Nota:** Los scripts detectan si los usuarios ya existen y actualizan sus passwords en lugar de duplicarlos.

---

## 🗄️ Verificar en Base de Datos

### Ver todos los usuarios
```bash
psql postgresql://calendar_user:calendar_pass@localhost:5432/calendar_db \
  -c "SELECT id, email, first_name, last_name, is_active FROM \"user\" ORDER BY id;"
```

### Contar usuarios
```bash
psql postgresql://calendar_user:calendar_pass@localhost:5432/calendar_db \
  -c "SELECT COUNT(*) as total_users FROM \"user\";"
```

### Contar actividades
```bash
psql postgresql://calendar_user:calendar_pass@localhost:5432/calendar_db \
  -c "SELECT COUNT(*) as total_activities FROM activity;"
```

### Ver actividades de un usuario específico
```bash
psql postgresql://calendar_user:calendar_pass@localhost:5432/calendar_db \
  -c "SELECT u.email, COUNT(a.id) as num_activities
      FROM \"user\" u
      LEFT JOIN activity a ON u.id = a.user_id
      GROUP BY u.email
      ORDER BY u.id;"
```

---

## 🎯 Casos de Uso

### Testing de Login
```
Prueba con diferentes usuarios para verificar autenticación:
- user1@calendar.com  / userpass1
- user5@calendar.com  / userpass5
- user10@calendar.com / userpass10
```

### Testing de Actividades
```
Cada usuario tiene diferentes actividades para probar:
- Visualización de actividades del día
- Creación de nuevas actividades
- Edición de actividades existentes
- Validación de duplicados
```

### Testing de Permisos
```
Verificar que cada usuario solo ve sus propias actividades:
1. Login como user1@calendar.com
2. Ver actividades (debería ver solo las de user1)
3. Logout
4. Login como user2@calendar.com
5. Ver actividades (debería ver solo las de user2)
```

### Testing de Performance
```
Con 21 usuarios y 55 actividades, probar:
- Velocidad de login
- Tiempo de carga de actividades
- Filtros por fecha
- Búsquedas
```

---

## 🛠️ Scripts Disponibles

| Script | Ubicación | Descripción |
|--------|-----------|-------------|
| `seed_data.py` | backend/ | Crea usuario principal + 5 actividades |
| `seed_20_users.py` | backend/ | Crea 20 usuarios + 40-60 actividades |
| `start_server.sh` | backend/ | Inicia el servidor FastAPI |
| `start_mobile.sh` | mobile/ | Inicia el frontend Expo |

---

## 📋 Checklist de Verificación

Verificar que todo funciona correctamente:

- [x] PostgreSQL está corriendo en puerto 5432
- [x] Backend está corriendo en http://localhost:8000
- [x] Frontend está corriendo en http://localhost:8081
- [x] 21 usuarios creados en base de datos
- [x] 55 actividades creadas en base de datos
- [x] Login funciona con cualquier usuario
- [x] Cada usuario ve solo sus actividades
- [x] Se pueden crear nuevas actividades
- [x] Validación de duplicados funciona
- [x] Auto-refresh en HomeScreen funciona

---

## 🔒 Seguridad

**Nota Importante:** Estos usuarios son solo para **pruebas y desarrollo**.

Las contraseñas están hasheadas en la base de datos usando **pbkdf2_sha256**, pero son simples para facilitar el testing.

En producción:
- ❌ NO usar contraseñas simples como "userpass1"
- ✅ Requerir contraseñas fuertes (8+ caracteres, mayúsculas, números, símbolos)
- ✅ Implementar rate limiting
- ✅ Implementar 2FA (autenticación de dos factores)
- ✅ Usar tokens JWT con expiración corta
- ✅ Implementar refresh tokens

---

## 📞 Soporte

Si tienes problemas con los usuarios de prueba:

1. **Verificar PostgreSQL está activo:**
   ```bash
   pg_isready -h localhost -p 5432
   ```

2. **Verificar backend está activo:**
   ```bash
   curl http://localhost:8000/
   ```

3. **Re-ejecutar scripts de seed:**
   ```bash
   cd backend
   source venv/bin/activate
   python seed_20_users.py
   ```

4. **Verificar usuarios en base de datos:**
   ```bash
   psql postgresql://calendar_user:calendar_pass@localhost:5432/calendar_db \
     -c "SELECT COUNT(*) FROM \"user\";"
   ```

---

## 📚 Archivos Relacionados

- `backend/seed_data.py` - Script para crear usuario principal
- `backend/seed_20_users.py` - Script para crear 20 usuarios
- `backend/SEED_DATA_README.md` - Documentación del seed principal
- `backend/SERVER_INFO.md` - Información del servidor
- `mobile/LOGIN_FIX.md` - Documentación del fix de login

---

**Última actualización:** 2025-09-29
**Estado:** ✅ 21 USUARIOS CREADOS Y VERIFICADOS EN BASE DE DATOS
**Total Actividades:** 55
**Backend:** http://localhost:8000
**Frontend:** http://localhost:8081