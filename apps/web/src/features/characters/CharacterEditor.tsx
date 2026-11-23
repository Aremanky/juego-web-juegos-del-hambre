import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  ABILITIES, ABILITY_KEYS, ALLIANCE_POLICY_LABEL, ARCHETYPES, ATTRIBUTE_KEYS, ATTRIBUTES, ATTR_MAX, ATTR_MIN, COMBAT_STRATEGY_LABEL, DEFECTS, DEFECT_KEYS,
  DERIVED_DISPLAY, DISTRICTS, FRAME_KEYS, FRAME_LABEL, MOVEMENT_PERKS, PLAYER_COLORS, TRAITS, TRAIT_KEYS, buildCost, budgetFor, computeDerived, costToReach,
  describeRequirement, districtById, explainDerived, hasSource, meetsRequirement, randomSeed, situationalModifiersFor, sourceLabel, stepCost, summarizeBuild,
  type AbilityKey, type AttributeKey, type Attributes, type Character, type DerivedInput, type DerivedKey, type DerivedStats, type SituationalKey,
} from '@ceniza/shared';
import { StrengthTab } from './StrengthTab';
import { Portrait, Segmented } from '../../components/ui';
import { PhotoPicker } from '../photos/photoWidgets';
import { useTemplates } from '../../lib/queries';

const ATTR_NAMES = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, ATTRIBUTES[k].name])) as Record<AttributeKey, string>;

export type EditorTab = 'identidad' | 'atributos' | 'habilidades' | 'estrategia' | 'prueba';

export function CharacterEditor({ value, onChange, budget, mode }: { value: Character; onChange: (c: Character) => void; budget: number; mode: 'template' | 'room' | 'bot' }) {
  const [tab, setTab] = useState<EditorTab>('atributos');
  const summary = summarizeBuild(value, budget);
  const set = <K extends keyof Character>(k: K, v: Character[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="editor">
      <aside className="editor-side">
        <CharacterPreview c={value} />
        <BudgetMeter cost={summary.cost} budget={summary.budget} />
        {summary.issues.length > 0 && (
          <ul className="issues" role="alert">
            {summary.issues.map((i) => (
              <li key={i.message}>{i.message}</li>
            ))}
          </ul>
        )}
      </aside>
      <div className="editor-main">
        <div className="tabs" role="tablist">
          {(
            [
              ['identidad', 'Identidad'],
              ['atributos', 'Atributos'],
              ['habilidades', 'Habilidades y rasgos'],
              ['estrategia', 'Estrategia'],
              ['prueba', 'Prueba de fuerza'],
            ] as [EditorTab, string][]
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
        <div className="editor-body">
          {tab === 'identidad' && <IdentityTab c={value} set={set} mode={mode} />}
          {tab === 'atributos' && <AttributesTab c={value} onChange={onChange} budget={budget} />}
          {tab === 'habilidades' && <AbilitiesTab c={value} set={set} />}
          {tab === 'estrategia' && <StrategyTab c={value} set={set} />}
          {tab === 'prueba' && <StrengthTab c={value} />}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────── vista previa
export function CharacterPreview({ c }: { c: Character }) {
  const d = districtById(c.district);
  return (
    <div className="preview">
      <div className="preview-card">
        <Portrait portrait={c.portrait} color={c.color} frame={c.frame} size={112} />
        <div className="preview-name display">{c.name || 'Sin nombre'}</div>
        {c.epithet && <div className="muted small">{c.epithet}</div>}
        <div className="small faint">{d ? `Distrito ${d.roman}, ${d.name}` : 'Distrito por asignar'}</div>
      </div>
      <div className="preview-map" aria-label="Así se verá en el mapa">
        <span className="preview-marker">
          <Portrait portrait={c.portrait} color={c.color} frame={c.frame} size={40} />
          <span className="preview-label">{c.name}</span>
        </span>
      </div>
      <div className="preview-row" aria-label="Así se verá en la clasificación">
        <span className="num faint">1</span>
        <Portrait portrait={c.portrait} color={c.color} frame="sencillo" size={28} />
        <span className="preview-row-name">{c.name}</span>
        <span className="display small faint">{d?.roman ?? '—'}</span>
      </div>
    </div>
  );
}

function BudgetMeter({ cost, budget }: { cost: number; budget: number }) {
  const over = cost > budget;
  return (
    <div className={`budget${over ? ' over' : ''}`}>
      <div className="budget-top">
        <span className="label">Puntos de atributo</span>
        <span className="num budget-num">
          {cost} / {budget}
        </span>
      </div>
      <div className="budget-bar" role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={cost} aria-label="Puntos gastados">
        <span style={{ width: `${Math.min(100, (cost / budget) * 100)}%` }} />
      </div>
      <div className="small faint">{over ? `Te sobran ${cost - budget} puntos gastados.` : budget - cost === 0 ? 'Has repartido todos tus puntos.' : `Te quedan ${budget - cost} puntos.`}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────────── identidad
function IdentityTab({ c, set, mode }: { c: Character; set: <K extends keyof Character>(k: K, v: Character[K]) => void; mode: 'template' | 'room' | 'bot' }) {
  const [picking, setPicking] = useState<'portrait' | 'victory' | null>(null);
  return (
    <div className="stack">
      <div className="grid-2">
        <label className="field">
          <span>Nombre del personaje</span>
          <input className="input" value={c.name} maxLength={24} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className="field">
          <span>Epíteto (opcional)</span>
          <input className="input" value={c.epithet} maxLength={32} onChange={(e) => set('epithet', e.target.value)} placeholder="la Implacable" />
        </label>
      </div>
      <div className="field">
        <span>Género (decide tu plaza en el distrito)</span>
        <Segmented
          label="Género"
          value={c.gender}
          options={[
            { value: 'F', label: 'Femenino' },
            { value: 'M', label: 'Masculino' },
          ]}
          onChange={(g) => set('gender', g)}
        />
      </div>

      <div className="field">
        <span>Retrato</span>
        <div className="row">
          <Portrait portrait={c.portrait} color={c.color} frame={c.frame} size={72} />
          <button type="button" className="btn" onClick={() => setPicking('portrait')}>
            {mode === 'bot' ? 'Usar una de mis fotos' : 'Elegir de mis fotos'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => set('portrait', { kind: 'generated', seed: randomSeed() })}>
            Cara generada
          </button>
        </div>
      </div>

      {mode !== 'bot' && (
        <div className="field">
          <span>Foto de victoria (opcional)</span>
          <div className="row">
            {c.victoryPhoto ? <Portrait portrait={c.victoryPhoto} color="#c9a24b" frame="laurel" size={56} /> : <span className="hint">Se usará tu retrato si no eliges otra.</span>}
            <button type="button" className="btn btn-sm" onClick={() => setPicking('victory')}>
              Elegir
            </button>
            {c.victoryPhoto && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => set('victoryPhoto', null)}>
                Quitar
              </button>
            )}
          </div>
        </div>
      )}

      <div className="field">
        <span>Color identificativo</span>
        <div className="swatches" role="radiogroup" aria-label="Color">
          {PLAYER_COLORS.map((col) => (
            <button key={col} type="button" role="radio" aria-checked={c.color.toLowerCase() === col} className="swatch" style={{ background: col }} onClick={() => set('color', col)} aria-label={col} />
          ))}
        </div>
      </div>

      <div className="field">
        <span>Marco del marcador</span>
        <div className="frames">
          {FRAME_KEYS.map((f) => (
            <button key={f} type="button" className="frame-opt" aria-pressed={c.frame === f} onClick={() => set('frame', f)}>
              <Portrait portrait={c.portrait} color={c.color} frame={f} size={40} />
              <span className="small">{FRAME_LABEL[f]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>{mode === 'room' ? 'Distrito preferido (en la sala lo eliges en el tablero)' : 'Distrito preferido'}</span>
        <div className="district-picker">
          <button type="button" className="district-opt" aria-pressed={c.district == null} onClick={() => set('district', null)}>
            <span className="display">?</span>
            <span className="small">Cualquiera</span>
          </button>
          {DISTRICTS.map((d) => (
            <button key={d.id} type="button" className="district-opt" aria-pressed={c.district === d.id} onClick={() => set('district', d.id)} title={d.perk} style={{ ['--dc' as string]: d.color }}>
              <span className="display">{d.roman}</span>
              <span className="small">{d.name}</span>
            </button>
          ))}
        </div>
        {districtById(c.district) && <p className="hint">{districtById(c.district)!.perk}</p>}
      </div>

      <label className="field">
        <span>Presentación (se lee al empezar la partida)</span>
        <textarea className="textarea" value={c.bio} maxLength={240} onChange={(e) => set('bio', e.target.value)} placeholder="Una frase que te defina en la arena." />
      </label>

      {picking && (
        <PhotoPicker
          title={picking === 'portrait' ? 'Elige tu retrato' : 'Elige la foto de victoria'}
          selectedId={picking === 'portrait' && c.portrait.kind === 'photo' ? c.portrait.photoId : c.victoryPhoto?.kind === 'photo' ? c.victoryPhoto.photoId : null}
          onClose={() => setPicking(null)}
          onSelect={(p) => {
            set(picking === 'portrait' ? 'portrait' : 'victoryPhoto', { kind: 'photo', photoId: p.id, v: p.v });
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────── atributos
function AttributesTab({ c, onChange, budget }: { c: Character; onChange: (c: Character) => void; budget: number }) {
  const { data: templates } = useTemplates();
  const [focus, setFocus] = useState<AttributeKey>('potencia');
  const [compareKey, setCompareKey] = useState<string>('');
  const max = budgetFor(budget, c.defect != null);
  const cost = buildCost(c.attributes);

  const setLevel = (k: AttributeKey, level: number) => {
    const lv = Math.max(ATTR_MIN, Math.min(ATTR_MAX, level));
    const next = { ...c.attributes, [k]: lv };
    if (lv > c.attributes[k] && buildCost(next) > max) return;
    onChange({ ...c, attributes: next });
  };

  const compareOptions = useMemo(
    () => [
      ...ARCHETYPES.map((a) => ({ key: `a:${a.key}`, label: `Arquetipo: ${a.name}`, attrs: a.attributes, abilities: a.abilities as AbilityKey[], trait: a.trait, defect: null, district: null })),
      ...(templates ?? []).map((t) => ({ key: `t:${t.id}`, label: `Guardado: ${t.data.name}`, attrs: t.data.attributes, abilities: t.data.abilities, trait: t.data.trait, defect: t.data.defect, district: t.data.district })),
    ],
    [templates],
  );
  const cmp = compareOptions.find((o) => o.key === compareKey);
  const input: DerivedInput = { attributes: c.attributes, district: c.district, trait: c.trait, defect: c.defect, abilities: c.abilities };
  const derived = computeDerived(input);
  const derivedCmp = cmp ? computeDerived({ attributes: cmp.attrs, district: cmp.district, trait: cmp.trait, defect: cmp.defect, abilities: cmp.abilities }) : null;
  const def = ATTRIBUTES[focus];

  return (
    <div className="stack">
      <div className="archetypes">
        <span className="label">Arquetipos rápidos</span>
        <div className="row" style={{ gap: '0.4rem' }}>
          {ARCHETYPES.map((a) => (
            <button
              key={a.key}
              type="button"
              className="btn btn-sm"
              title={a.description}
              onClick={() => onChange({ ...c, attributes: { ...a.attributes }, abilities: [...a.abilities], trait: a.trait, defect: null })}
            >
              {a.name}
            </button>
          ))}
        </div>
      </div>

      <div className="attr-layout">
        <div className="attrs">
          {ATTRIBUTE_KEYS.map((k) => {
            const A = ATTRIBUTES[k];
            const lv = c.attributes[k];
            const nextCost = lv < ATTR_MAX ? stepCost(lv + 1) : 0;
            return (
              <div key={k} className={`attr${focus === k ? ' focused' : ''}`} onMouseEnter={() => setFocus(k)} onFocus={() => setFocus(k)}>
                <button type="button" className="attr-name" onClick={() => setFocus(k)}>
                  <span>{A.name}</span>
                </button>
                <div className="pips" role="group" aria-label={`${A.name}: nivel ${lv}`}>
                  {Array.from({ length: ATTR_MAX }, (_, i) => {
                    const level = i + 1;
                    const affordable = buildCost({ ...c.attributes, [k]: level }) <= max || level <= lv;
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`pip${level <= lv ? ' on' : ''}${level >= 9 ? ' t3' : level >= 7 ? ' t2' : ''}`}
                        disabled={!affordable}
                        onClick={() => setLevel(k, level === lv && level > 1 ? level - 1 : level)}
                        aria-label={`Poner ${A.name} a ${level}`}
                      />
                    );
                  })}
                </div>
                <div className="attr-ctrl">
                  <button type="button" className="btn btn-icon btn-sm" onClick={() => setLevel(k, lv - 1)} disabled={lv <= ATTR_MIN} aria-label={`Bajar ${A.name}`}>
                    <Minus />
                  </button>
                  <span className="attr-lv num">{lv}</span>
                  <button type="button" className="btn btn-icon btn-sm" onClick={() => setLevel(k, lv + 1)} disabled={lv >= ATTR_MAX || cost + nextCost > max} aria-label={`Subir ${A.name}`}>
                    <Plus />
                  </button>
                </div>
                <span className="attr-cost small faint">{lv < ATTR_MAX ? `+1 cuesta ${nextCost}` : 'Máximo'}</span>
              </div>
            );
          })}
          <p className="hint">Los niveles 7 y 8 cuestan 2 puntos; el 9 y el 10, 3. Especializarse sale caro, y las casillas cambian de color al subir de tramo.</p>
        </div>

        <div className="attr-info panel-quiet">
          <h3 className="attr-info-title">{def.name}</h3>
          <p className="muted">{def.summary}</p>
          <ul className="effects">
            {def.effects.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="small drawback">{def.drawback}</p>
          <p className="small faint">Coste total de nivel {c.attributes[focus]}: {costToReach(c.attributes[focus])} puntos.</p>
        </div>
      </div>

      <div className="compare">
        <div className="panel-title">
          <h3>Estadísticas resultantes</h3>
          <label className="field compare-select">
            <span className="sr-only">Comparar con</span>
            <select className="select" value={compareKey} onChange={(e) => setCompareKey(e.target.value)}>
              <option value="">Sin comparar</option>
              {compareOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="compare-layout">
          <Radar a={c.attributes} b={cmp?.attrs} />
          <DerivedTable d={derived} cmp={derivedCmp} input={input} />
        </div>
        <SituationalEffects input={input} />
      </div>
    </div>
  );
}

function Radar({ a, b }: { a: Attributes; b?: Attributes }) {
  const n = ATTRIBUTE_KEYS.length;
  const R = 92;
  const pt = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [120 + Math.cos(ang) * (R * v) / 10, 120 + Math.sin(ang) * (R * v) / 10] as const;
  };
  const poly = (attrs: Attributes) => ATTRIBUTE_KEYS.map((k, i) => pt(i, attrs[k]).join(',')).join(' ');
  return (
    <svg className="radar" viewBox="0 0 240 240" role="img" aria-label="Radar de atributos">
      {[2.5, 5, 7.5, 10].map((r) => (
        <polygon key={r} points={ATTRIBUTE_KEYS.map((_, i) => pt(i, r).join(',')).join(' ')} fill="none" stroke="rgba(239,231,218,.1)" />
      ))}
      {ATTRIBUTE_KEYS.map((k, i) => {
        const [x, y] = pt(i, 10);
        const [lx, ly] = pt(i, 12.2);
        return (
          <g key={k}>
            <line x1="120" y1="120" x2={x} y2={y} stroke="rgba(239,231,218,.08)" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#b3aa9c">
              {ATTRIBUTES[k].short}
            </text>
          </g>
        );
      })}
      {b && <polygon points={poly(b)} fill="rgba(95,227,208,.08)" stroke="#5fe3d0" strokeDasharray="4 3" />}
      <polygon points={poly(a)} fill="rgba(242,106,46,.22)" stroke="#f26a2e" strokeWidth="2" />
    </svg>
  );
}

const comma = (n: number, digits = 2) => n.toFixed(digits).replace('.', ',');

/** «×1,12», «+15 %» o «+10», según cómo se lea mejor el efecto. */
function effectText(op: 'mult' | 'add', v: number, asPercent: boolean): string {
  if (op === 'mult') return `×${comma(v)}`;
  const sign = v >= 0 ? '+' : '−';
  const abs = Math.abs(v);
  if (asPercent) return `${sign}${Math.round(abs * 100)}\u00a0%`;
  return `${sign}${comma(abs, Number.isInteger(abs) ? 0 : 2)}`;
}

const EXTRA_LABEL: Partial<Record<SituationalKey, string>> = {
  damageMult: 'Daño',
  damageTakenMult: 'Daño recibido',
  hitBonus: 'Acierto',
  fleeBonus: 'Huida',
  statusDurationMult: 'Duración de los estados',
};
const statLabel = (k: SituationalKey) => DERIVED_DISPLAY.find((x) => x.key === k)?.label ?? EXTRA_LABEL[k] ?? k;

function DerivedTable({ d, cmp, input }: { d: DerivedStats; cmp: DerivedStats | null; input: DerivedInput }) {
  const groups = [...new Set(DERIVED_DISPLAY.map((x) => x.group))];
  const [open, setOpen] = useState<DerivedKey | null>(null);
  return (
    <div className="derived">
      {groups.map((g) => (
        <div key={g} className="derived-group">
          <div className="label">{g}</div>
          {DERIVED_DISPLAY.filter((x) => x.group === g).map((x) => {
            const v = d[x.key];
            const delta = cmp ? v - cmp[x.key] : 0;
            const better = delta === 0 ? null : x.higherIsBetter ? delta > 0 : delta < 0;
            const expanded = open === x.key;
            return (
              <div key={x.key} className="derived-item">
                <button
                  type="button"
                  className="derived-row"
                  aria-expanded={expanded}
                  aria-controls={`why-${x.key}`}
                  onClick={() => setOpen(expanded ? null : x.key)}
                >
                  <span>{x.label}</span>
                  <span className="num">
                    {x.format(v)}
                    {cmp && Math.abs(delta) > 1e-9 && <em className={better ? 'up' : 'down'}>{better ? '▲' : '▼'}</em>}
                  </span>
                </button>
                {expanded && <Why id={`why-${x.key}`} input={input} k={x.key} format={x.format} />}
              </div>
            );
          })}
        </div>
      ))}
      <p className="hint derived-hint">Pulsa una estadística para ver de dónde sale.</p>
    </div>
  );
}

function Why({ id, input, k, format }: { id: string; input: DerivedInput; k: DerivedKey; format: (v: number) => string }) {
  const b = explainDerived(input, k);
  const asPercent = format(0.5).includes('%');
  return (
    <div id={id} className="why">
      <p className="why-formula">{b.formula}</p>
      {b.lines.length === 0 ? (
        <p className="small faint">Solo depende de los atributos: ni el distrito, ni las habilidades, ni el rasgo la cambian.</p>
      ) : (
        <dl className="why-lines">
          <div>
            <dt>Con tus atributos</dt>
            <dd className="num">{format(b.base)}</dd>
          </div>
          {b.lines.map((l) => (
            <div key={l.label}>
              <dt>{l.label}</dt>
              <dd className="num">{effectText(l.op, l.value, asPercent)}</dd>
            </div>
          ))}
          <div className="why-total">
            <dt>Total</dt>
            <dd className="num">{format(b.total)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/** Lo que cambia según el terreno, la actividad o el momento del combate. */
function SituationalEffects({ input }: { input: DerivedInput }) {
  const mods = situationalModifiersFor(input);
  const perks = MOVEMENT_PERKS.filter((p) => hasSource(input, p.source));
  if (mods.length === 0 && perks.length === 0) return null;
  return (
    <div className="situational">
      <h4>Según la situación</h4>
      <ul>
        {perks.map((p) => (
          <li key={`${sourceLabel(p.source)}-${p.text}`}>
            <span className="faint">{sourceLabel(p.source)}</span> {p.text}
          </li>
        ))}
        {mods.map((m) => (
          <li key={`${sourceLabel(m.source)}-${m.stat}-${m.text}`}>
            <span className="faint">{sourceLabel(m.source)}</span> {statLabel(m.stat)} {effectText(m.op, m.value, m.op === 'add' && Math.abs(m.value) < 1)}{' '}
            {m.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────────────────────────────────────── habilidades y rasgos
function AbilitiesTab({ c, set }: { c: Character; set: <K extends keyof Character>(k: K, v: Character[K]) => void }) {
  const toggle = (k: AbilityKey) => {
    if (c.abilities.includes(k)) return; // siempre hay 2: elige otra para sustituir
    set('abilities', [c.abilities[1], k]);
  };
  return (
    <div className="stack">
      <div>
        <h3>Habilidades</h3>
        <p className="muted small">Elige dos. Al elegir una nueva, sustituye a la más antigua. Algunas exigen un mínimo de atributo.</p>
        <div className="ability-grid">
          {ABILITY_KEYS.map((k) => {
            const A = ABILITIES[k];
            const ok = meetsRequirement(c.attributes, A.requirement);
            const selected = c.abilities.includes(k);
            return (
              <button key={k} type="button" className={`ability${selected ? ' selected' : ''}${ok ? '' : ' locked'}`} aria-pressed={selected} onClick={() => toggle(k)}>
                <span className="ability-head">
                  <strong>{A.name}</strong>
                  <span className={`chip ${A.kind === 'pasiva' ? '' : A.kind === 'combate' ? 'chip-ember' : 'chip-holo'}`}>{A.kind}</span>
                </span>
                <span className="small">{A.description}</span>
                <span className={`small ${ok ? 'faint' : 'req-bad'}`}>Requiere {describeRequirement(A.requirement, ATTR_NAMES)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3>Rasgo de personalidad</h3>
        <div className="option-list">
          <button type="button" className="option" aria-pressed={c.trait == null} onClick={() => set('trait', null)}>
            <strong>Sin rasgo</strong>
            <span className="small faint">Ni ventajas ni contrapartidas.</span>
          </button>
          {TRAIT_KEYS.map((k) => {
            const T = TRAITS[k];
            return (
              <button key={k} type="button" className="option" aria-pressed={c.trait === k} onClick={() => set('trait', k)}>
                <strong>{T.name}</strong>
                <span className="small pro">{T.pro}</span>
                <span className="small con">{T.con}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3>Defecto</h3>
        <p className="muted small">Opcional. Un defecto te da 2 puntos de atributo extra.</p>
        <div className="option-list">
          <button type="button" className="option" aria-pressed={c.defect == null} onClick={() => set('defect', null)}>
            <strong>Sin defecto</strong>
          </button>
          {DEFECT_KEYS.map((k) => (
            <button key={k} type="button" className="option" aria-pressed={c.defect === k} onClick={() => set('defect', k)}>
              <strong>
                {DEFECTS[k].name} <span className="chip chip-gold">+2 puntos</span>
              </strong>
              <span className="small con">{DEFECTS[k].description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────── estrategia
function StrategyTab({ c, set }: { c: Character; set: <K extends keyof Character>(k: K, v: Character[K]) => void }) {
  const s = c.strategy;
  return (
    <div className="stack">
      <p className="muted">Tu personaje actúa así cuando no respondes a tiempo en un combate o si te desconectas con el piloto automático activado.</p>
      <div className="field">
        <span>Estilo de combate</span>
        <Segmented label="Estilo de combate" value={s.combat} options={Object.entries(COMBAT_STRATEGY_LABEL).map(([value, label]) => ({ value: value as typeof s.combat, label }))} onChange={(v) => set('strategy', { ...s, combat: v })} />
      </div>
      <div className="field">
        <span>Huir cuando la salud baje del</span>
        <Segmented
          label="Umbral de huida"
          value={s.fleeThreshold}
          options={[
            { value: 0.2, label: '20%' },
            { value: 0.35, label: '35%' },
            { value: 0.5, label: '50%' },
          ]}
          onChange={(v) => set('strategy', { ...s, fleeThreshold: v as 0.2 | 0.35 | 0.5 })}
        />
      </div>
      <div className="field">
        <span>Propuestas de alianza en piloto automático</span>
        <Segmented label="Alianzas automáticas" value={s.alliance} options={Object.entries(ALLIANCE_POLICY_LABEL).map(([value, label]) => ({ value: value as typeof s.alliance, label }))} onChange={(v) => set('strategy', { ...s, alliance: v })} />
      </div>
    </div>
  );
}
