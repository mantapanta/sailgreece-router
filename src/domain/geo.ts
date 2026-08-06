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

/**
 * Kürzester Abstand eines Punktes zu einem KURSABSCHNITT in sm — Querab-Abstand
 * (cross track), aber an den Enden auf den Endpunkt geklemmt.
 *
 * Gebraucht für die Frage "liegt das an unserer Strecke?" (domain/kite.ts). Der
 * reine Querab-Abstand allein taugt dafür nicht: er misst zur VERLÄNGERTEN
 * Grosskreislinie, und damit läge ein Spot 200 sm hinter dem Ziel noch "0,5 sm
 * neben dem Kurs". Deshalb wird zuerst geprüft, ob der Fusspunkt überhaupt
 * zwischen den Enden liegt — sonst gilt der Abstand zum näheren Ende.
 */
export function distanceToSegmentNm(
  point: Coordinates,
  segStart: Coordinates,
  segEnd: Coordinates,
): number {
  const d12 = distanceNm(segStart, segEnd);
  // Entartetes Segment (identische Enden): es gibt keine Richtung, nur den Punkt.
  if (d12 === 0) return distanceNm(point, segStart);
  const d13 = distanceNm(segStart, point);
  if (d13 === 0) return 0;
  const delta = signedAngleDeg(bearingDeg(segStart, point), bearingDeg(segStart, segEnd));
  // Fusspunkt liegt VOR dem Start: der Startpunkt ist der nächste Punkt.
  if (Math.abs(delta) > 90) return d13;
  const dxt = Math.asin(Math.sin(d13 / R_NM) * Math.sin(rad(delta))) * R_NM;
  const dat =
    Math.acos(
      // Rundungsfehler können den Quotienten minimal über 1 schieben; acos
      // liefert dann NaN und der Abstand wäre nicht mehr vergleichbar.
      Math.min(1, Math.max(-1, Math.cos(d13 / R_NM) / Math.cos(dxt / R_NM))),
    ) * R_NM;
  // Fusspunkt liegt hinter dem Ziel: der Endpunkt ist der nächste Punkt.
  if (dat > d12) return distanceNm(point, segEnd);
  return Math.abs(dxt);
}

/**
 * Kürzester Abstand zu einem POLYGONZUG (Etappenkurs mit Wegpunkten) in sm.
 * Leerer oder einpunktiger Zug: null — ohne Kurs gibt es keinen Abstand zu ihm,
 * und eine 0 wäre die Behauptung "liegt genau darauf".
 */
export function distanceToPathNm(
  point: Coordinates,
  path: Coordinates[],
): number | null {
  if (path.length === 0) return null;
  if (path.length === 1) return distanceNm(point, path[0]!);
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const d = distanceToSegmentNm(point, path[i - 1]!, path[i]!);
    if (d < best) best = d;
  }
  return best;
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
