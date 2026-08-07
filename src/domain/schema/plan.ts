/**
 * AD-12 — the round trip is a persisted entity, not a derived value.
 *
 * A plan covers every trip day exactly once: 11 stages plus exactly one
 * harbour day. Recomputation only ever
 * RE-ASSESSES this plan — it never mutates it. Mutation happens solely
 * through the enumerated TripContext actions (AD-11/AD-12).
 */

import { z } from 'zod';

/**
 * Bumped whenever the persisted shape changes. A mismatch makes the stored
 * plan unreadable — which is a NAMED state (`planUnreadable`), never a silent
 * reset that would throw away the skipper's pins mid-trip (AD-12).
 */
export const PLAN_SCHEMA_VERSION = 1;

/**
 * Bumped whenever the solver BEHAVIOUR changes — a different question than
 * PLAN_SCHEMA_VERSION (shape). A stored plan from an older algorithm parses
 * fine, but it is a plan the current solver would no longer propose; the app
 * must be able to SEE that (planOutdated) instead of re-assessing a stale
 * route forever. Deliberately not folded into the schema version: bumping
 * that would route every stored plan through the `planUnreadable` path and
 * conflate "unreadable" with "merely outdated".
 *
 * v2 (2026-08-05): Doppelschlag-Deckel pro Törn, Hafentage-Verteilung,
 * Rangfolge firm/assumed getrennt — Pläne der v1-Rangfolge (Doppelschlag-
 * Serien, Hafentage-Halde am Ende) gelten als veraltet.
 *
 * v3 (2026-08-06): Kreuz-Modell (50° TWA als engster segelbarer Winkel) —
 * Etappen unter dem Am-Wind-Winkel dauern länger als bisher gerechnet, und die
 * Rangfolge zieht anliegende Kurse vor. Pläne der v2-Rangfolge sind damit
 * Pläne, die der Solver so nicht mehr vorschlagen würde.
 *
 * v4 (2026-08-07, Zielmodell v3): Rundkurs statt Reichweite. Der
 * Kandidatenraum ist neu (vollständige Aufzählung wiederholungsfreier Runden
 * statt gekapptem DFS plus Pendel-Generator), und die Rangfolge fragt zuerst
 * nach Etappentagen, Wiederholungsfreiheit und einem kreuzarmen Rückweg statt
 * nach Süd-Reichweite. JEDER v3-Plan ist damit veraltet — die alte Rangfolge
 * hat systematisch Törns geliefert, die den Rahmen verschenken (neun Etappen
 * in elf Tagen) und Inseln doppelt anlaufen.
 */
export const SOLVER_ALGORITHM_VERSION = 4;

/** Who put this day into the plan. `skipper` days are pins (AD-12). */
export const PlanSourceSchema = z.enum(['solver', 'skipper']);
export type PlanSource = z.infer<typeof PlanSourceSchema>;

/**
 * A sailing day, ending at one island — this is what the PRD calls an
 * "Etappe": ONE day target, numbered 1..11.
 *
 * `legIds` is a list because a day may combine two short legs (the addendum's
 * variant 2 does exactly that with Tinos–Mykonos, and the packer models it).
 * That is still a single Etappe with a single day target, so the map numbering
 * stays day-based.
 */
export const StageSchema = z.object({
  kind: z.literal('stage'),
  /** 1-based trip day. */
  day: z.number().int().positive(),
  legIds: z.array(z.string()).min(1),
  toIslandId: z.string(),
  /**
   * The concrete berth. ONLY ever skipper-set (AD-12): solver stages carry no
   * place, and the UI displays `bestPlace(island, night)` from the current
   * assessment for them — declared as a suggestion, so the display may morph
   * with the forecast while the plan itself stays put.
   */
  toPlaceId: z.string().optional(),
  /**
   * DIE HÄFEN DER ZWISCHENSTOPPS dieses Tages — ein Eintrag je Zwischenstopp,
   * in Etappen-Reihenfolge (Index i = Ziel der i-ten Etappe, also
   * `legIds.length - 1` Einträge). `null` heisst "der kuratierte Hafen der
   * Etappe gilt".
   *
   * Warum ein eigenes Feld und nicht `toPlaceId` sinngemäss weiterverwenden:
   * `toPlaceId` ist der NACHTPLATZ des Tages, und an ihm hängt die ganze
   * Liegeplatz-Logik — Nacht-Ampel, Rangfolge, "nie derselbe Platz zweimal".
   * Ein Zwischenstopp ist nichts davon. Dort wird gebadet, gegessen und
   * weitergefahren; sicher liegen muss das Boot dort nicht (Skipper
   * 2026-08-07). Der Hafen eines Zwischenstopps ist deshalb NUR ein Ankerpunkt
   * der Geometrie (legGeometry.sailedLegsByDay verankert die Zwischen-Etappen
   * daran) und geht in keine Ampel und in keine Wiederholungsregel ein.
   *
   * Optional, damit Pläne aus älterem Storage unverändert parsen: fehlt das
   * Feld, gelten die kuratierten Häfen — genau das Verhalten von vorher.
   */
  viaPlaceIds: z.array(z.string().nullable()).optional(),
  source: PlanSourceSchema,
});
export type Stage = z.infer<typeof StageSchema>;

/**
 * A day without a leg — "we stay".
 *
 * ZIELMODELL V3: eine DATENFORM, kein Planungsziel mehr. Das Wetter kann einen
 * solchen Tag erzwingen und der Skipper kann einen setzen (AD-12) — aber es
 * gibt keine Zielzahl und keine Notgrenze mehr, an der er gemessen würde. Was
 * ihn bewertet, ist die Rangfolge des Solvers: jeder Törntag trägt eine Etappe
 * (`preferred`, Kriterium `legDays`), ein Tag ohne Etappe ist damit schlicht
 * eine schlechtere Runde.
 */
export const HarbourDaySchema = z.object({
  kind: z.literal('harbour'),
  day: z.number().int().positive(),
  islandId: z.string(),
  placeId: z.string().optional(),
  source: PlanSourceSchema,
});
export type HarbourDay = z.infer<typeof HarbourDaySchema>;

export const PlanDaySchema = z.discriminatedUnion('kind', [
  StageSchema,
  HarbourDaySchema,
]);
export type PlanDay = z.infer<typeof PlanDaySchema>;

export const PlanSchema = z
  .object({
    schemaVersion: z.literal(PLAN_SCHEMA_VERSION),
    /**
     * Solver-Stand, der diesen Plan erzeugt hat. Optional, damit Pläne aus
     * älterem Storage weiter PARSEN (fehlend = Stand 0, also veraltet) —
     * ein alter Plan ist lesbar, nur nicht mehr aktuell.
     */
    algorithmVersion: z.number().int().positive().optional(),
    days: z.array(PlanDaySchema).min(1),
  })
  // A plan covers each trip day exactly once and without gaps. Persisted state
  // is untrusted input (hand edits, older versions); a duplicate day would make
  // `planDay` pick an arbitrary entry and a gap would silently drop a stage from
  // the numbering — both would surface as a wrong plan rather than an error.
  .check((ctx) => {
    const days = ctx.value.days.map((d) => d.day).sort((a, b) => a - b);
    const dupes = days.filter((d, i) => i > 0 && d === days[i - 1]);
    if (dupes.length > 0) {
      ctx.issues.push({
        code: 'custom',
        message: `Plan enthält Törntage doppelt: ${[...new Set(dupes)].join(', ')}`,
        input: ctx.value,
      });
    }
    for (let i = 1; i < days.length; i++) {
      if (days[i]! !== days[i - 1]! + 1) {
        ctx.issues.push({
          code: 'custom',
          message: `Lücke im Plan zwischen Tag ${days[i - 1]} und Tag ${days[i]}`,
          input: ctx.value,
        });
        break;
      }
    }
  });
export type Plan = z.infer<typeof PlanSchema>;

/**
 * Stammt der Plan von einem älteren Solver-Stand? Dann würde der aktuelle
 * Solver ihn so nicht mehr vorschlagen — die App bietet die Neuberechnung an
 * (bzw. ersetzt automatisch, solange der Törn nicht begonnen hat und keine
 * Pins bestehen; tripContext/usePlanning).
 */
export function planOutdated(plan: Plan): boolean {
  return (plan.algorithmVersion ?? 0) < SOLVER_ALGORITHM_VERSION;
}

// ---------------------------------------------------------------------------
// Validity (AD-13) — shared vocabulary of solver and assessment
// ---------------------------------------------------------------------------

export type ViolationKind =
  | 'budget'
  | 'upwind'
  | 'deadline'
  | 'return'
  | 'incomplete'
  /**
   * Zielmodell v2 — die Liegeplatz-Regel: kein Übernachtungsplatz zweimal
   * (Basis ausgenommen). Hart im Sinne der Gültigkeit, aber STRUKTURELL wie
   * 'incomplete': ein wiederholter Liegeplatz ist nicht gefährlich, er ist
   * nur nicht der Törn, der gewollt ist — die Ampel bleibt davon unberührt.
   */
  | 'wiederholung';

export interface Violation {
  kind: ViolationKind;
  /** Trip day it occurs on, when the violation is day-bound. */
  day: number | null;
  text: string;
  /**
   * True when this violation was derived from a stage resting on the
   * persistence assumption rather than on trusted forecast hours.
   *
   * Such a violation WARNS but does not CONDEMN: it is reported and it keeps
   * the plan out of green (via `horizonDependent`), but it does not count as a
   * safety violation and therefore cannot turn the plan red. An extrapolated
   * mean must not make the skipper write off a trip that is actually sailable —
   * red stays reserved for what the real forecast says.
   */
  assumed?: boolean;
}

/**
 * Violations that make a plan UNSAFE or break a commitment — as opposed to
 * merely falling short of the trip's ambition. Only these decide red vs.
 * yellow (FR2): "we stay in port for eight days" is safe and on time, it just
 * is not the trip that was planned, and reporting that as red would cry wolf.
 */
export const SAFETY_VIOLATION_KINDS: ViolationKind[] = [
  'upwind',
  'deadline',
  'return',
];

/**
 * Safety-relevant AND actually established. A violation derived from the
 * persistence assumption (`assumed`) is deliberately excluded: it is reported
 * and it blocks green, but it must not be the thing that turns a plan red.
 */
export function isSafetyViolation(v: Violation): boolean {
  return SAFETY_VIOLATION_KINDS.includes(v.kind) && v.assumed !== true;
}

/**
 * FEST etablierte Verletzungen — alles, was nicht auf der Persistenz-Annahme
 * beruht. Die Trennung ist das Gegenstück zur Doktrin oben ("warnt, verurteilt
 * nicht") auf der RANGFOLGE-Seite: ein Plan, dessen einzige Befunde Annahme-
 * Befunde sind, darf im Vergleich nicht gegen einen Plan verlieren, der gar
 * nicht erst losfährt. Genau das passierte, als `preferred` alle Verletzungen
 * in einen Topf warf: jeder Segeltag jenseits des Horizonts zählte gegen den
 * Plan, Tage an der Basis zählten nichts — "an Tag 7 heim und liegen bleiben"
 * gewann rechnerisch gegen jeden Törn, der die zweite Woche nutzt.
 */
export function firmViolations(v: PlanValidity): Violation[] {
  return v.violations.filter((x) => x.assumed !== true);
}

/** Die Annahme-Befunde — sie warnen weiter und rangieren, aber nachrangig. */
export function assumedViolations(v: PlanValidity): Violation[] {
  return v.violations.filter((x) => x.assumed === true);
}

export interface PlanValidity {
  /** No violations at all — safe, on time AND structurally the planned trip. */
  valid: boolean;
  /** True when only horizon unknowns stand between this plan and validity. */
  horizonDependent: boolean;
  violations: Violation[];
  /** Subset of `violations` that is safety- or commitment-relevant. */
  safetyViolations: Violation[];
}

// ---------------------------------------------------------------------------
// Derivations — the ONE source for each (AD-2: numbering is domain logic)
// ---------------------------------------------------------------------------

/** The plan entry for a trip day, or null if the day is not covered. */
export function planDay(plan: Plan, day: number): PlanDay | null {
  return plan.days.find((d) => d.day === day) ?? null;
}

/** All sailing days in day order. */
export function stagesOf(plan: Plan): Stage[] {
  return plan.days
    .filter((d): d is Stage => d.kind === 'stage')
    .sort((a, b) => a.day - b.day);
}

/**
 * FR2 leg number shown on the map: the ordinal among STAGES in day order
 * (1..11), independent of where the harbour day sits — so Alimos always
 * carries the last number even when the harbour day moves. Null on a harbour
 * day. This is the only place that counts; views never derive their own
 * numbering, otherwise map and day view disagree the moment the harbour day
 * shifts (AD-2/AD-12).
 */
export function stageNumber(plan: Plan, day: number): number | null {
  const entry = planDay(plan, day);
  if (!entry || entry.kind !== 'stage') return null;
  return stagesOf(plan).findIndex((s) => s.day === day) + 1;
}

/** Trip days the skipper has fixed — hard constraints for the solver (AD-12). */
export function pinnedDays(plan: Plan): number[] {
  return plan.days.filter((d) => d.source === 'skipper').map((d) => d.day);
}

/**
 * Days the solver may not touch: skipper pins plus everything already sailed.
 * Past days are implicitly fixed — they happened.
 */
export function fixedDays(plan: Plan, currentDay: number): number[] {
  const days = new Set(pinnedDays(plan));
  for (const d of plan.days) if (d.day < currentDay) days.add(d.day);
  return [...days].sort((a, b) => a - b);
}

/** The island the plan has the boat at when day N ends. */
export function islandAtEndOfDay(plan: Plan, day: number): string | null {
  const entry = planDay(plan, day);
  if (!entry) return null;
  return entry.kind === 'stage' ? entry.toIslandId : entry.islandId;
}

/**
 * AD-13 — die feste Eskalationsleiter, in Reihenfolge steigender Zugeständnisse.
 *
 * Liegt im Schema und nicht im Solver, weil sie normativ ist: `upwind` fehlt
 * hier ABSICHTLICH, und dass es fehlt, ist die strukturelle Garantie, dass die
 * 65°/25-kn-Schwelle nie gelockert werden kann — keine Laufzeitprüfung, die
 * jemand vergessen könnte. Ausserdem trägt jede Bewertung einer Route die
 * erreichte Stufe als Preisschild mit (`RouteOptionAssessment.costLevel`).
 *
 * `pickup` stand hier bis 2026-08-06 aus demselben Grund; die
 * FR31-Gästewechsel-Bedingung ist auf Skipper-Entscheid entfallen.
 */
export const RELAXATION_ORDER = [
  'none',
  'hardMax',
  'doppelschlag',
  'nightLeg',
] as const;
export type RelaxationLevel = (typeof RELAXATION_ORDER)[number];

// ---------------------------------------------------------------------------
// Zielmodell v2 — die tägliche Abbruch-Notation
// ---------------------------------------------------------------------------

/**
 * Status des Heimwegs von einem Plantag aus. Das ist die ABSICHERUNG, die aus
 * der Planung herausgelöst wurde: geplant wird optimistisch (Forecast +
 * Annahme), abgesichert wird täglich — dieser Status sagt dem Skipper pro Tag,
 * ob er weiterfahren kann oder woran er den Abbruch erkennt.
 *
 *  - 'meltemi-fest':  der Heimweg hält auch unter dem vollen Meltemi-Worst-Case.
 *  - 'wetterfenster': der Heimweg trägt nur nach aktuellem Forecast — dreht der
 *                     Wind auf starken Nord, wird an DEM Tag abgebrochen, an
 *                     dem es passiert. Der Abbruchpunkt ist also keiner, den
 *                     der Skipper unter mehreren Fenster-Tagen wählt; die
 *                     `note` unterscheidet darum den ersten Fenster-Tag
 *                     (Einstieg in die tägliche Entscheidung) von Folgetagen.
 *  - 'kritisch':      schon nach Forecast keine Rückkehr mehr darstellbar
 *                     (deckt sich mit der harten Verletzung 'return').
 */
export type ReturnCheckStatus = 'meltemi-fest' | 'wetterfenster' | 'kritisch';

/** Machbarkeits-Urteil, strukturgleich zu ppr.Feasibility (Schema-Schicht). */
export type ReturnFeasibility = 'feasible' | 'infeasible' | 'horizon';

export interface DayReturnCheck {
  day: number;
  /** Insel, an der der Plan das Boot am Ende dieses Tages hat. */
  islandId: string;
  /** Rückkehr ab dem Folgetag nach aktuellem Forecast, bis zum Stichtag. */
  byForecast: ReturnFeasibility;
  /** Rückkehr ab dem Folgetag unter dem Meltemi-Worst-Case, bis zum PoR-Tag. */
  underWorstCase: ReturnFeasibility;
  status: ReturnCheckStatus;
  /** Die Anweisung für den Tag, ausformuliert für die Anzeige. */
  note: string;
}
