/**
 * FR15-FR17 / FR26 — leg scoring.
 * A leg on trip day N is assessed against the forecast of EXACTLY ITS FUTURE
 * time window (legWindow(N)), never today's wind. Duration comes from the
 * polar (+ offset, applied only in polar.ts); a leg is assessed against
 * start, destination AND waypoint values — the leg ampel is the WORST point.
 *
 * This module owns the single duration/feasibility notion; options.ts and
 * ppr.ts consume the same function (AD-3).
 */

import type { Leg } from './schema/route.ts';
import type { Params } from './schema/params.ts';
import type {
  DataBasis,
  PlanningSnapshot,
  LegAssessment,
  LegHourBreakdown,
  PointForecast,
  PointPassage,
} from './schema/snapshot.ts';
import { worstAmpel, type Ampel } from './schema/common.ts';
import type { Coordinates } from './schema/common.ts';
import { bearingDeg, distanceNm, twaDeg } from './geo.ts';
import { fallbackSpeedKn, motorSpeedKn, sailSpeedKn } from './polar.ts';
import { hourIndexAt, legWindow, MAX_LEG_HOURS } from './time.ts';

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * FR16 day budgets. Target: max ~6 h under way (5 h sail + 1 h motor or
 * 6 h pure sailing) => green. Hard maximum 6 h sail + 2 h motor => yellow
 * band between target and hard max. Light wind (<= ~6 kn): 10-12 h passages
 * (incl. night legs) stay yellow instead of red.
 */
export function budgetVerdict(
  sailHours: number,
  motorHours: number,
  avgTwsKn: number | null,
  params: Params,
): { ampel: Ampel; reasons: string[] } {
  const total = sailHours + motorHours;
  if (total <= params.targetDayHours && motorHours <= params.targetMotorHours) {
    return { ampel: 'gruen', reasons: [] };
  }
  if (sailHours <= params.maxSailHours && motorHours <= params.maxMotorHours) {
    return {
      ampel: 'gelb',
      reasons: ['Über Ziel-Budget, aber innerhalb des harten Maximums'],
    };
  }
  if (
    avgTwsKn !== null &&
    avgTwsKn <= params.lightWindMaxTwsKn &&
    total <= params.lightWindMaxHours
  ) {
    return {
      ampel: 'gelb',
      reasons: ['Langer Schlag, aber Leichtwind-Ausnahme (glattes Wasser)'],
    };
  }
  return { ampel: 'rot', reasons: ['Hartes Tagesbudget überschritten'] };
}

/**
 * FR16 wind rule for one hour at one point: no beating upwind above 25 kn
 * true wind; yellow inside the reserve band below the threshold.
 */
export function upwindWindVerdict(
  twa: number,
  twsKn: number,
  params: Params,
): Ampel {
  if (twa < params.upwindTwaDeg) {
    if (twsKn > params.maxUpwindTwsKn) return 'rot';
    if (twsKn > params.maxUpwindTwsKn - params.gelbReserveKn) return 'gelb';
  }
  return 'gruen';
}

interface LegPoint {
  key: string;
  coordinates: Coordinates;
}

/** Normative forecast key for the nth waypoint of a leg (AD-3). */
export function legWaypointKey(legId: string, n: number): string {
  return `leg:${legId}:${n}`;
}

/**
 * Liegezeit an einem Zwischenstopp des Tages — die EINE Quelle dieses Wertes.
 *
 * Vier Stellen verketten die Etappen eines Tages (assess, solver ×2, ppr); sie
 * müssen alle dieselbe Liegezeit einsetzen, sonst bewertet der Solver einen
 * anderen Tag als die Anzeige.
 */
export function stopHoursForDay(snapshot: PlanningSnapshot, day: number): number {
  return snapshot.trip.stopHoursByDay[day] ?? snapshot.params.stopHoursDefault;
}

/**
 * Wählbare Abfahrtsstunden (Athen). Das Standardfenster gilt an jedem Törntag;
 * am ERSTEN Tag kommt das Übernahme-Fenster 14–17 Uhr dazu: die Boots-Übergabe
 * an der Basis liegt am Nachmittag, eine Vormittags-Abfahrt gibt es an Tag 1
 * gar nicht. NUR dort — an jedem anderen Tag würde eine Nachmittags-Abfahrt
 * die Etappe in den aufgebauten Nachmittags-Meltemi und in die Nacht schieben.
 */
export const DEPARTURE_HOURS_ATHENS = [6, 7, 8, 9, 10, 11, 12] as const;
export const FIRST_DAY_DEPARTURE_HOURS_ATHENS = [14, 15, 16, 17] as const;

/** Die Abfahrtsstunden, die ein Törntag zur Wahl stellt (UI-Liste). */
export function departureHourChoices(day: number): number[] {
  return day === 1
    ? [...DEPARTURE_HOURS_ATHENS, ...FIRST_DAY_DEPARTURE_HOURS_ATHENS]
    : [...DEPARTURE_HOURS_ATHENS];
}

/** Später als das Standardfenster — nur an Törntag 1 zulässig. */
export function isLateDeparture(hourAthens: number): boolean {
  return hourAthens > DEPARTURE_HOURS_ATHENS[DEPARTURE_HOURS_ATHENS.length - 1]!;
}

/**
 * Wirksame Abfahrtsstunde eines Törntags — die EINE Quelle (AD-2/AD-3):
 * Anzeige (DayView) und Rechnung (assessLeg) lesen denselben Wert.
 *
 * Der Override ist die HEUTIGE Entscheidung (AD-11) und verschiebt nie die
 * simulierte Abfahrt zukünftiger Törntage. Eine späte Abfahrt aus dem
 * Übernahme-Fenster gilt zusätzlich NUR an Törntag 1 — an jedem anderen Tag
 * fällt sie auf den Standard zurück, statt den Tag in die Nacht zu rechnen.
 */
export function departureHourForDay(snapshot: PlanningSnapshot, day: number): number {
  const override =
    day === snapshot.trip.currentDay ? snapshot.trip.departureHourOverride : null;
  if (override === null) return snapshot.params.departureHourAthens;
  if (isLateDeparture(override) && day !== 1) return snapshot.params.departureHourAthens;
  return override;
}

function legPoints(leg: Leg, snapshot: PlanningSnapshot): LegPoint[] | null {
  const from = snapshot.library.places.find((p) => p.id === leg.fromPlaceId);
  const to = snapshot.library.places.find((p) => p.id === leg.toPlaceId);
  if (!from || !to) return null;
  return [
    { key: from.id, coordinates: from.coordinates },
    // Derived legs (e.g. reversed connectors) carry the forecast keys of
    // their ORIGINAL stored leg via waypointKeys — only those were fetched.
    ...leg.waypoints.map((w, n) => ({
      key: leg.waypointKeys?.[n] ?? legWaypointKey(leg.id, n),
      coordinates: w,
    })),
    { key: to.id, coordinates: to.coordinates },
  ];
}

function windAt(
  fc: PointForecast | undefined,
  hourIdx: number,
): { twsKn: number; fromDeg: number } | null {
  const tws = fc?.windKn[hourIdx] ?? null;
  const dir = fc?.windDirDeg[hourIdx] ?? null;
  if (tws === null || dir === null) return null;
  return { twsKn: tws, fromDeg: dir };
}

/**
 * AD-13 — the Meltemi worst case as a wind value: the direction WITHIN the
 * configured sector that is worst for the given course, i.e. the one producing
 * the smallest true wind angle (most on the nose).
 *
 * Taking the sector's midpoint instead would not be a worst case at all: for a
 * course of 310° a northerly from 000° stands dead on the nose and blocks the
 * leg, while the midpoint of the 0–45° sector (022°) comes in at 72° TWA and
 * reads as comfortably sailable. The return check would then clear a passage
 * the real Meltemi makes impossible — the opposite of a safety margin.
 *
 * `meltemiWorstCase.waveM` is deliberately NOT used here: assessLeg judges wind
 * only; wave limits belong to the place ampel (domain/ampel.ts).
 */
function worstCaseWind(
  params: Params,
  courseDeg: number,
): { twsKn: number; fromDeg: number } {
  const { twsKn, fromDeg, toDeg } = params.meltemiWorstCase;
  const span = (toDeg - fromDeg + 360) % 360;
  // Degenerate sector (from === to): that single bearing is the scenario.
  if (span === 0) return { twsKn, fromDeg: fromDeg % 360 };
  // If sailing straight into the sector is possible, dead upwind is the worst.
  const offsetToCourse = (courseDeg - fromDeg + 360) % 360;
  if (offsetToCourse <= span) return { twsKn, fromDeg: courseDeg };
  // Otherwise the sector edge that sits closest to the nose governs.
  return {
    twsKn,
    fromDeg: twaDeg(courseDeg, fromDeg) <= twaDeg(courseDeg, toDeg) ? fromDeg : toDeg,
  };
}

/**
 * How a leg is assessed relative to the forecast horizon (AD-13).
 * - `forecast` (default): days beyond params.reliableHorizonDays are
 *   'unbewertet' — they count NEITHER for nor against plan validity (FR18).
 * - `worstCase`: hours beyond the horizon fall back to the Meltemi worst
 *   case instead. This binds EXACTLY ONE calculation — the return check
 *   (validity condition 2'), which is also the PoR calculation.
 */
export type LegScenario = 'forecast' | 'worstCase';

/**
 * Memo für {@link assessLeg} über BIBLIOTHEKS-Etappen, je Snapshot-Objekt.
 *
 * Der Solver bewertet dieselbe (Etappe, Tag)-Kombination hundertfach: einmal
 * je Kandidat, je Eskalationsstufe, je Options-Scan. Die Simulation ist pur
 * und hängt nur von (leg.id, Tag, Abfahrts-Offset, Szenario) und dem Snapshot
 * ab — beim Snapshot zählt die OBJEKTIDENTITÄT, weil relaxierte Params ein
 * eigenes Objekt bekommen (solver.relaxedSnapshot) und damit einen eigenen
 * Cache.
 *
 * NUR für Etappen aus dem Bibliotheks-Index (eindeutige Id, auch die
 * Gegenrichtungen): die GESEGELTEN Ketten aus legGeometry.ts tragen dieselbe
 * Id mit anderer Verankerung und dürfen hier nicht landen — die Anzeige- und
 * Gültigkeitspfade mit sailedLegs rufen weiterhin assessLeg direkt.
 */
const assessMemo = new WeakMap<PlanningSnapshot, Map<string, LegAssessment>>();

export function assessLegCached(
  leg: Leg,
  day: number,
  snapshot: PlanningSnapshot,
  opts: { departureOffsetHours?: number; scenario?: LegScenario } = {},
): LegAssessment {
  let byKey = assessMemo.get(snapshot);
  if (!byKey) {
    byKey = new Map();
    assessMemo.set(snapshot, byKey);
  }
  const key = `${leg.id}|${day}|${opts.departureOffsetHours ?? 0}|${opts.scenario ?? 'forecast'}`;
  const cached = byKey.get(key);
  if (cached) return cached;
  const a = assessLeg(leg, day, snapshot, opts);
  byKey.set(key, a);
  return a;
}

/**
 * Assess one leg for trip day N: hour-by-hour simulation from the departure
 * time. Speed is taken from the polar (+ offset) at the current progress
 * point; the FR16 wind rule is checked each hour at EVERY leg point (worst
 * point governs). Hours beyond the horizon (null) => 'unbewertet'.
 *
 * `opts.departureOffsetHours` shifts the departure past the day's normal
 * departure time — used for the SECOND leg of a double-leg day, which starts
 * at the real arrival time of the first leg, not at 09:00 again.
 */
export function assessLeg(
  leg: Leg,
  day: number,
  snapshot: PlanningSnapshot,
  opts: { departureOffsetHours?: number; scenario?: LegScenario } = {},
): LegAssessment {
  const { params, polar } = snapshot;
  const scenario: LegScenario = opts.scenario ?? 'forecast';
  const points = legPoints(leg, snapshot);
  const unbewertet = (reason: string): LegAssessment => ({
    legId: leg.id,
    sailedLeg: leg,
    day,
    ampel: 'unbewertet',
    sailHours: null,
    motorHours: null,
    totalHours: null,
    avgTwsKn: null,
    avgTwaDeg: null,
    avgTwdDeg: null,
    avgSpeedKn: null,
    upwind: false,
    basis: 'forecast',
    reasons: [reason],
    nightLeg: null,
    arrivalHourAthens: null,
    breakdown: [],
    pointPassages: [],
  });
  if (!points) return unbewertet('Start- oder Zielplatz fehlt in der Bibliothek');

  /**
   * AD-13 REVISED — the far range is COMPUTED, not silenced.
   *
   * The original rule returned 'unbewertet' beyond params.reliableHorizonDays,
   * because a forecast-based verdict out there would be false precision. That
   * reasoning holds for an UNMARKED number; it does not hold for one that
   * declares itself. A silent gap does not reduce the uncertainty, it only
   * hides it — and it leaves the skipper without anything to weigh his own
   * judgement against for the whole second week of a 12-day trip.
   *
   * So the horizon keeps its meaning but changes its consequence: beyond it
   * the leg is simulated on the persistence assumption (domain/persistence.ts)
   * and the result carries `basis: 'annahme'`. Every layer above can see that
   * and says so; green stays out of reach for a plan that rests on it
   * (solver.ts keeps `horizonDependent`).
   *
   * Unchanged: the return check still substitutes the Meltemi worst case via
   * `scenario: 'worstCase'`. That is the safety question, and a mean-value
   * assumption has no business answering it.
   */
  const beyondHorizon =
    day - snapshot.trip.currentDay > params.reliableHorizonDays;
  /** Hours whose wind came from the assumption instead of the model run. */
  let assumedHours = 0;
  /**
   * The worst case substitutes wherever the forecast must not be trusted:
   * beyond the reliable horizon (even though Open-Meteo still returns numbers
   * out to 10–16 days) AND wherever values are missing. Binding it to missing
   * values alone would let 8-to-16-day forecast noise pass the return check —
   * exactly the false precision AD-13 rules out. The substitute depends on the
   * segment's course, so it is resolved inside the hourly loop below.
   */
  const substitutes = (w: { twsKn: number; fromDeg: number } | null): boolean =>
    scenario === 'worstCase' && (beyondHorizon || !w);

  // Segment geometry, scaled so the (curated) total distance is authoritative.
  const segGeo: { fromIdx: number; toIdx: number; nm: number; course: number }[] = [];
  let geoTotal = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const nm = distanceNm(points[i]!.coordinates, points[i + 1]!.coordinates);
    geoTotal += nm;
    segGeo.push({
      fromIdx: i,
      toIdx: i + 1,
      nm,
      course: bearingDeg(points[i]!.coordinates, points[i + 1]!.coordinates),
    });
  }
  const scale = geoTotal > 0 ? leg.distanceNm / geoTotal : 1;
  const segments = segGeo.map((s) => ({ ...s, nm: s.nm * scale }));

  // AD-11 / snapshot.ts: the departure override is TODAY's decision — it
  // must not shift the simulated departure of future trip days; späte
  // Abfahrten (Übernahme-Fenster) bindet departureHourForDay an Törntag 1.
  const departureHour = departureHourForDay(snapshot, day);
  const window = legWindow(params.tripStartDate, day, departureHour);
  const departureMs =
    window.startMs + (opts.departureOffsetHours ?? 0) * 3600_000;
  const startIdx = hourIndexAt(departureMs, snapshot.times);
  if (startIdx === null) return unbewertet('Abfahrtszeit außerhalb der Forecast-Achse');

  const verdicts: Ampel[] = [];
  const reasons = new Set<string>();
  const breakdown: LegHourBreakdown[] = [];
  // Kilometrierung der Punkte: cumNm[i] = Distanz ab Etappenstart bis Punkt i.
  const cumNm: number[] = [0];
  for (const s of segments) cumNm.push(cumNm[cumNm.length - 1]! + s.nm);
  const passages: PointPassage[] = [
    // Der Startpunkt wird nicht angefahren, sondern verlassen — seine Zeit ist
    // die Abfahrtszeit, sein Abschnitt existiert nicht.
    {
      pointKey: points[0]!.key,
      distanceNm: 0,
      etaIso: new Date(departureMs).toISOString(),
      segment: null,
    },
  ];
  /** Nächster noch nicht passierter Punkt (0 ist der Start). */
  let nextPointIdx = 1;
  let traveled = 0;
  let sailHours = 0;
  let motorHours = 0;
  let twsSum = 0;
  let twaSum = 0;
  // Richtungen werden als Einheitsvektoren summiert (Zirkulärmittel): der
  // arithmetische Mittelwert von 350° und 10° wäre 180° — die exakte
  // Gegenrichtung des tatsächlichen Windes.
  let twdSinSum = 0;
  let twdCosSum = 0;
  let samples = 0;
  const total = leg.distanceNm;
  // Single source for the simulation bound: time.ts (legWindow uses it too).
  const maxHours = MAX_LEG_HOURS;

  for (let h = 0; traveled < total && h < maxHours; h++) {
    const idx = startIdx + h;
    if (idx >= snapshot.times.length) {
      // Off the hour axis entirely: only the worst-case scenario can still
      // answer — the forecast scenario has nothing left to say.
      if (scenario !== 'worstCase')
        return unbewertet('Etappe reicht über den Forecast-Horizont hinaus');
    }

    // Current segment by progress.
    let acc = 0;
    let seg = segments[segments.length - 1]!;
    for (const s of segments) {
      acc += s.nm;
      if (traveled < acc) {
        seg = s;
        break;
      }
    }
    const progressPointIdx =
      traveled / total < (acc - seg.nm / 2) / total ? seg.fromIdx : seg.toIdx;
    // Worst case for THIS segment's course (most on the nose within the sector).
    const wc = worstCaseWind(params, seg.course);
    const rawProgressWind = windAt(
      snapshot.forecast[points[progressPointIdx]!.key],
      idx,
    );
    const usedWorstCase = substitutes(rawProgressWind);
    const progressWind = usedWorstCase ? wc : rawProgressWind;
    if (!progressWind)
      return unbewertet('Forecast-Stunden fehlen im Etappenfenster (Horizont)');
    if (usedWorstCase) {
      reasons.add(
        `Fernbereich gegen Meltemi-Worst-Case gerechnet (${wc.twsKn} kn aus ${Math.round(wc.fromDeg)}°)`,
      );
    }

    // FR16 rule at EVERY point this hour — worst point governs.
    for (const p of points) {
      const fc = snapshot.forecast[p.key];
      // One assumed hour at ONE point is enough to mark the whole leg: the
      // ampel is the worst point, so the basis must be the weakest basis.
      if (fc?.windAssumed[idx]) assumedHours++;
      const raw = windAt(fc, idx);
      const w = substitutes(raw) ? wc : raw;
      if (!w) {
        verdicts.push('unbewertet');
        reasons.add('Forecast an einem Wegpunkt unvollständig (Horizont)');
        continue;
      }
      const t = twaDeg(seg.course, w.fromDeg);
      const v = upwindWindVerdict(t, w.twsKn, params);
      verdicts.push(v);
      if (v === 'rot') reasons.add('Aufkreuzen gegenan bei >25 kn wahrem Wind');
      if (v === 'gelb') reasons.add('Wind nahe der Aufkreuz-Schwelle');
    }

    const twa = twaDeg(seg.course, progressWind.fromDeg);
    twsSum += progressWind.twsKn;
    twaSum += twa;
    twdSinSum += Math.sin(rad(progressWind.fromDeg));
    twdCosSum += Math.cos(rad(progressWind.fromDeg));
    samples++;

    // Speed model: polar (+offset, only in polar.ts) with upwind VMG folding;
    // motor when sailing would be slower than minSailSpeedKn.
    let speed: number;
    let motoring: boolean;
    if (polar) {
      const sail =
        twa >= params.beatTwaDeg
          ? sailSpeedKn(polar, twa, progressWind.twsKn, params)
          : sailSpeedKn(polar, params.beatTwaDeg, progressWind.twsKn, params) *
            Math.cos(rad(params.beatTwaDeg - twa));
      motoring = sail < params.minSailSpeedKn;
      speed = motoring ? motorSpeedKn(params) : sail;
    } else {
      const upwind = twa < params.upwindTwaDeg;
      motoring = progressWind.twsKn <= params.lightWindMaxTwsKn;
      speed = fallbackSpeedKn(upwind, motoring, params);
    }
    if (speed <= 0) {
      motoring = true;
      speed = motorSpeedKn(params);
    }

    const remaining = total - traveled;
    const hourFraction = Math.min(1, remaining / speed);
    const travelBefore = traveled;
    const elapsedBefore = sailHours + motorHours;
    traveled += speed * hourFraction;
    if (motoring) motorHours += hourFraction;
    else sailHours += hourFraction;

    // FR30: record what this hour contributed, so the day card can explain
    // the total instead of asking the skipper to trust it.
    breakdown.push({
      timeIso: snapshot.times[idx] ?? `+${h}h`,
      courseDeg: seg.course,
      twdDeg: progressWind.fromDeg,
      twsKn: progressWind.twsKn,
      twaDeg: twa,
      speedKn: speed,
      motoring,
      distanceNm: speed * hourFraction,
      worstCase: usedWorstCase,
    });

    // FR30 — Durchfahrten: jeder Punkt, dessen Kilometrierung in DIESER Stunde
    // überfahren wurde, bekommt seine Zeit. Die Zeit wird innerhalb der Stunde
    // linear interpoliert (konstanter Speed über die Stunde ist genau die
    // Annahme, mit der auch `traveled` fortgeschrieben wird — keine zweite,
    // abweichende Modellannahme).
    while (
      nextPointIdx < points.length &&
      cumNm[nextPointIdx]! <= traveled + 1e-9
    ) {
      const dist = cumNm[nextPointIdx]!;
      const hoursIntoStep = speed > 0 ? (dist - travelBefore) / speed : 0;
      passages.push({
        pointKey: points[nextPointIdx]!.key,
        distanceNm: dist,
        etaIso: new Date(
          departureMs + (elapsedBefore + hoursIntoStep) * 3600_000,
        ).toISOString(),
        segment: {
          courseDeg: segments[nextPointIdx - 1]?.course ?? seg.course,
          distanceNm: segments[nextPointIdx - 1]?.nm ?? 0,
          twdDeg: progressWind.fromDeg,
          twsKn: progressWind.twsKn,
          twaDeg: twa,
          speedKn: speed,
          motoring,
          worstCase: usedWorstCase,
        },
      });
      nextPointIdx += 1;
    }
  }

  if (traveled < total) {
    verdicts.push('rot');
    reasons.add('Etappe in 24 h nicht zu schaffen');
  }

  // Nicht erreichte Punkte kommen MIT in die Liste, aber ohne Zeit: eine Etappe,
  // die im Fenster nicht fertig wird, darf keine Durchfahrtszeiten behaupten —
  // und die Punkte stillschweigend weglassen würde die Karte verstümmeln.
  for (; nextPointIdx < points.length; nextPointIdx++) {
    passages.push({
      pointKey: points[nextPointIdx]!.key,
      distanceNm: cumNm[nextPointIdx]!,
      etaIso: null,
      segment: null,
    });
  }

  // FR16 night leg: the passage reaches past the night-window start or
  // departs before the earliest normal departure, i.e. it sails in darkness.
  // Athens hours from midnight of the departure day; an arrival past 24 is
  // the next morning and therefore always a night leg.
  //
  // Die UNTERE Grenze ist bewusst `fruehesteAbfahrtHourAthens` (06:00), nicht
  // das Ende des Nachtfensters (09:00): das Nachtfenster bewertet LIEGEPLÄTZE
  // (FR8, die Familie schläft bis 9), aber eine 06:00-Abfahrt ist die
  // empfohlene Crowd-/Meltemi-Taktik (früh los, 15:00 vor Anker) und darf
  // nicht als Nachtetappe in die FR16-Quote fallen — sonst bestrafte die
  // Gültigkeit genau das Verhalten, das die App selbst vorschlägt.
  const departureAthens = departureHour + (opts.departureOffsetHours ?? 0);
  const arrivalAthens = departureAthens + sailHours + motorHours;
  const nightLeg =
    arrivalAthens > params.nightStartHourAthens ||
    departureAthens < params.fruehesteAbfahrtHourAthens;

  const avgTwsKn = samples > 0 ? twsSum / samples : null;
  const avgTwaDeg = samples > 0 ? twaSum / samples : null;
  /**
   * Zirkulärmittel der Windrichtung. Ist der resultierende Vektor nahe null,
   * heben sich die Richtungen auf (Dreher über die ganze Etappe) — dann gibt
   * es keine mittlere Richtung, und atan2(0,0) = 0 würde fälschlich "Nord"
   * behaupten. In dem Fall bleibt der Wert null; die Stundenzeilen zeigen die
   * echten Richtungen weiterhin einzeln.
   */
  const twdVectorLen =
    samples > 0 ? Math.hypot(twdSinSum, twdCosSum) / samples : 0;
  const avgTwdDeg =
    samples > 0 && twdVectorLen >= 0.1
      ? (((Math.atan2(twdSinSum, twdCosSum) * 180) / Math.PI) + 360) % 360
      : null;
  const budget = budgetVerdict(sailHours, motorHours, avgTwsKn, params);
  budget.reasons.forEach((r) => reasons.add(r));
  verdicts.push(budget.ampel);

  /**
   * 'annahme' covers BOTH ways the basis can be weaker than a model run:
   * extrapolated hours, and hours the model does deliver but beyond the
   * reliable horizon. The second case is what preserves AD-13's information —
   * Open-Meteo returns numbers out to 15 days, and those are exactly the ones
   * the original rule refused to trust.
   */
  const basis: DataBasis =
    assumedHours > 0 || (beyondHorizon && scenario === 'forecast')
      ? 'annahme'
      : 'forecast';
  if (basis === 'annahme') {
    reasons.add(
      beyondHorizon
        ? `Jenseits des verlässlichen Horizonts (${params.reliableHorizonDays} Tage) — unter der Persistenz-Annahme gerechnet`
        : 'Beruht teils auf der Persistenz-Annahme jenseits des Forecast-Horizonts',
    );
  }

  return {
    legId: leg.id,
    // Die Etappe, GEGEN DIE gerechnet wurde — nicht zwingend die kuratierte:
    // der Plan verankert sie an den Plätzen, an denen das Boot wirklich liegt,
    // und legt den Kurs landfrei (legGeometry.ts). Die Karte zeichnet dann
    // genau die Geometrie, die hier gerechnet wurde, statt eine zweite.
    sailedLeg: leg,
    day,
    ampel: worstAmpel(verdicts),
    sailHours,
    motorHours,
    totalHours: sailHours + motorHours,
    avgTwsKn,
    avgTwaDeg,
    avgTwdDeg,
    avgSpeedKn:
      sailHours + motorHours > 0 ? traveled / (sailHours + motorHours) : null,
    upwind: avgTwaDeg !== null && avgTwaDeg < params.upwindTwaDeg,
    basis,
    reasons: [...reasons],
    nightLeg,
    arrivalHourAthens: arrivalAthens,
    breakdown,
    pointPassages: passages,
  };
}
