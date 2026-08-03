import { describe, expect, it } from 'vitest';
import {
  RELAXATION_ORDER,
  buildCandidates,
  completePlan,
  existsValidPlan,
  legLibrary,
  planFromPacking,
  relaxParams,
  validatePlan,
} from '../solver.ts';
import { stagesOf } from '../schema/plan.ts';
import { assessPlanning } from '../assess.ts';
import type { Island } from '../schema/island.ts';
import type { Route } from '../schema/route.ts';
import type { PlanningSnapshot } from '../schema/snapshot.ts';
import {
  TEST_POLAR,
  TRIP_START,
  constantForecast,
  makeLeg,
  makePlace,
  makeHarbourDay,
  makePlan,
  makeSnapshot,
  makeStage,
  makeTimes,
} from './fixtures.ts';

/**
 * A three-island world: base (athen) -> mitte -> sued, plus the westward
 * fallback chain back to the base. Distances are small so a leg fits a day.
 */
function roundTripSnapshot(
  opts: {
    windKn?: number;
    windFromDeg?: number;
    currentDay?: number;
    /** Islands the guests can reach by ferry on the pickup date (FR31). */
    ferryIslands?: string[];
    pickupDate?: string;
    returnDeadlineDate?: string;
    reliableHorizonDays?: number;
    days?: number;
  } = {},
): PlanningSnapshot {
  const windKn = opts.windKn ?? 10;
  const windFromDeg = opts.windFromDeg ?? 90;
  const base = makePlace({
    id: 'athen-alimos',
    islandId: 'athen',
    coordinates: { lat: 37.9, lon: 23.7 },
  });
  const mitte = makePlace({
    id: 'mitte-bucht',
    islandId: 'mitte',
    coordinates: { lat: 37.6, lon: 24.2 },
  });
  const sued = makePlace({
    id: 'sued-hafen',
    islandId: 'sued',
    coordinates: { lat: 37.3, lon: 24.6 },
  });

  const leg = (from: typeof base, to: typeof base, nm: number) =>
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
      legs: [leg(base, mitte, 20), leg(mitte, sued, 20)],
      isReturnChain: false,
    },
    {
      id: 'rueckfallkette-west',
      name: 'Rückfallkette West',
      escalationRank: 0,
      legs: [leg(sued, mitte, 20), leg(mitte, base, 20)],
      isReturnChain: true,
    },
  ];

  const ferry = new Set(opts.ferryIslands ?? ['athen', 'mitte', 'sued']);
  const islands: Island[] = ['athen', 'mitte', 'sued'].map((id) => ({
    id,
    name: id,
    coordinates:
      id === 'athen' ? base.coordinates : id === 'mitte' ? mitte.coordinates : sued.coordinates,
    guestPickup: { ferryReachable: ferry.has(id), sourceNote: 'fixture' },
  }));

  const times = makeTimes(opts.days ?? 14);
  const fc = constantForecast(times.length, windKn, windFromDeg);
  const snap = makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: { [base.id]: fc, [mitte.id]: fc, [sued.id]: fc },
    library: { islands, places: [base, mitte, sued], invalidPlaces: [], routes },
    trip: {
      currentDay: opts.currentDay ?? 1,
      position: {
        source: 'manual',
        lat: base.coordinates.lat,
        lon: base.coordinates.lon,
        placeId: base.id,
      },
      plan: null,
      departureHourOverride: null,
    },
  });
  // Mirrors the PRD structure: days = stages + exactly one harbour day.
  // Four legs (out and back) therefore need a five-day frame.
  snap.params = {
    ...snap.params,
    tripStartDate: TRIP_START,
    tripLengthDays: 5,
    returnDeadlineDate: opts.returnDeadlineDate ?? '2026-08-12', // trip day 5
    pickupDate: opts.pickupDate ?? '2026-08-11', // trip day 4
    reliableHorizonDays: opts.reliableHorizonDays ?? 14,
  };
  return snap;
}

describe('solver — candidates (AD-13)', () => {
  it('builds a round trip per turning point, always ending at the base', () => {
    const snapshot = roundTripSnapshot();
    const candidates = buildCandidates(snapshot, 'athen');
    expect(candidates.length).toBeGreaterThan(1);
    // Every candidate that sails at all must come home.
    for (const c of candidates.filter((x) => x.legs.length > 0)) {
      expect(c.legs[c.legs.length - 1]!.toIslandId).toBe('athen');
    }
    // Staying at the base is the most conservative candidate and carries no
    // legs — it exists so the app has an answer when nothing else works.
    expect(candidates.some((c) => c.turnIslandId === 'athen' && c.legs.length === 0)).toBe(
      true,
    );
    expect(candidates.some((c) => c.turnIslandId === 'sued')).toBe(true);
  });

  it('deduplicates the leg library even though routes repeat legs', () => {
    const snapshot = roundTripSnapshot();
    // 'mitte--athen' appears in the chain; 'athen--mitte' in the south route.
    expect(legLibrary(snapshot).size).toBe(4);
  });
});

describe('solver — plan shape (AD-12)', () => {
  it('covers every trip day from today to the deadline exactly once', () => {
    const snapshot = roundTripSnapshot();
    const result = completePlan(snapshot, 'athen');
    expect(result).not.toBeNull();
    const days = result!.plan.days.map((d) => d.day);
    expect(days).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(days).size).toBe(days.length);
  });

  it('fills days without a leg as harbour days at the island we sit on', () => {
    const snapshot = roundTripSnapshot();
    const packed = planFromPacking(
      [{ legIdx: 0, leg: legLibrary(snapshot).get('athen--mitte')!, day: 2 }],
      1,
      3,
      'athen',
    );
    expect(packed[0]).toMatchObject({ kind: 'harbour', day: 1, islandId: 'athen' });
    expect(packed[1]).toMatchObject({ kind: 'stage', day: 2, toIslandId: 'mitte' });
    // After arriving at mitte, the idle day 3 is spent THERE, not at the base.
    expect(packed[2]).toMatchObject({ kind: 'harbour', day: 3, islandId: 'mitte' });
  });

  it('ends the plan at the base', () => {
    const snapshot = roundTripSnapshot();
    const result = completePlan(snapshot, 'athen')!;
    const last = result.plan.days[result.plan.days.length - 1]!;
    const island = last.kind === 'stage' ? last.toIslandId : last.islandId;
    expect(island).toBe('athen');
  });
});

describe('solver — pins are hard constraints (AD-12, FR28)', () => {
  it('honours a pinned island on its day', () => {
    const snapshot = roundTripSnapshot();
    const result = completePlan(snapshot, 'athen', [{ day: 2, toIslandId: 'mitte' }]);
    expect(result).not.toBeNull();
    const day2 = result!.plan.days.find((d) => d.day === 2)!;
    const island = day2.kind === 'stage' ? day2.toIslandId : day2.islandId;
    expect(island).toBe('mitte');
    expect(day2.source).toBe('skipper');
  });

  it('marks only pinned days as skipper-owned', () => {
    const snapshot = roundTripSnapshot();
    const result = completePlan(snapshot, 'athen', [{ day: 2, toIslandId: 'mitte' }])!;
    const others = result.plan.days.filter((d) => d.day !== 2);
    expect(others.every((d) => d.source === 'solver')).toBe(true);
  });
});

describe('solver — FR31 pickup is hard and never relaxed (AD-13)', () => {
  it('reaches a ferry-reachable island on the pickup day', () => {
    // Only 'mitte' is reachable, so every valid plan must be at mitte on day 4.
    const snapshot = roundTripSnapshot({ ferryIslands: ['mitte'] });
    const result = completePlan(snapshot, 'athen')!;
    const day4 = result.plan.days.find((d) => d.day === 4)!;
    const island = day4.kind === 'stage' ? day4.toIslandId : day4.islandId;
    expect(island).toBe('mitte');
    expect(result.validity.violations.some((v) => v.kind === 'pickup')).toBe(false);
  });

  it('reports a pickup violation when no island is reachable', () => {
    const snapshot = roundTripSnapshot({ ferryIslands: [] });
    const result = completePlan(snapshot, 'athen');
    expect(result).not.toBeNull();
    expect(result!.validity.valid).toBe(false);
    expect(result!.validity.violations.some((v) => v.kind === 'pickup')).toBe(true);
  });

  it('never relaxes the pickup or the upwind threshold', () => {
    // The relaxation ladder must not contain them — structural guarantee.
    expect(RELAXATION_ORDER).toEqual(['none', 'hardMax', 'nightLeg']);
    const base = roundTripSnapshot().params;
    for (const level of RELAXATION_ORDER) {
      const relaxed = relaxParams(base, level);
      expect(relaxed.maxUpwindTwsKn).toBe(base.maxUpwindTwsKn);
      expect(relaxed.pickupDate).toBe(base.pickupDate);
      expect(relaxed.pickupLatestArrivalHourAthens).toBe(
        base.pickupLatestArrivalHourAthens,
      );
    }
  });
});

describe('solver — horizon rule (AD-13, FR18)', () => {
  it('stages beyond the reliable horizon make a plan neither valid nor invalid', () => {
    const snapshot = roundTripSnapshot({ reliableHorizonDays: 1 });
    const plan = makePlan([
      makeStage(1, ['athen--mitte'], 'mitte'),
      // Day 5 is far beyond a 1-day horizon.
      makeStage(5, ['mitte--athen'], 'athen'),
    ]);
    const validity = validatePlan(plan, snapshot);
    expect(validity.horizonDependent).toBe(true);
    // Unassessable is NOT a threshold violation.
    expect(validity.violations.some((v) => v.kind === 'budget')).toBe(false);
    expect(validity.violations.some((v) => v.kind === 'upwind')).toBe(false);
  });
});

describe('solver — no valid plan still yields a proposal (AD-13, FR18)', () => {
  it('still proposes something when no round trip is sailable', () => {
    // 30 kn straight from the north: sailing home is beating above 25 kn, so no
    // round trip exists. The fallback is "stay put" — which carries no
    // violation (lying in port is safe) but does not sail, so it cannot serve
    // as the existence witness.
    const snapshot = roundTripSnapshot({ windKn: 30, windFromDeg: 0 });
    const result = completePlan(snapshot, 'athen');
    expect(result).not.toBeNull();
    expect(stagesOf(result!.plan)).toHaveLength(0);
    expect(existsValidPlan(snapshot, 'athen')).toBeNull();
  });

  it('names the violated condition when every plan breaks a hard one', () => {
    // No island is ferry-reachable, so even staying put misses the pickup.
    const snapshot = roundTripSnapshot({ windKn: 30, windFromDeg: 0, ferryIslands: [] });
    const result = completePlan(snapshot, 'athen');
    expect(result).not.toBeNull();
    expect(result!.validity.valid).toBe(false);
    expect(result!.validity.violations.some((v) => v.kind === 'pickup')).toBe(true);
  });

  it('never throws for a domain state — red is a result, not an error', () => {
    const snapshot = roundTripSnapshot({ windKn: 45, windFromDeg: 0 });
    expect(() => completePlan(snapshot, 'athen')).not.toThrow();
  });
});

describe('solver — determinism (AD-13)', () => {
  it('produces an identical plan for an identical snapshot', () => {
    const a = completePlan(roundTripSnapshot(), 'athen')!;
    const b = completePlan(roundTripSnapshot(), 'athen')!;
    expect(JSON.stringify(a.plan)).toBe(JSON.stringify(b.plan));
  });
});

describe('solver — dead leg references survive (AD-12)', () => {
  it('keeps the plan and reports the day as unassessable', () => {
    const snapshot = roundTripSnapshot();
    const plan = makePlan([makeStage(1, ['gibt--esnicht'], 'mitte')]);
    const validity = validatePlan(plan, snapshot);
    expect(validity.violations.some((v) => v.kind === 'incomplete')).toBe(true);
    expect(stagesOf(plan)).toHaveLength(1);
  });
});

/**
 * FR2 rest-trip light, definition per AD-3. The distinction that matters:
 * yellow means "the main route is shaky BUT a valid round trip exists", and
 * per AD-13 that existence is judged WITHOUT the pins binding — because the
 * way to cash a yellow in is the check-in, and check-in releases pins.
 */
describe('assessment — FR2 rest-trip light (AD-3)', () => {
  it('is gruen for a valid main route inside the horizon', () => {
    const snapshot = roundTripSnapshot();
    const solved = completePlan(snapshot, 'athen')!;
    expect(solved.validity.valid).toBe(true);
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: solved.plan },
    });
    expect(assessment.restTripAmpel).toBe('gruen');
  });

  it('is gelb when the main route breaks but a valid round trip still exists', () => {
    const snapshot = roundTripSnapshot();
    // A main route that stays in port every day: valid conditions, but it
    // violates the one-harbour-day structure, while sailing plans still work.
    const lazy = makePlan([
      makeHarbourDay(1, 'athen'),
      makeHarbourDay(2, 'athen'),
      makeHarbourDay(3, 'athen'),
      makeHarbourDay(4, 'athen'),
      makeHarbourDay(5, 'athen'),
    ]);
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: lazy },
    });
    // The idle plan breaks no rule — lying in port is safe — but it is not a
    // round trip, so it must not read as green while a real trip is available.
    expect(stagesOf(assessment.mainRoute!.plan)).toHaveLength(0);
    expect(existsValidPlan(snapshot, 'athen')).not.toBeNull();
    expect(assessment.restTripAmpel).toBe('gelb');
    expect(assessment.restTripReasons.length).toBeGreaterThan(0);
  });

  it('is rot when no valid round trip exists at all', () => {
    // 30 kn straight from the north: every way home is beating above 25 kn.
    const snapshot = roundTripSnapshot({ windKn: 30, windFromDeg: 0 });
    const solved = completePlan(snapshot, 'athen')!;
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: solved.plan },
    });
    expect(existsValidPlan(snapshot, 'athen')).toBeNull();
    expect(assessment.restTripAmpel).toBe('rot');
    // Even then there IS a proposal — the app must not fall silent (FR18).
    expect(assessment.proposal).not.toBeNull();
  });

  it('offers a proposal but no main route before the first adoption', () => {
    const snapshot = roundTripSnapshot();
    const assessment = assessPlanning(snapshot);
    expect(assessment.mainRoute).toBeNull();
    expect(assessment.proposal).not.toBeNull();
    expect(assessment.restTripAmpel).toBe('unbewertet');
  });

  it('re-assesses the main route without ever mutating it', () => {
    const snapshot = roundTripSnapshot();
    const solved = completePlan(snapshot, 'athen')!;
    const pinned = makePlan(
      solved.plan.days.map((d) => (d.day === 2 ? { ...d, source: 'skipper' as const } : d)),
    );
    const before = JSON.stringify(pinned);
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: pinned },
    });
    // The assessment carries the very same plan object content back.
    expect(JSON.stringify(assessment.mainRoute!.plan)).toBe(before);
    expect(assessment.mainRoute!.stages.find((s) => s.day === 2)!.pinned).toBe(true);
  });

  it('marks solver-chosen berths as suggestions, skipper berths as fixed', () => {
    const snapshot = roundTripSnapshot();
    const solved = completePlan(snapshot, 'athen')!;
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: solved.plan },
    });
    // Solver stages never carry a place, so every berth shown is a suggestion.
    expect(assessment.mainRoute!.stages.every((s) => s.placeIsSuggestion)).toBe(true);
  });
});
