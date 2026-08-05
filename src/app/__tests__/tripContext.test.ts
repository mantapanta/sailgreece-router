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
  departureHourOverride: null,
  stopHoursByDay: {},
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
