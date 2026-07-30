/**
 * FR8 / AD-6 — deterministic place traffic light for a given night.
 * Every place ampel is a function (place, nightN, snapshot) — there is no
 * "current" ampel without a night parameter (AD-9).
 *
 * Direction semantics (AD-6): wind/wave directions are "coming from", true
 * degrees. Shelter sectors describe directions the place is protected FROM,
 * clockwise from fromDeg to toDeg, wrap across north allowed, boundaries
 * inclusive.
 *
 * The universal lee/luv rule (FR7: "lee is always protected, luv never") is
 * a RUNTIME rule living here (AD-10): curated sectors are the lee statement;
 * any direction outside all sectors is treated as unprotected (luv) — it can
 * never be green under meaningful wind, only yellow (calm) or red.
 */

import type { WindSector, WaveSector } from './schema/shelter.ts';
import type { Place } from './schema/place.ts';
import type { Params } from './schema/params.ts';
import type {
  PlanningSnapshot,
  PlaceNightAssessment,
} from './schema/snapshot.ts';
import { worstAmpel, type Ampel } from './schema/common.ts';
import { normDeg } from './geo.ts';
import { hourIndices, nightWindow } from './time.ts';

/**
 * Sector membership: CW from->to, wrap over 360->0 allowed, inclusive.
 * A sector whose bounds normalize to the same direction (e.g. 0-360)
 * covers the full circle.
 */
export function sectorContains(
  sector: { fromDeg: number; toDeg: number },
  directionDeg: number,
): boolean {
  const d = normDeg(directionDeg);
  const from = normDeg(sector.fromDeg);
  const to = normDeg(sector.toDeg);
  if (from === to) return true; // full circle (0-360, 360-720, ...)
  if (from < to) return d >= from && d <= to;
  // wrap across north, e.g. 330-60
  return d >= from || d <= to;
}

/** Verdict for one hour of wind at a place. */
export function windHourAmpel(
  sectors: WindSector[],
  windFromDeg: number,
  windKn: number,
  params: Params,
): Ampel {
  const matching = sectors.filter((s) => sectorContains(s, windFromDeg));
  if (matching.length > 0) {
    const limit = Math.max(...matching.map((s) => s.maxKn));
    if (windKn <= limit - params.gelbReserveKn) return 'gruen';
    if (windKn <= limit) return 'gelb';
    return 'rot';
  }
  // Unprotected direction (luv): never green under meaningful wind.
  return windKn <= params.openSectorMaxKn ? 'gelb' : 'rot';
}

/** Verdict for one hour of waves at a place. */
export function waveHourAmpel(
  sectors: WaveSector[],
  waveFromDeg: number,
  waveM: number,
  params: Params,
): Ampel {
  const matching = sectors.filter((s) => sectorContains(s, waveFromDeg));
  if (matching.length > 0) {
    const limit = Math.max(...matching.map((s) => s.maxM));
    return waveM <= limit ? 'gruen' : 'rot';
  }
  return waveM <= params.openSectorMaxWaveM ? 'gelb' : 'rot';
}

/**
 * Place traffic light for night N: forecast (wind + waves) mapped onto the
 * shelter profile over the overnight window [N 18:00, N+1 09:00) Athens.
 * Missing hours (null / beyond horizon) => 'unbewertet' contribution —
 * never green, never silently hidden.
 */
export function placeNightAmpel(
  place: Place,
  nightDay: number,
  snapshot: PlanningSnapshot,
): PlaceNightAssessment {
  const { params } = snapshot;
  const window = nightWindow(
    params.tripStartDate,
    nightDay,
    params.nightStartHourAthens,
    params.nightEndHourAthens,
  );
  const indices = hourIndices(window, snapshot.times);
  const fc = snapshot.forecast[place.id];
  const reasons: string[] = [];

  if (!fc || indices.length === 0) {
    return {
      placeId: place.id,
      nightDay,
      ampel: 'unbewertet',
      maxWindKn: null,
      windDirDeg: null,
      maxWaveM: null,
      reasons: ['Kein Forecast für diesen Platz/Zeitraum'],
    };
  }

  const verdicts: Ampel[] = [];
  let maxWindKn: number | null = null;
  let windDirDeg: number | null = null;
  let maxWaveM: number | null = null;
  let sawNullWind = false;
  let sawNullWave = false;

  for (const i of indices) {
    const wKn = fc.windKn[i] ?? null;
    const wDir = fc.windDirDeg[i] ?? null;
    if (wKn === null || wDir === null) {
      sawNullWind = true;
      verdicts.push('unbewertet');
    } else {
      verdicts.push(windHourAmpel(place.shelter.windSectors, wDir, wKn, params));
      if (maxWindKn === null || wKn > maxWindKn) {
        maxWindKn = wKn;
        windDirDeg = wDir;
      }
    }
    const hM = fc.waveM[i] ?? null;
    const hDir = fc.waveDirDeg[i] ?? null;
    if (hM === null || hDir === null) {
      sawNullWave = true;
      verdicts.push('unbewertet');
    } else {
      verdicts.push(waveHourAmpel(place.shelter.waveSectors, hDir, hM, params));
      if (maxWaveM === null || hM > maxWaveM) maxWaveM = hM;
    }
  }

  const ampel = worstAmpel(verdicts);
  if (sawNullWind) reasons.push('Wind-Forecast unvollständig (Horizont)');
  if (sawNullWave) reasons.push('Wellen-Forecast unvollständig (Marine-Horizont)');
  if (ampel === 'rot') reasons.push('Nacht außerhalb des Schutzprofils');
  if (ampel === 'gelb' && !sawNullWind && !sawNullWave)
    reasons.push('Nahe an der Schutzgrenze oder ungeschützte Richtung bei Schwachwind');

  return { placeId: place.id, nightDay, ampel, maxWindKn, windDirDeg, maxWaveM, reasons };
}

const AMPEL_RANK: Record<Ampel, number> = {
  gruen: 0,
  gelb: 1,
  unbewertet: 2,
  rot: 3,
};

/**
 * AD-2: ranking over domain values is domain logic — the best place of an
 * island comes from the assessment, not from the view.
 * Order: ampel (green best), then beauty, then restaurant + beach, then name.
 */
export function rankPlacesForNight(
  places: Place[],
  ampelByPlaceId: Record<string, Ampel>,
): Place[] {
  return [...places].sort((a, b) => {
    const ra = AMPEL_RANK[ampelByPlaceId[a.id] ?? 'unbewertet'];
    const rb = AMPEL_RANK[ampelByPlaceId[b.id] ?? 'unbewertet'];
    if (ra !== rb) return ra - rb;
    if (a.qualities.schoenheit !== b.qualities.schoenheit)
      return b.qualities.schoenheit - a.qualities.schoenheit;
    const qa = a.qualities.restaurant + a.qualities.badestrand;
    const qb = b.qualities.restaurant + b.qualities.badestrand;
    if (qa !== qb) return qb - qa;
    return a.name.localeCompare(b.name);
  });
}
