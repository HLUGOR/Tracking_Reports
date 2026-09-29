/**
 * editorRegistry.js
 * Reconoce los nombres de la columna EDITOR contra el registro de editores de la
 * librería. Mayúsculas/minúsculas y espacios extra se ignoran ("raquel" = "Raquel");
 * cualquier otra diferencia (acentos, letras de más) NO se adivina: se reporta como
 * desconocido para que el usuario decida, porque asignar trabajo al editor
 * equivocado rompe la fidelidad del reporte.
 */

export const editorKey = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// Solo para SUGERIR a quién podría corresponder un nombre desconocido; nunca se aplica solo.
const looseKey = (name) => editorKey(name).normalize('NFD').replace(/[̀-ͯ]/g, '');

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** Mapa clave normalizada → nombre correcto, a partir del nombre y los alias de cada editor. */
export function buildEditorIndex(editors = []) {
  const index = {};
  editors.forEach((e) => {
    index[editorKey(e.name)] = e.name;
    (e.aliases || []).forEach((a) => { index[editorKey(a)] = e.name; });
  });
  return index;
}

/**
 * Nombres de la columna editor que no están en el registro, agrupados por clave
 * normalizada. Las filas sin editor no bloquean (se reportan como "Sin Asignar").
 * @returns {{ unknown: Array<{key, display, count, suggestion}>, blankCount: number }}
 */
export function findUnknownEditors(rows, editors = []) {
  const index = buildEditorIndex(editors);
  const groups = {};
  let blankCount = 0;
  rows.forEach((r) => {
    const raw = String(r.editor ?? '').trim();
    if (!raw) { blankCount++; return; }
    const key = editorKey(raw);
    if (index[key]) return;
    groups[key] ??= { key, count: 0, variants: {} };
    groups[key].count++;
    groups[key].variants[raw] = (groups[key].variants[raw] || 0) + 1;
  });

  const unknown = Object.values(groups).map((g) => ({
    key: g.key,
    // la variante más usada en el Excel, para mostrarla y proponerla como nombre nuevo
    display: Object.entries(g.variants).sort((a, b) => b[1] - a[1])[0][0],
    count: g.count,
  }));

  // Sugerencia: un editor registrado, u otro desconocido más frecuente, que sea igual sin
  // acentos o a 1 letra de distancia (ej. "Jesús" → "Jesus", "Luiis" → "Luis").
  const candidates = [
    ...editors.map((e) => ({ name: e.name, weight: Infinity })),
    ...unknown.map((u) => ({ name: u.display, weight: u.count })),
  ];
  unknown.forEach((u) => {
    const match = candidates
      .filter((c) => editorKey(c.name) !== u.key && c.weight > u.count)
      .find((c) => looseKey(c.name) === looseKey(u.display) || levenshtein(looseKey(c.name), looseKey(u.display)) <= 1);
    u.suggestion = match ? match.name : null;
  });

  unknown.sort((a, b) => b.count - a.count);
  return { unknown, blankCount };
}

/** Reemplaza el editor de cada fila por su nombre correcto según el registro. */
export function canonicalizeEditors(rows, editors = []) {
  const index = buildEditorIndex(editors);
  return rows.map((r) => {
    const canonical = index[editorKey(r.editor)];
    return canonical ? { ...r, editor: canonical } : r;
  });
}
