/**
 * FREIE HANDPLANUNG (domain/manualPlan.ts) — die drei Regeln des Moduls, je
 * eine Gruppe: jeder Tag hat ein Ziel, jede Verbindung ist zugelassen, die
 * Kette bleibt geschlossen.
 */

import { describe, expect, it } from 'vitest';
import {
  emptyManualPlan,
  planIsEmpty,
  planMitRahmen,
  setDayStopover,
  setDayTarget,
} from '../manualPlan.ts';
import { islandAtEndOfDay, stagesOf, PlanSchema } from '../schema/plan.ts';
import { DEFAULT_PARAMS } from '../schema/params.ts';
import type { Island } from '../schema/island.ts';
import { makeLeg, makePlace, makeSnapshot, TRIP_START } from './fixtures.ts';

const PARAMS = {
  ...DEFAULT_PARAMS,
  tripStartDate: TRIP_START,
  tripLengthDays: 5,
  baseIslandId: 'basis',
};

/**
 * Vier Inseln in einer Reihe nach Süden, alle im offenen Wasser: der Kurs
 * zwischen je zweien liegt landfrei, damit `seaRoute` in den Erzeugungs-Fällen
 * wirklich einen Weg findet.
 */
const ISLANDS: Island[] = [
  { id: 'basis', name: 'Basis', coordinates: { lat: 37.9, lon: 23.7 } },
  { id: 'alpha', name: 'Alpha', coordinates: { lat: 37.5, lon: 24.3 } },
  { id: 'beta', name: 'Beta', coordinates: { lat: 37.1, lon: 24.7 } },
  { id: 'gamma', name: 'Gamma', coordinates: { lat: 36.7, lon: 25.1 } },
];

function snapshot() {
  return makeSnapshot({
    params: PARAMS,
    library: {
      islands: ISLANDS,
      places: ISLANDS.map((i) =>
        makePlace({ id: `${i.id}-hafen`, islandId: i.id, coordinates: i.coordinates }),
      ),
      invalidPlaces: [],
      // NUR die Verbindung Basis→Alpha ist kuratiert. Alles andere muss die
      // Handplanung erzeugen — genau das ist "alle Verbindungen zugelassen".
      legs: [
        makeLeg({
          id: 'basis--alpha',
          fromIslandId: 'basis',
          toIslandId: 'alpha',
          fromPlaceId: 'basis-hafen',
          toPlaceId: 'alpha-hafen',
          distanceNm: 30,
        }),
      ],
      variants: [],
    },
  });
}

describe('emptyManualPlan', () => {
  it('legt jeden Törntag als Hafentag an die Basis', () => {
    const plan = emptyManualPlan(PARAMS);
    expect(plan.days).toHaveLength(5);
    expect(plan.days.every((d) => d.kind === 'harbour')).toBe(true);
    expect(planIsEmpty(plan)).toBe(true);
    // Der leere Törn muss durch dasselbe Schema wie jeder gespeicherte Plan.
    expect(PlanSchema.safeParse(plan).success).toBe(true);
  });
});

/**
 * DER RAHMEN WÄCHST MITTEN IM TÖRN (Skipper 2026-08-12: „die Routing App endet
 * am Tag zwölf am Mittwoch, aber wir müssen ja Freitagabend 19:00 wieder in
 * Marina Alimos sein"). Der laufende Plan trug zwölf Tage, der neue Rahmen
 * vierzehn — und die zwei neuen Tage standen in der Achse, ohne planbar zu sein.
 */
describe('planMitRahmen — der gespeicherte Plan und ein gewachsener Rahmen', () => {
  it('ohne die Ergänzung ist der neue Tag nicht planbar', () => {
    const kurz = emptyManualPlan({ ...PARAMS, tripLengthDays: 3 });
    // Das ist der Befund, nicht bloss eine Anzeigefrage: der Solver-freie
    // Editor lehnt einen Tag ab, den der Plan nicht kennt.
    expect(setDayTarget(kurz, 5, { islandId: 'alpha' }, snapshot())).toBeNull();
  });

  it('ergänzt die fehlenden Tage als Hafentage — und dann geht es', () => {
    const kurz = emptyManualPlan({ ...PARAMS, tripLengthDays: 3 });
    const lang = planMitRahmen(kurz, PARAMS);
    expect(lang.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
    expect(lang.days.every((d) => d.kind === 'harbour')).toBe(true);
    expect(PlanSchema.safeParse(lang).success).toBe(true);
    expect(setDayTarget(lang, 5, { islandId: 'alpha' }, snapshot())).not.toBeNull();
  });

  it('die neuen Tage liegen dort, wo der Plan zuletzt steht — nicht an der Basis', () => {
    const snap = snapshot();
    const kurz = emptyManualPlan({ ...PARAMS, tripLengthDays: 3 });
    // Tag 3 endet auf Alpha; die ergänzten Tage 4 und 5 bleiben dort liegen.
    const mitZiel = setDayTarget(kurz, 3, { islandId: 'alpha' }, snap)!.plan;
    const lang = planMitRahmen(mitZiel, PARAMS);
    expect(islandAtEndOfDay(lang, 3)).toBe('alpha');
    expect(islandAtEndOfDay(lang, 4)).toBe('alpha');
    expect(islandAtEndOfDay(lang, 5)).toBe('alpha');
  });

  it('ist der Plan schon lang genug, kommt er UNVERÄNDERT zurück', () => {
    const plan = emptyManualPlan(PARAMS);
    expect(planMitRahmen(plan, PARAMS)).toBe(plan);
  });

  it('schneidet NICHTS ab — ein längerer Plan behält seine Tage', () => {
    const lang = emptyManualPlan({ ...PARAMS, tripLengthDays: 8 });
    const gezogen = planMitRahmen(lang, PARAMS);
    expect(gezogen.days).toHaveLength(8);
  });
});

describe('setDayTarget', () => {
  it('nimmt die kuratierte Etappe, wenn es eine gibt', () => {
    const snap = snapshot();
    const change = setDayTarget(emptyManualPlan(PARAMS), 1, { islandId: 'alpha' }, snap);
    expect(change).not.toBeNull();
    expect(change!.customLegs).toEqual([]);
    const tag1 = change!.plan.days.find((d) => d.day === 1)!;
    expect(tag1.kind).toBe('stage');
    expect(tag1.kind === 'stage' && tag1.legIds).toEqual(['basis--alpha']);
  });

  it('ERZEUGT die Verbindung, wenn die Bibliothek sie nicht kennt', () => {
    const snap = snapshot();
    const change = setDayTarget(emptyManualPlan(PARAMS), 1, { islandId: 'gamma' }, snap);
    expect(change).not.toBeNull();
    expect(change!.customLegs.map((l) => l.id)).toEqual(['basis--gamma']);
    // Erzeugt heisst benannt: die Etappe trägt ihren Vorbehalt sichtbar.
    expect(change!.customLegs[0]!.abgeleitet).toBe(true);
    expect(change!.customLegs[0]!.windWarnings[0]).toMatch(/nicht kuratiert/);
    expect(change!.customLegs[0]!.distanceNm).toBeGreaterThan(0);
  });

  it('macht den Tag zum Hafentag, wenn kein Ziel gewählt wird', () => {
    const snap = snapshot();
    const mitZiel = setDayTarget(
      emptyManualPlan(PARAMS),
      1,
      { islandId: 'alpha' },
      snap,
    )!;
    const zurueck = setDayTarget(mitZiel.plan, 1, { islandId: null }, snap)!;
    expect(zurueck.plan.days.find((d) => d.day === 1)!.kind).toBe('harbour');
  });

  it('nimmt den Liegeplatz mit, wenn einer gewählt wird', () => {
    const snap = snapshot();
    const change = setDayTarget(
      emptyManualPlan(PARAMS),
      2,
      { islandId: 'beta', placeId: 'beta-hafen' },
      snap,
    )!;
    const tag2 = change.plan.days.find((d) => d.day === 2)!;
    expect(tag2.kind === 'stage' && tag2.toPlaceId).toBe('beta-hafen');
  });
});

describe('die Kette bleibt geschlossen', () => {
  it('verbindet den Folgetag neu, wenn seine Ausgangsinsel sich ändert', () => {
    const snap = snapshot();
    let plan = setDayTarget(emptyManualPlan(PARAMS), 1, { islandId: 'alpha' }, snap)!
      .plan;
    plan = setDayTarget(plan, 2, { islandId: 'gamma' }, snap)!.plan;
    // Tag 1 umlegen: Tag 2 behält Gamma als Ziel, startet jetzt aber von Beta.
    const change = setDayTarget(plan, 1, { islandId: 'beta' }, snap)!;

    expect(islandAtEndOfDay(change.plan, 1)).toBe('beta');
    expect(islandAtEndOfDay(change.plan, 2)).toBe('gamma');
    const tag2 = change.plan.days.find((d) => d.day === 2)!;
    expect(tag2.kind === 'stage' && tag2.legIds).toEqual(['beta--gamma']);
    expect(change.customLegs.map((l) => l.id)).toContain('beta--gamma');
  });

  it('macht den Folgetag zum Hafentag, wenn er auf dasselbe Ziel fällt', () => {
    const snap = snapshot();
    let plan = setDayTarget(emptyManualPlan(PARAMS), 1, { islandId: 'alpha' }, snap)!
      .plan;
    plan = setDayTarget(plan, 2, { islandId: 'beta' }, snap)!.plan;
    // Tag 1 auf Beta: Tag 2 wollte nach Beta — dort liegt das Boot schon.
    const change = setDayTarget(plan, 1, { islandId: 'beta' }, snap)!;
    expect(change.plan.days.find((d) => d.day === 2)!.kind).toBe('harbour');
    expect(islandAtEndOfDay(change.plan, 2)).toBe('beta');
  });

  it('lässt Hafentage MITWANDERN statt zurück zur Basis zu segeln', () => {
    // Der leere Törn ist fünfmal "Hafentag an der Basis". Setzt der Skipper
    // Tag 1 auf Alpha, heisst das für die übrigen Tage "wir bleiben" — nicht
    // "wir fahren morgen wieder heim".
    const snap = snapshot();
    const change = setDayTarget(emptyManualPlan(PARAMS), 1, { islandId: 'alpha' }, snap)!;
    expect(stagesOf(change.plan)).toHaveLength(1);
    for (const day of [2, 3, 4, 5]) {
      expect(change.plan.days.find((d) => d.day === day)!.kind).toBe('harbour');
      expect(islandAtEndOfDay(change.plan, day)).toBe('alpha');
    }
  });

  it('lässt frühere Tage unangetastet', () => {
    const snap = snapshot();
    let plan = setDayTarget(emptyManualPlan(PARAMS), 1, { islandId: 'alpha' }, snap)!
      .plan;
    const tag1Vorher = plan.days.find((d) => d.day === 1)!;
    plan = setDayTarget(plan, 3, { islandId: 'gamma' }, snap)!.plan;
    expect(plan.days.find((d) => d.day === 1)).toEqual(tag1Vorher);
  });

  it('bleibt ein Plan, den das Schema akzeptiert', () => {
    const snap = snapshot();
    let plan = emptyManualPlan(PARAMS);
    for (const [day, islandId] of [
      [1, 'alpha'],
      [2, 'gamma'],
      [3, 'beta'],
      [4, 'basis'],
    ] as const) {
      plan = setDayTarget(plan, day, { islandId }, snap)!.plan;
    }
    expect(PlanSchema.safeParse(plan).success).toBe(true);
    expect(stagesOf(plan).map((s) => s.toIslandId)).toEqual([
      'alpha',
      'gamma',
      'beta',
      'basis',
    ]);
  });
});

describe('setDayStopover', () => {
  it('legt den Tag über eine dritte Insel, auch ohne kuratierte Hälften', () => {
    const snap = snapshot();
    const plan = setDayTarget(emptyManualPlan(PARAMS), 1, { islandId: 'gamma' }, snap)!
      .plan;
    const change = setDayStopover(plan, 1, { islandId: 'beta' }, snap)!;
    const tag1 = change.plan.days.find((d) => d.day === 1)!;
    expect(tag1.kind === 'stage' && tag1.legIds).toEqual(['basis--beta', 'beta--gamma']);
    // Das Tagesziel bleibt dasselbe — ein Stopp verlegt es nicht.
    expect(islandAtEndOfDay(change.plan, 1)).toBe('gamma');
  });

  it('weist einen Stopp an Start- oder Zielinsel ab', () => {
    const snap = snapshot();
    const plan = setDayTarget(emptyManualPlan(PARAMS), 1, { islandId: 'gamma' }, snap)!
      .plan;
    expect(setDayStopover(plan, 1, { islandId: 'basis' }, snap)).toBeNull();
    expect(setDayStopover(plan, 1, { islandId: 'gamma' }, snap)).toBeNull();
  });

  it('baut den Tag auf eine direkte Etappe zurück', () => {
    const snap = snapshot();
    let plan = setDayTarget(emptyManualPlan(PARAMS), 1, { islandId: 'gamma' }, snap)!
      .plan;
    plan = setDayStopover(plan, 1, { islandId: 'beta' }, snap)!.plan;
    const zurueck = setDayStopover(plan, 1, { islandId: null }, snap)!;
    const tag1 = zurueck.plan.days.find((d) => d.day === 1)!;
    expect(tag1.kind === 'stage' && tag1.legIds).toEqual(['basis--gamma']);
    expect(tag1.kind === 'stage' && tag1.viaPlaceIds).toEqual([]);
  });
});
