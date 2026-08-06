/**
 * Story 1.2 — pure Tagesansicht view-model derivations.
 *
 * Tested, no React, no clock reads (time is injected). AD-2: these are
 * DISPLAY aggregations — anything resembling a verdict stays in the
 * assessment; here nothing is judged, only arranged for one screen.
 */

import type { Ampel } from '../domain/schema/common.ts';
import type { KiteHinweis } from '../domain/schema/kite.ts';
import type {
  PlanAssessment,
  RouteOptionAssessment,
  StageAssessment,
} from '../domain/schema/snapshot.ts';

/** "Stand vor 4 h" once fetchedAt is older than the cache TTL; null while fresh. */
export function staleForecastLabel(
  fetchedAtIso: string,
  nowMs: number,
  ttlMs: number,
): string | null {
  const age = nowMs - Date.parse(fetchedAtIso);
  if (!Number.isFinite(age) || age <= ttlMs) return null;
  return `Stand vor ${Math.floor(age / 3_600_000)} h`;
}

/**
 * Hero-switch rule (EXPERIENCE.md IA): the hero shows today's stage until the
 * confirmed position equals today's destination; then Tag N+1 is the open
 * decision. Island granularity — currentIslandId IS the assessment's position
 * derivation (AD-2: no second derivation here). Harbour days never switch;
 * on the last trip day (no N+1) the hero stays on today.
 */
export function dayViewStages(
  main: Pick<PlanAssessment, 'stages'> | null,
  currentDay: number,
  currentIslandId: string | null,
): {
  hero: StageAssessment | null;
  rest: StageAssessment[];
  past: StageAssessment[];
} {
  if (!main) return { hero: null, rest: [], past: [] };
  const today = main.stages.find((s) => s.day === currentDay) ?? null;
  let hero = today;
  if (
    today &&
    today.kind === 'stage' &&
    currentIslandId !== null &&
    currentIslandId === today.toIslandId
  ) {
    hero = main.stages.find((s) => s.day === currentDay + 1) ?? today;
  }
  const heroDay = hero?.day ?? currentDay;
  return {
    hero,
    rest: main.stages.filter((s) => s.day > heroDay),
    // A stage that was "hero-switched past" counts as already sailed.
    past: main.stages.filter((s) => s.day < heroDay),
  };
}

/** Collapsed Optionsraum summary. Open = every state except 'zu'. */
export function optionsSummary(
  options: Pick<RouteOptionAssessment, 'state' | 'closesOnDay'>[],
): {
  openCount: number;
  nextDeadlineDay: number | null;
} {
  const open = options.filter((o) => o.state !== 'zu');
  const deadlines = open
    .map((o) => o.closesOnDay)
    .filter((d): d is number => d !== null);
  return {
    openCount: open.length,
    nextDeadlineDay: deadlines.length > 0 ? Math.min(...deadlines) : null,
  };
}

/**
 * Kite-Hinweise für EINE Etappen-Karte: welche Zeilen stehen da, und was wird
 * zusammengefasst.
 *
 * Gezeigt wird, was die Richtung des Spots trifft — 'passt' ("heute geht was")
 * und 'stark' ("Richtung ja, Wind über der Obergrenze"). Beides ist eine
 * Entscheidung. Der Rest ist Auskunft ohne Anlass: an einem Tag mit Nordwind
 * sagt "der Spot braucht S–W" nur, dass dieser Spot heute nicht gemeint ist,
 * und drei solche Zeilen verdecken die eine, die zählt.
 *
 * Weggelassen wird deshalb, aber NICHT verschwiegen: `weitere` trägt die Zahl,
 * die die Karte als Satz ausgibt. Eine stille Kürzung wäre in dieser App die
 * schlechtere Lösung — sie liest sich wie "hier gibt es sonst nichts".
 */
export function kiteHinweisAnzeige(hinweise: KiteHinweis[]): {
  gezeigt: KiteHinweis[];
  weitere: number;
} {
  const gezeigt = hinweise.filter(
    (h) => h.eignung === 'passt' || h.eignung === 'stark',
  );
  return { gezeigt, weitere: hinweise.length - gezeigt.length };
}

/** Verdict wording of the trip status line (EXPERIENCE Voice & Tone). */
export function restTripVerdictLabel(ampel: Ampel): string {
  return {
    gruen: 'Round-Trip trägt',
    gelb: 'Round-Trip unter Vorbehalt',
    rot: 'Kein gültiger Round-Trip',
    unbewertet: 'Round-Trip unbewertet',
  }[ampel];
}
