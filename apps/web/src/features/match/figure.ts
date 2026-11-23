import type { Appearance } from '@ceniza/shared';

/**
 * Personaje animado del mapa (GDD §5.9): un esqueleto 2D de piezas (piernas, torso, brazos, cabeza y
 * pelo) que se mueven por ángulos, así cualquier combinación de apariencia sirve para todas las
 * animaciones. Vista cenital en 3/4: de frente, de espaldas y de lado (el otro lado es el espejo).
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

function limb(g: CanvasRenderingContext2D, x: number, y: number, len: number, w: number, angle: number, color: string) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(-w / 2, 0, w, len, w / 2);
  g.fill();
  g.restore();
}

function hair(g: CanvasRenderingContext2D, look: Appearance, hx: number, hy: number, r: number, facing: Facing) {
  const back = facing === 'N';
  const side = facing === 'E' || facing === 'W';
  g.fillStyle = look.hair;
  const cap = (extra = 0) => {
    g.beginPath();
    if (back) g.arc(hx, hy, r * 1.04 + extra, 0, Math.PI * 2);
    else if (side) g.arc(hx - r * 0.18, hy - r * 0.12, r * 1.02 + extra, Math.PI * 0.72, Math.PI * 2.08);
    else g.arc(hx, hy - r * 0.15, r * 1.02 + extra, Math.PI * 0.95, Math.PI * 2.05);
    g.fill();
  };
  switch (look.hairStyle) {
    case 'rapado':
      g.fillStyle = look.skinShade;
      cap();
      break;
    case 'capucha':
      g.fillStyle = look.trim;
      g.beginPath();
      g.arc(hx, hy, r * 1.22, back ? 0 : Math.PI * 0.85, back ? Math.PI * 2 : Math.PI * 2.15);
      g.fill();
      break;
    case 'rizos':
      for (let k = 0; k < 5; k++) {
        const a = Math.PI * (1.05 + (k * 0.9) / 4);
        g.beginPath();
        g.arc(hx + Math.cos(a) * r * 0.82, hy + Math.sin(a) * r * 0.82, r * 0.42, 0, Math.PI * 2);
        g.fill();
      }
      if (back) cap(-r * 0.1);
      break;
    case 'cresta':
      g.fillStyle = look.skinShade;
      cap(-r * 0.05);
      g.fillStyle = look.hair;
      g.beginPath();
      g.roundRect(hx - r * 0.2, hy - r * 1.35, r * 0.4, r * (back ? 2.1 : 1), r * 0.2);
      g.fill();
      break;
    default:
      cap();
  }
  // Lo que cae por detrás o por los lados.
  g.fillStyle = look.hairShade;
  if (look.hairStyle === 'melena' && (back || side)) {
    g.beginPath();
    g.roundRect(hx - r * (side ? 0.9 : 1), hy - r * 0.1, r * (side ? 1.1 : 2), r * 1.5, r * 0.4);
    g.fill();
  } else if (look.hairStyle === 'mono') {
    g.beginPath();
    g.arc(hx + (side ? -r * 0.85 : 0), hy - r * (side ? 0.55 : 1.05), r * 0.42, 0, Math.PI * 2);
    g.fill();
  } else if ((look.hairStyle === 'coleta' || look.hairStyle === 'trenza') && (back || side)) {
    const x0 = hx + (side ? -r * 0.95 : 0);
    g.beginPath();
    g.roundRect(x0 - r * 0.22, hy - r * 0.2, r * 0.44, r * (look.hairStyle === 'trenza' ? 1.9 : 1.4), r * 0.22);
    g.fill();
  }
}

/** Dibuja la figura con los pies en (x, y) y una altura de `h` píxeles. */
export function drawFigure(g: CanvasRenderingContext2D, look: Appearance, x: number, y: number, h: number, pose: Pose) {
  const mirror = pose.facing === 'W';
  const side = pose.facing === 'E' || pose.facing === 'W';
  const back = pose.facing === 'N';
  const speed = pose.running ? 0.019 : 0.011;
  const phase = pose.moving ? pose.t * speed : 0;
  const swing = pose.moving ? Math.sin(phase) : 0;
  const bob = pose.moving ? Math.abs(Math.sin(phase)) * h * 0.035 : Math.sin(pose.t * 0.003) * h * 0.008;
  const bw = look.build;

  g.save();
  g.translate(x, y);
  if (pose.dead) {
    g.rotate(Math.PI / 2);
    g.globalAlpha *= 0.7;
    g.filter = 'grayscale(0.85)';
  }
  if (mirror) g.scale(-1, 1);
  const jump = pose.celebrating ? Math.abs(Math.sin(pose.t * 0.008)) * h * 0.12 : 0;
  const squat = pose.crouched ? 0.78 : 1;
  g.translate(0, -jump);
  g.scale(1, squat);

  const legLen = h * 0.36;
  const hipY = -legLen;
  const shoulderY = -h * 0.66 - bob;
  const torsoW = h * 0.26 * bw;
  const limbW = h * 0.1 * bw;
  const headR = h * 0.13;
  const headY = shoulderY - headR * 1.05;

  if (!pose.swimming) {
    // Piernas: de lado oscilan adelante y atrás; de frente o de espaldas, se alternan al pisar.
    const pants = look.trim;
    if (side) {
      limb(g, -torsoW * 0.1, hipY - bob, legLen, limbW, swing * 0.55, pants);
      limb(g, torsoW * 0.1, hipY - bob, legLen, limbW, -swing * 0.55, pants);
    } else {
      const lift = h * 0.06;
      limb(g, -torsoW * 0.26, hipY - bob, legLen - Math.max(0, swing) * lift, limbW, 0, pants);
      limb(g, torsoW * 0.26, hipY - bob, legLen - Math.max(0, -swing) * lift, limbW, 0, pants);
    }
  }
  // Brazo de atrás.
  const armLen = h * 0.31;
  const armSwing = pose.celebrating ? -2.6 : pose.moving ? -swing * 0.65 : 0.08;
  if (side) limb(g, torsoW * 0.05, shoulderY + h * 0.02, armLen, limbW * 0.9, -armSwing, look.skinShade);
  // Torso con el ribete del distrito.
  g.fillStyle = look.outfit;
  g.beginPath();
  g.roundRect(-torsoW / 2, shoulderY, torsoW, hipY - bob - shoulderY + h * 0.02, torsoW * 0.32);
  g.fill();
  g.fillStyle = look.trim;
  g.fillRect(-torsoW / 2, hipY - bob - h * 0.05, torsoW, h * 0.045);
  if (!side) {
    limb(g, -torsoW / 2 - limbW * 0.15, shoulderY + h * 0.02, armLen, limbW * 0.9, pose.celebrating ? 2.7 : armSwing * 0.5 + 0.12, look.skin);
    limb(g, torsoW / 2 + limbW * 0.15, shoulderY + h * 0.02, armLen, limbW * 0.9, pose.celebrating ? -2.7 : -armSwing * 0.5 - 0.12, look.skin);
  }
  // Cabeza.
  g.fillStyle = look.skin;
  g.beginPath();
  g.arc(0, headY, headR, 0, Math.PI * 2);
  g.fill();
  if (!back) {
    g.fillStyle = 'rgba(20,14,10,0.85)';
    const eye = Math.max(0.8, headR * 0.16);
    if (side) {
      g.beginPath();
      g.arc(headR * 0.45, headY - headR * 0.05, eye, 0, Math.PI * 2);
      g.fill();
    } else if (!pose.dead) {
      for (const ex of [-0.38, 0.38]) {
        g.beginPath();
        g.arc(ex * headR, headY - headR * 0.05, eye, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  hair(g, look, 0, headY, headR, pose.facing);
  // Brazo de delante (de lado).
  if (side) limb(g, -torsoW * 0.05, shoulderY + h * 0.02, armLen, limbW * 0.9, armSwing, look.skin);
  g.restore();
  g.filter = 'none';
}
