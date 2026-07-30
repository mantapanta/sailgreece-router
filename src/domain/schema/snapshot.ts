import type { Ampel } from './common.ts';
import type { Island } from './island.ts';
import type { InvalidPlace, Place } from './place.ts';
import type { Route } from './route.ts';
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
  gustKn: (number | null)[];
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
  reasons: string[];
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

export interface Assessment {
  fetchedAtIso: string;
  modelRunIso: string | null;
  model: string;
  /** nightAmpeln[placeId][nightDay] */
  nightAmpeln: Record<string, Record<number, PlaceNightAssessment>>;
  /** bestPlaceByIsland[islandId][nightDay] = placeId | null (AD-2: ranking is domain). */
  bestPlaceByIsland: Record<string, Record<number, string | null>>;
  dayOptions: DayOption[];
  routeOptions: RouteOptionAssessment[];
  ppr: PprResult;
  decisionPoints: DecisionPoint[];
  /** Island the boat is currently at (derived from position). */
  currentIslandId: string | null;
}
