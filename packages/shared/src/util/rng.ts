/**
 * PRNG determinista y serializable (sfc32). El estado cabe en 4 enteros, así que se puede
 * guardar en las instantáneas de partida y reanudar exactamente igual tras un reinicio.
 */
export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export function hashString(str: string): number {
  // cyrb53 reducido a 32 bits
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) ^ (h1 >>> 0);
}

export class Rng {
  private s: RngState;

  constructor(seed: string | number | RngState) {
    if (typeof seed === 'object') {
      this.s = { ...seed };
    } else {
      const h = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
      this.s = { a: h, b: h ^ 0x9e3779b9, c: (h * 1103515245 + 12345) >>> 0, d: 1 };
      for (let i = 0; i < 15; i++) this.next();
    }
  }

  state(): RngState {
    return { ...this.s };
  }

  /** Flotante en [0, 1). */
  next(): number {
    let { a, b, c, d } = this.s;
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    this.s = { a, b, c, d };
    return (t >>> 0) / 4294967296;
  }

  int(min: number, maxInclusive: number): number {
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick() sobre array vacío');
    return arr[Math.floor(this.next() * arr.length)] as T;
  }

  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    const total = items.reduce((s, it) => s + Math.max(0, weight(it)), 0);
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1] as T;
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}

export function randomSeed(): string {
  const bytes = new Uint8Array(8);
  (globalThis as unknown as { crypto: { getRandomValues(a: Uint8Array): Uint8Array } }).crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
