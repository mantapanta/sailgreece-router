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
import { assessLeg, legWaypointKey } from './scoring.ts';

/**
 * 'annahme' = a plan exists, but at least one of its legs rests on the
 * persistence assumption beyond the forecast horizon (persistence.ts). It is
 * a real, sailable plan — only unconfirmed. It must never be silently upgraded
 * to 'feasible': the caveat is what makes it correctable.
 */
export type Feasibility = 'feasible' | 'infeasible' | 'annahme';

/** Ordered island sequence of a route, derived from its legs. */
export function routeIslandSequence(route: Route): string[] {
  if (route.legs.length === 0) return [];
  return [route.legs[0]!.fromIslandId, ...route.legs.map((l) => l.toIslandId)];
}

/**
 * Trip day by which the base must be reached: the EVE of the disembarkation
 * day (disembarkDay - 1) minus the buffer. The eve is computed HERE — the
 * config field is the disembarkation day itself (see params.ts).
 */
export function effectiveDeadlineDay(snapshot: PlanningSnapshot): number {
  const { params } = snapshot;
  return params.disembarkDay - 1 - params.bufferDays;
}

/**
 * Can `legs` be sailed in order (waiting days allowed), starting on
 * `startDay` and finishing by `deadlineDay`?
 * Normally one leg per day; TWO consecutive short legs may share a day when
 * their combined duration stays inside the FR16 hard maximum (the brief's
 * plan does exactly that, e.g. Serifos -> Sifnos -> Paros on one day).
 * A leg day is admissible when its assessment is not red. Days whose wind
 * comes from the persistence assumption — or which have no data at all
 * ('unbewertet') — are admissible-but-unconfirmed; if every surviving plan
 * relies on such days the result is 'annahme'.
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
      : unconfirmed || rest === 'annahme'
        ? 'annahme'
        : 'feasible';

  const better = (a: Feasibility, b: Feasibility): Feasibility => {
    if (a === 'feasible' || b === 'feasible') return 'feasible';
    if (a === 'annahme' || b === 'annahme') return 'annahme';
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
    const aUnconfirmed = a.ampel === 'unbewertet' || a.basis === 'annahme';
    if (a.ampel !== 'rot') {
      // One leg today.
      best = combine(search(legIdx + 1, day + 1), aUnconfirmed);

      // Two short legs today, if the combined day stays inside the hard max.
      // The second leg starts at the REAL arrival time of the first one, not
      // at the morning departure again — afternoon wind build-up (Meltemi)
      // must hit the second leg's simulation.
      if (best !== 'feasible' && legIdx + 1 < legs.length && a.totalHours !== null) {
        const b = assessLeg(legs[legIdx + 1]!, day, snapshot, {
          departureOffsetHours: a.totalHours,
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
          combinedMotor <= params.maxMotorHours
        ) {
          best = better(
            best,
            combine(search(legIdx + 2, day + 1), a.basis === 'annahme' || b.basis === 'annahme'),
          );
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
  const { params } = snapshot;
  const deadline = effectiveDeadlineDay(snapshot);
  const reasons: string[] = [];
  const deadlineRule =
    `Stichtag Tag ${deadline} = Ausschiffung Tag ${params.disembarkDay} minus Vorabend ` +
    `minus ${params.bufferDays} ${params.bufferDays === 1 ? 'Puffertag' : 'Puffertage'}.`;

  if (!currentIslandId) {
    return {
      latestReturnStartDay: null,
      remainingDistanceNm: null,
      effectiveDeadlineDay: deadline,
      legAssessments: [],
      basis: 'forecast',
      rationale: [deadlineRule, 'Ohne Position ist kein Rückweg berechenbar.'],
      reasons: ['Keine Position — PPR nicht berechenbar'],
    };
  }
  if (currentIslandId === params.baseIslandId) {
    return {
      latestReturnStartDay: deadline,
      remainingDistanceNm: 0,
      effectiveDeadlineDay: deadline,
      legAssessments: [],
      basis: 'forecast',
      rationale: [deadlineRule, 'Das Schiff liegt an der Basis — kein Rückweg offen.'],
      reasons: ['Bereits an der Basis'],
    };
  }
  const legs = remainingReturnLegs(currentIslandId, snapshot);
  if (!legs) {
    return {
      latestReturnStartDay: null,
      remainingDistanceNm: null,
      effectiveDeadlineDay: deadline,
      legAssessments: [],
      basis: 'forecast',
      rationale: [
        deadlineRule,
        `Von ${currentIslandId} führt keine hinterlegte Kette zur Basis — weder direkt auf der ` +
          `Rückfallkette, noch über einen kuratierten Verbinder, noch rückwärts über die Anreise.`,
      ],
      reasons: ['Keine Rückfallkette ab dieser Position hinterlegt'],
    };
  }
  const remainingDistanceNm = legs.reduce((s, l) => s + l.distanceNm, 0);

  let latest: number | null = null;
  let restsOnAssumption = false;
  for (let d = deadline; d >= snapshot.trip.currentDay; d--) {
    const f = packLegsFeasible(legs, d, deadline, snapshot);
    if (f === 'feasible') {
      latest = d;
      break;
    }
    if (f === 'annahme') {
      latest = d;
      restsOnAssumption = true;
      break;
    }
  }
  if (latest === null) {
    reasons.push('Rückkehr bis zum Stichtag mit aktuellem Forecast nicht mehr darstellbar');
  } else if (restsOnAssumption) {
    reasons.push('Späteste Umkehr beruht teils auf der Persistenz-Annahme (Vorbehalt)');
  }

  // Assess the chain one leg per day from the turnaround day (or from today,
  // if no turnaround day survives) — these are the legs that beat north and
  // therefore govern the whole plan's wind risk. Days may run past the
  // deadline here on purpose: the point is the leg's wind exposure, not
  // another feasibility check (that already happened above).
  const planDay = latest ?? snapshot.trip.currentDay;
  const legAssessments = legs.map((l, i) => assessLeg(l, planDay + i, snapshot));
  const hardest = [...legAssessments]
    .filter((l) => l.ampel !== 'unbewertet')
    .sort((a, b) => {
      const ra = a.headroom.windKn ?? Infinity;
      const rb = b.headroom.windKn ?? Infinity;
      return ra - rb;
    })[0];

  const rationale = [
    deadlineRule,
    `Rückweg über ${legs.length} ${legs.length === 1 ? 'Etappe' : 'Etappen'} der Rückfallkette, ` +
      `${Math.round(remainingDistanceNm)} sm: ` +
      legs.map((l) => l.id.replace('--', ' → ')).join(', ') + '.',
    latest !== null
      ? `Gesucht wurde der SPÄTESTE Starttag, von dem aus die Kette bis Tag ${deadline} durchläuft ` +
        `(eine Etappe pro Tag, zwei kurze auf einem Tag erlaubt, Wartetage erlaubt, keine rote Etappe) ` +
        `— das ist Tag ${latest}.`
      : `Von keinem Tag ab heute (Tag ${snapshot.trip.currentDay}) läuft die Kette bis Tag ${deadline} ` +
        `durch, ohne eine rote Etappe zu erzwingen.`,
  ];
  if (hardest) {
    rationale.push(
      hardest.headroom.windKn !== null
        ? `Kritischste Rückweg-Etappe: ${hardest.legId.replace('--', ' → ')} ` +
          `(gerechnet für Tag ${hardest.day}) — ${hardest.ampel}, ` +
          `${hardest.headroom.windKn.toFixed(1).replace('.', ',')} kn Reserve bis zur Aufkreuz-Grenze.`
        : `Kritischste Rückweg-Etappe: ${hardest.legId.replace('--', ' → ')} ` +
          `(gerechnet für Tag ${hardest.day}) — ${hardest.ampel}, kein Aufkreuzen nötig.`,
    );
  }
  rationale.push(
    restsOnAssumption
      ? 'Mindestens eine Etappe dieses Rückwegs liegt jenseits des Forecast-Horizonts und wurde mit der Persistenz-Annahme gerechnet.'
      : 'Alle Etappen des Rückwegs liegen im echten Forecast.',
  );

  return {
    latestReturnStartDay: latest,
    remainingDistanceNm,
    effectiveDeadlineDay: deadline,
    legAssessments,
    basis: restsOnAssumption ? 'annahme' : 'forecast',
    rationale,
    reasons,
  };
}
