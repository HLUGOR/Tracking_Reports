/**
 * platformStatus.js
 * Qué le falta a una plataforma para poder calcular, según su lógica. Una sola regla para
 * la columna "Configuración" de Librerías → Plataformas y para el botón "Validar librería",
 * así nunca dicen cosas distintas.
 */
import { isValidRate } from './rates';
import { REMOVED_LOGICAS } from '../reportEngine/logicaFamilies';

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

  if (REMOVED_LOGICAS.includes(logica)) {
    problems.push('lógica de cálculo (la anterior ya no existe: elige otra)');
  }

  if (logica === 'logica_duracion_rangos') {
    const casillas = platform.categorias || [];
    ['30 min', '60 min', '120 min'].forEach((label, i) => {
      const c = casillas[i];
      if (!c || !String(c.key || '').trim()) problems.push(`nombre de la casilla de ${label}`);
      if (!c || !isValidRate(c.effortRate)) problems.push(`tasa de la casilla de ${label}`);
    });
    // Sub-tasas (PR, MC…) opcionales; las que existan deben traer su tasa en cada casilla
    const keys = casillas.map((c) => String(c?.key || '').trim()).filter(Boolean);
    const codes = platform.effortRates || [];
    codes.forEach((e) => {
      if (keys.some((k) => !isValidRate(e.rates?.[k]))) problems.push(`tasas de "${e.code}" en las 3 casillas`);
    });
  }

  if (PLATFORM_RATE_LOGICAS.includes(logica) && !isValidRate(platform.platformEffortRate)) {
    problems.push('tasa de la plataforma');
  }

  return problems;
}
