/**
 * FR22 — reasoning for the plan AS A WHOLE.
 *
 * The per-leg and per-option rationales explain single verdicts. They do not
 * answer the question the skipper actually asks in the morning: "why does the
 * plan look like THIS today?" That needs one level up — the starting position,
 * what the option space still allows, which constraint actually binds it (wind
 * or calendar), where the next decision pressure sits, the weather picture
 * behind it all, how little would have to change to break it, and what data
 * the whole thing rests on.
 *
 * Pure derivation over the already-computed parts (AD-2): nothing is judged
 * here that was not judged in scoring/ampel/options/ppr — this module only
 * reads their results and puts them into sentences.
 */

import type { Route } from './schema/route.ts';
import type {
  Assessment,
  DataBasis,
  DecisionPoint,
  LegAssessment,
  PlanRationale,
  PlanRationaleSection,
  PlanningSnapshot,
  PprResult,
  RouteOptionAssessment,
} from './schema/snapshot.ts';
import { AMPEL_WORT } from './schema/common.ts';
import { compassPoint, normDeg } from './geo.ts';
import {
  athensHourLabel,
  athensStamp,
  dateForTripDay,
  hourIndices,
  legWindow,
} from './time.ts';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const num1 = (v: number) => v.toFixed(1).replace('.', ',');

const OPEN_STATES = new Set<RouteOptionAssessment['state']>([
  'offen',
  'offen-annahme',
  'schliesst',
]);

function routeName(routes: Route[], id: string): string {
  return routes.find((r) => r.id === id)?.name ?? id;
}

/**
 * Wind picture of one trip day across the WHOLE cruising area: the range and
 * the prevailing direction over the sailing part of the day. Deliberately an
 * area figure, not a per-leg one — this is the synoptic backdrop against which
 * the individual leg verdicts make sense.
 */
interface DayWeather {
  day: number;
  date: string;
  minKn: number | null;
  maxKn: number | null;
  dirDeg: number | null;
  /** Any hour of this day's window resting on the persistence assumption. */
  basis: DataBasis;
}

function dayWeather(snapshot: PlanningSnapshot, day: number): DayWeather {
  const { params } = snapshot;
  const window = legWindow(params.tripStartDate, day, params.departureHourAthens);
  // Only the sailing part of the day, not the full 24 h simulation bound.
  const sailingEnd =
    window.startMs + (params.maxSailHours + params.maxMotorHours) * 3600_000;
  const indices = hourIndices({ startMs: window.startMs, endMs: sailingEnd }, snapshot.times);

  let min: number | null = null;
  let max: number | null = null;
  let x = 0;
  let y = 0;
  let assumed = false;
  for (const fc of Object.values(snapshot.forecast)) {
    for (const i of indices) {
      const kn = fc.windKn[i];
      const dir = fc.windDirDeg[i];
      if (typeof kn !== 'number' || typeof dir !== 'number') continue;
      if (fc.windAssumed[i]) assumed = true;
      if (min === null || kn < min) min = kn;
      if (max === null || kn > max) max = kn;
      x += kn * Math.sin(rad(dir));
      y += kn * Math.cos(rad(dir));
    }
  }
  return {
    day,
    date: dateForTripDay(params.tripStartDate, day),
    minKn: min,
    maxKn: max,
    dirDeg: Math.hypot(x, y) > 1e-9 ? normDeg(deg(Math.atan2(x, y))) : null,
    basis: assumed ? 'annahme' : 'forecast',
  };
}

/**
 * The leg with the least room left before it degrades.
 *
 * Knots of wind reserve and hours of time reserve are different units — "4 kn"
 * is not comparably tighter or looser than "2,4 h". They are therefore ranked
 * by their reserve RELATIVE to their own limit: 4 of 25 kn (16 %) is tighter
 * than 2,4 of 8 h (30 %). On a tie wind wins, because the wind rule is the
 * safety limit (FR16) while the day budget is comfort.
 */
function tightestLeg(
  legs: LegAssessment[],
  limits: { maxUpwindTwsKn: number; maxDayHours: number },
): {
  leg: LegAssessment;
  kind: 'wind' | 'stunden';
  reserve: number;
} | null {
  let best:
    | { leg: LegAssessment; kind: 'wind' | 'stunden'; reserve: number; share: number }
    | null = null;
  for (const leg of legs) {
    const candidates: { kind: 'wind' | 'stunden'; reserve: number; share: number }[] = [];
    if (leg.headroom.windKn !== null && limits.maxUpwindTwsKn > 0) {
      candidates.push({
        kind: 'wind',
        reserve: leg.headroom.windKn,
        share: leg.headroom.windKn / limits.maxUpwindTwsKn,
      });
    }
    if (leg.headroom.hours !== null && limits.maxDayHours > 0) {
      candidates.push({
        kind: 'stunden',
        reserve: leg.headroom.hours,
        share: leg.headroom.hours / limits.maxDayHours,
      });
    }
    for (const c of candidates) {
      const better =
        !best ||
        c.share < best.share ||
        (c.share === best.share && c.kind === 'wind' && best.kind === 'stunden');
      if (better) best = { leg, ...c };
    }
  }
  return best ? { leg: best.leg, kind: best.kind, reserve: best.reserve } : null;
}

export interface PlanRationaleInput {
  snapshot: PlanningSnapshot;
  currentIslandId: string | null;
  positionNote: string | null;
  routeOptions: RouteOptionAssessment[];
  ppr: PprResult;
  decisionPoints: DecisionPoint[];
  dayOptions: Assessment['dayOptions'];
  forecastHorizonIso: string | null;
  waveHorizonIso: string | null;
  assumedFromDay: number | null;
}

export function derivePlanRationale(input: PlanRationaleInput): PlanRationale {
  const { snapshot, routeOptions, ppr, decisionPoints } = input;
  const { params, library, trip } = snapshot;
  const today = trip.currentDay;
  const routes = library.routes;
  const sections: PlanRationaleSection[] = [];

  // --- 1 starting situation -------------------------------------------------
  const islandName = input.currentIslandId
    ? (library.islands.find((i) => i.id === input.currentIslandId)?.name ??
      input.currentIslandId)
    : null;
  const situation: string[] = [
    islandName
      ? `Standort: ${islandName}, Törntag ${today} von ${params.tripLengthDays} ` +
        `(${dateForTripDay(params.tripStartDate, today)})` +
        `${trip.position?.source === 'gps' ? ', per GPS' : trip.position?.source === 'manual' ? ', manuell gesetzt' : ''}.`
      : `Keine Position bestimmt — ohne Standort lässt sich kein Plan rechnen.`,
    `Abfahrtszeit für die Rechnung: ${trip.departureHourOverride ?? params.departureHourAthens}:00 Athen. ` +
      `Alle Etappen werden gegen das Wetter IHRES Tages gerechnet, nicht gegen das von heute.`,
    `Harte Klammer: Ankunft an der Basis bis Törntag ${ppr.effectiveDeadlineDay} ` +
      `(Ausschiffung Tag ${params.disembarkDay}, Vorabend, ${params.bufferDays} ` +
      `${params.bufferDays === 1 ? 'Puffertag' : 'Puffertage'}).`,
  ];
  if (input.positionNote) situation.push(input.positionNote);
  sections.push({ title: 'Ausgangslage', lines: situation });

  // --- 2 what the option space still allows --------------------------------
  const open = routeOptions.filter(
    (o) => OPEN_STATES.has(o.state) && !routes.find((r) => r.id === o.routeId)?.isReturnChain,
  );
  const closed = routeOptions.filter(
    (o) => o.state === 'zu' && !routes.find((r) => r.id === o.routeId)?.isReturnChain,
  );
  // routeOptions arrive ordered conservative -> ambitious (escalation rank).
  const mostAmbitious = open[open.length - 1];
  const space: string[] = [
    `${open.length} von ${open.length + closed.length} Routen-Optionen sind noch erreichbar, ` +
      `${closed.length} nicht mehr.`,
  ];
  if (mostAmbitious) {
    space.push(
      `Weiteste noch offene Option: ${routeName(routes, mostAmbitious.routeId)} ` +
        `(Eskalationsstufe ${routes.find((r) => r.id === mostAmbitious.routeId)?.escalationRank ?? '?'}), ` +
        `Etappen-Ampel ${AMPEL_WORT[mostAmbitious.ampel]}.`,
    );
  }
  for (const o of closed) {
    space.push(
      `${routeName(routes, o.routeId)} ist zu — ${o.reasons[0] ?? 'kein zulässiger Restplan'}.`,
    );
  }
  const closing = routeOptions
    .filter((o) => o.state === 'schliesst' && o.closesOnDay !== null)
    .sort((a, b) => a.closesOnDay! - b.closesOnDay!);
  if (closing.length > 0) {
    space.push(
      `Zeitlich befristet: ` +
        closing
          .map((o) => `${routeName(routes, o.routeId)} bis Tag ${o.closesOnDay}`)
          .join(', ') + '.',
    );
  }
  sections.push({ title: 'Möglichkeitsraum', lines: space });

  // --- 3 which constraint actually binds -----------------------------------
  // Two candidates: the FR16 wind rule (a red leg) or the calendar (the return
  // deadline). Naming the wrong one sends the skipper looking in the wrong
  // place, so it is derived, not guessed.
  //
  // The RETURN legs must be in here. In this cruising area the outbound legs
  // run downwind and the return beats north against the Meltemi — judging the
  // plan on the outbound half alone would always blame the calendar.
  const seenLegs = new Set<string>();
  const allLegs = [
    ...routeOptions.flatMap((o) => [...o.legAssessments, ...o.returnLegAssessments]),
    ...ppr.legAssessments,
  ].filter((l) => {
    const key = `${l.legId}@${l.day}`;
    if (seenLegs.has(key)) return false;
    seenLegs.add(key);
    return true;
  });
  const redLegs = allLegs.filter((l) => l.ampel === 'rot');
  // "Red" alone does not mean "wind" — a leg is just as often red because it
  // busts the day budget. The two send the skipper to different places (wait
  // for the wind vs. shorten the plan), so they are distinguished by the
  // structured headroom, not by guessing from the ampel.
  const windBroken = redLegs.filter((l) => (l.headroom.windKn ?? Infinity) <= 0);
  const plural = (n: number) => (n === 1 ? 'Etappe' : 'Etappen');
  const binding: string[] = [];
  if (closed.length === 0 && closing.length === 0) {
    binding.push(
      `Momentan begrenzt nichts den Raum: jede Option hat bis zum Stichtag einen ` +
        `zulässigen Restplan.`,
    );
  } else if (windBroken.length > 0) {
    const worst = windBroken[0]!;
    binding.push(
      `Der Wind: ${windBroken.length} ${plural(windBroken.length)} im Möglichkeitsraum ` +
        `reißen die Aufkreuz-Grenze von ${params.maxUpwindTwsKn} kn. Beispiel ` +
        `${worst.legId.replace('--', ' → ')} an Tag ${worst.day} — ` +
        `${num1(Math.abs(worst.headroom.windKn ?? 0))} kn darüber.`,
    );
  } else if (redLegs.length > 0) {
    const worst = redLegs[0]!;
    binding.push(
      `Nicht der Wind, sondern die Strecke: ${redLegs.length} ${plural(redLegs.length)} sind rot, ` +
        `ohne die Aufkreuz-Grenze zu reißen. Beispiel ${worst.legId.replace('--', ' → ')} ` +
        `an Tag ${worst.day} — ${worst.reasons[0] ?? 'außerhalb der Familien-Schwellen'}.`,
    );
  } else {
    binding.push(
      `Der Kalender, nicht der Wind: keine Etappe ist rot — die geschlossenen bzw. ` +
        `befristeten Optionen scheitern an der Restzeit bis Tag ${ppr.effectiveDeadlineDay}.`,
    );
  }
  const tight = tightestLeg(
    allLegs.filter((l) => l.ampel !== 'unbewertet'),
    {
      maxUpwindTwsKn: params.maxUpwindTwsKn,
      maxDayHours: params.maxSailHours + params.maxMotorHours,
    },
  );
  if (tight) {
    const where = `${tight.leg.legId.replace('--', ' → ')} an Tag ${tight.leg.day}`;
    // Nominative and dative forms of the limit — German needs both articles,
    // and "die harten Tagesmaximum" is exactly the kind of glitch that makes
    // a reasoning text look machine-generated instead of trustworthy.
    const limit =
      tight.kind === 'wind'
        ? {
            nom: `die Aufkreuz-Grenze (${params.maxUpwindTwsKn} kn)`,
            dat: `zur Aufkreuz-Grenze (${params.maxUpwindTwsKn} kn)`,
            unit: 'kn',
            hint: 'Frischt es dort stärker auf, kippt diese Etappe.',
          }
        : {
            nom: `das harte Tagesmaximum (${num1(params.maxSailHours + params.maxMotorHours)} h)`,
            dat: `zum harten Tagesmaximum (${num1(params.maxSailHours + params.maxMotorHours)} h)`,
            unit: 'h',
            hint: 'Wird es langsamer, kippt diese Etappe.',
          };
    binding.push(
      // A negative reserve is not a small reserve — say "exceeded", otherwise
      // "nur -0,2 h Reserve" reads as if there were still room.
      tight.reserve < 0
        ? `Engste Stelle im ganzen Plan: ${where} — ${limit.nom} ist bereits um ` +
          `${num1(Math.abs(tight.reserve))} ${limit.unit} überschritten.`
        : `Engste Stelle im ganzen Plan: ${where} — nur ${num1(tight.reserve)} ${limit.unit} ` +
          `bis ${limit.dat}. ${limit.hint}`,
    );
  }
  sections.push({ title: 'Was den Raum begrenzt', lines: binding });

  // --- 4 next decision pressure --------------------------------------------
  const next = decisionPoints[0];
  sections.push({
    title: 'Nächster Druckpunkt',
    lines:
      next === undefined
        ? ['Keine terminierte Entscheidung — der Plan lässt sich derzeit offen halten.']
        : [
            `Tag ${next.day}: ${next.text}`,
            decisionPoints.length > 1
              ? `Danach folgen ${decisionPoints.length - 1} weitere Entscheidungstage — ` +
                `siehe Abschnitt Entscheidungspunkte.`
              : `Danach steht keine weitere Entscheidung im Kalender.`,
          ],
  });

  // --- 5 weather picture ----------------------------------------------------
  const lastDay = Math.min(params.tripLengthDays, today + 5);
  const weatherLines: string[] = [];
  for (let d = today; d <= lastDay; d++) {
    const w = dayWeather(snapshot, d);
    if (w.minKn === null || w.maxKn === null) {
      weatherLines.push(`Tag ${d} (${w.date}): keine Windwerte im Fahrtfenster.`);
      continue;
    }
    weatherLines.push(
      `Tag ${d} (${w.date}): ${Math.round(w.minKn)}–${Math.round(w.maxKn)} kn aus ` +
        `${compassPoint(w.dirDeg)}${w.basis === 'annahme' ? ' — Annahme' : ''}.`,
    );
  }
  weatherLines.push(
    `Werte über das ganze Revier im Fahrtfenster ab ` +
      `${athensHourLabel(legWindow(params.tripStartDate, today, params.departureHourAthens).startMs)} Athen — ` +
      `die Spanne umfasst alle Plätze und Wegpunkte, einzelne Etappen können enger liegen.`,
  );
  sections.push({ title: 'Wetterbild der nächsten Tage', lines: weatherLines });

  // --- 6 return path --------------------------------------------------------
  const atBase = (ppr.remainingDistanceNm ?? -1) === 0;
  sections.push({
    title: 'Rückweg',
    lines: [
      atBase
        ? `Das Schiff liegt an der Basis — es gibt derzeit keinen Rückweg zu sichern. ` +
          `Der Stichtag Tag ${ppr.effectiveDeadlineDay} greift erst, sobald es losgeht.`
        : ppr.latestReturnStartDay !== null
          ? `Spätester Umkehrtag: Tag ${ppr.latestReturnStartDay}` +
            `${ppr.remainingDistanceNm !== null ? `, ${Math.round(ppr.remainingDistanceNm)} sm über die Rückfallkette` : ''}. ` +
            `Bis dahin kostet Weiterfahren keine Rückkehrsicherheit.`
          : `Kein Umkehrtag mehr darstellbar — der Rückweg ist die vordringliche Aufgabe.`,
      ...ppr.reasons,
    ],
  });

  // --- 7 data basis ---------------------------------------------------------
  const basisLines: string[] = [
    `Modell ${snapshot.model}, Lauf ${athensStamp(snapshot.modelRunIso)} (Athen), ` +
      `abgerufen ${athensStamp(snapshot.fetchedAtIso)}.`,
  ];
  if (input.assumedFromDay === null) {
    basisLines.push('Der gesamte Plan steht auf echten Modelldaten.');
  } else {
    basisLines.push(
      `Ab Tag ${input.assumedFromDay} beruhen Teile auf der Persistenz-Annahme. ` +
        `Echte Werte: Wind bis ${athensStamp(input.forecastHorizonIso)}, ` +
        `Wellen bis ${athensStamp(input.waveHorizonIso)}.`,
      `Der Plan ist damit korrigierbar, nicht sicher: jeder neue Modelllauf rechnet ihn ` +
        `komplett neu — bricht eine Annahme, ändert sich der Zustand sichtbar.`,
    );
  }
  sections.push({ title: 'Datenbasis', lines: basisLines });

  // --- summary --------------------------------------------------------------
  const summary = !islandName
    ? 'Ohne Position lässt sich kein Plan rechnen — Standort setzen.'
    : `Von ${islandName} aus (Tag ${today}) sind ${open.length} Routen-Optionen offen; ` +
      (next !== undefined
        ? `die erste Entscheidung steht an Tag ${next.day}. `
        : 'derzeit steht keine Entscheidung an. ') +
      (input.assumedFromDay !== null
        ? `Ab Tag ${input.assumedFromDay} unter Annahme gerechnet.`
        : 'Vollständig auf echten Modelldaten gerechnet.');

  return { summary, sections };
}
