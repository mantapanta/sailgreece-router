import { z } from 'zod';
import { forecastModelInfo, type ForecastKind } from './models.ts';

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
  /**
   * DER ENGSTE WINKEL ZUM WIND, DEN DAS SCHIFF SEGELN KANN (Skipper 2026-08-06:
   * "ich kann maximal 50 Grad TWA segeln, sonst muss gekreuzt werden").
   *
   * Liegt der Kurs enger am Wind, wird er NICHT angelegen: es wird gekreuzt,
   * und auf dem Kurs kommt nur cos(50°)/cos(TWA) der Fahrt an (polar.ts,
   * kreuzFactor). Der Winkel ist damit keine Anzeigegrösse, sondern die Grenze,
   * an der die Rechnung vom Anliegen aufs Kreuzen umschaltet.
   */
  beatTwaDeg: z.number().min(30).max(70).default(50),
  /**
   * Ab wie vielen KREUZ-STUNDEN eine Etappe gelb wird (Skipper 2026-08-06:
   * Kreuzen "sollte im Routing eher vermieden werden").
   *
   * Ein Regler, kein Verbot — dieselbe Doktrin wie bei den Wind-Schwellen:
   * die App rät ab, sie verbietet nicht. Gelb heisst hier nicht "gefährlich",
   * sondern "das ist nicht der Törn, der gewollt ist"; die Etappe bleibt
   * segelbar und der Plan gültig. Vermieden wird das Kreuzen an der Stelle, an
   * der es hingehört: in der Rangfolge der Pläne (solver.ts, `kreuzTenths`).
   *
   * 0.5 h, weil ein kurzer Kreuzschlag um eine Landspitze herum kein Befund
   * ist — eine halbe Stunde Aufkreuzen merkt an Bord niemand.
   */
  kreuzGelbAbStunden: z.number().min(0).default(0.5),
  /**
   * PLANLÄNGE EINES KREUZSCHLAGS in sm — daraus folgt, wie oft der gezeichnete
   * Zickzack wendet (domain/kreuz.ts).
   *
   * Keine Wendeanweisung, sondern der Massstab der Skizze: 5 sm sind bei
   * Familiencrew und 6 kn knapp eine Stunde je Schlag. Kürzer wäre ein
   * Zickzack aus vierzig Wenden, länger ein einzelner Schlag quer aus dem
   * Revier heraus — beides zeigt nicht, was wirklich gefahren wird. Findet
   * sich damit kein landfreier Weg, halbiert kreuz.ts selbst.
   */
  kreuzSchlagNm: z.number().positive().default(5),
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

  /**
   * Wie viele Etappen der Planer HÖCHSTENS auf einen Tag legt. Standard 1:
   * ein Tag, eine Verbindung von Insel zu Insel (Skipper-Entscheidung
   * 2026-08-05).
   *
   * Der Zwischenstopp ist damit kein Normalfall mehr, sondern eine Stufe der
   * Eskalationsleiter (solver.ts, RELAXATION_ORDER 'doppelschlag'): Er kommt,
   * wenn ein Tag pro Verbindung den Stichtag oder einen Skipper-Pin nicht mehr
   * erreicht — und weil er dann aus der Leiter kommt, steht auch dabei, dass
   * etwas nachgegeben werden musste.
   *
   * Gilt für den PLAN. Die Frage "kommen wir überhaupt noch heim?"
   * (packLegsFeasible: Rückkehr-Check, PoR, früheste Ankunft) rechnet
   * weiterhin mit dem, was das Schiff KANN — dort wäre die Stilvorgabe eine
   * erfundene Einschränkung, die Alarm schlägt, wo keiner ist.
   */
  maxLegsPerDay: z.number().int().min(1).max(2).default(1),

  /**
   * Wie viele Doppelschlag-TAGE ein Törn höchstens trägt. Standard 1: der
   * Doppelschlag ist "eine Ausnahme, kein Normalfall" (Skipper 2026-08-05,
   * "ein Tag, eine Verbindung") — und eine Ausnahme, die an sechs Tagen
   * hintereinander greift, ist keine.
   *
   * Nötig ZUSÄTZLICH zu maxLegsPerDay, weil die Eskalationsleiter
   * (solver.ts 'doppelschlag'/'nightLeg') maxLegsPerDay auf 2 hebt: ohne
   * Törn-Deckel erlaubte die Stufe damit beliebig viele Doppelschlag-Tage,
   * und die Rangfolge belohnte sie (mehr Inseln vor dem Horizont). Gilt wie
   * maxLegsPerDay nur für den PLAN — Kapazitätsfragen (packLegsFeasible)
   * rechnen weiter mit dem, was das Schiff kann.
   */
  doppelschlagMaxPerTrip: z.number().int().min(0).default(1),

  /**
   * Wie viele Tage VORHER eine Option gemeldet wird, die zu verfallen droht.
   *
   * Eine Option, die heute schliesst, ist keine Entscheidung mehr, sondern eine
   * Mitteilung. Der Skipper will sie kommen sehen, solange er noch abbiegen
   * kann — vier Tage sind ungefähr die Spanne, über die eine Meltemi-Lage
   * einigermassen belastbar vorhersagbar ist.
   */
  decisionLookaheadDays: z.number().int().min(1).max(14).default(4),

  // --- place ampel (FR8) ----------------------------------------------------
  /** Unprotected ("Luv") direction: yellow up to this wind, red above. */
  openSectorMaxKn: z.number().positive().default(10),
  /**
   * OHNE WIRKUNG seit 2026-08-05: Wellen bewerten keinen Liegeplatz mehr
   * (domain/ampel.ts, Modulkopf). Das Feld bleibt, weil die gespeicherte
   * Konfiguration es mitbringt und ein unbekannter Schlüssel den Import
   * scheitern liesse — nicht, weil noch etwas darauf hört.
   */
  openSectorMaxWaveM: z.number().positive().default(0.5),

  // --- time windows (AD-9) --------------------------------------------------
  /** Default departure, Athens local hour (FR15 assumption 09:00). */
  departureHourAthens: z.number().int().min(0).max(23).default(9),
  /**
   * CROWD-STRATEGIE (Törnanalyse/Breezada 2026-08-05): "leave earlier and
   * arrive earlier" — um `zielAnkunftHourAthens` soll das Boot VOR ANKER
   * liegen (entspanntes Anlegen um 14:30 statt Drei-Versuche-Anlegen um 17:00
   * in Böen; der Meltemi hat sein Maximum 13–17 Uhr). Die App empfiehlt je
   * Etappentag die SPÄTESTE Abfahrt, deren simulierte Ankunft das Ziel noch
   * hält (domain/abfahrt.ts) — nie früher als `fruehesteAbfahrtHourAthens`.
   *
   * `fruehesteAbfahrtHourAthens` ist zugleich die Grenze der Nachtetappen-
   * Erkennung (scoring.ts): eine 06:00-Abfahrt ist gewollte Taktik im
   * Morgen-Windminimum, keine Nachtfahrt — erst davor beginnt die Nacht.
   */
  zielAnkunftHourAthens: z.number().int().min(0).max(23).default(15),
  fruehesteAbfahrtHourAthens: z.number().int().min(0).max(23).default(6),
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
   * buffer day. Not a limit — waiting out weather is legitimate.
   */
  harbourDays: z.number().int().min(0).default(1),
  /**
   * Zielmodell v2 — oberes Ende des HAFENTAGE-ZIELBANDS [harbourDays,
   * harbourDaysTargetMax]: "ein oder zwei Tage, an denen nicht gesegelt wird"
   * (Skipper 2026-08-05). Ein Optimierungsziel, keine Grenze: der Solver zieht
   * Pläne im Band vor (preferred), gültig sind auch andere — die Notgrenze
   * bleibt harbourDaysMax.
   */
  harbourDaysTargetMax: z.number().int().min(0).default(2),
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

  // --- Routen-Konzepte (Törnkonzept 2026-08-05) ------------------------------
  /**
   * DIE ZENTRALE, ALLES ÜBERSCHREIBENDE LOGIK der App (Skipper 2026-08-05):
   * geroutet wird nach einem von ZWEI Revier-Konzepten — Route 1 (Klassische
   * Kykladen-Runde, West & Zentral, Rückweg im Lee-Korridor) oder Route 2
   * (Ost-Kykladen, exponierte Ost-Ziele mit langem Am-Wind-Rückweg). Welches
   * Konzept die Wetterlage trägt, entscheiden diese Schwellen; die Regeln
   * selbst (Marker-Inseln, Korridor, Vorrang im Solver) stehen in
   * domain/konzept.ts.
   *
   * Route 2 ist nur bei moderatem Meltemi segelbar (Törnanalyse: 3–5 Bft;
   * bei anhaltend 6–7 Bft "für Charteryachten ungeeignet"). Oberhalb von
   * `konzeptOstMaxKn` über mindestens `konzeptOstDauerTage` aufeinander-
   * folgende Tage gilt das Ost-Konzept als ungeeignet.
   */
  konzeptOstMaxKn: z.number().positive().default(22),
  konzeptOstDauerTage: z.number().int().min(1).default(2),
  /**
   * Route 1 funktioniert bei 4–6 Bft und wird kritisch, "wenn ein stabiles
   * Starkwindfeld von 7 bis 8 Beaufort über mehr als drei aufeinanderfolgende
   * Tage anhält" (Törnanalyse). Oberhalb von `konzeptKlassikMaxKn` über
   * mindestens `konzeptKlassikDauerTage` Tage gilt auch das klassische
   * Konzept als ungeeignet — dann bleibt nur Abwettern in Abdeckung.
   */
  konzeptKlassikMaxKn: z.number().positive().default(28),
  konzeptKlassikDauerTage: z.number().int().min(1).default(3),
  /**
   * ENTSCHEIDUNGSTORE (Törnanalyse/Breezada 2026-08-05): an natürlichen
   * Knoten (Paros/Naxos; Syros für den Ost-Abzweig) steigt die Exposition,
   * sobald man sich DAHINTER festlegt. Regel: nur weiter vorstoßen mit einem
   * Forecast-Fenster von mindestens dieser Länge, das einen machbaren
   * Rückweg einschließt. Die Tore selbst stehen in domain/konzept.ts.
   */
  torFensterStunden: z.number().int().min(24).default(48),

  // --- Kite-Spots (Skipper-Wunsch 2026-08-06) --------------------------------
  /**
   * DAS KITE-BAND: zwischen diesen Windstärken ist ein Spot fahrbar.
   *
   * Ein Regler wie die Konzept-Schwellen, kein Urteil — und bewusst GLOBAL statt
   * je Spot: die kuratierten Spots liefern die Windrichtung (dafür braucht es
   * Ortskenntnis), die Stärke hängt am Material und am Können der Crew, und das
   * ist eine Eigenschaft dieses Törns, nicht des Strandes. 12 kn ist die
   * untere Kante für einen grossen Kite auf Flachwasser, 30 kn die Grenze, ab
   * der es für eine Familiencrew mit Beiboot-Sicherung nichts mehr zu holen
   * gibt.
   *
   * Keine Sicherheitsschwelle: Kite-Werte gehen in keine Ampel und in keinen
   * Plan ein (domain/kite.ts, Modulkopf).
   */
  kiteMinKn: z.number().positive().default(12),
  kiteMaxKn: z.number().positive().default(30),
  /**
   * Wie weit ein Spot von der gesegelten Linie entfernt sein darf, um noch als
   * "am Kurs" zu gelten. 5 sm ist der Radius, den ein Umweg von einer knappen
   * Stunde deckt — weiter weg ist kein Zwischenstopp mehr, sondern ein anderes
   * Tagesziel, und das gehört in die Etappenwahl, nicht in einen Hinweis.
   */
  kiteKorridorNm: z.number().positive().default(5),
  /**
   * DAS KITE-FENSTER in Athen-Zeit: die Stunden, in denen gekitet wird. Deckt
   * das Meltemi-Maximum (13–17 Uhr) und den ausklingenden Abendwind ab —
   * dieselbe Tageszeit, die die Crowd-Strategie meiden will, ist für den Kiter
   * genau die richtige. Bewertet wird mit der GÜNSTIGSTEN Stunde des Fensters,
   * nicht mit dem Worst Case: eine Session sucht man sich aus.
   */
  kiteFensterStartHourAthens: z.number().int().min(0).max(23).default(12),
  kiteFensterEndeHourAthens: z.number().int().min(1).max(24).default(19),

  // --- forecast horizon & worst case (AD-13) --------------------------------
  /**
   * Stages beyond this many days from the current day are computed on the
   * PERSISTENCE ASSUMPTION (domain/persistence.ts) and carry
   * `basis: 'annahme'`. The parameter is a marking threshold, not a gag:
   *   - such a stage blocks green (solver: `horizonDependent`), and
   *   - its violations warn but never condemn (`Violation.assumed`), so an
   *     extrapolated mean can neither certify nor red-flag a trip.
   * The return check still substitutes the worst case below — that is the
   * safety question, and an average has no business answering it.
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

  // Der Gästewechsel (FR31) stand bis 2026-08-06 hier: `pickupDate` und
  // `pickupLatestArrivalHourAthens` steuerten eine harte Gültigkeitsbedingung.
  // Beide sind mit der Bedingung entfallen und bewusst NICHT als wirkungslose
  // Konfiguration stehengeblieben — ein Feld, das man einstellen kann und das
  // nichts tut, ist schlimmer als keines. Ein Config-Dokument, das die Schlüssel
  // noch trägt, bleibt gültig: das Schema ist nicht strikt und streift sie ab.

  // --- night legs (FR16) --------------------------------------------------------
  /** Night leg only below this TWS, over the WHOLE leg duration. */
  nightLegMaxTwsKn: z.number().positive().default(10),
  /** At most this many night legs per trip. */
  nightLegMaxPerTrip: z.number().int().min(0).default(2),
  /** Night legs only from this trip day on (second week). */
  nightLegEarliestDay: z.number().int().positive().default(8),

  // --- Wegstunden-Zielband (Zielmodell v2) -----------------------------------
  /**
   * "Möglichst zwischen fünf und sieben Wegestunden am Tag" (Skipper
   * 2026-08-05): das OPTIMIERUNGSBAND für die Stunden unter Weg eines
   * Etappentages. Zu kurze Tage sind genauso eine Abweichung wie zu lange —
   * ein 2-h-Tag verschenkt das Fenster, ein 9-h-Tag überzieht es.
   *
   * Unabhängig von den FR16-SICHERHEITSbudgets (targetDayHours/maxSailHours):
   * die entscheiden über grün/gelb/rot, das Band nur über die Rangfolge
   * gültiger Pläne (preferred). Es kann keinem Tag eine Ampel verpassen.
   */
  stageHoursBandMinH: z.number().min(0).default(5),
  stageHoursBandMaxH: z.number().positive().default(7),

  // (alternativesMax entfiel mit der Verschmelzung von Optionsraum und
  //  Alternativ-Routen: je Option ihr Plan, dedupliziert — kein eigener
  //  Suchraum mehr, der zu kappen wäre. Persistierte Werte werden von zod
  //  weiterhin klaglos verworfen.)

  // --- position derivation ----------------------------------------------------
  /**
   * Maximum distance (nm) between a position fix and the nearest library
   * place for the fix to be snapped to that place's island. Beyond this the
   * position counts as "outside the cruising area" (no island, visible reason)
   * instead of silently snapping to the closest island.
   */
  maxSnapNm: z.number().positive().default(30),

  // --- day range (context filter for target islands) -------------------------
  /**
   * Furthest island offered as a DAY target when the wind is aft or on the
   * beam: the skipper's best case of "8 h plus a night trip". Values from the
   * skipper's brief — a pre-filter for the target dropdown, deliberately NOT
   * derived from the polar: the leg simulation still judges the actual leg.
   */
  maxDayRangeNm: z.number().positive().default(100),
  /** Same limit when the destination lies upwind (beating halves the range). */
  maxDayRangeUpwindNm: z.number().positive().default(50),

  // --- display ------------------------------------------------------------------
  /** Nights ahead of the current day assessed for display (AD-8: config, not code). */
  nightLookaheadDays: z.number().int().positive().default(10),

  // --- forecast (FR11) — NAHFELD/FERNFELD-HYBRID ------------------------------
  /**
   * FERNFELD-Windmodell: es besitzt die Stundenachse und damit den Horizont.
   * Behält Id UND Bedeutung, damit bestehende Config-Dokumente unverändert
   * weitergelten. Die gültigen Ids stehen in schema/models.ts.
   */
  forecastModel: z.string().default('ecmwf_ifs025'),
  /**
   * NAHFELD-Windmodell — hochauflösend, kurzer Horizont. Es liefert die
   * Stunden, die es abdeckt; danach übernimmt `forecastModel`.
   *
   * LEERSTRING = Hybrid aus; dann verhält sich die App exakt wie vor der
   * Umstellung. Kein `null`, weil sich im Firestore-Editor ein Leerstring
   * leichter tippt und der Typ `string` bleibt. Zwei GLEICHE Modelle sind NICHT
   * der Aus-Schalter — das wären zwei identische HTTP-Abrufe und wird unten
   * abgelehnt.
   *
   * Default ICON-EU: 7 km statt 25 km über den Kykladen-Kanälen, wo ein globales
   * Gitter die Düsen glattbügelt. Das griechische Poseidon-Modell (HCMR) wäre
   * feiner, ist aber nicht anbindbar — siehe Modulkopf schema/models.ts.
   */
  forecastModelNear: z.string().default('dwd_icon_eu'),
  /**
   * FERNFELD-Wellenmodell. `best_match` ist genau das, was die Marine-API
   * bisher OHNE `models=`-Parameter geliefert hat — die stille Wahl wird nur
   * explizit gemacht, das Verhalten bleibt gleich.
   */
  waveModel: z.string().default('best_match'),
  /** NAHFELD-Wellenmodell; Leerstring = aus. */
  waveModelNear: z.string().default('ewam'),
  forecastDays: z.number().int().min(1).max(16).default(10),
});

/**
 * Prüft ein Modell-Feld — aber NUR, wenn die Id in der Registry BEKANNT ist.
 *
 * Warum diese Grenze: eine unbekannte Id darf das Schema NICHT scheitern lassen.
 * `parseTolerant` (adapters/firestore.ts) verwirft bei einem Schemafehler das
 * GANZE Parameter-Dokument und fällt auf DEFAULT_PARAMS zurück — ein Tippfehler
 * in einer Modell-Id würde also stumm die gesamte Abstimmung wegwerfen
 * (Meltemi-Schwellen, Stichtag, Budgets). Dazu driftet der Katalog eines fremden
 * Anbieters: `icon_eu` hiess einmal so und heisst heute `dwd_icon_eu`. Eine
 * Allowlist im Schema würde bedeuten: Open-Meteo benennt ein Modell um, und die
 * nächste Config-Bearbeitung verwirft die Abstimmung.
 *
 * Unbekannte Ids fängt darum der ADAPTER ab (adapters/openMeteo.ts) — dort ist
 * der Fehler eingegrenzt, im Fehlerpanel sichtbar und benennt die Id, während
 * alle anderen Parameter weiterwirken.
 *
 * Was hier geprüft wird, kann NICHT driften, weil es die Id als bekannt
 * voraussetzt: ein Wellenmodell im Wind-Feld, ein Modell ohne Ägäis-Abdeckung,
 * ein vertauschtes Nah/Fern-Paar.
 */
function knownModelIssue(
  field: string,
  id: string,
  want: ForecastKind,
): string | null {
  const info = forecastModelInfo(id);
  if (!info) return null; // unbekannt -> Sache des Adapters, siehe oben
  if (info.kind !== want) {
    const other = want === 'wind' ? 'waveModel' : 'forecastModel';
    return `${field}: '${id}' ist ein ${info.kind === 'wave' ? 'Wellen' : 'Wind'}modell und gehört nach ${other}`;
  }
  if (!info.coversAegean) {
    return `${field}: '${id}' deckt das Revier nicht ab — ${info.coverageNote}`;
  }
  return null;
}

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
  if (p.maxDayRangeUpwindNm > p.maxDayRangeNm) {
    ctx.issues.push({
      code: 'custom',
      message:
        'maxDayRangeUpwindNm darf maxDayRangeNm nicht überschreiten (gegenan ist nie weiter als raumschots)',
      input: p,
    });
  }
  if (p.beatTwaDeg > p.upwindTwaDeg) {
    ctx.issues.push({
      code: 'custom',
      message:
        'beatTwaDeg darf upwindTwaDeg nicht überschreiten — ein Kurs, der gekreuzt werden muss, muss auch als "gegenan" gelten',
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
  if (p.stageHoursBandMinH > p.stageHoursBandMaxH) {
    ctx.issues.push({
      code: 'custom',
      message: 'stageHoursBandMinH darf stageHoursBandMaxH nicht überschreiten',
      input: p,
    });
  }
  if (p.harbourDays > p.harbourDaysTargetMax || p.harbourDaysTargetMax > p.harbourDaysMax) {
    ctx.issues.push({
      code: 'custom',
      message:
        'Hafentage-Zielband: harbourDays ≤ harbourDaysTargetMax ≤ harbourDaysMax muss gelten',
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
  if (p.fruehesteAbfahrtHourAthens >= p.zielAnkunftHourAthens) {
    ctx.issues.push({
      code: 'custom',
      message:
        'fruehesteAbfahrtHourAthens muss vor zielAnkunftHourAthens liegen — sonst gibt es kein Abfahrtsfenster',
      input: p,
    });
  }
  if (p.kiteMinKn >= p.kiteMaxKn) {
    ctx.issues.push({
      code: 'custom',
      message: 'kiteMinKn muss unter kiteMaxKn liegen — sonst ist das Kite-Band leer',
      input: p,
    });
  }
  if (p.kiteFensterStartHourAthens >= p.kiteFensterEndeHourAthens) {
    ctx.issues.push({
      code: 'custom',
      message:
        'kiteFensterStartHourAthens muss vor kiteFensterEndeHourAthens liegen — sonst gibt es kein Kite-Fenster (es endet am selben Tag, kein Wrap über Mitternacht)',
      input: p,
    });
  }
  if (p.konzeptOstMaxKn > p.konzeptKlassikMaxKn) {
    ctx.issues.push({
      code: 'custom',
      message:
        'konzeptOstMaxKn darf konzeptKlassikMaxKn nicht überschreiten — das Ost-Konzept ist das exponiertere und kippt zuerst',
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
  // --- Forecast-Modelle (Nahfeld/Fernfeld) ---------------------------------
  // Nur BEKANNTE Ids werden geprüft; unbekannte fängt der Adapter sichtbar ab
  // (Begründung im Kommentar von knownModelIssue).
  for (const [field, id, kind] of [
    ['forecastModel', p.forecastModel, 'wind'],
    ['forecastModelNear', p.forecastModelNear, 'wind'],
    ['waveModel', p.waveModel, 'wave'],
    ['waveModelNear', p.waveModelNear, 'wave'],
  ] as const) {
    if (id === '') continue; // Leerstring = Hybrid aus; nur bei den Nah-Feldern sinnvoll
    const msg = knownModelIssue(field, id, kind);
    if (msg) ctx.issues.push({ code: 'custom', message: msg, input: p });
  }
  // Ein Fernfeld MUSS gesetzt sein — es besitzt die Achse.
  for (const [field, id] of [
    ['forecastModel', p.forecastModel],
    ['waveModel', p.waveModel],
  ] as const) {
    if (id === '') {
      ctx.issues.push({
        code: 'custom',
        message: `${field} darf nicht leer sein — das Fernfeld trägt die Stundenachse und den Horizont`,
        input: p,
      });
    }
  }
  // Zwei gleiche Modelle sind nicht der Aus-Schalter, sondern zwei identische
  // HTTP-Abrufe. Der Aus-Schalter ist der Leerstring — das sagt die Meldung, weil
  // sie an der Stelle gelesen wird, an der jemand es falsch macht.
  for (const [nearField, near, farField, far] of [
    ['forecastModelNear', p.forecastModelNear, 'forecastModel', p.forecastModel],
    ['waveModelNear', p.waveModelNear, 'waveModel', p.waveModel],
  ] as const) {
    if (near !== '' && near === far) {
      ctx.issues.push({
        code: 'custom',
        message: `${nearField} ist identisch mit ${farField} — der Hybrid wird mit ${nearField}: "" abgeschaltet, nicht durch zwei gleiche Modelle (das wären zwei identische Abrufe)`,
        input: p,
      });
    }
    if (near === '') continue;
    const nearInfo = forecastModelInfo(near);
    const farInfo = forecastModelInfo(far);
    // Vertauschtes Paar — sonst unsichtbar: das Fernfeld käme nie zum Tragen.
    if (nearInfo && farInfo && nearInfo.horizonHours > farInfo.horizonHours) {
      ctx.issues.push({
        code: 'custom',
        message: `${nearField} ('${near}', ${nearInfo.horizonHours} h) reicht weiter als ${farField} ('${far}', ${farInfo.horizonHours} h) — dann ist es kein Nahfeld, und das Fernfeld käme nie zum Tragen (Werte vermutlich vertauscht)`,
        input: p,
      });
    }
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
