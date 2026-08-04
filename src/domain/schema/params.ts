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
   * Trip day of DISEMBARKATION (1-based; default = last trip day). The
   * return to the base on the EVE of this day is computed internally:
   * effectiveDeadlineDay = disembarkDay - 1 - bufferDays. Enter the
   * disembarkation day itself here, NOT the eve.
   */
  disembarkDay: z.number().int().positive().default(12),
  /** Additional buffer day before that deadline (FR19). */
  bufferDays: z.number().int().min(0).default(1),
  /** Home base island / place. */
  baseIslandId: z.string().default('athen'),
  basePlaceId: z.string().default('athen-alimos'),

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
  /**
   * Requested forecast days. Ask for the MAXIMUM: real model data always beats
   * the persistence assumption, and the APIs simply return null for hours they
   * do not cover (measured 2026-08-04: ECMWF wind ~15 days, marine waves
   * ~9 days). Those nulls are filled by domain/persistence.ts and flagged, so
   * a generous request costs nothing but yields days of real wind.
   */
  forecastDays: z.number().int().min(1).max(16).default(16),
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
  if (p.disembarkDay - 1 - p.bufferDays < 1) {
    ctx.issues.push({
      code: 'custom',
      message: 'disembarkDay - 1 - bufferDays muss >= 1 sein (effektiver Stichtag vor Törnbeginn)',
      input: p,
    });
  }
  if (p.disembarkDay > p.tripLengthDays) {
    ctx.issues.push({
      code: 'custom',
      message: 'disembarkDay darf tripLengthDays nicht überschreiten',
      input: p,
    });
  }
});
export type Params = z.infer<typeof ParamsSchema>;

/** All defaults — used until the config document is loaded. */
export const DEFAULT_PARAMS: Params = ParamsSchema.parse({});
