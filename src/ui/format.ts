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

const rangeFmt = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Athens',
});

/** Trip date range derived from the config params (no hardcoded trip dates). */
export function formatTripRange(tripStartDate: string, tripLengthDays: number): string {
  const start = new Date(`${dateForTripDay(tripStartDate, 1)}T12:00:00Z`);
  const end = new Date(`${dateForTripDay(tripStartDate, tripLengthDays)}T12:00:00Z`);
  return rangeFmt.formatRange(start, end);
}

export function formatStamp(iso: string | null): string {
  if (!iso) return 'unbekannt';
  return `${stampFmt.format(new Date(iso))} (Athen)`;
}

const timeFmt = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Athens',
  // 'h23' wie in domain/time.ts: bloßes hour12:false liefert auf manchen
  // ICU-Builds um Mitternacht "24:00".
  hourCycle: 'h23',
});

/**
 * Uhrzeit in Ortszeit Athen. Sommer-/Winterzeit kommt aus der Zeitzone
 * 'Europe/Athens' selbst — kein festes +03:00, das ausserhalb der Sommerzeit
 * falsch wäre (AD-9).
 *
 * Die Stunden-Achse des Snapshots ist normativ UTC; umgerechnet wird
 * ausschliesslich hier in der Anzeige. Der Fallback-Wert der Simulation
 * ('+7h', siehe domain/scoring.ts) ist keine ISO-Zeit und wird unverändert
 * durchgereicht, statt eine Uhrzeit zu erfinden.
 */
export function formatAthensTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return timeFmt.format(new Date(ms));
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

/**
 * Windrichtung, wie ein Segler sie liest: "NNW 335°".
 *
 * AD-6 — alle Windrichtungen im Projekt sind rechtweisend und "kommend aus".
 * Die Himmelsrichtung steht vorn, weil sie im Cockpit gesprochen wird; die
 * Gradzahl dahinter, weil nur sie mit dem TWA zusammen nachrechenbar ist.
 */
export function formatWindFrom(deg: number | null): string {
  if (deg === null) return '–';
  return `${compass(deg)} ${Math.round(((deg % 360) + 360) % 360)}°`;
}

/**
 * Kurs zum Wind als Name — die Übersetzung des TWA in Segler-Sprache.
 *
 * Reine ANZEIGE (wie compass): die Grenzen sind die übliche Einteilung, NICHT
 * die Schwellen der Bewertung. Ob eine Etappe als Aufkreuzer gilt, entscheidet
 * allein `params.upwindTwaDeg` in der Domain (FR16) — ein Label hier darf
 * dieser Regel weder vorgreifen noch widersprechen.
 */
export function pointOfSail(twa: number | null): string {
  if (twa === null) return '–';
  const t = Math.abs(twa);
  if (t < 30) return 'gegenan';
  if (t < 60) return 'Am Wind';
  if (t < 100) return 'Halbwind';
  if (t < 150) return 'Raumschots';
  return 'Vor dem Wind';
}
