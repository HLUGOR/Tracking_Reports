/**
 * logicaFamilies.js
 * Las lógicas de cálculo ordenadas en 3 familias, según la columna del input que
 * decide los minutos de cada fila. Una sola lista para el asistente de plataforma
 * nueva y para el formulario de editar plataforma, así nunca se desalinean.
 *
 * Cada opción: value = código técnico (se guarda en la plataforma), label = nombre que
 * se muestra, desc = qué hace, example = plataformas que la usan hoy.
 */

export const LOGICA_FAMILIES = [
  {
    key: 'con_version',
    title: '📦 Por versión',
    column: 'VERSION',
    desc: 'Los minutos salen de la VERSION registrada en la librería. La tasa va en cada categoría.',
    options: [
      {
        value: 'logica_de_versiones',
        label: 'Por versión registrada',
        desc: 'La columna VERSION debe estar registrada en la librería; de ahí salen los minutos y la categoría. Si no está registrada, la fila no cuenta y la Auditoría avisa.',
        example: 'LATAM, OFF AIR, VOD',
      },
      {
        value: 'iberia_especial',
        label: 'Por versión registrada (códigos IBERIA)',
        desc: 'Igual que la anterior, para códigos propios sin cantidad de segmentos. Nunca estima: si el código no está registrado, la fila no cuenta.',
        example: 'IBERIA',
      },
    ],
  },
  {
    key: 'por_duracion',
    title: '⏱ Por duración',
    column: 'DURATION',
    desc: 'Los minutos salen de la columna DURATION de cada fila.',
    options: [
      {
        value: 'logica_duracion_categorias',
        label: 'Categorías por duración exacta',
        desc: 'DURATION debe ser exacta (30, 60, 120…) y elige la categoría con esa duración. Cada categoría tiene su tasa y sus sub-tasas por EFFORT; se crean desde la misma pantalla. Un EFFORT con REPROSS (REPROSS, 2P REPROSS) cuenta como reproceso y va en su columna R.',
        example: 'AMAZON, FAST GLOBAL',
      },
      {
        value: 'logica_duracion_rangos',
        label: 'Rangos de duración (30 / 60 / 120)',
        desc: 'DURATION se agrupa: 10-30 min cuenta como 30, 40-60 como 60 y 100-240 como 120 (entre rangos: la más cercana, con alerta). Son 3 casillas con tasa estándar; si la plataforma tiene sub-tasas (PR, MC…), EFFORT elige la de esa casilla.',
        example: 'SONY ONE',
      },
      {
        value: 'logica_por_duracion',
        label: 'Una tasa para toda la plataforma (suma minutos)',
        desc: 'Suma los minutos de DURATION ("30" o "00:30:00") y los multiplica por una sola tasa. Sin categorías. Para plataformas digitales (COMPLIANCE).',
        example: '',
      },
      {
        value: 'logica_bp_i',
        label: 'Minutos como número',
        desc: 'Minutos = DURATION como número ("10"). Horas = minutos ÷ 60 × tasa.',
        example: 'BP&I',
      },
      {
        value: 'logica_comerciales',
        label: 'Piezas con tiempo HH:MM:SS',
        desc: 'Minutos = DURATION como tiempo ("00:00:30:00"). Horas = cantidad de piezas × tasa (cómo calcular está pendiente de la reunión con TQC).',
        example: 'COMERCIALES',
      },
    ],
  },
  {
    key: 'por_conteo',
    title: '🔢 Por conteo',
    column: 'CLIP / SHORT',
    desc: 'No usa minutos: cuenta piezas de las columnas CLIP y SHORT. Una sola tasa para toda la plataforma.',
    options: [
      {
        value: 'logica_youtube',
        label: 'Clips y shorts',
        desc: 'Cuenta CLIPS y SHORTS por editor. Horas = cantidad × tasa.',
        example: 'YOUTUBE',
      },
    ],
  },
];

/**
 * Lógicas que ya no existen. Una plataforma que todavía las trae queda incompleta y sus filas
 * van a la Auditoría hasta que se elija otra.
 *   logica_sin_version: clasificaba por SEASON (serie / película).
 */
export const REMOVED_LOGICAS = ['logica_sin_version'];

/** Familia a la que pertenece una lógica (o null si no existe). */
export const familyOf = (logica) =>
  LOGICA_FAMILIES.find((f) => f.options.some((o) => o.value === logica)) || null;

/** Opción (value, label, desc, example) de una lógica, o null si no existe. */
export const logicaOf = (logica) =>
  LOGICA_FAMILIES.flatMap((f) => f.options).find((o) => o.value === logica) || null;
