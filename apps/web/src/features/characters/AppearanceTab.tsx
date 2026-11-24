import { useEffect, useRef } from 'react';
import {
  ACCESSORIES, ACCESSORY_LABEL, BUILDS, BUILD_LABEL, CAMEO_HAIR_STYLES, DISTRICTS, HAIR_COLORS, HAIR_LABEL, OUTFIT_COLORS, OUTFIT_LABEL, OUTFIT_STYLES,
  PANTS_COLORS, SKIN_TONES, appearanceOf, districtById, type Character, type Look,
} from '@ceniza/shared';
import { Segmented } from '../../components/ui';
import { drawFigure, type Facing } from '../match/figure';

/**
 * Apariencia del personaje en el mapa (GDD §5.9): piel, peinado, ropa y complementos. Lo que no se toca
 * sale de su retrato; «Como su retrato» lo devuelve todo a eso.
 */
const FACINGS: Facing[] = ['S', 'E', 'N', 'W'];

/** Figura animada que camina y va girando, sobre un trozo de suelo. */
export function FigurePreview({ c, size = 150 }: { c: Character; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const look = appearanceOf({ portrait: c.portrait, color: c.color, district: c.district ?? 1, gender: c.gender, name: c.name, look: c.look });
  const lookRef = useRef(look);
  lookRef.current = look;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const g = el.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = size * dpr;
    el.height = size * 1.25 * dpr;
    let raf = 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, size, size * 1.25);
      const cx = size / 2;
      const cy = size * 1.06;
      const ground = g.createRadialGradient(cx, cy, 2, cx, cy, size * 0.48);
      ground.addColorStop(0, 'rgba(92,104,58,0.55)');
      ground.addColorStop(1, 'rgba(92,104,58,0)');
      g.fillStyle = ground;
      g.beginPath();
      g.ellipse(cx, cy, size * 0.48, size * 0.16, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(cx + 6, cy, size * 0.17, size * 0.05, 0.2, 0, Math.PI * 2);
      g.fill();
      const facing = reduce ? 'S' : FACINGS[Math.floor(t / 1800) % 4];
      drawFigure(g, lookRef.current, cx, cy, size * 0.82, { facing, t, moving: !reduce, running: false, swimming: false, crouched: false, dead: false, celebrating: false });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);
  return <canvas ref={ref} className="figure-preview" style={{ width: size, height: size * 1.25 }} role="img" aria-label="Así se verá tu personaje en el mapa" />;
}

function Swatches<T>({ label, items, value, color, onPick, title }: { label: string; items: readonly T[]; value: T | undefined; color: (v: T) => string; onPick: (v: T) => void; title: (v: T) => string }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <button key={String(title(it))} type="button" role="radio" aria-checked={value === it} className="swatch" style={{ background: color(it) }} onClick={() => onPick(it)} aria-label={title(it)} title={title(it)} />
      ))}
    </div>
  );
}

export function AppearanceTab({ c, set }: { c: Character; set: <K extends keyof Character>(k: K, v: Character[K]) => void }) {
  const look = c.look ?? {};
  const resolved = appearanceOf({ portrait: c.portrait, color: c.color, district: c.district ?? 1, gender: c.gender, name: c.name, look: c.look });
  const put = (patch: Partial<Look>) => set('look', { ...look, ...patch });
  const skinIdx = SKIN_TONES.findIndex(([b]) => b === resolved.skin);
  const hairIdx = HAIR_COLORS.findIndex(([b]) => b === resolved.hair);
  const pantsIdx = PANTS_COLORS.findIndex((p) => p === resolved.pants);
  const district = districtById(c.district);
  const random = () => {
    const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
    set('look', {
      skin: Math.floor(Math.random() * SKIN_TONES.length),
      hairStyle: pick(CAMEO_HAIR_STYLES),
      hairColor: Math.floor(Math.random() * HAIR_COLORS.length),
      outfitStyle: pick(OUTFIT_STYLES),
      outfit: pick(OUTFIT_COLORS),
      pants: Math.floor(Math.random() * PANTS_COLORS.length),
      accessory: pick(ACCESSORIES),
      build: pick(BUILDS),
      height: Math.floor(Math.random() * 5) - 2,
    });
  };

  return (
    <div className="stack appearance">
      <div className="appearance-head">
        <FigurePreview c={c} />
        <div className="stack-sm">
          <p className="hint">Así te verán en el mapa. Lo que no cambies sale de tu retrato.</p>
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={random}>
              Al azar
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => set('look', null)} disabled={!c.look}>
              Como su retrato
            </button>
          </div>
        </div>
      </div>

      <div className="field">
        <span>Piel</span>
        <Swatches label="Piel" items={SKIN_TONES.map((_, i) => i)} value={skinIdx} color={(i) => SKIN_TONES[i][0]} onPick={(i) => put({ skin: i })} title={(i) => `Tono ${i + 1}`} />
      </div>
      <div className="field">
        <span>Peinado</span>
        <Segmented label="Peinado" value={resolved.hairStyle} options={CAMEO_HAIR_STYLES.map((s) => ({ value: s, label: HAIR_LABEL[s] }))} onChange={(s) => put({ hairStyle: s })} />
      </div>
      <div className="field">
        <span>Color del pelo</span>
        <Swatches label="Color del pelo" items={HAIR_COLORS.map((_, i) => i)} value={hairIdx} color={(i) => HAIR_COLORS[i][0]} onPick={(i) => put({ hairColor: i })} title={(i) => `Pelo ${i + 1}`} />
      </div>
      <div className="field">
        <span>Ropa</span>
        <Segmented label="Ropa" value={resolved.outfitStyle} options={OUTFIT_STYLES.map((s) => ({ value: s, label: OUTFIT_LABEL[s] }))} onChange={(s) => put({ outfitStyle: s })} />
      </div>
      <div className="field">
        <span>Color de la ropa</span>
        <div className="row-wrap">
          <Swatches label="Color de la ropa" items={OUTFIT_COLORS} value={resolved.outfit.toLowerCase() as (typeof OUTFIT_COLORS)[number]} color={(v) => v} onPick={(v) => put({ outfit: v })} title={(v) => v} />
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => put({ outfit: undefined })} aria-pressed={!look.outfit}>
            El de jugador
          </button>
        </div>
      </div>
      <div className="field">
        <span>Ribete y detalles</span>
        <div className="row-wrap">
          <Swatches label="Ribete" items={DISTRICTS.map((d) => d.color)} value={resolved.trim} color={(v) => v} onPick={(v) => put({ trim: v })} title={(v) => DISTRICTS.find((d) => d.color === v)?.name ?? v} />
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => put({ trim: undefined })} aria-pressed={!look.trim}>
            {district ? `El de ${district.name}` : 'El del distrito'}
          </button>
        </div>
      </div>
      <div className="field">
        <span>Pantalón</span>
        <Swatches label="Pantalón" items={PANTS_COLORS.map((_, i) => i)} value={pantsIdx} color={(i) => PANTS_COLORS[i]} onPick={(i) => put({ pants: i })} title={(i) => `Pantalón ${i + 1}`} />
      </div>
      <div className="field">
        <span>Complemento</span>
        <Segmented label="Complemento" value={resolved.accessory} options={ACCESSORIES.map((s) => ({ value: s, label: ACCESSORY_LABEL[s] }))} onChange={(s) => put({ accessory: s })} />
      </div>
      <div className="grid-2">
        <div className="field">
          <span>Complexión</span>
          <Segmented label="Complexión" value={look.build ?? 'media'} options={BUILDS.map((s) => ({ value: s, label: BUILD_LABEL[s] }))} onChange={(s) => put({ build: s })} />
        </div>
        <label className="field">
          <span>Estatura</span>
          <input type="range" min={-2} max={2} step={1} value={look.height ?? 0} onChange={(e) => put({ height: Number(e.target.value) })} />
        </label>
      </div>
    </div>
  );
}
