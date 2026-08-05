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
 *   (1) every stage holds the FR16 thresholds. Stages beyond the reliable
 *       horizon are computed on the persistence assumption: they DO count,
 *       but their violations are flagged `assumed` and thus never safety-
 *       relevant — they block green without being able to force red (FR18)
 *   (2) arrival at the base by the ONE deadline constant
 *  (2') the return is sailable under the Meltemi worst case (shared with PoR)
 *   (3) a ferry-reachable pickup harbour is reached on the pickup date (FR31)
 *
 * Relaxation is an OUTER loop over the same DP with loosened params, never a
 * special path inside it — which is what structurally guarantees that the
 * 65°/25 kn threshold and the pickup condition can never be relaxed away.
 */

import type { Leg, Variant } from './schema/route.ts';
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
  RELAXATION_ORDER,
  isSafetyViolation,
  planDay,
  stagesOf,
} from './schema/plan.ts';
import type { RelaxationLevel } from './schema/plan.ts';
import { assessLeg, stopHoursForDay } from './scoring.ts';
import {
  packLegs,
  remainingReturnLegs,
  returnFeasibleStarting,
  routeIslandSequence,
  type Feasibility,
  type PackedLeg,
} from './ppr.ts';
import { legIndexWithReverses, legsOfVariant } from './legs.ts';
import { deadlineFrame, tripDayForDate } from './time.ts';
import { distanceNm, isClockwise } from './geo.ts';
import type { Coordinates } from './schema/common.ts';

// ---------------------------------------------------------------------------
// Relaxation
// ---------------------------------------------------------------------------

/**
 * Fixed relaxation order (AD-13). `upwind` and `pickup` are deliberately
 * ABSENT — they are never relaxed, and leaving them out of this list is the
 * structural guarantee, not a runtime check that could be forgotten.
 */
export { RELAXATION_ORDER, type RelaxationLevel } from './schema/plan.ts';

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
    case 'doppelschlag':
      // Zwei Verbindungen an einem Tag. Standard ist EINE (params.maxLegsPerDay
      // = 1: ein Tag, eine Insel-zu-Insel-Verbindung) — der Zwischenstopp ist
      // eine Nachgabe, kein Normalfall, und steht deshalb hier in der Leiter.
      //
      // Nach 'hardMax', weil ein längerer einzelner Schlag der Vorgabe näher
      // bleibt als ein zerlegter Tag; vor 'nightLeg', weil zwei Tagschläge
      // milder sind als eine Nacht unterwegs. Die Summe beider Etappen bleibt
      // dabei im Hartmaximum — das prüft der Packer selbst.
      return {
        ...params,
        targetDayHours: params.maxSailHours + params.maxMotorHours,
        targetMotorHours: params.maxMotorHours,
        maxLegsPerDay: 2,
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
        // Jede Stufe muss alles zulassen, was die vorige zuliess — sonst
        // NÄHME die letzte Stufe eine Freiheit zurück und könnte weniger
        // lösen als die davor.
        maxLegsPerDay: 2,
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
  return legIndexWithReverses(snapshot.library);
}

/** Outbound variants (everything that is not the fallback chain), conservative first. */
function outboundVariants(snapshot: PlanningSnapshot): Variant[] {
  return [...snapshot.library.variants]
    .filter((v) => !v.isReturnChain)
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
/**
 * Der Wendepunkt eines Kandidaten ist seine FERNSTE Insel — nicht die letzte.
 *
 * Ein kuratierter Rundkurs endet wieder an der Basis. Seine letzte Insel als
 * Wendepunkt zu lesen ergab Reichweite 0, und weil die Reichweite in
 * `preferred` gleich nach der Gültigkeit kommt, verlor die ganze Runde gegen
 * jedes Hin-und-zurück. Genau deshalb kam nie eine Runde heraus, sondern immer
 * dieselbe Strecke vor und zurück — obwohl die Bibliothek zwei fertige
 * Rundkurse enthält, die jede Insel genau einmal anlaufen.
 */
function makeCandidate(
  variant: Variant,
  legs: Leg[],
  snapshot: PlanningSnapshot,
): Candidate {
  const base = snapshot.library.islands.find(
    (i) => i.id === snapshot.params.baseIslandId,
  );
  const reachOf = (islandId: string): number => {
    const island = snapshot.library.islands.find((i) => i.id === islandId);
    return base && island ? distanceNm(base.coordinates, island.coordinates) : 0;
  };
  const seq = routeIslandSequence(legs);
  const turnIslandId =
    seq.length > 0
      ? seq.reduce((far, id) => (reachOf(id) > reachOf(far) ? id : far), seq[0]!)
      : snapshot.params.baseIslandId;
  return {
    variantId: variant.id,
    escalationRank: variant.escalationRank,
    turnIslandId,
    legs,
  };
}

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
    const vLegs = legsOfVariant(variant, snapshot.library);
    const seq = routeIslandSequence(vLegs);
    const startIdx = seq.indexOf(startIslandId);
    if (startIdx < 0) continue;
    for (let turnIdx = startIdx; turnIdx < seq.length; turnIdx++) {
      const outbound = vLegs.slice(startIdx, turnIdx);
      const ret = remainingReturnLegs(seq[turnIdx]!, snapshot);
      if (!ret) continue;
      push(makeCandidate(variant, [...outbound, ...ret], snapshot));
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
 *
 * `opts.sailedLegsByDay` übergibt die gesegelte Kette (legGeometry.ts): dieselben
 * Etappen, aber verankert an den Plätzen der Kette und mit landfreiem Kurs. Die
 * Bewertung übergibt sie, damit Gültigkeit und Anzeige dasselbe prüfen. Die
 * SUCHE (packLegs, Kandidaten) rechnet weiter mit den kuratierten Etappen: dort
 * steht der Liegeplatz jedes Tages noch nicht fest, und ein Suchraum, der von
 * der Platzwahl abhängt, wäre nicht mehr deterministisch. Was die Suche
 * vorschlägt, prüft die Bewertung anschliessend gegen den wirklichen Kurs.
 */
export function validatePlan(
  plan: Plan,
  snapshot: PlanningSnapshot,
  opts: { sailedLegsByDay?: Map<number, (Leg | undefined)[]> } = {},
): PlanValidity {
  const { params, library } = snapshot;
  const legs = legLibrary(snapshot);
  const frame = deadlineFrame(params);
  const violations: Violation[] = [];
  let horizonDependent = false;

  /** Die Etappe des Tages, wie sie gesegelt wird — sonst die kuratierte. */
  const legOfStage = (day: number, index: number, legId: string): Leg | undefined =>
    opts.sailedLegsByDay?.get(day)?.[index] ?? legs.get(legId);

  // (1) every stage inside the reliable horizon holds the FR16 thresholds.
  for (const stage of stagesOf(plan)) {
    let offset = 0;
    const stopHours = stopHoursForDay(snapshot, stage.day);
    for (const [legIdx, legId] of stage.legIds.entries()) {
      const leg = legOfStage(stage.day, legIdx, legId);
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
      // Liegezeit des Zwischenstopps schiebt die Folge-Etappe (AD-3).
      offset += (a.totalHours ?? 0) + stopHours;
      if (a.ampel === 'unbewertet') {
        horizonDependent = true;
        continue;
      }
      /**
       * AD-13 REVISED — the far range is now COMPUTED under the persistence
       * assumption instead of being left 'unbewertet' (scoring.ts). The plan
       * therefore gets a real ampel out there, and this flag can no longer be
       * driven by 'unbewertet' alone.
       *
       * It MUST still be raised, because it is what keeps green out of reach:
       * a plan whose later stages rest on extrapolation is not a plan the app
       * may call safe. Unlike 'unbewertet' the day is NOT skipped — its
       * violations count, so an assumed stage that busts a budget or the
       * upwind rule still shows up as a violation rather than vanishing.
       */
      if (a.basis === 'annahme') horizonDependent = true;
      if (a.ampel === 'rot') {
        const upwind = a.reasons.some((r) => r.includes('Aufkreuzen'));
        violations.push({
          kind: upwind ? 'upwind' : 'budget',
          day: stage.day,
          text: `Tag ${stage.day}: ${a.reasons.join('; ')}`,
          assumed: a.basis === 'annahme',
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

  // (1c) FR16 night-leg quota. The params existed but nothing enforced them:
  // at most `nightLegMaxPerTrip` night legs, none before `nightLegEarliestDay`
  // (second week), and each one only in light wind — the family sleeps through
  // it, so it is admissible only when the sea is smooth.
  const nightStages = stagesOf(plan).filter((s) =>
    s.legIds.some((legId, legIdx) => {
      const leg = legOfStage(s.day, legIdx, legId);
      if (!leg) return false;
      return assessLeg(leg, s.day, snapshot).nightLeg === true;
    }),
  );
  if (nightStages.length > params.nightLegMaxPerTrip) {
    violations.push({
      kind: 'budget',
      day: nightStages[params.nightLegMaxPerTrip]?.day ?? null,
      text: `${nightStages.length} Nachtetappen — erlaubt sind ${params.nightLegMaxPerTrip} pro Törn (FR16)`,
    });
  }
  for (const s of nightStages) {
    if (s.day < params.nightLegEarliestDay) {
      violations.push({
        kind: 'budget',
        day: s.day,
        text: `Nachtetappe an Tag ${s.day} — erst ab Tag ${params.nightLegEarliestDay} zulässig (FR16: zweite Woche)`,
      });
    }
    for (const [legIdx, legId] of s.legIds.entries()) {
      const leg = legOfStage(s.day, legIdx, legId);
      if (!leg) continue;
      const a = assessLeg(leg, s.day, snapshot);
      if (a.nightLeg !== true || a.avgTwsKn === null) continue;
      if (a.avgTwsKn > params.nightLegMaxTwsKn) {
        violations.push({
          kind: 'budget',
          day: s.day,
          text: `Nachtetappe an Tag ${s.day} bei ${Math.round(a.avgTwsKn)} kn — nur unter ${params.nightLegMaxTwsKn} kn zulässig (FR16)`,
        });
      }
    }
  }

  // (1d) A chosen berth must lie on the island of its day. Otherwise the place
  // ampel shown for that night comes from a different island — a wrong shelter
  // verdict, which is the one class of error NFR6 rules out.
  for (const entry of plan.days) {
    const placeId = entry.kind === 'stage' ? entry.toPlaceId : entry.placeId;
    if (!placeId) continue;
    const place = library.places.find((p) => p.id === placeId);
    const islandId = entry.kind === 'stage' ? entry.toIslandId : entry.islandId;
    if (place && place.islandId !== islandId) {
      violations.push({
        kind: 'incomplete',
        day: entry.day,
        text: `Tag ${entry.day}: Platz ${place.name} liegt auf ${place.islandId}, nicht auf ${islandId}`,
      });
    }
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
  } else {
    // The deadline is a TIME, not just a day (AD-9): the charter is handed back
    // at returnDeadlineHourAthens. Checking the day alone would pass an arrival
    // at 23:00 on the return date as punctual.
    const arrivingStage = stagesOf(plan)
      .filter((s) => s.toIslandId === params.baseIslandId)
      .pop();
    if (arrivingStage && arrivingStage.day === frame.deadlineDay) {
      let arrival: number | null = null;
      let arrivalAssumed = false;
      let offset = 0;
      const arrivalStopHours = stopHoursForDay(snapshot, arrivingStage.day);
      for (const [legIdx, legId] of arrivingStage.legIds.entries()) {
        const leg = legOfStage(arrivingStage.day, legIdx, legId);
        if (!leg) {
          arrival = null;
          break;
        }
        const a = assessLeg(leg, arrivingStage.day, snapshot, {
          departureOffsetHours: offset || undefined,
        });
        if (a.arrivalHourAthens === null) {
          // Unknown duration must not silently pass the deadline (nor fail it).
          arrival = null;
          horizonDependent = true;
          break;
        }
        if (a.basis === 'annahme') arrivalAssumed = true;
        offset += (a.totalHours ?? 0) + arrivalStopHours;
        arrival = a.arrivalHourAthens;
      }
      if (arrival !== null && arrival > params.returnDeadlineHourAthens) {
        violations.push({
          kind: 'deadline',
          day: arrivingStage.day,
          text: `Ankunft an der Basis erst um ${arrival.toFixed(1)} Uhr — die Rückgabe ist um ${params.returnDeadlineHourAthens}:00 (Athen)`,
          assumed: arrivalAssumed,
        });
      }
    }
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
  //
  // WELCHER STICHTAG (korrigiert): Der harte Teil rechnet gegen den echten
  // Rückgabetermin, der weiche weiterhin gegen den PoR-Tag inklusive
  // Puffertag. Vorher galt für beide der Puffertag — und weil Bedingung (2)
  // eine Ankunft AM Stichtag ausdrücklich erlaubt, verlangte (2') vom
  // Notausstieg damit einen ganzen Tag mehr Reserve als vom Plan selbst. Jeder
  // Törn, der den Rahmen ausnutzt, war dadurch ungültig; besonders traf es
  // Rundkurse, deren Notausstieg über die Rückfallkette naturgemäss weiter ist
  // als die Fortsetzung der Runde. Die Aussage "der Puffertag wäre aufgebraucht"
  // bleibt erhalten — sie ist jetzt ein Vorbehalt und kein Urteil.
  for (const stage of stagesOf(plan)) {
    if (stage.day >= frame.deadlineDay) continue;
    if (stage.toIslandId === params.baseIslandId) continue;
    const byForecast: Feasibility = returnFeasibleStarting(
      stage.toIslandId,
      stage.day + 1,
      snapshot,
      'forecast',
      frame.deadlineDay,
    );
    if (byForecast === 'infeasible') {
      violations.push({
        kind: 'return',
        day: stage.day,
        text: `Von ${stage.toIslandId} (Tag ${stage.day}) ist die Rückkehr schon nach dem aktuellen Forecast nicht mehr darstellbar`,
        // The return starts the day after this stage; if THAT lies beyond the
        // reliable horizon, the verdict rests on the assumption, not on data.
        assumed:
          stage.day + 1 - snapshot.trip.currentDay > params.reliableHorizonDays,
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
    // Der weiche Teil misst weiter am Puffertag: "der Notausstieg ginge nur
    // noch ohne Reserve" ist genau die Art Vorbehalt, die ein Grün verhindern
    // soll, ohne den Plan zu verwerfen.
    const withBuffer: Feasibility = returnFeasibleStarting(
      stage.toIslandId,
      stage.day + 1,
      snapshot,
      'forecast',
    );
    if (byWorstCase !== 'feasible' || byForecast === 'horizon' || withBuffer !== 'feasible') {
      // Conservative caveat: the return holds under the current forecast, but
      // not if the full Meltemi sets in beyond the horizon (FR19), or only by
      // spending the buffer day.
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
  } else if (!pickupEntry) {
    // The pickup day is not covered by the plan at all — e.g. it lies before
    // today or past the deadline. A hard condition that cannot be evaluated
    // must say so; without this branch the guests were silently forgotten.
    if (pickupDay >= snapshot.trip.currentDay && pickupDay <= frame.deadlineDay) {
      violations.push({
        kind: 'pickup',
        day: pickupDay,
        text: `Der Gäste-Zustiegstag (Törntag ${pickupDay}) fehlt im Plan`,
      });
    }
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
      let pickupAssumed = false;
      for (const [legIdx, legId] of pickupEntry.legIds.entries()) {
        const leg = legOfStage(pickupDay, legIdx, legId);
        const a = leg ? assessLeg(leg, pickupDay, snapshot) : null;
        if (a?.basis === 'annahme') pickupAssumed = true;
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
          assumed: pickupAssumed,
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

/**
 * Reichweite eines Round-Trips: die Distanz von der Basis zum Wendepunkt.
 *
 * Das IST die Törnfrage — "wie weit kommen wir?" (AD-13). Die alte Kennzahl
 * war die Zahl der Etappen, und das ist etwas anderes: ein Plan, der zwölf Tage
 * lang zwischen Paros und Naxos pendelt, hat genauso viele Etappen wie einer,
 * der bis Santorin durchzieht, und gewann sogar, weil er leichter gültig wird.
 * Genau das Bild bekam der Skipper: kurze Schläge, das Tagesbudget zu zwei
 * Dritteln ungenutzt, und die Wende weit nördlich vom eigentlichen Ziel.
 *
 * Gemessen wird zur Insel, nicht über die gefahrene Strecke: die Umwege des
 * Rückwegs sollen die Ambition nicht aufblähen.
 */
export function reachNmFor(snapshot: PlanningSnapshot): (islandId: string) => number {
  const base = snapshot.library.islands.find(
    (i) => i.id === snapshot.params.baseIslandId,
  );
  if (!base) return () => 0;
  return (islandId: string) => {
    const island = snapshot.library.islands.find((i) => i.id === islandId);
    return island ? distanceNm(base.coordinates, island.coordinates) : 0;
  };
}

/**
 * Die Kennzahlen, nach denen ein Round-Trip beurteilt wird.
 *
 * `reach` allein hat einen Törn beschrieben, der so weit wie möglich fährt —
 * aber nichts darüber gesagt, WIE er das tut. Herausgekommen ist deshalb immer
 * dieselbe Strecke hin und zurück: sie erreicht denselben Wendepunkt wie eine
 * Runde und ist leichter gültig. Das ist keine Törnplanung, das ist Pendeln.
 */
export interface PlanMetrics {
  /** Entfernung Basis → fernster Punkt. */
  reachNm: number;
  /** Zahl der VERSCHIEDENEN Inseln, die angelaufen werden. */
  distinctIslands: number;
  /** Läuft die Runde im Uhrzeigersinn? */
  clockwise: boolean;
  turnDay: number;
  harbourDays: number;
  stages: number;
}

export function planMetricsFor(
  snapshot: PlanningSnapshot,
): (r: SolveResult) => PlanMetrics {
  const reach = reachNmFor(snapshot);
  const coordsOf = (islandId: string): Coordinates | null =>
    snapshot.library.islands.find((i) => i.id === islandId)?.coordinates ?? null;

  return (r) => {
    const stages = stagesOf(r.plan);
    const islands = stages.map((s) => s.toIslandId);
    // Der geschlossene Kurs für den Umlaufsinn: Basis, dann die Tagesziele.
    // Endet der Plan ohnehin an der Basis, schliesst signedAreaDeg2 den Ring
    // selbst — der doppelte Punkt am Ende stört die Formel nicht.
    const ring = [snapshot.params.baseIslandId, ...islands]
      .map(coordsOf)
      .filter((c): c is Coordinates => c !== null);
    return {
      reachNm: reach(r.turnIslandId),
      distinctIslands: new Set(islands).size,
      clockwise: isClockwise(ring),
      turnDay: turnDayOf(r),
      harbourDays: r.plan.days.filter((d) => d.kind === 'harbour').length,
      stages: stages.length,
    };
  };
}

/**
 * Tag, an dem der Plan den Wendepunkt erreicht — die Trennlinie zwischen Hin-
 * und Rückweg. Ohne Wende-Etappe (Plan bleibt an der Basis) zählt der letzte
 * Tag, damit "gar nicht losfahren" nicht als früheste Wende gewinnt.
 */
function turnDayOf(r: SolveResult): number {
  const stages = stagesOf(r.plan);
  const turn = stages.find((s) => s.toIslandId === r.turnIslandId);
  if (turn) return turn.day;
  return Math.max(0, ...r.plan.days.map((d) => d.day));
}

const RELAXATION_STEP: Record<RelaxationLevel, number> = {
  none: 0,
  hardMax: 1,
  doppelschlag: 2,
  nightLeg: 3,
};

/**
 * Welcher von zwei Plänen der bessere ist — lexikografisch, nicht als
 * gewichtete Summe.
 *
 * Die Reihenfolge IST die Entscheidung, und sie soll ablesbar sein statt aus
 * Gewichten hervorzugehen, die sich gegenseitig aufheben können:
 *
 *   1. gültig vor ungültig, und unter den ungültigen zuerst weniger
 *      Sicherheitsverletzungen, dann weniger Verletzungen überhaupt. Die App
 *      muss auch im Meltemi antworten (FR18) — aber nie mit etwas Unsicherem.
 *   2. WEITER vor näher. Das ist die Törnfrage.
 *   3. Erst danach die Bequemlichkeit: weniger Nachgeben auf der
 *      Eskalationsleiter. Ein Doppelschlag, der Santorin erreichbar macht, ist
 *      also willkommen; einer, der nichts einbringt, wird nicht genommen.
 *   4. Weniger Hafentage — ein Törn, der am Ende vier Tage im Hafen liegt, hat
 *      seine Zeit nicht genutzt.
 *   5. Mehr Etappen, damit "einfach liegen bleiben" zuletzt kommt.
 *   6. Zum Schluss die Variante alphabetisch: gleiche Lage, gleiche Antwort.
 */
export function preferred(
  a: SolveResult | null,
  b: SolveResult,
  metrics: (r: SolveResult) => PlanMetrics,
): SolveResult {
  if (!a) return b;
  const ma = metrics(a);
  const mb = metrics(b);
  const cmp: [number, number][] = [
    [a.validity.valid ? 1 : 0, b.validity.valid ? 1 : 0],
    [-a.validity.safetyViolations.length, -b.validity.safetyViolations.length],
    [-a.validity.violations.length, -b.validity.violations.length],
    // Wie weit kommen wir — die Törnfrage.
    [Math.round(ma.reachNm), Math.round(mb.reachNm)],
    // Im Uhrzeigersinn: mit dem Meltemi im Rücken nach Süden, an der Westseite
    // zurück. Die Empfehlung fürs Revier, nicht bloss Geschmack.
    [ma.clockwise ? 1 : 0, mb.clockwise ? 1 : 0],
    // So viele VERSCHIEDENE Inseln wie möglich. Ohne dieses Kriterium war ein
    // Törn, der zwölf Tage dieselbe Kette auf und ab fährt, genauso gut wie
    // eine Runde — er erreicht denselben Wendepunkt und ist leichter gültig.
    [ma.distinctIslands, mb.distinctIslands],
    [-RELAXATION_STEP[a.relaxedTo], -RELAXATION_STEP[b.relaxedTo]],
    // "So früh wie möglich nach Süden, um genug Zeit für zurück zu haben":
    // jeder Tag, den die Wende früher liegt, ist ein Tag Reserve auf dem
    // Heimweg — der Strecke, die halten muss, wenn der Meltemi einsetzt.
    [-ma.turnDay, -mb.turnDay],
    [-ma.harbourDays, -mb.harbourDays],
    [ma.stages, mb.stages],
  ];
  for (const [x, y] of cmp) if (x !== y) return x > y ? a : b;
  return a.variantId <= b.variantId ? a : b;
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
  for (const leg of library.legs) {
    reachable.add(leg.fromIslandId);
    reachable.add(leg.toIslandId);
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
  opts: {
    /**
     * Nur Kandidaten betrachten, die an DIESER Insel wenden.
     *
     * Damit beantwortet dieselbe Maschinerie auch "was kostet mich Santorin?"
     * (options.ts) — statt die Frage mit einer zweiten, leicht abweichenden
     * Rechnung zu beantworten, die dann anderes behaupten könnte als der Plan,
     * den der Skipper hinterher tatsächlich bekommt (AD-3).
     */
    turnIslandId?: string;
    /**
     * Bei der ERSTEN Stufe abbrechen, die etwas Gültiges liefert.
     *
     * Nur sinnvoll zusammen mit `turnIslandId`: dann ist die Reichweite über
     * alle Kandidaten konstant, und `preferred` entscheidet als Nächstes nach
     * der Eskalationsstufe — die mildeste gültige Stufe IST also das Optimum.
     * Der Abbruch ändert das Ergebnis nicht, er spart nur die restlichen
     * Stufen. Für die Hauptroute wäre er falsch: dort gewinnt Reichweite vor
     * Stufe, und ein früher Abbruch hat genau deshalb jahrelang den kürzeren
     * Törn geliefert.
     */
    stopAtFirstValid?: boolean;
  } = {},
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

  const candidates = buildCandidates(snapshot, startIslandId).filter(
    (c) => opts.turnIslandId === undefined || c.turnIslandId === opts.turnIslandId,
  );
  if (candidates.length === 0) return null;
  const constraint = dayConstraintFor(snapshot, futurePins);

  const metrics = planMetricsFor(snapshot);
  const reach = reachNmFor(snapshot);

  let best: SolveResult | null = null;

  /**
   * ALLE Stufen werden durchgerechnet, nicht nur bis die erste etwas Gültiges
   * liefert.
   *
   * Vorher brach die Schleife beim ersten gültigen Plan ab — und weil ein
   * kurzer Törn früher gültig wird als ein weiter, gewann systematisch der
   * kürzere. Die Leiter war damit keine Eskalation, sondern eine Bremse: dass
   * Santorin mit einem Doppelschlag erreichbar gewesen wäre, hat der Solver nie
   * geprüft, sobald Milos ohne einen auskam. Jetzt entscheidet der Vergleich
   * (`preferred`), und der stellt die Reichweite vor die Bequemlichkeit —
   * die Stufe zählt erst als Kriterium, wenn zwei Pläne gleich weit kommen.
   */
  for (const [levelIdx, level] of RELAXATION_ORDER.entries()) {
    const relaxed: PlanningSnapshot = {
      ...snapshot,
      params: relaxParams(snapshot.params, level),
    };

    for (const candidate of candidates) {
      /**
       * Beschneidung, die das Ergebnis nicht verändert: steht bereits ein
       * GÜLTIGER Plan, kann eine höhere Eskalationsstufe nur noch gewinnen,
       * wenn sie WEITER kommt. Bei gleicher Reichweite verliert sie an der
       * Stufe selbst, die in `preferred` vor Hafentagen und Etappenzahl steht.
       *
       * Ohne das kostete das Durchrechnen aller vier Stufen an der echten
       * Bibliothek ein Vielfaches — und zwar bei jeder Forecast-Aktualisierung,
       * auf dem Telefon.
       */
      if (
        levelIdx > 0 &&
        best?.validity.valid &&
        Math.round(reach(candidate.turnIslandId)) <=
          Math.round(reach(best.turnIslandId))
      ) {
        continue;
      }

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
      best = preferred(best, result, metrics);
    }

    if (opts.stopAtFirstValid && best?.validity.valid) break;
  }

  return best;
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
  // Collect ALL safe candidates first, then SPREAD the selection (AD-13: at
  // least one more conservative escalation step and — if open — a more
  // ambitious southern option). Taking the first N in candidate order would
  // only ever show the most conservative ones, hiding exactly the curated
  // round trips the skipper wants to weigh.
  const safe: SolveResult[] = [];
  for (const candidate of buildCandidates(snapshot, startIslandId)) {
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
    safe.push({
      plan,
      validity,
      relaxedTo: 'none',
      variantId: candidate.variantId,
      turnIslandId: candidate.turnIslandId,
    });
  }

  // Spread by reach: most ambitious, least ambitious, then fill from the middle.
  // Alternatives are only useful if they differ in how far south they go.
  const byReach = [...safe].sort(
    (a, b) => stagesOf(b.plan).length - stagesOf(a.plan).length,
  );
  const room = () => out.length < snapshot.params.alternativesMax;
  const take = (r: SolveResult | undefined) => {
    if (!r || !room()) return;
    const k = planKey(r.plan);
    if (seen.has(k) && out.some((o) => planKey(o.plan) === k)) return;
    out.push(r);
  };
  take(byReach[0]);
  take(byReach[byReach.length - 1]);
  for (let i = Math.floor(byReach.length / 2); i < byReach.length && room(); i++) {
    if (!out.includes(byReach[i]!)) take(byReach[i]);
  }

  // Conservative first, so the escalation ladder reads naturally (FR9).
  return out.sort((a, b) => stagesOf(a.plan).length - stagesOf(b.plan).length);
}

/** Stages of a plan that could not be assessed — for display (AD-12). */
export function unassessableStages(plan: Plan, snapshot: PlanningSnapshot): Stage[] {
  const legs = legLibrary(snapshot);
  return stagesOf(plan).filter((s) => s.legIds.some((id) => !legs.has(id)));
}
