/**
 * AD-13 — the round-trip solver.
 *
 * Pure and deterministic (stable tie-breaks). It extends the existing packing
 * DP (ppr.ts) from a boolean feasibility check to a plan builder, and it
 * searches the curated leg library along the route variants (FR9) — never a
 * free-form graph, and never a variant replayed verbatim.
 *
 * A candidate round trip is built as OUTBOUND (along a variant, up to a
 * turning point) + RETURN (over the fallback chain). That is exactly the
 * domain question "how far south can we get?": the turning point is the
 * decision, the way home is the chain.
 *
 * Validity is three-tiered and normative (see `validatePlan`):
 *   (1) every stage inside the reliable horizon holds the FR16 thresholds;
 *       stages beyond it are 'unbewertet' and count NEITHER way (FR18)
 *   (2) arrival at the base by the ONE deadline constant
 *  (2') the return is sailable under the Meltemi worst case (shared with PoR)
 *   (3) a ferry-reachable pickup harbour is reached on the pickup date (FR31)
 *
 * Relaxation is an OUTER loop over the same DP with loosened params, never a
 * special path inside it — which is what structurally guarantees that the
 * 65°/25 kn threshold and the pickup condition can never be relaxed away.
 */

import type { Leg, Route } from './schema/route.ts';
import type { Params } from './schema/params.ts';
import type { PlanningSnapshot } from './schema/snapshot.ts';
import type {
  Plan,
  PlanDay,
  PlanValidity,
  Stage,
  Violation,
} from './schema/plan.ts';
import {
  PLAN_SCHEMA_VERSION,
  isSafetyViolation,
  planDay,
  stagesOf,
} from './schema/plan.ts';
import { assessLeg } from './scoring.ts';
import {
  packLegs,
  remainingReturnLegs,
  returnFeasibleStarting,
  routeIslandSequence,
  type Feasibility,
  type PackedLeg,
} from './ppr.ts';
import { deadlineFrame, tripDayForDate } from './time.ts';

// ---------------------------------------------------------------------------
// Relaxation
// ---------------------------------------------------------------------------

/**
 * Fixed relaxation order (AD-13). `upwind` and `pickup` are deliberately
 * ABSENT — they are never relaxed, and leaving them out of this list is the
 * structural guarantee, not a runtime check that could be forgotten.
 */
export const RELAXATION_ORDER = ['none', 'hardMax', 'nightLeg'] as const;
export type RelaxationLevel = (typeof RELAXATION_ORDER)[number];

/**
 * Apply a relaxation level to the params the DP runs against.
 *
 * What matters is that each level actually changes what counts as RED, since
 * red is what makes the packer reject a day. Lifting only `targetDayHours`
 * would merely shift the green/yellow line and relax nothing.
 */
export function relaxParams(params: Params, level: RelaxationLevel): Params {
  switch (level) {
    case 'none':
      return params;
    case 'hardMax':
      // Spend the target budget up to the hard maximum: days that were red for
      // exceeding the target become acceptable, the hard ceiling still holds.
      return {
        ...params,
        targetDayHours: params.maxSailHours + params.maxMotorHours,
        targetMotorHours: params.maxMotorHours,
      };
    case 'nightLeg':
      // FR16 night-leg exception: a long light-wind passage (the family sleeps)
      // becomes admissible. This raises the HARD ceiling, which is what the
      // budget verdict tests for red — bounded by the configured night-leg
      // wind limit and duration, never unbounded.
      return {
        ...params,
        targetDayHours: params.lightWindMaxHours,
        targetMotorHours: params.maxMotorHours,
        maxSailHours: Math.max(params.maxSailHours, params.lightWindMaxHours),
        maxMotorHours: Math.max(params.maxMotorHours, params.lightWindMaxHours),
        lightWindMaxTwsKn: Math.max(params.lightWindMaxTwsKn, params.nightLegMaxTwsKn),
      };
  }
}

// ---------------------------------------------------------------------------
// Leg library & candidates
// ---------------------------------------------------------------------------

/**
 * Deduplicated leg library. Legs live inline in the route documents until the
 * seeding rework lands; the same leg currently appears up to four times, so
 * first-writer-wins keeps it deterministic.
 */
export function legLibrary(snapshot: PlanningSnapshot): Map<string, Leg> {
  const legs = new Map<string, Leg>();
  for (const route of snapshot.library.routes) {
    for (const leg of route.legs) {
      if (!legs.has(leg.id)) legs.set(leg.id, leg);
    }
  }
  return legs;
}

/** Outbound variants (everything that is not the fallback chain), conservative first. */
function outboundVariants(snapshot: PlanningSnapshot): Route[] {
  return [...snapshot.library.routes]
    .filter((r) => !r.isReturnChain)
    .sort((a, b) => a.escalationRank - b.escalationRank || a.id.localeCompare(b.id));
}

export interface Candidate {
  /** Variant the outbound part came from (for alternative diversity). */
  variantId: string;
  escalationRank: number;
  /** Island where the trip turns around — the "how far south" decision. */
  turnIslandId: string;
  legs: Leg[];
}

/**
 * Candidate round trips from `startIslandId`: for every variant that touches
 * our position, every turning point along it, plus the way home over the
 * chain. Deduplicated by leg chain, deterministic order.
 */
export function buildCandidates(
  snapshot: PlanningSnapshot,
  startIslandId: string,
): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();

  const push = (c: Candidate) => {
    // An EMPTY leg chain is a legitimate candidate: "stay at the base". When
    // the Meltemi blocks everything, that is the least-violating answer the
    // app must still be able to give (FR18) — so it needs its own key rather
    // than being dropped as falsy.
    const key = c.legs.length > 0 ? c.legs.map((l) => l.id).join('>') : '(bleiben)';
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  };

  for (const variant of outboundVariants(snapshot)) {
    const seq = routeIslandSequence(variant);
    const startIdx = seq.indexOf(startIslandId);
    if (startIdx < 0) continue;
    for (let turnIdx = startIdx; turnIdx < seq.length; turnIdx++) {
      const outbound = variant.legs.slice(startIdx, turnIdx);
      const turnIslandId = seq[turnIdx]!;
      const ret = remainingReturnLegs(turnIslandId, snapshot);
      if (!ret) continue;
      push({
        variantId: variant.id,
        escalationRank: variant.escalationRank,
        turnIslandId,
        legs: [...outbound, ...ret],
      });
    }
  }

  // Turning around right here is always a candidate, even when no variant
  // covers our position — it is the most conservative plan there is.
  const directReturn = remainingReturnLegs(startIslandId, snapshot);
  if (directReturn) {
    push({
      variantId: 'direkt-rueckkehr',
      escalationRank: -1,
      turnIslandId: startIslandId,
      legs: directReturn,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Packing -> Plan
// ---------------------------------------------------------------------------

/**
 * Turn a packing into plan days: every trip day from `startDay` to the
 * deadline gets either a stage (the legs packed onto it) or a harbour day.
 * Days the boat is not sailing become harbour days at the island it sits on.
 */
export function planFromPacking(
  packed: PackedLeg[],
  startDay: number,
  deadlineDay: number,
  startIslandId: string,
  source: 'solver' | 'skipper' = 'solver',
): PlanDay[] {
  const byDay = new Map<number, PackedLeg[]>();
  for (const p of packed) {
    const list = byDay.get(p.day) ?? [];
    list.push(p);
    byDay.set(p.day, list);
  }

  const days: PlanDay[] = [];
  let island = startIslandId;
  for (let day = startDay; day <= deadlineDay; day++) {
    const legsToday = (byDay.get(day) ?? []).sort((a, b) => a.legIdx - b.legIdx);
    if (legsToday.length > 0) {
      island = legsToday[legsToday.length - 1]!.leg.toIslandId;
      days.push({
        kind: 'stage',
        day,
        legIds: legsToday.map((p) => p.leg.id),
        toIslandId: island,
        source,
      });
    } else {
      days.push({ kind: 'harbour', day, islandId: island, source });
    }
  }
  return days;
}

// ---------------------------------------------------------------------------
// Validity (AD-13)
// ---------------------------------------------------------------------------

/**
 * The normative validity check. Conditions (1), (2), (2') and (3) — nothing
 * else makes a plan invalid, and none of them is skipped.
 */
export function validatePlan(plan: Plan, snapshot: PlanningSnapshot): PlanValidity {
  const { params, library } = snapshot;
  const legs = legLibrary(snapshot);
  const frame = deadlineFrame(params);
  const violations: Violation[] = [];
  let horizonDependent = false;

  // (1) every stage inside the reliable horizon holds the FR16 thresholds.
  for (const stage of stagesOf(plan)) {
    let offset = 0;
    for (const legId of stage.legIds) {
      const leg = legs.get(legId);
      if (!leg) {
        // Dead reference after a reimport: unassessable, not a threshold
        // violation — the plan survives and the skipper repairs it (AD-12).
        horizonDependent = true;
        violations.push({
          kind: 'incomplete',
          day: stage.day,
          text: `Etappe ${legId} ist nicht mehr in der Bibliothek — Tag unbewertet`,
        });
        continue;
      }
      const a = assessLeg(leg, stage.day, snapshot, {
        departureOffsetHours: offset || undefined,
      });
      offset += a.totalHours ?? 0;
      if (a.ampel === 'unbewertet') {
        horizonDependent = true;
        continue;
      }
      if (a.ampel === 'rot') {
        const upwind = a.reasons.some((r) => r.includes('Aufkreuzen'));
        violations.push({
          kind: upwind ? 'upwind' : 'budget',
          day: stage.day,
          text: `Tag ${stage.day}: ${a.reasons.join('; ')}`,
        });
      }
    }
  }

  // (1b) Harbour days: `harbourDays` is the TARGET (normally the single buffer
  // day), and waiting out weather is legitimate — so exceeding the target is
  // no finding at all up to `harbourDaysMax` (skipper: "at a pinch up to 5").
  // Beyond that ceiling the plan is no longer the intended trip and says so,
  // but as a STRUCTURAL finding: lying in port is safe, so it must not turn the
  // rest-trip light red. What keeps the solver from proposing an idle trip is
  // the score (more stages rank higher) plus the FR2 existence predicate,
  // which demands a witness that actually sails.
  const harbourCount = plan.days.filter((d) => d.kind === 'harbour').length;
  if (harbourCount > params.harbourDaysMax) {
    violations.push({
      kind: 'incomplete',
      day: null,
      text: `${harbourCount} Hafentage im Plan — mehr als die Notgrenze von ${params.harbourDaysMax} (Ziel: ${params.harbourDays})`,
    });
  }

  // (2) arrival at the base by the one deadline.
  const lastDay = Math.max(...plan.days.map((d) => d.day));
  const endIsland = (() => {
    const entry = planDay(plan, lastDay);
    if (!entry) return null;
    return entry.kind === 'stage' ? entry.toIslandId : entry.islandId;
  })();
  if (endIsland !== params.baseIslandId) {
    violations.push({
      kind: 'deadline',
      day: lastDay,
      text: `Plan endet nicht an der Basis (${params.baseIslandId}), sondern bei ${endIsland ?? 'unbekannt'}`,
    });
  } else if (lastDay > frame.deadlineDay) {
    violations.push({
      kind: 'deadline',
      day: lastDay,
      text: `Ankunft an Törntag ${lastDay} liegt nach dem Stichtag (Tag ${frame.deadlineDay})`,
    });
  }

  // (2') the return must stay sailable under the worst case — checked from
  // EVERY day of the plan, not just the deepest point south. A mid-trip day
  // can be the one that traps the boat, and an island with no return chain at
  // all must be reported rather than skipped.
  // Two tiers, because they carry different weight (FR19): what the FORECAST
  // already rules out is a hard violation, while what only the worst-case
  // assumption rules out is a caveat. Treating the assumption as hard would
  // paint every trip red — at 30 kn from the north no northward return is
  // sailable, so nothing but Alimos itself would ever be "Meltemi-safe", and
  // the app would cry wolf instead of planning conservatively.
  for (const stage of stagesOf(plan)) {
    if (stage.day >= frame.deadlineDay) continue;
    if (stage.toIslandId === params.baseIslandId) continue;
    const byForecast: Feasibility = returnFeasibleStarting(
      stage.toIslandId,
      stage.day + 1,
      snapshot,
      'forecast',
    );
    if (byForecast === 'infeasible') {
      violations.push({
        kind: 'return',
        day: stage.day,
        text: `Von ${stage.toIslandId} (Tag ${stage.day}) ist die Rückkehr schon nach dem aktuellen Forecast nicht mehr darstellbar`,
      });
      // One trapped day is enough to condemn the plan; no need to list all.
      break;
    }
    const byWorstCase: Feasibility = returnFeasibleStarting(
      stage.toIslandId,
      stage.day + 1,
      snapshot,
      'worstCase',
    );
    if (byWorstCase !== 'feasible' || byForecast === 'horizon') {
      // Conservative caveat: the return holds under the current forecast, but
      // not if the full Meltemi sets in beyond the horizon (FR19).
      horizonDependent = true;
    }
  }

  // (3) FR31 pickup — hard, never relaxed.
  //
  // A MISSING guestPickup field means "not reachable" (AD-4) — but the rule may
  // only bind while the data can actually carry it. Decisive is not whether ANY
  // island has ferry data, but whether any island the solver can REACH does:
  // during curation, newly researched islands may carry it while the ones the
  // routes run over do not. Binding the rule then makes the condition
  // permanently unsatisfiable, and the app answers "stay in port for twelve
  // days" to a perfectly good forecast.
  const reachableIslands = new Set<string>();
  for (const leg of legs.values()) {
    reachableIslands.add(leg.fromIslandId);
    reachableIslands.add(leg.toIslandId);
  }
  const ferryDataCurated = library.islands.some(
    (i) => reachableIslands.has(i.id) && i.guestPickup !== undefined,
  );
  const pickupDay = tripDayForDate(params.tripStartDate, params.pickupDate);
  const pickupEntry = planDay(plan, pickupDay);
  if (!ferryDataCurated) {
    horizonDependent = true;
  } else if (pickupEntry) {
    const islandId =
      pickupEntry.kind === 'stage' ? pickupEntry.toIslandId : pickupEntry.islandId;
    const island = library.islands.find((i) => i.id === islandId);
    // A missing guestPickup field counts as NOT reachable (AD-4) — the
    // condition is safety-relevant, so silence must not read as consent.
    if (!island?.guestPickup?.ferryReachable) {
      violations.push({
        kind: 'pickup',
        day: pickupDay,
        text: `Am Gäste-Zustiegstag (Törntag ${pickupDay}) ist ${islandId} nicht per Fähre erreichbar (FR31)`,
      });
    } else if (pickupEntry.kind === 'stage') {
      // Arriving that same day is allowed only before the ferry cut-off.
      let arrival = params.departureHourAthens;
      let arrivalKnown = true;
      for (const legId of pickupEntry.legIds) {
        const leg = legs.get(legId);
        const a = leg ? assessLeg(leg, pickupDay, snapshot) : null;
        // An unassessable leg (beyond the horizon, or a dead reference) must
        // not be silently counted as zero hours — that would let the arrival
        // stay at the departure time and pass the cut-off unchecked, turning
        // an unknown into a "valid" hard condition.
        if (!a || a.totalHours === null) {
          arrivalKnown = false;
          horizonDependent = true;
          break;
        }
        arrival += a.totalHours;
      }
      if (arrivalKnown && arrival > params.pickupLatestArrivalHourAthens) {
        violations.push({
          kind: 'pickup',
          day: pickupDay,
          text: `Ankunft am Zustiegstag erst um ${arrival.toFixed(1)} Uhr — nach der Fähren-Grenze (${params.pickupLatestArrivalHourAthens} Uhr)`,
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    horizonDependent,
    violations,
    safetyViolations: violations.filter(isSafetyViolation),
  };
}

// ---------------------------------------------------------------------------
// completePlan
// ---------------------------------------------------------------------------

export interface SolveResult {
  plan: Plan;
  validity: PlanValidity;
  /** Which relaxation level produced this plan ('none' = nothing relaxed). */
  relaxedTo: RelaxationLevel;
  /** The variant the outbound part follows, for display and diversity. */
  variantId: string;
  turnIslandId: string;
}

/** A pin the skipper has set: this day is fixed (AD-12). */
export interface Pin {
  day: number;
  /** Island the skipper wants that day to end at; null = harbour day. */
  toIslandId: string | null;
  toPlaceId?: string;
}

/**
 * The hard per-day requirements handed INTO the packer: skipper pins plus the
 * FR31 pickup. Passing them as constraints (rather than filtering afterwards)
 * is what lets the solver actively FIND plans that satisfy them.
 */
function dayConstraintFor(
  snapshot: PlanningSnapshot,
  pins: Pin[],
): (day: number, endIslandId: string) => boolean {
  const { params, library } = snapshot;
  const pickupDay = tripDayForDate(params.tripStartDate, params.pickupDate);
  const pinByDay = new Map(pins.map((p) => [p.day, p]));
  // Only constrain the pickup day while a REACHABLE island carries ferry data —
  // otherwise the search would have no attainable target at all (see
  // validatePlan for the full reasoning).
  const reachable = new Set<string>();
  for (const route of library.routes) {
    for (const leg of route.legs) {
      reachable.add(leg.fromIslandId);
      reachable.add(leg.toIslandId);
    }
  }
  const ferryDataCurated = library.islands.some(
    (i) => reachable.has(i.id) && i.guestPickup !== undefined,
  );

  return (day, endIslandId) => {
    const pin = pinByDay.get(day);
    // A harbour-day pin (toIslandId === null) fixes the island only
    // implicitly — the packer decides whether the day carries a leg.
    if (pin?.toIslandId && pin.toIslandId !== endIslandId) return false;
    if (ferryDataCurated && day === pickupDay) {
      const island = library.islands.find((i) => i.id === endIslandId);
      // Missing data counts as NOT reachable (AD-4) — never silent optimism.
      if (!island?.guestPickup?.ferryReachable) return false;
    }
    return true;
  };
}

function candidateHonoursPins(
  days: PlanDay[],
  pins: Pin[],
): boolean {
  for (const pin of pins) {
    const entry = days.find((d) => d.day === pin.day);
    if (!entry) return false;
    if (pin.toIslandId === null) {
      if (entry.kind !== 'harbour') return false;
    } else {
      const island = entry.kind === 'stage' ? entry.toIslandId : entry.islandId;
      if (island !== pin.toIslandId) return false;
    }
  }
  return true;
}

/** Re-stamp pinned days as skipper-owned and carry their place choice over. */
function applyPins(days: PlanDay[], pins: Pin[]): PlanDay[] {
  return days.map((d) => {
    const pin = pins.find((p) => p.day === d.day);
    if (!pin) return d;
    if (d.kind === 'stage') {
      return { ...d, source: 'skipper' as const, toPlaceId: pin.toPlaceId ?? d.toPlaceId };
    }
    return { ...d, source: 'skipper' as const, placeId: pin.toPlaceId ?? d.placeId };
  });
}

/**
 * Build a complete round trip from the current position, honouring pins.
 *
 * Returns the best VALID plan when one exists. Otherwise it relaxes in the
 * fixed order and, if even that fails, returns the LEAST VIOLATING plan with
 * its violations named — the app must never fall silent in the Meltemi moment
 * (FR18), which is precisely when the skipper needs it.
 */
export function completePlan(
  snapshot: PlanningSnapshot,
  startIslandId: string,
  pins: Pin[] = [],
): SolveResult | null {
  const frame = deadlineFrame(snapshot.params);
  const startDay = snapshot.trip.currentDay;
  // Past days are already fixed (AD-12) and are carried over from the existing
  // plan, so the trip keeps its history: without them the FR2 numbering would
  // restart at 1 every morning and a spent harbour day would be forgotten.
  const pastDays: PlanDay[] = (snapshot.trip.plan?.days ?? [])
    .filter((d) => d.day < startDay)
    .sort((a, b) => a.day - b.day);
  // A pin on a past day is not a constraint — it already happened. Keeping it
  // as one would disqualify every candidate the morning after it was set.
  const futurePins = pins.filter((p) => p.day >= startDay);

  // Nothing left to plan: the trip is over.
  if (startDay > frame.deadlineDay) {
    const plan: Plan = { schemaVersion: PLAN_SCHEMA_VERSION, days: pastDays };
    if (pastDays.length === 0) return null;
    return {
      plan,
      validity: validatePlan(plan, snapshot),
      relaxedTo: 'none',
      variantId: 'abgeschlossen',
      turnIslandId: startIslandId,
    };
  }

  const candidates = buildCandidates(snapshot, startIslandId);
  if (candidates.length === 0) return null;
  const constraint = dayConstraintFor(snapshot, futurePins);

  const score = (r: SolveResult): number => {
    // Validity before preference (AD-13), and safety before structure: a plan
    // that is unsafe or misses a commitment loses hardest. Sailing more stages
    // is the soft southern-reach preference — it also makes "stay in port"
    // rank last, so that answer only surfaces when nothing else works.
    const stages = stagesOf(r.plan).length;
    return (
      (r.validity.valid ? 10_000 : 0) -
      r.validity.safetyViolations.length * 1_000 -
      r.validity.violations.length * 50 +
      stages
    );
  };

  let leastViolating: SolveResult | null = null;

  for (const level of RELAXATION_ORDER) {
    const relaxed: PlanningSnapshot = {
      ...snapshot,
      params: relaxParams(snapshot.params, level),
    };
    let bestThisLevel: SolveResult | null = null;

    for (const candidate of candidates) {
      // Idle days needed to span the frame with THIS candidate's legs. The
      // target is params.harbourDays, but capping the packer there would make
      // a plan unbuildable whenever the library holds fewer legs than the trip
      // has days — the packer could not even reach the pickup day. Exceeding
      // the target is reported as a structural violation instead (validatePlan).
      const daysAvailable = frame.deadlineDay - startDay + 1;
      const maxWaitDays = Math.max(
        snapshot.params.harbourDaysMax,
        daysAvailable - candidate.legs.length,
      );
      const packing = packLegs(candidate.legs, startDay, frame.deadlineDay, relaxed, {
        maxWaitDays,
        startIslandId,
        dayConstraint: constraint,
      });
      if (packing.packed.length === 0 && candidate.legs.length > 0) continue;

      const future = applyPins(
        planFromPacking(packing.packed, startDay, frame.deadlineDay, startIslandId),
        futurePins,
      );
      if (!candidateHonoursPins(future, futurePins)) continue;
      const days = [...pastDays, ...future];

      const plan: Plan = { schemaVersion: PLAN_SCHEMA_VERSION, days };
      // Validity is always judged against the ORIGINAL params — relaxation
      // may guide the search, never redefine what counts as valid.
      const validity = validatePlan(plan, snapshot);
      const result: SolveResult = {
        plan,
        validity,
        relaxedTo: level,
        variantId: candidate.variantId,
        turnIslandId: candidate.turnIslandId,
      };
      if (!bestThisLevel || score(result) > score(bestThisLevel)) bestThisLevel = result;
      if (!leastViolating || score(result) > score(leastViolating)) leastViolating = result;
    }

    if (bestThisLevel?.validity.valid) return bestThisLevel;
  }

  return leastViolating;
}

/**
 * FR2 existence predicate (gelb vs. rot), normative per AD-13: does ANY valid
 * plan exist in the full search space, with past days fixed but active pins
 * NOT binding? Pins are excluded on purpose — the way to cash in a yellow is
 * the check-in, and check-in releases pins. Anything the skipper can reach in
 * one action must count as reachable.
 */
export function existsValidPlan(
  snapshot: PlanningSnapshot,
  startIslandId: string,
): SolveResult | null {
  const result = completePlan(snapshot, startIslandId, []);
  if (!result) return null;
  // "A valid round trip exists" means: safe, on time, commitments kept — AND
  // it actually sails. Structural shortfalls (extra harbour days, e.g. because
  // the library holds fewer legs than the trip has days) must not turn the
  // light red; but "stay in port for twelve days" is not a round trip either,
  // so it cannot serve as the witness that keeps the light yellow.
  const sails = stagesOf(result.plan).length > 0;
  return sails && result.validity.safetyViolations.length === 0 ? result : null;
}

/**
 * FR29 alternatives: at most `params.alternativesMax`, diversified by turning
 * point and variant, always including the existence witness so a yellow
 * rest-trip light is guaranteed to be cashable (AD-13 invariant).
 */
export function planKey(plan: Plan): string {
  return plan.days
    .slice()
    .sort((a, b) => a.day - b.day)
    .map((d) => `${d.day}:${d.kind === 'stage' ? d.toIslandId : `~${d.islandId}`}`)
    .join('|');
}

export function deriveAlternatives(
  snapshot: PlanningSnapshot,
  startIslandId: string,
  witness: SolveResult | null,
  /** The current main route — an "alternative" identical to it is none.
   *  Compared by CONTENT: comparing by variant id would drop the existence
   *  witness whenever it happens to share a variant with the main route,
   *  which is exactly what made a yellow light uncashable. */
  mainPlan?: Plan,
): SolveResult[] {
  const frame = deadlineFrame(snapshot.params);
  const startDay = snapshot.trip.currentDay;
  const out: SolveResult[] = [];
  const seen = new Set<string>();
  if (mainPlan) seen.add(planKey(mainPlan));

  // The witness comes first and is never dropped for cosmetic reasons: the
  // AD-13 invariant is that a yellow rest-trip light is always cashable.
  if (witness && !seen.has(planKey(witness.plan))) {
    out.push(witness);
    seen.add(planKey(witness.plan));
  }

  const constraint = dayConstraintFor(snapshot, []);
  for (const candidate of buildCandidates(snapshot, startIslandId)) {
    if (out.length >= snapshot.params.alternativesMax) break;
    const daysAvailable = frame.deadlineDay - startDay + 1;
    const packing = packLegs(candidate.legs, startDay, frame.deadlineDay, snapshot, {
      maxWaitDays: Math.max(
        snapshot.params.harbourDaysMax,
        daysAvailable - candidate.legs.length,
      ),
      startIslandId,
      dayConstraint: constraint,
    });
    const pastDays: PlanDay[] = (snapshot.trip.plan?.days ?? []).filter(
      (d) => d.day < startDay,
    );
    const plan: Plan = {
      schemaVersion: PLAN_SCHEMA_VERSION,
      days: [
        ...pastDays,
        ...planFromPacking(packing.packed, startDay, frame.deadlineDay, startIslandId),
      ],
    };
    const key = planKey(plan);
    if (seen.has(key)) continue;
    const validity = validatePlan(plan, snapshot);
    // Only offer alternatives that are actually safe and on time; structural
    // shortfalls (extra harbour days) are tolerable in an alternative.
    if (validity.safetyViolations.length > 0) continue;
    seen.add(key);
    out.push({
      plan,
      validity,
      relaxedTo: 'none',
      variantId: candidate.variantId,
      turnIslandId: candidate.turnIslandId,
    });
  }

  // Conservative first, so the escalation ladder reads naturally (FR9).
  return out.sort((a, b) => a.turnIslandId.localeCompare(b.turnIslandId));
}

/** Stages of a plan that could not be assessed — for display (AD-12). */
export function unassessableStages(plan: Plan, snapshot: PlanningSnapshot): Stage[] {
  const legs = legLibrary(snapshot);
  return stagesOf(plan).filter((s) => s.legIds.some((id) => !legs.has(id)));
}
