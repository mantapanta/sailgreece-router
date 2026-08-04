/**
 * Kontextfilter: welche Inseln sind von einer Ausgangsinsel aus ein
 * TAGESZIEL? (Feedback 2026-08-05, Punkt 2.)
 *
 * Das Etappenziel-Dropdown listete alle Inseln des Reviers alphabetisch —
 * inklusive Zielen, die mehrere Tagesreisen entfernt liegen. Der Filter ist
 * die Reichweiten-Regel des Skippers, wörtlich: erreichbar ist, was "im best
 * case Szenario (8 Stunden zzgl. nachttrip = 100 sm range, Wind von hinten
 * oder von der Seite) erreichbar" ist, "bzw 50 sm Range Wind von vorne".
 *
 * Bewusst ein VORFILTER aus festen sm-Werten (params), NICHT aus der Polare
 * gerechnet: er bestimmt nur, was zur Auswahl steht. Ob die konkrete Etappe
 * an ihrem Tag fahrbar ist, beurteilt weiterhin die Etappen-Simulation
 * (scoring.ts) — zwei verschiedene Fragen, zwei verschiedene Werkzeuge.
 *
 * Rein (AD-2): Zeit/Position injiziert, keine I/O. Die Views konsumieren die
 * Menge aus dem Assessment (StageAssessment.reachableIslandIds) und rechnen
 * selbst keine Distanzen.
 */

import type { PlanningSnapshot } from './schema/snapshot.ts';
import { bearingDeg, distanceNm, normDeg, twaDeg } from './geo.ts';
import { hourIndices, legWindow } from './time.ts';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * Repräsentativer Wind des Fahrtfensters an Tag N rund um die Ausgangsinsel:
 * vektorielles, geschwindigkeitsgewichtetes Mittel über die Plätze der Insel
 * und die Stunden des Fahrtfensters (Abfahrt bis hartes Tagesmaximum).
 * null, wenn es dafür keine einzige Windstunde gibt.
 */
function representativeWindFromDeg(
  snapshot: PlanningSnapshot,
  islandId: string,
  day: number,
): number | null {
  const { params } = snapshot;
  const window = legWindow(params.tripStartDate, day, params.departureHourAthens);
  const sailingEnd =
    window.startMs + (params.maxSailHours + params.maxMotorHours) * 3600_000;
  const indices = hourIndices(
    { startMs: window.startMs, endMs: sailingEnd },
    snapshot.times,
  );
  let x = 0;
  let y = 0;
  for (const place of snapshot.library.places) {
    if (place.islandId !== islandId) continue;
    const fc = snapshot.forecast[place.id];
    if (!fc) continue;
    for (const i of indices) {
      const kn = fc.windKn[i];
      const dir = fc.windDirDeg[i];
      if (typeof kn !== 'number' || typeof dir !== 'number') continue;
      x += kn * Math.sin(rad(dir));
      y += kn * Math.cos(rad(dir));
    }
  }
  return Math.hypot(x, y) > 1e-9 ? normDeg(deg(Math.atan2(x, y))) : null;
}

/**
 * Inseln, die von `fromIslandId` aus an Tag `day` als Tagesziel in Frage
 * kommen. Die Ausgangsinsel selbst ist immer enthalten (Distanz 0 — der
 * Wechsel des Liegeplatzes auf derselben Insel bleibt möglich).
 *
 * Kursabhängig: liegt das Ziel gegenan (TWA unter params.upwindTwaDeg),
 * gilt maxDayRangeUpwindNm, sonst maxDayRangeNm. Ist KEIN Wind bestimmbar,
 * gilt konservativ die Gegenan-Reichweite — eine unbekannte Windrichtung
 * darf das Fenster nicht verdoppeln.
 */
export function reachableIslands(
  snapshot: PlanningSnapshot,
  fromIslandId: string,
  day: number,
): string[] {
  const { params, library } = snapshot;
  const from = library.islands.find((i) => i.id === fromIslandId);
  if (!from) return [];

  const windFromDeg = representativeWindFromDeg(snapshot, fromIslandId, day);

  const out: string[] = [];
  for (const island of library.islands) {
    if (island.id === fromIslandId) {
      out.push(island.id);
      continue;
    }
    const nm = distanceNm(from.coordinates, island.coordinates);
    const limit =
      windFromDeg === null
        ? params.maxDayRangeUpwindNm
        : twaDeg(bearingDeg(from.coordinates, island.coordinates), windFromDeg) <
            params.upwindTwaDeg
          ? params.maxDayRangeUpwindNm
          : params.maxDayRangeNm;
    if (nm <= limit) out.push(island.id);
  }
  return out;
}
