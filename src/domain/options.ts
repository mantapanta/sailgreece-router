/**
 * FR18 / FR20 — mid-term option space.
 *
 * ZIELMODELL V2: "Geht dieses Ziel noch?" beantwortet dieselbe Maschine wie
 * die Hauptroute — `completePlan` mit Wendepunkt-Filter. offen = es existiert
 * ein GÜLTIGER Plan (alle harten Bedingungen, inklusive Zustiegstag und
 * Liegeplatz-Regel); offen-horizont = gültig, hängt aber an der
 * Persistenz-Annahme; zu = kein gültiger Plan, begründet mit den Verletzungen
 * des besten Versuchs. Der Meltemi-Worst-Case ist hier KEIN K.-o. mehr: er
 * gehört zur täglichen Abbruch-Notation (solver.deriveReturnChecks), nicht in
 * die Planung. 'schliesst am Tag X' = ab Tag X+1 existiert kein forecast-
 * tragfähiger Restplan mehr (Scan über restPlanFeasible, forecast-basiert,
 * gegen den echten Stichtag).
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
  packLegsFeasible,
  returnFeasibleStarting,
  routeIslandSequence,
  type Feasibility,
} from './ppr.ts';
import { deadlineFrame } from './time.ts';
import { legsOfVariant } from './legs.ts';
import { KONZEPT_NAME, konzeptLageFor, konzeptOfIslands } from './konzept.ts';
import { completePlan, reachNmFor, type SolveResult } from './solver.ts';
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
 * with the return constraint.
 *
 * ZIELMODELL V2: forecast-basiert (Persistenz-Annahme => 'horizon'), gegen den
 * ECHTEN Stichtag — dieselben Maßstäbe wie die Plan-Gültigkeit (Bedingungen 1,
 * 2 und 2' hart nach Forecast). Der frühere Worst-Case-Maßstab machte den
 * Optionsraum strenger als die Gültigkeit: bei 30 kn aus Nord ist keine
 * Rückkehr nach Norden segelbar, also war jedes ferne Ziel "zu", während der
 * Solver denselben Törn für gültig hielt. Der Worst-Case gehört jetzt zur
 * täglichen Abbruch-Notation (solver.deriveReturnChecks).
 */
export function restPlanFeasible(
  variantLegs: Leg[],
  currentIslandId: string,
  startDay: number,
  snapshot: PlanningSnapshot,
): Feasibility {
  const legs = remainingRouteLegs(variantLegs, currentIslandId);
  if (legs === null) return 'infeasible';
  const deadline = deadlineFrame(snapshot.params).deadlineDay;
  if (legs.length === 0) {
    return returnFeasibleStarting(currentIslandId, startDay, snapshot, 'forecast', deadline);
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
    const back = returnFeasibleStarting(lastIsland, arrivalDay + 1, snapshot, 'forecast', deadline);
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
 * DIE EINE ANTWORT auf "geht dieses Ziel, und was kostet es?" — derselbe
 * Solver wie für die Hauptroute (`completePlan` mit Filter auf den
 * Wendepunkt), damit Karte und Plan nie zweierlei behaupten können (AD-3).
 *
 * Liefert auch den UNGÜLTIGEN besten Versuch zurück: seine Verletzungen sind
 * die ehrliche Begründung eines "zu" — statt eines pauschalen Satzes, dem der
 * Skipper nicht ansehen kann, ob Stichtag, Zustieg oder Wetter das Problem ist.
 */
function optionPlan(
  turnIslandId: string,
  currentIslandId: string,
  snapshot: PlanningSnapshot,
  /**
   * Id der kuratierten Variante, deren eigene Etappenkette zuerst versucht
   * wird. Trägt sie (der Solver findet zu ihr überhaupt eine Packung), IST
   * sie der Plan der Option — "Westkykladen-Runde" heisst dann die
   * Westkykladen-Runde, nicht irgendeine Kette zum selben Wendepunkt.
   * Andernfalls fällt die Option auf die Wendepunkt-Suche zurück: das Ziel
   * bleibt erreichbar, auch wenn die kuratierte Kette es gerade nicht trägt.
   */
  variantId?: string,
): {
  /**
   * Tragfähig = keine Sicherheits-, Termin- oder Zustiegs-Verletzung — die
   * Messlatte des FR2-Zeugen, NICHT die volle Plan-Gültigkeit: strukturelle
   * Defizite (Hafentage über der Notgrenze, ein wiederholter Liegeplatz)
   * schliessen ein ZIEL nicht. Sie machen den konkreten Plan unschöner, und
   * genau dafür stehen sie an ihm dran — aber "Santorin geht nicht" darf
   * nicht heissen "der beste Plan dorthin hätte drei Hafentage zu viel".
   */
  tragfaehig: boolean;
  horizonDependent: boolean;
  violations: string[];
  level: RelaxationLevel;
  note: string;
  plan: Plan;
  turnDay: number | null;
} | null {
  /**
   * Erst die EIGENE Kette der kuratierten Route, dann — und nur dann — die
   * freie Suche zum selben Wendepunkt.
   *
   * Die Reihenfolge ist die ganze Aussage: trägt die Best-Practice-Kette, IST
   * sie die Antwort (sonst hiesse "Westkykladen-Runde" irgendeine Kette nach
   * Milos). Trägt sie nicht, darf ihr Scheitern aber nicht das ZIEL schliessen
   * — "Santorin geht nicht" darf nicht heissen "die eine kuratierte Kette
   * dorthin ist gerade nicht packbar". Also übernimmt die freie Suche, wenn
   * sie einen tragfähigen Plan findet. Findet auch sie keinen, bleibt der
   * kuratierte Versuch stehen: abraten braucht einen Plan zum Ansehen.
   */
  const solveTo = (opts: { variantId?: string }) =>
    completePlan(snapshot, currentIslandId, [], {
      turnIslandId,
      stopAtFirstValid: true,
      ...opts,
    });
  const sicher = (r: SolveResult | null): boolean =>
    r !== null && r.validity.safetyViolations.length === 0;

  const eigen = variantId !== undefined ? solveTo({ variantId }) : null;
  const frei = sicher(eigen) ? null : solveTo({});
  const solved = sicher(eigen) ? eigen : sicher(frei) ? frei : (eigen ?? frei);
  if (!solved) return null;

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
    tragfaehig: solved.validity.safetyViolations.length === 0,
    horizonDependent: solved.validity.horizonDependent,
    violations: [
      ...new Set(
        (solved.validity.safetyViolations.length > 0
          ? solved.validity.safetyViolations
          : solved.validity.violations
        ).map((v) => v.text),
      ),
    ],
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
  const deadline = deadlineFrame(snapshot.params).deadlineDay;
  const reasons: string[] = [];
  /**
   * Der Wendepunkt ist die SÜDLICHSTE Insel der Route (reachNmFor — dieselbe
   * Kennzahl wie im Solver), nicht die letzte: eine Rundkurs-Variante endet
   * wieder an der Basis, und ihre letzte Insel als Wendepunkt zu lesen ergäbe
   * Reichweite 0. Bei Gleichstand entscheidet die Distanz. ANGEZEIGT wird
   * als reachNm weiterhin die Distanz Basis→Wendepunkt — die Zahl, die der
   * Skipper mit der Karte abgleichen kann.
   */
  const base = snapshot.library.islands.find(
    (i) => i.id === snapshot.params.baseIslandId,
  );
  const suedOf = reachNmFor(snapshot);
  const distOf = (islandId: string): number => {
    const island = snapshot.library.islands.find((i) => i.id === islandId);
    return base && island ? distanceNm(base.coordinates, island.coordinates) : 0;
  };
  const seq = routeIslandSequence(vLegs);
  const turnIslandId =
    seq.length > 0
      ? seq.reduce(
          (far, id) =>
            suedOf(id) > suedOf(far) ||
            (suedOf(id) === suedOf(far) && distOf(id) > distOf(far))
              ? id
              : far,
          seq[0]!,
        )
      : snapshot.params.baseIslandId;
  const reachNm = base ? distOf(turnIslandId) : null;

  /**
   * ROUTEN-KONZEPT der Option (konzept.ts) — die zentrale Logik, sichtbar am
   * einzelnen Ziel: trägt die Lage das Konzept dieser Route nicht, steht die
   * Revier-Warnung an der Option, ohne die Machbarkeits-Antwort des Solvers
   * zu verfälschen (Empfehlung über der Maschine, kein zweites Urteil).
   */
  const konzeptId = konzeptOfIslands(seq);
  const lage = konzeptLageFor(snapshot);
  const konzeptWarnung =
    lage.eignung[konzeptId] === 'ungeeignet'
      ? `${KONZEPT_NAME[konzeptId]} trägt die aktuelle Wetterlage nicht: ` +
        `${lage.gruende[konzeptId].join(' ')} Die Route bleibt wählbar — die App rät ab, sie verbietet nicht.`
      : null;

  /**
   * EMPFEHLUNG statt AUSSCHLUSS (Skipper 2026-08-06). Die Wind-Lage bestimmt
   * hier NUR, ob abgeraten wird; ob die Route noch geht, beantwortet weiterhin
   * der Solver (`state`). Die Gründe werden unten um die Sicherheits-Befunde
   * des besten Versuchs ergänzt — auch die sind ein Abraten, kein Verbot.
   */
  const abratenGruende: string[] = [];
  if (konzeptWarnung) abratenGruende.push(konzeptWarnung);
  const empfehlungBasis: RouteOptionAssessment['empfehlung'] =
    lage.eignung[konzeptId] === 'ungeeignet'
      ? 'abgeraten'
      : lage.eignung[konzeptId] === 'grenzwertig'
        ? 'moeglich'
        : 'empfohlen';

  const leer = (
    over: Partial<RouteOptionAssessment>,
  ): RouteOptionAssessment => ({
    routeId: variant.id,
    name: variant.name,
    konzeptId,
    konzeptWarnung,
    empfehlung: empfehlungBasis,
    // Kopie: die Gründe wachsen unten noch (Sicherheits-Befunde), und eine
    // geteilte Referenz liesse die zurückgegebene Option nachträglich mutieren.
    abratenGruende: [...abratenGruende],
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
    // Vergeben erst in assessPlanning, wo die Alternativen-Liste entsteht.
    previewIndex: null,
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

  /**
   * ZIELMODELL V2 — der Zustand kommt aus dem Solver, nicht aus einer zweiten
   * Rechnung: offen heisst "es existiert ein gültiger Plan zu diesem
   * Wendepunkt", mit denselben harten Bedingungen wie die Hauptroute. Ein "zu"
   * nennt die Verletzungen des besten Versuchs — ehrlich statt pauschal.
   */
  const solved = optionPlan(turnIslandId, currentIslandId, snapshot, variant.id);
  if (!solved) {
    // Der EINZIGE echte Ausschluss: es gibt zu diesem Ziel gar keine
    // Etappenkette. Das ist Bibliotheks-Geometrie, kein Wetterurteil.
    reasons.push('Zu diesem Ziel lässt sich mit aktuellem Forecast kein Restplan bauen');
    return leer({ state: 'zu', ampel, legAssessments });
  }
  if (!solved.tragfaehig) {
    /**
     * Der beste Versuch trägt Sicherheits-Befunde — typischerweise: der Wind
     * ist zu stark. Die Route wird deshalb NICHT aus dem Angebot genommen
     * (Skipper 2026-08-06): ihr Plan bleibt hängen, damit sie ansehbar und
     * gegen die Empfehlung übernehmbar ist. `state: 'zu'` sagt weiterhin
     * ehrlich, dass kein TRAGFÄHIGER Plan existiert; `empfehlung:
     * 'abgeraten'` sagt, dass die App abrät — zwei Aussagen, nicht ein Verbot.
     */
    reasons.push('Kein tragfähiger Restplan zu diesem Ziel:');
    for (const text of solved.violations.slice(0, 3)) reasons.push(text);
    abratenGruende.push(
      `Der beste Plan zu diesem Ziel trägt Sicherheits-Befunde: ${solved.violations
        .slice(0, 3)
        .join(' ')} Wer trotzdem will, kann die Route ansehen und übernehmen — auf eigenes seemännisches Urteil.`,
    );
    return leer({
      state: 'zu',
      ampel,
      legAssessments,
      empfehlung: 'abgeraten',
      // Der Preis bleibt bewusst null: einen gültigen Preis hat dieser Plan
      // nicht. Der Plan selbst hängt trotzdem dran — das ist der Unterschied.
      plan: solved.plan,
      turnDay: solved.turnDay,
    });
  }

  const preis = {
    costLevel: solved.level,
    costNote: solved.note,
    plan: solved.plan,
    turnDay: solved.turnDay,
  };

  if (solved.horizonDependent) {
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
