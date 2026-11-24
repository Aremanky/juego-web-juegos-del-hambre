import type { Atlas } from './props';

/**
 * El Obelisco de la explanada: zócalo de tres gradas, fuste de dos caras (la del oeste iluminada),
 * filetes dorados y una brasa en la punta que respira y suelta pavesas; de noche alumbra más.
 * Coordenadas: (x, y) es el centro de su casilla en píxeles de pantalla y `s` los píxeles por casilla.
 */
const STEP = 0.14;

function tiers(): { w: number; yb: number; d: number }[] {
  const out: { w: number; yb: number; d: number }[] = [];
  let yb = 0.62;
  for (let k = 0; k < 3; k++) {
    const w = 1.5 - k * 0.36;
    const d = w * 0.42;
    out.push({ w, yb, d });
    const nw = 1.5 - (k + 1) * 0.36;
    yb = yb - STEP - (d - nw * 0.42) / 2;
  }
  return out;
}

const SHAFT_H = 3.3;

function topOfShaft() {
  const t = tiers()[2];
  return t.yb - STEP - t.d / 2 - SHAFT_H - 0.36;
}

export function drawObelisk(g: CanvasRenderingContext2D, x: number, y: number, s: number, atlas: Atlas | null, holo = false) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  if (holo) {
    // Silueta en turquesa para el holograma de la Ciudadela.
    const top = tiers()[2];
    const base = top.yb - STEP - top.d / 2;
    g.strokeStyle = 'rgba(95,227,208,0.9)';
    g.fillStyle = 'rgba(95,227,208,0.12)';
    g.lineWidth = 0.05;
    for (const t of tiers()) {
      g.beginPath();
      g.rect(-t.w / 2, t.yb - STEP - t.d, t.w, t.d + STEP);
      g.fill();
      g.stroke();
    }
    g.beginPath();
    g.moveTo(-0.22, base);
    g.lineTo(-0.135, base - SHAFT_H);
    g.lineTo(0, base - SHAFT_H - 0.36);
    g.lineTo(0.135, base - SHAFT_H);
    g.lineTo(0.22, base);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    return;
  }
  // Sombra larga hacia el sureste, como la del resto de objetos.
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath();
  g.moveTo(-0.5, 0.5);
  g.lineTo(0.6, 0.62);
  g.lineTo(0.42 + 3.6 * 0.75, 0.62 + 3.6 * 0.38);
  g.lineTo(0.12 + 3.6 * 0.75, 0.5 + 3.6 * 0.38);
  g.closePath();
  g.fill();
  const sprite = atlas?.sprites['obelisk:0'];
  if (sprite && atlas) {
    const w = 1.7 / (sprite.foot ?? 1);
    const h = (w * sprite.h) / sprite.w;
    g.drawImage(atlas.sheets[sprite.sheet], sprite.x, sprite.y, sprite.w, sprite.h, -w / 2, 0.66 - h, w, h);
    g.restore();
    return;
  }
  for (const t of tiers()) {
    g.fillStyle = '#8f8670';
    g.fillRect(-t.w / 2, t.yb - STEP, t.w, STEP);
    g.fillStyle = '#6f6754';
    g.fillRect(t.w * 0.18, t.yb - STEP, t.w * 0.32, STEP);
    g.fillStyle = '#bfb49a';
    g.fillRect(-t.w / 2, t.yb - STEP - t.d, t.w, t.d);
    g.fillStyle = 'rgba(255,245,220,0.25)';
    g.fillRect(-t.w / 2, t.yb - STEP - t.d, t.w, 0.03);
  }
  const top = tiers()[2];
  const base = top.yb - STEP - top.d / 2;
  const bw = 0.44;
  const tw = 0.27;
  const sy = base - SHAFT_H;
  // Cara oeste (luz) y cara sur (sombra).
  g.fillStyle = '#ddd2ba';
  g.beginPath();
  g.moveTo(-bw / 2, base);
  g.lineTo(0.02, base + 0.04);
  g.lineTo(0.02, sy);
  g.lineTo(-tw / 2, sy);
  g.closePath();
  g.fill();
  g.fillStyle = '#9e937d';
  g.beginPath();
  g.moveTo(0.02, base + 0.04);
  g.lineTo(bw / 2, base);
  g.lineTo(tw / 2, sy);
  g.lineTo(0.02, sy);
  g.closePath();
  g.fill();
  // Filetes dorados.
  g.strokeStyle = 'rgba(230,201,126,0.75)';
  g.lineWidth = 0.025;
  g.beginPath();
  g.moveTo(-bw / 4, base - 0.1);
  g.lineTo(-tw / 4, sy + 0.25);
  g.moveTo(bw / 4 + 0.01, base - 0.1);
  g.lineTo(tw / 4 + 0.01, sy + 0.25);
  for (const k of [0.18, 0.26]) {
    const yy = sy + k;
    const half = tw / 2 + (bw - tw) * (k / SHAFT_H) * 0.5;
    g.moveTo(-half, yy);
    g.lineTo(half, yy);
  }
  g.stroke();
  // Piramidión.
  const ay = sy - 0.36;
  g.fillStyle = '#e8dcc0';
  g.beginPath();
  g.moveTo(-tw / 2, sy);
  g.lineTo(0, ay);
  g.lineTo(0.02, sy);
  g.closePath();
  g.fill();
  g.fillStyle = '#a89a7e';
  g.beginPath();
  g.moveTo(0.02, sy);
  g.lineTo(0, ay);
  g.lineTo(tw / 2, sy);
  g.closePath();
  g.fill();
  g.fillStyle = '#f26a2e';
  g.beginPath();
  g.arc(0, ay, 0.07, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** Brillo de la brasa y pavesas: va después de la capa de noche para que se vea encendida. */
export function drawObeliskGlow(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, darkness: number) {
  const ay = y + topOfShaft() * s;
  const pulse = 0.85 + Math.sin(t / 700) * 0.15;
  g.save();
  g.globalCompositeOperation = 'lighter';
  const r = s * (0.55 + darkness * 1.1) * pulse;
  const grad = g.createRadialGradient(x, ay, 0, x, ay, r);
  grad.addColorStop(0, `rgba(255,160,80,${(0.55 + darkness * 0.35) * pulse})`);
  grad.addColorStop(0.35, `rgba(242,106,46,${0.22 + darkness * 0.25})`);
  grad.addColorStop(1, 'rgba(242,106,46,0)');
  g.fillStyle = grad;
  g.fillRect(x - r, ay - r, r * 2, r * 2);
  for (let i = 0; i < 6; i++) {
    const ph = (t / 1700 + i / 6) % 1;
    const px = x + (Math.sin(i * 1.7 + t / 900) * 0.16 + ph * 0.12) * s;
    const py = ay - ph * 1.3 * s;
    g.fillStyle = `rgba(255,190,110,${((1 - ph) * 0.85).toFixed(3)})`;
    g.beginPath();
    g.arc(px, py, Math.max(0.8, s * 0.035), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}
