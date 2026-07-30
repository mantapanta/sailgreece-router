/** German display formatting (UI layer — display only, no domain values computed here). */

import { dateForTripDay } from '../domain/time.ts';

const dayFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Athens',
});

const stampFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Athens',
});

export function formatTripDayDate(tripStartDate: string, day: number): string {
  return dayFmt.format(new Date(`${dateForTripDay(tripStartDate, day)}T12:00:00Z`));
}

export function formatStamp(iso: string | null): string {
  if (!iso) return 'unbekannt';
  return `${stampFmt.format(new Date(iso))} (Athen)`;
}

export function formatHours(h: number | null): string {
  if (h === null) return '–';
  return `${h.toFixed(1).replace('.', ',')} h`;
}

export function formatKn(v: number | null): string {
  if (v === null) return '–';
  return `${Math.round(v)} kn`;
}

export function formatDeg(v: number | null): string {
  if (v === null) return '–';
  return `${Math.round(v)}°`;
}

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function compass(deg: number | null): string {
  if (deg === null) return '–';
  return DIRS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]!;
}
