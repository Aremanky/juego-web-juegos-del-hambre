import { createHash, randomBytes, randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@ceniza/shared';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function randomRoomCode(): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) out += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return out;
}

/** LRU mínima (para idempotencia de comandos). */
export class Lru<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly max: number) {}
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(k: K, v: V): void {
    this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as K);
  }
  delete(k: K): void {
    this.map.delete(k);
  }
}

/** Cubo de fichas para limitar la frecuencia de eventos por socket. */
export class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {
    this.tokens = capacity;
  }
  take(n = 1): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSec);
    this.last = now;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

/** Serializa tareas asíncronas: evita intercalados entre comandos simultáneos sobre el mismo recurso. */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

/** ¿Origen permitido? Mismo host que la petición, PUBLIC_URL o lista extra. */
export function isAllowedOrigin(origin: string | undefined, host: string | undefined, publicUrl: string | undefined, extra: Set<string>): boolean {
  if (!origin) return true; // peticiones sin Origin (navegación same-origin, clientes no navegador)
  try {
    const o = new URL(origin);
    if (host && o.host === host) return true;
    if (publicUrl && new URL(publicUrl).origin === o.origin) return true;
    return extra.has(o.origin);
  } catch {
    return false;
  }
}
