/**
 * categoryLabel.js
 * Construye la etiqueta legible de una categoría a partir de su nombre base + duración,
 * sin duplicar el "(X min)" si el nombre guardado ya lo trae como texto libre (categorías
 * creadas con el formulario viejo, antes de que el nombre se compusiera automáticamente).
 *
 * Antes vivía solo dentro de PlatformReportsView.jsx; se comparte aquí porque
 * LibraryView.jsx (tabla de Versiones) tenía el mismo problema sin esta limpieza.
 */
export function buildCategoryLabel(cat) {
  const rawName = (cat.label || cat.name || cat.category_key || '').trim();
  const cleanName = rawName
    .replace(/\s*\(\d+\s*min\)/gi, '')   // quita "(60 min)" o "(60min)"
    .replace(/\s+\d+\s*min\b/gi, '')      // quita " 45min" o " 120 min"
    .replace(/\s+\d+\s*$/, '')            // quita número suelto al final " 60"
    .trim();
  const dur = Number(cat.duration_minutes ?? cat.duration ?? 0);
  if (dur <= 0) return cleanName || rawName;
  return `${cleanName || rawName} (${dur} min)`;
}
