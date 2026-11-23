import { rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { sql } from 'drizzle-orm';
import { io as ioClient, type Socket } from 'socket.io-client';
import { defaultCharacter, type Ack, type Character, type LobbyState } from '@ceniza/shared';
import { config } from '../src/config';
import { buildApp, type BuiltApp } from '../src/app';
import { createDb, runMigrations } from '../src/db/client';

export interface TestServer extends BuiltApp {
  url: string;
  close(): Promise<void>;
}

/** Borra y recrea el esquema de la BD de pruebas. */
export async function resetDatabase(): Promise<void> {
  const { pool, db } = createDb(config.DATABASE_URL);
  await db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
  await runMigrations(db);
  await pool.end();
  await rm(config.uploadDir, { recursive: true, force: true });
}

export async function startServer(overrides: Partial<typeof config> = {}): Promise<TestServer> {
  const built = await buildApp({ ...config, ...overrides });
  await built.app.listen({ host: '127.0.0.1', port: 0 });
  const port = (built.app.server.address() as AddressInfo).port;
  return {
    ...built,
    url: `http://127.0.0.1:${port}`,
    async close() {
      await built.ctx.roomManager.shutdown();
      built.ctx.io?.close();
      await built.app.close();
      await built.ctx.pool.end();
    },
  };
}

export interface TestUser {
  id: string;
  username: string;
  cookie: string;
}

export async function api<T = any>(url: string, path: string, opts: { method?: string; body?: unknown; cookie?: string; form?: FormData } = {}): Promise<{ status: number; body: T; headers: Headers }> {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  let body: RequestInit['body'] | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(url + path, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* binario */
  }
  return { status: res.status, body: parsed as T, headers: res.headers };
}

export function cookieFrom(headers: Headers): string {
  const raw = headers.getSetCookie().find((c) => c.startsWith('ceniza_sid='));
  if (!raw) throw new Error('No se recibió cookie de sesión');
  return raw.split(';')[0]!;
}

export async function register(url: string, username: string, password = 'contraseña-larga'): Promise<TestUser> {
  const r = await api(url, '/api/auth/register', { body: { username, displayName: username, password } });
  if (r.status !== 201) throw new Error(`registro falló: ${r.status} ${JSON.stringify(r.body)}`);
  return { id: r.body.user.id, username, cookie: cookieFrom(r.headers) };
}

export async function makeJpeg(width = 800, height = 600, color = '#884422'): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg({ quality: 80 }).toBuffer();
}

export async function uploadPhoto(url: string, cookie: string, buf: Buffer, fields: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('file', new Blob([new Uint8Array(buf)], { type: 'image/jpeg' }), 'foto.jpg');
  return api(url, '/api/photos', { method: 'POST', cookie, form: fd });
}

export function character(overrides: Partial<Character> = {}): Character {
  return { ...defaultCharacter({ name: overrides.name ?? 'Elegido', gender: overrides.gender ?? 'M' }), ...overrides };
}

export interface Client {
  socket: Socket;
  states: LobbyState[];
  events: { event: string; payload: any }[];
  last(): LobbyState;
  waitFor(pred: (s: LobbyState) => boolean, timeoutMs?: number): Promise<LobbyState>;
  waitEvent(event: string, timeoutMs?: number): Promise<any>;
  emit<T = unknown>(event: string, payload?: unknown): Promise<Ack<T>>;
  close(): void;
}

export async function connect(url: string, cookie: string): Promise<Client> {
  const socket = ioClient(url, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false, forceNew: true });
  const states: LobbyState[] = [];
  const events: { event: string; payload: any }[] = [];
  const waiters: (() => void)[] = [];
  const kick = () => waiters.splice(0).forEach((w) => w());
  socket.on('lobby:state', (s: LobbyState) => {
    states.push(s);
    kick();
  });
  socket.onAny((event, payload) => {
    if (event !== 'lobby:state') {
      events.push({ event, payload });
      kick();
    }
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (e) => reject(e));
  });
  const client: Client = {
    socket,
    states,
    events,
    last: () => states.reduce((a, b) => (b.version >= a.version ? b : a)),
    waitFor(pred, timeoutMs = 4000) {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout esperando estado de lobby')), timeoutMs);
        const check = () => {
          const s = states.length ? client.last() : null;
          if (s && pred(s)) {
            clearTimeout(t);
            resolve(s);
          } else waiters.push(check);
        };
        check();
      });
    },
    waitEvent(event, timeoutMs = 4000) {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout esperando ${event}`)), timeoutMs);
        const check = () => {
          const e = events.find((x) => x.event === event);
          if (e) {
            clearTimeout(t);
            resolve(e.payload);
          } else waiters.push(check);
        };
        check();
      });
    },
    emit(event, payload = {}) {
      return socket.timeout(8000).emitWithAck(event, payload) as Promise<Ack<any>>;
    },
    close: () => socket.disconnect(),
  };
  return client;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
