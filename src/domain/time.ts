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
  hour12: false,
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
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return Math.round((wallMs - utcMs) / 60000);
}

/** Convert an Athens wall-clock time to a UTC epoch (ms). */
export function athensToUtcMs(
  dateIso: string,
  hour: number,
  minute = 0,
): number {
  const [y, m, d] = dateIso.split('-').map(Number) as [number, number, number];
  // First guess: interpret wall time as UTC, then correct by the offset.
  let utcMs = Date.UTC(y, m - 1, d, hour, minute) - athensOffsetMinutes(Date.UTC(y, m - 1, d, hour, minute)) * 60000;
  // Second iteration handles DST edges.
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
 * Normative: legWindow(N) starts at day N departureTime (default 09:00 Athens).
 * The end is an upper simulation bound; arrival is determined by the scoring
 * simulation itself.
 */
export function legWindow(
  tripStartDate: string,
  dayN: number,
  departureHourAthens = 9,
  maxDurationHours = 24,
): TimeWindow {
  const startMs = athensToUtcMs(dateForTripDay(tripStartDate, dayN), departureHourAthens);
  return { startMs, endMs: startMs + maxDurationHours * 3600_000 };
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

/** Index of the hour containing the given instant, or null if off-axis. */
export function hourIndexAt(utcMs: number, times: string[]): number | null {
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]!);
    if (utcMs >= t && utcMs < t + 3600_000) return i;
  }
  return null;
}
