import { describe, expect, it } from 'vitest';
import { actorView as actor } from '../../test/fixtures';
import { participantCard, statusText } from './card';

const NB = ' ';
const ctx = { me: 'yo', now: 100_000, bot: null, trip: null };

describe('tarjeta del participante', () => {
  it('un bot lleva su personalidad y su dificultad', () => {
    const c = participantCard(actor('b'), { ...ctx, bot: { difficulty: 'normal', personality: 'agresivo', playstyle: 'cazador' } });
    expect(c.kind).toBe('Bot');
    expect(c.bot).toBe('Agresivo · Normal');
  });

  it('si lo ves, a cuántas casillas está y cuánto tardas', () => {
    expect(participantCard(actor('b'), { ...ctx, trip: { cells: 12, eta: 25_000 } }).where).toBe(`A 12${NB}casillas · ≈${NB}25${NB}s`);
  });

  it('si no lo ves, desde cuándo; si nunca lo has visto, lo dice', () => {
    expect(participantCard(actor('b', { seen: false }), { ...ctx, lastSeen: { x: 1, y: 1, at: 20_000 } }).where).toBe(`Fuera de tu vista desde hace 1${NB}min 20${NB}s`);
    expect(participantCard(actor('b', { seen: false }), ctx).where).toBe('Aún no ha entrado en tu vista');
  });

  it('el propio jugador y los caídos no llevan distancia', () => {
    expect(participantCard(actor('yo', { kind: 'human', userId: 'u-yo' }), ctx)).toEqual({ kind: 'Humano', bot: null, status: 'Tú', where: null });
    expect(participantCard(actor('b', { alive: false, place: 4, cause: 'abandono' }), ctx).where).toBeNull();
  });

  it('si cae con la tarjeta abierta, la tarjeta sigue siendo válida', () => {
    const trip = { cells: 3, eta: 4000 };
    expect(participantCard(actor('b'), { ...ctx, trip }).where).not.toBeNull();
    expect(participantCard(actor('b', { alive: false, place: 2, cause: 'desconexion' }), { ...ctx, trip })).toEqual({
      kind: 'Bot',
      bot: null,
      status: 'Fuera por desconexión · puesto 2',
      where: null,
    });
  });

  it('en la tarjeta, el estado solo aparece si dice algo que no diga ya la tarjeta', () => {
    expect(participantCard(actor('b'), ctx).status).toBeNull();
    expect(participantCard(actor('h', { kind: 'human', userId: 'u-h' }), ctx).status).toBeNull();
    expect(participantCard(actor('h', { kind: 'human', userId: 'u-h', connected: false, control: 'piloto' }), ctx).status).toBe('Sin conexión · piloto automático');
    expect(participantCard(actor('b', { place: 1 }), ctx).status).toBe('Ha ganado');
  });

  it('el estado es el de la lista de participantes, sin género', () => {
    expect(statusText(actor('b', { place: 1 }), 'yo')).toBe('Ha ganado');
    expect(statusText(actor('h', { kind: 'human', connected: false, control: 'piloto' }), 'yo')).toBe('Sin conexión · piloto automático');
    expect(statusText(actor('b'), 'yo')).toBe('Bot');
  });
});
