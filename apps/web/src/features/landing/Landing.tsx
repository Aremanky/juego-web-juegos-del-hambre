import { Link, Navigate } from 'react-router';
import { avatarDataUri, BOT_NAMES, DISTRICTS, PLAYER_COLORS } from '@ceniza/shared';
import { Emblem, Spinner } from '../../components/ui';
import { useMe } from '../../lib/queries';

interface Seat {
  name: string;
  src: string;
  ring: string;
}

// Sala de ejemplo, determinista: el mismo tablero que verá el jugador en el lobby.
const FILLED_F = new Set([0, 1, 3, 6, 7, 9, 11]);
const FILLED_M = new Set([0, 2, 3, 5, 6, 8, 10]);
const seat = (i: number, g: 'M' | 'F'): Seat => {
  const name = BOT_NAMES[g][(i * 7 + (g === 'F' ? 3 : 0)) % BOT_NAMES[g].length]!;
  const ring = PLAYER_COLORS[(i * 5 + (g === 'F' ? 2 : 9)) % PLAYER_COLORS.length]!;
  return { name, ring, src: avatarDataUri(`portada-${g}-${i}`, ring) };
};
const BOARD = DISTRICTS.map((d, i) => ({ d, f: FILLED_F.has(i) ? seat(i, 'F') : null, m: FILLED_M.has(i) ? seat(i, 'M') : null }));

function MiniSlot({ s }: { s: Seat | null }) {
  if (!s) {
    return (
      <span className="mini-slot empty">
        <i />
      </span>
    );
  }
  return (
    <span className="mini-slot" style={{ ['--ring' as string]: s.ring }}>
      <img src={s.src} alt="" />
      <span>{s.name}</span>
    </span>
  );
}

export function Landing() {
  const { data: me, isLoading } = useMe();
  if (isLoading)
    return (
      <div className="center-fill">
        <Spinner />
      </div>
    );
  if (me) return <Navigate to="/menu" replace />;

  return (
    <main className="landing">
      <div className="embers" aria-hidden="true">
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i} style={{ ['--x' as string]: `${(i * 37) % 100}%`, ['--d' as string]: `${8 + ((i * 13) % 9)}s`, ['--delay' as string]: `${(i * 0.73) % 7}s`, ['--s' as string]: `${2 + (i % 3)}px` }} />
        ))}
      </div>
      <section className="hero">
        <div className="hero-copy">
          <Emblem size={84} />
          <h1 className="hero-title">
            Los Juegos
            <br />
            de la Ceniza
          </h1>
          <p className="hero-sub">Juego de supervivencia para tus amigos y bots, en el móvil o en el ordenador. Gana quien siga vivo al final.</p>
          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" to="/registro">
              Crear cuenta
            </Link>
            <Link className="btn btn-lg" to="/entrar">
              Entrar
            </Link>
          </div>
        </div>

        <figure className="panel panel-visor hero-room" aria-label="Ejemplo de sala en preparación">
          <div className="hero-room-head">
            <h2>Tablero de distritos</h2>
            <span className="muted small">Sala de ejemplo</span>
          </div>
          <div className="mini-board">
            {BOARD.map(({ d, f, m }) => (
              <div key={d.id} className="mini-col" style={{ ['--dc' as string]: d.color }} title={`${d.name}: ${d.perk}`}>
                <span className="mini-num display">{d.roman}</span>
                <MiniSlot s={f} />
                <MiniSlot s={m} />
              </div>
            ))}
          </div>
          <figcaption className="hero-room-foot">
            <span>Doce distritos con dos plazas cada uno</span>
            <span>Los bots llevan camafeo; tus amigos, su foto</span>
          </figcaption>
        </figure>
      </section>
    </main>
  );
}
