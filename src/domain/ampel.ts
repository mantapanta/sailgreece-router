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
 *
 * WELLEN GEHEN NICHT IN DIE PLATZ-AMPEL EIN (Skipper-Entscheidung 2026-08-05).
 * Die Wellenhöhe des Modells ist eine Aussage über die offene See; im Hafen und
 * hinter der Landzunge einer Bucht gilt sie nicht. Sie an einer kuratierten
 * Wellengrenze zu messen, verwechselt zwei Orte und erzeugt genau den Fehler,
 * der die Regel ausgelöst hat: Serifos/Livadi stand auf ROT, obwohl 17 kn Nord
 * mitten im Schutzsektor lagen (Grenze 30 kn) — allein die 1,2 m offene See
 * gegen eine kuratierte 0,5-m-Grenze kippten das Urteil, und die Begründung
 * behauptete dann auch noch, die Nacht liege "außerhalb der Schutzsektoren".
 *
 * Die kuratierten `waveSectors` bleiben im Schema und in der Bibliothek: sie
 * sind gesammeltes Wissen über den Platz und werden angezeigt. Sie bewerten
 * nur nichts mehr. Was Wind an einem Liegeplatz anrichtet, sagen die
 * Windsektoren — und die sind genau dafür kuratiert.
 */

import type { WindSector } from './schema/shelter.ts';
import type { Place } from './schema/place.ts';
import type { Params } from './schema/params.ts';
import type {
  DataBasis,
  PlanningSnapshot,
  PlaceNightAssessment,
} from './schema/snapshot.ts';
import { worstAmpel, type Ampel } from './schema/common.ts';
import { compassPoint, normDeg } from './geo.ts';
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

/**
 * Shelter limit that governs a direction, or null when no sector covers it.
 *
 * DECISION (documented, fixture-covered): overlapping curated sectors are
 * independent shelter statements about the same direction — the MOST GENEROUS
 * limit wins (Math.max). A curator who wants a stricter limit must narrow the
 * broader sector instead of overlaying a stricter one.
 */
export function windSectorLimitKn(
  sectors: WindSector[],
  windFromDeg: number,
): number | null {
  const matching = sectors.filter((s) => sectorContains(s, windFromDeg));
  return matching.length > 0 ? Math.max(...matching.map((s) => s.maxKn)) : null;
}

/** Verdict for one hour of wind at a place. */
export function windHourAmpel(
  sectors: WindSector[],
  windFromDeg: number,
  windKn: number,
  params: Params,
): Ampel {
  const limit = windSectorLimitKn(sectors, windFromDeg);
  if (limit === null) {
    // Unprotected direction (luv): never green under meaningful wind.
    return windKn <= params.openSectorMaxKn ? 'gelb' : 'rot';
  }
  if (windKn <= limit - params.gelbReserveKn) return 'gruen';
  if (windKn <= limit) return 'gelb';
  return 'rot';
}

/** Die Stunde, die das Urteil trägt — Grundlage der Begründung. */
interface GoverningHour {
  verdict: Ampel;
  windKn: number;
  windFromDeg: number;
  /** Schutzgrenze des Sektors, oder null für eine ungeschützte Richtung. */
  limitKn: number | null;
}

/**
 * Warum diese Ampel — benannt an der Stunde, die sie erzwungen hat.
 *
 * Der alte Text ("Nacht außerhalb der Schutzsektoren") behauptete IMMER eine
 * Richtung ausserhalb der Sektoren, auch wenn der Wind mitten im Sektor stand
 * und nur die Stärke über der Grenze lag — oder, vor dieser Änderung, wenn gar
 * nicht der Wind, sondern die Welle das Urteil gefällt hatte. Eine Begründung,
 * die auf die falsche Ursache zeigt, ist schlimmer als keine: sie schickt den
 * Skipper zum falschen Sektor in der Tabelle darunter.
 */
function windReason(h: GoverningHour, params: Params): string {
  const wind = `${Math.round(h.windKn)} kn aus ${compassPoint(h.windFromDeg)} (${Math.round(
    normDeg(h.windFromDeg),
  )}°)`;
  if (h.limitKn === null) {
    return h.verdict === 'rot'
      ? `Wind ${wind} — Richtung liegt in keinem Schutzsektor, und über ${params.openSectorMaxKn} kn ist ein ungeschützter Liegeplatz nicht mehr tragbar`
      : `Wind ${wind} — Richtung liegt in keinem Schutzsektor, bei dieser Stärke aber noch tragbar`;
  }
  return h.verdict === 'rot'
    ? `Wind ${wind} über der Schutzgrenze dieses Sektors (${h.limitKn} kn)`
    : `Wind ${wind} innerhalb des Schutzsektors, aber in der Reserve vor der Grenze (${h.limitKn} kn, Reserve ${params.gelbReserveKn} kn)`;
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
 * Place traffic light for night N: the WIND forecast mapped onto the shelter
 * profile over the overnight window [N 18:00, N+1 09:00) Athens.
 * Missing wind hours (null / beyond horizon) => 'unbewertet' contribution —
 * never green, never silently hidden.
 *
 * Die Wellenhöhe wird weiterhin mitgeführt und ausgegeben (`maxWaveM`), aber
 * sie bewertet nichts — siehe Modulkopf. Eine fehlende Marine-Stunde macht die
 * Nacht deshalb auch nicht mehr 'unbewertet': der Marine-Horizont endet
 * regelmäßig früher als der Wind-Horizont, und ein Wert, der nicht zählt, darf
 * ein Urteil nicht blockieren, das ohne ihn vollständig ist.
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
  let assumedHours = 0;
  /** Schlechteste Stunde, bei Gleichstand die mit dem meisten Wind. */
  let governing: GoverningHour | null = null;

  for (const i of indices) {
    // Nur `windAssumed`: die Wellen-Annahme trägt kein Urteil mehr, also darf
    // sie die Nacht auch nicht als "beruht auf Annahme" markieren.
    if (fc.windAssumed[i]) assumedHours++;
    const wKn = fc.windKn[i] ?? null;
    const wDir = fc.windDirDeg[i] ?? null;
    if (wKn === null || wDir === null) {
      sawNullWind = true;
      verdicts.push('unbewertet');
    } else {
      const limitKn = windSectorLimitKn(place.shelter.windSectors, wDir);
      const verdict = windHourAmpel(place.shelter.windSectors, wDir, wKn, params);
      verdicts.push(verdict);
      if (
        governing === null ||
        AMPEL_RANK[verdict] > AMPEL_RANK[governing.verdict] ||
        (verdict === governing.verdict && wKn > governing.windKn)
      ) {
        governing = { verdict, windKn: wKn, windFromDeg: wDir, limitKn };
      }
      if (maxWindKn === null || wKn > maxWindKn) {
        maxWindKn = wKn;
        windDirDeg = wDir;
      }
    }
    // Nur für die Anzeige — siehe Modulkopf: die Welle bewertet nichts.
    const hM = fc.waveM[i] ?? null;
    if (hM !== null && (maxWaveM === null || hM > maxWaveM)) maxWaveM = hM;
  }

  const forecastAmpel = worstAmpel(verdicts);
  if (sawNullWind) reasons.push('Wind-Forecast unvollständig (Horizont)');
  // Die Begründung nennt die Stunde, die das Urteil trägt — nicht eine
  // Pauschalformel, die auch dann von "außerhalb der Sektoren" spricht, wenn
  // der Wind mitten im Sektor stand.
  if (
    (forecastAmpel === 'rot' || forecastAmpel === 'gelb') &&
    governing !== null &&
    governing.verdict === forecastAmpel
  ) {
    reasons.push(windReason(governing, params));
  }

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
