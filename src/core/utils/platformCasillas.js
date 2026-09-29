/**
 * platformCasillas.js
 * Único lugar que conoce el formato ANTIGUO de las casillas de logica_sin_version.
 *
 *   Antiguo: categorias = ['serie_45min', 'pelicula_120min']
 *            + duracion_serie_minutos: 45, duracion_pelicula_minutos: 120 (en la plataforma)
 *   Actual:  categorias = [{ key, duration, effortRate }, ...]  (serie primero, película segundo)
 *
 * Se convierte UNA vez al entrar los datos (respaldo restaurado o datos guardados en el
 * navegador). El resto de la app (motor, formularios) solo conoce el formato actual.
 * La duración del formato antiguo se conserva (antes se perdía al convertir).
 */

const toCasilla = (cat, idx, platform) => {
  if (typeof cat === 'string') {
    const legacyDuration = idx === 0 ? platform.duracion_serie_minutos
      : idx === 1 ? platform.duracion_pelicula_minutos
      : undefined;
    return {
      key: cat,
      duration: Number(legacyDuration) > 0 ? Number(legacyDuration) : '',
      effortRate: null,
    };
  }
  if (!cat || typeof cat !== 'object') return { key: '', duration: '', effortRate: null };
  return {
    key: cat.key || cat.name || '',
    duration: cat.duration !== undefined && cat.duration !== null ? cat.duration : '',
    effortRate: cat.effortRate !== undefined ? cat.effortRate : null,
  };
};

/** Devuelve la plataforma con sus casillas en formato actual y sin los campos antiguos. */
export const normalizePlatformCasillas = (platform) => {
  if (!platform) return platform;
  // eslint-disable-next-line no-unused-vars
  const { duracion_serie_minutos, duracion_pelicula_minutos, ...rest } = platform;
  return {
    ...rest,
    categorias: (platform.categorias || []).map((cat, idx) => toCasilla(cat, idx, platform)),
  };
};
