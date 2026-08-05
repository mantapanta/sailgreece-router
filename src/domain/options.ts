/**
 * FR18 / FR20 — mid-term option space.
 * An option is OPEN when, with the current forecast, a remaining plan exists
 * that (1) keeps every leg inside the family thresholds (FR16, durations from
 * polar + offset) and (2) reaches Alimos by the eve of disembarkation incl.
 * buffer day (FR19). 'schliesst am Tag X' = from day X+1 no such plan exists;
 * 'zu' = none exists. Beyond the horizon: 'offen-horizont' with visible
 * caveat. Feasibility uses the SAME leg duration function as scoring/ppr.
 */

import type { Leg, Variant } from './schema/route.ts';
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
import { legsOfVariant } from './legs.ts';
import { completePlan } from './solver.ts';
import { stagesOf, type RelaxationLevel } from './schema/plan.ts';
import type { Plan } from './schema/plan.ts';
import { distanceNm } from './geo.ts';

/** Legs of a variant still ahead of the given island (null = not on it). */
export function remainingRouteLegs(
  legs: Leg[],
  currentIslandId: string,
): Leg[] | null {
  const seq = routeIslandSequence(legs);
  const idx = seq.indexOf(currentIslandId);
  if (idx < 0) return null;
  return legs.slice(idx);
}

/**
 * Does a remaining plan exist for this option when its execution starts on
 * `startDay` (staying put until then)? Combines the option's remaining legs
 * with the return constraint (FR18 definition, both conditions).
 */
export function restPlanFeasible(
  variantLegs: Leg[],
  currentIslandId: string,
  startDay: number,
  snapshot: PlanningSnapshot,
): Feasibility {
  const legs = remainingRouteLegs(variantLegs, currentIslandId);
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

/**
 * WAS DIE OPTION KOSTET — die mildeste Stufe der Leiter, auf der ein gültiger
 * Plan für dieses Ziel existiert, samt dem Plan selbst.
 *
 * Ohne diese Angabe ist eine offene Option eine Behauptung ohne Preisschild:
 * "Santorin offen" sagt nichts darüber, dass dafür zwei Nachtetappen fällig
 * wären. Genau diese Folge soll der Skipper sehen, BEVOR er sich entscheidet —
 * nicht erst, wenn er mitten drin steckt.
 *
 * Gerechnet wird über dieselbe Maschinerie wie die Hauptroute (`completePlan`
 * mit Filter auf den Wendepunkt), damit ein hier gezeigter Preis und ein
 * später tatsächlich gebauter Plan nicht auseinanderlaufen können (AD-3).
 */
function optionCost(
  turnIslandId: string,
  currentIslandId: string,
  snapshot: PlanningSnapshot,
): { level: RelaxationLevel; note: string; plan: Plan; turnDay: number | null } | null {
  const solved = completePlan(snapshot, currentIslandId, [], {
    turnIslandId,
    stopAtFirstValid: true,
  });
  if (!solved || !solved.validity.valid) return null;

  const stages = stagesOf(solved.plan);
  const doubleDays = stages.filter((s) => s.legIds.length > 1).length;
  const turnStage = stages.find((s) => s.toIslandId === turnIslandId) ?? null;

  const teile: string[] = [];
  if (doubleDays > 0) {
    teile.push(
      doubleDays === 1
        ? 'einen Tag mit zwei Verbindungen'
        : `${doubleDays} Tage mit zwei Verbindungen`,
    );
  }
  if (solved.relaxedTo === 'hardMax') teile.push('Tage am harten Stundenmaximum');
  if (solved.relaxedTo === 'nightLeg') teile.push('mindestens eine Nachtetappe');

  return {
    level: solved.relaxedTo,
    note:
      teile.length === 0
        ? 'ohne Zugeständnis — eine Verbindung pro Tag im Zielbudget'
        : `nur mit ${teile.join(' und ')}`,
    plan: solved.plan,
    turnDay: turnStage?.day ?? null,
  };
}

/** FR18: offen / offen-horizont / schliesst am Tag X / zu — per route option. */
export function assessRouteOption(
  variant: Variant,
  currentIslandId: string | null,
  snapshot: PlanningSnapshot,
): RouteOptionAssessment {
  const vLegs = legsOfVariant(variant, snapshot.library);
  const today = snapshot.trip.currentDay;
  const deadline = effectiveDeadlineDay(snapshot);
  const reasons: string[] = [];
  /**
   * Der Wendepunkt ist die FERNSTE Insel der Route, nicht die letzte.
   *
   * Eine Rundkurs-Variante endet wieder an der Basis; ihre letzte Insel als
   * Wendepunkt zu lesen ergäbe Reichweite 0 und die Aussage "diese Route führt
   * nirgendwohin" — für die Westkykladen-Runde genau verkehrt.
   */
  const base = snapshot.library.islands.find(
    (i) => i.id === snapshot.params.baseIslandId,
  );
  const reachOf = (islandId: string): number => {
    const island = snapshot.library.islands.find((i) => i.id === islandId);
    return base && island ? distanceNm(base.coordinates, island.coordinates) : 0;
  };
  const seq = routeIslandSequence(vLegs);
  const turnIslandId =
    seq.length > 0
      ? seq.reduce((far, id) => (reachOf(id) > reachOf(far) ? id : far), seq[0]!)
      : snapshot.params.baseIslandId;
  const reachNm = base ? reachOf(turnIslandId) : null;

  const leer = (
    over: Partial<RouteOptionAssessment>,
  ): RouteOptionAssessment => ({
    routeId: variant.id,
    name: variant.name,
    state: 'zu',
    closesOnDay: null,
    ampel: 'unbewertet',
    legAssessments: [],
    reasons,
    turnIslandId,
    reachNm,
    costLevel: null,
    costNote: null,
    plan: null,
    turnDay: null,
    ...over,
  });

  if (!currentIslandId) {
    return leer({ reasons: ['Keine Position gesetzt'] });
  }

  // Display assessment: remaining legs on the earliest plan (one per day).
  const legs = remainingRouteLegs(vLegs, currentIslandId) ?? [];
  const legAssessments: LegAssessment[] = legs.map((leg, i) =>
    assessLeg(leg, today + i, snapshot),
  );
  const ampel: Ampel =
    legAssessments.length > 0
      ? worstAmpel(legAssessments.map((l) => l.ampel))
      : 'unbewertet';

  const now = restPlanFeasible(vLegs, currentIslandId, today, snapshot);
  if (now === 'infeasible') {
    reasons.push('Kein zulässiger Restplan mit aktuellem Forecast (FR18)');
    return leer({ state: 'zu', ampel, legAssessments });
  }

  // Der Preis wird nur für Optionen gerechnet, die überhaupt noch offen sind —
  // für eine geschlossene gibt es nichts zu bezahlen, und der Lauf über die
  // Leiter ist nicht umsonst.
  const cost = optionCost(turnIslandId, currentIslandId, snapshot);
  const preis = {
    costLevel: cost?.level ?? null,
    costNote: cost?.note ?? null,
    plan: cost?.plan ?? null,
    turnDay: cost?.turnDay ?? null,
  };

  if (now === 'horizon') {
    reasons.push('Machbarkeit reicht über den Forecast-Horizont hinaus — offen mit Vorbehalt');
    return leer({ state: 'offen-horizont', ampel, legAssessments, ...preis });
  }

  // Open today: does it close? Latest start day D with a feasible rest plan.
  let closesOnDay: number | null = null;
  let closingScanHitHorizon = false;
  for (let d = today + 1; d <= deadline; d++) {
    const f = restPlanFeasible(vLegs, currentIslandId, d, snapshot);
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
    return leer({ state: 'schliesst', closesOnDay, ampel, legAssessments, ...preis });
  }
  if (closingScanHitHorizon) {
    reasons.push('Schließtag jenseits des Forecast-Horizonts nicht bestimmbar (Vorbehalt)');
    return leer({ state: 'offen-horizont', ampel, legAssessments, ...preis });
  }
  return leer({ state: 'offen', ampel, legAssessments, ...preis });
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

  const routesSorted = [...snapshot.library.variants].sort(
    (a, b) => a.escalationRank - b.escalationRank,
  );
  for (const route of routesSorted) {
    const legs = remainingRouteLegs(legsOfVariant(route, snapshot.library), currentIslandId);
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
  routes: { id: string; name: string }[],
  /**
   * Heutiger Törntag und Vorwarnzeit. Ohne beides bleibt es beim reinen
   * Terminkalender — die Vorwarnung ist der Unterschied zwischen "du hättest
   * gestern abbiegen müssen" und einer Entscheidung, die man noch treffen kann.
   */
  today?: number,
  lookaheadDays?: number,
): DecisionPoint[] {
  const points: DecisionPoint[] = [];
  for (const opt of routeOptions) {
    if (opt.state === 'schliesst' && opt.closesOnDay !== null) {
      const route = routes.find((r) => r.id === opt.routeId);
      const name = route?.name ?? opt.routeId;
      const rest =
        today !== undefined ? opt.closesOnDay - today : null;
      /**
       * Die Vorwarnung ist der eigentliche Zweck von FR20: eine Option, die
       * heute schliesst, ist keine Entscheidung mehr, sondern eine Mitteilung.
       * Innerhalb der Vorwarnzeit wird sie deshalb dringlich formuliert UND
       * nennt den Preis — wer sie jetzt noch ziehen will, soll gleich sehen,
       * was er dafür in Kauf nimmt.
       */
      const dringend =
        rest !== null &&
        lookaheadDays !== undefined &&
        rest >= 0 &&
        rest <= lookaheadDays;
      const preis = opt.costNote ? ` (${opt.costNote})` : '';
      points.push({
        day: opt.closesOnDay,
        text: dringend
          ? rest === 0
            ? `HEUTE entscheiden: ${name} — ab morgen ist diese Option zu${preis}.`
            : `Noch ${rest} ${rest === 1 ? 'Tag' : 'Tage'}: ${name} schliesst am Tag ${opt.closesOnDay}${preis}.`
          : `Bis Tag ${opt.closesOnDay} entscheiden: ${name} — danach verfällt die Option${preis}.`,
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
