# Propuesta: ColumnMapper y Motor de Reportes Dinámicos

## Objetivo
Permitir que el usuario agregue, quite o edite los campos requeridos y opcionales para el mapeo de columnas y el motor de reportes, sin modificar el código fuente.

---

## 1. Archivo de Configuración Dinámico

- Nombre sugerido: `column_fields_config.json`
- Ubicación: raíz del proyecto o en `/src/config/`
- Estructura ejemplo:

```json
{
  "requiredFields": [
    { "key": "editor", "label": "EDITOR", "description": "Nombre del editor" },
    { "key": "version", "label": "VERSION", "description": "Versión del contenido" },
    { "key": "platform", "label": "PLATFORM", "description": "Plataforma" },
    { "key": "season", "label": "SEASON", "description": "Temporada (solo para plataformas sin versión)" },
    { "key": "air_date", "label": "AIR_DATE", "description": "Fecha de emisión" },
    { "key": "approved_date", "label": "APPROVED_DATE", "description": "Fecha de aprobación" }
  ],
  "optionalFields": [
    { "key": "project", "label": "PROJECT", "description": "Proyecto (opcional)" }
  ]
}
```

---

## 2. Interfaz Ligera de Administración

- Nueva vista: "Configurar Campos de Mapeo"
- Permite:
  - Ver lista de campos requeridos y opcionales
  - Agregar nuevo campo (key, label, descripción, requerido/opcional)
  - Editar o eliminar campos existentes
  - Guardar cambios en `column_fields_config.json` (en localStorage o archivo si es posible)
- El ColumnMapper y el motor de reportes leerán esta configuración al cargar la app.

---

## 3. Cambios en el ColumnMapper

- Ya no tendrá los campos hardcodeados.
- Al iniciar, leerá la lista de campos requeridos y opcionales desde el archivo/configuración.
- El usuario podrá mapear cualquier columna del Excel a los campos definidos dinámicamente.

---

## 4. Cambios en el Motor de Reportes

- Usará los keys definidos en la configuración para acceder a los datos.
- Si se agrega un campo requerido nuevo, el motor lo usará automáticamente (si está mapeado).

---

## 5. Ventajas
- Máxima flexibilidad: puedes adaptar el sistema a cualquier formato de Excel futuro.
- No requiere cambios de código para agregar/quitar campos.
- Permite evolucionar el sistema según las necesidades del negocio.

---

## 6. Pendiente
- Implementar la interfaz de administración de campos.
- Adaptar ColumnMapper y motor de reportes para leer la configuración dinámica.

---

**Propuesta guardada. Lista para priorizar cuando lo decidas.**
