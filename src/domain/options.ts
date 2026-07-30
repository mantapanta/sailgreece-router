/**
 * FR18 / FR20 — mid-term option space.
 * An option is OPEN when, with the current forecast, a remaining plan exists
 * that (1) keeps every leg inside the family thresholds (FR16, durations from
 * polar + offset) and (2) reaches Alimos by the eve of disembarkation incl.
 * buffer day (FR19). 'schliesst am Tag X' = from day X+1 no such plan exists;
 * 'zu' = none exists. Beyond the horizon: 'offen-horizont' with visible
 * caveat. Feasibility uses the SAME leg duration function as scoring/ppr.
 */

import type { Route, Leg } from './schema/route.ts';
import type {
  PlanningSnapshot,
  RouteOptionAssessment,
  LegAssessment,
  DecisionPoint,
  PprResult,
  DayOption,
} from './schema/snapshot.ts';
import { worstAmpel, type Ampel } from './schema/common.ts';
import { assessLeg } from './scoring.ts';
import {
  effectiveDeadlineDay,
  packLegsFeasible,
  returnFeasibleStarting,
  routeIslandSequence,
  type Feasibility,
} from './ppr.ts';

/** Legs of a route still ahead of the given island (null = not on route). */
export function remainingRouteLegs(
  route: Route,
  currentIslandId: string,
): Leg[] | null {
  const seq = routeIslandSequence(route);
  const idx = seq.indexOf(currentIslandId);
  if (idx < 0) return null;
  return route.legs.slice(idx);
}

/**
 * Does a remaining plan exist for this option when its execution starts on
 * `startDay` (staying put until then)? Combines the option's remaining legs
 * with the return constraint (FR18 definition, both conditions).
 */
export function restPlanFeasible(
  route: Route,
  currentIslandId: string,
  startDay: number,
  snapshot: PlanningSnapshot,
): Feasibility {
  const legs = remainingRouteLegs(route, currentIslandId);
  if (legs === null) return 'infeasible';
  const deadline = effectiveDeadlineDay(snapshot);
  if (legs.length === 0) {
    return returnFeasibleStarting(currentIslandId, startDay, snapshot);
  }
  // Outbound legs one per day (waits allowed), then the return chain from the
  // route's final island. We search over the arrival day of the last leg.
  const lastIsland = legs[legs.length - 1]!.toIslandId;
  let best: Feasibility = 'infeasible';
  // Earliest possible arrival: packLegsFeasible allows TWO short legs on one
  // day, so the fastest plan needs ceil(legs/2) days — starting the scan at
  // one-leg-per-day would silently skip double-leg plans at the deadline edge.
  for (
    let arrivalDay = startDay + Math.ceil(legs.length / 2) - 1;
    arrivalDay <= deadline;
    arrivalDay++
  ) {
    const outbound = packLegsFeasibleByDeadline(legs, startDay, arrivalDay, snapshot);
    if (outbound === 'infeasible') continue;
    const back = returnFeasibleStarting(lastIsland, arrivalDay + 1, snapshot);
    if (back === 'infeasible') continue;
    const combined: Feasibility =
      outbound === 'horizon' || back === 'horizon' ? 'horizon' : 'feasible';
    if (combined === 'feasible') return 'feasible';
    best = 'horizon';
  }
  return best;
}

function packLegsFeasibleByDeadline(
  legs: Leg[],
  startDay: number,
  deadlineDay: number,
  snapshot: PlanningSnapshot,
): Feasibility {
  return packLegsFeasible(legs, startDay, deadlineDay, snapshot);
}

/** FR18: offen / offen-horizont / schliesst am Tag X / zu — per route option. */
export function assessRouteOption(
  route: Route,
  currentIslandId: string | null,
  snapshot: PlanningSnapshot,
): RouteOptionAssessment {
  const today = snapshot.trip.currentDay;
  const deadline = effectiveDeadlineDay(snapshot);
  const reasons: string[] = [];

  if (!currentIslandId) {
    return {
      routeId: route.id,
      state: 'zu',
      closesOnDay: null,
      ampel: 'unbewertet',
      legAssessments: [],
      reasons: ['Keine Position gesetzt'],
    };
  }

  // Display assessment: remaining legs on the earliest plan (one per day).
  const legs = remainingRouteLegs(route, currentIslandId) ?? [];
  const legAssessments: LegAssessment[] = legs.map((leg, i) =>
    assessLeg(leg, today + i, snapshot),
  );
  const ampel: Ampel =
    legAssessments.length > 0
      ? worstAmpel(legAssessments.map((l) => l.ampel))
      : 'unbewertet';

  const now = restPlanFeasible(route, currentIslandId, today, snapshot);
  if (now === 'infeasible') {
    reasons.push('Kein zulässiger Restplan mit aktuellem Forecast (FR18)');
    return {
      routeId: route.id,
      state: 'zu',
      closesOnDay: null,
      ampel,
      legAssessments,
      reasons,
    };
  }
  if (now === 'horizon') {
    reasons.push('Machbarkeit reicht über den Forecast-Horizont hinaus — offen mit Vorbehalt');
    return {
      routeId: route.id,
      state: 'offen-horizont',
      closesOnDay: null,
      ampel,
      legAssessments,
      reasons,
    };
  }

  // Open today: does it close? Latest start day D with a feasible rest plan.
  let closesOnDay: number | null = null;
  let closingScanHitHorizon = false;
  for (let d = today + 1; d <= deadline; d++) {
    const f = restPlanFeasible(route, currentIslandId, d, snapshot);
    if (f === 'infeasible') {
      closesOnDay = d - 1;
      break;
    }
    if (f === 'horizon') {
      // Beyond the horizon we cannot claim a closing day — that is a VISIBLE
      // caveat (I/O-Matrix), not an unqualified 'offen'.
      closingScanHitHorizon = true;
      break;
    }
  }
  if (closesOnDay !== null && closesOnDay <= deadline) {
    reasons.push(`Ab Tag ${closesOnDay + 1} existiert kein zulässiger Restplan mehr`);
    return {
      routeId: route.id,
      state: 'schliesst',
      closesOnDay,
      ampel,
      legAssessments,
      reasons,
    };
  }
  if (closingScanHitHorizon) {
    reasons.push('Schließtag jenseits des Forecast-Horizonts nicht bestimmbar (Vorbehalt)');
    return {
      routeId: route.id,
      state: 'offen-horizont',
      closesOnDay: null,
      ampel,
      legAssessments,
      reasons,
    };
  }
  return {
    routeId: route.id,
    state: 'offen',
    closesOnDay: null,
    ampel,
    legAssessments,
    reasons,
  };
}

/**
 * FR21 — today's day options: candidate target islands = next legs from the
 * current island across all route options, plus a lay day. No recommendation
 * field, nothing hidden (FR22) — ordering is stable (route escalation rank).
 */
export function deriveDayOptions(
  snapshot: PlanningSnapshot,
  currentIslandId: string | null,
  bestPlaceByIsland: Record<string, Record<number, string | null>>,
  nightAmpeln: Record<string, Record<number, { ampel: Ampel }>>,
): DayOption[] {
  const today = snapshot.trip.currentDay;
  if (!currentIslandId) return [];

  const options: DayOption[] = [];
  // Dedupe over the LEG id, not the target island: two routes may reach the
  // same island via DIFFERENT legs (other waypoints/places/distance) — those
  // must stay separate options, otherwise the displayed duration/score of the
  // first route would silently claim to serve the second one too.
  const seenLegs = new Set<string>();

  const routesSorted = [...snapshot.library.routes].sort(
    (a, b) => a.escalationRank - b.escalationRank,
  );
  for (const route of routesSorted) {
    const legs = remainingRouteLegs(route, currentIslandId);
    const next = legs?.[0];
    if (!next) continue;
    if (seenLegs.has(next.id)) {
      const existing = options.find((o) => o.legId === next.id);
      if (existing && !existing.servesRouteIds.includes(route.id)) {
        existing.servesRouteIds.push(route.id);
      }
      continue;
    }
    seenLegs.add(next.id);
    const bestPlaceId = bestPlaceByIsland[next.toIslandId]?.[today] ?? null;
    options.push({
      kind: 'leg',
      legId: next.id,
      targetIslandId: next.toIslandId,
      leg: assessLeg(next, today, snapshot),
      bestPlaceId,
      bestPlaceAmpel: bestPlaceId
        ? (nightAmpeln[bestPlaceId]?.[today]?.ampel ?? 'unbewertet')
        : 'unbewertet',
      servesRouteIds: [route.id],
    });
  }

  // Lay day at the current island.
  const stayBest = bestPlaceByIsland[currentIslandId]?.[today] ?? null;
  options.push({
    kind: 'liegetag',
    legId: null,
    targetIslandId: currentIslandId,
    leg: null,
    bestPlaceId: stayBest,
    bestPlaceAmpel: stayBest
      ? (nightAmpeln[stayBest]?.[today]?.ampel ?? 'unbewertet')
      : 'unbewertet',
    servesRouteIds: [],
  });

  return options;
}

/** FR20 — decision points derived from option states and the PPR. */
export function deriveDecisionPoints(
  routeOptions: RouteOptionAssessment[],
  ppr: PprResult,
  routes: Route[],
): DecisionPoint[] {
  const points: DecisionPoint[] = [];
  for (const opt of routeOptions) {
    if (opt.state === 'schliesst' && opt.closesOnDay !== null) {
      const route = routes.find((r) => r.id === opt.routeId);
      points.push({
        day: opt.closesOnDay,
        text: `Bis Tag ${opt.closesOnDay} entscheiden: ${route?.name ?? opt.routeId} — danach verfällt die Option.`,
      });
    }
  }
  if (ppr.latestReturnStartDay !== null) {
    points.push({
      day: ppr.latestReturnStartDay,
      text: `Spätester Umkehrtag: Tag ${ppr.latestReturnStartDay} — Rückkehr nach Alimos bis Tag ${ppr.effectiveDeadlineDay} (inkl. Puffertag).`,
    });
  }
  return points.sort((a, b) => a.day - b.day);
}
