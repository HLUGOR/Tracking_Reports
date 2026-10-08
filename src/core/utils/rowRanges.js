/**
 * rowRanges.js
 * Números de fila del Excel en forma corta para la auditoría:
 * [283, 284, 285, 290] → "283-285, 290". Si son muchos tramos, muestra los primeros y
 * dice cuántos más hay.
 */
export function formatRowRanges(rows = [], maxRanges = 25) {
  const sorted = [...new Set(rows)].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  const ranges = [];
  let from = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const n = sorted[i];
    if (n === prev + 1) { prev = n; continue; }
    ranges.push(from === prev ? String(from) : `${from}-${prev}`);
    from = n;
    prev = n;
  }
  if (ranges.length <= maxRanges) return ranges.join(', ');
  return `${ranges.slice(0, maxRanges).join(', ')} … (+${ranges.length - maxRanges})`;
}
