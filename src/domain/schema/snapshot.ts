import type { Ampel } from './common.ts';
import type { Island } from './island.ts';
import type { InvalidPlace, Place } from './place.ts';
import type { Leg, Variant } from './route.ts';
import type { DayReturnCheck, Plan, PlanValidity, RelaxationLevel } from './plan.ts';
import type { Polar } from './polar.ts';
import type { Params } from './params.ts';

/**
 * AD-3 — engine contract: one snapshot in, one assessment out.
 * The snapshot hour axis is normatively UTC. Hours the model does not cover
 * (marine horizon < weather horizon!) arrive as `null` from the adapter and
 * are filled by the persistence assumption (domain/persistence.ts) before
 * anything is judged — the filled hours are flagged `windAssumed`/`waveAssumed`
 * so every verdict can say whether it rests on forecast or on assumption.
 * Hours that stay null (no data basis at all) remain 'unbewertet'.
 */

/**
 * Basis of a verdict: real forecast hours only, or partly the persistence
 * assumption beyond the forecast horizon. 'annahme' means AT LEAST one
 * contributing hour is assumed — the assumption is never silently mixed in.
 */
export type DataBasis = 'forecast' | 'annahme';

/** Hourly forecast series for one location. Missing hours are null. */
export interface PointForecast {
  windKn: (number | null)[];
  windDirDeg: (number | null)[];
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
  /**
   * The persisted main route (AD-12). Null before the first assessment, when
   * `ADOPT_INITIAL` adopts the solver's proposal exactly once. A recomputation
   * only ever RE-ASSESSES this plan — it never mutates it.
   */
  plan: Plan | null;
  /** Athens local departure hour override for today (FR15). */
  departureHourOverride: number | null;
  /**
   * Liegezeit an den Zwischenstopps, pro Törntag überschrieben. Fehlt ein Tag,
   * gilt `params.stopHoursDefault`.
   *
   * Anders als `departureHourOverride` gilt das NICHT nur für heute: eine
   * geplante Badepause an Tag 5 ist eine Planungsentscheidung für Tag 5 und
   * muss dessen Bewertung auch dann tragen, wenn heute Tag 1 ist.
   */
  stopHoursByDay: Record<number, number>;
}

export interface Library {
  islands: Island[];
  places: Place[];
  invalidPlaces: InvalidPlace[];
  /**
   * Deduplicated leg library (AD-4): every leg exists exactly once, so a
   * waypoint correction lands in one place instead of four.
   */
  legs: Leg[];
  /** Curated round-trip variants as ordered leg-id sequences (FR9). */
  variants: Variant[];
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
  /** Worst wind observed inside the night window — this drives `ampel`. */
  maxWindKn: number | null;
  windDirDeg: number | null;
  /**
   * Höchste Wellenhöhe der Nacht — REINE INFORMATION, sie geht NICHT in
   * `ampel` ein (domain/ampel.ts, Modulkopf). Es ist der Wert der offenen See
   * am Ort des Platzes; im Hafen oder hinter der Landzunge gilt er nicht.
   * Anzeigen ja, bewerten nein — und die Anzeige muss das dazusagen.
   */
  maxWaveM: number | null;
  basis: DataBasis;
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
  /**
   * AD-6 — Richtung, AUS DER der Wind weht, rechtweisend. Zusammen mit
   * `courseDeg` ist das die Herkunft von `twaDeg`: ohne sie steht in der
   * Rechnung ein Winkel, dessen Grundlage der Skipper nicht nachprüfen kann.
   */
  twdDeg: number;
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

/**
 * FR30 — Durchfahrt eines Etappenpunktes (Startplatz, Wegpunkt, Zielplatz).
 *
 * Das ist die Zeile, aus der die Rechnung besteht: jeder Punkt genau EINMAL,
 * mit Distanz ab Etappenstart und Durchfahrtszeit. Eine stündliche Zeile kann
 * das nicht leisten — in einer Stunde wird mal kein Punkt passiert und mal
 * zwei, je nach Speed; genau deshalb fehlten in der alten Tabelle Punkte und
 * andere standen doppelt.
 *
 * Die Wind-/Speed-Werte sind die der Stunde, IN DER der Punkt passiert wurde —
 * keine gemittelte Näherung, sondern der Zustand am Durchfahrtszeitpunkt.
 *
 * Erzeugt ausschliesslich von assessLeg (AD-3); Views rechnen nichts nach,
 * insbesondere keine Distanzen aus Koordinaten (AD-2).
 */
export interface PointPassage {
  /** Forecast key des Punktes — matcht die Punktnummer der Tageskarte. */
  pointKey: string;
  /** Distanz ab Start DIESER Etappe in sm. */
  distanceNm: number;
  /**
   * Durchfahrtszeit (ISO-UTC) oder null, wenn die Etappe den Punkt im
   * Simulationsfenster nicht erreicht — dann wird keine Zeit erfunden.
   */
  etaIso: string | null;
  /**
   * Abschnitt, der ZU diesem Punkt führt. Null beim Startpunkt, der nicht
   * angefahren, sondern verlassen wird.
   */
  segment: {
    /** Rechtweisender Kurs des Abschnitts. */
    courseDeg: number;
    /** Länge NUR dieses Abschnitts in sm. */
    distanceNm: number;
    /**
     * Wind und Fahrt der Stunde, in der der Punkt passiert wurde.
     * `twdDeg` ist die Richtung, AUS DER der Wind weht (AD-6, rechtweisend) —
     * ohne sie liesse sich der `twaDeg` daneben nicht nachrechnen.
     */
    twdDeg: number;
    twsKn: number;
    twaDeg: number;
    speedKn: number;
    motoring: boolean;
    /** Diese Stunde rechnete gegen den Meltemi-Worst-Case (AD-13). */
    worstCase: boolean;
  } | null;
}

export interface LegAssessment {
  legId: string;
  /**
   * Die Etappe, wie sie für dieses Urteil wirklich gesegelt wurde: verankert
   * an den Plätzen der Plankette und mit landfreiem Kurs (domain/legGeometry.ts).
   *
   * Sie steht hier, weil Rechnung und Karte sonst zwei Geometrien hätten. Die
   * Karte zeichnete die kuratierte Luftlinie — quer über Syros —, während die
   * Rechnung längs eines anderen Kurses lief. Ein Urteil, dessen Kurs man nicht
   * nachzeichnen kann, ist nicht nachvollziehbar (FR30).
   *
   * Null nur, wenn die Etappe gar nicht auflösbar war (tote Referenz nach
   * einem Reimport) — dann gibt es keinen Kurs, und die Karte lässt die Lücke
   * stehen statt eine Linie zu erfinden.
   */
  sailedLeg: Leg | null;
  day: number;
  ampel: Ampel;
  sailHours: number | null;
  motorHours: number | null;
  totalHours: number | null;
  /** Mean TWS / TWA over the simulated passage (display). */
  avgTwsKn: number | null;
  avgTwaDeg: number | null;
  /**
   * Mittlere Windrichtung (AD-6: woher) über die simulierte Passage — als
   * VEKTOR-Mittel, nicht als arithmetisches: 350° und 10° mitteln zu 0°, nicht
   * zu 180°. Null, wenn keine Stunde simuliert wurde oder die Richtungen sich
   * gegenseitig aufheben — dann gibt es keine mittlere Richtung, und eine
   * ausgewiesene wäre erfunden.
   */
  avgTwdDeg: number | null;
  /**
   * Mittlere Fahrt über der simulierten Passage (zurückgelegte sm je Stunde
   * unter Weg, Segeln und Motor zusammen). Gehört hierher und nicht in die
   * View: `Distanz / Zeit` ist eine Aussage über die Etappe, und AD-2 lässt
   * Views keine Domänenwerte rechnen — auch keine scheinbar trivialen.
   */
  avgSpeedKn: number | null;
  upwind: boolean;
  /**
   * Whether this verdict rests on real model hours or partly on the
   * persistence assumption beyond the forecast horizon.
   */
  basis: DataBasis;
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
  /**
   * FR30 calculation trail, hour by hour; empty when the leg could not be
   * simulated. Trägt die Summenzeile ("5 simulierte Stunden, 4 unter Segeln");
   * die angezeigte Tabelle ist `pointPassages`.
   */
  breakdown: LegHourBreakdown[];
  /**
   * FR30 — die angezeigte Rechnung: jeder Etappenpunkt einmal, mit Distanz und
   * Durchfahrtszeit. Leer, wenn die Etappe nicht simuliert werden konnte.
   */
  pointPassages: PointPassage[];
}

export type OptionState = 'offen' | 'offen-horizont' | 'schliesst' | 'zu';

export interface RouteOptionAssessment {
  routeId: string;
  /** Kuratierter Name der Route — die View soll keine Ids anzeigen müssen. */
  name: string;
  state: OptionState;
  /** Set when state === 'schliesst': last day the option can still be started. */
  closesOnDay: number | null;
  /** Ampel of the weakest remaining leg when sailed on the earliest plan (FR17). */
  ampel: Ampel;
  legAssessments: LegAssessment[];
  reasons: string[];
  /** Insel am fernen Ende dieser Route — das eigentliche Ziel der Option. */
  turnIslandId: string;
  /** Entfernung Basis → Wendepunkt. Das Mass für "wie weit kommen wir". */
  reachNm: number | null;
  /**
   * WAS DIE OPTION KOSTET — die mildeste Stufe der Eskalationsleiter, auf der
   * ein gültiger Plan für sie existiert (`null`, wenn keiner existiert).
   *
   * Das ist die Antwort auf "ich will doch dahin, was heisst das dann?".
   * 'none' = ohne Zugeständnis; 'doppelschlag' = Tage mit zwei Verbindungen;
   * 'nightLeg' = Nachtetappen. Ohne diese Angabe ist eine offene Option eine
   * Behauptung ohne Preisschild.
   */
  costLevel: RelaxationLevel | null;
  /** Der Preis in einem Satz, für die Anzeige. */
  costNote: string | null;
  /**
   * Der konkrete Plan zu dieser Option — damit "verfolgen" nicht heisst, dass
   * der Skipper ihn sich selbst zusammensucht. Null, wenn es keinen gibt.
   */
  plan: Plan | null;
  /** Tag, an dem dieser Plan den Wendepunkt erreicht (früher = mehr Luft). */
  turnDay: number | null;
  /**
   * Verschmelzung Optionsraum + Alternativ-Routen: Index der ansehbaren
   * Alternative zu `plan` in `Assessment.alternatives`. Vorschau, Kartenfarbe
   * und Übernahme laufen über DIESEN Eintrag — Tagesansicht und Karte meinen
   * dieselbe Route in derselben Farbe, und angesehen wird exakt der Plan, der
   * übernommen würde (AD-3). Null, wenn kein Plan existiert — oder wenn der
   * Plan der aktuellen Hauptroute entspricht (dann gibt es nichts ANDERES
   * anzusehen).
   */
  previewIndex: number | null;
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
  /**
   * Liegezeit je Zwischenstopp dieses Tages (Stunden) — der wirksame Wert,
   * Override oder Default. Auch an Tagen ohne Zwischenstopp gesetzt, damit die
   * Ansicht ihn zum Bearbeiten anbieten kann.
   */
  stopHoursPerStop: number;
  /**
   * Summe der Liegezeit dieses Tages: (Anzahl Etappen − 1) × stopHoursPerStop.
   * Null Etappen oder ein Hafentag ergeben 0.
   */
  stopHoursTotal: number;
  /**
   * Inseln, die von der VORHERIGEN Plan-Insel aus als Tagesziel in Frage
   * kommen (domain/reach.ts): 100 sm raumschots, 50 sm gegenan — UND von
   * dort mit Etappen der Bibliothek an einem Tag erreichbar. Das
   * Ziel-Dropdown zeigt NUR diese — eine Insel drei Tagesreisen entfernt ist
   * kein Tagesziel (Feedback 2026-08-05), und eine ohne Bibliotheks-Weg
   * würde die Übernahme immer ablehnen (Bug-Report 2026-08-05).
   */
  reachableIslandIds: string[];
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
  /**
   * Tag, an dem DIESE Kette ihren fernsten Punkt erreicht — die Trennlinie
   * zwischen Hin- und Rückweg: Etappen bis einschliesslich `turnDay` sind
   * Hinweg, alles danach Rückweg (Feedback 2026-08-05: die Karte muss die
   * beiden unterscheidbar zeichnen). Aus der eigenen Etappenfolge abgeleitet
   * (solver.planTurnDay), nicht aus `turnIslandId` — der kann beim
   * Hauptrouten-Assessment vom aktuellen Solver-Vorschlag stammen und muss in
   * dieser Kette nicht vorkommen. Null ohne Segeltage.
   */
  turnDay: number | null;
  /** Relaxation level the solver needed ('none' = nothing relaxed). */
  relaxedTo: string;
  /**
   * Zielmodell v2 — die tägliche Abbruch-Notation: der Heimweg-Status jedes
   * zukünftigen Plantags (solver.deriveReturnChecks). Geplant wird auf das
   * Wetterfenster; HIER steht, ab welchem Punkt der Plan nur noch vom Forecast
   * getragen wird und woran der Skipper den Abbruch erkennt.
   */
  returnChecks: DayReturnCheck[];
  /**
   * Letzter Tag der anfänglich meltemi-festen Strecke — bis hierhin ist die
   * Umkehr auch unter dem vollen Worst-Case jederzeit möglich. Null, wenn
   * schon der erste geprüfte Tag am Forecast hängt oder nichts zu prüfen ist.
   */
  meltemiSafeUntilDay: number | null;
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
  /**
   * FR29 alternatives; the skipper checks one in to make it the main route.
   * Verschmolzen mit dem Optionsraum: die Einträge sind die konkreten Pläne
   * der Optionen (`RouteOptionAssessment.previewIndex` zeigt hierher, dedupliziert
   * über den Plan-Inhalt, die Hauptroute ausgenommen) plus der FR2-Zeuge,
   * falls er von keiner Option abgedeckt ist — ein gelbes Licht bleibt
   * einlösbar (AD-13).
   */
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
  /**
   * Last hour with real WIND data (ISO-UTC); hours after it come from the
   * persistence assumption. null = no usable forecast at all.
   */
  forecastHorizonIso: string | null;
  /**
   * Last hour with real WAVE data — regularly EARLIER than the wind horizon,
   * because marine models run shorter. Reported separately so that
   * "assumption from day X" is traceable to the series that actually ran out.
   */
  waveHorizonIso: string | null;
  /**
   * First trip day whose assessment rests wholly or partly on the assumption —
   * either because hours were extrapolated or because the day lies beyond
   * params.reliableHorizonDays. null = the whole trip stands on trusted data.
   */
  assumedFromDay: number | null;
  /** Human-readable description of the assumption actually applied. */
  assumptionNote: string | null;
}
