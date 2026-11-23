import { RoomRuntime, type RuntimeDeps } from './runtime';

const IDLE_UNLOAD_MS = 10 * 60 * 1000;

/** Mantiene en memoria las salas activas y las carga desde PostgreSQL bajo demanda (persistencia y reinicios). */
export class RoomManager {
  private byId = new Map<string, RoomRuntime>();
  private loading = new Map<string, Promise<RoomRuntime | null>>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: RuntimeDeps) {}

  get(roomId: string | null | undefined): RoomRuntime | undefined {
    return roomId ? this.byId.get(roomId) : undefined;
  }

  async getByCode(code: string): Promise<RoomRuntime | null> {
    for (const rt of this.byId.values()) if (rt.code === code) return rt;
    const room = await this.deps.repo.findByCode(code);
    if (!room) return null;
    return this.load(room.id);
  }

  async load(roomId: string): Promise<RoomRuntime | null> {
    const existing = this.byId.get(roomId);
    if (existing) return existing;
    let p = this.loading.get(roomId);
    if (!p) {
      p = (async () => {
        const room = await this.deps.repo.findById(roomId);
        if (!room) return null;
        const rt = await RoomRuntime.load(this.deps, room);
        this.byId.set(roomId, rt);
        return rt;
      })().finally(() => this.loading.delete(roomId));
      this.loading.set(roomId, p);
    }
    return p;
  }

  start(intervalMs = 10_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sweep(), intervalMs);
    this.timer.unref();
  }

  sweep(now = Date.now()): void {
    for (const [id, rt] of this.byId) {
      rt.tick(now);
      const idle = Math.max(rt.lastActivity, rt.match?.lastActivity ?? 0);
      if (rt.socketCount === 0 && (rt.status === 'closed' || now - idle > IDLE_UNLOAD_MS)) {
        // Una partida sin nadie conectado se guarda y se descarga; vuelve en pausa al entrar alguien.
        void rt.dispose().catch(() => undefined);
        this.byId.delete(id);
      }
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const rt of this.byId.values()) rt.match?.stop();
  }

  /** Cierre ordenado: para los bucles de partida y espera a que se guarden sus instantáneas. */
  async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await Promise.all([...this.byId.values()].map((rt) => rt.dispose().catch(() => undefined)));
  }

  get loadedCount(): number {
    return this.byId.size;
  }
}
