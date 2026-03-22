# Customer Support Strategy — Fitsi IA

> Documento interno de Ironside SpA. Define canales, workflows, SLAs y herramientas de soporte al cliente.

---

## 1. Canales de Soporte

| Canal | Disponibilidad | Prioridad | Herramienta |
|-------|---------------|-----------|-------------|
| **In-app Help Center** | 24/7 (self-service) | Alta | Custom (HelpScreen.tsx) |
| **In-app Chat** | Lun-Vie 9-18h CLT | Alta | Intercom / Crisp |
| **Email** | soporte@fitsi.app | Media | Intercom / Zendesk |
| **FAQ Web** | 24/7 | Alta | help.fitsi.app (Notion/GitBook) |
| **Instagram DM** | Lun-Vie 9-18h | Baja | Meta Business Suite |
| **App Store Reviews** | Diario (monitoreo) | Media | AppFollow / manual |

### Prioridad de Canales
1. In-app (mayor conversion, menor friccion)
2. Email (documentado, trackeable)
3. Social media (publico, requiere respuesta rapida)

---

## 2. Workflow de Tickets

```
[1] RECEPCION
    Usuario envia mensaje (chat/email/form)
    → Auto-assign ticket ID
    → Auto-tag por keywords (billing, bug, feature request, account)
    → Auto-respuesta: "Recibimos tu mensaje, respondemos en < 4 horas"
         |
         v
[2] CLASIFICACION (automatica + manual)
    Bot clasifica por:
    - Categoria: billing, technical, account, feedback, bug
    - Urgencia: critica (app crashea), alta (no puede usar feature), media, baja
    - Sentimiento: frustrado, neutral, positivo
         |
         v
[3] ASIGNACION
    L1 (Bot/FAQ): Respuesta automatica si match con FAQ (40% de tickets)
    L2 (Agente): Si no resuelto, asignar a agente de soporte
    L3 (Dev): Si es bug confirmado o requiere cambio tecnico
         |
         v
[4] RESOLUCION
    Agente responde, usuario confirma
    → Marcar como resuelto
    → Enviar encuesta CSAT (1-5 estrellas)
    → Archivar con tags para analytics
```

---

## 3. SLAs (Service Level Agreements)

| Metrica | Objetivo | Escalacion |
|---------|----------|------------|
| **Primera respuesta** | < 4 horas (horario laboral) | Alert a manager si > 4h |
| **Resolucion** | < 24 horas | Escalar a L2 si > 12h |
| **Bugs criticos** | < 2 horas respuesta, < 8h fix | Page a dev on-call |
| **Billing issues** | < 4 horas, refund en < 48h | Escalar a finanzas si > 24h |
| **Account deletion** | Confirmacion < 24h, ejecucion < 30 dias | Automatico |

### Horario de Cobertura
- **L1 (Bot)**: 24/7
- **L2 (Agente)**: Lun-Vie 9:00-18:00 CLT
- **L3 (Dev)**: On-call Lun-Vie 9:00-18:00, emergencias 24/7

---

## 4. Templates de Respuesta

### "No puedo escanear comida"
```
Hola [nombre]! Lamento que tengas problemas con el escaneo.

Probemos estos pasos:
1. Verifica que la app tenga permiso de camara (Settings del telefono > Fitsi > Camara)
2. Asegurate de tener conexion a internet estable (el scan usa IA en la nube)
3. Actualiza la app a la ultima version desde la App Store / Play Store
4. Si usas Android, intenta limpiar la cache de la app

Si el problema persiste despues de estos pasos, envianos una captura de pantalla
del error y te ayudamos enseguida.

Saludos, Equipo Fitsi
```

### "Me cobraron sin autorizar"
```
Hola [nombre], entiendo tu preocupacion y vamos a resolverlo.

Para verificar tu suscripcion:
1. Revisa en Settings > Suscripcion el estado actual de tu plan
2. Si tienes iOS: Settings del telefono > tu Apple ID > Suscripciones
3. Si tienes Android: Play Store > Pagos y suscripciones

Si confirmas que no autorizaste el cobro:
- iOS: Puedes solicitar reembolso en reportaproblem.apple.com
- Android: Puedes solicitar reembolso en play.google.com/store/account

Tambien podemos gestionar la cancelacion desde nuestro lado. Envianos tu email
de registro y lo revisamos en menos de 24 horas.

Saludos, Equipo Fitsi
```

### "Quiero eliminar mi cuenta"
```
Hola [nombre], lamentamos que quieras irte.

Para eliminar tu cuenta:
1. Abre Fitsi > Perfil > Settings > Cuenta
2. Toca "Eliminar mi cuenta"
3. Confirma con tu contrasena

Esto eliminara permanentemente:
- Tu perfil y datos personales
- Historial de comidas y escaneos
- Fotos de alimentos

La eliminacion se ejecuta en un plazo de 30 dias, como indica nuestra
politica de privacidad (cumplimiento GDPR).

Si hay algo que podamos mejorar, nos encantaria escucharte antes de que te vayas.

Saludos, Equipo Fitsi
```

### "Los macros estan mal"
```
Hola [nombre]! Gracias por reportarlo.

Nuestra IA tiene ~90% de precision en el calculo de macros, pero puede variar
dependiendo de:
- El angulo y luz de la foto
- Porciones que no se ven completamente
- Preparaciones con ingredientes ocultos (salsas, aceites)

Puedes corregir facilmente los valores:
1. Ve a tu Registro > Toca la comida
2. Edita los campos de calorias, proteina, carbohidratos y grasas
3. Guarda los cambios

Cada correccion ayuda a mejorar nuestra IA para futuras detecciones.

Saludos, Equipo Fitsi
```

### "La app no funciona / crashea"
```
Hola [nombre]! Lamento los inconvenientes.

Intenta estos pasos:
1. Cierra completamente la app y vuelvela a abrir
2. Verifica que tienes la ultima version instalada
3. Reinicia tu telefono
4. Si sigue fallando, desinstala y reinstala la app (tus datos se mantienen en tu cuenta)

Si el problema continua, envianos:
- Modelo de tu telefono
- Version del sistema operativo
- Captura de pantalla del error (si hay)

Nuestro equipo tecnico lo revisara en menos de 24 horas.

Saludos, Equipo Fitsi
```

---

## 5. Escalation Matrix

```
NIVEL 1 — Bot / FAQ / Self-Service
  Resuelve: Preguntas frecuentes, como usar features, informacion general
  Herramienta: In-app FAQ, Help Center web, auto-respuestas
  Tiempo: Inmediato
  Resolucion esperada: 40% de tickets
      |
      v (si no resuelto)
NIVEL 2 — Agente de Soporte Humano
  Resuelve: Problemas de cuenta, billing, bugs conocidos, quejas
  Herramienta: Intercom/Zendesk, acceso a dashboard admin
  Tiempo: < 4h primera respuesta
  Resolucion esperada: 50% de tickets
  Equipo: 1-2 agentes (crece con usuarios)
      |
      v (si requiere cambio tecnico)
NIVEL 3 — Equipo de Desarrollo
  Resuelve: Bugs nuevos, errores de backend, problemas de AI, data corruption
  Herramienta: GitHub Issues, Sentry, logs del servidor
  Tiempo: < 2h para criticos, < 24h para no-criticos
  Resolucion esperada: 10% de tickets
  Equipo: Dev on-call (rotacion semanal)
```

---

## 6. Herramientas Recomendadas

### Opcion A: Intercom (Recomendada para MVP)
- **Pros**: Chat in-app nativo, bot de FAQ, segmentacion, product tours
- **Contras**: Precio sube con usuarios ($74/mes base)
- **Ideal para**: Startups con < 10K usuarios, quieren chat + marketing

### Opcion B: Crisp
- **Pros**: Mas barato ($25/mes), chat in-app, chatbot basico
- **Contras**: Menos integraciones, UI menos pulida
- **Ideal para**: MVP con presupuesto limitado

### Opcion C: Zendesk
- **Pros**: Enterprise-grade, multi-canal, reportes avanzados
- **Contras**: Caro ($55/agente/mes), overkill para early stage
- **Ideal para**: Cuando tengamos > 50K usuarios y equipo de soporte > 3

### Recomendacion
**Fase 1 (0-10K usuarios)**: Crisp (costo bajo, chat in-app basico)
**Fase 2 (10K-50K)**: Intercom (mejor experiencia, bots, product tours)
**Fase 3 (50K+)**: Zendesk + Intercom (multi-canal, equipo grande)

---

## 7. Metricas de Soporte

| Metrica | Definicion | Objetivo |
|---------|-----------|----------|
| **CSAT** | Satisfaccion post-ticket (1-5) | > 4.2/5 |
| **NPS** | Net Promoter Score trimestral | > 50 |
| **FRT** | First Response Time | < 4 horas |
| **Resolution Time** | Tiempo promedio de resolucion | < 24 horas |
| **FCR** | First Contact Resolution (%) | > 60% |
| **Ticket Volume** | Tickets por semana | Monitorear tendencia |
| **Tickets per 1K users** | Ratio de tickets/usuarios | < 20/semana |
| **Bot Resolution Rate** | % resuelto sin humano | > 40% |
| **Escalation Rate** | % que sube a L3 | < 10% |

### Dashboard de Metricas
- Revisar semanalmente en reunion de equipo
- Alertas si FRT > 6h o CSAT < 3.5
- Reporte mensual a gerencia

---

*Documento creado: 2026-03-22*
*Responsable: Ironside Jefe de Post-Venta + Head de Producto*
