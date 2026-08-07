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
 * ZWEITE Bedingung: die Etappen-Bibliothek muss den Tag auch LIEFERN können
 * (Bug-Report 2026-08-05: Mykonos stand im Dropdown, die Auswahl sprang aber
 * kommentarlos auf Kea zurück). Übernommen wird ein Tagesziel über den Solver,
 * und der baut Pläne ausschliesslich aus Bibliotheks-Etappen — höchstens
 * params.maxLegsPerDay je Tag, per Doppelschlag-Eskalation maximal zwei
 * (solver.ts RELAXATION_ORDER), und auch das nur, solange
 * params.doppelschlagMaxPerTrip überhaupt einen Doppelschlag-Tag erlaubt.
 * Eine Insel ohne solchen Weg ab dem Vortagsziel ist damit strukturell kein
 * Tagesziel — sie anzubieten hiesse, eine Auswahl zu zeigen, die die
 * Übernahme immer ablehnt. Von den 41 Inseln in Tagesreichweite trugen 25
 * gar keine Etappe.
 *
 * Bewusst ein VORFILTER aus festen sm-Werten (params) und Graph-Hops, NICHT
 * aus der Polare gerechnet: er bestimmt nur, was zur Auswahl steht. Ob die
 * konkrete Etappe an ihrem Tag fahrbar ist — und ob sich der Round-Trip
 * schliessen lässt —, beurteilen weiterhin Etappen-Simulation (scoring.ts)
 * und Solver; deren Ablehnung meldet der Editor als Fehlertext.
 *
 * Rein (AD-2): Zeit/Position injiziert, keine I/O. Die Views konsumieren die
 * Menge aus dem Assessment (StageAssessment.reachableIslandIds) und rechnen
 * selbst keine Distanzen.
 *
 * Daneben wohnt hier die zweite Kontextmenge desselben Editors:
 * `stopoverIslands` — welche Inseln liegen ZWISCHEN Ausgangs- und Zielinsel
 * eines Tages. Andere Frage, andere Regeln (siehe dort), gleiche Doktrin: ein
 * Vorfilter über den Etappen-Graphen, der nur bestimmt, was zur Auswahl steht.
 */

import type { PlanningSnapshot } from './schema/snapshot.ts';
import { bearingDeg, distanceNm, normDeg, twaDeg } from './geo.ts';
import { legIndexWithReverses } from './legs.ts';
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
 * Inseln, die die Bibliothek von `fromIslandId` aus mit höchstens `maxLegs`
 * Etappen an EINEM Tag erreichen kann — inklusive der Gegenrichtungen, denn
 * der Solver segelt Etappen auch umgedreht (legIndexWithReverses).
 */
function islandsWithinLegHops(
  snapshot: PlanningSnapshot,
  fromIslandId: string,
  maxLegs: number,
): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const leg of legIndexWithReverses(snapshot.library).values()) {
    const list = adjacency.get(leg.fromIslandId) ?? [];
    list.push(leg.toIslandId);
    adjacency.set(leg.fromIslandId, list);
  }
  const out = new Set([fromIslandId]);
  let frontier = [fromIslandId];
  for (let hop = 0; hop < maxLegs; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of adjacency.get(id) ?? []) {
        if (!out.has(neighbour)) {
          out.add(neighbour);
          next.push(neighbour);
        }
      }
    }
    frontier = next;
  }
  return out;
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
 *
 * UND: die Etappen-Bibliothek muss den Tag tragen (Kopfkommentar) — maximal
 * so viele Etappen-Hops, wie ein Tag je haben darf. Zwei nur, wenn der
 * Törn-Deckel den Doppelschlag nicht schon grundsätzlich verbietet.
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
  const maxLegs =
    params.doppelschlagMaxPerTrip > 0 ? 2 : params.maxLegsPerDay;
  const byLibrary = islandsWithinLegHops(snapshot, fromIslandId, maxLegs);

  const out: string[] = [];
  for (const island of library.islands) {
    if (island.id === fromIslandId) {
      out.push(island.id);
      continue;
    }
    if (!byLibrary.has(island.id)) continue;
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

/**
 * ZWISCHENSTOPPS eines Tages: welche Inseln liegen zwischen der Ausgangs- und
 * der Zielinsel dieses Tages?
 *
 * Gefragt ist eine ganz andere Menge als bei `reachableIslands`: nicht "wo
 * kann der Tag ENDEN", sondern "wo kann er unterwegs anhalten, ohne sein Ziel
 * aufzugeben". Beide Hälften müssen die Etappen-Bibliothek liefern — von der
 * Ausgangsinsel zum Stopp und vom Stopp zum Tagesziel, Gegenrichtungen
 * eingeschlossen (`legIndexWithReverses`). Damit bleibt der Suchraum kuratiert:
 * ein Zwischenstopp entsteht aus zwei recherchierten Verbindungen, nicht aus
 * freier Geometrie.
 *
 * KEINE AMPEL-KRITERIEN (Skipper 2026-08-07): am Zwischenstopp muss das Boot
 * nicht sicher liegen — es wird gebadet, gegessen und weitergefahren. Weder die
 * Schutzsektoren des Stopp-Hafens noch der Kuratierungs-Vorbehalt filtern hier
 * etwas weg, und die Nacht-Rangfolge sortiert hier nichts. Was der Umweg an
 * Stunden kostet, sagt die Ampel des TAGES, nachdem er eingefügt ist.
 *
 * Die EINE Grenze ist strukturell und keine Bewertung: die Summe beider Etappen
 * muss in der Best-Case-Tagesreichweite liegen (`maxDayRangeNm`). Was ein Tag
 * selbst im günstigsten Fall nicht schafft, ist kein Zwischenstopp, sondern ein
 * anderes Tagesziel — und das gehört in die Etappenwahl darüber.
 *
 * Sortiert nach dem Umweg (Summe beider Etappendistanzen, aufsteigend), bei
 * Gleichstand nach Id — der kürzeste Umweg steht oben, und die Reihenfolge ist
 * deterministisch (AD-2: die Rangfolge ist Domänenlogik, keine Ansicht).
 */
export function stopoverIslands(
  snapshot: PlanningSnapshot,
  fromIslandId: string,
  toIslandId: string,
): string[] {
  const legs = [...legIndexWithReverses(snapshot.library).values()];
  const shortest = (a: string, b: string): number | null => {
    let best: number | null = null;
    for (const leg of legs) {
      if (leg.fromIslandId !== a || leg.toIslandId !== b) continue;
      if (best === null || leg.distanceNm < best) best = leg.distanceNm;
    }
    return best;
  };

  const found: { islandId: string; detourNm: number }[] = [];
  for (const island of snapshot.library.islands) {
    if (island.id === fromIslandId || island.id === toIslandId) continue;
    const hin = shortest(fromIslandId, island.id);
    const weiter = shortest(island.id, toIslandId);
    if (hin === null || weiter === null) continue;
    if (hin + weiter > snapshot.params.maxDayRangeNm) continue;
    found.push({ islandId: island.id, detourNm: hin + weiter });
  }
  return found
    .sort((a, b) =>
      a.detourNm !== b.detourNm
        ? a.detourNm - b.detourNm
        : a.islandId.localeCompare(b.islandId),
    )
    .map((x) => x.islandId);
}
