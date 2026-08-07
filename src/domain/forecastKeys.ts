/**
 * DIE NORMATIVE ORTSMENGE (AD-3) — welche Schlüssel es im Forecast gibt.
 *
 * Sie stand bis 2026-08-07 als `collectLocations` im Adapter, weil nur der
 * Adapter sie brauchte: er baut daraus die Anfrage. Seit die topografische
 * Korrektur (domain/windTopo.ts) zu JEDEM Forecast-Schlüssel die Koordinate
 * braucht, gibt es einen zweiten Leser — und zwei Aufzählungen derselben Menge
 * wären zwei Wahrheiten darüber, welche Orte es gibt. Der Adapter delegiert
 * jetzt hierher; die Menge selbst ist unverändert.
 *
 * WARUM `domain/` UND NICHT `adapters/`: die Regel "Plätze plus Etappen-
 * Wegpunkte" ist eine Domänen-Entscheidung (AD-3), keine Eigenschaft von
 * Open-Meteo. Läge sie in `adapters/`, müsste `domain/` von `adapters/`
 * importieren — die Schichtung auf den Kopf gestellt.
 *
 * Pur: kein I/O, keine Open-Meteo-Vokabeln.
 */

import type { Coordinates } from './schema/common.ts';
import type { Leg } from './schema/route.ts';
import type { Library } from './schema/snapshot.ts';

/** Normative forecast key for the nth waypoint of a leg (AD-3). */
export function legWaypointKey(legId: string, n: number): string {
  return `leg:${legId}:${n}`;
}

/**
 * Der Forecast-Schlüssel des n-ten Wegpunktes EINER Etappe.
 *
 * ABGELEITETE Etappen (umgedrehte Verbinder) tragen die Schlüssel ihrer
 * ORIGINAL gespeicherten Richtung in `waypointKeys` — nur die wurden abgerufen.
 * Wer das übergeht, liest für die halbe Bibliothek ins Leere.
 */
export function waypointKeyOf(leg: Leg, n: number): string {
  return leg.waypointKeys?.[n] ?? legWaypointKey(leg.id, n);
}

export interface ForecastLocation {
  key: string;
  coordinates: Coordinates;
}

/**
 * Alle Orte, für die es einen Forecast gibt: JEDER kuratierte Platz (Schlüssel
 * = Platz-Id) plus JEDER Wegpunkt der Etappen-Bibliothek (Schlüssel
 * `leg:<id>:<n>`). Dedupliziert, Plätze zuerst.
 */
export function forecastLocations(library: Library): ForecastLocation[] {
  const entries: ForecastLocation[] = library.places.map((p) => ({
    key: p.id,
    coordinates: p.coordinates,
  }));
  const seen = new Set(entries.map((e) => e.key));
  for (const leg of library.legs) {
    leg.waypoints.forEach((w, n) => {
      const key = waypointKeyOf(leg, n);
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({ key, coordinates: w });
      }
    });
  }
  return entries;
}

/** Dieselbe Menge als Nachschlagetabelle — für "wo liegt dieser Schlüssel?". */
export function forecastCoordinates(library: Library): Map<string, Coordinates> {
  return new Map(forecastLocations(library).map((l) => [l.key, l.coordinates]));
}
