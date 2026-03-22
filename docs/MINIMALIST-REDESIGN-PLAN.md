# HomeScreen Minimalist Redesign Plan — Cal AI Layout Style

> Objetivo: Transformar HomeScreen de un dashboard con muchas cards/secciones a una experiencia minimalista,
> elegante y enfocada. Inspiracion de LAYOUT: Cal AI (anillo semi-circular, fotos de comida, menos cards).
>
> **REGLA CRITICA: La paleta de colores NO cambia.** Se mantiene intacta la paleta actual de Fitsi IA:
> - accent/primary: `#4285F4` (azul)
> - success: `#34A853` (verde)
> - protein: `#EA4335` (rojo)
> - carbs: `#FBBC04` (amarillo)
> - fats: `#4285F4` (azul)
> - bg light: `#FFFFFF`, bg dark: `#0D0D1A`
> - surface light: `#F5F5F5`, surface dark: `#1A1A2E`
>
> Solo cambia el LAYOUT y la ESTRUCTURA. Menos cards, menos secciones, menos ruido visual — mismos colores.

---

## Estado Actual — Inventario de Componentes

La HomeScreen actual tiene **18 secciones/componentes visibles**, lo cual genera scroll excesivo
y fatiga visual. A continuacion el inventario completo en orden de renderizado:

| # | Componente/Seccion | Lineas aprox | Problema |
|---|-------------------|-------------|----------|
| 1 | Header (Fitsi + saludo + streak + notif + scan) | 634-679 | Fitsi mascota ocupa espacio innecesario |
| 2 | WellnessScore card | 726-732 | Card grande, redundante con el anillo de calorias |
| 3 | HealthAlerts | 734-735 | OK pero puede ser mas compacto |
| 4 | TrialBanner | 738-745 | OK, necesario para conversion |
| 5 | HealthKitCard | 748-753 | Card separada innecesaria |
| 6 | FastingTimer | 757 | Card collapsible, ocupa espacio |
| 7 | SleepTracker | 760 | Card collapsible, ocupa espacio |
| 8 | MoodTracker | 763 | Card collapsible, ocupa espacio |
| 9 | Calorie Ring + Macro Bars (card) | 766+ | Anillo pequeno, barras verticales ocupan mucho |
| 10 | NutriScore | ~800 | Redundante con WellnessScore |
| 11 | ExerciseBalanceCard | ~805 | Card separada |
| 12 | AdaptiveCalorieBanner | ~810 | OK pero raro en posicion |
| 13 | Today's Tip | 825-834 | Card con Fitsi, texto largo |
| 14 | Best Day Banner | ~835 | Recien agregado, sutil, OK |
| 15 | DailyChallenges | 837-843 | Card separada |
| 16 | Quick Actions (5 botones) | 858-915 | Demasiados botones, redundantes con FAB |
| 17 | OnboardingProgress | 918-927 | Solo para nuevos usuarios |
| 18 | Today's Meals (por tipo) | 930-957 | Cards Desayuno/Almuerzo/Cena separadas |
| 19 | Report CTA | 960-973 | Boton suelto |
| 20 | Coach FAB | 982-995 | Flotante, OK pero cambiar a multi-accion |

**Diagnostico**: Demasiada informacion visible simultaneamente. El usuario debe hacer scroll
a traves de 6-8 cards antes de ver sus comidas del dia.

---

## Diseno Objetivo — Cal AI Minimalist

### Jerarquia Visual (de arriba a abajo, pantalla completa sin scroll excesivo)

```
+---------------------------------------------------+
|  Header: [<] Today / Yesterday  [bell] [avatar]   |
+---------------------------------------------------+
|                                                     |
|          Semi-circular Calorie Arc                  |
|              1,240 / 2,100                          |
|              860 remaining                          |
|                                                     |
|    [Protein 82g] [Carbs 130g] [Fat 38g] [Water 6]  |
|                                                     |
+---------------------------------------------------+
|  Recently Uploaded                          See all |
|  [img1] [img2] [img3] [img4]  (horizontal scroll)  |
+---------------------------------------------------+
|  Best Day: Viernes — 125g proteinas          [>]    |
+---------------------------------------------------+
|                                                     |
|                          (+) FAB multi-action       |
+---------------------------------------------------+
```

### Principios de diseno
- **Fondo oscuro** por defecto (dark mode first, como Cal AI)
- **Sin bordes** en cards — usar sombras sutiles y separacion por espacio
- **Tipografia grande** para los numeros principales (32-40px)
- **Un solo color de acento** para destacar progreso
- **Fotos de comida** como elemento visual principal (no listas de texto)

---

## Plan de Cambios Detallado

### 1. ELIMINAR — Componentes que salen de HomeScreen

| Componente | Razon | Destino |
|-----------|-------|---------|
| `WellnessScore` | Redundante con el nuevo anillo de calorias | Mover a ProgressScreen |
| `NutriScore` | Redundante | Mover a ProgressScreen |
| `ExerciseBalanceCard` | No es prioridad en home | Mover a ProgressScreen |
| `FastingTimer` | Feature secundaria | Mover a ProfileStack o seccion dedicada |
| `SleepTracker` | Feature secundaria | Mover a ProfileStack o HealthKit section |
| `MoodTracker` | Feature secundaria | Mover a ProgressScreen |
| `OnboardingProgress` | Solo para nuevos, interrumpe el flow | Mover a ProfileScreen como card |
| `AdaptiveCalorieBanner` | Disruptivo, mejor como notificacion | Convertir a InAppNotification |
| `Quick Actions (5 buttons)` | Reemplazado por FAB multi-accion | Eliminar |
| `Report CTA` | Redundante con Best Day banner | Eliminar |
| `Today's Tip card` | Verboso, con Fitsi | Condensar a una linea debajo de macros |
| `HealthKitCard` | Card separada innecesaria | Integrar steps en macro pills |
| `DailyChallenges` | Card separada | Mover a seccion aparte o ProgressScreen |
| `Coach FAB` | Reemplazado por (+) multi-action FAB | Eliminar como FAB dedicado |
| `FitsiMascot` en header | Siempre visible = pierde impacto | Solo en empty states |

**Resultado**: De ~18 secciones a ~5 secciones en HomeScreen.

### 2. REDISENAR — Componentes que cambian de forma

#### 2a. Calorie Ring -> Semi-circular Arc (estilo Cal AI)

**Antes**: Circulo completo SVG de 160px con texto centrado
**Despues**: Arco semi-circular de ~220px ancho, abierto abajo, con numero grande centrado

```
Componente: CalorieArc (nuevo, reemplaza CalorieRing)
Archivo: mobile/src/components/CalorieArc.tsx

Props:
  consumed: number
  target: number
  size?: number (default 220)

Visual:
  - Arco de 180 grados (semicirculo superior)
  - Track: color neutro sutil
  - Fill: gradiente del color de acento
  - Centro: numero grande (32px bold) + "kcal" pequeno
  - Debajo del arco: "860 remaining" en texto gris
  - Animacion spring al cargar
```

#### 2b. Macro Bars -> Macro Pills horizontales

**Antes**: 3 barras verticales con labels, progress bars, numeros
**Despues**: 4 pills en fila horizontal (Protein, Carbs, Fat, Water)

```
Componente: MacroPills (nuevo, reemplaza MacroBar x3)
Archivo: inline en HomeScreen o mobile/src/components/MacroPills.tsx

Visual por pill:
  [icono-pequeno] [valor]g
  Fondo: color del macro con 10% opacidad
  Borde: color del macro con 20% opacidad
  Texto: color del macro bold

  Protein: rojo  | 82g
  Carbs:   amarillo | 130g
  Fat:     azul  | 38g
  Water:   cyan  | 6/8  (vasos, no ml)
```

#### 2c. Today's Meals -> "Recently Uploaded" con fotos

**Antes**: Secciones Breakfast/Lunch/Dinner/Snack con listas de texto
**Despues**: Scroll horizontal de fotos de comida con overlay de calorias

```
Componente: RecentlyUploaded (nuevo, reemplaza MealSection x4)
Archivo: mobile/src/components/RecentlyUploaded.tsx

Visual:
  - Header: "Recently Uploaded" + "See all" (navega a LogScreen)
  - FlatList horizontal
  - Cada item: imagen 80x80 borderRadius 12
    - Overlay gradient abajo: "320 kcal"
    - Si no hay imagen: emoji + nombre truncado
  - Sin imagen = no mostrar (incentiva usar la camara)
```

#### 2d. Water Tracker -> Inline en Macro Pills

**Antes**: WaterTracker component (card con vasos animados)
**Despues**: Un pill mas en la fila de macros: icono agua + "6/8" vasos

```
No componente separado — integrado en MacroPills
Tap en el pill: abre mini bottom sheet para agregar agua
```

#### 2e. FAB Multi-accion (reemplaza Quick Actions + Coach FAB)

**Antes**: 5 Quick Action buttons + Coach FAB flotante
**Despues**: Un solo FAB (+) abajo derecha que al tocar expande opciones

```
Componente: QuickActionFAB (nuevo)
Archivo: mobile/src/components/QuickActionFAB.tsx

Opciones al expandir (de abajo a arriba):
  [camera] Scan Food
  [create] Manual Log
  [water]  Add Water
  [heart]  Favorites
  [sparkles] AI Coach

Animacion: las opciones suben con spring stagger
Backdrop: overlay semi-transparente que cierra al tocar
```

### 3. MANTENER (sin cambios o minimos)

| Componente | Nota |
|-----------|------|
| Header (simplificado) | Quitar Fitsi, agregar day tabs |
| HealthAlerts | Mantener, solo mostrar si hay alertas criticas |
| TrialBanner | Mantener, es importante para conversion |
| Best Day Banner | Mantener, es sutil y motivacional |
| NotificationCenter | Mantener bottom sheet |

### 4. AGREGAR — Componentes nuevos

#### 4a. Day Tabs ("Today / Yesterday")

```
Ubicacion: reemplaza parte del header actual
Visual: dos tabs pill, seleccionado = fondo solido, no seleccionado = transparente
Funcionalidad: cambia los datos mostrados (calorias, meals, macros)
Al swipe left: va a yesterday. Swipe right: vuelve a today.
```

---

## Orden de Implementacion

### Fase 1 — Estructura base (prioridad alta)
1. Crear `CalorieArc.tsx` (semi-circular SVG animado)
2. Crear `MacroPills.tsx` (4 pills horizontales con water)
3. Crear `RecentlyUploaded.tsx` (fotos horizontales)
4. Crear `QuickActionFAB.tsx` (multi-action FAB)
5. Agregar Day Tabs al header

### Fase 2 — Eliminar y mover
6. Eliminar componentes de HomeScreen (WellnessScore, NutriScore, etc.)
7. Mover componentes eliminados a sus nuevas ubicaciones (ProgressScreen, ProfileScreen)
8. Quitar FitsiMascot del header (mantener solo en empty states)
9. Quitar Quick Actions grid
10. Quitar Coach FAB dedicado

### Fase 3 — Polish
11. Ajustar dark mode para que sea el look default (colores Cal AI)
12. Transiciones y animaciones (spring, stagger)
13. Verificar que ProgressScreen/ProfileScreen reciban los componentes movidos
14. QA visual en iOS y Android

---

## Componentes Afectados por Archivo

### Archivos a CREAR
- `mobile/src/components/CalorieArc.tsx`
- `mobile/src/components/MacroPills.tsx`
- `mobile/src/components/RecentlyUploaded.tsx`
- `mobile/src/components/QuickActionFAB.tsx`

### Archivos a EDITAR FUERTE
- `mobile/src/screens/main/HomeScreen.tsx` — reescritura del render, eliminar ~60% del contenido
- `mobile/src/screens/main/ProgressScreen.tsx` — recibir WellnessScore, NutriScore, ExerciseBalance, MoodTracker
- `mobile/src/screens/main/ProfileScreen.tsx` — recibir OnboardingProgress, FastingTimer, SleepTracker

### Archivos a EDITAR LEVE
- `mobile/src/theme/index.ts` — nuevos tokens para Cal AI dark palette
- `mobile/src/navigation/MainNavigator.tsx` — sin cambios de rutas, solo imports si se mueven componentes

### Archivos que NO se tocan
- Backend (no afecta APIs)
- Servicios (food.service.ts, favorites.service.ts, etc.)
- Onboarding screens
- Other main screens (Log, Scan, Recipes, Coach, etc.)

---

## Referencia Visual — Cal AI Style Tokens

```typescript
// Cal AI inspired dark palette (para fase 3)
const calAIDark = {
  bg:         '#0A0A0F',   // casi negro
  surface:    '#14141F',   // cards
  surfaceAlt: '#1E1E2E',   // elevado
  text:       '#FFFFFF',   // primario
  textMuted:  '#6B6B80',   // secundario
  accent:     '#7C5CFC',   // morado (o mantener #4285F4 azul Fitsi)
  accentGlow: '#7C5CFC20', // glow sutil
  success:    '#34D399',   // verde
  warning:    '#FBBF24',   // amarillo
  danger:     '#F87171',   // rojo
  ring:       '#7C5CFC',   // arco de progreso
  ringTrack:  '#1E1E2E',   // fondo del arco
};
```

---

*Creado: 2026-03-22*
*Autor: Ironside AOS — Equipo Producto/Frontend*
