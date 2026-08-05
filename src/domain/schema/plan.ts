/**
 * AD-12 — the round trip is a persisted entity, not a derived value.
 *
 * A plan covers every trip day exactly once: 11 stages plus exactly one
 * harbour day (default the guest-pickup day). Recomputation only ever
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
  source: PlanSourceSchema,
});
export type Stage = z.infer<typeof StageSchema>;

/** A day without a leg — "we stay". Exactly one per plan (params.harbourDays). */
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

// ---------------------------------------------------------------------------
// Validity (AD-13) — shared vocabulary of solver and assessment
// ---------------------------------------------------------------------------

export type ViolationKind =
  | 'budget'
  | 'upwind'
  | 'deadline'
  | 'return'
  | 'pickup'
  | 'incomplete';

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
  'pickup',
];

/**
 * Safety-relevant AND actually established. A violation derived from the
 * persistence assumption (`assumed`) is deliberately excluded: it is reported
 * and it blocks green, but it must not be the thing that turns a plan red.
 */
export function isSafetyViolation(v: Violation): boolean {
  return SAFETY_VIOLATION_KINDS.includes(v.kind) && v.assumed !== true;
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
