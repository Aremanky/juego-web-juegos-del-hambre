import { create } from 'zustand';
import type { ChatMessageDTO, LobbyState } from '@ceniza/shared';
import { emitAck, getSocket, onSocketConnect, SocketFailure } from '../lib/socket';
import { toast } from './toast';
import { useMatch } from './match';

type Status = 'idle' | 'joining' | 'joined' | 'error' | 'kicked' | 'closed';

interface LobbyStore {
  code: string | null;
  status: Status;
  error: string | null;
  state: LobbyState | null;
  roomChat: ChatMessageDTO[];
  globalChat: ChatMessageDTO[];
  join(code: string): Promise<void>;
  leave(): Promise<void>;
  reset(): void;
  /** Conecta los oyentes del socket (una vez por pestaña). */
  wire(): void;
}

let wired = false;

export const useLobby = create<LobbyStore>((set, get) => {
  const wire = () => {
    if (wired) return;
    wired = true;
    const s = getSocket();
    // La partida se engancha a la vez que el lobby: su instantánea llega justo al entrar en la sala.
    useMatch.getState().wire();
    s.on('lobby:state', (st) => {
      const cur = get().state;
      if (!cur || cur.room.id !== st.room.id || st.version >= cur.version) set({ state: st });
    });
    s.on('room:kicked', (p) => {
      if (get().state?.room.id === p.roomId) {
        set({ status: 'kicked', error: p.reason });
        toast.warning(p.reason);
      }
    });
    s.on('room:closed', (p) => {
      if (get().state?.room.id === p.roomId) set({ status: 'closed' });
    });
    s.on('chat:message', (m) => {
      if (m.channel === 'global') set({ globalChat: [...get().globalChat, m].slice(-120) });
      else if (m.roomId && m.roomId === get().state?.room.id) set({ roomChat: [...get().roomChat, m].slice(-150) });
    });
    s.on('notify', (n) => toast[n.kind](n.text));
    // Reconexión: la nueva conexión vuelve a entrar en la sala y recupera el estado completo.
    const loadGlobal = () =>
      void emitAck<ChatMessageDTO[]>('chat:history', { channel: 'global' })
        .then((h) => set({ globalChat: h }))
        .catch(() => undefined);
    onSocketConnect(() => {
      const { code, status } = get();
      if (code && (status === 'joined' || status === 'joining')) void get().join(code);
      loadGlobal();
    });
    if (s.connected) loadGlobal();
  };

  return {
    wire,
    code: null,
    status: 'idle',
    error: null,
    state: null,
    roomChat: [],
    globalChat: [],
    async join(code) {
      wire();
      const upper = code.toUpperCase();
      const sameRoom = get().code === upper && get().state;
      set({ code: upper, status: sameRoom ? get().status : 'joining', error: null });
      try {
        const st = await emitAck<LobbyState>('room:join', { code: upper });
        const cur = get().state;
        set({ status: 'joined', state: !cur || cur.room.id !== st.room.id || st.version >= cur.version ? st : cur });
        const hist = await emitAck<ChatMessageDTO[]>('chat:history', { channel: 'room' });
        set({ roomChat: hist });
      } catch (e) {
        const msg = e instanceof SocketFailure ? e.message : 'No se pudo entrar en la sala';
        if (e instanceof SocketFailure && e.code === 'timeout') return; // se reintentará al reconectar
        set({ status: e instanceof SocketFailure && e.code === 'forbidden' ? 'kicked' : 'error', error: msg });
      }
    },
    async leave() {
      try {
        await emitAck('room:leave');
      } finally {
        get().reset();
      }
    },
    reset() {
      set({ code: null, status: 'idle', error: null, state: null, roomChat: [] });
    },
  };
});
