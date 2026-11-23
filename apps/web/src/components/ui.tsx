import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleCheck, Info, TriangleAlert, X, CircleX, Bot as BotIcon, Crown } from 'lucide-react';
import type { FrameKey, Portrait as PortraitData } from '@ceniza/shared';
import { portraitSrc } from '../lib/media';
import { useToasts } from '../stores/toast';

// ─────────────────────────────────────────── emblema
/** Obelisco con llama dentro de un anillo de laurel roto: emblema original del juego. */
export function Emblem({ size = 64 }: { size?: number }) {
  const leaves: ReactNode[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const a = (side === -1 ? 200 - i * 15 : -20 + i * 15) * (Math.PI / 180);
      const x = 60 + Math.cos(a) * 46;
      const y = 62 + Math.sin(a) * 46;
      const rot = (a * 180) / Math.PI + (side === -1 ? -60 : 60) + 90;
      leaves.push(<ellipse key={`${side}${i}`} cx={x} cy={y} rx="3.2" ry="7.5" transform={`rotate(${rot} ${x} ${y})`} fill="url(#em-gold)" opacity={0.55 + i * 0.05} />);
    }
  }
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="em-gold" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f0d690" />
          <stop offset="1" stopColor="#9c7a2e" />
        </linearGradient>
        <radialGradient id="em-fire" cx=".5" cy=".72" r=".62">
          <stop offset="0" stopColor="#ffe3a1" />
          <stop offset=".45" stopColor="#f26a2e" />
          <stop offset="1" stopColor="#7a240e" />
        </radialGradient>
      </defs>
      {leaves}
      <path d="M60 9c7 8 8.5 14 4.5 20.5 5-2.5 6.5-7 6.5-7 3 8.5-2.5 17-11 17s-14-7-11-15c1.5 4 4 5.5 5.5 5.5C52 23 54.5 16 60 9z" fill="url(#em-fire)" />
      <path d="M54.5 96l2-46L60 42.5l3.5 7.5 2 46z" fill="url(#em-gold)" />
      <path d="M60 42.5l3.5 7.5h-7z" fill="#fff3cf" opacity=".55" />
      <rect x="48" y="96" width="24" height="4" fill="#9c7a2e" />
      <rect x="44" y="100" width="32" height="4" fill="#7d6224" />
    </svg>
  );
}

// ─────────────────────────────────────────── retrato
export function Portrait({
  portrait,
  color,
  size = 56,
  frame = 'sencillo',
  bot = false,
  host = false,
  grayscale = false,
  title,
}: {
  portrait: PortraitData | null | undefined;
  color: string;
  size?: number;
  frame?: FrameKey;
  bot?: boolean;
  host?: boolean;
  grayscale?: boolean;
  title?: string;
}) {
  return (
    <div className={`portrait f-${frame}${grayscale ? ' grayscale' : ''}`} style={{ ['--size' as string]: `${size}px`, ['--ring' as string]: color }} title={title}>
      <img src={portraitSrc(portrait, color, size * (window.devicePixelRatio || 1))} alt="" loading="lazy" draggable={false} />
      {bot && (
        <span className="badge" aria-label="Bot">
          <BotIcon />
        </span>
      )}
      {host && <Crown className="crown" aria-label="Anfitrión" />}
    </div>
  );
}

// ─────────────────────────────────────────── modal
export function Modal({ title, onClose, children, footer, width = 640 }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.modal-close)');
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="panel modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={{ ['--w' as string]: `${width}px` }}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="btn btn-ghost btn-icon btn-sm modal-close" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────── avisos
export function Toasts() {
  const { toasts, dismiss } = useToasts();
  const icon = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleX };
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => {
        const I = icon[t.kind];
        return (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'} onClick={() => dismiss(t.id)}>
            <I />
            <span>{t.text}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────── controles
export function Segmented<T extends string | number>({ value, options, onChange, disabled, label }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; disabled?: boolean; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)} disabled={disabled} title={o.title}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}

export function Spinner({ label = 'Cargando' }: { label?: string }) {
  return <div className="spinner" role="status" aria-label={label} />;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

/** Botón destructivo en dos pasos: el primer toque pide confirmación. */
export function ConfirmButton({ onConfirm, children, confirmText = '¿Seguro? Pulsa otra vez', className = 'btn btn-danger', disabled }: { onConfirm: () => void; children: ReactNode; confirmText?: string; className?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={className} disabled={disabled} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmText : children}
    </button>
  );
}

/** Seis casillas para el código de sala (tipo cerradura). */
export function CodeInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const clean = (s: string) => s.toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g, '');
  const chars = value.padEnd(6, ' ').slice(0, 6).split('');
  const setAt = (i: number, ch: string) => {
    const arr = value.padEnd(6, ' ').split('');
    arr[i] = ch || ' ';
    onChange(arr.join('').replace(/\s+$/, '').replace(/\s/g, ''));
  };
  return (
    <div className="code-input" onPaste={(e) => {
      const t = clean(e.clipboardData.getData('text')).slice(0, 6);
      if (t) {
        e.preventDefault();
        onChange(t);
        refs.current[Math.min(t.length, 5)]?.focus();
      }
    }}>
      {chars.map((c, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="code-cell num"
          value={c.trim()}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          aria-label={`Carácter ${i + 1} del código`}
          maxLength={1}
          placeholder="·"
          autoFocus={autoFocus && i === 0}
          onChange={(e) => {
            const ch = clean(e.target.value).slice(-1);
            setAt(i, ch);
            if (ch && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !c.trim() && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}
