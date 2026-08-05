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
 *
 * Curation confidence is part of the same rule family: a place whose SECTORS
 * are disputed is not a place the app may recommend for the night, however
 * favourable the forecast reads. `confidence: 'niedrig'` therefore caps the
 * verdict at yellow — the same shape as "uncurated places never go green".
 */

import type { WindSector, WaveSector } from './schema/shelter.ts';
import type { Place } from './schema/place.ts';
import type { Params } from './schema/params.ts';
import type {
  DataBasis,
  PlanningSnapshot,
  PlaceNightAssessment,
} from './schema/snapshot.ts';
import { worstAmpel, type Ampel } from './schema/common.ts';
import { normDeg } from './geo.ts';
import { hourIndices, nightWindow } from './time.ts';

/**
 * Sector membership: CW from->to, wrap over 360->0 allowed, inclusive.
 * A sector whose bounds normalize to the same direction covers the full
 * circle — by schema (shelter.ts) this is only reachable as exactly 0-360;
 * point sectors (350-350 typos) are rejected at validation time.
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
    // DECISION (documented, fixture-covered): overlapping curated sectors are
    // independent shelter statements about the same direction — the MOST
    // GENEROUS limit wins (Math.max). A curator who wants a stricter limit
    // must narrow the broader sector instead of overlaying a stricter one.
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
    // Overlap decision as in windHourAmpel: most generous limit wins.
    const limit = Math.max(...matching.map((s) => s.maxM));
    // DECISION (documented, fixture-covered): waves have NO yellow reserve
    // band — curated wave limits are already conservative comfort limits and
    // wave forecasts are coarser than wind; a synthetic yellow band would
    // suggest precision the marine model does not have. Green up to the
    // limit (inclusive), red above — asymmetric to wind on purpose.
    return waveM <= limit ? 'gruen' : 'rot';
  }
  return waveM <= params.openSectorMaxWaveM ? 'gelb' : 'rot';
}

/**
 * Cap a forecast verdict by how well the curation is backed by sources.
 *
 * Only 'niedrig' caps, and only green -> yellow. Rationale:
 *   - 'niedrig' marks a place whose SECTORS are in dispute between sources
 *     (e.g. a bay one source calls Meltemi-safe and another calls exposed).
 *     Green would recommend it for the night on evidence that is contested.
 *   - Yellow, not red: the forecast statement is not wrong, it is unverified.
 *     Red would hide the place from the planner and overstate the knowledge
 *     just as much as green does.
 *   - An ABSENT confidence field changes nothing. Most of the library predates
 *     the field; treating "not stated" as "doubtful" would turn the whole
 *     library yellow and make the signal worthless.
 *
 * Deliberately NOT included: `berthingDetails.confidence`. That grades
 * berth-level facts (depth, holding ground, fees), a different axis from the
 * shelter sectors this verdict is built on.
 */
function capByConfidence(ampel: Ampel, place: Place, reasons: string[]): Ampel {
  if (place.confidence !== 'niedrig' || ampel !== 'gruen') return ampel;
  reasons.push(
    'Kuratierung unsicher (Quellen widersprechen sich) — nicht als sicherer Liegeplatz für die Nacht empfohlen',
  );
  return 'gelb';
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
      basis: 'forecast',
      reasons: ['Kein Forecast für diesen Platz/Zeitraum'],
    };
  }

  const verdicts: Ampel[] = [];
  let maxWindKn: number | null = null;
  let windDirDeg: number | null = null;
  let maxWaveM: number | null = null;
  let sawNullWind = false;
  let sawNullWave = false;
  let assumedHours = 0;

  for (const i of indices) {
    if (fc.windAssumed[i] || fc.waveAssumed[i]) assumedHours++;
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

  const forecastAmpel = worstAmpel(verdicts);
  if (sawNullWind) reasons.push('Wind-Forecast unvollständig (Horizont)');
  if (sawNullWave) reasons.push('Wellen-Forecast unvollständig (Marine-Horizont)');
  if (forecastAmpel === 'rot') reasons.push('Nacht außerhalb der Schutzsektoren');
  if (forecastAmpel === 'gelb' && !sawNullWind && !sawNullWave)
    reasons.push('Nahe an der Schutzgrenze oder ungeschützte Richtung bei Schwachwind');

  const basis: DataBasis = assumedHours > 0 ? 'annahme' : 'forecast';
  if (basis === 'annahme') {
    reasons.push(
      `${assumedHours} von ${indices.length} Nachtstunden aus der Persistenz-Annahme (jenseits des Forecast-Horizonts)`,
    );
  }

  const ampel = capByConfidence(forecastAmpel, place, reasons);

  return {
    placeId: place.id,
    nightDay,
    ampel,
    maxWindKn,
    windDirDeg,
    maxWaveM,
    basis,
    reasons,
  };
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
