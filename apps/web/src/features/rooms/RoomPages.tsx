import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { DEFAULT_ROOM_CONFIG, mergeRoomConfig, type RoomConfig } from '@ceniza/shared';
import { CodeInput, Spinner } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useMe, useRoomPreview } from '../../lib/queries';
import { toast } from '../../stores/toast';
import { RoomConfigForm } from './RoomConfigForm';

export function CreateRoomPage() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const [name, setName] = useState(me ? `La arena de ${me.displayName}`.slice(0, 40) : 'Nueva arena');
  const [config, setConfig] = useState<RoomConfig>(DEFAULT_ROOM_CONFIG);
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post<{ room: { code: string } }>('/api/rooms', { name, config });
      navigate(`/sala/${r.room.code}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <main className="page page-narrow">
      <Link to="/menu" className="back">
        <ChevronLeft size={18} /> Menú
      </Link>
      <form onSubmit={create} className="stack">
        <div className="page-head">
          <h1>Crear sala</h1>
        </div>
        <div className="panel stack">
          <label className="field">
            <span>Nombre de la sala</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} minLength={3} required />
          </label>
          <RoomConfigForm value={config} onChange={(p) => setConfig(mergeRoomConfig(config, p))} />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <p className="hint" style={{ margin: 0 }}>
            Podrás cambiar todo esto en la sala hasta que empiece la partida.
          </p>
          <button className="btn btn-primary btn-lg" disabled={busy || name.trim().length < 3}>
            {busy ? 'Creando…' : 'Crear sala'}
          </button>
        </div>
      </form>
    </main>
  );
}

const STATUS_TEXT: Record<string, string> = { lobby: 'En preparación', starting: 'A punto de empezar', in_game: 'Partida en curso', paused: 'En pausa', finished: 'Terminada' };

export function JoinRoomPage() {
  const params = useParams();
  const [code, setCode] = useState((params.code ?? '').toUpperCase().slice(0, 6));
  const { data: room, error, isFetching } = useRoomPreview(code.length === 6 ? code : null);
  const navigate = useNavigate();

  return (
    <main className="page page-narrow">
      <Link to="/menu" className="back">
        <ChevronLeft size={18} /> Menú
      </Link>
      <div className="page-head">
        <h1>{params.code ? 'Te han invitado a una sala' : 'Unirse a una sala'}</h1>
      </div>
      <div className="panel stack join-panel">
        <span className="label">Código de la sala</span>
        <CodeInput value={code} onChange={setCode} autoFocus={!params.code} />
        {code.length === 6 && isFetching && <Spinner />}
        {code.length === 6 && error && <p className="error-text">{errorMessage(error)}. Revisa las 6 letras o pide el enlace a quien creó la sala.</p>}
        {room && (
          <div className="join-preview">
            <h2 className="display">{room.name}</h2>
            <p className="muted" style={{ margin: 0 }}>
              Anfitrión: {room.host.displayName}. {room.humans} {room.humans === 1 ? 'persona' : 'personas'} y {room.bots} {room.bots === 1 ? 'bot' : 'bots'} de {room.maxParticipants} plazas.
            </p>
            <p className="small faint">{STATUS_TEXT[room.status] ?? room.status}</p>
            <button className="btn btn-primary btn-lg" onClick={() => navigate(`/sala/${room.code}`)} disabled={room.status !== 'lobby' && !room.isMember}>
              {room.isMember ? 'Volver a la sala' : 'Unirme a la sala'}
            </button>
            {room.status !== 'lobby' && !room.isMember && <p className="hint">La partida ya ha empezado: ya no se admiten participantes nuevos.</p>}
          </div>
        )}
      </div>
    </main>
  );
}
