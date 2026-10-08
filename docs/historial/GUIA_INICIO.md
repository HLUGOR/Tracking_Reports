# 🚀 Guía de Inicio Rápido - TrackingReports

## Instalación y Setup

### Requisitos Previos
- Node.js >= 14.x
- npm >= 6.x (o yarn)

### Pasos

1. **Clona el repositorio**
```bash
git clone https://github.com/tuusuario/tracking-reports.git
cd tracking-reports
```

2. **Instala dependencias**
```bash
npm install
```

3. **Inicia en desarrollo**
```bash
npm start
```

La aplicación se abrirá en `http://localhost:3000`

4. **(Opcional) Build para producción**
```bash
npm run build
```

## 📊 Uso

### Paso 1: Cargar Excel

1. Ve a la pestaña **"📥 Cargar Excel"**
2. Arrastra tu archivo Excel o haz clic para seleccionar
3. El archivo debe tener columnas: `editor`, `horas`, `fecha`

### Paso 2: Ver Reportes

1. Una vez cargado, ve a la pestaña **"📈 Reportes"**
2. Selecciona rango de fechas
3. Configura nombres de columnas (si son diferentes)
4. Haz clic en **"Generar Reporte"**

### Paso 3: Exportar

1. Elige formato: Excel, JSON o CSV
2. Haz clic en el botón correspondiente
3. Se descargará automáticamente

## 📁 Estructura del Proyecto

```
tracking-reports/
├── src/
│   ├── core/              # Lógica sin UI (Excel, Reports, Storage)
│   ├── components/        # Componentes React (UI)
│   ├── store/             # Estado global (Zustand)
│   ├── styles/            # Estilos CSS
│   └── App.jsx            # Componente principal
├── public/                # Assets estáticos
├── docs/                  # Documentación
└── package.json
```

## 🔧 Desarrollo

### Script de desarrollo
```bash
npm start          # Inicia en localhost:3000
```

### Testing
```bash
npm test           # Correr tests
npm run test:watch # Watch mode
```

### Build
```bash
npm run build      # Crea carpeta /build
```

## 📝 Configuración Excel

Tu archivo Excel debe tener estas columnas:

| Columna | Tipo | Ejemplo |
|---------|------|---------|
| `editor` | Text | Juan Pérez |
| `horas` | Number | 8.5 |
| `fecha` | Date | 2026-04-02 |

**Formatos de fecha aceptados:**
- ISO: `2026-04-02`
- DD/MM/YYYY: `02/04/2026`
- MM/DD/YYYY: `04/02/2026`

## 🎯 Funcionalidades FASE 1

✅ Carga de Excel (drag & drop)
✅ Validación de datos
✅ Reportes por Editor
✅ Exportación (Excel, JSON, CSV)
✅ Persistencia local (IndexedDB)

## 🔌 APIs / Módulos Core

### ExcelParser
```javascript
import ExcelParser from './core/excel/ExcelParser';

const result = await ExcelParser.parseFile(file);
// { rows: [], headers: [], fileName, rowCount, ... }
```

### EditorReportsEngine
```javascript
import EditorReportsEngine from './core/reportEngine/EditorReportsEngine';

const report = EditorReportsEngine.calculateByEditor(
  rows,
  startDate,
  endDate,
  { editorColumn: 'editor', hoursColumn: 'horas' }
);
```

### ExcelExporter
```javascript
import ExcelExporter from './core/excel/ExcelExporter';

// Exportar a Excel
await ExcelExporter.exportToExcel(data, { 
  title: 'Mi Reporte',
  fileName: 'reporte.xlsx'
});

// Exportar a JSON
ExcelExporter.exportToJSON(data, 'reporte.json');

// Exportar a CSV
ExcelExporter.exportToCSV(data, 'reporte.csv');
```

## 📊 Estado Global (Zustand)

```javascript
import excelStore from './store/excelStore';

// Obtener datos
const rows = excelStore((state) => state.excelRows);
const headers = excelStore((state) => state.headers);

// Actualizar
const setExcelRows = excelStore((state) => state.setExcelRows);
setExcelRows(newData);
```

## 🌐 Deployar

### GitHub Pages
```bash
npm run build
# Sube carpeta /build a gh-pages
```

### Vercel
```bash
vercel --prod
```

### Netlify
```bash
npm run build
# Arrastra carpeta /build a Netlify
```

### Servidor estático cualquiera
```bash
npm run build
# Sube contenido de /build a tu servidor web
```

## 🐛 Resolución de Problemas

### "Excel no se carga"
- Verifica que el archivo sea .xlsx, .xls o .csv válido
- Asegúrate que tenga headers en la primera fila

### "No aparecen los reportes"
- Revisa que las columnas se llamen `editor`, `horas`, `fecha`
- Si no, configura los nombres en los filtros

### "Error al exportar"
- Intenta con menos filas de datos (< 10k)
- O abre la consola (F12) para ver el error exacto

## 📞 Soporte

- 📖 Documentación: Ver carpeta `/docs/`
- 🐛 Bugs: Abre un GitHub Issue
- 💬 Preguntas: Abre una Discussion

## 📄 Licencia

MIT - Libre para usar con atribución

---

¡Listo! Ahora puedes cargar tus Excel y generar reportes sin servidor. 🚀
