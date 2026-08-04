/**
 * Geometry of a stage on the map — the ONE place that turns a stage into
 * coordinates.
 *
 * Both the map view (whole round trip) and the day card's calculation panel
 * (one day, zoomed in) draw from here, so a line and its markers can never
 * disagree: `stagePath` is literally the positions of `stagePoints`.
 *
 * Order along the stage: start place, its leg's waypoints, the junction place
 * where the next leg begins, its waypoints, ... , destination place. A junction
 * appears ONCE, not twice — it is the same harbour, whether read as the end of
 * one leg or the start of the next.
 */

import type { Leg } from '../domain/schema/route.ts';
import type { PlanningSnapshot, StageAssessment } from '../domain/schema/snapshot.ts';
import { legWaypointKey } from '../domain/scoring.ts';

export interface StagePoint {
  /** Stable React key; a place can occur twice in a stage (out and back). */
  key: string;
  /**
   * Forecast key dieses Punktes — identisch mit `LegHourBreakdown.pointKey`.
   * Darüber matchen Kartennummer und Tabellenzeile.
   */
  forecastKey: string;
  position: google.maps.LatLngLiteral;
  kind: 'platz' | 'wegpunkt';
  label: string;
  /** Laufende Nummer im Tag — auf der Karte UND in der Rechnung dieselbe. */
  nummer: number;
  /** 'platz' only: enables the link into the place detail view. */
  placeId?: string;
}

/**
 * Record instead of a JS Map: in the map view the identifier `Map` is taken by
 * @vis.gl/react-google-maps. First occurrence wins — leg ids are unique by
 * import cross-check, so a duplicate would be a data error, not a choice.
 */
export function buildLegsById(legs: Leg[]): Record<string, Leg> {
  const byId: Record<string, Leg> = {};
  for (const leg of legs) byId[leg.id] ??= leg;
  return byId;
}

export function stagePoints(
  stage: StageAssessment,
  legsById: Record<string, Leg>,
  snapshot: PlanningSnapshot,
): StagePoint[] {
  const out: StagePoint[] = [];

  const pushPlace = (placeId: string) => {
    const place = snapshot.library.places.find((p) => p.id === placeId);
    if (!place) return;
    const last = out[out.length - 1];
    // Junction dedupe: the previous leg already ended here.
    if (last?.kind === 'platz' && last.placeId === placeId) return;
    out.push({
      key: `platz-${placeId}-${out.length}`,
      // Der Forecast eines Platzes liegt unter seiner Platz-Id (siehe
      // legPoints in domain/scoring.ts).
      forecastKey: placeId,
      position: { lat: place.coordinates.lat, lng: place.coordinates.lon },
      kind: 'platz',
      label: place.name,
      nummer: out.length + 1,
      placeId,
    });
  };

  stage.legs.forEach((legAssessment, i) => {
    const leg = legsById[legAssessment.legId];
    if (!leg) return;
    if (i === 0) pushPlace(leg.fromPlaceId);
    leg.waypoints.forEach((w, n) => {
      out.push({
        key: `wegpunkt-${legAssessment.legId}-${n}`,
        // Abgeleitete Etappen tragen die Keys ihrer ORIGINAL-Etappe — dieselbe
        // Regel wie in legPoints, sonst zeigt die Karte auf einen Punkt, für
        // den nie ein Forecast geholt wurde.
        forecastKey: leg.waypointKeys?.[n] ?? legWaypointKey(leg.id, n),
        position: { lat: w.lat, lng: w.lon },
        kind: 'wegpunkt',
        label: `Wegpunkt`,
        nummer: out.length + 1,
      });
    });
    pushPlace(leg.toPlaceId);
  });

  return out;
}

/**
 * Punkt-Nummer je Forecast-Key. Die Rechnung nennt pro Stunde nur den Key;
 * die Nummer daraus kommt von hier, damit Tabelle und Karte dieselbe Zahl
 * zeigen. Ein Key kann an einem Tag zweimal vorkommen (Hin- und Rückweg am
 * selben Platz) — dann gewinnt das erste Auftreten, weil die Rechnung
 * chronologisch gelesen wird.
 */
export function pointNumberByForecastKey(points: StagePoint[]): Record<string, number> {
  const byKey: Record<string, number> = {};
  for (const p of points) byKey[p.forecastKey] ??= p.nummer;
  return byKey;
}

/** Geographic path of the legs of one stage, start place to destination. */
export function stagePath(
  stage: StageAssessment,
  legsById: Record<string, Leg>,
  snapshot: PlanningSnapshot,
): google.maps.LatLngLiteral[] {
  return stagePoints(stage, legsById, snapshot).map((p) => p.position);
}
