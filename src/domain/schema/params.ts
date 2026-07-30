import { z } from 'zod';

/**
 * AD-8: all tuning parameters live in the Firestore `config` document
 * (documents `polar` + `parameters`), not in code — field correction without
 * redeploy. Defaults here mirror PRD FR15/FR16/FR26 and the brief.
 * Parameters reach the snapshot RAW; they are applied ONLY in the core (AD-10).
 */
export const ParamsSchema = z.object({
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
  /** Return to Alimos on the eve of disembarkation => trip day lengthDays-1. */
  returnByEveOfDay: z.number().int().positive().default(12),
  /** Additional buffer day before that deadline (FR19). */
  bufferDays: z.number().int().min(0).default(1),
  /** Home base island / place. */
  baseIslandId: z.string().default('athen'),
  basePlaceId: z.string().default('athen-alimos'),

  // --- forecast (FR11) --------------------------------------------------------
  /** Open-Meteo model id; default ECMWF. Model choice is a config parameter. */
  forecastModel: z.string().default('ecmwf_ifs025'),
  forecastDays: z.number().int().min(1).max(16).default(10),
});
export type Params = z.infer<typeof ParamsSchema>;

/** All defaults — used until the config document is loaded. */
export const DEFAULT_PARAMS: Params = ParamsSchema.parse({});
