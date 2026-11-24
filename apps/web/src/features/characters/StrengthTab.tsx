import { useEffect, useRef, useState } from 'react';
import type { Character } from '@ceniza/shared';
import type { StrengthRequest, StrengthResult } from './strength.worker';

const pct = (v: number) => `${Math.round(v * 100)}\u00a0%`;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const argBy = (xs: number[], better: (a: number, b: number) => boolean) => xs.reduce((best, v, i) => (better(v, xs[best]) ? i : best), 0);

/** Fondo de cada casilla: turquesa si ganas más de la mitad, ascua si pierdes; neutro cerca del 50 %. */
function tint(p: number): string | undefined {
  const d = p - 0.5;
  if (Math.abs(d) < 0.04) return undefined;
  const alpha = Math.min(0.34, Math.abs(d) * 0.9).toFixed(3);
  return d > 0 ? `rgba(95, 227, 208, ${alpha})` : `rgba(242, 106, 46, ${alpha})`;
}

/**
 * Prueba de fuerza: el personaje contra los ocho arquetipos en los escenarios del simulador de
 * equilibrio (docs/BALANCE.md). Se recalcula sola al cambiar la build.
 */
export function StrengthTab({ c }: { c: Character }) {
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const [result, setResult] = useState<StrengthResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify({ attributes: c.attributes, abilities: c.abilities, trait: c.trait, defect: c.defect, district: c.district });

  useEffect(() => {
    const w = new Worker(new URL('./strength.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<StrengthResult>) => {
      if (e.data.id !== seq.current) return; // resultado de una build anterior
      setResult(e.data);
      setBusy(false);
    };
    w.onerror = () => {
      setFailed(true);
      setBusy(false);
    };
    worker.current = w;
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    const id = ++seq.current;
    setBusy(true);
    const timer = window.setTimeout(() => {
      const msg: StrengthRequest = { id, build: JSON.parse(key) };
      worker.current?.postMessage(msg);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [key]);

  if (failed) return <p className="muted">Este navegador no ha podido ejecutar la simulación. Prueba a recargar la página o a usar otro navegador.</p>;
  if (!result) return <p className="muted" aria-live="polite">Simulando combates…</p>;

  const { scenarios, rivals, points } = result;
  const byScenario = points.map(avg);
  const byRival = rivals.map((_, j) => avg(points.map((row) => row[j])));
  const overall = avg(byScenario);
  const best = argBy(byScenario, (a, b) => a > b);
  const worst = argBy(byScenario, (a, b) => a < b);
  const hardest = argBy(byRival, (a, b) => a < b);
  const easiest = argBy(byRival, (a, b) => a > b);

  return (
    <div className="stack strength-tab">
      <div className="strength-head">
        <p className="strength-total">
          <span className="num">{pct(overall)}</span> de media contra los arquetipos
        </p>
        <p className="muted">
          Tu mejor situación: {scenarios[best].name.toLowerCase()} ({pct(byScenario[best])}). La peor: {scenarios[worst].name.toLowerCase()} (
          {pct(byScenario[worst])}). El rival más duro es {rivals[hardest].name} y el más asequible, {rivals[easiest].name}. Un 50 % es pelear de igual a
          igual.
        </p>
        <p className="small faint" aria-live="polite">
          {busy ? 'Recalculando con los cambios…' : `${result.runs} combates simulados por casilla. Ganar cuenta 1; que nadie caiga, medio.`}
        </p>
      </div>

      <div className="strength-scroll" tabIndex={0} aria-label="Resultados por situación y rival">
        <table className={`strength${busy ? ' stale' : ''}`}>
          <caption className="sr-only">Porcentaje de puntos de tu personaje contra cada arquetipo en cada situación</caption>
          <thead>
            <tr>
              <th scope="col">Situación</th>
              {rivals.map((r) => (
                <th key={r.key} scope="col">
                  {r.name}
                </th>
              ))}
              <th scope="col">Media</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s, i) => (
              <tr key={s.key}>
                <th scope="row" title={s.description}>
                  {s.name}
                </th>
                {points[i].map((v, j) => (
                  <td key={rivals[j].key} className="num" style={{ background: tint(v) }}>
                    {pct(v)}
                  </td>
                ))}
                <td className="num strength-avg">{pct(byScenario[i])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Media</th>
              {byRival.map((v, j) => (
                <td key={rivals[j].key} className="num">
                  {pct(v)}
                </td>
              ))}
              <td className="num strength-avg">{pct(overall)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <dl className="strength-scenarios">
        {scenarios.map((s) => (
          <div key={s.key}>
            <dt>{s.name}</dt>
            <dd className="muted small">{s.description}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
