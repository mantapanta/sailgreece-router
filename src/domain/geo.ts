/** Pure spherical geometry helpers (no I/O). */

import type { Coordinates } from './schema/common.ts';

const R_NM = 3440.065; // earth radius in nautical miles
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => ((r * 180) / Math.PI + 360) % 360;

/** Great-circle distance in nautical miles. */
export function distanceNm(a: Coordinates, b: Coordinates): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.sqrt(h));
}

/** Initial great-circle bearing from a to b, true degrees 0-360. */
export function bearingDeg(a: Coordinates, b: Coordinates): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return deg(Math.atan2(y, x));
}

/** Normalize any angle to [0, 360). */
export function normDeg(d: number): number {
  return ((d % 360) + 360) % 360;
}

/**
 * VORZEICHENBEHAFTETE Winkeldifferenz in (−180, 180]: positiv, wenn `a` im
 * Uhrzeigersinn von `b` aus liegt.
 *
 * `angleDiffDeg` faltet auf 0–180 und verliert dabei die SEITE — genau die,
 * die beim Kreuzen entscheidet, welcher Bug der lange Schlag ist.
 */
export function signedAngleDeg(a: number, b: number): number {
  const d = normDeg(a - b);
  return d > 180 ? d - 360 : d;
}

/**
 * Zielpunkt, wenn man von `from` mit rechtweisendem Kurs `bearing` die Strecke
 * `nm` läuft — die Umkehrung von bearingDeg/distanceNm auf der Kugel.
 *
 * Gebraucht wird sie, seit Kurse nicht mehr nur GEMESSEN, sondern auch GELEGT
 * werden: ein Kreuzschlag ist als Punktepaar nicht gegeben, sondern als "50°
 * zum Wind, so und so weit" (domain/kreuz.ts).
 */
export function destinationPoint(
  from: Coordinates,
  bearing: number,
  nm: number,
): Coordinates {
  const d = nm / R_NM;
  const lat1 = rad(from.lat);
  const lon1 = rad(from.lon);
  const br = rad(bearing);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return {
    lat: (lat2 * 180) / Math.PI,
    // Auf (−180, 180] normiert: die Ägäis liegt weit davon entfernt, aber ein
    // Längengrad von 361° wäre schlicht falsch.
    lon: (((((lon2 * 180) / Math.PI) + 540) % 360) - 180),
  };
}

const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

/**
 * 16-point compass name of a direction.
 *
 * Liegt hier und nicht in der Anzeige, weil die Domain selbst Richtungen
 * benennen muss: eine Begründung wie "Wind 31 kn aus NNE (25°)" ist Teil des
 * Urteils, nicht seiner Formatierung — sie sagt, WORAN die Ampel hängt.
 */
export function compassPoint(directionDeg: number): string {
  return COMPASS_POINTS[Math.round(normDeg(directionDeg) / 22.5) % 16]!;
}

/** Smallest angular difference between two directions, 0-180. */
export function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(normDeg(a) - normDeg(b)) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Umlaufsinn eines geschlossenen Kurses: negativ = IM UHRZEIGERSINN.
 *
 * Gauss'sche Trapezformel über (lon, lat) — auf einer Karte mit Norden oben
 * und Osten rechts ist das die übliche mathematische Orientierung, also
 * positiv für den Gegenuhrzeigersinn. Über ein Revier von der Grösse der
 * Kykladen ist die Verzerrung der Plattkarte für die Frage "in welche Richtung
 * läuft die Runde" bedeutungslos; es geht um das Vorzeichen, nicht um die
 * Fläche.
 *
 * Warum das überhaupt zählt: in den Kykladen wird empfohlen, im Uhrzeigersinn
 * zu routen — man kommt mit dem Meltemi im Rücken nach Süden und arbeitet sich
 * an der Westseite zurück, statt sich am Ende gegenan nach Norden zu quälen.
 */
export function signedAreaDeg2(points: Coordinates[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.lon * b.lat - b.lon * a.lat;
  }
  return sum / 2;
}

/** Läuft dieser geschlossene Kurs im Uhrzeigersinn? */
export function isClockwise(points: Coordinates[]): boolean {
  return signedAreaDeg2(points) < 0;
}

/**
 * True wind angle of the boat: angle between course-over-ground and the
 * direction the wind is COMING FROM (AD-6), folded to 0-180.
 * 0 = dead upwind, 180 = dead downwind.
 */
export function twaDeg(courseDeg: number, windFromDeg: number): number {
  return angleDiffDeg(courseDeg, windFromDeg);
}
