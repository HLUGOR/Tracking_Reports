# TrackingReports

Aplicación React que convierte el Excel de entrada (consolidado por una macro externa) en
reportes de trabajo por editor: **Plataformas**, **Editores** (horas de esfuerzo) y **Series**.
Funciona 100% en el navegador: no hay servidor y los datos no salen del equipo.

**Principio del proyecto:** el conteo de cada editor tiene que ser fiel. Nada se adivina en
silencio: lo que no se puede calcular queda en la **Auditoría** con su motivo.

## Inicio rápido

```bash
npm install
npm start          # http://localhost:3002/Tracking_Reports  (puerto en .env)
npm test           # pruebas automáticas (42 casos)
npm run build      # genera /build
npm run deploy     # publica en GitHub Pages
```

## Excel de entrada

Una fila por asset. Columnas: `PLATFORM, HN, SERIE, SEASON, EPS TITLE, EPS#, CLIP, SHORT,
VERSION, EDITOR, DURATION, APPROVED_DATE`.

- **APPROVED_DATE** va en formato **MM/DD/AAAA** (mes primero). Toda fila debe traerla; las que
  no, se avisan en la Auditoría.
- Al cargar, cada **EDITOR** se compara con el registro de editores (Librerías → Editores). Los
  nombres desconocidos se resuelven antes de continuar (nuevo editor o alias de uno existente).

## Cómo se calcula

Cada plataforma tiene una **lógica**, agrupada en 4 familias según la columna que decide los
minutos de la fila. Horas de esfuerzo = minutos ÷ 60 × tasa.

| Familia | Columna | Lógica | Ejemplos | Dónde va la tasa |
|---|---|---|---|---|
| Con versión | VERSION | `logica_de_versiones` | LATAM (+BRAZIL), OFF AIR, VOD | Cada categoría |
| | | `iberia_especial` | IBERIA | Cada categoría |
| Sin versión | SEASON | `logica_sin_version` | SONY ONE, AMAZON | Casillas serie / película |
| Por duración | DURATION | `logica_por_duracion` | Plataformas COMPLIANCE | La plataforma |
| | | `logica_bp_i` | BP&I | La plataforma |
| | | `logica_comerciales` | COMERCIALES | La plataforma (horas por pieza*) |
| Por conteo | CLIP / SHORT | `logica_youtube` | YOUTUBE | La plataforma |

\* Cómo calcular COMERCIALES está pendiente de definir con TQC.

Reglas principales:

- **Con versión:** la VERSION se busca en la librería. Si no está, `logica_de_versiones` estima la
  duración por el número final (1-4 → 30, 5-6 → 60, 9-10 → 120; no existen 7 ni 8) y lo avisa
  en la Auditoría; `iberia_especial` no estima: la fila no cuenta. El prefijo `BRA_` envía la
  fila de LATAM a BRAZIL.
- **Sin versión:** SEASON vacío o 0 = película; cualquier otro valor = serie.
- **Por duración:** DURATION acepta minutos (`30`) o tiempo (`00:30:00`). Si trae texto, la fila
  no cuenta y la Auditoría muestra el valor.
- **Tasa:** es un % del esfuerzo estándar (1 = 100%, 1.5 = 150%, 0.25 = 25%). Una plataforma
  tiene una sola tasa, la misma en todos los reportes. En los formularios arranca en 1, acepta
  decimales y es obligatoria.

## Reportes

- **Plataformas:** plataforma → editor → categoría, con ítems y minutos. El Excel trae una hoja
  por plataforma, un Summary y una hoja de Auditoría.
- **Editores:** horas de esfuerzo por editor y por grupo de esfuerzo, con % de ocupación.
- **Series:** horas por serie (solo filas con SERIE), calculadas con el mismo código que Editores.

Los tres arrancan en "Todos los registros" y permiten filtrar por fecha de aprobación. La
pantalla está en español o inglés (botón de idioma); el Excel descargado siempre sale en inglés.

## Estructura

```
src/
├── components/
│   ├── dataImport/   Carga del Excel, mapeo de columnas, Librerías, asistente de plataforma,
│   │                 resolución de editores
│   ├── reports/      Reportes Plataformas, Editores y Series (pantalla + exportación Excel)
│   └── shared/
├── core/
│   ├── reportEngine/ PlatformReportsEngine (minutos, horas, auditoría), SerieReportsEngine,
│   │                 VersionMatcher, versionRules, logicaFamilies
│   ├── utils/        dateUtils (fechas), rates (tasas), editorRegistry, platformCasillas
│   ├── excel/        Lectura del Excel
│   └── __tests__/    Pruebas automáticas
├── store/            Estado (Zustand): librería, Excel cargado, idioma
└── i18n/             Traducciones español → inglés
```

La librería (plataformas, categorías, versiones, editores) se guarda en el navegador. Usa
**Librerías → 💾 Hacer Respaldo** para tener una copia (.json) y **♻️ Restaurar Respaldo** para cargarla;
los respaldos viejos se convierten solos al formato actual.

## Historial

- `Notas.txt`: bitácora de la revisión (puntos #1-#12), decisiones de negocio y pendientes.
- `docs/historial/`: notas y changelogs de sesiones anteriores (abril 2026), solo como referencia.

## Licencia

MIT
