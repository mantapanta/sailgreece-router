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
  PlanningSnapshot,
  LegAssessment,
  PointForecast,
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
      reasons: ['Über Ziel-Budget, aber innerhalb des harten Maximums (FR16)'],
    };
  }
  if (
    avgTwsKn !== null &&
    avgTwsKn <= params.lightWindMaxTwsKn &&
    total <= params.lightWindMaxHours
  ) {
    return {
      ampel: 'gelb',
      reasons: ['Langer Schlag, aber Leichtwind-Ausnahme (FR16: glattes Wasser)'],
    };
  }
  return { ampel: 'rot', reasons: ['Hartes Tagesbudget überschritten (FR16)'] };
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
  opts: { departureOffsetHours?: number } = {},
): LegAssessment {
  const { params, polar } = snapshot;
  const points = legPoints(leg, snapshot);
  const unbewertet = (reason: string): LegAssessment => ({
    legId: leg.id,
    day,
    ampel: 'unbewertet',
    sailHours: null,
    motorHours: null,
    totalHours: null,
    avgTwsKn: null,
    avgTwaDeg: null,
    upwind: false,
    reasons: [reason],
  });
  if (!points) return unbewertet('Start- oder Zielplatz fehlt in der Bibliothek');

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
  // must not shift the simulated departure of future trip days.
  const departureHour =
    (day === snapshot.trip.currentDay ? snapshot.trip.departureHourOverride : null) ??
    params.departureHourAthens;
  const window = legWindow(params.tripStartDate, day, departureHour);
  const departureMs =
    window.startMs + (opts.departureOffsetHours ?? 0) * 3600_000;
  const startIdx = hourIndexAt(departureMs, snapshot.times);
  if (startIdx === null) return unbewertet('Abfahrtszeit außerhalb der Forecast-Achse');

  const verdicts: Ampel[] = [];
  const reasons = new Set<string>();
  let traveled = 0;
  let sailHours = 0;
  let motorHours = 0;
  let twsSum = 0;
  let twaSum = 0;
  let samples = 0;
  const total = leg.distanceNm;
  // Single source for the simulation bound: time.ts (legWindow uses it too).
  const maxHours = MAX_LEG_HOURS;

  for (let h = 0; traveled < total && h < maxHours; h++) {
    const idx = startIdx + h;
    if (idx >= snapshot.times.length)
      return unbewertet('Etappe reicht über den Forecast-Horizont hinaus');

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
    const progressWind = windAt(
      snapshot.forecast[points[progressPointIdx]!.key],
      idx,
    );
    if (!progressWind)
      return unbewertet('Forecast-Stunden fehlen im Etappenfenster (Horizont)');

    // FR16 rule at EVERY point this hour — worst point governs.
    for (const p of points) {
      const w = windAt(snapshot.forecast[p.key], idx);
      if (!w) {
        verdicts.push('unbewertet');
        reasons.add('Forecast an einem Wegpunkt unvollständig (Horizont)');
        continue;
      }
      const t = twaDeg(seg.course, w.fromDeg);
      const v = upwindWindVerdict(t, w.twsKn, params);
      verdicts.push(v);
      if (v === 'rot') reasons.add('Aufkreuzen gegenan bei >25 kn wahrem Wind (FR16)');
      if (v === 'gelb') reasons.add('Wind nahe der Aufkreuz-Schwelle (FR17)');
    }

    const twa = twaDeg(seg.course, progressWind.fromDeg);
    twsSum += progressWind.twsKn;
    twaSum += twa;
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
    traveled += speed * hourFraction;
    if (motoring) motorHours += hourFraction;
    else sailHours += hourFraction;
  }

  if (traveled < total) {
    verdicts.push('rot');
    reasons.add('Etappe in 24 h nicht zu schaffen');
  }

  const avgTwsKn = samples > 0 ? twsSum / samples : null;
  const avgTwaDeg = samples > 0 ? twaSum / samples : null;
  const budget = budgetVerdict(sailHours, motorHours, avgTwsKn, params);
  budget.reasons.forEach((r) => reasons.add(r));
  verdicts.push(budget.ampel);

  return {
    legId: leg.id,
    day,
    ampel: worstAmpel(verdicts),
    sailHours,
    motorHours,
    totalHours: sailHours + motorHours,
    avgTwsKn,
    avgTwaDeg,
    upwind: avgTwaDeg !== null && avgTwaDeg < params.upwindTwaDeg,
    reasons: [...reasons],
  };
}
