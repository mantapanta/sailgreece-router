/**
 * AD-9 — time windows are domain objects.
 * All business time windows are DEFINED in Europe/Athens and translated by
 * exactly this module into UTC hour indices of the snapshot (whose hour axis
 * is normatively UTC). Pure: time is injected, never read from a clock.
 */

const ATHENS_TZ = 'Europe/Athens';

const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: ATHENS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  // 'h23' is mandatory: plain `hour12: false` may yield hour "24" at
  // midnight on some ICU builds, which would shift wallMs by a full day.
  hourCycle: 'h23',
});

/** Offset of Europe/Athens vs UTC in minutes at the given UTC instant. */
export function athensOffsetMinutes(utcMs: number): number {
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  const wallMs = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((wallMs - utcMs) / 60000);
}

/**
 * Convert an Athens wall-clock time to a UTC epoch (ms).
 *
 * DST edge rule (deterministic, documented): the two fixed-point iterations
 * converge for every existing wall time. For a NON-EXISTENT wall time
 * (spring-forward gap, e.g. 03:30 on the last Sunday of March) the result is
 * the instant shifted by the jump — i.e. the moment the clock actually
 * showed one hour later. For an AMBIGUOUS wall time (autumn fall-back) the
 * SECOND iteration settles on the PRE-transition (summer-time) offset, so
 * the EARLIER of the two instants wins. Business windows are therefore off
 * by at most 1 h on the two DST days of the year — acceptable and visible
 * here rather than silently implementation-defined.
 */
export function athensToUtcMs(
  dateIso: string,
  hour: number,
  minute = 0,
): number {
  const [y, m, d] = dateIso.split('-').map(Number) as [number, number, number];
  // First guess: interpret wall time as UTC, then correct by the offset.
  let utcMs = Date.UTC(y, m - 1, d, hour, minute) - athensOffsetMinutes(Date.UTC(y, m - 1, d, hour, minute)) * 60000;
  // Second iteration handles DST edges (choice rule documented above).
  utcMs = Date.UTC(y, m - 1, d, hour, minute) - athensOffsetMinutes(utcMs) * 60000;
  return utcMs;
}

/** Calendar date (YYYY-MM-DD) of trip day N (1-based; day 1 = start date). */
export function dateForTripDay(tripStartDate: string, dayN: number): string {
  const [y, m, d] = tripStartDate.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const ms = Date.UTC(y, m - 1, d + (dayN - 1), 12);
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export interface TimeWindow {
  /** Inclusive start, UTC epoch ms. */
  startMs: number;
  /** Exclusive end, UTC epoch ms (half-open, AD-9). */
  endMs: number;
}

/** Normative: nightWindow(N) = [day N 18:00, day N+1 09:00) Athens. */
export function nightWindow(
  tripStartDate: string,
  nightDay: number,
  nightStartHourAthens = 18,
  nightEndHourAthens = 9,
): TimeWindow {
  return {
    startMs: athensToUtcMs(dateForTripDay(tripStartDate, nightDay), nightStartHourAthens),
    endMs: athensToUtcMs(dateForTripDay(tripStartDate, nightDay + 1), nightEndHourAthens),
  };
}

/**
 * Upper simulation bound for a single leg in hours — the ONE source for this
 * limit (legWindow end and the scoring loop both use it).
 */
export const MAX_LEG_HOURS = 24;

/**
 * Normative: legWindow(N) starts at day N departureTime (default 09:00 Athens).
 * The end is an upper simulation bound (MAX_LEG_HOURS); arrival is determined
 * by the scoring simulation itself.
 */
export function legWindow(
  tripStartDate: string,
  dayN: number,
  departureHourAthens = 9,
): TimeWindow {
  const startMs = athensToUtcMs(dateForTripDay(tripStartDate, dayN), departureHourAthens);
  return { startMs, endMs: startMs + MAX_LEG_HOURS * 3600_000 };
}

/**
 * Translate a window into indices of the snapshot's UTC hour axis.
 * `times` are hourly ISO-UTC strings; an hour belongs to the window if its
 * start lies in [startMs, endMs).
 */
export function hourIndices(window: TimeWindow, times: string[]): number[] {
  const indices: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]!);
    if (t >= window.startMs && t < window.endMs) indices.push(i);
  }
  return indices;
}

/**
 * Athens wall-clock hour label ("14:00") for a UTC instant — for rationale
 * texts, which must speak the skipper's local time, not UTC.
 */
export function athensHourLabel(utcMs: number): string {
  const wallMs = utcMs + athensOffsetMinutes(utcMs) * 60000;
  return `${String(new Date(wallMs).getUTCHours()).padStart(2, '0')}:00`;
}

/**
 * Short Athens timestamp ("19.08., 05:00") for rationale texts. The core emits
 * German prose anyway (reasons, rationale) — leaving raw ISO strings in it
 * would push formatting into the view for these strings alone.
 */
export function athensStamp(iso: string | null): string {
  if (!iso) return 'unbekannt';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'unbekannt';
  const wall = new Date(ms + athensOffsetMinutes(ms) * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  // Minute precision, not hour: this also stamps the RETRIEVAL time, where
  // rounding to the hour would silently misreport how fresh the data is.
  return (
    `${pad(wall.getUTCDate())}.${pad(wall.getUTCMonth() + 1)}., ` +
    `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`
  );
}

/** Index of the hour containing the given instant, or null if off-axis. */
export function hourIndexAt(utcMs: number, times: string[]): number | null {
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]!);
    if (utcMs >= t && utcMs < t + 3600_000) return i;
  }
  return null;
}
