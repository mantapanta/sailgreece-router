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

/** Smallest angular difference between two directions, 0-180. */
export function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(normDeg(a) - normDeg(b)) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * True wind angle of the boat: angle between course-over-ground and the
 * direction the wind is COMING FROM (AD-6), folded to 0-180.
 * 0 = dead upwind, 180 = dead downwind.
 */
export function twaDeg(courseDeg: number, windFromDeg: number): number {
  return angleDiffDeg(courseDeg, windFromDeg);
}
