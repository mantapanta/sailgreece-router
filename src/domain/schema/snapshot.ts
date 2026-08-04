import type { Ampel } from './common.ts';
import type { Island } from './island.ts';
import type { InvalidPlace, Place } from './place.ts';
import type { Route } from './route.ts';
import type { Polar } from './polar.ts';
import type { Params } from './params.ts';

/**
 * AD-3 — engine contract: one snapshot in, one assessment out.
 * The snapshot hour axis is normatively UTC. Hours the model does not cover
 * (marine horizon < weather horizon!) arrive as `null` from the adapter and
 * are filled by the persistence assumption (domain/persistence.ts) before the
 * engine runs — the corresponding hours are flagged `windAssumed`/`waveAssumed`
 * so every verdict can say whether it rests on forecast or on assumption.
 * Hours that stay null (no data basis at all) remain 'unbewertet'.
 */

/**
 * Basis of a verdict: real forecast hours only, or partly the persistence
 * assumption beyond the forecast horizon. Never silently mixed — 'annahme'
 * means AT LEAST one contributing hour is assumed.
 */
export type DataBasis = 'forecast' | 'annahme';

/** Hourly forecast series for one location. Missing hours are null. */
export interface PointForecast {
  windKn: (number | null)[];
  windDirDeg: (number | null)[];
  gustKn: (number | null)[];
  waveM: (number | null)[];
  waveDirDeg: (number | null)[];
  wavePeriodS: (number | null)[];
  /** Per hour: wind values stem from the persistence assumption, not the model. */
  windAssumed: boolean[];
  /** Per hour: wave values stem from the persistence assumption, not the model. */
  waveAssumed: boolean[];
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
  trackedRouteId: string | null;
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
  basis: DataBasis;
  reasons: string[];
}

/**
 * How much room the leg has left before it degrades — the sensitivity of the
 * verdict. This is what turns "green" into "green, but only just": it names
 * what would have to change for the plan to break.
 */
export interface LegHeadroom {
  /**
   * Knots of wind left before the FR16 upwind rule bites, measured at the
   * worst beating point/hour. null = the leg never beats, so the rule is not
   * the binding constraint. Negative = already exceeded.
   */
  windKn: number | null;
  /** Hours left before the hard day maximum (sail + motor) is exceeded. */
  hours: number | null;
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
  headroom: LegHeadroom;
  basis: DataBasis;
  /**
   * Derivation of THIS verdict in plain sentences (FR22 — the skipper must be
   * able to follow the assumptions, not just the outcome): window, course,
   * wind band, speed model, budget comparison, the governing rule and point,
   * and the data basis. Complements `reasons`, which only names what pulled
   * the ampel down.
   */
  rationale: string[];
  reasons: string[];
}

export type OptionState = 'offen' | 'offen-annahme' | 'schliesst' | 'zu';

export interface RouteOptionAssessment {
  routeId: string;
  state: OptionState;
  /** Set when state === 'schliesst': last day the option can still be started. */
  closesOnDay: number | null;
  /** Ampel of the weakest remaining leg when sailed on the earliest plan (FR17). */
  ampel: Ampel;
  legAssessments: LegAssessment[];
  /**
   * The return chain from this option's FINAL island, assessed from the day
   * after the earliest arrival. FR18 judges outbound and return together, so
   * the return legs must be visible too — an option is usually not closed by
   * its outbound legs but by the beat home that follows them.
   */
  returnLegAssessments: LegAssessment[];
  basis: DataBasis;
  /** Why this option carries this state — which rest plan was searched. */
  rationale: string[];
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
  /**
   * The return chain's legs, assessed one per day from the latest turnaround
   * day. Exposed because these are the legs that actually bite in this cruising
   * area — they beat north against the Meltemi, while the outbound legs run
   * downwind. Without them the overall reasoning would only ever see the
   * harmless half of the trip.
   */
  legAssessments: LegAssessment[];
  basis: DataBasis;
  /** How the turnaround day was derived (which chain, which constraint bites). */
  rationale: string[];
  reasons: string[];
}

export interface DecisionPoint {
  day: number;
  text: string;
}

/** One titled block of the overall plan reasoning. */
export interface PlanRationaleSection {
  title: string;
  lines: string[];
}

/**
 * Reasoning for the plan AS A WHOLE — one level above the per-leg and
 * per-option rationales. It answers "why does the plan look like this today":
 * starting situation, what the option space still allows, which constraint
 * actually binds it, where the next decision pressure sits, the weather picture
 * behind it, how sensitive the whole thing is, and on what data it rests.
 */
export interface PlanRationale {
  /** One sentence: the situation in a nutshell. */
  summary: string;
  sections: PlanRationaleSection[];
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
  ppr: PprResult;
  decisionPoints: DecisionPoint[];
  /** Reasoning for the whole plan (FR22) — see PlanRationale. */
  planRationale: PlanRationale;
  /** Island the boat is currently at (derived from position). */
  currentIslandId: string | null;
  /**
   * Why currentIslandId is null although a position exists (e.g. fix beyond
   * the snap radius) — or null when the derivation is unremarkable.
   */
  positionNote: string | null;
  /**
   * Last hour of the axis with real WIND data (ISO-UTC). Hours after it are
   * the persistence assumption. null = no forecast hour at all.
   */
  forecastHorizonIso: string | null;
  /**
   * Last hour with real WAVE data — regularly EARLIER than the wind horizon
   * (marine models run shorter). Shown separately so "assumption from day X"
   * is traceable to the series that actually ran out.
   */
  waveHorizonIso: string | null;
  /**
   * First trip day whose assessment rests wholly or partly on the assumption
   * (null = the whole trip is covered by real forecast). Drives the visible
   * "ab Tag X Annahme" caveat.
   */
  assumedFromDay: number | null;
  /** Human-readable description of the assumption actually applied. */
  assumptionNote: string | null;
}
