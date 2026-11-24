import { darken, lighten, type Appearance } from '@ceniza/shared';

/**
 * Personaje animado del mapa (GDD §5.9): figura de proporciones de juego (cabeza grande, cuerpo corto)
 * dibujada por piezas sobre un esqueleto, así cualquier combinación de piel, peinado, ropa y complemento
 * sirve para todas las animaciones. Vista cenital en 3/4: de frente, de espaldas y de lado (el oeste es
 * el espejo del este). Sombreado a dos tonos con la luz del noroeste, como el resto del mapa, y un
 * contorno fino para que se lea sobre cualquier terreno.
 *
 * Se dibuja en un sistema de 100 unidades de alto con los pies en (0, 0).
 */
export type Facing = 'S' | 'N' | 'E' | 'W';

export interface Pose {
  facing: Facing;
  /** ms, para las animaciones. */
  t: number;
  moving: boolean;
  running: boolean;
  swimming: boolean;
  /** Agachado entre la maleza, quieto. */
  crouched: boolean;
  dead: boolean;
  celebrating: boolean;
}

interface Palette {
  skin: string;
  skinD: string;
  hair: string;
  hairD: string;
  hairL: string;
  cloth: string;
  clothD: string;
  clothL: string;
  trim: string;
  trimD: string;
  pants: string;
  pantsD: string;
  boots: string;
}

const palettes = new WeakMap<Appearance, Palette>();
function palette(a: Appearance): Palette {
  let p = palettes.get(a);
  if (!p) {
    p = {
      skin: a.skin,
      skinD: a.skinShade,
      hair: a.hair,
      hairD: a.hairShade,
      hairL: lighten(a.hair, 0.22),
      cloth: a.outfit,
      clothD: darken(a.outfit, 0.3),
      clothL: lighten(a.outfit, 0.18),
      trim: a.trim,
      trimD: darken(a.trim, 0.3),
      pants: a.pants,
      pantsD: darken(a.pants, 0.3),
      boots: a.boots,
    };
    palettes.set(a, p);
  }
  return p;
}

const INK = 'rgba(20,14,10,0.72)';
const LINE = 2.4;

function shape(g: CanvasRenderingContext2D, fill: string, build: () => void, outline = true) {
  g.beginPath();
  build();
  g.fillStyle = fill;
  g.fill();
  if (outline) {
    g.strokeStyle = INK;
    g.lineWidth = LINE;
    g.stroke();
  }
}

/** Pierna desde la cadera (x, y) con ángulo y largo; la bota al final. */
function leg(g: CanvasRenderingContext2D, P: Palette, x: number, y: number, len: number, angle: number, w: number, dark: boolean) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  shape(g, dark ? P.pantsD : P.pants, () => g.roundRect(-w / 2, 0, w, len - 7, 3));
  shape(g, P.boots, () => g.roundRect(-w / 2 - 0.5, len - 10, w + 1, 10, [2, 2, 3, 3]));
  g.restore();
}

/** Brazo desde el hombro: manga y mano. */
function arm(g: CanvasRenderingContext2D, P: Palette, x: number, y: number, len: number, angle: number, sleeve: string, dark: boolean) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  shape(g, dark ? darken(sleeve, 0.22) : sleeve, () => g.roundRect(-4.6, -1, 9.2, len - 5, 4.6));
  shape(g, dark ? P.skinD : P.skin, () => g.arc(0, len - 3.5, 4.4, 0, Math.PI * 2));
  g.restore();
}

function hairBack(g: CanvasRenderingContext2D, a: Appearance, P: Palette, hy: number, r: number, view: 'front' | 'back' | 'side') {
  // Lo que queda detrás de la cabeza (melena, trenza, coleta, capucha).
  const s = a.hairStyle;
  if (s === 'melena' && view !== 'back') shape(g, P.hairD, () => g.roundRect(-r * (view === 'side' ? 1.05 : 1.08), hy - r * 0.2, r * (view === 'side' ? 1.3 : 2.16), r * 1.55, r * 0.5));
  if (s === 'capucha') shape(g, P.trimD, () => g.arc(view === 'side' ? -2 : 0, hy + 1, r * 1.28, 0, Math.PI * 2));
}

function hairFront(g: CanvasRenderingContext2D, a: Appearance, P: Palette, hy: number, r: number, view: 'front' | 'back' | 'side') {
  const s = a.hairStyle;
  const cap = (top: number, color: string, extra = 0) =>
    shape(g, color, () => {
      if (view === 'back') g.arc(0, hy, r + 1 + extra, 0, Math.PI * 2);
      else if (view === 'side') {
        g.arc(-1.5, hy - 1, r + 1 + extra, Math.PI * 0.62, Math.PI * 1.95);
        g.quadraticCurveTo(r * 0.6, hy - r * top, r * 0.2, hy - r * 0.15);
        g.closePath();
      } else {
        g.arc(0, hy - 1.5, r + 1 + extra, Math.PI * 0.92, Math.PI * 2.08);
        g.quadraticCurveTo(r * 0.4, hy - r * top, 0, hy - r * 0.45);
        g.quadraticCurveTo(-r * 0.5, hy - r * top, -r - 1, hy - 1);
        g.closePath();
      }
    });
  switch (s) {
    case 'rapado':
      cap(0.55, P.skinD);
      break;
    case 'capucha':
      shape(g, P.trim, () => {
        if (view === 'back') g.arc(0, hy, r * 1.25, 0, Math.PI * 2);
        else {
          g.arc(view === 'side' ? -2 : 0, hy, r * 1.25, Math.PI * (view === 'side' ? 0.55 : 0.82), Math.PI * (view === 'side' ? 2.0 : 2.18));
          g.closePath();
        }
      });
      g.strokeStyle = P.trimD;
      g.lineWidth = 2;
      g.beginPath();
      if (view !== 'back') g.arc(view === 'side' ? -2 : 0, hy + 1, r * 1.02, Math.PI * (view === 'side' ? 1.2 : 1.05), Math.PI * (view === 'side' ? 1.95 : 1.95));
      g.stroke();
      break;
    case 'rizos': {
      const n = view === 'back' ? 8 : 6;
      g.beginPath();
      for (let k = 0; k < n; k++) {
        const ang = view === 'back' ? (k / n) * Math.PI * 2 : Math.PI * (0.95 + (k * 1.1) / (n - 1));
        const cx = (view === 'side' ? -2 : 0) + Math.cos(ang) * r * 0.9;
        const cy = hy - 1 + Math.sin(ang) * r * 0.9;
        g.moveTo(cx + r * 0.45, cy);
        g.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
      }
      g.fillStyle = P.hair;
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.stroke();
      if (view === 'back') cap(0.4, P.hair, -2);
      break;
    }
    case 'cresta':
      cap(0.5, P.skinD, -1);
      shape(g, P.hair, () => g.roundRect(view === 'side' ? -r * 0.4 : -3.2, hy - r - 7, view === 'side' ? r * 1.2 : 6.4, view === 'back' ? r * 2.2 : 10, 3));
      break;
    default:
      cap(s === 'corto' ? 0.7 : 0.55, P.hair);
  }
  // Brillo del pelo (luz del noroeste).
  if (s !== 'rapado' && s !== 'capucha') {
    g.strokeStyle = P.hairL;
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(view === 'side' ? -3 : -2, hy - 2, r * 0.72, Math.PI * 1.15, Math.PI * 1.45);
    g.stroke();
  }
  // Piezas que asoman.
  if (s === 'mono') shape(g, P.hair, () => g.arc(view === 'side' ? -r * 0.9 : 0, hy - r * (view === 'side' ? 0.55 : 1.05), r * 0.42, 0, Math.PI * 2));
  if ((s === 'coleta' || s === 'trenza') && view !== 'front') {
    const x0 = view === 'side' ? -r * 1.05 : 0;
    shape(g, P.hairD, () => g.roundRect(x0 - 3, hy - 2, 6, s === 'trenza' ? r * 2 : r * 1.5, 3));
    if (s === 'trenza') {
      g.strokeStyle = INK;
      g.lineWidth = 1.2;
      g.beginPath();
      for (let k = 1; k < 4; k++) {
        g.moveTo(x0 - 3, hy - 2 + k * r * 0.45);
        g.lineTo(x0 + 3, hy - 2 + k * r * 0.45 + 2);
      }
      g.stroke();
    }
  }
  if (a.accessory === 'cinta' && s !== 'capucha') {
    g.strokeStyle = P.trim;
    g.lineWidth = 3;
    g.beginPath();
    if (view === 'side') g.arc(-1.5, hy - 1, r + 0.5, Math.PI * 1.02, Math.PI * 1.9);
    else g.arc(0, hy - 1, r + 0.5, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
  }
}

function face(g: CanvasRenderingContext2D, P: Palette, hy: number, r: number, view: 'front' | 'side', blink: boolean, dead: boolean) {
  g.fillStyle = 'rgba(28,18,14,0.92)';
  g.strokeStyle = 'rgba(28,18,14,0.92)';
  g.lineWidth = 1.6;
  const eye = (x: number) => {
    if (dead) {
      g.beginPath();
      g.moveTo(x - 2, hy - 1);
      g.lineTo(x + 2, hy + 3);
      g.moveTo(x + 2, hy - 1);
      g.lineTo(x - 2, hy + 3);
      g.stroke();
    } else if (blink) {
      g.beginPath();
      g.moveTo(x - 2.2, hy + 1.5);
      g.lineTo(x + 2.2, hy + 1.5);
      g.stroke();
    } else {
      g.beginPath();
      g.ellipse(x, hy + 1.2, 1.9, 2.6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      g.arc(x - 0.6, hy + 0.2, 0.7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(28,18,14,0.92)';
    }
  };
  if (view === 'front') {
    eye(-r * 0.36);
    eye(r * 0.36);
    // Mejillas.
    g.fillStyle = 'rgba(200,90,70,0.18)';
    g.beginPath();
    g.ellipse(-r * 0.55, hy + r * 0.38, 2.6, 1.5, 0, 0, Math.PI * 2);
    g.ellipse(r * 0.55, hy + r * 0.38, 2.6, 1.5, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    eye(r * 0.5);
    g.strokeStyle = P.skinD;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(r * 0.95, hy + 2);
    g.lineTo(r * 1.08, hy + 4);
    g.lineTo(r * 0.92, hy + 5);
    g.stroke();
  }
}

/** Torso con la prenda elegida; devuelve el color de las mangas. */
function torso(g: CanvasRenderingContext2D, a: Appearance, P: Palette, top: number, hip: number, w: number, view: 'front' | 'back' | 'side'): string {
  const style = a.outfitStyle;
  const hw = w / 2;
  const hem = style === 'tunica' ? hip + 9 : style === 'vestido' ? hip + 15 : hip + 2;
  const flare = style === 'vestido' ? 6 : style === 'tunica' ? 2 : 0;
  shape(g, P.cloth, () => {
    g.moveTo(-hw + 2, top);
    g.quadraticCurveTo(-hw - 1, top + 2, -hw, top + 8);
    g.lineTo(-hw - flare, hem);
    g.lineTo(hw + flare, hem);
    g.lineTo(hw, top + 8);
    g.quadraticCurveTo(hw + 1, top + 2, hw - 2, top);
    g.closePath();
  });
  // Lado en sombra (este).
  g.fillStyle = P.clothD;
  g.globalAlpha = 0.55;
  g.beginPath();
  g.moveTo(hw * 0.35, top + 1);
  g.lineTo(hw - 1, top + 4);
  g.lineTo(hw + flare - 1, hem - 1);
  g.lineTo(hw * 0.35 + flare * 0.4, hem - 1);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
  // Detalles de cada prenda.
  if (style === 'chaqueta' && view === 'front') {
    shape(g, lighten(a.trim, 0.35), () => {
      g.moveTo(-3.5, top);
      g.lineTo(3.5, top);
      g.lineTo(2, hem);
      g.lineTo(-2, hem);
      g.closePath();
    }, false);
    g.strokeStyle = P.clothD;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-3.5, top);
    g.lineTo(-6, top + 9);
    g.moveTo(3.5, top);
    g.lineTo(6, top + 9);
    g.stroke();
  }
  if (style === 'peto') {
    g.strokeStyle = 'rgba(255,240,210,0.35)';
    g.lineWidth = 1.1;
    g.setLineDash([2, 2]);
    g.beginPath();
    g.roundRect(-hw + 4, top + 5, w - 8, hip - top - 6, 3);
    g.stroke();
    g.setLineDash([]);
    if (view !== 'side') {
      shape(g, P.trim, () => g.ellipse(-hw + 1, top + 3, 6.5, 4.5, 0, 0, Math.PI * 2));
      shape(g, P.trim, () => g.ellipse(hw - 1, top + 3, 6.5, 4.5, 0, 0, Math.PI * 2));
    } else shape(g, P.trim, () => g.ellipse(1, top + 3, 6.5, 4.5, 0, 0, Math.PI * 2));
  }
  if (style === 'tunica' && view === 'front') {
    shape(g, P.trim, () => {
      g.moveTo(-5, top);
      g.lineTo(0, top + 8);
      g.lineTo(5, top);
      g.closePath();
    }, false);
  }
  // Cinturón o fajín.
  if (style !== 'capa' || view === 'side') {
    shape(g, style === 'vestido' ? P.trim : darken(P.boots, -0.2), () => g.rect(-hw - (style === 'vestido' ? 1 : 0), hip - 3, w + (style === 'vestido' ? 2 : 0), 4.5), false);
    if (view === 'front' && style !== 'vestido') shape(g, '#d8b45a', () => g.rect(-2.2, hip - 3.5, 4.4, 5.5), false);
  }
  return style === 'peto' ? lighten(a.pants, 0.25) : style === 'chaqueta' ? P.cloth : style === 'capa' ? lighten(a.trim, 0.3) : P.cloth;
}

/** Dibuja la figura con los pies en (x, y) y una altura de `h` píxeles. */
export function drawFigure(g: CanvasRenderingContext2D, look: Appearance, x: number, y: number, h: number, pose: Pose) {
  const P = palette(look);
  const view: 'front' | 'back' | 'side' = pose.facing === 'N' ? 'back' : pose.facing === 'S' ? 'front' : 'side';
  const speed = pose.running ? 0.019 : 0.011;
  const ph = pose.moving ? pose.t * speed : 0;
  const swing = pose.moving ? Math.sin(ph) : 0;
  const bob = pose.moving ? Math.abs(Math.sin(ph)) * 2.6 : Math.sin(pose.t * 0.003) * 0.7;
  const blink = !pose.moving && pose.t % 4300 < 120;
  const bw = look.build;

  g.save();
  g.translate(x, y);
  const k = (h / 100) * look.height;
  g.scale(k, k);
  if (pose.dead) {
    g.translate(0, -8);
    g.rotate(Math.PI / 2);
    g.globalAlpha *= 0.75;
    g.filter = 'grayscale(0.85)';
  }
  if (pose.facing === 'W') g.scale(-1, 1);
  if (pose.celebrating) g.translate(0, -Math.abs(Math.sin(pose.t * 0.008)) * 12);
  if (pose.crouched) g.scale(1, 0.78);
  g.lineJoin = 'round';
  g.lineCap = 'round';

  const hip = -33 - bob;
  const top = -60 - bob;
  const w = 28 * bw;
  const headR = 16.5;
  const hy = top - headR + 1;
  const lean = pose.running && view === 'side' ? 0.1 : 0;
  const capeColor = look.outfitStyle === 'capa' ? P.cloth : null;

  // Capa por detrás (de frente se ve por los lados; de lado ondea).
  if (capeColor && view !== 'back') {
    const flap = pose.moving ? Math.sin(ph * 0.5) * 3 + (pose.running ? 6 : 3) : 0;
    shape(g, P.clothD, () => {
      if (view === 'side') {
        g.moveTo(-4, top + 1);
        g.quadraticCurveTo(-14 - flap, top + 18, -10 - flap * 1.4, -12);
        g.lineTo(2, -14);
        g.closePath();
      } else {
        g.moveTo(-w / 2 - 1, top + 2);
        g.lineTo(-w / 2 - 6, -14);
        g.lineTo(w / 2 + 6, -14);
        g.lineTo(w / 2 + 1, top + 2);
        g.closePath();
      }
    });
  }
  // Mochila o carcaj de lado: detrás del cuerpo.
  if (view === 'side' && look.accessory === 'mochila') shape(g, '#6d5236', () => g.roundRect(-w / 2 - 6, top + 4, 9, 20, 3));
  if (view === 'side' && look.accessory === 'carcaj') shape(g, '#5a4028', () => g.roundRect(-w / 2 - 4, top - 6, 6, 28, 2));

  g.save();
  g.rotate(lean);
  if (!pose.swimming) {
    if (view === 'side') {
      const a = swing * (pose.running ? 0.75 : 0.5);
      leg(g, P, 1, hip, 31, -a, 10.5, true);
      leg(g, P, -1, hip, 31, a, 10.5, false);
    } else {
      const lift = 5;
      const sw = look.outfitStyle === 'mono' ? P.cloth : null;
      const L1 = 31 - Math.max(0, swing) * lift;
      const L2 = 31 - Math.max(0, -swing) * lift;
      if (sw) {
        P.pants = sw;
        P.pantsD = darken(sw, 0.3);
      }
      leg(g, P, -6.5 * bw, hip, L1, 0.03, 10.5, false);
      leg(g, P, 6.5 * bw, hip, L2, -0.03, 10.5, true);
      if (sw) {
        P.pants = look.pants;
        P.pantsD = darken(look.pants, 0.3);
      }
    }
  }
  const armLen = 25;
  const armA = pose.celebrating ? 2.7 : pose.moving ? swing * (pose.running ? 0.9 : 0.6) : 0.06;
  const sleeveGuess = look.outfitStyle === 'peto' ? lighten(look.pants, 0.25) : look.outfitStyle === 'capa' ? lighten(look.trim, 0.3) : look.outfit;
  // Brazo de atrás (de lado).
  if (view === 'side') arm(g, P, 2, top + 3, armLen, armA, sleeveGuess, true);
  const sleeve = torso(g, look, P, top, hip, w, view);
  // Espalda: capa, mochila o carcaj por encima del torso.
  if (view === 'back') {
    if (capeColor) shape(g, P.cloth, () => {
      g.moveTo(-w / 2 - 1, top + 1);
      g.lineTo(-w / 2 - 5, -13);
      g.lineTo(w / 2 + 5, -13);
      g.lineTo(w / 2 + 1, top + 1);
      g.closePath();
    });
    if (look.accessory === 'mochila') shape(g, '#6d5236', () => g.roundRect(-9, top + 5, 18, 20, 4));
    if (look.accessory === 'carcaj') {
      g.save();
      g.rotate(-0.4);
      shape(g, '#5a4028', () => g.roundRect(-3, top - 4, 7, 30, 2));
      g.restore();
    }
  }
  if (view !== 'side') {
    const s1 = pose.celebrating ? 2.7 : 0.12 + (pose.moving ? swing * 0.35 : Math.sin(pose.t * 0.003) * 0.03);
    const s2 = pose.celebrating ? -2.7 : -0.12 + (pose.moving ? swing * 0.35 : -Math.sin(pose.t * 0.003) * 0.03);
    arm(g, P, -w / 2 - 1.5, top + 3, armLen, s1, sleeve, false);
    arm(g, P, w / 2 + 1.5, top + 3, armLen, s2, sleeve, true);
    if (view === 'front' && (look.accessory === 'mochila' || look.accessory === 'carcaj')) {
      g.strokeStyle = '#4a3624';
      g.lineWidth = 2.6;
      g.beginPath();
      if (look.accessory === 'mochila') {
        g.moveTo(-w / 2 + 5, top + 1);
        g.lineTo(-w / 2 + 6, top + 18);
        g.moveTo(w / 2 - 5, top + 1);
        g.lineTo(w / 2 - 6, top + 18);
      } else {
        g.moveTo(w / 2 - 3, top + 1);
        g.lineTo(-w / 2 + 3, hip - 4);
      }
      g.stroke();
    }
  }
  // Cabeza.
  const hx = view === 'side' ? 1 : 0;
  g.save();
  g.translate(hx, 0);
  hairBack(g, look, P, hy, headR, view);
  shape(g, P.skin, () => g.arc(0, hy, headR, 0, Math.PI * 2));
  if (view !== 'back') {
    // Sombra de la cara hacia el este y orejas.
    g.fillStyle = P.skinD;
    g.globalAlpha = 0.6;
    g.beginPath();
    g.arc(0, hy, headR - 1.2, -Math.PI * 0.35, Math.PI * 0.55);
    g.quadraticCurveTo(headR * 0.25, hy + 2, headR * 0.6, hy - headR * 0.8);
    g.fill();
    g.globalAlpha = 1;
    if (view === 'side') shape(g, P.skinD, () => g.ellipse(-3, hy + 2, 3, 4, 0, 0, Math.PI * 2));
    face(g, P, hy, headR, view === 'side' ? 'side' : 'front', blink, pose.dead);
  }
  hairFront(g, look, P, hy, headR, view);
  if (look.accessory === 'carcaj' && view === 'front') {
    // Plumas de las flechas asomando por el hombro.
    g.fillStyle = '#e8dcc0';
    for (const dx of [0, 3.5, 7]) {
      g.beginPath();
      g.moveTo(-headR - 2 + dx, top - 3);
      g.lineTo(-headR + dx, top - 11);
      g.lineTo(-headR + 2 + dx, top - 3);
      g.fill();
    }
  }
  g.restore();
  if (look.accessory === 'bufanda') {
    shape(g, P.trim, () => g.roundRect(-w / 2 + 3, top - 3, w - 6, 7, 3.5));
    if (view !== 'back') shape(g, P.trimD, () => g.roundRect(view === 'side' ? -6 - (pose.moving ? 4 : 0) : 4, top + 2, 5, 13, 2));
  }
  // Brazo de delante (de lado).
  if (view === 'side') arm(g, P, -1, top + 3, armLen, -armA, sleeve, false);
  g.restore();
  g.restore();
  g.filter = 'none';
}
