# Changelog – Sesión 9 de Abril de 2026

## Resumen Ejecutivo
Correcciones finales de labels en reportes Excel, normalización de categorías para todas las plataformas, y mejora del sistema de export/import para sincronización completa entre local y GitHub Pages.

### Cambios completados:
- ✅ Labels de categorías estandarizados: `nombre (X min)` en todas las plataformas
- ✅ IBERIA reporte funcionando con lógica independiente (`classifyIberia()`)
- ✅ SONY ONE y AMAZON con categorías configuradas correctamente
- ✅ Suffix "min" agregado a todos los contadores de minutos en UI
- ✅ COMERCIALES mostrando minutos decimales en header
- ✅ Export/import incluye `columnMappings` para sincronización completa
- ✅ GitHub Pages actualizado con todos los cambios

---

## Cambios Detallados

### 1. **buildCategoryLabel()** (PlatformReportsView.jsx)
**Problema:** Labels repetían duración:
- `"SERIE 45min"` → `"SERIE 45min (45 min)"` ❌
- `"pelicula 120 min"` → `"pelicula 120 min (120 min)"` ❌
- `"serie 60"` → `"serie 60"` (sin sufijo porque ya tenía "60") ❌

**Solución:** Regex mejorado que captura patrones con espacios:
```javascript
const cleanName = rawName
  .replace(/\s*\(\d+\s*min\)/gi, '')    // quita "(60 min)"
  .replace(/\s+\d+\s*min\b/gi, '')      // quita " 120 min" o " 45min"
  .replace(/\s+\d+\s*$/, '')             // quita número suelto " 60"
  .trim();
return `${cleanName} (${dur} min)`;
```

**Resultado:**
- `"SERIE 45min"` → `"SERIE (45 min)` ✅
- `"pelicula 120 min"` → `"pelicula (120 min)"` ✅
- `"serie 60"` → `"serie (60 min)"` ✅

---

### 2. **PlatformReportsEngine.js** - Categorías por lógica
**Cambio:** Construir categorías según el tipo de lógica:

**Para `logica_sin_version` (SONY ONE, AMAZON):**
```javascript
// Categorías vienen de DEFAULT_PLATAFORMA_CONFIG
// cfg.categorias = ['serie_45min', 'pelicula_120min']
// cfg.duracion_serie_minutos = 45, duracion_pelicula_minutos = 120
const cfgCats = cfg?.categorias || [];
categoriesResult = cfgCats.map((cat, idx) => {
  const dur = idx === cfgCats.length - 1 ? durPelicula : durSerie;
  const name = String(cat).replace(/_\d+min$/i, '').replace(/_/g, ' ');
  return { category_key: cat, label: name, duration_minutes: dur, color: '#ccc' };
});
```

**Para `logica_de_versiones` (LATAM, OFF AIR, VOD), `iberia_especial`, etc:**
- Categorías del store con validación de duración
- Si `duration = 0`, extrae del nombre: `"serie 60"` → 60 minutos

---

### 3. **Minutos en UI** (PlatformReportsView.jsx)
**Agregado:** Sufijo `" min"` a todos los displays de minutos:

- Header plataforma: `"{count} ítems · {mins} min"` (COMERCIALES muestra duplicales en minutos decimales)
- Header editor: `"{count} ítems · {mins} min"`
- Tabla de categorías: `"{mins} min"` en columna Minutos
- Total de editor: `"{mins} min"`

**COMERCIALES específico:**
```javascript
{plt.logica === 'logica_comerciales'
  ? `${secondsToMinutes(plt.totalSeconds)} min`
  : `${formatMinutes(plt.totalMinutes)} min`}
```
→ Muestra solo minutos decimales (ej: `"68.83 min"`), sin timecode

---

### 4. **Export/Import - columnMappings incluido** (libraryStore.js + LibraryView.jsx)
**Cambio:** El JSON exportado ahora incluye 4 campos completos:
```javascript
exportLibraryData: () => ({
  platforms: get().platforms,
  categories: get().categories,
  versions: get().versions,
  columnMappings: get().columnMappings,
})
```

**Importar también restaura columnMappings:**
```javascript
importLibraryData: (data) => set({
  platforms: data.platforms || [],
  categories: data.categories || [],
  versions: data.versions || [],
  columnMappings: data.columnMappings || [],
})
```

**Mensaje de confirmación mejorado:**
```
¿Importar librería?
• X plataformas
• Y categorías
• Z versiones
• W mapeos de columnas
```

---

## Recuperación de Plataformas (Historial)
Después de un import accidental que perdió SONY ONE y AMAZON, se restauraron manualmente:

1. **SONY ONE** - Agregado a través de consola browser:
   ```js
   { name: 'SONY ONE', logica: 'logica_sin_version',
     categorias: ['serie_45min', 'pelicula_120min'],
     duracion_serie_minutos: 45,
     duracion_pelicula_minutos: 120 }
   ```

2. **AMAZON** - Igual:
   ```js
   { name: 'AMAZON', logica: 'logica_sin_version',
     categorias: ['serie_amazon_60min', 'pelicula_amazon_120min'],
     duracion_serie_minutos: 60,
     duracion_pelicula_minutos: 120 }
   ```

3. **OFF AIR** y **VOD** - Categorías restauradas:
   ```js
   // Ambas con 3 categorías:
   { name: 'serie 30', duration: 30 },
   { name: 'serie 60', duration: 60 },
   { name: 'pelicula', duration: 120 }
   ```

---

## Repositorio & GitHub Pages

### Commits realizados:
1. **Commit 1:** `Fix: labels categorias SONY ONE/IBERIA, sufijo min en UI`
   - buildCategoryLabel() regex improved
   - Min suffix en UI
   - COMERCIALES decimales

2. **Commit 2:** `Fix: export/import incluye columnMappings completo`
   - exportLibraryData() + columnMappings
   - validación mejorada

3. **Commit 3:** `Fix: buildCategoryLabel regex espacios minutos, logica_sin_version categorias completas`
   - Regex final para espacios variables
   - Categorías configurables para logica_sin_version

### GitHub Pages:
- ✅ Publicado en `https://hlugor.github.io/tracking-reports`
- ✅ Todos los builds compilaron exitosamente
- **Nota:** Librería en GitHub Pages está vacía (localStorage local). Necesita:
  1. "Hacer Respaldo" en local
  2. "Restaurar Respaldo" en GitHub Pages con el JSON descargado

---

## Estado Final del Sistema

### Plataformas (7 configuradas):
| Plataforma | Lógica | Categorías | Estado |
|-----------|--------|-----------|--------|
| LATAM | logica_de_versiones | ✅ Configurada | ✅ Activa |
| BRAZIL | (fallback LATAM) | ✅ Configurada | ✅ Activa |
| OFF AIR | logica_de_versiones | ✅ 3 cats (30/60/120) | ✅ Activa |
| VOD | logica_de_versiones | ✅ 3 cats (30/60/120) | ✅ Activa |
| IBERIA | iberia_especial | 🔧 N/A (lógica interna) | ✅ Activa |
| COMERCIALES | logica_comerciales | ✅ Lista | ✅ Activa |
| SONY ONE | logica_sin_version | ✅ serie 45 / pelicula 120 | ✅ Activa |
| AMAZON | logica_sin_version | ✅ serie 60 / pelicula 120 | ✅ Activa |

### Reportes validados:
- ✅ SONY ONE: `serie (45 min)`, `pelicula (120 min)` con ítems y minutos correctos
- ✅ IBERIA: lógica independiente funcionando, labels correctos
- ✅ LATAM/BRAZIL: OK
- ✅ COMERCIALES: minutos decimales mostrados
- ✅ OFF AIR, VOD: categorías configuradas

---

## Próximas acciones recomendadas

1. **Respaldo de librería completa:**
   ```
   Librería → "💾 Hacer Respaldo" 
   → Guardar JSON en lugar seguro
   → Usar en GitHub Pages cuando sea necesario
   ```

2. **Sincronización GitHub Pages:**
   ```
   GitHub Pages → Librería → "♻️ Restaurar Respaldo"
   → Cargar JSON desde local
   → Listo para generar reportes
   ```

3. **Opcional - Limpieza de código:**
   - Remover warnings de ESLint (`newPlatform`, `handleAddCategory` no usados)
   - Revisar si `window.__repairIberia()` sigue siendo necesario

---

**Última actualización:** 9 de abril de 2026, 18:45
**Repositorio:** https://github.com/HLUGOR/tracking-reports
**GitHub Pages:** https://hlugor.github.io/tracking-reports
