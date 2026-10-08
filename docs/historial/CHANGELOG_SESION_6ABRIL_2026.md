# Changelog – Sesión 6 de Abril de 2026

## Resumen Ejecutivo
Se completó la implementación del **reporte de plataformas por versión** con aislamiento correcto de categorías y métricas por plataforma, replicando la arquitectura de Tracking_Project. 

### Métricas finales:
- ✅ Reporte generado desde datos Excel (sin servidor)
- ✅ Categorías aisladas por plataforma (sin interferencia)
- ✅ Métricas correctas: ítems y minutos se cuentan por categoría
- ✅ Exportación Excel con una hoja por plataforma
- ✅ Build exitoso

---

## Cambios Implementados

### 1. **PlatformReportsEngine.js** (Nuevo)
Equivalente client-side de `buildPlatformVersionReport()` de server.cjs.

**Características clave:**
- Clasificación por lógica: `logica_de_versiones`, `logica_sin_version`, `iberia_especial`
- Detección de sub-plataforma (LAT vs BRA) desde nombre de versión
- **Resolución de categoría por DURACIÓN EXACTA** (no por nombre):
  - `30 min` → categoría con `duration=30`
  - `60 min` → categoría con `duration=60`
  - `120 min` → categoría con `duration=120`
  - Sin match → aparece como "unregistered"
- **Claves internas únicas**: uso de `category.id` en `byCategory` para evitar colisiones entre categorías con el mismo nombre
- Output: `{ platforms: [ { platform, editors, totalByCategory, categories } ], audit, grandTotal }`

**Función core:**
```javascript
resolveCategoryForPlatform(rawKey, durationMin, effectivePlatform)
// Resuelve: 'unregistered' | nombre_categoria → id_categoria_unica
// Duración exacta es la fuente de verdad (igual que Tracking_Project)
```

### 2. **PlatformReportsView.jsx** (Nuevo)
Vista de reportes con filtros y exportación Excel.

**UI:**
- Filtro por fecha: APPROVED_DATE, AIR_DATE, o sin filtro
- Generador de reporte con período personalizable
- Plataformas expandibles con desglose por editor
- Tabla de categorías por editor con label + duración + ítems + minutos
- Chips de "Totales por categoría" con colores
- Auditoría: plataformas no registradas, versiones sin categoría, filas descartadas
- Botón "⬇ Descargar Excel"

**Excel export:**
- Una hoja por plataforma (columnas: Editor | [categorías] | Minutos | Total)
- Hoja "Resumen" (Plataforma | [todas las categorías] | Minutos | Total)
- Hoja "Auditoría" (detalles de errores/descartados)

### 3. **VersionMatcher.js** (Actualizado)
Motor de clasificación de versiones.

**Métodos:**
- `detectSubPlatform(name)` — LAT → LATAM, BRA → BRAZIL
- `detectDurationFromSuffix(name)` — sufijo 1-4 → 30min, 5-6 → 60min, 9-10 → 120min
- `classify(versionName, versions, categories)` — busca en librería + fallback numérico
- `classifyBySeason(seasonVal, platformConfig)` — para `logica_sin_version`

### 4. **LibraryView.jsx** (Actualizado)
Gestión de categorías con duración como campo numérico libre.

**Cambios:**
- `-` AIR_DATE movido a opcional en mapeo Excel (ColumnMapper)
- Duración de categoría: input type="number" (cualquier valor, no dropdown)
- Tabla de categorías: Nombre | Plataforma | **Duración** | **Versiones** | Color | Acciones
- Auto-asignar versiones: detecta duración del nombre → busca categoría por duración exacta
- Fix: `repairVersionIds() + setVersions()` para evitar ID duplicados al importar masivamente

### 5. **libraryStore.js** (Actualizado)
Zustand store con métodos adicionales.

**Nuevos métodos:**
- `repairVersionIds()` — re-asigna IDs únicos a todas las versiones (evita colisiones)
- `setVersions(versions)` — reemplaza array de versiones de una sola vez (escritura atómica)

**Helper:**
```javascript
let _idCounter = 0;
const uniqueId = () => Date.now() * 1000 + (++_idCounter % 1000);
// Evita colisiones al importar en lote
```

### 6. **Layout / Ruteo** (App.jsx)
Agregadas nuevas vistas en la navegación:
- "Reportes Plataformas" → `PlatformReportsView`
- "Reportes Editores" → `EditorReportsView`

---

## Validaciones y Correcciones

### Bug 1 — Duración "no cuadra"
**Problema**: versiones de 60 min caían bajo "serie (30 min)" porque se usaba el nombre como clave.
**Fix**: usar `category.id` como clave única + resolver por DURACIÓN EXACTA siempre.
**Resultado**: 13 items × 30 min = 390 (antes: 690 incorrecto).

### Bug 2 — Chips duplicadas
**Problema**: si una plataforma tenía dos categorías con el mismo nombre, aparecían dos chips.
**Fix**: `new Set()` en `orderedKeys` para deduplicar, + uso de ID único como key.

### Bug 3 — Hook violation
**Problema**: `excelStore(state => state.setX)` se llamaba dentro de callbacks en ExcelUpload.
**Fix**: extraer `setExcelRows`, `setHeaders`, etc. al nivel del componente.

### Bug 4 — ID duplicados en import massivo
**Problema**: `Date.now()` genera IDs iguales si se importan muchos ítems rápido → `updateVersion(id)` solo actualiza el último con ese ID.
**Fix**: `uniqueId() = Date.now() * 1000 + (++counter % 1000)` garantiza unicidad.

---

## Archivos Modificados

| Archivo | Tipo | Cambios |
|---------|------|---------|
| `src/components/reports/PlatformReportsView.jsx` | 🆕 Nuevo | Reporte con filtros, expandibles, export Excel |
| `src/core/reportEngine/PlatformReportsEngine.js` | 🆕 Nuevo | Motor de reporte (clasificación + agregación) |
| `src/core/reportEngine/VersionMatcher.js` | 🆕 Nuevo | Clasificador de versiones (librería + fallback) |
| `src/components/dataImport/LibraryView.jsx` | ✏️ Actualizado | Duración numérica, auto-asignar, reparar IDs |
| `src/store/libraryStore.js` | ✏️ Actualizado | `uniqueId()`, `repairVersionIds()`, `setVersions()` |
| `src/components/dataImport/ColumnMapper.jsx` | ✏️ Actualizado | AIR_DATE opcional |
| `src/components/dataImport/ExcelUpload.jsx` | ✏️ Actualizado | Hook fix (extraer setters) |
| `src/App.jsx` | ✏️ Actualizado | Nuevas rutas reportes |
| `src/components/reports/PlatformReportsView.css` | 🆕 Nuevo | Estilos para reporte |
| `package.json` | ✏️ Actualizado | Dependencias (si aplica) |

---

## Testing & Validación

✅ **Build**: exitoso sin errores  
✅ **Reporte**: genera correctamente desde datos Excel  
✅ **Métricas**: 16 items Luis, 13 serie (390 min), 3 película (360 min) = totales correctos  
✅ **Aislamiento**: cada plataforma solo muestra sus categorías  
✅ **Excel**: exporta con formato correcto (plataformas, resumen, auditoría)  

---

## Próximos Pasos Sugeridos

1. **Reporte Editores**: implementar vista similar para agregados por editor (no por plataforma)
2. **Gráficos**: agregar visualización (barras, pie charts) en reportes
3. **Filtros avanzados**: por editor, categoría, duración
4. **Caché**: almacenar reportes generados para re-uso sin re-calcular
5. **Deploy**: servir app en servidor Node o cloud (Azure/Vercel)

---

# Changelog – Sesión 8 de Abril de 2026

## Resumen Ejecutivo
Se implementó la lógica nueva `logica_comerciales` para la plataforma **COMERCIALES**, se corrigieron bugs en la exportación Excel (cabeceras con IDs numéricos, columna `unregistered` en BRAZIL), se agregó Export/Import de librería para sincronización entre dispositivos, y se modernizó el Excel exportado con estilos profesionales usando **ExcelJS**.

---

## Cambios Implementados

### 1. `logica_comerciales` — Nueva lógica de plataforma

**Contexto:**
COMERCIALES es una plataforma cuyo reporte NO se organiza por versión ni categoría. En cambio, cuenta el total de assets entregados por editor y acumula la duración total en timecode.

**Formato de entrada:**
```
PLATFORM | SEASON | CLIP | SHORT | VERSION | EDITOR | DURATION | APPROVED_DATE
```
- `DURATION` en formato `HH:MM:SS` (o `HH:MM:SS:FF` con frames, que se ignoran)
- Cada fila = 1 asset

**Formato de salida (dashboard y Excel):**
```
EDITOR | TIEMPO (HH:MM:SS) | MINUTOS | TOTAL (assets)
```

**Archivos modificados — `PlatformReportsEngine.js`:**
- Agregado `COMERCIALES: { logica: 'logica_comerciales' }` en `DEFAULT_PLATAFORMA_CONFIG`
- Nuevo método estático `parseTimecode(tc)`: convierte `HH:MM:SS` → total de segundos
- Nueva rama `logica_comerciales` en el loop de procesamiento de filas:
  - Lee campo `DURATION` de cada fila
  - Acumula `totalSeconds` por editor
  - Cuenta assets (1 por fila)
  - No usa VERSION, SEASON, ni categorías
- Output por plataforma incluye campo `logica` para identificar el tipo en el frontend

**Archivos modificados — `PlatformReportsView.jsx`:**
- Nueva función `formatTimecode(seconds)` → formato `H:MM:SS`
- Nueva función `secondsToMinutes(seconds)` → minutos decimales con 2 decimales
- El encabezado de plataforma detecta `plt.logica === 'logica_comerciales'` y muestra `TIEMPO` en vez de `Minutos`
- Renderiza tabla especial con clase `pr-comerciales-table` (EDITOR | TIEMPO | MINUTOS | TOTAL) en lugar de la tabla de categorías estándar

**Archivos modificados — `PlatformReportsView.css`:**
- Nueva clase `.pr-comerciales-table`: header azul (`#dbeafe`), celdas centradas, fila de totales oscura (`#1e293b` con texto blanco)

**Archivos modificados — `LibraryView.jsx`:**
- Agregada opción `logica_comerciales` al dropdown de creación de plataformas:
  ```html
  <option value="logica_comerciales">logica_comerciales — cuenta assets y acumula DURATION</option>
  ```

---

### 2. Export/Import de Librería

**Problema:** La librería (plataformas, categorías, versiones) vive en `localStorage`. Al abrir la app en GitHub Pages (origen distinto a `localhost:3000`), la librería estaba vacía y no se podían generar reportes.

**Solución:** Botones de exportación e importación en el header de `LibraryView.jsx`.

**`handleExportLibrary()`:**
- Serializa el estado completo de `libraryStore` (plataformas, categorías, versiones, column mappings) a JSON
- Descarga el archivo como `tracking-library-{fecha}.json`

**`handleImportLibrary(e)`:**
- Lee el JSON importado
- Llama a `importLibraryData()` del store para reemplazar el estado completo
- Confirma al usuario con `window.confirm` antes de sobrescribir

**`LibraryView.css`:**
- `.library-header` cambiado de `flex-column` a `flex-row` con `space-between`
- Nuevos estilos: `.library-header-actions`, `.lib-btn-export`, `.lib-btn-import`

---

### 3. Corrección: Cabeceras numéricas en Excel (LATAM)

**Problema:** Las columnas de categorías en el Excel de LATAM mostraban IDs numéricos como `1775515117540` en vez de nombres como `serie (30 min)`.

**Causa raíz:** `sortedCats` usaba `category_key` (IDs internos basados en timestamp) para construir las cabeceras de columna.

**Fix en `PlatformReportsView.jsx`:**
- Se construye `categoryLabelMap` haciendo `{ [cat.id]: cat.label }` desde `plt.categories`
- Las cabeceras del Excel usan `categoryLabelMap[key] ?? key` para resolver el nombre legible

---

### 4. Corrección: Columna `unregistered` en BRAZIL

**Problema:** BRAZIL mostraba una columna `unregistered` en el Excel. BRAZIL es una sub-plataforma que se detecta automáticamente desde los prefijos de versión (`BRA_*`), pero sus categorías no estaban registradas en la librería — solo las de LATAM.

**Fix en `PlatformReportsEngine.js`:**
- `resolveCategoryForPlatform` ahora acepta un cuarto parámetro `fallbackPlatform`:
  - Si no se encuentra categoría para la plataforma efectiva (BRAZIL), reintenta con `fallbackPlatform` (LATAM)
- Se agrega `subPlatformParent = { 'BRAZIL': 'LATAM', 'LATAM': 'LATAM' }` al construir el output de categorías
- Al procesar el output de cada editor, si la plataforma es BRAZIL, se heredan las categorías de LATAM

---

### 5. Excel Profesional con ExcelJS

**Problema:** El Excel exportado usaba la librería `xlsx` por defecto, sin posibilidad de dar formato visual.

**Solución:** Se reemplazó `xlsx` por **ExcelJS** en `PlatformReportsView.jsx`. La función `handleExportExcel` se reescribió como `async`.

**Paleta de colores:**
```js
const COLOR = {
  headerDark:    '1E293B', // slate-900 — cabecera principal
  headerBlue:    '1D4ED8', // blue-700  — cabeceras de plataformas
  headerGreen:   '15803D', // green-700 — cabeceras de resumen
  totalRow:      '0F172A', // slate-950 — fila de totales
  summaryBg:     'DBEAFE', // blue-100  — hoja resumen
  auditBg:       'FEF9C3', // yellow-100 — hoja auditoría
  altRow:        'F8FAFC', // slate-50  — filas alternas
  white:         'FFFFFF',
  comercialesBg: '1E40AF', // blue-800  — cabecera COMERCIALES
};
```

**Características del Excel generado:**
- Título con celdas fusionadas (merge) por plataforma
- Cabeceras con fondo de color, texto blanco y negrita
- Filas alternas con color suave (`altRow`)
- Fila de totales con fondo oscuro y texto blanco en negrita
- Bordes en todas las celdas
- Hoja "Resumen" con subtotales por plataforma
- Hoja "Auditoría" con secciones coloreadas (plataformas no registradas, versiones sin categoría, filas descartadas)
- Anchos de columna automáticos (`autofit`)

---

## Archivos Modificados (Sesión 8 Abril)

| Archivo | Tipo | Cambios |
|---------|------|---------|
| `src/core/reportEngine/PlatformReportsEngine.js` | ✏️ Actualizado | `logica_comerciales`, `parseTimecode`, fallback BRAZIL→LATAM, campo `logica` en output |
| `src/components/reports/PlatformReportsView.jsx` | ✏️ Actualizado | Tabla COMERCIALES, `formatTimecode`, `secondsToMinutes`, ExcelJS, `categoryLabelMap` |
| `src/components/reports/PlatformReportsView.css` | ✏️ Actualizado | `.pr-comerciales-table` |
| `src/components/dataImport/LibraryView.jsx` | ✏️ Actualizado | Export/Import librería, opción `logica_comerciales` en dropdown |
| `src/styles/LibraryView.css` | ✏️ Actualizado | `.library-header-actions`, estilos botones Export/Import |

---

## Deploy

✅ Build exitoso (`npm run build`) — `458.7 kB`  
✅ Publicado en **GitHub Pages**: `https://hlugor.github.io/tracking-reports`  


---

## Notas Arquitectónicas

### Patrón de Aislamiento por Plataforma
Cada plataforma tiene su **lista de categorías configuradas** (en LibraryView). El reporte:
1. Acumula en `byCategory[category.id]` (ID único, no nombre)
2. Resuelve claves con `resolveCategoryForPlatform()` (duración exacta → ID)
3. Mapea ID → label/color en output.categories

Esto evita:
- Colisiones entre "serie 30" y "serie 60" del mismo nombre
- Interferencia entre plataformas (LATAM no ve categorías de BRAZIL)
- Fallbacks ambiguos (duración exacta es fuente de verdad)

### Flujo de Datos
```
Excel (ColumnMapper) → ExcelStore
                                   ↓
LibraryStore (plataformas, categorías, versiones)
                                   ↓
PlatformReportsEngine.buildReport()
  ├─ VersionMatcher.classify() → duración + nombre
  ├─ resolveCategoryForPlatform() → duración exacta → ID único
  └─ Acumula en byCategory[id]
                                   ↓
PlatformReportsView (render + export Excel)
```

---

*Sesión completada: 6 de abril de 2026, 20:30 UTC*
