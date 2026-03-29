# User Management Strategy — Fitsi IA

> Documento interno de Ironside SpA. Define como gestionamos la data de usuarios, segmentacion, governance y compliance.

---

## 1. Dashboard Admin de Usuarios

### Vista General
El equipo de operaciones y producto necesita un dashboard web para gestionar usuarios en tiempo real.

### Metricas Principales
| Metrica | Descripcion | Frecuencia |
|---------|-------------|------------|
| DAU / WAU / MAU | Usuarios activos diarios, semanales, mensuales | Tiempo real |
| Nuevos registros | Usuarios que completaron onboarding | Diario |
| Conversion free->premium | % que suscribe despues de trial | Diario |
| Churn rate | % que cancela suscripcion por mes | Mensual |
| Retention D1/D7/D30 | % que vuelve 1, 7, 30 dias despues | Cohorte |
| LTV promedio | Revenue promedio por usuario en su lifetime | Mensual |
| Scans por usuario | Promedio de escaneos AI por dia/semana | Diario |

### Funcionalidades del Dashboard
- **Busqueda de usuarios**: por email, nombre, ID, fecha de registro
- **Perfil de usuario**: ver datos de onboarding, historial de comidas, suscripcion, dispositivo
- **Acciones sobre usuario**: extender trial, dar premium gratis, desactivar cuenta, enviar push
- **Exportar**: CSV/Excel de segmentos para analisis externo

---

## 2. Segmentacion de Usuarios

### Por Tipo de Suscripcion
| Segmento | Criterio | Estrategia |
|----------|----------|------------|
| **Free** | Sin suscripcion activa | Nudges al paywall, limite de scans (3/dia) |
| **Trial** | En periodo de prueba (7 dias) | Onboarding emails, mostrar valor premium |
| **Monthly** | Suscripcion mensual activa | Engagement, upsell a anual |
| **Yearly** | Suscripcion anual activa | Retention, referral program |
| **Lifetime** | One-time purchase | VIP support, beta features |
| **Churned** | Cancelo en ultimos 90 dias | Win-back campaigns |

### Por Actividad
| Segmento | Criterio | Accion |
|----------|----------|--------|
| **Power Users** | >5 scans/dia, streak >30 | Ambassadors, beta testers |
| **Activos** | 3-7 dias/semana | Mantener engagement |
| **En riesgo** | 1-2 dias/semana, bajando | Push notifications, tips |
| **Inactivos** | 0 dias en ultimas 2 semanas | Re-engagement email |
| **Dormidos** | 0 dias en ultimo mes | Win-back con descuento |

### Por Objetivo (del onboarding)
- Perder peso (mayoria) -> contenido enfocado en deficit calorico
- Mantener peso -> contenido de balance y habitos
- Ganar peso -> contenido de superavit, proteina, ejercicio

### Por Geografia
- Detectado por: locale del dispositivo, timezone, IP (solo para analytics)
- Relevante para: traducciones, precios regionales, contenido de comidas locales

---

## 3. CRM Integration Plan

### Datos que Exportamos
```
user_id, email, first_name, last_name,
registration_date, onboarding_completed,
subscription_plan, subscription_status, trial_end_date,
goal, diet_type, daily_calories_target,
last_active_date, total_scans, streak_days,
device_os, device_model, app_version,
country, language
```

### Destinos de Integracion
| Sistema | Proposito | Frecuencia | Metodo |
|---------|-----------|------------|--------|
| **Brevo / Mailchimp** | Email marketing, drip campaigns | Diario (batch) | API webhook |
| **Amplitude / Mixpanel** | Product analytics, funnels | Tiempo real | SDK events |
| **RevenueCat** | Subscription management | Tiempo real | SDK integrado |
| **Intercom / Crisp** | Customer support, in-app chat | Tiempo real | SDK + webhook |
| **Google Sheets** | Reportes ad-hoc para gerencia | Semanal | Script cron |
| **Data Warehouse (BigQuery)** | Analisis profundo, ML models | Diario (ETL) | Cloud Function |

### Sync Architecture
```
App (events) -> Backend API -> Event Queue (Redis)
                                    |
                    +---------------+---------------+
                    |               |               |
               Amplitude      CRM Webhook     BigQuery ETL
```

---

## 4. Data Governance

### Roles y Acceso
| Rol | Acceso | Justificacion |
|-----|--------|---------------|
| **Gerente General** | Dashboard completo, exportar | Decision estrategica |
| **Head de Producto** | Dashboard completo, acciones sobre usuarios | Product decisions |
| **Analista de Datos** | Dashboard lectura, exportar anonimizado | Analytics |
| **Soporte al Cliente** | Buscar usuario, ver perfil, logs | Resolver tickets |
| **Marketing** | Segmentos anonimizados, metricas agregadas | Campanas |
| **Desarrollo** | Logs tecnicos, no PII | Debugging |

### Politicas de Retencion
| Dato | Retencion | Justificacion |
|------|-----------|---------------|
| Datos de cuenta (email, nombre) | Mientras cuenta activa + 30 dias post-delete | Operacion del servicio |
| Historial de comidas | 2 anos | Valor para el usuario (tendencias) |
| Imagenes de scan | 90 dias (luego solo hash+cache) | Costo de storage |
| Logs de actividad | 1 ano | Debugging, analytics |
| Datos de pago | Segun regulacion local (7 anos Chile) | Compliance tributario |
| Datos de onboarding | Mientras cuenta activa | Personalizacion |

### Principios
1. **Minimizacion**: Solo recolectar datos necesarios para el servicio
2. **Proposito limitado**: Usar datos solo para lo declarado en Privacy Policy
3. **Seguridad**: Encriptacion en transito (TLS) y en reposo (AES-256)
4. **Transparencia**: El usuario puede ver, exportar y eliminar sus datos en cualquier momento

---

## 5. GDPR / Compliance

### Derecho al Olvido (Art. 17)
**Flujo de eliminacion de cuenta:**
1. Usuario va a Settings > Cuenta > Eliminar mi cuenta
2. Pantalla de confirmacion: "Esto eliminara permanentemente todos tus datos"
3. Requiere re-autenticacion (password o biometrico)
4. Backend: soft-delete inmediato (cuenta desactivada)
5. Cron job a 30 dias: hard-delete de toda PII
6. Datos anonimizados para analytics se mantienen (sin PII)
7. Notificar a terceros (RevenueCat, CRM) via API para purgar datos

**Endpoint:**
```
DELETE /api/account
Headers: Authorization: Bearer <token>
Body: { "confirm": true, "reason": "optional feedback" }
Response: { "status": "scheduled", "deletion_date": "2026-04-21" }
```

### Portabilidad de Datos (Art. 20)
**Flujo de exportacion:**
1. Usuario va a Settings > Cuenta > Exportar mis datos
2. Backend genera ZIP con:
   - `profile.json` — datos personales
   - `food_logs.csv` — historial de comidas
   - `daily_summaries.csv` — resumen diario
   - `images/` — fotos de scans (si aun disponibles)
3. Enviar link de descarga por email (expira en 48h)

**Endpoint:**
```
POST /api/account/export
Response: { "status": "processing", "estimated_minutes": 5 }
// Email con link cuando listo
```

### Consentimiento (Art. 7)
- **Registro**: Checkbox explicito para Privacy Policy y Terms
- **Marketing emails**: Opt-in separado, no pre-marcado
- **Push notifications**: Permiso del OS + toggle en Settings
- **Analytics**: Explicar en onboarding, opcion de opt-out en Settings
- **AI processing**: Explicar que las fotos se procesan con AI para nutrientes
- Todos los consentimientos guardados con timestamp en DB

### Gestion de Consentimiento
```sql
CREATE TABLE user_consents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  consent_type VARCHAR(50), -- 'privacy_policy', 'marketing_email', 'analytics', 'ai_processing'
  granted BOOLEAN NOT NULL,
  granted_at TIMESTAMP,
  revoked_at TIMESTAMP,
  ip_address VARCHAR(45),
  app_version VARCHAR(20)
);
```

---

## 6. Implementacion por Fases

### Fase 1 (MVP — Semana 1-2)
- [ ] Endpoint DELETE /api/account con soft-delete
- [ ] Endpoint POST /api/account/export basico (JSON)
- [ ] Tabla user_consents
- [ ] Toggle de analytics opt-out en Settings

### Fase 2 (Dashboard — Semana 3-4)
- [ ] Dashboard admin web (Next.js) con busqueda de usuarios
- [ ] Metricas basicas: DAU, registros, conversiones
- [ ] Exportar segmentos a CSV

### Fase 3 (CRM — Semana 5-6)
- [ ] Integracion con email marketing (Brevo)
- [ ] Webhook de eventos a Amplitude
- [ ] Drip campaigns automatizados

### Fase 4 (Compliance — Semana 7-8)
- [ ] Hard-delete cron job (30 dias post soft-delete)
- [ ] Export completo con imagenes (ZIP)
- [ ] Audit log de accesos a PII
- [ ] Notificacion a terceros en deletion

---

*Documento creado: 2026-03-22*
*Responsable: Ironside Head de Producto + Analista de Datos*
