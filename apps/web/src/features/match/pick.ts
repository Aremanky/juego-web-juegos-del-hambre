/** Caja de toque de un personaje (o de su marca) en píxeles de pantalla: de la coronilla a los pies. */
export interface HitBox {
  id: string;
  x: number;
  top: number;
  bottom: number;
  half: number;
}

/** Qué personaje hay bajo el punto: entre las cajas que lo contienen (con `slop` px de margen), la última dibujada, que es la que va delante. */
export function pickActor(boxes: readonly HitBox[], px: number, py: number, slop: number): string | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (px >= b.x - b.half - slop && px <= b.x + b.half + slop && py >= b.top - slop && py <= b.bottom + slop) return b.id;
  }
  return null;
}
