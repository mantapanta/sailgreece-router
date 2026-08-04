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
  PointForecast,
} from './schema/snapshot.ts';
import { AMPEL_WORT, worstAmpel, type Ampel } from './schema/common.ts';
import type { Coordinates } from './schema/common.ts';
import { bearingDeg, compassPoint, distanceNm, normDeg, twaDeg } from './geo.ts';
import { fallbackSpeedKn, motorSpeedKn, sailSpeedKn } from './polar.ts';
import { athensHourLabel, hourIndexAt, legWindow, MAX_LEG_HOURS } from './time.ts';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** German number with a comma, one decimal — rationale texts are user-facing. */
const num1 = (v: number) => v.toFixed(1).replace('.', ',');
const kn = (v: number) => `${Math.round(v)} kn`;

/** Point of sail from TWA — the seamanlike name the skipper thinks in. */
function pointOfSail(twa: number, params: Params): string {
  if (twa < params.upwindTwaDeg) return 'gegenan';
  if (twa < 80) return 'am Wind';
  if (twa < 100) return 'Halbwind';
  if (twa < 150) return 'raumschots';
  return 'vor dem Wind';
}

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
  /** Human label for rationale texts ("Zielplatz Livadi", "Wegpunkt 2"). */
  label: string;
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
    { key: from.id, coordinates: from.coordinates, label: `Start ${from.name}` },
    // Derived legs (e.g. reversed connectors) carry the forecast keys of
    // their ORIGINAL stored leg via waypointKeys — only those were fetched.
    ...leg.waypoints.map((w, n) => ({
      key: leg.waypointKeys?.[n] ?? legWaypointKey(leg.id, n),
      coordinates: w,
      label: `Wegpunkt ${n + 1}`,
    })),
    { key: to.id, coordinates: to.coordinates, label: `Ziel ${to.name}` },
  ];
}

interface WindSample {
  twsKn: number;
  fromDeg: number;
  /** Value stems from the persistence assumption, not from the model. */
  assumed: boolean;
}

function windAt(fc: PointForecast | undefined, hourIdx: number): WindSample | null {
  const tws = fc?.windKn[hourIdx] ?? null;
  const dir = fc?.windDirDeg[hourIdx] ?? null;
  if (tws === null || dir === null) return null;
  return { twsKn: tws, fromDeg: dir, assumed: fc?.windAssumed[hourIdx] ?? false };
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
    headroom: { windKn: null, hours: null },
    basis: 'forecast',
    rationale: [
      `Geplant: ${leg.distanceNm} sm an Törntag ${day} — nicht bewertbar, weil ${reason.toLowerCase()}.`,
    ],
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
  if (startIdx === null) return unbewertet('Abfahrtszeit außerhalb der Zeitachse');

  const verdicts: Ampel[] = [];
  const reasons = new Set<string>();
  let traveled = 0;
  let sailHours = 0;
  let motorHours = 0;
  let twsSum = 0;
  let twaSum = 0;
  let samples = 0;
  let minTwsKn = Infinity;
  let maxTwsKn = -Infinity;
  // Vector accumulator for the mean wind direction (weighted by wind speed —
  // the direction of a calm hour must not swing the mean).
  let dirX = 0;
  let dirY = 0;
  let steps = 0;
  let assumedSteps = 0;
  /**
   * Strongest wind seen at a point/hour where the boat is actually BEATING —
   * the only wind that the FR16 upwind rule measures. Stays null when the leg
   * never beats, which is exactly the case where the rule is not binding.
   */
  let worstUpwindTwsKn: number | null = null;
  /** Strictest point/hour under the FR16 wind rule — the ampel's origin. */
  let governing: {
    label: string;
    idx: number;
    twsKn: number;
    twa: number;
    verdict: 'gruen' | 'gelb' | 'rot';
  } | null = null;
  const strictness: Record<'gruen' | 'gelb' | 'rot', number> = {
    gruen: 0,
    gelb: 1,
    rot: 2,
  };
  const total = leg.distanceNm;
  // Single source for the simulation bound: time.ts (legWindow uses it too).
  const maxHours = MAX_LEG_HOURS;

  for (let h = 0; traveled < total && h < maxHours; h++) {
    const idx = startIdx + h;
    if (idx >= snapshot.times.length)
      return unbewertet('Etappe reicht über die verfügbare Zeitachse hinaus');

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
      return unbewertet('Für diesen Ort liegen überhaupt keine Windwerte vor');

    steps++;
    let hourAssumed = progressWind.assumed;

    // FR16 rule at EVERY point this hour — worst point governs.
    for (const p of points) {
      const w = windAt(snapshot.forecast[p.key], idx);
      if (!w) {
        verdicts.push('unbewertet');
        reasons.add('Für einen Wegpunkt liegen keine Windwerte vor');
        continue;
      }
      if (w.assumed) hourAssumed = true;
      const t = twaDeg(seg.course, w.fromDeg);
      if (t < params.upwindTwaDeg && (worstUpwindTwsKn === null || w.twsKn > worstUpwindTwsKn)) {
        worstUpwindTwsKn = w.twsKn;
      }
      const v = upwindWindVerdict(t, w.twsKn, params);
      verdicts.push(v);
      if (v === 'rot') reasons.add('Aufkreuzen gegenan bei >25 kn wahrem Wind (FR16)');
      if (v === 'gelb') reasons.add('Wind nahe der Aufkreuz-Schwelle (FR17)');
      // Remember where the ampel comes from: strictest verdict wins, on a tie
      // the stronger wind — that is the stretch worth naming in the rationale.
      if (v === 'gruen' || v === 'gelb' || v === 'rot') {
        const stricter =
          !governing ||
          strictness[v] > strictness[governing.verdict] ||
          (strictness[v] === strictness[governing.verdict] &&
            w.twsKn > governing.twsKn);
        if (stricter) {
          governing = { label: p.label, idx, twsKn: w.twsKn, twa: t, verdict: v };
        }
      }
    }
    if (hourAssumed) assumedSteps++;

    const twa = twaDeg(seg.course, progressWind.fromDeg);
    twsSum += progressWind.twsKn;
    twaSum += twa;
    samples++;
    if (progressWind.twsKn < minTwsKn) minTwsKn = progressWind.twsKn;
    if (progressWind.twsKn > maxTwsKn) maxTwsKn = progressWind.twsKn;
    dirX += progressWind.twsKn * Math.sin(rad(progressWind.fromDeg));
    dirY += progressWind.twsKn * Math.cos(rad(progressWind.fromDeg));

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

  const notDoable = traveled < total;
  if (notDoable) {
    verdicts.push('rot');
    reasons.add('Etappe in 24 h nicht zu schaffen');
  }

  const avgTwsKn = samples > 0 ? twsSum / samples : null;
  const avgTwaDeg = samples > 0 ? twaSum / samples : null;
  const budget = budgetVerdict(sailHours, motorHours, avgTwsKn, params);
  budget.reasons.forEach((r) => reasons.add(r));
  verdicts.push(budget.ampel);

  const ampel = worstAmpel(verdicts);
  const basis: DataBasis = assumedSteps > 0 ? 'annahme' : 'forecast';
  if (basis === 'annahme') {
    reasons.add(
      'Beruht teils auf der Persistenz-Annahme jenseits des Forecast-Horizonts',
    );
  }

  return {
    legId: leg.id,
    day,
    ampel,
    sailHours,
    motorHours,
    totalHours: sailHours + motorHours,
    avgTwsKn,
    avgTwaDeg,
    upwind: avgTwaDeg !== null && avgTwaDeg < params.upwindTwaDeg,
    headroom: {
      windKn:
        worstUpwindTwsKn === null ? null : params.maxUpwindTwsKn - worstUpwindTwsKn,
      hours: params.maxSailHours + params.maxMotorHours - (sailHours + motorHours),
    },
    basis,
    rationale: buildLegRationale({
      leg,
      day,
      snapshot,
      points,
      segmentCount: segments.length,
      departureMs,
      isSecondLegOfDay: (opts.departureOffsetHours ?? 0) > 0,
      minTwsKn,
      maxTwsKn,
      dirX,
      dirY,
      avgTwaDeg,
      sailHours,
      motorHours,
      steps,
      assumedSteps,
      governing,
      budgetAmpel: budget.ampel,
      ampel,
      notDoable,
    }),
    reasons: [...reasons],
  };
}

interface RationaleInput {
  leg: Leg;
  day: number;
  snapshot: PlanningSnapshot;
  points: LegPoint[];
  segmentCount: number;
  departureMs: number;
  isSecondLegOfDay: boolean;
  minTwsKn: number;
  maxTwsKn: number;
  dirX: number;
  dirY: number;
  avgTwaDeg: number | null;
  sailHours: number;
  motorHours: number;
  steps: number;
  assumedSteps: number;
  governing: {
    label: string;
    idx: number;
    twsKn: number;
    twa: number;
    verdict: 'gruen' | 'gelb' | 'rot';
  } | null;
  budgetAmpel: Ampel;
  ampel: Ampel;
  notDoable: boolean;
}

/**
 * The verdict's derivation in plain sentences — window, wind, speed model,
 * budget, governing rule, data basis. This is what makes the score reviewable
 * instead of an oracle: every number the skipper sees on a card can be traced
 * back to the parameter and the forecast hour it came from.
 */
function buildLegRationale(input: RationaleInput): string[] {
  const { snapshot, leg, points } = input;
  const { params, polar } = snapshot;
  const lines: string[] = [];

  // 1 — window and geometry
  const generalCourse = bearingDeg(
    points[0]!.coordinates,
    points[points.length - 1]!.coordinates,
  );
  const over =
    input.segmentCount > 1 ? ` über ${input.segmentCount} Teilstrecken` : '';
  lines.push(
    `Fenster: Abfahrt an Törntag ${input.day} um ${athensHourLabel(input.departureMs)} (Athen)` +
      `${input.isSecondLegOfDay ? ' — zweite Etappe des Tages, gerechnet ab der echten Ankunftszeit der ersten' : ''}. ` +
      `${num1(leg.distanceNm)} sm${over}, Generalkurs ${Math.round(generalCourse)}° ` +
      `(${points[0]!.label} → ${points[points.length - 1]!.label}).`,
  );

  // 2 — wind actually encountered
  if (input.steps > 0 && Number.isFinite(input.minTwsKn)) {
    const meanDir =
      Math.hypot(input.dirX, input.dirY) > 1e-9
        ? normDeg(deg(Math.atan2(input.dirX, input.dirY)))
        : null;
    const twaText =
      input.avgTwaDeg !== null
        ? `TWA im Mittel ${Math.round(input.avgTwaDeg)}° (${pointOfSail(input.avgTwaDeg, params)})`
        : 'TWA nicht bestimmbar';
    lines.push(
      `Wind im Etappenfenster ${Math.round(input.minTwsKn)}–${kn(input.maxTwsKn)} aus ${compassPoint(meanDir)}` +
        `${meanDir !== null ? ` (${Math.round(meanDir)}°)` : ''}, ${twaText}.`,
    );
  }

  // 3 — speed model
  if (polar) {
    const off = params.polarOffsetKn;
    lines.push(
      `Fahrt aus der Polare mit ${off >= 0 ? '+' : '−'}${num1(Math.abs(off))} kn Offset (Saona gegen FP 45); ` +
        `gegenan wird mit ${params.beatTwaDeg}° gekreuzt und auf den Kurs projiziert (VMG). ` +
        `Motor, sobald die Polare unter ${num1(params.minSailSpeedKn)} kn liegt.`,
    );
  } else {
    lines.push(
      `Keine Polare geladen — Pauschalwerte: ${num1(params.fallbackSpeeds.sailKn)} kn Segeln, ` +
        `${num1(params.fallbackSpeeds.upwindKn)} kn gegenan, ${num1(params.fallbackSpeeds.motorKn)} kn Motor.`,
    );
  }
  if (input.motorHours > 0.05) {
    lines.push(
      `Davon ${num1(input.motorHours)} h unter Motor mit ${num1(params.motorSpeedKn)} kn.`,
    );
  }

  // 4 — budget comparison (FR16)
  lines.push(
    `Tagesbudget: ${num1(input.sailHours)} h Segeln + ${num1(input.motorHours)} h Motor = ` +
      `${num1(input.sailHours + input.motorHours)} h. Ziel ≤ ${num1(params.targetDayHours)} h bei ` +
      `≤ ${num1(params.targetMotorHours)} h Motor, hartes Maximum ${num1(params.maxSailHours)} h Segeln + ` +
      `${num1(params.maxMotorHours)} h Motor ⇒ ${AMPEL_WORT[input.budgetAmpel]}.`,
  );

  // 5 — governing point of the wind rule (FR16/FR17)
  if (input.governing) {
    const ms = Date.parse(snapshot.times[input.governing.idx] ?? '');
    const when = Number.isFinite(ms) ? ` um ${athensHourLabel(ms)} (Athen)` : '';
    lines.push(
      `Strengste Stelle der Windregel: ${input.governing.label}${when} — ` +
        `${kn(input.governing.twsKn)} bei TWA ${Math.round(input.governing.twa)}° ⇒ ` +
        `${AMPEL_WORT[input.governing.verdict]} (kein Aufkreuzen über ${params.maxUpwindTwsKn} kn, ` +
        `Gelb-Reserve ${num1(params.gelbReserveKn)} kn, gegenan ab TWA < ${params.upwindTwaDeg}°).`,
    );
  }

  // 6 — who set the overall ampel
  const drivers: string[] = [];
  if (input.governing && input.governing.verdict === input.ampel) drivers.push('Windregel');
  if (input.budgetAmpel === input.ampel) drivers.push('Tagesbudget');
  if (input.notDoable) drivers.push('Etappe in 24 h nicht zu schaffen');
  if (input.ampel === 'unbewertet') drivers.push('fehlende Windwerte an einem Punkt');
  lines.push(
    `Gesamt-Ampel ${AMPEL_WORT[input.ampel]} — strengstes Einzelurteil über alle Punkte und Stunden` +
      `${drivers.length > 0 ? `, gesetzt von: ${drivers.join(' + ')}` : ''}.`,
  );

  // 7 — data basis (forecast vs. assumption)
  const real = input.steps - input.assumedSteps;
  lines.push(
    input.assumedSteps === 0
      ? `Datenbasis: alle ${input.steps} Simulationsstunden aus dem Modelllauf (${snapshot.model}).`
      : `Datenbasis: ${real} von ${input.steps} Simulationsstunden aus dem Modelllauf (${snapshot.model}), ` +
        `${input.assumedSteps} h aus der Persistenz-Annahme (typischer Tagesgang der vorliegenden Forecast-Tage). ` +
        `Wird mit jedem neuen Lauf neu bewertet — dann ggf. korrigieren oder abbrechen.`,
  );

  return lines;
}
