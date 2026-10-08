# 📖 MANUAL COMPLETO - TrackingReports en GitHub

**Fecha:** 2 de abril de 2026  
**Proyecto:** TrackingReports Standalone  
**URL actual:** https://hlugor.github.io/Tracking_Report

---

## ÍNDICE

1. [Cómo replicar el repo en otra cuenta de GitHub](#1-replicar-en-otra-cuenta)
2. [Qué subir y qué NO subir a Git](#2-qué-subir-y-qué-no)
3. [Seguridad: quién puede acceder a la app](#3-seguridad-y-acceso)

---

## 1. REPLICAR EN OTRA CUENTA DE GITHUB

### Escenario: Tienes una cuenta nueva de GitHub (ej: `OTROUSUARIO`)

#### PASO 1 - Preparar la carpeta local

```bash
# Navega a donde quieras tener el proyecto
cd C:\Users\TU_USUARIO\Desktop

# Clona el repo actual (copia todo el código)
git clone https://github.com/HLUGOR/Tracking_Report.git

# Entra a la carpeta
cd Tracking_Report

# Instala las dependencias (node_modules/)
npm install
```

---

#### PASO 2 - Crear el repositorio en la nueva cuenta

1. Entra a **github.com** con la nueva cuenta
2. Click en `+` → **New repository**
3. Configurar:
   - **Repository name:** `Tracking_Report`
   - **Public**
   - ❌ Sin README, ❌ Sin .gitignore, ❌ Sin license
4. Click **Create repository**

---

#### PASO 3 - Apuntar el repo local a la nueva cuenta

```bash
# Cambiar la URL del remote origin a la nueva cuenta
git remote set-url origin https://github.com/OTROUSUARIO/Tracking_Report.git

# Verificar que cambió correctamente
git remote -v
# Debe mostrar: origin  https://github.com/OTROUSUARIO/Tracking_Report.git
```

---

#### PASO 4 - Actualizar package.json con el nuevo usuario

Abre `package.json` y cambia la línea `homepage`:

```json
{
  "homepage": "https://otrousuario.github.io/Tracking_Report"
}
```

> ⚠️ El username en la URL DEBE estar en minúsculas aunque en GitHub aparezca en mayúsculas.
> Ejemplo: si el usuario es `OTROUSUARIO`, la URL es `https://otrousuario.github.io/Tracking_Report`

---

#### PASO 5 - Subir el código y publicar

```bash
# Subir el código a GitHub
git add package.json
git commit -m "Update homepage URL for new account"
git push -u origin master

# Publicar la app en GitHub Pages
npm run deploy
```

---

#### PASO 6 - Activar GitHub Pages en Settings

1. Ve a: `https://github.com/OTROUSUARIO/Tracking_Report/settings/pages`
2. **Source:** Deploy from a branch
3. **Branch:** `gh-pages` → `/ (root)`
4. Click **Save**
5. Esperar 1-2 minutos

**✅ App funcionando en:** `https://otrousuario.github.io/Tracking_Report`

---

#### RESUMEN RÁPIDO (Checklist)

```
[ ] git clone del repo original
[ ] npm install
[ ] Crear repo en la nueva cuenta de GitHub
[ ] git remote set-url origin https://github.com/NUEVOUSUARIO/Tracking_Report.git
[ ] Actualizar "homepage" en package.json
[ ] git push -u origin master
[ ] npm run deploy
[ ] Activar GitHub Pages en Settings → Pages
[ ] Verificar la URL funciona
```

---

## 2. QUÉ SUBIR Y QUÉ NO A GIT

### ✅ LO QUE SÍ SE SUBE (está en Git)

```
Tracking_Report/
├── src/                    ✅ TODO el código fuente
│   ├── components/         ✅ Componentes React
│   ├── core/               ✅ Módulos de lógica
│   ├── store/              ✅ Estado global (Zustand)
│   ├── styles/             ✅ Archivos CSS
│   ├── App.jsx             ✅ Componente raíz
│   └── index.js            ✅ Entry point
├── public/                 ✅ HTML y assets estáticos
│   ├── index.html          ✅
│   └── manifest.json       ✅
├── package.json            ✅ Dependencias y scripts
├── .env.example            ✅ Plantilla de variables (sin valores reales)
├── .gitignore              ✅ Reglas de exclusión
├── README.md               ✅ Documentación
└── docs/                   ✅ Documentación adicional
```

---

### ❌ LO QUE NO SE SUBE (bloqueado por .gitignore)

```
Tracking_Report/
├── node_modules/           ❌ 1,500+ paquetes (se regenera con npm install)
├── build/                  ❌ La compilación (se regenera con npm run build)
├── .env                    ❌ Variables de entorno con valores reales
└── *.log                   ❌ Archivos de log
```

---

### ¿Por qué no se sube `node_modules`?

- Puede pesar **300-500 MB**
- Se regenera fácilmente con `npm install`
- Contiene binarios específicos del sistema operativo
- Contaminaría el historial de Git

**En cualquier máquina nueva basta con:**
```bash
git clone [URL]
npm install   # descarga los node_modules automáticamente
npm start     # o npm run build
```

---

### ¿Por qué no se sube `.env`?

El archivo `.env` puede contener **contraseñas, API keys o tokens**.  
Por eso solo se sube `.env.example` con los nombres de las variables pero **sin los valores reales**:

```env
# .env.example (ESTE SÍ sube a Git - sin valores)
PORT=3000
REACT_APP_MAX_FILE_SIZE_MB=100

# .env (ESTE NO sube a Git - con valores reales)
PORT=3000
REACT_APP_SECRET_KEY=mi-clave-ultra-secreta-123   ← NUNCA a Git
```

---

### Comandos de Git para el día a día

```bash
# Ver qué archivos tienen cambios
git status

# Agregar todos los cambios
git add .

# O agregar un archivo específico
git add src/components/nuevo-componente.jsx

# Guardar los cambios con mensaje
git commit -m "Descripción del cambio"

# Subir a GitHub
git push origin master

# Desplegar a GitHub Pages (build + publish)
npm run deploy
```

---

## 3. SEGURIDAD Y ACCESO

### ¿Quién puede ACCEDER A LA APP?

GitHub Pages con repositorio **Public** significa:

| Acción | ¿Quién puede? |
|--------|---------------|
| Ver la app en el navegador | **CUALQUIER PERSONA en el mundo** |
| Ver el código fuente HTML/JS | **CUALQUIER PERSONA** (F12 en el navegador) |
| Ver el repositorio en GitHub | **CUALQUIER PERSONA** |
| Editar/pushear código | Solo tú (requiere login) |
| Hacer fork del proyecto | Cualquier usuario de GitHub |

---

### ¿Los datos del Excel son públicos?

**NO.** Los datos que el usuario carga son **100% privados** porque:

```
Excel cargado → Parsed en JavaScript del navegador
                ↓
            IndexedDB (base de datos LOCAL del navegador)
                ↓
           localStorage (almacenamiento LOCAL)
                ↓
          ❌ Nunca sale a internet
          ❌ No va a ningún servidor
          ❌ No sube a GitHub
```

Cada usuario tiene **sus propios datos aislados** en su navegador.  
Si alguien más entra a la misma URL, ve la app vacía con sus propios datos.

---

### ¿Cómo controlar el acceso a la APP?

#### Opción A: Repositorio Privado (app solo visible con URL exacta)

Si cambias el repo a **Private**, GitHub Pages deja de ser accesible públicamente.  
Solo tú podrías verla (necesita GitHub Pro pagado para repo privado con Pages gratuito).

#### Opción B: Repositorio Público (cualquiera ve la app, no el backend)

**Situación actual.** Cualquiera con la URL puede usar la app.  
Esto es aceptable porque:
- No hay datos sensibles en el repositorio
- Los datos de Excel son locales al navegador de cada usuario
- La app no se conecta a ningún servidor

#### Opción C: Agregar autenticación (si quieres restringir acceso)

Si necesitas que solo cierta gente acceda, se puede agregar autenticación básica:

```javascript
// Ejemplo: contraseña simple al cargar la app
const ALLOWED_PASSWORD = process.env.REACT_APP_ACCESS_PASSWORD;

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  
  if (!authenticated) {
    return <LoginScreen onLogin={setAuthenticated} />;
  }
  
  return <MainApp />;
}
```

> ⚠️ Esta autenticación es básica (solo oculta la app, no es seguridad real).  
> Para seguridad real se necesita un servidor backend, lo cual va contra el propósito standalone de esta app.

---

### ¿Quién puede modificar el código?

| Acción | Requisito |
|--------|-----------|
| Push al repositorio | Usuario con acceso de escritura |
| Hacer deploy | Solo quien tenga el repo y las credenciales de Git configuradas |
| Hacer un fork | Cualquier usuario de GitHub |
| Abrir un Pull Request | Cualquier usuario de GitHub (tú decides si aceptas) |

Para agregar colaboradores que puedan pushear:
1. Ve a `https://github.com/HLUGOR/Tracking_Report/settings/access`
2. Click **Add people**
3. Escribe el username del colaborador
4. Selecciona el rol (Write/Maintain/Admin)

---

### Resumen de Seguridad

```
CÓDIGO FUENTE
  ├── Visible: SÍ (es open source / público)
  └── Modificable: Solo tú y colaboradores con acceso

DATOS DEL USUARIO (Excel cargado)
  ├── Almacenado: Solo en el navegador (IndexedDB)
  ├── Viajando a internet: NUNCA
  └── Visible para otros: NUNCA

LA APP EN INTERNET
  ├── URL pública: https://hlugor.github.io/Tracking_Report
  ├── Accesible: Cualquier persona con el link
  └── Autenticación: Ninguna (por diseño standalone)
```

---

## APÉNDICE: COMANDOS DE REFERENCIA RÁPIDA

```bash
# ─── CLONAR EN NUEVA MÁQUINA ───────────────────────────────
git clone https://github.com/HLUGOR/Tracking_Report.git
cd Tracking_Report
npm install
npm start

# ─── FLUJO DIARIO DE DESARROLLO ────────────────────────────
npm start                          # Abrir en localhost:3000
# ...hacer cambios...
git add .
git commit -m "Descripción"
git push origin master
npm run deploy                     # Publicar cambios en GitHub Pages

# ─── REPLICAR EN NUEVA CUENTA ──────────────────────────────
git remote set-url origin https://github.com/NUEVOUSUARIO/Tracking_Report.git
# Editar homepage en package.json
git push -u origin master
npm run deploy
# Activar GitHub Pages en Settings → Pages → Branch: gh-pages

# ─── VERIFICAR ESTADO ──────────────────────────────────────
git status                         # Ver archivos modificados
git log --oneline                  # Ver historial de commits
git remote -v                      # Ver URL del remote
```

---

**URLs del Proyecto**

| Recurso | URL |
|---------|-----|
| App en vivo | https://hlugor.github.io/Tracking_Report |
| Código fuente | https://github.com/HLUGOR/Tracking_Report |
| Settings Pages | https://github.com/HLUGOR/Tracking_Report/settings/pages |
| Colaboradores | https://github.com/HLUGOR/Tracking_Report/settings/access |

---

**Documento:** 2 de abril de 2026 | **Versión:** 1.0
