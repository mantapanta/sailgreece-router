/**
 * FR18 / FR20 — der Optionsraum: "wie weit kommen wir noch?".
 *
 * ZIELMODELL V3 (Skipper 2026-08-07, "zwei getrennte Fragen"). Die Hauptroute
 * beantwortet "welche Runde ist die beste?" (solver.ts). HIER steht die andere
 * Frage: welche Ziele sind noch erreichbar, bis wann, und zu welchem Preis.
 *
 * EIN ZIEL IST EINE INSEL, keine kuratierte Variante mehr. Der Unterschied ist
 * der Kern des beanstandeten Fehlers: eine Variante ist ein NAME mit einer
 * festen Kette, und wenn diese Kette nicht trug, fiel der Optionsraum auf eine
 * freie Suche zurück — und lieferte deren Plan unter dem Namen der Variante
 * aus. So kam eine "Verlängerung nach Santorin" zustande, die auf Naxos endet.
 *
 * Deshalb gilt hier eine harte, am ERGEBNIS geprüfte Invariante: ein Ziel
 * bekommt nur einen Plan, der es wirklich als Etappenziel enthält — sonst
 * keinen. Ein Etikett auf einer fremden Kette ist keine dritte Möglichkeit.
 *
 * Die Zustände: offen = es existiert ein tragfähiger Plan dorthin;
 * offen-horizont = tragfähig, hängt aber an der Persistenz-Annahme;
 * schliesst am Tag X = ab Tag X+1 reicht der Rahmen nicht mehr (der Vertrag
 * "ein Törntag, eine Verbindung" bindet auch die Frist); zu = kein tragfähiger
 * Plan, begründet. Der Meltemi-Worst-Case ist hier KEIN K.-o.: er gehört zur
 * täglichen Abbruch-Notation (solver.deriveReturnChecks), nicht in die Planung.
 *
 * Abgeraten heisst nie gesperrt — aber auch nie "hier ist ein Ersatzplan".
 */

import type { Leg } from './schema/route.ts';
import type {
  PlanningSnapshot,
  RouteOptionAssessment,
  RoutenEmpfehlung,
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
import {
  KONZEPT_NAME,
  konzeptLageFor,
  konzeptOfIslands,
  konzeptOfPlan,
} from './konzept.ts';
import { buildCandidates, completePlan, legLibrary, reachNmFor } from './solver.ts';
import { stagesOf } from './schema/plan.ts';
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
 * DIE ZIEL-INSELN des Optionsraums — abgeleitet, nicht kuratiert.
 *
 * ZIELMODELL V3 (Skipper 2026-08-07: "zwei getrennte Fragen"). Die Hauptroute
 * beantwortet "welche Runde ist die beste?", der Optionsraum "wie weit kommen
 * wir noch?". Bis dahin fragte er stattdessen "trägt Variante X?" — und weil
 * eine Variante ein NAME mit einer festen Kette ist, hing an jeder Antwort ein
 * Name, der mit dem gelieferten Plan nichts zu tun haben musste.
 *
 * Ein Ziel ist hier deshalb eine INSEL, und angeboten wird nur, was im
 * Suchraum überhaupt als Wendepunkt vorkommt: jede Option ist damit per
 * Konstruktion eine Frage, auf die es eine echte Runde geben KANN. Sortiert
 * nach Süd-Reichweite (die Törnfrage), das fernste Ziel zuerst.
 */
export function zielInseln(
  snapshot: PlanningSnapshot,
  currentIslandId: string,
): string[] {
  const reach = reachNmFor(snapshot);
  const frame = deadlineFrame(snapshot.params);
  const daysAvailable = frame.deadlineDay - snapshot.trip.currentDay + 1;
  const kandidaten = buildCandidates(snapshot, currentIslandId).filter(
    (c) => c.legs.length > 0 && c.turnIslandId !== snapshot.params.baseIslandId,
  );

  /**
   * NUR ZIELE, DIE DEN RAHMEN FÜLLEN.
   *
   * Ohne diese Beschränkung bietet der Optionsraum jede Insel des Graphen als
   * Ziel an — auch die Attische Küste, eine Stunde vor der Basis. Der Solver
   * antwortet darauf mit einer Runde, die dort wendet, und die ist zwangsläufig
   * kurz: eine Runde mit der Attischen Küste als SÜDLICHSTEM Punkt hat zwei
   * Etappen. Genau solche Vorschläge hat der Skipper beanstandet ("Routen mit
   * sechs und acht Tagen, deren Logik sich nicht erschliesst").
   *
   * Ein Ziel ist deshalb nur dann eine Frage wert, wenn es überhaupt eine
   * Runde über den vollen Törnrahmen gibt, die dort wendet. Damit hat JEDE
   * Alternative dieselbe Länge wie die Hauptroute und ist mit ihr vergleichbar
   * — sie unterscheidet sich darin, WOHIN sie führt, nicht darin, wie viel
   * Törn sie verschenkt.
   *
   * Nur wenn es gar keine volle Runde mehr gibt (spät im Törn, oder das Wetter
   * hat den Rahmen zusammenschrumpfen lassen), fällt die Auswahl auf alle
   * Wendepunkte zurück — dann ist eine kurze Runde keine Verschwendung mehr,
   * sondern alles, was noch geht.
   */
  const voll = kandidaten.filter((c) => c.legs.length === daysAvailable);
  const quelle = voll.length > 0 ? voll : kandidaten;

  const ziele = new Set(quelle.map((c) => c.turnIslandId));
  return [...ziele].sort((a, b) => reach(b) - reach(a) || a.localeCompare(b));
}

/**
 * FR18 — "geht dieses Ziel noch, und was kostet es?" für EINE Ziel-Insel.
 *
 * Beantwortet von derselben Maschine wie die Hauptroute (`completePlan` mit
 * Wendepunkt-Filter), damit Karte und Plan nie zweierlei behaupten (AD-3).
 */
export function assessTargetOption(
  targetIslandId: string,
  currentIslandId: string | null,
  snapshot: PlanningSnapshot,
): RouteOptionAssessment {
  const today = snapshot.trip.currentDay;
  const deadline = deadlineFrame(snapshot.params).deadlineDay;
  const reasons: string[] = [];
  const base = snapshot.library.islands.find(
    (i) => i.id === snapshot.params.baseIslandId,
  );
  const target = snapshot.library.islands.find((i) => i.id === targetIslandId);
  const name = target?.name ?? targetIslandId;
  const reachNm =
    base && target ? distanceNm(base.coordinates, target.coordinates) : null;

  const leer = (over: Partial<RouteOptionAssessment>): RouteOptionAssessment => ({
    routeId: `ziel-${targetIslandId}`,
    name,
    konzeptId: konzeptOfIslands([targetIslandId]),
    konzeptWarnung: null,
    empfehlung: 'empfohlen',
    abratenGruende: [],
    state: 'zu',
    closesOnDay: null,
    ampel: 'unbewertet',
    legAssessments: [],
    reasons,
    turnIslandId: targetIslandId,
    reachNm,
    costLevel: null,
    costNote: null,
    plan: null,
    turnDay: null,
    // Vergeben erst in assessPlanning, wo die Alternativen-Liste entsteht.
    previewIndex: null,
    ...over,
  });

  if (!currentIslandId) return leer({ reasons: ['Keine Position gesetzt'] });

  /**
   * EINE Suche, kein Fallback. Bis 2026-08-07 löste der Optionsraum zweimal:
   * erst die kuratierte Kette der Variante, dann — wenn die nicht trug — eine
   * freie Suche zum selben Wendepunkt. Der zweite Versuch lieferte einen
   * völlig anderen Plan, der trotzdem unter dem Namen der Variante ausgeliefert
   * wurde. Mit abgeschafften Routen-Namen ist der Zweig gegenstandslos.
   */
  const solved = completePlan(snapshot, currentIslandId, [], {
    turnIslandId: targetIslandId,
    stopAtFirstValid: true,
  });
  if (!solved) {
    reasons.push('Zu diesem Ziel lässt sich mit aktuellem Forecast kein Restplan bauen');
    // 'zu' UND 'abgeraten': das Ziel bleibt sichtbar und benannt, aber es hängt
    // kein Plan daran. Ein geschlossenes Ziel als "empfohlen" zu führen wäre
    // die Art stiller Widerspruch, die der Skipper zu Recht beanstandet hat.
    return leer({ state: 'zu', empfehlung: 'abgeraten' });
  }

  const stages = stagesOf(solved.plan);

  /**
   * DIE INVARIANTE, an der Beispiel 3 dauerhaft scheitert: ein Ziel darf nur
   * einen Plan zurückbekommen, der es WIRKLICH anläuft.
   *
   * Geprüft am fertigen Plan, nicht im Aufrufpfad — Sorgfalt beim Aufrufen ist
   * genau das, was jahrelang gereicht hätte und nie gereicht hat. Vorher trug
   * der Plan das Wendepunkt-Etikett des Kandidaten, und eine abgebrochene
   * Packung wurde als "Verlängerung nach Santorin" ausgeliefert, die auf Naxos
   * endet.
   */
  if (!stages.some((s) => s.toIslandId === targetIslandId)) {
    reasons.push(
      `Der beste Plan zu diesem Ziel läuft ${name} nicht an — die Option gilt als zu`,
    );
    return leer({
      state: 'zu',
      empfehlung: 'abgeraten',
      abratenGruende: [
        `Es gibt im aktuellen Wetterfenster keinen Törn, der ${name} anläuft und rechtzeitig ` +
          `zurück ist. Die App legt bewusst KEINEN Ersatzplan darunter — ein Plan, der woanders ` +
          `hinführt, wäre unter diesem Namen eine falsche Zusage.`,
      ],
    });
  }

  /**
   * ROUTEN-KONZEPT und Ampel kommen ab jetzt aus dem PLAN, nicht aus einer
   * kuratierten Kette daneben: angesehen und beurteilt wird, was übernommen
   * würde (AD-3).
   */
  const konzeptId = konzeptOfPlan(solved.plan);
  const lage = konzeptLageFor(snapshot);
  const konzeptWarnung =
    lage.eignung[konzeptId] === 'ungeeignet'
      ? `${KONZEPT_NAME[konzeptId]} trägt die aktuelle Wetterlage nicht: ` +
        `${lage.gruende[konzeptId].join(' ')} Das Ziel bleibt wählbar — die App rät ab, sie verbietet nicht.`
      : null;

  const legs = legLibrary(snapshot);
  const legAssessments: LegAssessment[] = [];
  for (const stage of stages) {
    if (stage.day < today) continue;
    for (const legId of stage.legIds) {
      const leg = legs.get(legId);
      if (leg) legAssessments.push(assessLeg(leg, stage.day, snapshot));
    }
  }
  const ampel: Ampel =
    legAssessments.length > 0
      ? worstAmpel(legAssessments.map((l) => l.ampel))
      : 'unbewertet';

  const abratenGruende: string[] = [];
  if (konzeptWarnung) abratenGruende.push(konzeptWarnung);
  const empfehlungBasis: RoutenEmpfehlung =
    lage.eignung[konzeptId] === 'ungeeignet'
      ? 'abgeraten'
      : lage.eignung[konzeptId] === 'grenzwertig'
        ? 'moeglich'
        : 'empfohlen';

  const doubleDays = stages.filter((s) => s.legIds.length > 1).length;
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
  const costNote =
    teile.length === 0
      ? 'ohne Zugeständnis — eine Verbindung pro Tag im Zielbudget'
      : `nur mit ${teile.join(' und ')}`;

  const turnDay = stages.find((s) => s.toIslandId === targetIslandId)?.day ?? null;
  const gemeinsam = {
    konzeptId,
    konzeptWarnung,
    ampel,
    legAssessments,
    plan: solved.plan,
    turnDay,
    abratenGruende,
  };

  /**
   * Sicherheits-Befunde nehmen das Ziel NICHT aus dem Angebot (Skipper
   * 2026-08-06): der Plan bleibt hängen, damit er ansehbar und gegen die
   * Empfehlung übernehmbar ist. `state: 'zu'` sagt weiterhin ehrlich, dass
   * kein tragfähiger Plan existiert; `empfehlung: 'abgeraten'` sagt, dass die
   * App abrät — zwei Aussagen, nicht ein Verbot.
   */
  if (solved.validity.safetyViolations.length > 0) {
    const texte = [...new Set(solved.validity.safetyViolations.map((v) => v.text))];
    reasons.push('Kein tragfähiger Restplan zu diesem Ziel:');
    for (const text of texte.slice(0, 3)) reasons.push(text);
    abratenGruende.push(
      `Der beste Plan zu diesem Ziel trägt Sicherheits-Befunde: ${texte
        .slice(0, 3)
        .join(' ')} Wer trotzdem will, kann die Route ansehen und übernehmen — auf eigenes seemännisches Urteil.`,
    );
    // Der Preis bleibt bewusst null: einen gültigen Preis hat dieser Plan nicht.
    return leer({ ...gemeinsam, state: 'zu', empfehlung: 'abgeraten' });
  }

  const preis = { costLevel: solved.relaxedTo, costNote };

  if (solved.validity.horizonDependent) {
    reasons.push('Machbarkeit reicht über den Forecast-Horizont hinaus — offen mit Vorbehalt');
    return leer({ ...gemeinsam, ...preis, state: 'offen-horizont', empfehlung: empfehlungBasis });
  }

  /**
   * Schliesst die Option? Gefragt wird an der KETTE DIESES PLANS: "wenn ich
   * mich erst an Tag d entscheide — trägt sie dann noch?". Damit misst der
   * Schliesstag genau den Plan, den der Skipper vor sich hat (AD-3), statt
   * eine zweite, leicht abweichende Kette.
   */
  const planLegs = stages.flatMap((s) => s.legIds).map((id) => legs.get(id));
  let closesOnDay: number | null = null;
  let closingScanHitHorizon = false;
  if (planLegs.every((l): l is Leg => l !== undefined)) {
    for (let d = today + 1; d <= deadline; d++) {
      /**
       * DER VERTRAG BINDET AUCH DIE FRIST: ein Törntag, eine Verbindung. Wer
       * an Tag d losfährt, braucht für `planLegs.length` Etappen ebenso viele
       * Tage. `restPlanFeasible` allein antwortet auf die KAPAZITÄTS-Frage
       * (zwei kurze Schläge an einem Tag sind seemännisch möglich, ppr.ts) und
       * fände die Option deshalb bis zum letzten Tag "offen" — eine Frist, die
       * nie abläuft, ist als Entscheidungspunkt (FR20) wertlos.
       */
      if (d + planLegs.length - 1 > deadline) {
        closesOnDay = d - 1;
        break;
      }
      const f = restPlanFeasible(planLegs, currentIslandId, d, snapshot);
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
  }
  if (closesOnDay !== null && closesOnDay <= deadline) {
    reasons.push(`Ab Tag ${closesOnDay + 1} existiert kein zulässiger Restplan mehr`);
    return leer({
      ...gemeinsam,
      ...preis,
      state: 'schliesst',
      closesOnDay,
      empfehlung: empfehlungBasis,
    });
  }
  if (closingScanHitHorizon) {
    reasons.push('Schließtag jenseits des Forecast-Horizonts nicht bestimmbar (Vorbehalt)');
    return leer({ ...gemeinsam, ...preis, state: 'offen-horizont', empfehlung: empfehlungBasis });
  }
  return leer({ ...gemeinsam, ...preis, state: 'offen', empfehlung: empfehlungBasis });
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
      // Der Name der Option IST der Insel-Name (options.assessTargetOption) —
      // es gibt keine Routen-Tabelle mehr, in der er nachzuschlagen wäre.
      const name = opt.name;
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
            ? `Heute entscheiden: ${name} — ab morgen ist diese Option geschlossen${preis}.`
            : `Noch ${rest} ${rest === 1 ? 'Tag' : 'Tage'}: ${name} schließt Tag ${opt.closesOnDay}${preis}.`
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
