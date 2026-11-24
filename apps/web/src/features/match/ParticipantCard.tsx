import { useEffect, useId, useLayoutEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { districtById, type ActorView, type BotSettings } from '@ceniza/shared';
import { Portrait } from '../../components/ui';
import type { LastSeen } from '../../stores/sight';
import { participantCard } from './card';

/**
 * Tarjeta de un participante (GDD §7.5): quién es, cómo está y dónde está para ti, sin nada que no hayas
 * visto. No bloquea el mapa: en escritorio aparece junto al personaje y en el móvil, como hoja inferior.
 * Se cierra con su botón, con Esc o tocando el mapa fuera de un personaje.
 */
export function ParticipantCard({
  actor,
  me,
  lastSeen,
  now,
  bot,
  trip,
  onGo,
  onClose,
  anchor,
}: {
  actor: ActorView;
  me: string | null;
  lastSeen?: LastSeen;
  /** Hora de partida, para «desde hace…». */
  now: number;
  bot: BotSettings | null;
  /** Casillas y tiempo hasta él con tu ruta, si lo ves. */
  trip: { cells: number; eta: number } | null;
  /** Ir hacia él (o a donde lo viste); sin ella no hay botón. */
  onGo: (() => void) | null;
  onClose: () => void;
  /** Punto del mapa (px del escenario) junto al que se abre en escritorio. */
  anchor: { x: number; y: number } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const sheet = useMemo(() => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 720px)').matches, []);
  const closeFn = useRef(onClose);
  closeFn.current = onClose;

  // El foco va al botón de cerrar al abrir y vuelve a donde estaba al cerrar.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeFn.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);

  // En escritorio, a la derecha del personaje (o a su izquierda si no cabe), sin salirse del escenario.
  useLayoutEffect(() => {
    const el = ref.current;
    const stage = el?.offsetParent as HTMLElement | null;
    if (!el || !stage || sheet) return;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = anchor ? anchor.x + 28 : 12;
    if (anchor && left + w > W - 12) left = anchor.x - 28 - w;
    const top = anchor ? anchor.y - 12 : 56;
    el.style.left = `${Math.max(12, Math.min(W - w - 12, left))}px`;
    el.style.top = `${Math.max(56, Math.min(H - h - 12, top))}px`;
  }, [anchor, sheet]);

  const info = participantCard(actor, { me, lastSeen, now, bot, trip });
  const d = districtById(actor.district);
  return (
    <div ref={ref} className={`panel pcard${sheet ? ' pcard-sheet' : ''}`} role="dialog" aria-labelledby={titleId}>
      <div className="pcard-head">
        <Portrait portrait={actor.portrait} look={actor.look} color={actor.color} frame="sencillo" size={56} bot={actor.kind === 'bot'} grayscale={!actor.alive} />
        <div className="pcard-id">
          <h2 id={titleId} className="display pcard-name">
            {actor.name}
          </h2>
          {actor.epithet && <p className="pcard-epithet">{actor.epithet}</p>}
          <p className="small faint">
            Distrito {d?.roman}, {d?.name}
          </p>
          <p className="small faint">
            {info.kind}
            {info.bot ? ` · ${info.bot}` : ''}
          </p>
        </div>
        <button ref={closeRef} className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar la tarjeta">
          <X aria-hidden />
        </button>
      </div>
      {info.status && <p className="pcard-status">{info.status}</p>}
      {info.where && <p className="pcard-where num">{info.where}</p>}
      {onGo && (
        <button className="btn btn-gold pcard-go" onClick={onGo}>
          Ir hacia aquí
        </button>
      )}
    </div>
  );
}
