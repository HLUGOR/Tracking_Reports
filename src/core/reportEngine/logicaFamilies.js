/**
 * logicaFamilies.js
 * Las lógicas de cálculo ordenadas en 4 familias, según la columna del input que
 * decide los minutos de cada fila. Una sola lista para el asistente de plataforma
 * nueva y para el formulario de editar plataforma, así nunca se desalinean.
 */

export const LOGICA_FAMILIES = [
  {
    key: 'con_version',
    title: '📦 Con versión',
    column: 'VERSION',
    desc: 'Los minutos salen de la VERSION registrada en la librería. La tasa va en cada categoría.',
    options: [
      {
        value: 'logica_de_versiones',
        label: 'logica_de_versiones',
        desc: 'Busca la VERSION en la librería. Si no está, estima la duración por el número final (1-4 → 30, 5-6 → 60, 9-10 → 120) y lo avisa en Auditoría. Ej.: LATAM, OFF AIR, VOD.',
      },
      {
        value: 'iberia_especial',
        label: 'iberia_especial',
        desc: 'Igual que la anterior, pero sin estimar: si la VERSION no está registrada, la fila no cuenta. Ej.: IBERIA.',
      },
    ],
  },
  {
    key: 'sin_version',
    title: '🎬 Sin versión (por SEASON)',
    column: 'SEASON',
    desc: 'Los minutos salen de la columna SEASON: vacío o 0 = película, otro valor = serie. La tasa va en cada una de las 2 casillas.',
    options: [
      {
        value: 'logica_sin_version',
        label: 'logica_sin_version',
        desc: 'SEASON vacío o 0 → casilla película; SEASON con valor → casilla serie. Ej.: SONY ONE, AMAZON.',
      },
    ],
  },
  {
    key: 'por_duracion',
    title: '⏱ Por duración',
    column: 'DURATION',
    desc: 'Los minutos salen de la columna DURATION de cada fila. La tasa va en la plataforma o, con categorías, en cada categoría.',
    options: [
      {
        value: 'logica_por_duracion',
        label: 'logica_por_duracion',
        desc: 'Minutos = DURATION ("30" o "00:30:00"). Horas = minutos ÷ 60 × tasa. Para plataformas digitales (COMPLIANCE).',
      },
      {
        value: 'logica_duracion_categorias',
        label: 'logica_duracion_categorias',
        desc: 'DURATION elige la categoría de la librería con esa duración (ej. 30 → serie 30, 120 → película); cada categoría tiene su tasa. Si VERSION dice REPROSS la fila es reproceso: va en su columna R, con su propia tasa. Ej.: FAST GLOBAL.',
      },
      {
        value: 'logica_bp_i',
        label: 'logica_bp_i',
        desc: 'Minutos = DURATION como número ("10"). Horas = minutos ÷ 60 × tasa. Ej.: BP&I.',
      },
      {
        value: 'logica_comerciales',
        label: 'logica_comerciales',
        desc: 'Minutos = DURATION como tiempo ("00:00:30:00"). Horas = cantidad de piezas × tasa (cómo calcular está pendiente de la reunión con TQC). Ej.: COMERCIALES.',
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
        label: 'logica_youtube',
        desc: 'Cuenta CLIPS y SHORTS por editor. Horas = cantidad × tasa. Ej.: YOUTUBE.',
      },
    ],
  },
];

/** Familia a la que pertenece una lógica (o null si no existe). */
export const familyOf = (logica) =>
  LOGICA_FAMILIES.find((f) => f.options.some((o) => o.value === logica)) || null;
