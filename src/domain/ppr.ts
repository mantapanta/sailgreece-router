/**
 * FR19 — Predicted Point of Return.
 * Continuous computation of the latest turnaround day for a stress-free
 * return to Alimos (arrival on the eve of disembarkation, incl. buffer day).
 * Remaining distance runs over the fallback-harbour chain — a normative
 * route document with the fixed id 'rueckfallkette-west' delivered via the
 * snapshot (AD-10): this module contains NO place or distance constants.
 * Leg durations come from the same scoring/polar functions as everywhere
 * else — there is only one feasibility notion (AD-3).
 */

import type { Leg } from './schema/route.ts';
import type { PlanningSnapshot, PprResult } from './schema/snapshot.ts';
import { RETURN_CHAIN_ROUTE_ID } from './schema/route.ts';
import { islandSequence, legsOfVariant } from './legs.ts';
import { assessLeg, legWaypointKey, type LegScenario } from './scoring.ts';
import { deadlineFrame } from './time.ts';

export type Feasibility = 'feasible' | 'infeasible' | 'horizon';

/** One leg placed on a trip day by the packer. */
export interface PackedLeg {
  legIdx: number;
  leg: Leg;
  day: number;
}

/**
 * The packer's answer: the verdict AND the day assignment that produced it.
 * Returning the assignment is what turns the old boolean feasibility check
 * into a plan builder (AD-13) — the schedule used to be computed and thrown
 * away on every call.
 */
export interface PackResult {
  verdict: Feasibility;
  packed: PackedLeg[];
}

/** Ordered island sequence of a route, derived from its legs. */
export function routeIslandSequence(legs: Leg[]): string[] {
  return islandSequence(legs);
}

/**
 * Trip day the PoR calculates against — derived from the ONE deadline in the
 * config through the single derivation in time.ts (AD-9), so solver validity
 * and PoR can never count trip days differently.
 */
export function effectiveDeadlineDay(snapshot: PlanningSnapshot): number {
  return deadlineFrame(snapshot.params).porDeadlineDay;
}

/**
 * Can `legs` be sailed in order (waiting days allowed), starting on
 * `startDay` and finishing by `deadlineDay`?
 * Normally one leg per day; TWO consecutive short legs may share a day when
 * their combined duration stays inside the FR16 hard maximum (the brief's
 * plan does exactly that, e.g. Serifos -> Sifnos -> Paros on one day).
 * A leg day is admissible when its assessment is not red. Days beyond the
 * forecast horizon ('unbewertet') are treated as admissible-but-unconfirmed;
 * if every surviving plan relies on such days the result is 'horizon'.
 */
export function packLegs(
  legs: Leg[],
  startDay: number,
  deadlineDay: number,
  snapshot: PlanningSnapshot,
  opts: {
    scenario?: LegScenario;
    maxWaitDays?: number;
    /**
     * Island the boat starts from — needed to answer "where are we at the end
     * of a waiting day?" for the day constraints below.
     */
    startIslandId?: string;
    /**
     * Hard per-day requirement: where must the boat be when day N ends?
     * Checked INSIDE the DP, because pins and the FR31 pickup pick a specific
     * DAY while the packer chooses the days — verifying afterwards would
     * discard almost every packing instead of steering the search.
     */
    dayConstraint?: (day: number, endIslandId: string) => boolean;
  } = {},
): PackResult {
  const memo = new Map<string, PackResult>();
  const { params } = snapshot;
  const scenario = opts.scenario;
  const ok = (day: number, endIslandId: string): boolean =>
    opts.dayConstraint ? opts.dayConstraint(day, endIslandId) : true;
  /** Island the boat sits on before leg `legIdx` is sailed. */
  const islandBefore = (legIdx: number): string =>
    legIdx === 0
      ? (opts.startIslandId ?? legs[0]?.fromIslandId ?? '')
      : (legs[legIdx - 1]?.toIslandId ?? '');
  // A plan carries exactly one harbour day (AD-12), so the packer never needs
  // more waiting days than that — which SHRINKS the search space instead of
  // growing it. Callers that only ask about feasibility (PoR) leave it open.
  const maxWaitDays = opts.maxWaitDays ?? Number.POSITIVE_INFINITY;

  const combine = (rest: Feasibility, unconfirmed: boolean): Feasibility =>
    rest === 'infeasible'
      ? 'infeasible'
      : unconfirmed || rest === 'horizon'
        ? 'horizon'
        : 'feasible';

  const rank = (f: Feasibility): number =>
    f === 'feasible' ? 2 : f === 'horizon' ? 1 : 0;

  /** Prefer the better verdict; on a tie prefer the EARLIER finish (fewer days). */
  const better = (a: PackResult, b: PackResult): PackResult => {
    if (rank(a.verdict) !== rank(b.verdict))
      return rank(a.verdict) > rank(b.verdict) ? a : b;
    const lastA = a.packed[a.packed.length - 1]?.day ?? -1;
    const lastB = b.packed[b.packed.length - 1]?.day ?? -1;
    return lastA <= lastB ? a : b;
  };

  const search = (legIdx: number, day: number, waitsUsed: number): PackResult => {
    if (legIdx >= legs.length) {
      // All legs placed: the boat lies at the last island for every remaining
      // day. Those days still have to satisfy the day constraints — otherwise
      // a pin or the FR31 pickup falling AFTER the last leg would never be
      // checked, and the plan would quietly park on the wrong island.
      const island = islandBefore(legIdx);
      for (let d = day; d <= deadlineDay; d++) {
        if (!ok(d, island)) return { verdict: 'infeasible', packed: [] };
      }
      return { verdict: 'feasible', packed: [] };
    }
    if (day > deadlineDay) return { verdict: 'infeasible', packed: [] };
    const key = `${legIdx}:${day}:${waitsUsed}`;
    const cached = memo.get(key);
    if (cached) return cached;

    let best: PackResult = { verdict: 'infeasible', packed: [] };
    const a = assessLeg(legs[legIdx]!, day, snapshot, { scenario });
    if (a.ampel !== 'rot') {
      // One leg today — the day constraint asks about the island we END at.
      if (ok(day, legs[legIdx]!.toIslandId)) {
        const rest = search(legIdx + 1, day + 1, waitsUsed);
        best = {
          verdict: combine(rest.verdict, a.ampel === 'unbewertet'),
          packed: [{ legIdx, leg: legs[legIdx]!, day }, ...rest.packed],
        };
      }

      // Two short legs today, if the combined day stays inside the hard max.
      // The second leg starts at the REAL arrival time of the first one, not
      // at the morning departure again — afternoon wind build-up (Meltemi)
      // must hit the second leg's simulation.
      // Checked SEPARATELY from the single-leg move: a pin or the pickup that
      // is only reachable via a double leg must not be blocked by the
      // single-leg destination failing the constraint.
      if (best.verdict !== 'feasible' && legIdx + 1 < legs.length && a.totalHours !== null) {
        const b = assessLeg(legs[legIdx + 1]!, day, snapshot, {
          departureOffsetHours: a.totalHours,
          scenario,
        });
        const hoursKnown = a.totalHours !== null && b.totalHours !== null;
        const combinedSail = (a.sailHours ?? 0) + (b.sailHours ?? 0);
        const combinedMotor = (a.motorHours ?? 0) + (b.motorHours ?? 0);
        if (
          b.ampel !== 'rot' &&
          b.ampel !== 'unbewertet' &&
          a.ampel !== 'unbewertet' &&
          hoursKnown &&
          combinedSail <= params.maxSailHours &&
          combinedMotor <= params.maxMotorHours &&
          ok(day, legs[legIdx + 1]!.toIslandId)
        ) {
          const rest2 = search(legIdx + 2, day + 1, waitsUsed);
          best = better(best, {
            verdict: combine(rest2.verdict, false),
            packed: [
              { legIdx, leg: legs[legIdx]!, day },
              { legIdx: legIdx + 1, leg: legs[legIdx + 1]!, day },
              ...rest2.packed,
            ],
          });
        }
      }
    }
    if (
      best.verdict !== 'feasible' &&
      waitsUsed < maxWaitDays &&
      ok(day, islandBefore(legIdx))
    ) {
      // Waiting a day is always allowed (costs a day) — that day becomes the
      // harbour day when the caller builds a plan from this packing.
      const rest = search(legIdx, day + 1, waitsUsed + 1);
      best = better(best, {
        verdict: combine(rest.verdict, false),
        packed: rest.packed,
      });
    }
    memo.set(key, best);
    return best;
  };

  return search(0, startDay, 0);
}

/** Feasibility-only view of {@link packLegs} — same notion, no schedule (AD-3). */
export function packLegsFeasible(
  legs: Leg[],
  startDay: number,
  deadlineDay: number,
  snapshot: PlanningSnapshot,
  opts: { scenario?: LegScenario } = {},
): Feasibility {
  return packLegs(legs, startDay, deadlineDay, snapshot, opts).verdict;
}

/** The normative return chain from the snapshot (fixed id, AD-10), as legs. */
export function returnChain(snapshot: PlanningSnapshot): Leg[] | null {
  const variant =
    snapshot.library.variants.find((v) => v.id === RETURN_CHAIN_ROUTE_ID) ??
    snapshot.library.variants.find((v) => v.isReturnChain);
  if (!variant) return null;
  const legs = legsOfVariant(variant, snapshot.library);
  return legs.length > 0 ? legs : null;
}

/**
 * Remaining legs from `islandId` back to the base along the return chain.
 * If the island is not on the chain, a connector leg from the route library
 * (from the island onto the chain) is prepended when one exists.
 */
export function remainingReturnLegs(
  islandId: string,
  snapshot: PlanningSnapshot,
): Leg[] | null {
  const chain = returnChain(snapshot);
  if (!chain) return null;
  const seq = routeIslandSequence(chain);
  const idx = seq.indexOf(islandId);
  if (idx >= 0) return chain.slice(idx);

  // Connector: any curated leg from the island onto the chain (earliest join).
  let best: { leg: Leg; joinIdx: number } | null = null;
  for (const leg of snapshot.library.legs) {
    const joinIdx =
      leg.fromIslandId === islandId ? seq.indexOf(leg.toIslandId) : -1;
    if (joinIdx >= 0 && (!best || joinIdx < best.joinIdx)) {
      best = { leg, joinIdx };
    }
    // Curated legs may be stored in outbound direction: use them reversed.
    const revJoinIdx =
      leg.toIslandId === islandId ? seq.indexOf(leg.fromIslandId) : -1;
    if (revJoinIdx >= 0 && (!best || revJoinIdx < best.joinIdx)) {
      best = { leg: reverseLeg(leg), joinIdx: revJoinIdx };
    }
  }
  if (best) return [best.leg, ...chain.slice(best.joinIdx)];

  // Last resort: sail back the way we came — reverse the legs of a route
  // that starts at the base and reaches this island (e.g. Saronic circuit,
  // which is not on the westward chain).
  for (const variant of snapshot.library.variants) {
    if (variant.isReturnChain) continue;
    const vLegs = legsOfVariant(variant, snapshot.library);
    const rSeq = routeIslandSequence(vLegs);
    if (rSeq[0] !== snapshot.params.baseIslandId) continue;
    const rIdx = rSeq.indexOf(islandId);
    if (rIdx <= 0) continue;
    return vLegs
      .slice(0, rIdx)
      .reverse()
      .map((leg) => reverseLeg(leg));
  }
  return null;
}

function reverseLeg(leg: Leg): Leg {
  // The snapshot only fetches forecast keys of the STORED direction
  // (collectLocations, AD-3). A reversed leg therefore keeps the original
  // leg's waypoint keys, mirrored — otherwise every waypoint lookup misses
  // and the whole return leg degrades to 'unbewertet' despite full coverage.
  const lastIdx = leg.waypoints.length - 1;
  const originalKeyOf = (n: number): string =>
    leg.waypointKeys?.[n] ?? legWaypointKey(leg.id, n);
  return {
    ...leg,
    id: `${leg.toIslandId}--${leg.fromIslandId}`,
    fromIslandId: leg.toIslandId,
    toIslandId: leg.fromIslandId,
    fromPlaceId: leg.toPlaceId,
    toPlaceId: leg.fromPlaceId,
    waypoints: [...leg.waypoints].reverse(),
    waypointKeys: leg.waypoints.map((_, n) => originalKeyOf(lastIdx - n)),
  };
}

/**
 * AD-13 condition (2') — THE return check, shared by the solver and the PoR.
 * Hours beyond the reliable horizon are computed against the Meltemi worst
 * case: a harbour only counts as "meltemi-safe" if the chain home is sailable
 * even under the configured worst case. This is the only calculation the
 * worst case binds — it never governs the outbound stages.
 */
export function returnFeasibleStarting(
  islandId: string,
  startDay: number,
  snapshot: PlanningSnapshot,
  scenario: LegScenario = 'worstCase',
): Feasibility {
  if (islandId === snapshot.params.baseIslandId) return 'feasible';
  const legs = remainingReturnLegs(islandId, snapshot);
  if (!legs) return 'infeasible';
  return packLegsFeasible(legs, startDay, effectiveDeadlineDay(snapshot), snapshot, {
    scenario,
  });
}

/** FR19: the Predicted Point of Return for the current position. */
export function predictedPointOfReturn(
  snapshot: PlanningSnapshot,
  currentIslandId: string | null,
): PprResult {
  const deadline = effectiveDeadlineDay(snapshot);
  const reasons: string[] = [];
  if (!currentIslandId) {
    return {
      latestReturnStartDay: null,
      remainingDistanceNm: null,
      effectiveDeadlineDay: deadline,
      reasons: ['Keine Position — PPR nicht berechenbar'],
    };
  }
  if (currentIslandId === snapshot.params.baseIslandId) {
    return {
      latestReturnStartDay: deadline,
      remainingDistanceNm: 0,
      effectiveDeadlineDay: deadline,
      reasons: ['Bereits an der Basis'],
    };
  }
  const legs = remainingReturnLegs(currentIslandId, snapshot);
  if (!legs) {
    return {
      latestReturnStartDay: null,
      remainingDistanceNm: null,
      effectiveDeadlineDay: deadline,
      reasons: ['Keine Rückfallkette ab dieser Position hinterlegt'],
    };
  }
  const remainingDistanceNm = legs.reduce((s, l) => s + l.distanceNm, 0);

  let latest: number | null = null;
  let sawHorizon = false;
  for (let d = deadline; d >= snapshot.trip.currentDay; d--) {
    const f = packLegsFeasible(legs, d, deadline, snapshot, {
      scenario: 'worstCase',
    });
    if (f === 'feasible') {
      latest = d;
      break;
    }
    if (f === 'horizon') {
      latest = d;
      sawHorizon = true;
      break;
    }
  }
  if (latest === null) {
    reasons.push('Rückkehr bis zum Stichtag mit aktuellem Forecast nicht mehr darstellbar');
  } else if (sawHorizon) {
    reasons.push('Späteste Umkehr liegt teils jenseits des Forecast-Horizonts (Vorbehalt)');
  }
  return {
    latestReturnStartDay: latest,
    remainingDistanceNm,
    effectiveDeadlineDay: deadline,
    reasons,
  };
}
