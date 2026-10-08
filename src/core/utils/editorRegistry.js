/**
 * editorRegistry.js
 * Reconoce los nombres de la columna EDITOR contra el registro de editores de la
 * librería (Librerías → Editores).
 *
 * Regla del negocio: el nombre correcto es "Apellido Nombre" y tiene que venir así en el
 * input. Solo se ignoran mayúsculas/minúsculas y espacios de más ("GUERRERO  JOSE" =
 * "Guerrero Jose"). Cualquier otra diferencia (orden invertido, acentos, letras de más)
 * no se adivina: la fila no se cuenta y la auditoría pide corregirla en el input.
 */

export const editorKey = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Mapa clave normalizada → nombre correcto (solo el nombre registrado, sin variantes). */
export function buildEditorIndex(editors = []) {
  const index = {};
  editors.forEach((e) => { index[editorKey(e.name)] = e.name; });
  return index;
}

/** Reemplaza el editor de cada fila por su nombre registrado (solo cambia mayúsculas/espacios). */
export function canonicalizeEditors(rows, editors = []) {
  const index = buildEditorIndex(editors);
  return rows.map((r) => {
    const canonical = index[editorKey(r.editor)];
    return canonical ? { ...r, editor: canonical } : r;
  });
}
