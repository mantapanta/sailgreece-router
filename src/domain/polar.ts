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
  // Fold ANY angle to 0-180 (e.g. -90 -> 90, 270 -> 90, 540 -> 180). The old
  // `min(|twa|, 360-|twa|)` folded 540 to 0 (upwind instead of downwind).
  const t = Math.abs(twa) % 360;
  const twaFolded = t > 180 ? 360 - t : t;
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
 * KREUZ-FAKTOR — was von der Fahrt durchs Wasser auf dem ANLIEGENDEN KURS
 * ankommt, wenn das Ziel enger am Wind liegt als `params.beatTwaDeg`.
 *
 * Das Schiff kann höchstens `beatTwaDeg` (50°, Skipper 2026-08-06) am Wind
 * segeln. Liegt das Ziel bei 22° zum Wind, wird es NICHT angelegen — es wird
 * gekreuzt, und von der gesegelten Strecke kommt nur ein Teil auf der Ideallinie
 * an. Geometrie der symmetrischen Kreuz: die Höhe zum Wind ist auf beiden
 * Schlägen v·cos(beat); um auf einem Kurs mit TWA `twa` die Strecke D gutzumachen,
 * muss genau D·cos(twa) an Höhe gutgemacht werden. Also
 *
 *     v_kurs = v(beat) · cos(beat) / cos(twa).
 *
 * Bei twa = beat ist der Faktor 1 (die Kreuz beginnt stetig), bei twa = 0
 * cos(beat) = 0,64 — die klassische Am-Wind-VMG. Der Kehrwert ist zugleich der
 * UMWEG: bei 22° werden 1,44 sm durchs Wasser gesegelt, um 1 sm Kurs zu machen.
 *
 * Die vorige Formel `cos(beat − twa)` hat denselben Fall um bis zu 30 % zu gut
 * gerechnet: bei 22° TWA ergab sie 0,92 statt 0,69 — eine Etappe, die in
 * Wahrheit gekreuzt werden muss, sah damit fast so schnell aus wie ein
 * anliegender Am-Wind-Kurs.
 */
export function kreuzFactor(twa: number, params: Params): number {
  const t = foldTwa(twa);
  if (t >= params.beatTwaDeg) return 1;
  const rad = (d: number) => (d * Math.PI) / 180;
  return Math.cos(rad(params.beatTwaDeg)) / Math.cos(rad(t));
}

/** Any angle folded to 0-180 — the same folding rawPolarSpeedKn applies. */
function foldTwa(twa: number): number {
  const t = Math.abs(twa) % 360;
  return t > 180 ? 360 - t : t;
}

/** Fahrt auf dem anliegenden Kurs, inklusive Kreuz-Modell. */
export interface CourseSpeed {
  /** Fahrt LÄNGS DES ANLIEGENDEN KURSES (kn) — was die Etappe wirklich vorankommt. */
  speedKn: number;
  /** Fahrt durchs Wasser auf dem gesegelten Winkel (kn); beim Kreuzen höher. */
  boatSpeedKn: number;
  /** Der Winkel, der wirklich gesegelt wird — beim Kreuzen `params.beatTwaDeg`. */
  sailedTwaDeg: number;
  /** True, wenn der Kurs enger am Wind liegt als das Schiff segeln kann. */
  kreuzen: boolean;
}

/**
 * Fahrt auf dem anliegenden Kurs bei gegebenem TWA/TWS — die EINE Stelle, an
 * der aus Polare und Kreuz-Grenze eine Geschwindigkeit über Grund wird.
 *
 * Oberhalb von `beatTwaDeg` liest sie schlicht die Polare. Darunter wird
 * gekreuzt: gesegelt wird bei `beatTwaDeg`, und auf den Kurs kommt davon
 * {@link kreuzFactor} an.
 */
export function courseSpeedKn(
  polar: Polar,
  twa: number,
  twsKn: number,
  params: Params,
): CourseSpeed {
  const t = foldTwa(twa);
  if (t >= params.beatTwaDeg) {
    const v = sailSpeedKn(polar, t, twsKn, params);
    return { speedKn: v, boatSpeedKn: v, sailedTwaDeg: t, kreuzen: false };
  }
  const boat = sailSpeedKn(polar, params.beatTwaDeg, twsKn, params);
  return {
    speedKn: boat * kreuzFactor(t, params),
    boatSpeedKn: boat,
    sailedTwaDeg: params.beatTwaDeg,
    kreuzen: true,
  };
}

/**
 * Fallback planning speed (kn) — ONLY while no polar is loaded (FR26).
 * 6.0 kn sail / 7.5 kn motor / 6.5 kn upwind.
 */
export function fallbackSpeedKn(upwind: boolean, motoring: boolean, params: Params): number {
  if (motoring) return params.fallbackSpeeds.motorKn;
  return upwind ? params.fallbackSpeeds.upwindKn : params.fallbackSpeeds.sailKn;
}
