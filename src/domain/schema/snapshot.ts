import type { Ampel } from './common.ts';
import type { Island } from './island.ts';
import type { InvalidPlace, Place } from './place.ts';
import type { Route } from './route.ts';
import type { Plan, PlanValidity } from './plan.ts';
import type { Polar } from './polar.ts';
import type { Params } from './params.ts';

/**
 * AD-3 — engine contract: one snapshot in, one assessment out.
 * The snapshot hour axis is normatively UTC; hours beyond the model horizon
 * (marine < weather!) are `null` and assessed as 'unbewertet'.
 */

/** Hourly forecast series for one location. Missing hours are null. */
export interface PointForecast {
  windKn: (number | null)[];
  windDirDeg: (number | null)[];
  waveM: (number | null)[];
  waveDirDeg: (number | null)[];
  wavePeriodS: (number | null)[];
}

/** Position with source precedence (AD-11): 'manual' wins until released. */
export interface TripPosition {
  source: 'gps' | 'manual';
  lat: number;
  lon: number;
  /** Set when the user picked a library place manually. */
  placeId?: string;
}

/** Trip context relevant for the engine — injected, never read from a clock (AD-2). */
export interface TripFrame {
  /** 1-based trip day (day 1 = tripStartDate). */
  currentDay: number;
  position: TripPosition | null;
  /**
   * The persisted main route (AD-12). Null before the first assessment, when
   * `ADOPT_INITIAL` adopts the solver's proposal exactly once. A recomputation
   * only ever RE-ASSESSES this plan — it never mutates it.
   */
  plan: Plan | null;
  /** Athens local departure hour override for today (FR15). */
  departureHourOverride: number | null;
}

export interface Library {
  islands: Island[];
  places: Place[];
  invalidPlaces: InvalidPlace[];
  routes: Route[];
}

export interface PlanningSnapshot {
  /** Retrieval timestamp (FR13) — injected by the adapter. */
  fetchedAtIso: string;
  /** Model run initialisation time, if the API exposes it. */
  modelRunIso: string | null;
  model: string;
  /** Normative UTC hour axis: ISO strings, hourly, ascending. */
  times: string[];
  /**
   * Forecast per location. Keys are normative (AD-3): place id for curated
   * places, `leg:<legId>:<n>` for leg waypoints.
   */
  forecast: Record<string, PointForecast>;
  library: Library;
  polar: Polar | null;
  /** Raw tuning parameters — applied only inside the core (AD-10). */
  params: Params;
  trip: TripFrame;
}

// ---------------------------------------------------------------------------
// Assessment (output)
// ---------------------------------------------------------------------------

export interface PlaceNightAssessment {
  placeId: string;
  nightDay: number;
  ampel: Ampel;
  /** Worst wind / wave observed inside the night window (for display). */
  maxWindKn: number | null;
  windDirDeg: number | null;
  maxWaveM: number | null;
  reasons: string[];
}

/**
 * FR30 — one simulated hour of a leg, so the day card can EXPLAIN how
 * "3,1 h for 17 nm" came about. Produced only by assessLeg (the single
 * calculation path, AD-3); views render it and never recompute.
 */
export interface LegHourBreakdown {
  /** UTC hour this step was simulated in. */
  timeIso: string;
  /** Course over the segment being sailed this hour. */
  courseDeg: number;
  twsKn: number;
  twaDeg: number;
  /** Boat speed used — from the polar (+offset) or the motor parameter. */
  speedKn: number;
  motoring: boolean;
  /** Nautical miles covered in this step (may be a partial hour at the end). */
  distanceNm: number;
  /** True when this hour used the Meltemi worst case instead of the forecast. */
  worstCase: boolean;
}

export interface LegAssessment {
  legId: string;
  day: number;
  ampel: Ampel;
  sailHours: number | null;
  motorHours: number | null;
  totalHours: number | null;
  /** Mean TWS / TWA over the simulated passage (display). */
  avgTwsKn: number | null;
  avgTwaDeg: number | null;
  upwind: boolean;
  reasons: string[];
  /**
   * FR16 night leg: departure before the night window ends or arrival after it
   * begins (AD-9 window bounds) — the passage reaches into darkness while the
   * family sleeps. The solver counts and caps these (max 2 per trip, second
   * week only); null when the duration is unknown.
   */
  nightLeg: boolean | null;
  /** Arrival time in Athens hours from midnight of the departure day (display). */
  arrivalHourAthens: number | null;
  /** FR30 calculation trail; empty when the leg could not be simulated. */
  breakdown: LegHourBreakdown[];
}

export type OptionState = 'offen' | 'offen-horizont' | 'schliesst' | 'zu';

export interface RouteOptionAssessment {
  routeId: string;
  state: OptionState;
  /** Set when state === 'schliesst': last day the option can still be started. */
  closesOnDay: number | null;
  /** Ampel of the weakest remaining leg when sailed on the earliest plan (FR17). */
  ampel: Ampel;
  legAssessments: LegAssessment[];
  reasons: string[];
}

export interface DayOption {
  /** 'stay' or the leg id. */
  kind: 'leg' | 'liegetag';
  legId: string | null;
  targetIslandId: string;
  leg: LegAssessment | null;
  bestPlaceId: string | null;
  bestPlaceAmpel: Ampel;
  /** Which route options this day move serves. */
  servesRouteIds: string[];
}

export interface PprResult {
  /** Latest trip day on which the return may still start (null = already past). */
  latestReturnStartDay: number | null;
  remainingDistanceNm: number | null;
  /** Trip day by which Alimos must be reached (incl. buffer). */
  effectiveDeadlineDay: number;
  reasons: string[];
}

export interface DecisionPoint {
  day: number;
  text: string;
}

/** One assessed day of a plan — what the day card and the map render. */
export interface StageAssessment {
  day: number;
  /** FR2 leg number (1..11), null on the harbour day. */
  stageNumber: number | null;
  kind: 'stage' | 'harbour';
  toIslandId: string;
  /** Skipper-chosen berth, or the current suggestion for solver stages (AD-12). */
  placeId: string | null;
  placeIsSuggestion: boolean;
  placeAmpel: Ampel;
  /** Worst ampel across this day's legs; 'unbewertet' beyond the horizon. */
  ampel: Ampel;
  legs: LegAssessment[];
  /** True when the skipper pinned this day. */
  pinned: boolean;
}

/**
 * A complete round trip plus its verdict — the shape of the main route, the
 * active proposal and every alternative (AD-12/AD-13).
 */
export interface PlanAssessment {
  plan: Plan;
  validity: PlanValidity;
  stages: StageAssessment[];
  /** Variant the outbound part follows and the turning point (display). */
  variantId: string;
  turnIslandId: string;
  /** Relaxation level the solver needed ('none' = nothing relaxed). */
  relaxedTo: string;
}

export interface Assessment {
  fetchedAtIso: string;
  modelRunIso: string | null;
  model: string;
  /** nightAmpeln[placeId][nightDay] */
  nightAmpeln: Record<string, Record<number, PlaceNightAssessment>>;
  /** bestPlaceByIsland[islandId][nightDay] = placeId | null (AD-2: ranking is domain). */
  bestPlaceByIsland: Record<string, Record<number, string | null>>;
  dayOptions: DayOption[];
  /**
   * Route options ORDERED by escalation rank (conservative first) — ordering
   * by domain criteria is computing (AD-2), so it happens here, not in views.
   */
  routeOptions: RouteOptionAssessment[];
  /**
   * The persisted main route, re-assessed against this snapshot. Null only
   * before the first plan exists (AD-12).
   */
  mainRoute: PlanAssessment | null;
  /**
   * The solver's active suggestion (FR22 — the old "no recommendation" rule
   * was overridden by the field test). On first start this is what
   * `ADOPT_INITIAL` adopts; afterwards it is a suggestion beside the main
   * route, never an automatic replacement for it.
   */
  proposal: PlanAssessment | null;
  /** FR29 alternatives; the skipper checks one in to make it the main route. */
  alternatives: PlanAssessment[];
  /**
   * FR2 rest-trip light, definition per AD-3:
   *  gruen = main route valid and fully inside the reliable horizon
   *  gelb  = main route not provably valid, but a valid round trip exists
   *  rot   = no valid round trip exists at all
   */
  restTripAmpel: Ampel;
  restTripReasons: string[];
  ppr: PprResult;
  decisionPoints: DecisionPoint[];
  /** Island the boat is currently at (derived from position). */
  currentIslandId: string | null;
  /**
   * Why currentIslandId is null although a position exists (e.g. fix beyond
   * the snap radius), or that the boat is off plan — null when the derivation
   * is unremarkable.
   */
  positionNote: string | null;
  /** True when the boat is not where the plan expected it to be. */
  offPlan: boolean;
}
