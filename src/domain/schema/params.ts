import { z } from 'zod';

/**
 * AD-8: all tuning parameters live in the Firestore `config` document
 * (documents `polar` + `parameters`), not in code — field correction without
 * redeploy. Defaults here mirror PRD FR15/FR16/FR26 and the brief.
 * Parameters reach the snapshot RAW; they are applied ONLY in the core (AD-10).
 */
const ParamsObjectSchema = z.object({
  // --- speeds / polar (FR26, AD-10) ---------------------------------------
  /** Additive offset on all polar values (Saona vs FP45). Applied ONLY in domain/polar.ts. */
  polarOffsetKn: z.number().default(0.5),
  /** Motoring speed — own parameter, NOT offset. */
  motorSpeedKn: z.number().positive().default(8),
  /** Flat planning speeds — active ONLY while no polar is loaded. */
  fallbackSpeeds: z
    .object({
      sailKn: z.number().positive().default(6.0),
      motorKn: z.number().positive().default(7.5),
      upwindKn: z.number().positive().default(6.5),
    })
    .default({ sailKn: 6.0, motorKn: 7.5, upwindKn: 6.5 }),
  /** Below this polar sail speed the leg hour is motored instead. */
  minSailSpeedKn: z.number().positive().default(3.5),

  // --- course vs wind (FR16) ----------------------------------------------
  /** TWA below this counts as beating ("gegenan"). */
  upwindTwaDeg: z.number().min(0).max(90).default(55),
  /** Close-hauled angle actually sailed when destination is upwind (VMG model). */
  beatTwaDeg: z.number().min(30).max(70).default(50),
  /** FR16: no beating upwind above this true wind speed. */
  maxUpwindTwsKn: z.number().positive().default(25),
  /** Yellow-band wind reserve (FR17 calibration parameter, AD-8/Deferred). */
  gelbReserveKn: z.number().min(0).default(3),

  // --- day budgets (FR16) --------------------------------------------------
  /** Target: max ~6 h under way (5 h sail + 1 h motor or 6 h pure sailing). */
  targetDayHours: z.number().positive().default(6),
  targetMotorHours: z.number().min(0).default(1),
  /** Hard maximum: 6 h sail + 2 h motor. */
  maxSailHours: z.number().positive().default(6),
  maxMotorHours: z.number().min(0).default(2),
  /** Light wind: 10-12 h passages (incl. night legs) allowed at <= this TWS. */
  lightWindMaxTwsKn: z.number().positive().default(6),
  lightWindMaxHours: z.number().positive().default(12),
  /**
   * Liegezeit an einem Zwischenstopp innerhalb eines Tages (Baden, Essen,
   * Landgang). Standard 3 h, pro Tag überschreibbar (TripFrame).
   *
   * Sie verschiebt die Abfahrt der FOLGE-Etappe und damit deren Forecast-
   * Fenster — genau der Punkt: nach drei Stunden Mittagspause fällt der
   * zweite Schlag in den aufgebauten Nachmittags-Meltemi, nicht in den
   * ruhigen Vormittag. Sie zählt NICHT ins Fahrt-Budget (FR16), denn das
   * begrenzt Stunden unter Segeln und Motor, keine Pausen.
   */
  stopHoursDefault: z.number().min(0).max(12).default(3),

  // --- place ampel (FR8) ----------------------------------------------------
  /** Unprotected ("Luv") direction: yellow up to this wind, red above. */
  openSectorMaxKn: z.number().positive().default(10),
  /** Unprotected direction: yellow up to this wave height, red above. */
  openSectorMaxWaveM: z.number().positive().default(0.5),

  // --- time windows (AD-9) --------------------------------------------------
  /** Default departure, Athens local hour (FR15 assumption 09:00). */
  departureHourAthens: z.number().int().min(0).max(23).default(9),
  /** Overnight window [N 18:00, N+1 09:00) Athens (FR8 assumption). */
  nightStartHourAthens: z.number().int().min(0).max(23).default(18),
  nightEndHourAthens: z.number().int().min(0).max(23).default(9),

  // --- trip frame (FR18/FR19) -----------------------------------------------
  tripStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default('2026-08-08'),
  tripLengthDays: z.number().int().positive().default(12),
  /**
   * THE ONE deadline (AD-8/AD-9): contractual return to the base.
   * Everything else — effective deadline day, PoR reserve — is DERIVED from
   * this in domain/time.ts; never maintain a second deadline in parallel.
   */
  returnDeadlineDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default('2026-08-19'),
  returnDeadlineHourAthens: z.number().int().min(0).max(23).default(18),
  /** PoR reserve in days — the buffer/harbour day IS this reserve (AD-9, FR19). */
  bufferDays: z.number().int().min(0).default(1),
  /**
   * Planning TARGET for harbour days (days without a leg): normally one, the
   * buffer/pickup day. Not a limit — waiting out weather is legitimate.
   */
  harbourDays: z.number().int().min(0).default(1),
  /**
   * Emergency ceiling for harbour days (skipper's call, 2026-08-03: "at a
   * pinch up to 5"). Beyond this the plan is no longer the trip that was
   * intended and says so — but it stays a structural finding, never a red
   * alarm, since lying in port is safe.
   */
  harbourDaysMax: z.number().int().min(0).default(5),
  /** Home base island / place. */
  baseIslandId: z.string().default('athen'),
  basePlaceId: z.string().default('athen-alimos'),

  // --- forecast horizon & worst case (AD-13) --------------------------------
  /**
   * Stages beyond this many days from the current day are 'unbewertet' and
   * count NEITHER for nor against validity (FR18). Only the return check
   * falls back to the worst case below.
   */
  reliableHorizonDays: z.number().int().positive().default(7),
  /**
   * "Full Meltemi" as a computable scenario — binds EXACTLY ONE calculation:
   * the return check (AD-13 condition 2'), never the outbound stages.
   */
  meltemiWorstCase: z
    .object({
      twsKn: z.number().positive().default(30),
      fromDeg: z.number().min(0).max(360).default(0),
      toDeg: z.number().min(0).max(360).default(45),
      waveM: z.number().min(0).default(2.0),
    })
    .default({ twsKn: 30, fromDeg: 0, toDeg: 45, waveM: 2.0 }),

  // --- guest pickup (FR31) ----------------------------------------------------
  /** Hard validity condition: ferry-reachable harbour reached on this date. */
  pickupDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default('2026-08-15'),
  /** Latest arrival (Athens hour) if the pickup day itself carries a leg. */
  pickupLatestArrivalHourAthens: z.number().int().min(0).max(23).default(16),

  // --- night legs (FR16) --------------------------------------------------------
  /** Night leg only below this TWS, over the WHOLE leg duration. */
  nightLegMaxTwsKn: z.number().positive().default(10),
  /** At most this many night legs per trip. */
  nightLegMaxPerTrip: z.number().int().min(0).default(2),
  /** Night legs only from this trip day on (second week). */
  nightLegEarliestDay: z.number().int().positive().default(8),

  // --- solver (FR29, AD-13) -------------------------------------------------------
  /** Max alternatives offered besides the main route. */
  alternativesMax: z.number().int().min(0).default(3),

  // --- position derivation ----------------------------------------------------
  /**
   * Maximum distance (nm) between a position fix and the nearest library
   * place for the fix to be snapped to that place's island. Beyond this the
   * position counts as "outside the cruising area" (no island, visible reason)
   * instead of silently snapping to the closest island.
   */
  maxSnapNm: z.number().positive().default(30),

  // --- display ------------------------------------------------------------------
  /** Nights ahead of the current day assessed for display (AD-8: config, not code). */
  nightLookaheadDays: z.number().int().positive().default(10),

  // --- forecast (FR11) --------------------------------------------------------
  /** Open-Meteo model id; default ECMWF. Model choice is a config parameter. */
  forecastModel: z.string().default('ecmwf_ifs025'),
  forecastDays: z.number().int().min(1).max(16).default(10),
});

/**
 * Cross-field validation: the config document is editable in Firestore
 * without redeploy (AD-8) — inconsistent combinations must fail loudly
 * instead of silently producing nonsense windows/ampeln.
 */
export const ParamsSchema = ParamsObjectSchema.check((ctx) => {
  const p = ctx.value;
  if (p.nightEndHourAthens >= p.nightStartHourAthens) {
    ctx.issues.push({
      code: 'custom',
      message:
        'nightEndHourAthens muss < nightStartHourAthens sein (Nachtfenster endet fix am Folgetag)',
      input: p,
    });
  }
  if (p.targetDayHours > p.maxSailHours + p.maxMotorHours) {
    ctx.issues.push({
      code: 'custom',
      message: 'targetDayHours darf das harte Maximum (maxSailHours + maxMotorHours) nicht überschreiten',
      input: p,
    });
  }
  if (p.gelbReserveKn >= p.maxUpwindTwsKn) {
    ctx.issues.push({
      code: 'custom',
      message: 'gelbReserveKn muss kleiner als maxUpwindTwsKn sein (sonst ist gruen unerreichbar)',
      input: p,
    });
  }
  if (p.returnDeadlineDate < p.tripStartDate) {
    ctx.issues.push({
      code: 'custom',
      message: 'returnDeadlineDate darf nicht vor tripStartDate liegen',
      input: p,
    });
  }
  if (p.pickupDate < p.tripStartDate || p.pickupDate > p.returnDeadlineDate) {
    ctx.issues.push({
      code: 'custom',
      message: 'pickupDate muss innerhalb des Törnfensters liegen (FR31 ist harte Bedingung)',
      input: p,
    });
  }
  if (p.meltemiWorstCase.twsKn <= p.maxUpwindTwsKn) {
    ctx.issues.push({
      code: 'custom',
      message:
        'meltemiWorstCase.twsKn muss über maxUpwindTwsKn liegen — sonst ist das Worst-Case-Szenario kein Worst Case',
      input: p,
    });
  }
  // The worst-case sector is read CLOCKWISE from fromDeg to toDeg. A full
  // circle has no meaningful middle, and swapped bounds would silently turn
  // the northerly Meltemi into a harmless southerly — both must fail loudly
  // rather than produce a scenario that is no longer a worst case.
  {
    const { fromDeg, toDeg } = p.meltemiWorstCase;
    const span = (toDeg - fromDeg + 360) % 360;
    if (span === 0 && fromDeg !== toDeg) {
      ctx.issues.push({
        code: 'custom',
        message:
          'meltemiWorstCase: Vollkreis-Sektor (0–360) ist unzulässig — die Sektormitte ist dann nicht definiert',
        input: p,
      });
    }
    if (span > 180) {
      ctx.issues.push({
        code: 'custom',
        message:
          'meltemiWorstCase: Sektor über 180° im Uhrzeigersinn — fromDeg/toDeg vermutlich vertauscht (die Sektormitte läge gegenüber der gemeinten Richtung)',
        input: p,
      });
    }
  }
});
export type Params = z.infer<typeof ParamsSchema>;

/** All defaults — used until the config document is loaded. */
export const DEFAULT_PARAMS: Params = ParamsSchema.parse({});
