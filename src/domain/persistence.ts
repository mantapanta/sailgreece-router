/**
 * Persistenz-Annahme jenseits des Forecast-Horizonts.
 *
 * Produktentscheidung: Es wird IMMER geroutet. Dass die Modelle den zweiten
 * Törnabschnitt noch nicht abdecken, darf nicht dazu führen, dass die App
 * keine Aussage macht — der Skipper braucht auch für Tag 9 eine Route, die er
 * dann korrigiert oder abbricht, wenn der nächste Modelllauf etwas anderes
 * sagt.
 *
 * Verfahren: aus den vorhandenen Forecast-Tagen wird je Ort ein TYPISCHER
 * TAGESGANG gebildet (Mittel je Stunde-des-Tages) und für alle weiteren Tage
 * wiederholt. Ein Mittel über die vorhandenen Tage statt einer Kopie des
 * letzten Tages, weil ein einzelner Tag verrauscht ist; ein Tagesgang statt
 * eines Tagesmittels, weil das nachmittägliche Auffrischen des Meltemi genau
 * die Information ist, an der Etappen scheitern. Windrichtungen werden
 * vektoriell und mit der Windgeschwindigkeit gewichtet gemittelt — die
 * Richtung einer Flautenstunde soll den Mittelwert nicht drehen.
 *
 * Dasselbe Verfahren füllt Lücken INNERHALB der Achse: der Marine-Horizont
 * ist kürzer als der Wetter-Horizont, ohne Füllung bleiben Nacht-Ampeln
 * grundlos 'unbewertet'.
 *
 * Jede gefüllte Stunde wird als `windAssumed`/`waveAssumed` markiert. Nur
 * darüber weiß die Bewertung, ob ein Urteil auf Modelldaten oder auf dieser
 * Annahme beruht — die Annahme wird nie stumm zu einem Forecast (AD-10).
 * Stunden, für die es überhaupt keine Datenbasis gibt (Ort ohne einen
 * einzigen echten Wert), bleiben null und damit 'unbewertet'.
 */

import type { PlanningSnapshot, PointForecast } from './schema/snapshot.ts';
import { normDeg } from './geo.ts';
import { deadlineFrame, legWindow, nightWindow } from './time.ts';

const HOUR_MS = 3600_000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * Hard upper bound for the extended axis. A misconfigured trip frame (e.g.
 * tripLengthDays: 400) must not spin up an axis of unbounded size — it fails
 * by staying short (visible 'unbewertet') instead of by hanging the browser.
 */
const MAX_AXIS_HOURS = 45 * 24;

export interface PersistenceInfo {
  /**
   * Last axis hour with real WIND data (ISO-UTC); null = none at all. This is
   * the horizon in the colloquial sense — it governs the leg scoring.
   */
  horizonIso: string | null;
  /**
   * Last axis hour with real WAVE data. Measurably shorter than the wind
   * horizon (marine models run ~9 days vs. ~15). Reported separately, because
   * otherwise "forecast reaches to the 19th" next to "assumption from day 5"
   * looks like a contradiction when in fact the WAVES ran out first.
   */
  waveHorizonIso: string | null;
  /** Hours the assumption appended beyond the model horizon. */
  appendedHours: number;
  /** Calendar days of real forecast that went into the diurnal profile. */
  profileDays: number;
  /** Display text describing the assumption actually applied. */
  note: string | null;
}

/** UTC hour-of-day of each axis entry — the diurnal profile's bucket index. */
function hoursOfDay(times: string[]): number[] {
  return times.map((t) => new Date(Date.parse(t)).getUTCHours());
}

/**
 * Mean per hour-of-day over all real values. Buckets without any real value
 * fall back to the series' overall mean, so a short axis (< 24 h) still yields
 * a usable profile instead of holes.
 */
function scalarProfile(
  series: (number | null)[],
  hod: number[],
): (number | null)[] {
  const sum = new Array<number>(24).fill(0);
  const count = new Array<number>(24).fill(0);
  let allSum = 0;
  let allCount = 0;
  for (let i = 0; i < hod.length; i++) {
    const v = series[i];
    if (typeof v !== 'number') continue;
    const h = hod[i]!;
    sum[h]! += v;
    count[h]!++;
    allSum += v;
    allCount++;
  }
  if (allCount === 0) return new Array<number | null>(24).fill(null);
  const overall = allSum / allCount;
  return Array.from({ length: 24 }, (_, h) =>
    count[h]! > 0 ? sum[h]! / count[h]! : overall,
  );
}

/**
 * Vector mean per hour-of-day for a direction series, weighted by `weight`
 * (wind speed / wave height). Cancelling vectors (hours with opposing
 * directions and no dominant strength) yield null for that bucket and fall
 * back to the overall vector mean — a direction we cannot state is better
 * left to the overall trend than invented as 0°/North.
 */
function directionProfile(
  dirs: (number | null)[],
  weight: (number | null)[],
  hod: number[],
): (number | null)[] {
  const sx = new Array<number>(24).fill(0);
  const sy = new Array<number>(24).fill(0);
  let ax = 0;
  let ay = 0;
  for (let i = 0; i < hod.length; i++) {
    const d = dirs[i];
    if (typeof d !== 'number') continue;
    const w = weight[i];
    const m = typeof w === 'number' && w > 0 ? w : 1;
    const h = hod[i]!;
    sx[h]! += m * Math.sin(rad(d));
    sy[h]! += m * Math.cos(rad(d));
    ax += m * Math.sin(rad(d));
    ay += m * Math.cos(rad(d));
  }
  const overall =
    Math.hypot(ax, ay) > 1e-9 ? normDeg(deg(Math.atan2(ax, ay))) : null;
  return Array.from({ length: 24 }, (_, h) =>
    Math.hypot(sx[h]!, sy[h]!) > 1e-9
      ? normDeg(deg(Math.atan2(sx[h]!, sy[h]!)))
      : overall,
  );
}

/** Fill every null hour of `series` from the profile; report what was filled. */
function fillFromProfile(
  series: (number | null)[],
  profile: (number | null)[],
  hod: number[],
  filled: boolean[],
): (number | null)[] {
  return hod.map((h, i) => {
    const v = series[i];
    if (typeof v === 'number') return v;
    const p = profile[h] ?? null;
    if (p !== null) filled[i] = true;
    return p;
  });
}

/** Pad a series to the new axis length with nulls (values come from the profile). */
function padded(series: (number | null)[], length: number): (number | null)[] {
  const out = new Array<number | null>(length).fill(null);
  for (let i = 0; i < Math.min(series.length, length); i++) out[i] = series[i] ?? null;
  return out;
}

/**
 * Last axis index for which ANY location has a real wind value — the model
 * horizon. Wind, not waves: the marine horizon is shorter by design, and the
 * skipper-facing caveat is about the wind forecast running out.
 */
function windHorizonIndex(snapshot: PlanningSnapshot): number {
  let last = -1;
  for (const fc of Object.values(snapshot.forecast)) {
    for (let i = fc.windKn.length - 1; i > last; i--) {
      if (typeof fc.windKn[i] === 'number' && typeof fc.windDirDeg[i] === 'number') {
        last = i;
        break;
      }
    }
  }
  return last;
}

/** Same for waves — the marine horizon, which is the shorter of the two. */
function waveHorizonIndex(snapshot: PlanningSnapshot): number {
  let last = -1;
  for (const fc of Object.values(snapshot.forecast)) {
    for (let i = fc.waveM.length - 1; i > last; i--) {
      if (typeof fc.waveM[i] === 'number' && typeof fc.waveDirDeg[i] === 'number') {
        last = i;
        break;
      }
    }
  }
  return last;
}

/**
 * How far the axis must reach so that every window the engine looks at is
 * covered: night windows of the display lookahead, and leg windows up to the
 * last relevant trip day (the option/PPR search scans to the deadline, which
 * lies inside the trip).
 */
function targetEndMs(snapshot: PlanningSnapshot): number {
  const { params, trip } = snapshot;
  // The deadline day comes from the ONE derivation (AD-9, time.ts) — the
  // config carries a return DATE, not a day number.
  const { deadlineDay } = deadlineFrame(params);
  const lastDay = Math.max(
    params.tripLengthDays,
    deadlineDay,
    trip.currentDay + params.nightLookaheadDays,
  );
  const night = nightWindow(
    params.tripStartDate,
    lastDay,
    params.nightStartHourAthens,
    params.nightEndHourAthens,
  ).endMs;
  const leg = legWindow(params.tripStartDate, lastDay, params.departureHourAthens).endMs;
  return Math.max(night, leg) + HOUR_MS;
}

/**
 * Extend the snapshot's hour axis to cover the whole trip and fill every
 * missing hour from the diurnal profile of the real forecast. Pure: returns a
 * new snapshot, never mutates the input.
 */
export function applyPersistenceAssumption(snapshot: PlanningSnapshot): {
  snapshot: PlanningSnapshot;
  info: PersistenceInfo;
} {
  const original = snapshot.times;
  if (original.length === 0) {
    return {
      snapshot,
      info: {
        horizonIso: null,
        waveHorizonIso: null,
        appendedHours: 0,
        profileDays: 0,
        note: 'Kein Forecast vorhanden — keine Fortschreibung möglich',
      },
    };
  }

  const horizonIdx = windHorizonIndex(snapshot);
  const horizonIso = horizonIdx >= 0 ? (original[horizonIdx] ?? null) : null;
  const waveIdx = waveHorizonIndex(snapshot);
  const waveHorizonIso = waveIdx >= 0 ? (original[waveIdx] ?? null) : null;
  if (horizonIdx < 0) {
    return {
      snapshot,
      info: {
        horizonIso: null,
        waveHorizonIso,
        appendedHours: 0,
        profileDays: 0,
        note: 'Keine verwertbaren Windwerte im Forecast — keine Fortschreibung möglich',
      },
    };
  }

  // --- extend the axis ------------------------------------------------------
  const lastMs = Date.parse(original[original.length - 1]!);
  const firstMs = Date.parse(original[0]!);
  const wanted = Math.min(
    targetEndMs(snapshot),
    firstMs + MAX_AXIS_HOURS * HOUR_MS,
  );
  const times = [...original];
  for (let ms = lastMs + HOUR_MS; ms < wanted; ms += HOUR_MS) {
    times.push(new Date(ms).toISOString());
  }
  const appendedHours = times.length - original.length;
  const hod = hoursOfDay(times);
  const hodOriginal = hod.slice(0, original.length);

  // Days of real forecast behind the profile (distinct UTC dates up to the
  // horizon) — quoted in the caveat, so it must be the real count.
  const profileDays = new Set(
    original.slice(0, horizonIdx + 1).map((t) => t.slice(0, 10)),
  ).size;

  // --- fill every location --------------------------------------------------
  const forecast: Record<string, PointForecast> = {};
  for (const [key, fc] of Object.entries(snapshot.forecast)) {
    const windFilled = new Array<boolean>(times.length).fill(false);
    const waveFilled = new Array<boolean>(times.length).fill(false);

    // Profiles come from the ORIGINAL axis only — never from already filled
    // hours, which would feed the assumption back into itself.
    const windKnProfile = scalarProfile(fc.windKn, hodOriginal);
    const waveProfile = scalarProfile(fc.waveM, hodOriginal);
    const periodProfile = scalarProfile(fc.wavePeriodS, hodOriginal);
    const windDirProfile = directionProfile(fc.windDirDeg, fc.windKn, hodOriginal);
    const waveDirProfile = directionProfile(fc.waveDirDeg, fc.waveM, hodOriginal);

    const windKn = fillFromProfile(padded(fc.windKn, times.length), windKnProfile, hod, windFilled);
    const windDirDeg = fillFromProfile(padded(fc.windDirDeg, times.length), windDirProfile, hod, windFilled);
    const waveM = fillFromProfile(padded(fc.waveM, times.length), waveProfile, hod, waveFilled);
    const waveDirDeg = fillFromProfile(padded(fc.waveDirDeg, times.length), waveDirProfile, hod, waveFilled);
    // Wave period is carried but drives no verdict — filled for consistency,
    // without owning the assumption flag.
    const wavePeriodS = fillFromProfile(padded(fc.wavePeriodS, times.length), periodProfile, hod, new Array(times.length).fill(false));

    forecast[key] = {
      windKn,
      windDirDeg,
      waveM,
      waveDirDeg,
      wavePeriodS,
      windAssumed: windFilled.map((f, i) => f || (fc.windAssumed[i] ?? false)),
      waveAssumed: waveFilled.map((f, i) => f || (fc.waveAssumed[i] ?? false)),
    };
  }

  const note =
    `Fortgeschrieben mit dem typischen Tagesgang der ${profileDays} vorliegenden ` +
    `Forecast-Tage (Windrichtung geschwindigkeitsgewichtet gemittelt). Annahme: das Wetter ` +
    `bleibt in diesem Muster — jeder neue Modelllauf ersetzt sie.`;

  return {
    snapshot: { ...snapshot, times, forecast },
    info: { horizonIso, waveHorizonIso, appendedHours, profileDays, note },
  };
}
