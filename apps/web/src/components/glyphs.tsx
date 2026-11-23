/**
 * Glifos propios de la navegación (solo se ven en el móvil, donde no caben los textos).
 * Dibujados para este juego en una sola línea de 1,6 con remates rectos:
 * el obelisco del emblema, un camafeo, una foto con su recorte y una puerta.
 */
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'square' as const,
  strokeLinejoin: 'miter' as const,
  'aria-hidden': true,
};

/** Menú: el obelisco sobre su basa. */
export function GlyphObelisco() {
  return (
    <svg {...base}>
      <path d="M12 2.6 13.8 5.6 14.7 19.4H9.3L10.2 5.6Z" />
      <path d="M10.2 5.6h3.6M7.4 19.4h9.2v2H7.4z" />
    </svg>
  );
}

/** Personajes: un camafeo de perfil dentro de su óvalo. */
export function GlyphCamafeo() {
  return (
    <svg {...base}>
      <ellipse cx="12" cy="12" rx="8" ry="9.6" />
      <path d="M9.6 18.4c0-1.4.4-2.6 1-3.3-1.3-.9-1.8-2.5-1.4-4.1.5-1.9 2.2-3 4-2.6 1.3.3 2.1 1.3 2.2 2.6l.9 1.5-.8.4.1 1.2c0 .8-.7 1.1-1.5 1l-.4 1.6" />
    </svg>
  );
}

/** Fotos: una foto con el recorte circular del retrato. */
export function GlyphFoto() {
  return (
    <svg {...base}>
      <path d="M3.6 5.4h16.8v13.2H3.6z" />
      <circle cx="12" cy="11.6" r="3.4" />
      <path d="M7.4 18.6c.8-2 2.6-3.2 4.6-3.2s3.8 1.2 4.6 3.2" />
    </svg>
  );
}

/** Salir: una puerta entreabierta. */
export function GlyphPuerta() {
  return (
    <svg {...base}>
      <path d="M5.6 20.6V3.4h10v4.2" />
      <path d="M5.6 3.4 12 5.6v16.8l-6.4-1.8z" />
      <path d="M3.2 20.6h4.4M15.6 12.4v8.2h-3.6" />
      <path d="M9.7 13.2v.4" />
    </svg>
  );
}
