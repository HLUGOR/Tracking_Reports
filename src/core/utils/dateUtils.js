/**
 * dateUtils.js
 * Única forma de leer fechas del input en toda la app (reportes Plataformas, Editores
 * y Series). Antes había una copia en cada motor, y leían "06/25/2026" con el DÍA
 * primero: junio salía como enero o como 2027, sin ningún aviso.
 *
 * Formatos aceptados:
 *   - Texto MM/DD/AAAA (mes primero), el formato que trae el input: "06/25/2026".
 *   - Fecha real de Excel (número de serie) o un objeto Date.
 *   - AAAA-MM-DD (lo usan los selectores Desde/Hasta de la pantalla).
 * Cualquier otra cosa (vacío, "25/06/2026", "13/01/2026", "31/02/2026", texto) → null.
 * Nunca se "corrige" una fecha imposible: se devuelve null para que se vea en la auditoría.
 */

const validDate = (year, month, day) => {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d : null;
};

export const parseInputDate = (value) => {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  // Fecha real de Excel: días desde el 30/12/1899
  if (typeof value === 'number') {
    if (!(value > 0)) return null;
    // Por componentes (no sumando milisegundos) para que el cambio de horario no mueva el día
    return new Date(1899, 11, 30 + Math.floor(value));
  }

  const s = String(value ?? '').trim();
  if (!s) return null;

  // MM/DD/AAAA
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return validDate(Number(m[3]), Number(m[1]), Number(m[2]));

  // AAAA-MM-DD
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));

  return null;
};

/**
 * Fecha para mostrar (pantalla y Excel), en el mismo formato del input: MM/DD/AAAA.
 * Recibe lo que den los selectores (AAAA-MM-DD) o cualquier valor que lea parseInputDate.
 */
export const formatDisplayDate = (value) => {
  const d = parseInputDate(value);
  if (!d) return String(value ?? '');
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
};

/** Período "MM/DD/AAAA → MM/DD/AAAA" para el encabezado de los reportes. */
export const formatPeriod = (start, end) => `${formatDisplayDate(start)} → ${formatDisplayDate(end)}`;

/** Valor de la fecha de aprobación de una fila (mapeada o con el nombre original). */
export const approvedDateOf = (row) =>
  row.approved_date ?? row.APPROVED_DATE ?? row.APROVED_DATE ?? '';
