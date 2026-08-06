import { describe, expect, it } from 'vitest';
import {
  alignToAxis,
  mergeNearFar,
  type MergeGroup,
  type TimedSeries,
} from '../forecastMerge.ts';

const WIND: MergeGroup = { gate: ['spd', 'dir'], carry: [] };
const WAVE: MergeGroup = { gate: ['h', 'dir'], carry: ['per'] };

const HOUR_MS = 3600_000;
const T0 = Date.parse('2026-08-08T00:00:00Z');

/** Achse von `hours` Stunden, `offsetH` Stunden nach T0 beginnend. */
function axisOf(hours: number, offsetH = 0): string[] {
  return Array.from({ length: hours }, (_, i) =>
    new Date(T0 + (offsetH + i) * HOUR_MS).toISOString(),
  );
}

function timed(
  hours: number,
  values: Record<string, (number | null)[]>,
  offsetH = 0,
): TimedSeries {
  return { times: axisOf(hours, offsetH), values };
}

/** Konstante Serie. */
const c = (hours: number, v: number | null): (number | null)[] =>
  Array.from({ length: hours }, () => v);

describe('alignToAxis — Umreihung per Zeitstempel, nie per Index', () => {
  it('gibt die deckungsgleiche Achse unverändert zurück (Schnellpfad)', () => {
    const axis = axisOf(4);
    const out = alignToAxis(axis, timed(4, { spd: [1, 2, 3, 4] }), ['spd']);
    expect(out['spd']).toEqual([1, 2, 3, 4]);
  });

  it('reiht eine VERSETZTE Achse auf die Zeitstempel, nicht auf die Indizes', () => {
    const axis = axisOf(6); // 00:00 .. 05:00
    // Quelle beginnt erst um 03:00 — ein indexbasierter Merge würde die 9
    // fälschlich auf Stunde 0 legen.
    const out = alignToAxis(axis, timed(3, { spd: [9, 8, 7] }, 3), ['spd']);
    expect(out['spd']).toEqual([null, null, null, 9, 8, 7]);
  });

  it('ignoriert Zeitstempel, die nicht auf der Achse liegen (halbstündig)', () => {
    const axis = axisOf(3);
    const half: TimedSeries = {
      times: [
        new Date(T0).toISOString(),
        new Date(T0 + 30 * 60_000).toISOString(),
        new Date(T0 + HOUR_MS).toISOString(),
      ],
      values: { spd: [1, 99, 2] },
    };
    expect(alignToAxis(axis, half, ['spd'])['spd']).toEqual([1, 2, null]);
  });

  it('macht aus null/NaN/fehlender Serie durchgehend null', () => {
    const axis = axisOf(3);
    expect(alignToAxis(axis, null, ['spd'])['spd']).toEqual([null, null, null]);
    const out = alignToAxis(axis, timed(3, { spd: [1, NaN, null] }), ['spd', 'fehlt']);
    expect(out['spd']).toEqual([1, null, null]);
    expect(out['fehlt']).toEqual([null, null, null]);
  });
});

describe('mergeNearFar — Nahfeld vor Fernfeld, aber nur als ganze Gruppe', () => {
  it('nimmt die kurzen Nah-Stunden und danach das Fernfeld', () => {
    const axis = axisOf(6);
    const near = timed(3, { spd: c(3, 20), dir: c(3, 10) });
    const far = timed(6, { spd: c(6, 12), dir: c(6, 350) });
    const { values, nearReachHours } = mergeNearFar(axis, near, far, WIND);
    expect(values['spd']).toEqual([20, 20, 20, 12, 12, 12]);
    expect(values['dir']).toEqual([10, 10, 10, 350, 350, 350]);
    expect(nearReachHours).toBe(3);
  });

  it('reiht ein versetztes Nahfeld korrekt ein (kein Index-Versatz)', () => {
    const axis = axisOf(6);
    const near = timed(2, { spd: c(2, 20), dir: c(2, 10) }, 2); // 02:00, 03:00
    const far = timed(6, { spd: c(6, 12), dir: c(6, 350) });
    const { values, nearReachHours } = mergeNearFar(axis, near, far, WIND);
    expect(values['spd']).toEqual([12, 12, 20, 20, 12, 12]);
    expect(nearReachHours).toBe(4);
  });

  // --- DIE DEGRADATIONS-INVARIANTE ----------------------------------------
  // Der Hybrid darf nie schlechter sein als der Zustand vor seiner Einführung.
  it('near === null ⇒ Ergebnis ist identisch mit "nur Fernfeld"', () => {
    const axis = axisOf(5);
    const far = timed(5, { spd: [1, 2, 3, 4, 5], dir: [9, 8, 7, 6, 5] });
    const hybrid = mergeNearFar(axis, null, far, WIND);
    const farOnly = mergeNearFar(axis, null, far, WIND);
    expect(hybrid.values).toEqual(farOnly.values);
    expect(hybrid.values['spd']).toEqual([1, 2, 3, 4, 5]);
    expect(hybrid.nearReachHours).toBe(0);
  });

  it('Nahfeld vorhanden, aber durchgehend null ⇒ ebenfalls nur Fernfeld', () => {
    const axis = axisOf(4);
    const near = timed(4, { spd: c(4, null), dir: c(4, null) });
    const far = timed(4, { spd: c(4, 12), dir: c(4, 350) });
    const { values, nearReachHours } = mergeNearFar(axis, near, far, WIND);
    expect(values['spd']).toEqual([12, 12, 12, 12]);
    expect(nearReachHours).toBe(0);
  });

  it('Nahfeld mit Achse ohne Überlappung ⇒ nur Fernfeld', () => {
    const axis = axisOf(3);
    const near = timed(3, { spd: c(3, 20), dir: c(3, 10) }, 100);
    const far = timed(3, { spd: c(3, 12), dir: c(3, 350) });
    expect(mergeNearFar(axis, near, far, WIND).nearReachHours).toBe(0);
  });

  // --- DIE PAARUNGS-GARANTIE ----------------------------------------------
  // Nie Fahrt aus einem Modell und Richtung aus dem anderen.
  it('fehlt die Nah-RICHTUNG, kommt die Stunde KOMPLETT aus dem Fernfeld', () => {
    const axis = axisOf(3);
    const near = timed(3, { spd: [20, 21, 22], dir: [10, null, 12] });
    const far = timed(3, { spd: [12, 13, 14], dir: [350, 351, 352] });
    const { values } = mergeNearFar(axis, near, far, WIND);
    // Stunde 1: BEIDE Werte aus dem Fernfeld — nicht 21 mit 351.
    expect(values['spd']).toEqual([20, 13, 22]);
    expect(values['dir']).toEqual([10, 351, 12]);
  });

  it('fehlt die Nah-FAHRT, ebenso — symmetrisch', () => {
    const axis = axisOf(3);
    const near = timed(3, { spd: [20, null, 22], dir: [10, 11, 12] });
    const far = timed(3, { spd: [12, 13, 14], dir: [350, 351, 352] });
    const { values } = mergeNearFar(axis, near, far, WIND);
    expect(values['spd']).toEqual([20, 13, 22]);
    expect(values['dir']).toEqual([10, 351, 12]);
  });

  it('ein Loch mitten drin verkürzt die Reichweite nicht', () => {
    const axis = axisOf(5);
    const near = timed(5, { spd: [20, null, 22, 23, null], dir: c(5, 10) });
    const far = timed(5, { spd: c(5, 12), dir: c(5, 350) });
    const { values, nearReachHours } = mergeNearFar(axis, near, far, WIND);
    expect(values['spd']).toEqual([20, 12, 22, 23, 12]);
    // Letzte NAH-getragene Stunde ist Index 3 → Reichweite 4, nicht 5.
    expect(nearReachHours).toBe(4);
  });

  it('füllt Löcher des Fernfelds, wo das Nahfeld Daten hat', () => {
    const axis = axisOf(3);
    const near = timed(3, { spd: c(3, 20), dir: c(3, 10) });
    const far = timed(3, { spd: [12, null, 14], dir: [350, null, 352] });
    expect(mergeNearFar(axis, near, far, WIND).values['spd']).toEqual([20, 20, 20]);
  });

  it('bleibt ohne beide Quellen leer statt zu werfen', () => {
    const { values, nearReachHours } = mergeNearFar(axisOf(2), null, null, WIND);
    expect(values['spd']).toEqual([null, null]);
    expect(nearReachHours).toBe(0);
  });

  it('leere Achse ⇒ leeres Ergebnis, kein Wurf', () => {
    const { values, nearReachHours } = mergeNearFar([], null, null, WIND);
    expect(values['spd']).toEqual([]);
    expect(nearReachHours).toBe(0);
  });
});

describe('mergeNearFar — Wellen: Tor ist (Höhe, Richtung), Periode wird mitgetragen', () => {
  it('nimmt bei vollständigem Tor alle drei Serien aus dem Nahfeld', () => {
    const axis = axisOf(2);
    const near = timed(2, { h: c(2, 1.8), dir: c(2, 20), per: c(2, 6) });
    const far = timed(2, { h: c(2, 1.0), dir: c(2, 200), per: c(2, 4) });
    const { values } = mergeNearFar(axis, near, far, WAVE);
    expect(values['h']).toEqual([1.8, 1.8]);
    expect(values['per']).toEqual([6, 6]);
  });

  it('fehlende PERIODE verwirft die Nah-Stunde NICHT (sie entscheidet nichts)', () => {
    const axis = axisOf(2);
    const near = timed(2, { h: c(2, 1.8), dir: c(2, 20), per: [null, 6] });
    const far = timed(2, { h: c(2, 1.0), dir: c(2, 200), per: c(2, 4) });
    const { values, nearReachHours } = mergeNearFar(axis, near, far, WAVE);
    expect(values['h']).toEqual([1.8, 1.8]);
    // Die Periode folgt dem Tor: Stunde 0 bleibt null statt die 4 des
    // Fernfelds zu borgen — das wäre eine Modellmischung in einer Stunde.
    expect(values['per']).toEqual([null, 6]);
    expect(nearReachHours).toBe(2);
  });

  it('fehlende Nah-RICHTUNG holt das ganze Tripel aus dem Fernfeld', () => {
    const axis = axisOf(2);
    const near = timed(2, { h: c(2, 1.8), dir: [null, 20], per: c(2, 6) });
    const far = timed(2, { h: c(2, 1.0), dir: c(2, 200), per: c(2, 4) });
    const { values } = mergeNearFar(axis, near, far, WAVE);
    expect(values['h']).toEqual([1.0, 1.8]);
    expect(values['dir']).toEqual([200, 20]);
    expect(values['per']).toEqual([4, 6]);
  });
});
