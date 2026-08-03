/**
 * Regression tests for the review findings of 2026-08-03 (Blind Hunter and
 * Edge Case Hunter on the round-trip rework).
 *
 * These deliberately use REALISTIC parameters — a twelve-day trip frame and the
 * DEFAULT reliable horizon of 7 days — because the original solver fixture
 * neutralised exactly those two values, which is why the first pass looked
 * green while the safety-relevant paths were broken.
 */

import { describe, expect, it } from 'vitest';
import {
  completePlan,
  deriveAlternatives,
  existsValidPlan,
  relaxParams,
  validatePlan,
} from '../solver.ts';
import { assessPlanning } from '../assess.ts';
import { assessLeg } from '../scoring.ts';
import { packLegs } from '../ppr.ts';
import { deadlineFrame } from '../time.ts';
import { ParamsSchema } from '../schema/params.ts';
import { PlanSchema, stageNumber, stagesOf } from '../schema/plan.ts';
import type { Island } from '../schema/island.ts';
import type { Route } from '../schema/route.ts';
import type { PlanningSnapshot } from '../schema/snapshot.ts';
import {
  TEST_POLAR,
  TRIP_START,
  constantForecast,
  makeLeg,
  makePlace,
  makePlan,
  makeSnapshot,
  makeStage,
  makeTimes,
} from './fixtures.ts';

/**
 * Realistic frame: 12 trip days (2026-08-08 .. 2026-08-19), pickup on day 8
 * (2026-08-15), DEFAULT horizon (7 days), forecast axis covering 16 days —
 * so the axis reaches well beyond the reliable horizon, as it does in
 * production with ECMWF.
 */
function realSnapshot(
  opts: {
    windKn?: number;
    windFromDeg?: number;
    currentDay?: number;
    ferryIslands?: string[];
    /** Distance of each leg in nm — small values allow double-leg days. */
    legNm?: number;
    plan?: PlanningSnapshot['trip']['plan'];
  } = {},
): PlanningSnapshot {
  const windKn = opts.windKn ?? 10;
  const windFromDeg = opts.windFromDeg ?? 90;
  const nm = opts.legNm ?? 20;

  const a = makePlace({ id: 'athen-alimos', islandId: 'athen', coordinates: { lat: 37.9, lon: 23.7 } });
  const b = makePlace({ id: 'b-bucht', islandId: 'b', coordinates: { lat: 37.7, lon: 24.0 } });
  const c = makePlace({ id: 'c-hafen', islandId: 'c', coordinates: { lat: 37.5, lon: 24.3 } });

  const leg = (from: typeof a, to: typeof a) =>
    makeLeg({
      id: `${from.islandId}--${to.islandId}`,
      fromIslandId: from.islandId,
      toIslandId: to.islandId,
      fromPlaceId: from.id,
      toPlaceId: to.id,
      distanceNm: nm,
    });

  const routes: Route[] = [
    {
      id: 'sued-route',
      name: 'Südroute',
      escalationRank: 1,
      legs: [leg(a, b), leg(b, c)],
      isReturnChain: false,
    },
    {
      id: 'rueckfallkette-west',
      name: 'Rückfallkette West',
      escalationRank: 0,
      legs: [leg(c, b), leg(b, a)],
      isReturnChain: true,
    },
  ];

  const ferry = new Set(opts.ferryIslands ?? ['athen', 'b', 'c']);
  const islands: Island[] = [
    { id: 'athen', name: 'Athen', coordinates: a.coordinates, guestPickup: { ferryReachable: ferry.has('athen'), sourceNote: 'fixture' } },
    { id: 'b', name: 'B', coordinates: b.coordinates, guestPickup: { ferryReachable: ferry.has('b'), sourceNote: 'fixture' } },
    { id: 'c', name: 'C', coordinates: c.coordinates, guestPickup: { ferryReachable: ferry.has('c'), sourceNote: 'fixture' } },
  ];

  const times = makeTimes(16);
  const fc = constantForecast(times.length, windKn, windFromDeg);
  const snap = makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: { [a.id]: fc, [b.id]: fc, [c.id]: fc },
    library: { islands, places: [a, b, c], invalidPlaces: [], routes },
    trip: {
      currentDay: opts.currentDay ?? 1,
      position: { source: 'manual', lat: a.coordinates.lat, lon: a.coordinates.lon, placeId: a.id },
      plan: opts.plan ?? null,
      departureHourOverride: null,
    },
  });
  snap.params = {
    ...snap.params,
    tripStartDate: TRIP_START,
    tripLengthDays: 12,
    returnDeadlineDate: '2026-08-19', // trip day 12
    pickupDate: '2026-08-15', // trip day 8
    // reliableHorizonDays stays at its DEFAULT of 7 on purpose.
  };
  return snap;
}

describe('regression: Meltemi worst case binds beyond the reliable horizon', () => {
  it('substitutes the worst case for a day past the horizon even when the axis has values', () => {
    const snapshot = realSnapshot({ windKn: 6, windFromDeg: 90 });
    const leg = snapshot.library.routes[1]!.legs[1]!; // b -> athen (northbound)
    // Day 10 lies beyond the 7-day horizon but well inside the 16-day axis.
    const worst = assessLeg(leg, 10, snapshot, { scenario: 'worstCase' });
    expect(worst.breakdown.length).toBeGreaterThan(0);
    expect(worst.breakdown.every((h) => h.worstCase)).toBe(true);
    // 30 kn from the north on a northbound leg must not read as a gentle 6 kn.
    expect(worst.breakdown[0]!.twsKn).toBe(30);
  });

  it('keeps using the real forecast inside the horizon', () => {
    const snapshot = realSnapshot({ windKn: 6, windFromDeg: 90 });
    const leg = snapshot.library.routes[0]!.legs[0]!;
    const inside = assessLeg(leg, 2, snapshot, { scenario: 'worstCase' });
    expect(inside.breakdown.some((h) => h.worstCase)).toBe(false);
    expect(inside.breakdown[0]!.twsKn).toBe(6);
  });

  it('reports a far stage as unbewertet in the forecast scenario', () => {
    const snapshot = realSnapshot();
    const leg = snapshot.library.routes[0]!.legs[0]!;
    expect(assessLeg(leg, 10, snapshot).ampel).toBe('unbewertet');
  });
});

describe('regression: a thin leg library must not paint perfect weather red', () => {
  it('yields a yellow rest trip, not red, when only structural shortfall remains', () => {
    // Four legs on a twelve-day frame => many harbour days, but calm weather.
    const snapshot = realSnapshot({ windKn: 10, windFromDeg: 90 });
    const solved = completePlan(snapshot, 'athen')!;
    expect(solved.validity.safetyViolations).toHaveLength(0);
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: solved.plan },
    });
    expect(assessment.restTripAmpel).not.toBe('rot');
  });

  it('never reports green while the return depends on the weather improving', () => {
    // 32 kn on the nose. The return legs lie BEYOND the 7-day horizon, so the
    // forecast makes no claim about them — the honest answer is a caveat, not
    // the certainty red would imply.
    const snapshot = realSnapshot({ windKn: 32, windFromDeg: 0 });
    const solved = completePlan(snapshot, 'athen')!;
    expect(solved.validity.horizonDependent).toBe(true);
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: solved.plan },
    });
    expect(assessment.restTripAmpel).not.toBe('gruen');
    expect(assessment.proposal).not.toBeNull();
  });

  it('goes red when the forecast itself rules the return out', () => {
    // Short remaining frame: every return day lies INSIDE the horizon, so the
    // forecast — not an assumption — says the boat cannot get home.
    const base = realSnapshot({ windKn: 32, windFromDeg: 0 });
    const snapshot: PlanningSnapshot = {
      ...base,
      params: {
        ...base.params,
        tripLengthDays: 5,
        returnDeadlineDate: '2026-08-12',
        pickupDate: '2026-08-11',
      },
    };
    const solved = completePlan(snapshot, 'athen')!;
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: solved.plan },
    });
    expect(existsValidPlan(snapshot, 'athen')).toBeNull();
    expect(assessment.restTripAmpel).toBe('rot');
    // Even then a proposal exists — the app must not fall silent (FR18).
    expect(assessment.proposal).not.toBeNull();
  });
});

describe('regression: a yellow light is always cashable (AD-13 invariant)', () => {
  it('includes the existence witness in the alternatives', () => {
    const snapshot = realSnapshot({ windKn: 10, windFromDeg: 90 });
    // A main route that sits in port all twelve days: safe, but no round trip.
    const idle = makePlan(
      Array.from({ length: 12 }, (_, i) => ({
        kind: 'harbour' as const,
        day: i + 1,
        islandId: 'athen',
        source: 'solver' as const,
      })),
    );
    const witness = existsValidPlan(snapshot, 'athen');
    expect(witness).not.toBeNull();
    const alts = deriveAlternatives(snapshot, 'athen', witness, idle);
    expect(alts.length).toBeGreaterThan(0);
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: idle },
    });
    expect(assessment.restTripAmpel).toBe('gelb');
    expect(assessment.alternatives.length).toBeGreaterThan(0);
  });
});

describe('regression: pins on past days must not break planning', () => {
  it('plans normally when yesterday carries a pin', () => {
    const yesterdayPinned = makePlan([
      makeStage(1, ['athen--b'], 'b', 'skipper'),
      makeStage(2, ['b--c'], 'c', 'solver'),
    ]);
    const snapshot = realSnapshot({ currentDay: 2, plan: yesterdayPinned });
    const result = completePlan(snapshot, 'b', [{ day: 1, toIslandId: 'b' }]);
    expect(result).not.toBeNull();
  });

  it('keeps past days in the plan so the FR2 numbering does not restart', () => {
    const sailed = makePlan([
      makeStage(1, ['athen--b'], 'b', 'solver'),
      makeStage(2, ['b--c'], 'c', 'solver'),
    ]);
    const snapshot = realSnapshot({ currentDay: 3, plan: sailed });
    const result = completePlan(snapshot, 'c')!;
    expect(result.plan.days.some((d) => d.day === 1)).toBe(true);
    expect(stageNumber(result.plan, 1)).toBe(1);
    // The first stage planned from today onwards must NOT be numbered 1 again.
    const firstFuture = stagesOf(result.plan).find((s) => s.day >= 3);
    if (firstFuture) expect(stageNumber(result.plan, firstFuture.day)).toBeGreaterThan(1);
  });
});

describe('regression: double-leg days can satisfy pins and the pickup', () => {
  it('reaches a pinned island that is only reachable via two short legs', () => {
    // 6 nm legs: two of them fit comfortably into one day.
    const snapshot = realSnapshot({ legNm: 6, windKn: 10, windFromDeg: 90 });
    const packed = packLegs(
      snapshot.library.routes[0]!.legs,
      1,
      12,
      snapshot,
      {
        startIslandId: 'athen',
        // Day 1 must end at 'c' — only possible by sailing both legs.
        dayConstraint: (day, island) => day !== 1 || island === 'c',
      },
    );
    expect(packed.verdict).not.toBe('infeasible');
    expect(packed.packed.filter((p) => p.day === 1)).toHaveLength(2);
  });

  it('finds a pickup harbour that needs a double leg', () => {
    const snapshot = realSnapshot({ legNm: 6, ferryIslands: ['c'] });
    const result = completePlan(snapshot, 'athen')!;
    expect(result.validity.violations.some((v) => v.kind === 'pickup')).toBe(false);
  });
});

describe('regression: an unassessable leg must not validate the pickup', () => {
  it('does not treat a horizon stage as arriving on time', () => {
    const base = realSnapshot({ ferryIslands: ['c'] });
    // Shorten the horizon on purpose so the pickup day (trip day 8) falls
    // BEYOND it — that is the path under test: an unknown duration must not
    // silently pass the ferry cut-off.
    const snapshot: PlanningSnapshot = {
      ...base,
      params: { ...base.params, reliableHorizonDays: 3 },
    };
    const plan = makePlan([makeStage(8, ['b--c'], 'c', 'solver')]);
    const validity = validatePlan(plan, snapshot);
    expect(validity.horizonDependent).toBe(true);
    // No arrival-time violation may be claimed from an unknown duration...
    const arrivalViolation = validity.violations.find(
      (v) => v.kind === 'pickup' && v.text.includes('Ankunft'),
    );
    expect(arrivalViolation).toBeUndefined();
  });
});

describe('regression: trip end and empty frames', () => {
  it('does not crash or produce an empty plan past the deadline', () => {
    const sailed = makePlan([makeStage(1, ['athen--b'], 'b', 'solver')]);
    const snapshot = realSnapshot({ currentDay: 13, plan: sailed });
    const result = completePlan(snapshot, 'athen');
    // Either a plan holding the history, or an honest null — never days: [].
    if (result) expect(result.plan.days.length).toBeGreaterThan(0);
  });
});

describe('regression: relaxation actually changes what counts as red', () => {
  it('raises the hard ceiling on the nightLeg level', () => {
    const base = realSnapshot().params;
    const hardMax = relaxParams(base, 'hardMax');
    const nightLeg = relaxParams(base, 'nightLeg');
    expect(hardMax.targetDayHours).toBeGreaterThan(base.targetDayHours);
    // The budget verdict tests red against maxSailHours/maxMotorHours, so a
    // relaxation that never touches them cannot make an invalid plan valid.
    expect(nightLeg.maxSailHours).toBeGreaterThan(base.maxSailHours);
    expect(nightLeg.lightWindMaxTwsKn).toBeGreaterThanOrEqual(base.nightLegMaxTwsKn);
  });

  it('never relaxes the upwind threshold or the pickup', () => {
    const base = realSnapshot().params;
    for (const level of ['none', 'hardMax', 'nightLeg'] as const) {
      const r = relaxParams(base, level);
      expect(r.maxUpwindTwsKn).toBe(base.maxUpwindTwsKn);
      expect(r.pickupDate).toBe(base.pickupDate);
    }
  });
});

describe('regression: worst-case sector is guarded in the config', () => {
  it('rejects a full-circle sector', () => {
    expect(
      ParamsSchema.safeParse({
        meltemiWorstCase: { twsKn: 30, fromDeg: 0, toDeg: 360, waveM: 2 },
      }).success,
    ).toBe(false);
  });

  it('rejects swapped bounds that would turn the Meltemi southerly', () => {
    expect(
      ParamsSchema.safeParse({
        meltemiWorstCase: { twsKn: 30, fromDeg: 45, toDeg: 0, waveM: 2 },
      }).success,
    ).toBe(false);
  });

  it('accepts the normative north-northeast sector', () => {
    expect(
      ParamsSchema.safeParse({
        meltemiWorstCase: { twsKn: 30, fromDeg: 0, toDeg: 45, waveM: 2 },
      }).success,
    ).toBe(true);
  });
});

describe('regression: no position means no verdict, not red', () => {
  it('reports unbewertet when the position cannot be resolved', () => {
    const snapshot = realSnapshot();
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, currentDay: 3, position: null },
    });
    expect(assessment.currentIslandId).toBeNull();
    expect(assessment.restTripAmpel).toBe('unbewertet');
  });
});

/**
 * FR16 night-leg quota. The parameters existed from the start but nothing
 * enforced them — a solver could propose five night passages in week one.
 */
describe('regression: FR16 night-leg quota is enforced', () => {
  it('flags a night leg before the second week', () => {
    const snapshot = realSnapshot({ windKn: 4, windFromDeg: 90, legNm: 90 });
    // 90 nm in light air runs well past 18:00 => night leg, on day 1.
    const plan = makePlan([makeStage(1, ['athen--b'], 'b', 'solver')]);
    const v = validatePlan(plan, snapshot);
    expect(v.violations.some((x) => x.text.includes('erst ab Tag'))).toBe(true);
  });

  it('flags more night legs than the per-trip quota allows', () => {
    // Mid-trip (day 8), so days 8-10 lie INSIDE the reliable horizon and their
    // durations are known — beyond it a night leg cannot even be recognised.
    const snapshot = realSnapshot({
      windKn: 4,
      windFromDeg: 90,
      legNm: 90,
      currentDay: 8,
    });
    // Three long light-wind passages, all in the second week: quota is two.
    const plan = makePlan([
      makeStage(8, ['athen--b'], 'b', 'solver'),
      makeStage(9, ['b--c'], 'c', 'solver'),
      makeStage(10, ['c--b'], 'b', 'solver'),
    ]);
    const v = validatePlan(plan, snapshot);
    expect(v.violations.some((x) => x.text.includes('Nachtetappen'))).toBe(true);
  });

  it('does not flag a normal daytime leg', () => {
    const snapshot = realSnapshot({ windKn: 12, windFromDeg: 90, legNm: 20 });
    const plan = makePlan([makeStage(2, ['athen--b'], 'b', 'solver')]);
    const v = validatePlan(plan, snapshot);
    expect(v.violations.some((x) => x.text.includes('Nachtetappe'))).toBe(false);
  });

  it('marks a long light-wind passage as a night leg in the assessment', () => {
    const snapshot = realSnapshot({ windKn: 4, windFromDeg: 90, legNm: 90 });
    const leg = snapshot.library.routes[0]!.legs[0]!;
    const a = assessLeg(leg, 2, snapshot);
    expect(a.nightLeg).toBe(true);
    expect(a.arrivalHourAthens).not.toBeNull();
    expect(a.arrivalHourAthens!).toBeGreaterThan(snapshot.params.nightStartHourAthens);
  });
});

/**
 * The return deadline is a TIME (charter handback 18:00), not just a date.
 * Checking the day alone passed an arrival at 23:00 as punctual.
 */
describe('regression: the return deadline is a time, not just a day', () => {
  it('flags an arrival after the handback hour on the deadline day', () => {
    // Long leg in light air: departure 09:00, arrival well past 18:00.
    const snapshot = realSnapshot({
      windKn: 4,
      windFromDeg: 90,
      legNm: 90,
      currentDay: 12,
    });
    const plan = makePlan([makeStage(12, ['b--athen'], 'athen', 'solver')]);
    const v = validatePlan(plan, snapshot);
    expect(v.violations.some((x) => x.kind === 'deadline' && x.text.includes('Rückgabe'))).toBe(
      true,
    );
  });

  it('accepts an arrival before the handback hour', () => {
    const snapshot = realSnapshot({
      windKn: 12,
      windFromDeg: 90,
      legNm: 20,
      currentDay: 12,
    });
    const plan = makePlan([makeStage(12, ['b--athen'], 'athen', 'solver')]);
    const v = validatePlan(plan, snapshot);
    expect(v.violations.some((x) => x.kind === 'deadline')).toBe(false);
  });

  it('does not judge the hour when the duration is unknown', () => {
    // currentDay 1 => day 12 lies beyond the horizon, duration unknown.
    const snapshot = realSnapshot({ windKn: 4, windFromDeg: 90, legNm: 90 });
    const plan = makePlan([makeStage(12, ['b--athen'], 'athen', 'solver')]);
    const v = validatePlan(plan, snapshot);
    expect(v.violations.some((x) => x.text.includes('Rückgabe'))).toBe(false);
    expect(v.horizonDependent).toBe(true);
  });
});

/**
 * Robustness at the edges of the plan: gaps that let a wrong plan look right.
 */
describe('regression: plan integrity at the edges', () => {
  it('rejects a persisted plan with duplicate days', () => {
    const raw = {
      schemaVersion: 1,
      days: [
        { kind: 'stage', day: 3, legIds: ['athen--b'], toIslandId: 'b', source: 'solver' },
        { kind: 'harbour', day: 3, islandId: 'b', source: 'solver' },
      ],
    };
    expect(PlanSchema.safeParse(raw).success).toBe(false);
  });

  it('rejects a persisted plan with a gap between days', () => {
    const raw = {
      schemaVersion: 1,
      days: [
        { kind: 'stage', day: 1, legIds: ['athen--b'], toIslandId: 'b', source: 'solver' },
        { kind: 'stage', day: 4, legIds: ['b--c'], toIslandId: 'c', source: 'solver' },
      ],
    };
    expect(PlanSchema.safeParse(raw).success).toBe(false);
  });

  it('flags a berth that lies on a different island than its day', () => {
    const snapshot = realSnapshot();
    // Day target is island b, but the chosen berth is the harbour on c.
    const plan = makePlan([makeStage(2, ['athen--b'], 'b', 'skipper', 'c-hafen')]);
    const v = validatePlan(plan, snapshot);
    expect(v.violations.some((x) => x.text.includes('liegt auf c'))).toBe(true);
  });

  it('flags a missing pickup day inside the planning window', () => {
    const snapshot = realSnapshot({ ferryIslands: ['b'] });
    // Plan covers days 1-2 only; the pickup day (8) is absent.
    const plan = makePlan([
      makeStage(1, ['athen--b'], 'b', 'solver'),
      makeStage(2, ['b--c'], 'c', 'solver'),
    ]);
    const v = validatePlan(plan, snapshot);
    expect(v.violations.some((x) => x.kind === 'pickup' && x.text.includes('fehlt im Plan'))).toBe(
      true,
    );
  });

  it('reports an off-plan position instead of quietly reinterpreting it', () => {
    const sailed = makePlan([
      makeStage(1, ['athen--b'], 'b', 'solver'),
      makeStage(2, ['b--c'], 'c', 'solver'),
    ]);
    // Plan says the boat spent day 1 at b; it actually lies at the base.
    const snapshot = realSnapshot({ currentDay: 2, plan: sailed });
    const assessment = assessPlanning(snapshot);
    expect(assessment.offPlan).toBe(true);
    expect(assessment.positionNote).toContain('weicht vom Plan ab');
  });

  it('reports a clamped PoR instead of silently moving it to day 1', () => {
    const frame = deadlineFrame({
      tripStartDate: '2026-08-08',
      returnDeadlineDate: '2026-08-09', // day 2
      returnDeadlineHourAthens: 18,
      bufferDays: 5, // would push the PoR to day -3
    });
    expect(frame.porDeadlineDay).toBe(1);
    expect(frame.porClamped).toBe(true);
  });
});
