/**
 * platformStatus.js
 * Qué le falta a una plataforma para poder calcular, según su lógica. Una sola regla para
 * la columna "Configuración" de Librerías → Plataformas y para el botón "Validar librería",
 * así nunca dicen cosas distintas.
 */
import { isValidRate } from './rates';

// Lógicas cuya tasa va en cada categoría de la librería (📂 Categorías)
export const CATEGORY_RATE_LOGICAS = ['logica_de_versiones', 'iberia_especial', 'logica_duracion_categorias'];
// Lógicas cuya tasa es una sola para toda la plataforma (platformEffortRate)
export const PLATFORM_RATE_LOGICAS = ['logica_comerciales', 'logica_bp_i', 'logica_por_duracion', 'logica_youtube'];

/**
 * Lista de lo que falta configurar (vacía = completa). Ej.: ['tasa de la plataforma'].
 * @param {Object} platform
 * @param {Array}  categories - todas las categorías de la librería
 */
export function platformProblems(platform, categories = []) {
  const problems = [];
  const logica = platform.logica || 'logica_de_versiones';

  if (!String(platform.effortGroup || '').trim()) problems.push('grupo de esfuerzo');

  if (CATEGORY_RATE_LOGICAS.includes(logica)) {
    const cats = categories.filter((c) => String(c.platformId) === String(platform.id));
    if (cats.length === 0) problems.push('categorías');
    cats.forEach((c) => {
      if (!(Number(c.duration) > 0)) problems.push(`duración de "${c.name}"`);
      if (!isValidRate(c.effortRate)) problems.push(`tasa de "${c.name}"`);
    });
  }

  if (logica === 'logica_sin_version') {
    const casillas = platform.categorias || [];
    ['serie', 'película'].forEach((label, i) => {
      const c = casillas[i];
      if (!c || !(Number(c.duration) > 0)) problems.push(`duración de la casilla ${label}`);
      if (!c || !isValidRate(c.effortRate)) problems.push(`tasa de la casilla ${label}`);
    });
  }

  if (PLATFORM_RATE_LOGICAS.includes(logica) && !isValidRate(platform.platformEffortRate)) {
    problems.push('tasa de la plataforma');
  }

  return problems;
}
