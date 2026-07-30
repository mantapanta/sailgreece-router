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

import type { Leg, Route } from './schema/route.ts';
import type { PlanningSnapshot, PprResult } from './schema/snapshot.ts';
import { RETURN_CHAIN_ROUTE_ID } from './schema/route.ts';
import { assessLeg } from './scoring.ts';

export type Feasibility = 'feasible' | 'infeasible' | 'horizon';

/** Ordered island sequence of a route, derived from its legs. */
export function routeIslandSequence(route: Route): string[] {
  if (route.legs.length === 0) return [];
  return [route.legs[0]!.fromIslandId, ...route.legs.map((l) => l.toIslandId)];
}

/** Trip day by which the base must be reached (eve of disembarkation minus buffer). */
export function effectiveDeadlineDay(snapshot: PlanningSnapshot): number {
  const { params } = snapshot;
  return params.returnByEveOfDay - 1 - params.bufferDays;
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
export function packLegsFeasible(
  legs: Leg[],
  startDay: number,
  deadlineDay: number,
  snapshot: PlanningSnapshot,
): Feasibility {
  const memo = new Map<string, Feasibility>();
  const { params } = snapshot;

  const combine = (rest: Feasibility, unconfirmed: boolean): Feasibility =>
    rest === 'infeasible'
      ? 'infeasible'
      : unconfirmed || rest === 'horizon'
        ? 'horizon'
        : 'feasible';

  const better = (a: Feasibility, b: Feasibility): Feasibility => {
    if (a === 'feasible' || b === 'feasible') return 'feasible';
    if (a === 'horizon' || b === 'horizon') return 'horizon';
    return 'infeasible';
  };

  const search = (legIdx: number, day: number): Feasibility => {
    if (legIdx >= legs.length) return 'feasible';
    if (day > deadlineDay) return 'infeasible';
    const key = `${legIdx}:${day}`;
    const cached = memo.get(key);
    if (cached) return cached;

    let best: Feasibility = 'infeasible';
    const a = assessLeg(legs[legIdx]!, day, snapshot);
    if (a.ampel !== 'rot') {
      // One leg today.
      best = combine(search(legIdx + 1, day + 1), a.ampel === 'unbewertet');

      // Two short legs today, if the combined day stays inside the hard max.
      if (best !== 'feasible' && legIdx + 1 < legs.length) {
        const b = assessLeg(legs[legIdx + 1]!, day, snapshot);
        const hoursKnown = a.totalHours !== null && b.totalHours !== null;
        const combinedSail = (a.sailHours ?? 0) + (b.sailHours ?? 0);
        const combinedMotor = (a.motorHours ?? 0) + (b.motorHours ?? 0);
        if (
          b.ampel !== 'rot' &&
          b.ampel !== 'unbewertet' &&
          a.ampel !== 'unbewertet' &&
          hoursKnown &&
          combinedSail <= params.maxSailHours &&
          combinedMotor <= params.maxMotorHours
        ) {
          best = better(best, combine(search(legIdx + 2, day + 1), false));
        }
      }
    }
    if (best !== 'feasible') {
      // Waiting a day is always allowed (costs a day).
      best = better(best, combine(search(legIdx, day + 1), false));
    }
    memo.set(key, best);
    return best;
  };

  return search(0, startDay);
}

/** The normative return chain from the snapshot (fixed id, AD-10). */
export function returnChain(snapshot: PlanningSnapshot): Route | null {
  return (
    snapshot.library.routes.find((r) => r.id === RETURN_CHAIN_ROUTE_ID) ??
    snapshot.library.routes.find((r) => r.isReturnChain) ??
    null
  );
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
  if (idx >= 0) return chain.legs.slice(idx);

  // Connector: any curated leg from the island onto the chain (earliest join).
  let best: { leg: Leg; joinIdx: number } | null = null;
  for (const route of snapshot.library.routes) {
    for (const leg of route.legs) {
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
  }
  if (best) return [best.leg, ...chain.legs.slice(best.joinIdx)];

  // Last resort: sail back the way we came — reverse the legs of a route
  // that starts at the base and reaches this island (e.g. Saronic circuit,
  // which is not on the westward chain).
  for (const route of snapshot.library.routes) {
    if (route.isReturnChain) continue;
    const rSeq = routeIslandSequence(route);
    if (rSeq[0] !== snapshot.params.baseIslandId) continue;
    const rIdx = rSeq.indexOf(islandId);
    if (rIdx <= 0) continue;
    return route.legs
      .slice(0, rIdx)
      .reverse()
      .map((leg) => reverseLeg(leg));
  }
  return null;
}

function reverseLeg(leg: Leg): Leg {
  return {
    ...leg,
    id: `${leg.toIslandId}--${leg.fromIslandId}`,
    fromIslandId: leg.toIslandId,
    toIslandId: leg.fromIslandId,
    fromPlaceId: leg.toPlaceId,
    toPlaceId: leg.fromPlaceId,
    waypoints: [...leg.waypoints].reverse(),
  };
}

/** Feasibility of starting the full return from `islandId` on `startDay`. */
export function returnFeasibleStarting(
  islandId: string,
  startDay: number,
  snapshot: PlanningSnapshot,
): Feasibility {
  if (islandId === snapshot.params.baseIslandId) return 'feasible';
  const legs = remainingReturnLegs(islandId, snapshot);
  if (!legs) return 'infeasible';
  return packLegsFeasible(legs, startDay, effectiveDeadlineDay(snapshot), snapshot);
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
    const f = packLegsFeasible(legs, d, deadline, snapshot);
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
