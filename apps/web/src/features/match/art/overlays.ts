/**
 * Lo que se dibuja encima del mapa para moverse y para recordar (GDD §7.4 y §7.5): la ruta prevista con su
 * tiempo y las marcas de «visto por última vez». Aparte de `MapCanvas` para poder verlo con el mapa real
 * fuera de React.
 */
import type { ActorView } from '@ceniza/shared';
import type { LastSeen } from '../../../stores/sight';
import type { HitBox } from '../pick';
import { formatDuration, formatEta, type Preview } from '../plan';

/** Dónde cae el mapa en pantalla: origen, píxeles por casilla y tamaño de la vista (px CSS). */
export interface MapFrame {
  ox: number;
  oy: number;
  s: number;
  w: number;
  h: number;
}

const LABEL_FONT = '600 12px "Archivo Variable", Archivo, sans-serif';
const NOTE_FONT = '500 12px "Archivo Variable", Archivo, sans-serif';

/** Texto con halo, como los rótulos del mapa (sin cajas). */
export function haloText(g: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, stroke: string) {
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.strokeStyle = stroke;
  g.lineWidth = 3.5;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

const haloInk = (holo: boolean) => (holo ? 'rgba(2,12,11,0.9)' : 'rgba(10,12,13,0.88)');

/** Ruta prevista: más fina y tenue que la real, con un anillo en el destino. `from`: dónde estás ahora. */
export function drawRoutePreview(g: CanvasRenderingContext2D, p: Preview, from: { x: number; y: number }, now: number, m: MapFrame, holo: boolean) {
  const ink = p.error !== null ? 'rgba(230,201,126,0.9)' : holo ? 'rgba(95,227,208,0.8)' : 'rgba(239,231,218,0.72)';
  g.save();
  g.strokeStyle = ink;
  g.lineWidth = 1.75;
  if (p.route) {
    const r = p.route;
    g.setLineDash([2, 6]);
    g.beginPath();
    g.moveTo(m.ox + (from.x + 0.5) * m.s, m.oy + (from.y + 0.5) * m.s);
    for (let i = 1; i < r.times.length; i++) if (r.times[i] > now) g.lineTo(m.ox + (r.cells[i * 2] + 0.5) * m.s, m.oy + (r.cells[i * 2 + 1] + 0.5) * m.s);
    g.stroke();
    g.setLineDash([]);
  }
  g.beginPath();
  g.ellipse(m.ox + (p.x + 0.5) * m.s, m.oy + (p.y + 0.5) * m.s, m.s * 0.34, m.s * 0.2, 0, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

/** El tiempo hasta el destino previsto (o por qué no se puede), encima del anillo, como un rótulo más. */
export function drawPreviewLabel(g: CanvasRenderingContext2D, p: Preview, m: MapFrame, holo: boolean) {
  const text = p.error !== null ? (p.error.startsWith('Demasiado') ? 'Demasiado lejos' : p.error) : formatEta(p.eta);
  g.save();
  g.font = LABEL_FONT;
  haloText(g, text, m.ox + (p.x + 0.5) * m.s, m.oy + (p.y + 0.5) * m.s - Math.max(14, m.s * 0.5), p.error !== null ? '#e6c97e' : holo ? '#5fe3d0' : '#f3ece0', haloInk(holo));
  g.restore();
}

/**
 * «Visto por última vez»: un anillo discontinuo de su color donde lo viste, su nombre y hace cuánto. El
 * anillo se atenúa con los minutos; el texto, poco, para que se siga leyendo. Devuelve su caja de toque.
 */
export function drawLastSeen(g: CanvasRenderingContext2D, a: ActorView, seen: LastSeen, now: number, m: MapFrame, fig: number, holo: boolean): HitBox | null {
  const x = m.ox + (seen.x + 0.5) * m.s;
  const y = m.oy + (seen.y + 0.75) * m.s;
  if (x < -80 || y < -60 || x > m.w + 80 || y > m.h + 60) return null;
  const age = Math.max(0, now - seen.at);
  const fade = Math.min(1, age / 120_000);
  g.save();
  g.globalAlpha = 1 - 0.6 * fade;
  // Un trazo oscuro debajo, como el halo de los rótulos, para que el anillo se vea sobre el bosque.
  g.beginPath();
  g.ellipse(x, y, fig * 0.26, fig * 0.1, 0, 0, Math.PI * 2);
  g.strokeStyle = haloInk(holo);
  g.lineWidth = 4;
  g.stroke();
  g.strokeStyle = holo ? '#5fe3d0' : a.color;
  g.lineWidth = 2;
  g.setLineDash([4, 4]);
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 1 - 0.25 * fade;
  g.font = LABEL_FONT;
  haloText(g, a.name, x, y - 22, holo ? '#5fe3d0' : '#d9d0c2', haloInk(holo));
  g.font = NOTE_FONT;
  haloText(g, `hace ${formatDuration(age)}`, x, y - 8, holo ? '#9fe9dc' : '#b3aa9c', haloInk(holo));
  g.restore();
  return { id: a.id, x, top: y - 30, bottom: y + 6, half: Math.max(26, fig * 0.3) };
}
