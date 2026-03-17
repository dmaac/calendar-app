# Seed Data Documentation

## Descripción General

Este documento describe los datos de prueba (seed data) generados por el script `seed_data.py` para la aplicación Calendar.

## 🌐 Información del Servidor

| Parámetro  | Valor                             |
|------------|-----------------------------------|
| Host       | localhost                         |
| Port       | 8000                              |
| API URL    | http://localhost:8000             |
| API Docs   | http://localhost:8000/docs        |
| API Redoc  | http://localhost:8000/redoc       |

## Usuario de Prueba

El script crea un usuario de prueba con las siguientes credenciales:

### Credenciales de Acceso

```
Email:      test@calendar.com
Password:   testpass123
```

### Parámetros Completos del Usuario

| Parámetro     | Valor              | Descripción                                    |
|---------------|-------------------|------------------------------------------------|
| `email`       | test@calendar.com | Correo electrónico único del usuario           |
| `first_name`  | Test              | Nombre del usuario                              |
| `last_name`   | User              | Apellido del usuario                            |
| `password`    | testpass123       | Contraseña (se almacena hasheada con pbkdf2)  |
| `is_active`   | True              | Estado de activación del usuario               |
| `id`          | 1                 | ID único generado automáticamente              |
| `created_at`  | Auto              | Fecha y hora de creación (UTC)                 |
| `updated_at`  | Auto              | Fecha y hora de última actualización (UTC)     |

## Actividades de Ejemplo

El script crea 5 actividades de ejemplo programadas para el próximo mes:

### Lista de Actividades

1. **Reunión de Planificación de Proyecto**
   - Duración: 1.5 horas
   - Descripción: Reunión semanal del equipo para revisar el progreso del proyecto
   - Estado: SCHEDULED

2. **Presentación de Resultados Trimestrales**
   - Duración: 2 horas
   - Descripción: Presentación de los resultados del trimestre al equipo directivo
   - Estado: SCHEDULED

3. **Capacitación en Nuevas Herramientas**
   - Duración: 2 horas
   - Descripción: Sesión de capacitación sobre las nuevas herramientas de desarrollo
   - Estado: SCHEDULED

4. **Revisión de Código y Calidad**
   - Duración: 2 horas
   - Descripción: Sesión dedicada a revisar el código desarrollado
   - Estado: SCHEDULED

5. **Demo del Producto para Clientes**
   - Duración: 1.5 horas
   - Descripción: Demostración del producto actualizado para clientes potenciales
   - Estado: SCHEDULED

## Cómo Ejecutar el Script

### Requisitos Previos

1. Tener el entorno virtual activado
2. Base de datos PostgreSQL configurada y en ejecución
3. Variables de entorno configuradas correctamente (`.env`)

### Comando de Ejecución

```bash
# Desde el directorio backend/
source venv/bin/activate
python seed_data.py
```

### Comportamiento del Script

- **Si el usuario NO existe**: Crea un nuevo usuario con las credenciales especificadas
- **Si el usuario YA existe**: Actualiza la contraseña para asegurar que sea `testpass123`
- **Actividades**: Solo crea actividades que no existan previamente (verifica por título)

## Seguridad

⚠️ **IMPORTANTE**: Este usuario es SOLO para propósitos de desarrollo y pruebas.

- NO usar en producción
- La contraseña está documentada públicamente
- El usuario debe ser eliminado antes de deployar a producción

## Verificación

Después de ejecutar el script, puedes verificar:

1. **Login en la aplicación** con:
   - Email: `test@calendar.com`
   - Password: `testpass123`

2. **Ver las actividades** en el calendario del próximo mes

3. **Verificar en la base de datos**:
   ```sql
   SELECT * FROM "user" WHERE email = 'test@calendar.com';
   SELECT * FROM activity WHERE user_id = 1;
   ```

## Solución de Problemas

### No puedo iniciar sesión

Ejecuta nuevamente el script `seed_data.py`. El script actualizará automáticamente la contraseña.

### Las actividades no aparecen

Verifica que las actividades estén programadas para el próximo mes calendario y que el rango de fechas en tu consulta sea correcto.

### Error de conexión a la base de datos

Verifica:
1. PostgreSQL está en ejecución
2. Las credenciales en `.env` son correctas
3. La base de datos especificada existe