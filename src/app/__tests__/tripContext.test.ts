/**
 * REFRESH_OUTDATED — der Weg, auf dem ein Plan eines älteren Solver-Stands
 * ersetzt wird (2026-08-05): automatisch nur vor Törnbeginn und ohne Pins;
 * alles andere bleibt eine sichtbare Skipper-Entscheidung (DayView-Banner).
 * Der Pin-Guard steht IM Reducer, damit kein Aufrufer ihn vergessen kann.
 */

import { describe, expect, it } from 'vitest';
import { tripReducer, type TripState } from '../tripContext.tsx';
import { PlanSchema, SOLVER_ALGORITHM_VERSION, planOutdated } from '../../domain/schema/plan.ts';
import type { Plan, PlanDay } from '../../domain/schema/plan.ts';
import type { Leg } from '../../domain/schema/route.ts';

const stage = (day: number, source: 'solver' | 'skipper' = 'solver'): PlanDay => ({
  kind: 'stage',
  day,
  legIds: [`leg-${day}`],
  toIslandId: `insel-${day}`,
  source,
});

const legacyPlan = (days: PlanDay[]): Plan => ({ schemaVersion: 1, days });
const freshPlan = (days: PlanDay[]): Plan => ({
  schemaVersion: 1,
  algorithmVersion: SOLVER_ALGORITHM_VERSION,
  days,
});

const state = (plan: Plan | null): TripState => ({
  currentDayOverride: null,
  position: null,
  plan,
  planUnreadable: false,
  departureHourByDay: {},
  stopHoursByDay: {},
  customLegs: [],
  konzeptSchwellen: null,
});

describe('tripReducer — REFRESH_OUTDATED', () => {
  it('ersetzt einen reinen Solver-Plan', () => {
    const old = legacyPlan([stage(1), stage(2)]);
    const next = freshPlan([stage(1), stage(2), stage(3)]);
    const result = tripReducer(state(old), { type: 'REFRESH_OUTDATED', plan: next });
    expect(result.plan).toBe(next);
  });

  it('lässt einen Plan mit Pins stehen — Skipper-Entscheidungen überleben (AD-12)', () => {
    const pinned = legacyPlan([stage(1), stage(2, 'skipper')]);
    const next = freshPlan([stage(1), stage(2)]);
    const result = tripReducer(state(pinned), { type: 'REFRESH_OUTDATED', plan: next });
    expect(result.plan).toBe(pinned);
  });

  it('tut ohne gespeicherten Plan nichts — dafür gibt es ADOPT_INITIAL', () => {
    const next = freshPlan([stage(1)]);
    const result = tripReducer(state(null), { type: 'REFRESH_OUTDATED', plan: next });
    expect(result.plan).toBeNull();
  });
});

/**
 * SET_STOPOVER — Plan und erzeugte Etappen kommen als EIN Payload: nie ein
 * gespeicherter Plan, dessen Etappe fehlt (FR28 Zwischenstopp setzen, verlegen
 * oder löschen). Dedupe per Id, damit wiederholtes Löschen die Bibliothek des
 * Geräts nicht doppelt füllt.
 */
describe('tripReducer — SET_STOPOVER', () => {
  const directLeg = (): Leg => ({
    id: 'athen--sued',
    fromIslandId: 'athen',
    toIslandId: 'sued',
    fromPlaceId: 'athen-alimos',
    toPlaceId: 'sued-hafen',
    distanceNm: 38,
    waypoints: [],
    windWarnings: [],
  });

  it('übernimmt den Plan und persistiert die erzeugte Direktroute', () => {
    const next = freshPlan([stage(1, 'skipper'), stage(2)]);
    const result = tripReducer(state(freshPlan([stage(1), stage(2)])), {
      type: 'SET_STOPOVER',
      plan: next,
      customLegs: [directLeg()],
    });
    expect(result.plan).toBe(next);
    expect(result.customLegs.map((l) => l.id)).toEqual(['athen--sued']);
  });

  it('dedupliziert per Id — dieselbe Direktroute entsteht nie zweimal', () => {
    const withLeg: TripState = { ...state(freshPlan([stage(1)])), customLegs: [directLeg()] };
    const result = tripReducer(withLeg, {
      type: 'SET_STOPOVER',
      plan: freshPlan([stage(1, 'skipper')]),
      customLegs: [directLeg()],
    });
    expect(result.customLegs).toHaveLength(1);
  });

  it('ohne erzeugte Etappe (Bibliothek kannte die Verbindung) bleibt die Liste stehen', () => {
    const result = tripReducer(state(freshPlan([stage(1)])), {
      type: 'SET_STOPOVER',
      plan: freshPlan([stage(1, 'skipper')]),
      customLegs: [],
    });
    expect(result.customLegs).toEqual([]);
  });
});

describe('Persistenz — Pläne aus älterem Storage', () => {
  it('ein Plan ohne algorithmVersion parst weiter (kein planUnreadable) und gilt als veraltet', () => {
    // Exakt das Format, das vor dem Versionsstempel im localStorage lag.
    const raw = JSON.parse(
      JSON.stringify({
        schemaVersion: 1,
        days: [
          { kind: 'stage', day: 1, legIds: ['athen--kea'], toIslandId: 'kea', source: 'solver' },
          { kind: 'harbour', day: 2, islandId: 'kea', source: 'solver' },
        ],
      }),
    );
    const parsed = PlanSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    expect(planOutdated(parsed.data!)).toBe(true);
  });

  it('ein gestempelter Plan parst und ist aktuell', () => {
    const parsed = PlanSchema.safeParse(freshPlan([stage(1)]));
    expect(parsed.success).toBe(true);
    expect(planOutdated(parsed.data!)).toBe(false);
  });
});

/**
 * Die Konzept-Regler (Skipper 2026-08-06): "ab wie viel Wind rät die App ab?"
 * ist eine Skipper-Entscheidung dieses Törns — sie liegt deshalb im
 * Trip-Kontext, wird persistiert und ist mit `null` jederzeit auf die Werte
 * der Bibliothek zurückzusetzen. Der Reducer rechnet dabei nicht: geklemmt
 * wird in der Domäne (setKonzeptSchwelle/withKonzeptSchwellen).
 */
describe('tripReducer — Konzept-Regler', () => {
  const schwellen = {
    konzeptOstMaxKn: 26,
    konzeptOstDauerTage: 3,
    konzeptKlassikMaxKn: 32,
    konzeptKlassikDauerTage: 4,
  };

  it('übernimmt den Reglerstand unverändert', () => {
    const result = tripReducer(state(null), {
      type: 'SET_KONZEPT_SCHWELLEN',
      schwellen,
    });
    expect(result.konzeptSchwellen).toEqual(schwellen);
  });

  it('null setzt auf die Werte der Bibliothek zurück', () => {
    const verstellt = { ...state(null), konzeptSchwellen: schwellen };
    const result = tripReducer(verstellt, {
      type: 'SET_KONZEPT_SCHWELLEN',
      schwellen: null,
    });
    expect(result.konzeptSchwellen).toBeNull();
  });

  it('lässt den Plan unangetastet — eine Schwelle ist keine Planänderung', () => {
    const plan = freshPlan([stage(1, 'skipper')]);
    const result = tripReducer(state(plan), {
      type: 'SET_KONZEPT_SCHWELLEN',
      schwellen,
    });
    expect(result.plan).toBe(plan);
  });
});

/**
 * Die Abfahrt ist seit 2026-08-06 eine Entscheidung PRO TÖRNTAG (der Default
 * ist die Empfehlung des Tages, domain/abfahrt.ts). Gespeichert wird nur, was
 * der Skipper wirklich gesetzt hat — `null` löscht den Eintrag, statt eine
 * Stunde festzuschreiben, damit der Tag der Empfehlung wieder folgen kann,
 * wenn der Forecast sie verschiebt.
 */
describe('tripReducer — Abfahrt je Törntag', () => {
  it('setzt die Abfahrt genau eines Tages', () => {
    const result = tripReducer(state(null), {
      type: 'SET_DEPARTURE_HOUR',
      day: 3,
      hour: 7,
    });
    expect(result.departureHourByDay).toEqual({ 3: 7 });
  });

  it('lässt die anderen Tage stehen', () => {
    const vorher = { ...state(null), departureHourByDay: { 2: 8 } };
    const result = tripReducer(vorher, {
      type: 'SET_DEPARTURE_HOUR',
      day: 3,
      hour: 7,
    });
    expect(result.departureHourByDay).toEqual({ 2: 8, 3: 7 });
  });

  it('null LÖSCHT den Eintrag — der Tag folgt wieder der Empfehlung', () => {
    const vorher = { ...state(null), departureHourByDay: { 2: 8, 3: 7 } };
    const result = tripReducer(vorher, {
      type: 'SET_DEPARTURE_HOUR',
      day: 3,
      hour: null,
    });
    expect(result.departureHourByDay).toEqual({ 2: 8 });
    expect(3 in result.departureHourByDay).toBe(false);
  });
});
