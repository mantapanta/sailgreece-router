import { describe, expect, it } from 'vitest';
import {
  MIN_BARB_SPACING_PX,
  type BarbPoint,
  onePerIsland,
  pixelDistance,
  thinBarbs,
  windFieldFor,
} from '../windField.ts';

const barb = (
  key: string,
  lat: number,
  lon: number,
  priority = 2,
  knots = 15,
): BarbPoint => ({ key, lat, lon, dirDeg: 0, knots, priority });

/** Kykladen-nahe Lage: Plätze auf derselben Insel liegen wenige sm auseinander. */
const PAROS = [
  barb('paros-naoussa', 37.125, 25.235),
  barb('paros-parikia', 37.085, 25.15),
  barb('paros-piso-livadi', 37.02, 25.27),
];
const NAXOS = barb('naxos-chora', 37.105, 25.375);
const SERIFOS = barb('serifos-livadi', 37.1458, 24.5217);

describe('pixelDistance — Mercator, nicht Luftlinie', () => {
  it('wächst mit dem Zoom: dieselbe Strecke, doppelt so viele Pixel je Stufe', () => {
    const a = { lat: 37.0, lon: 24.5 };
    const b = { lat: 37.0, lon: 24.6 };
    expect(pixelDistance(a, b, 9)).toBeCloseTo(pixelDistance(a, b, 8) * 2, 6);
  });

  it('rechnet Breitengrade um 1/cos(φ) länger als Längengrade', () => {
    const nordSued = pixelDistance(
      { lat: 37.0, lon: 24.5 },
      { lat: 37.1, lon: 24.5 },
      8,
    );
    const ostWest = pixelDistance(
      { lat: 37.0, lon: 24.5 },
      { lat: 37.0, lon: 24.6 },
      8,
    );
    // Auf 37° N ist cos(φ) ≈ 0,8 — Nord-Süd muss rund 25 % mehr Pixel ergeben.
    expect(nordSued / ostWest).toBeCloseTo(1 / Math.cos((37.05 * Math.PI) / 180), 2);
  });
});

describe('onePerIsland — fünf Pfeile über Paros sind kein Windfeld', () => {
  const islandOf = (key: string) => key.split('-')[0] ?? null;

  it('lässt je Insel genau eine Fieder übrig', () => {
    const result = onePerIsland([...PAROS, NAXOS], islandOf);
    expect(result).toHaveLength(2);
    expect(new Set(result.map((p) => islandOf(p.key)))).toEqual(
      new Set(['paros', 'naxos']),
    );
  });

  it('behält die wichtigere Fieder, nicht die erstbeste', () => {
    const result = onePerIsland(
      [barb('paros-a', 37.1, 25.2, 2), barb('paros-b', 37.12, 25.24, 0)],
      islandOf,
    );
    expect(result.map((p) => p.key)).toEqual(['paros-b']);
  });

  it('ist deterministisch, wenn die Priorität gleich ist', () => {
    const forward = onePerIsland(PAROS, islandOf).map((p) => p.key);
    const backward = onePerIsland([...PAROS].reverse(), islandOf).map((p) => p.key);
    expect(forward).toEqual(backward);
  });

  it('verschmilzt Punkte ohne Insel nicht stillschweigend zu einer Sammelinsel', () => {
    const result = onePerIsland([barb('a', 37, 24), barb('b', 38, 25)], () => null);
    expect(result).toHaveLength(2);
  });
});

describe('thinBarbs — Überladung ist eine Frage von Pixeln, nicht von Seemeilen', () => {
  it('lässt bei Zoom 8 (ganze Kykladen) nur weit auseinander liegende Fiedern stehen', () => {
    // Naxos und Paros trennen rund 12 sm — herausgezoomt ist das kein Abstand.
    const kept = thinBarbs([PAROS[0]!, NAXOS], 8);
    expect(kept).toHaveLength(1);
  });

  it('zeigt dieselben zwei Inseln, sobald man hineinzoomt', () => {
    const kept = thinBarbs([PAROS[0]!, NAXOS], 12);
    expect(kept).toHaveLength(2);
  });

  it('opfert nie die entscheidungsrelevante Fieder für eine beliebige Nachbarin', () => {
    const heute = barb('naxos-chora', 37.105, 25.375, 0);
    const nachbar = barb('antiparos-x', 37.1, 25.37, 2);
    const kept = thinBarbs([nachbar, heute], 8);
    expect(kept.map((p) => p.key)).toEqual(['naxos-chora']);
  });

  it('ist unabhängig von der Reihenfolge der Bibliothek', () => {
    const points = [...PAROS, NAXOS, SERIFOS];
    const a = thinBarbs(points, 9).map((p) => p.key);
    const b = thinBarbs([...points].reverse(), 9).map((p) => p.key);
    expect(a).toEqual(b);
  });

  it('hält den geforderten Mindestabstand zwischen allen gezeigten Fiedern ein', () => {
    const feld = [...PAROS, NAXOS, SERIFOS];
    const kept = thinBarbs(feld, 9);
    for (let i = 0; i < kept.length; i++) {
      for (let j = i + 1; j < kept.length; j++) {
        expect(pixelDistance(kept[i]!, kept[j]!, 9)).toBeGreaterThanOrEqual(
          MIN_BARB_SPACING_PX,
        );
      }
    }
  });
});

describe('windFieldFor — was gezeigt wird und was fehlt', () => {
  const islandOf = (key: string) => key.split('-')[0] ?? null;

  it('meldet die ausgelassenen Inseln, statt still zu kürzen', () => {
    const field = windFieldFor([...PAROS, NAXOS, SERIFOS], islandOf, 8);
    // Drei Inseln bleiben nach der Insel-Reduktion, gezeigt werden weniger.
    expect(field.islands).toBe(3);
    expect(field.shown.length + field.hidden).toBe(3);
    expect(field.hidden).toBeGreaterThan(0);
  });

  it('zählt Plätze derselben Insel nicht als ausgelassene Fiedern', () => {
    // Die drei Paros-Plätze verschwinden durch die Insel-Regel, nicht durch den
    // Mindestabstand — sonst meldete die Legende ein Feld, das es nie gab.
    const field = windFieldFor(PAROS, islandOf, 12);
    expect(field.islands).toBe(1);
    expect(field.hidden).toBe(0);
    expect(field.shown).toHaveLength(1);
  });

  it('zeigt beim Hineinzoomen mehr, ohne dass sich die Eingabe ändert', () => {
    const points = [...PAROS, NAXOS, SERIFOS];
    const weit = windFieldFor(points, islandOf, 8).shown.length;
    const nah = windFieldFor(points, islandOf, 12).shown.length;
    expect(nah).toBeGreaterThan(weit);
  });
});
