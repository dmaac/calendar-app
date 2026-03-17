# Configuración Inicial de la Aplicación Calendar

## Datos Iniciales (Seed Data)

Esta aplicación incluye datos de prueba que facilitan el acceso inicial y las pruebas de funcionalidad.

### Usuario de Prueba

Para acceder a la aplicación, utiliza las siguientes credenciales:

```
Email: test@calendar.com
Contraseña: testpassword123
```

### Actividades de Ejemplo

El script de seed crea 5 actividades de ejemplo programadas para el próximo mes:

1. **Reunión de Planificación de Proyecto**
   - Descripción: Reunión semanal del equipo para revisar el progreso del proyecto y planificar las siguientes tareas
   - Duración: 1.5 horas (9:00 - 10:30)
   - Estado: Programada

2. **Presentación de Resultados Trimestrales**
   - Descripción: Presentación de los resultados del trimestre al equipo directivo
   - Duración: 2 horas (14:00 - 16:00)
   - Estado: Programada

3. **Capacitación en Nuevas Herramientas**
   - Descripción: Sesión de capacitación sobre las nuevas herramientas de desarrollo implementadas
   - Duración: 2 horas (10:00 - 12:00)
   - Estado: Programada

4. **Revisión de Código y Calidad**
   - Descripción: Sesión dedicada a revisar el código desarrollado y asegurar estándares de calidad
   - Duración: 2 horas (15:00 - 17:00)
   - Estado: Programada

5. **Demo del Producto para Clientes**
   - Descripción: Demostración del producto actualizado para clientes potenciales
   - Duración: 1.5 horas (11:00 - 12:30)
   - Estado: Programada

## Configuración de Base de Datos

### PostgreSQL
```
Base de datos: calendar_db
Usuario: calendar_user
Contraseña: calendar_pass
Puerto: 5432
Host: localhost
```

### URL de Conexión
```
DATABASE_URL=postgresql://calendar_user:calendar_pass@localhost:5432/calendar_db
```

## Comandos de Configuración

### 1. Instalar dependencias
```bash
pip install -r requirements.txt
```

### 2. Inicializar base de datos y cargar datos de prueba
```bash
python seed_data.py
```

### 3. Iniciar la aplicación
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Endpoints de la API

### Acceso a la documentación
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Endpoints principales
- **Root**: `GET /` - Verificar estado de la API
- **Autenticación**: `POST /auth/login` - Inicio de sesión
- **Registro**: `POST /auth/register` - Registro de usuario
- **Actividades**: `GET /activities` - Obtener actividades del usuario
- **Crear actividad**: `POST /activities` - Crear nueva actividad

## Flujo de Prueba Recomendado

1. **Verificar que la API esté funcionando**:
   ```bash
   curl http://localhost:8000/
   ```

2. **Iniciar sesión con el usuario de prueba**:
   ```bash
   curl -X POST "http://localhost:8000/auth/login" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=test@calendar.com&password=testpassword123"
   ```

3. **Obtener actividades** (usando el token recibido):
   ```bash
   curl -X GET "http://localhost:8000/activities" \
        -H "Authorization: Bearer {tu_token_aqui}"
   ```

## Estados de Actividades

La aplicación maneja los siguientes estados para las actividades:

- `SCHEDULED`: Actividad programada
- `COMPLETED`: Actividad completada
- `CANCELLED`: Actividad cancelada

## Notas Importantes

- Las actividades de ejemplo se crean para el próximo mes a partir de la fecha actual
- El script de seed verifica si los datos ya existen antes de crearlos, evitando duplicados
- El usuario de prueba se crea automáticamente si no existe
- Las fechas de las actividades se calculan dinámicamente para mantener relevancia

## Configuración para Dispositivos Móviles (Expo Go)

### Acceso desde dispositivos físicos
Para que la aplicación móvil pueda conectarse al backend desde un dispositivo físico usando Expo Go:

1. **IP de red local**: `192.168.1.8` (ya configurada)
2. **Backend debe ejecutarse con**: `--host 0.0.0.0` (ya configurado)
3. **Asegúrate de que ambos dispositivos estén en la misma red WiFi**

### URLs de acceso
- **Desde computadora**: http://localhost:8000
- **Desde dispositivos móviles**: http://192.168.1.8:8000
- **Documentación API**: http://192.168.1.8:8000/docs

## Configuración para Web

Para ejecutar la aplicación web:
```bash
cd ../mobile
npm run web
```

La aplicación web estará disponible en: http://localhost:19006

## Troubleshooting

### Error de conexión desde móvil
Si la app móvil no puede conectarse al backend:
1. Verifica que ambos dispositivos estén en la misma red WiFi
2. Confirma que el backend esté ejecutándose con `--host 0.0.0.0`
3. Verifica la IP en el archivo `/mobile/src/services/api.ts` (debe ser `192.168.1.8`)
4. Prueba la conectividad desde tu teléfono navegando a: http://192.168.1.8:8000

### Error de conexión a base de datos
Si encuentras errores de conexión, verifica que:
1. PostgreSQL esté ejecutándose
2. La base de datos `calendar_db` existe
3. El usuario `calendar_user` tiene los permisos necesarios
4. La configuración en `.env` sea correcta

### Error de permisos
Si hay errores de permisos al crear tablas:
```bash
psql postgres -c "ALTER USER calendar_user WITH SUPERUSER;"
```