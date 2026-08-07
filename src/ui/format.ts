/** German display formatting (UI layer — display only, no domain values computed here). */

import { compassPoint } from '../domain/geo.ts';
import {
  KURS_AM_WIND_BIS_DEG,
  KURS_GEGENAN_BIS_DEG,
  KURS_HALBWIND_BIS_DEG,
  kursSchwellen,
} from '../domain/kursAbschnitte.ts';
import type { Params } from '../domain/schema/params.ts';
import type { KursAbschnitt, KursKategorie } from '../domain/schema/snapshot.ts';
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

const weekdayShortFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  timeZone: 'Europe/Athens',
});

/** Kurzer Wochentag eines Törntags ("Mi") — für die Hafentag-Weiterfahrt-Zeile. */
export function formatTripDayWeekdayShort(
  tripStartDate: string,
  day: number,
): string {
  return weekdayShortFmt.format(
    new Date(`${dateForTripDay(tripStartDate, day)}T12:00:00Z`),
  );
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

/**
 * Athen-Dezimalstunde (14,5) als Uhrzeit "14:30". Werte über 24 sind der
 * Folgetag (Nachtetappe) und werden auf die Tagesuhr gefaltet — der Kontext
 * (Nachtetappen-Kennzeichnung) sagt dann, dass es der nächste Morgen ist.
 */
export function formatHourOfDay(h: number | null): string {
  if (h === null) return '–';
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function formatKn(v: number | null): string {
  if (v === null) return '–';
  return `${Math.round(v)} kn`;
}

/** Wellenhöhe/-grenze mit deutschem Dezimalkomma ("0,3 m") — "–" ohne Wert. */
export function formatWaveM(m: number | null): string {
  if (m === null) return '–';
  return `${m.toFixed(1).replace('.', ',')} m`;
}

export function formatDeg(v: number | null): string {
  if (v === null) return '–';
  return `${Math.round(v)}°`;
}

/**
 * Himmelsrichtung eines Winkels. Die Tabelle selbst liegt in domain/geo.ts —
 * die Domain benennt Richtungen in ihren Begründungen ("Wind 31 kn aus NNE"),
 * und zwei Kopien derselben 16 Namen könnten auseinanderlaufen. Hier bleibt
 * nur, was Anzeige ist: der Umgang mit "kein Wert".
 */
export function compass(deg: number | null): string {
  if (deg === null) return '–';
  return compassPoint(deg);
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
  // Die Grenzen, an denen auch GEWARNT wird, kommen aus der Domäne
  // (kursAbschnitte.ts) — eine Zeile, die hier "Am Wind" heisst, muss in der
  // Kreuz-Meldung der Etappenkarte auftauchen und nicht in der Halbwind-Zeile.
  // Unter 55° liegt kein Kurs mehr an: dort wird gekreuzt, und das Wort dafür
  // ist "gegenan" (die Abschnittszeile schreibt dann "Kreuzen").
  if (t < KURS_GEGENAN_BIS_DEG) return 'gegenan';
  if (t < KURS_AM_WIND_BIS_DEG) return 'Am Wind';
  if (t < KURS_HALBWIND_BIS_DEG) return 'Halbwind';
  if (t < 150) return 'Raumschots';
  return 'Vor dem Wind';
}

/**
 * Das Wort für den Kurs in der Warnzeile der Etappenkarte — die Einteilung des
 * Skippers (2026-08-07): Kreuz bis 80° TWA, Halbwind bis 100°, darüber trägt
 * der Wind und es gibt nichts zu melden.
 *
 * "Kreuz" heisst hier das BAND, nicht der Zickzack: gekreuzt wird erst unter
 * 55°. Was wirklich Schläge fährt, nennt die Zeile getrennt daneben
 * (`KursAbschnitt.kreuzNm`) — sonst liest sich "8 sm Kreuz" wie 12 sm durchs
 * Wasser, wo 8 gesegelt werden.
 */
export const KURS_LABEL: Record<KursKategorie, string> = {
  kreuz: 'Kreuz',
  halbwind: 'Halbwind',
};

/** Meilen der Warnzeile: auf die Meile gerundet, unter 1 sm mit Stelle. */
function abschnittSm(nm: number): string {
  return nm < 1 ? nm.toFixed(1).replace('.', ',') : String(Math.round(nm));
}

/**
 * "ca. 8 sm Kreuz (17 kn) · davon ca. 2 sm Kreuzschläge" — die Warnzeile der
 * Etappenkarte.
 *
 * "ca." und die runde Meile sind Absicht: die Zahl beantwortet "wie lange geht
 * das so?", und eine Nachkommastelle täuschte dort eine Genauigkeit vor, die
 * eine Stunden-Simulation nicht hat. Nur unter einer Meile bleibt die Stelle
 * stehen — "ca. 0 sm" wäre keine Angabe.
 *
 * Der Zusatz steht nur da, wo wirklich gekreuzt wird. Er ist die Antwort auf
 * die Rückfrage vom 2026-08-07 ("8 sm Kreuz sind doch 13–15 sm zu segelnde
 * Strecke"): 8 sm im Kreuz-Band sind 8 sm, solange der Kurs anliegt — nur die
 * Meilen unter 55° TWA werden im Zickzack länger.
 */
export function formatKursAbschnitt(a: KursAbschnitt): string {
  const wind = formatKn(a.maxTwsKn);
  // Wird der ganze Abschnitt gekreuzt, wäre ein "davon" nur Geräusch — dann
  // heisst er, was er ist.
  if (a.kreuzNm > 0 && a.kreuzNm >= a.distanceNm - 0.05) {
    return `ca. ${abschnittSm(a.distanceNm)} sm Kreuzschläge (${wind})`;
  }
  const zeile = `ca. ${abschnittSm(a.distanceNm)} sm ${KURS_LABEL[a.kategorie]} (${wind})`;
  if (a.kreuzNm <= 0) return zeile;
  return `${zeile} · davon ca. ${abschnittSm(a.kreuzNm)} sm Kreuzschläge`;
}

/**
 * Die Regel hinter der Ampel dieser Zeile, in einem Satz — als Titel/Tooltip,
 * damit die Farbe nicht behauptet, sondern begründet ist. Gelesen wird sie aus
 * den Parametern (AD-8), nicht aus fest getippten Zahlen: wer die Schwellen in
 * der Konfiguration verschiebt, bekommt hier den verschobenen Satz.
 */
export function formatKursAmpelRegel(
  kategorie: KursKategorie,
  params: Params,
): string {
  const { gelbAbKn, rotAbKn } = kursSchwellen(kategorie, params);
  return `${KURS_LABEL[kategorie]}: über ${rotAbKn} kn rot · ${gelbAbKn}–${rotAbKn} kn gelb · unter ${gelbAbKn} kn grün`;
}
