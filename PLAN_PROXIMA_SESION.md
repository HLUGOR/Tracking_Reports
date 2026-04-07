# 📋 PLAN DE TRABAJO - PRÓXIMA SESIÓN
**Fecha:** 3 de abril de 2026  
**Proyecto:** TrackingReports Standalone

---

## RESUMEN EJECUTIVO

Hay **3 áreas de trabajo** para la próxima sesión:

| # | Área | Complejidad | Prioritad |
|---|------|-------------|-----------|
| 1 | Pantalla de Login | Baja | Opcional |
| 2 | Probar Column Mapping | Baja | Alta (debe hacerse primero) |
| 3 | Motor de Reportes completo | **Alta** | Crítica |

> ⚠️ El punto 3 es el más importante: el motor actual **no genera los mismos resultados** que el Tracking_Project. Hay una brecha significativa que documentamos abajo.

---

## 1. PROPUESTA: PANTALLA DE LOGIN

### ¿Para qué sirve en esta app?

Esta app es standalone (no tiene servidor), así que el login **no puede verificarse contra una base de datos real**. El propósito es:
- Restringir el acceso visual a la app (primer filtro)
- Identificar quién está usando la app (guardar nombre de usuario en sesión)
- Personalizar los reportes con el nombre del usuario activo

### Diseño propuesto

```
┌─────────────────────────────────────┐
│          📊 TrackingReports          │
│         Panel de Métricas           │
│                                     │
│   Usuario: [________________]       │
│   Contraseña: [______________]      │
│                                     │
│         [ Ingresar ]                │
│                                     │
│   v1.0 | Solo acceso autorizado     │
└─────────────────────────────────────┘
```

### Cómo funcionaría (técnico)

**Opción A: Contraseña fija en código** (más simple)
```javascript
// En .env (NO se sube a GitHub)
REACT_APP_ACCESS_PASSWORD=micontraseña123

// App.jsx
if (password !== process.env.REACT_APP_ACCESS_PASSWORD) {
  alert('Contraseña incorrecta');
}
```
- ✅ Fácil de implementar (1-2 horas)
- ❌ Un solo usuario, todos usan la misma contraseña

**Opción B: Lista de usuarios en JSON** (recomendada)
```javascript
// users.json (NO se sube a GitHub, en .gitignore)
{
  "users": [
    { "username": "admin", "password": "hash...", "role": "admin" },
    { "username": "editor1", "password": "hash...", "role": "viewer" }
  ]
}
```
- ✅ Múltiples usuarios con roles
- ✅ Sin servidor (todo cliente)
- ⚠️ Seguridad media (solo oculta la app)

### Limitación importante

> **No confundir con seguridad real.** Cualquier persona con conocimientos de F12 o DevTools puede ver el código y saltear el login. Si el objetivo es proteger datos sensibles, se necesita un servidor backend con autenticación real.
>
> Para uso interno de equipo en red local o personal, esta solución es suficiente.

### Tiempo estimado: **2-3 horas**

---

## 2. PENDIENTE: PROBAR COLUMN MAPPING

### ¿Qué se construyó?

Se implementó un sistema de mapeo de columnas del Excel → campos del sistema, con:
- Modal que aparece al cargar un Excel por primera vez
- Guarda el mapeo en `localStorage` (no vuelve a preguntar para el mismo archivo)
- Mapea: `editor`, `fecha`, `horas`, `tarea`, `categoría`, `plataforma`, `version`

### ¿Qué falta probar?

```
[ ] Cargar un Excel con columnas en español (fecha, editor, horas...)
[ ] Verificar que el modal aparece y muestra las columnas del archivo
[ ] Completar el mapeo y ver que se guarda
[ ] Cargar el mismo archivo por segunda vez → verificar que NO pide mapeo de nuevo
[ ] Cargar un archivo distinto → verificar que SÍ pide mapeo
[ ] Verificar que los datos mapeados llegan correctamente al reporte
```

### Campo crítico para los reportes

El mapeo de `version` y `platform` es **esencial** para que los reportes por plataforma/versión funcionen. Sin estos campos correctamente mapeados, el motor de reportes no puede calcular métricas por categoría.

---

## 3. BRECHA DEL MOTOR DE REPORTES ⚠️

### ¿Qué tiene el Tracking_Project que NO tiene TrackingReports aún?

El reporte del Tracking_Project (`/api/reports/platform-version`) genera esto:

```
Por cada PLATAFORMA:
  └── Por cada EDITOR:
       └── Por cada CATEGORÍA:
            ├── totalTasks (número de tareas)
            ├── totalMinutes (basado en duración de la LIBRERÍA)
            └── unregistered (versiones sin duración definida)
```

El TrackingReports actual (`EditorReportsEngine.js`) solo genera:

```
Por cada EDITOR:
  ├── totalHours (sumando la columna de horas del Excel)
  ├── taskCount
  └── productivity (fórmula básica - NO es la del Tracking_Project)
```

---

### Diferencias específicas

| Métrica | Tracking_Project | TrackingReports actual | Estado |
|---------|-----------------|----------------------|--------|
| Horas por editor | ✅ De BD con status=approved | ⚠️ Suma directa del Excel | Diferente |
| Filtro por status | ✅ approved / rejected | ❌ No existe | Faltante |
| Horas por plataforma | ✅ De `platform_library` | ❌ No existe | Faltante |
| Horas por categoría | ✅ De `version_categories` | ❌ No existe | Faltante |
| Duración de versión | ✅ De `version_library` (minutos reales) | ❌ Usa horas del Excel | Diferente |
| Versiones sin registrar | ✅ Muestra "unregistered" | ❌ No detecta esto | Faltante |
| Estadísticas diarias | ✅ `dailyStats` por fecha | ❌ No existe | Faltante |
| Tareas aprobadas vs rechazadas | ✅ `approvedTasks / rejectedTasks` | ❌ No existe | Faltante |

---

### La diferencia conceptual más importante

El Tracking_Project calcula la duración de una tarea **desde la librería de versiones** (no desde lo que el editor ingresó):

```
Tarea: { version: "LATAM_S01E01_HD", platform: "LATAM", editor: "Ana" }
           ↓
Version Library: { name: "LATAM_S01E01_HD", category: "serie_60min", duration: 60 }
           ↓
Resultado: Ana tiene 60 minutos reales, NO lo que ella puso en el campo "horas"
```

En el TrackingReports actual, se suman las horas que vienen directamente de la columna del Excel, que **puede ser cualquier número**. Eso genera resultados distintos.

---

### Lo que hay que construir para que coincidan

#### Motor de Reportes v2 — Módulos necesarios:

```
src/core/reportEngine/
├── EditorReportsEngine.js       (✅ existe pero incompleto)
├── PlatformReportsEngine.js     (❌ nuevo - agrupa por plataforma)
├── VersionMatcher.js            (❌ nuevo - cruza versiones con librería)
├── CategoryCalculator.js        (❌ nuevo - asigna duración desde librería)
└── ReportFilters.js             (❌ nuevo - filtros: status, editor, plataforma)
```

#### Flujo correcto de cálculo:

```
Excel rows (mapeados)
      ↓
[1] Filtrar por rango de fechas
      ↓
[2] Filtrar por status (approved / rejected / todos)
      ↓
[3] Para cada fila:
    a) ¿La plataforma existe en librería? → Si no: descartar
    b) ¿La versión existe en version_library? → Si no: unregistered (0 min)
    c) Obtener categoría y duración de la librería
      ↓
[4] Agrupar: Plataforma → Editor → Categoría
      ↓
[5] Calcular totales (minutos, tareas, promedio)
      ↓
[6] Calcular dailyStats (por fecha)
```

---

### CAMPO STATUS en el Excel

El Tracking_Project usa un campo `status` en cada tarea (`approved`, `rejected`, `pending`).  
Los Excel exportados incluyen este campo? Si el Excel de exportación tiene una columna de status, el motor puede filtrar igual que el Tracking_Project.

> **Acción necesaria mañana:** verificar qué columnas tiene el Excel que se exporta del Tracking_Project para asegurar que ColumnMapper las mapea correctamente.

---

## PLAN DE TRABAJO PARA MAÑANA

### Sesión 1 (mañana)

**Objetivo:** Validar que el ColumnMapper funciona con un Excel real

```
[ ] 1. Exportar un Excel desde el Tracking_Project (el que ya usas para los reportes)
[ ] 2. Cargar en TrackingReports
[ ] 3. Completar el mapeo de columnas (campo por campo)
[ ] 4. Verificar que los datos llegan al reporte actual
[ ] 5. Anotar qué columnas tiene ese Excel (para el motor v2)
```

**Objetivo:** Empezar motor de reportes v2

```
[ ] 6. Construir PlatformReportsEngine.js
[ ] 7. Construir VersionMatcher.js (cruza con libraryStore)
[ ] 8. Actualizar EditorReportsEngine para filtrar por status
[ ] 9. Actualizar EditorReportsView para mostrar por plataforma y categoría
```

**Objetivo (si da tiempo):** Login

```
[ ] 10. Crear LoginScreen.jsx con usuarios en JSON
[ ] 11. Integrar en App.jsx
[ ] 12. Probar y deployar
```

---

## COMPARATIVA VISUAL DEL REPORTE ESPERADO

### Tracking_Project genera esto:
```
PLATAFORMA: LATAM
  Editor: Ana García
    Categoría: serie_60min → 12 tareas, 720 minutos
    Categoría: pelicula_120min → 3 tareas, 360 minutos
  Editor: Juan López  
    Categoría: serie_60min → 8 tareas, 480 minutos

PLATAFORMA: AMAZON
  Editor: Ana García
    Categoría: serie_amazon_60min → 5 tareas, 300 minutos
```

### TrackingReports actualmente genera esto:
```
Editor: Ana García → 15.5 horas totales, 23 tareas
Editor: Juan López → 8.0 horas totales, 12 tareas
```

> **Gap:** El resultado actual es útil pero no equivalente. Para que sean idénticos hay que implementar los módulos del punto 3.

---

**Documento:** 2 de abril de 2026 | **Para revisar:** 3 de abril de 2026
