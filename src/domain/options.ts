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
  DataBasis,
  PlanningSnapshot,
  RouteOptionAssessment,
  LegAssessment,
  DecisionPoint,
  PprResult,
  DayOption,
} from './schema/snapshot.ts';
import { AMPEL_WORT, worstAmpel, type Ampel } from './schema/common.ts';
import { assessLeg } from './scoring.ts';
import {
  effectiveDeadlineDay,
  packLegsFeasible,
  remainingReturnLegs,
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
      outbound === 'annahme' || back === 'annahme' ? 'annahme' : 'feasible';
    if (combined === 'feasible') return 'feasible';
    best = 'annahme';
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
      returnLegAssessments: [],
      basis: 'forecast',
      rationale: ['Ohne Position lässt sich kein Restplan bilden.'],
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
  // The beat home from the option's final island — FR18 judges it together
  // with the outbound legs, so it belongs in the visible output as well.
  const finalIsland =
    legs.length > 0 ? legs[legs.length - 1]!.toIslandId : currentIslandId;
  const earliestArrivalDay = today + Math.max(0, legs.length - 1);
  const returnLegs =
    finalIsland === snapshot.params.baseIslandId
      ? []
      : (remainingReturnLegs(finalIsland, snapshot) ?? []);
  const returnLegAssessments = returnLegs.map((l, i) =>
    assessLeg(l, earliestArrivalDay + 1 + i, snapshot),
  );

  const basis: DataBasis = [...legAssessments, ...returnLegAssessments].some(
    (l) => l.basis === 'annahme',
  )
    ? 'annahme'
    : 'forecast';

  // Common head of the rationale: what was actually searched (FR18 definition).
  const rationale: string[] = [
    legs.length === 0
      ? `Von hier aus liegt keine Etappe dieser Route mehr vor — nur noch der Rückweg zählt.`
      : `Restplan ab hier: ${legs.length} ${legs.length === 1 ? 'Etappe' : 'Etappen'} — ` +
        legs.map((l) => l.id.replace('--', ' → ')).join(', ') + '.',
    `Geprüft wird beides zusammen (FR18): jede Etappe innerhalb der Familien-Schwellen ` +
      `(kein Aufkreuzen über ${snapshot.params.maxUpwindTwsKn} kn, Tagesbudget) UND Ankunft an der Basis ` +
      `bis Tag ${deadline}. Wartetage sind erlaubt, zwei kurze Etappen dürfen auf einen Tag fallen.`,
  ];
  const weakest = legAssessments.find((l) => l.ampel === ampel);
  if (weakest) {
    rationale.push(
      `Angezeigte Ampel = schwächste Etappe bei frühestmöglicher Fahrt: ` +
        `${weakest.legId.replace('--', ' → ')} an Tag ${weakest.day} ist ${AMPEL_WORT[ampel]}` +
        `${weakest.reasons.length > 0 ? ` (${weakest.reasons[0]})` : ''}.`,
    );
  }
  if (returnLegAssessments.length > 0) {
    // The return is what usually closes an option — name its worst leg, not
    // just the fact that a return exists.
    const worstBack = [...returnLegAssessments].sort(
      (a, b) => (a.headroom.windKn ?? Infinity) - (b.headroom.windKn ?? Infinity),
    )[0]!;
    rationale.push(
      `Rückweg ab ${finalIsland}: ${returnLegAssessments.length} ` +
        `${returnLegAssessments.length === 1 ? 'Etappe' : 'Etappen'}, frühester Start Tag ` +
        `${earliestArrivalDay + 1}. Kritischste davon ${worstBack.legId.replace('--', ' → ')} ` +
        `(${AMPEL_WORT[worstBack.ampel]}` +
        `${worstBack.headroom.windKn !== null ? `, ${worstBack.headroom.windKn.toFixed(1).replace('.', ',')} kn Reserve bis zur Aufkreuz-Grenze` : ', kein Aufkreuzen nötig'}).`,
    );
  }
  const withBasis = (extra: string[]): string[] => [
    ...rationale,
    ...extra,
    basis === 'annahme'
      ? 'Teile dieses Restplans liegen jenseits des Forecast-Horizonts und wurden mit der Persistenz-Annahme gerechnet — der Zustand kann mit jedem neuen Modelllauf kippen.'
      : 'Alle Etappen des Restplans liegen im echten Forecast.',
  ];

  const now = restPlanFeasible(route, currentIslandId, today, snapshot);
  if (now === 'infeasible') {
    reasons.push('Kein zulässiger Restplan mit aktuellem Forecast (FR18)');
    return {
      routeId: route.id,
      state: 'zu',
      closesOnDay: null,
      ampel,
      legAssessments,
      returnLegAssessments,
      basis,
      rationale: withBasis([
        `Ergebnis: Ab heute (Tag ${today}) gibt es keine Kombination aus Fahr- und Wartetagen mehr, ` +
          `die diese Route zulässig fährt UND bis Tag ${deadline} zurück an der Basis ist.`,
      ]),
      reasons,
    };
  }
  if (now === 'annahme') {
    reasons.push('Restplan beruht teils auf der Persistenz-Annahme — offen mit Vorbehalt');
    return {
      routeId: route.id,
      state: 'offen-annahme',
      closesOnDay: null,
      ampel,
      legAssessments,
      returnLegAssessments,
      basis: 'annahme',
      rationale: withBasis([
        `Ergebnis: Ein durchgehender Restplan ab heute existiert — er stützt sich aber auf Tage ` +
          `jenseits des Forecast-Horizonts. Darum „offen (Annahme)" statt „offen".`,
      ]),
      reasons,
    };
  }

  // Open today: does it close? Latest start day D with a feasible rest plan.
  let closesOnDay: number | null = null;
  let closingScanHitAssumption = false;
  for (let d = today + 1; d <= deadline; d++) {
    const f = restPlanFeasible(route, currentIslandId, d, snapshot);
    if (f === 'infeasible') {
      closesOnDay = d - 1;
      break;
    }
    if (f === 'annahme') {
      // On assumed days we cannot CLAIM a closing day — that is a VISIBLE
      // caveat (I/O-Matrix), not an unqualified 'offen'.
      closingScanHitAssumption = true;
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
      returnLegAssessments,
      basis,
      rationale: withBasis([
        `Ergebnis: Der Start lässt sich bis Tag ${closesOnDay} aufschieben. Ab Tag ${closesOnDay + 1} ` +
          `reicht die Restzeit bis Tag ${deadline} nicht mehr — deshalb „schließt am Tag ${closesOnDay}".`,
      ]),
      reasons,
    };
  }
  if (closingScanHitAssumption) {
    reasons.push('Schließtag nur unter der Persistenz-Annahme bestimmbar (Vorbehalt)');
    return {
      routeId: route.id,
      state: 'offen-annahme',
      closesOnDay: null,
      ampel,
      legAssessments,
      returnLegAssessments,
      basis: 'annahme',
      rationale: withBasis([
        `Ergebnis: Heute offen. Ob und wann die Option schließt, liegt jenseits des ` +
          `Forecast-Horizonts — deshalb kein Schließtag, sondern „offen (Annahme)".`,
      ]),
      reasons,
    };
  }
  return {
    routeId: route.id,
    state: 'offen',
    closesOnDay: null,
    ampel,
    legAssessments,
    returnLegAssessments,
    basis,
    rationale: withBasis([
      `Ergebnis: Offen — bis zum Stichtag Tag ${deadline} gibt es an jedem Starttag einen ` +
        `zulässigen Restplan. Kein Entscheidungsdruck aus dieser Option.`,
    ]),
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
