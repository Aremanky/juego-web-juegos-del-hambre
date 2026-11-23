import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@ceniza/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface ConnState {
  status: 'offline' | 'connecting' | 'online';
  set(status: ConnState['status']): void;
}
export const useConnection = create<ConnState>((set) => ({ status: 'offline', set: (status) => set({ status }) }));

let socket: GameSocket | null = null;
const connectListeners = new Set<() => void>();

/** Conexión única por pestaña. Socket.IO reconecta solo; al reconectar avisamos para re-unirse a la sala. */
export function getSocket(): GameSocket {
  if (socket) return socket;
  socket = io({ path: '/socket.io', withCredentials: true, reconnectionDelay: 800, reconnectionDelayMax: 6000, transports: ['websocket', 'polling'] });
  useConnection.getState().set('connecting');
  socket.on('connect', () => {
    useConnection.getState().set('online');
    connectListeners.forEach((fn) => fn());
  });
  socket.on('disconnect', () => useConnection.getState().set('connecting'));
  socket.io.on('reconnect_attempt', () => useConnection.getState().set('connecting'));
  socket.on('connect_error', () => useConnection.getState().set('connecting'));
  return socket;
}

export function onSocketConnect(fn: () => void): () => void {
  connectListeners.add(fn);
  return () => connectListeners.delete(fn);
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
  useConnection.getState().set('offline');
}

export class SocketFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Emite con confirmación del servidor; lanza SocketFailure si el servidor rechaza la acción. */
export async function emitAck<T = undefined>(event: keyof ClientToServerEvents, payload: unknown = {}): Promise<T> {
  const s = getSocket();
  let res: Ack<T>;
  try {
    res = (await (s.timeout(10_000) as unknown as { emitWithAck(e: string, p: unknown): Promise<Ack<T>> }).emitWithAck(event, payload)) as Ack<T>;
  } catch {
    throw new SocketFailure('timeout', 'El servidor no responde. Reintentando la conexión…');
  }
  if (!res.ok) throw new SocketFailure(res.error.code, res.error.message);
  return res.data;
}

export function newCid(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
