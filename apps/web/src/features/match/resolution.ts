/**
 * Densidad del lienzo del mapa según lo rápido que salen los fotogramas. Empieza en la de la pantalla (como mucho
 * 2). Si en una ventana de 2 s la mediana entre fotogramas pasa de 28 ms (menos de unos 35 por segundo), baja un
 * paso: 2, 1,5 y 1. No vuelve a subir en la partida, para no ir y venir. Con GPU no llega a bajar; sin GPU, en un
 * móvil lento, es lo que deja el mapa por encima de 30 fotogramas por segundo (medido en la fase 7).
 */
export class Resolution {
  dpr: number;
  private gaps: number[] = [];
  private last = -1;
  private since = 0;

  constructor(
    screen: number,
    private readonly slowMs = 28,
    private readonly spanMs = 2000,
  ) {
    this.dpr = Math.min(2, screen || 1);
  }

  /** Un fotograma a la hora `t` (ms). Devuelve true si acaba de bajar la densidad. */
  frame(t: number): boolean {
    if (this.last < 0) {
      this.last = this.since = t;
      return false;
    }
    const dt = t - this.last;
    this.last = t;
    // Una pausa de más de un segundo (pestaña oculta, depurador) no dice nada del ritmo: empieza otra ventana.
    // Un fotograma lento sí cuenta, aunque tarde un cuarto de segundo: es justo el caso que hay que aliviar.
    if (dt > 1000) {
      this.gaps = [];
      this.since = t;
      return false;
    }
    this.gaps.push(dt);
    if (t - this.since < this.spanMs) return false;
    // La mediana y no la media: unos pocos fotogramas largos (cargar bloques del terreno) no cuentan.
    const sorted = [...this.gaps].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this.gaps = [];
    this.since = t;
    const next = this.dpr > 1.5 ? 1.5 : this.dpr > 1 ? 1 : this.dpr;
    if (median > this.slowMs && next < this.dpr) {
      this.dpr = next;
      return true;
    }
    return false;
  }
}
