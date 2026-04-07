# TrackingReports - Aplicación Standalone

🚀 Aplicación React para procesar reportes, librerías y métricas **sin servidor**.

## ✨ Características

- ✅ **Sin servidor** - 100% funciona en el navegador
- ✅ **Offline first** - Funciona sin Internet
- ✅ **Carga Excel** - Desde la interfaz del navegador
- ✅ **Reportes instantáneos** - Cálculos < 1 segundo
- ✅ **Múltiples exportaciones** - Excel, JSON, CSV, PDF
- ✅ **Gestión de Librerías** - Jerárquica (Lógica → Plataforma → Categoría → Versión)
- ✅ **Privacidad total** - Los datos nunca salen del navegador

## 📦 Stack Tecnológico

- **Frontend:** React 18.3.1
- **Estado:** Zustand
- **Excel I/O:** XLSX + ExcelJS
- **Gráficos:** Chart.js 4.5
- **Persistencia:** IndexedDB + localStorage
- **Fechas:** date-fns

## 🚀 Inicio Rápido

### Instalación

```bash
# Clonar repositorio
git clone https://github.com/tuusuario/tracking-reports.git
cd tracking-reports

# Instalar dependencias
npm install

# Iniciar en desarrollo
npm start
```

La aplicación se abrirá automáticamente en `http://localhost:3000`

### Build para Producción

```bash
npm run build
```

Genera carpeta `/build` lista para desplegar en cualquier servidor estático o CDN.

## 📚 Documentación

Ver carpeta `/docs/`:
- `GUIA_INICIO.md` - Guía paso a paso
- `ARQUITECTURA.md` - Visión técnica
- `API_MODULOS.md` - Dokumentación de módulos
- `TESTING.md` - Estrategia de testing

## 🏗️ Estructura de Carpetas

```
tracking-reports/
├── src/
│   ├── core/              # Lógica sin UI
│   │   ├── excel/         # Parsing y validación
│   │   ├── reportEngine/  # Cálculo de reportes
│   │   ├── dataStorage/   # Persistencia local
│   │   └── utils/         # Funciones ayuda
│   ├── store/             # Estado global (Zustand)
│   ├── components/        # Componentes React
│   ├── styles/            # CSS
│   └── App.jsx
├── public/                # Assets estáticos
├── docs/                  # Documentación
└── package.json
```

## � Funcionalidades Principales

### 1. Gestión de Librerías
- **Plataformas**: LATAM, BRAZIL, AMAZON, SONY ONE, etc.
- **Categorías**: serie (30/45/60 min), película (120 min), etc.
- **Versiones**: importar en lote desde Excel, auto-detectar duración/plataforma
- **Colores**: personalizar por categoría para mejor visualización

### 2. Reporte de Plataformas
- **Filtrado**: por período (APPROVED_DATE, AIR_DATE, o sin filtro)
- **Agregación**: plataforma → editor → categoría → ítems + minutos
- **Aislamiento**: cada plataforma sólo muestra sus categorías
- **Resolución**: duración exacta es fuente de verdad (30 min ≠ 60 min)
- **Export Excel**: 
  - Una hoja por plataforma (Editor | [categorías] | Minutos | Total)
  - Hoja "Resumen" con totales por plataforma
  - Hoja "Auditoría" (versiones sin categoría, plataformas no registradas, etc.)

### 3. Importación Excel Masiva
- Sin cabecera: auto-detecta columna A como nombre de versión
- Duración por sufijo: sufijo 1-4 → 30 min, 5-6 → 60 min, 9-10 → 120 min
- Deduplicación: evita importar versiones existentes
- Auto-reparación: `repairVersionIds()` si hay colisiones por importes rápidos

## 🔄 Flujos Principales

### Cargar Excel → Generar Reporte de Plataformas

```
1. Usuario carga archivo Excel (Editor, VERSION, PLATFORM, SEASON, AIR_DATE, APPROVED_DATE)
2. ColumnMapper → mapea columnas del usuario a esquema estándar
3. ExcelStorage → almacena filas en Cliente
4. Definir Librerías:
   - LibraryView → crear Plataformas, Categorías, Versiones
   - Auto-asignar versiones por duración detectada
5. General Reporte:
   - Seleccionar período + campo de fecha
   - PlatformReportsEngine.buildReport()
     ├─ VersionMatcher.classify() → duración real
     ├─ resolveCategoryForPlatform() → duración exacta → category.id único
     └─ Acumular en byCategory[id]
6. Visualizar reporte con desglose por editor
7. Exportar a Excel
```

## 🔐 Privacidad y Seguridad

✅ **100% privacidad:** Los datos del Excel nunca viajan al servidor  
✅ **Almacenamiento local:** Datos guardados en IndexedDB del navegador  
✅ **Sin dependencias externas:** Cero Http calls a APIs externas  
✅ **Validación:** Todas las entradas validadas en cliente

## 🎯 Estado de Desarrollo

### ✅ FASE 1: MVP (Completado)
- [x] Setup inicial
- [x] ExcelParser + ExcelValidator
- [x] EditorReportsEngine
- [x] UI básica
- [x] Exportación Excel/JSON
- [x] Persistencia local

### ✅ FASE 2: Reportes de Plataforma (Completado)
- [x] Gestión de Librerías (Plataformas → Categorías → Versiones)
- [x] **Reporte de Plataformas** con aislamiento de categorías
- [x] Clasificación por duración exacta (no por nombre)
- [x] Export Excel: una hoja por plataforma + Resumen + Auditoría
- [x] Filtros por fecha (APPROVED_DATE, AIR_DATE, sin filtro)
- [x] Auditoría: plataformas/versiones no registradas, filas descartadas
- [x] Fix: uso de category.id como clave única (evita colisiones)
- [x] Fix: repairVersionIds() para importes masivos sin duplicados

### 📋 FASE 3: Próximas Mejoras
- [ ] Reporte de Editores (agregados por editor)
- [ ] Gráficos: barras, pie charts, tendencias
- [ ] Filtros avanzados por editor/categoría/duración
- [ ] Caché de reportes generados
- [ ] Dashboard con KPIs principales
- [ ] Deploy en servidor Node o Azure

## 🧪 Testing

```bash
# Correr tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm test -- --coverage
```

## 📞 Soporte y Feedback

Para reportar bugs o sugerir features, abre un [GitHub Issue](https://github.com/tuusuario/tracking-reports/issues)

## 📄 Licencia

MIT

---

**Versión:** 2.0.0  
**Estado:** BETA (Reportes de Plataforma)  
**Última actualización:** 6 de abril de 2026  
**Changelog:** Ver [CHANGELOG_SESION_6ABRIL_2026.md](./CHANGELOG_SESION_6ABRIL_2026.md)
