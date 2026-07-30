/**
 * FR26 / AD-10 — polar speed function.
 * Bilinear interpolation over the polar grid. The +0.5 kn ship offset
 * (params.polarOffsetKn) is added HERE and NOWHERE ELSE. Motoring speed is
 * its own parameter (no offset). Flat fallback speeds apply ONLY while no
 * polar is loaded.
 */

import type { Polar } from './schema/polar.ts';
import type { Params } from './schema/params.ts';

function interp1(xs: number[], x: number): { i0: number; i1: number; t: number } {
  if (x <= xs[0]!) return { i0: 0, i1: 0, t: 0 };
  const last = xs.length - 1;
  if (x >= xs[last]!) return { i0: last, i1: last, t: 0 };
  for (let i = 0; i < last; i++) {
    const a = xs[i]!;
    const b = xs[i + 1]!;
    if (x >= a && x <= b) {
      return { i0: i, i1: i + 1, t: b === a ? 0 : (x - a) / (b - a) };
    }
  }
  return { i0: last, i1: last, t: 0 };
}

/** Raw polar lookup (kn) WITHOUT offset — bilinear over TWA x TWS, clamped at grid edges. */
export function rawPolarSpeedKn(polar: Polar, twa: number, twsKn: number): number {
  const twaFolded = Math.min(Math.abs(twa), 360 - Math.abs(twa)) % 360;
  const a = interp1(polar.twaDeg, Math.min(180, Math.max(0, twaFolded)));
  const w = interp1(polar.twsKn, Math.max(0, twsKn));
  const s00 = polar.speeds[a.i0]![w.i0]!;
  const s01 = polar.speeds[a.i0]![w.i1]!;
  const s10 = polar.speeds[a.i1]![w.i0]!;
  const s11 = polar.speeds[a.i1]![w.i1]!;
  const s0 = s00 + (s01 - s00) * w.t;
  const s1 = s10 + (s11 - s10) * w.t;
  return s0 + (s1 - s0) * a.t;
}

/**
 * Boat sailing speed in kn for a given TWA/TWS, INCLUDING the ship offset —
 * the single place where params.polarOffsetKn is applied (AD-10).
 * Returns 0 at TWA/TWS combinations where the polar yields 0 (offset is not
 * applied to a standing boat).
 */
export function sailSpeedKn(polar: Polar, twa: number, twsKn: number, params: Params): number {
  const raw = rawPolarSpeedKn(polar, twa, twsKn);
  if (raw <= 0) return 0;
  return raw + params.polarOffsetKn;
}

/** Motoring speed (own parameter, FR26 — no polar offset). */
export function motorSpeedKn(params: Params): number {
  return params.motorSpeedKn;
}

/**
 * Fallback planning speed (kn) — ONLY while no polar is loaded (FR26).
 * 6.0 kn sail / 7.5 kn motor / 6.5 kn upwind.
 */
export function fallbackSpeedKn(upwind: boolean, motoring: boolean, params: Params): number {
  if (motoring) return params.fallbackSpeeds.motorKn;
  return upwind ? params.fallbackSpeeds.upwindKn : params.fallbackSpeeds.sailKn;
}
