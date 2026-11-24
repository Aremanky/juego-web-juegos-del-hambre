/**
 * Niebla de guerra: oscurece lo que queda fuera de tu radio de visión, con el borde suave. El degradado se pinta
 * una vez en un recorte cuadrado (otra vez solo si cambian el radio o la densidad) y cada fotograma se copia sin
 * escalar, con cuatro rectángulos lisos alrededor. Sin GPU, el degradado radial a pantalla completa costaba casi
 * 2 ms por fotograma (medido en la fase 7); así se ve igual y cuesta una copia pequeña.
 */
const FOG = 'rgba(8,10,11,0.62)';

/**
 * Rectángulos [x, y, ancho, alto] que cubren una vez la pantalla W×H salvo el cuadrado de lado 2R centrado en
 * (X, Y), sin rectángulos vacíos. En píxeles reales y enteros.
 */
export function fogRects(X: number, Y: number, R: number, W: number, H: number): [number, number, number, number][] {
  const x0 = Math.max(0, Math.min(W, X - R));
  const x1 = Math.max(0, Math.min(W, X + R));
  const y0 = Math.max(0, Math.min(H, Y - R));
  const y1 = Math.max(0, Math.min(H, Y + R));
  const out: [number, number, number, number][] = [
    [0, 0, W, y0],
    [0, y1, W, H - y1],
    [0, y0, x0, y1 - y0],
    [x1, y0, W - x1, y1 - y0],
  ];
  return out.filter((r) => r[2] > 0 && r[3] > 0);
}

export class FogLayer {
  private sprite: HTMLCanvasElement | null = null;
  private key = '';

  /** Niebla alrededor de (x, y) con radio de visión `rr`, en píxeles CSS; `g` lleva la densidad `dpr`. */
  draw(g: CanvasRenderingContext2D, x: number, y: number, rr: number, w: number, h: number, dpr: number) {
    const R = Math.ceil(rr * 1.05 * dpr) + 1;
    const key = `${R}|${rr}|${dpr}`;
    if (!this.sprite || this.key !== key) {
      const c = this.sprite ?? document.createElement('canvas');
      c.width = c.height = R * 2;
      const s = c.getContext('2d')!;
      s.clearRect(0, 0, R * 2, R * 2);
      const grad = s.createRadialGradient(R, R, rr * 0.85 * dpr, R, R, rr * 1.05 * dpr);
      grad.addColorStop(0, 'rgba(8,10,11,0)');
      grad.addColorStop(1, FOG);
      s.fillStyle = grad;
      s.fillRect(0, 0, R * 2, R * 2);
      this.sprite = c;
      this.key = key;
    }
    const X = Math.round(x * dpr);
    const Y = Math.round(y * dpr);
    const W = Math.round(w * dpr);
    const H = Math.round(h * dpr);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.sprite, X - R, Y - R);
    g.fillStyle = FOG;
    for (const [rx, ry, rw, rh] of fogRects(X, Y, R, W, H)) g.fillRect(rx, ry, rw, rh);
    g.restore();
  }
}
