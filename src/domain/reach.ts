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
 * ZWEITE Bedingung: DER SOLVER MUSS DEN TAG AUCH LIEFERN KÖNNEN — und das
 * heisst seit dem Befund vom 2026-08-07 mehr als "es gibt eine Etappe dorthin".
 *
 * Bis dahin fragte dieser Filter den vollen Etappen-Index (294 gerichtete
 * Kanten) nach höchstens zwei Hops ab dem Vortagsziel. Der Solver sucht aber
 * gar nicht in diesem Graphen: `roundTrips.adjacencyOf` zählt über einen
 * AUSGEDÜNNTEN Graphen auf (alle kuratierten Etappen plus je Insel die zwei
 * kürzesten abgeleiteten bis 30 sm), und er sucht nicht nach einem Weg zur
 * Insel, sondern nach einer geschlossenen RUNDE, die den Törnrahmen füllt.
 * Zwei Mengen, zwei Antworten — gemessen an der ausgelieferten Bibliothek
 * lehnte der Solver 126 von 208 angebotenen Zielen ab.
 *
 * Der Fall des Skippers (2026-08-07): ab Serifos stand PAROS im Menü, weil
 * `paros--serifos` als abgeleitete Etappe (31,2 sm) in der Bibliothek steht.
 * Im Aufzählungs-Graphen fehlt sie — Serifos hat mit Polyaigos (23,5 sm) und
 * Syros (24,5 sm) schon zwei kürzere abgeleitete Nachbarn, und 31,2 sm liegen
 * ausserdem über der 30-sm-Grenze. Angeboten wurde also ein Ziel, das die
 * Suche strukturell nie erreichen konnte.
 *
 * DESHALB FRAGT DER FILTER JETZT DIESELBE AUFZÄHLUNG, die auch der Solver
 * benutzt: angeboten wird eine Insel für Tag N, wenn eine der aufgezählten
 * Runden sie an Tag N ansteuern kann (`roundTripLayers`, Wartetage
 * eingerechnet). Das ist die einzige Bedingung, die hält, was das Menü
 * verspricht — jede andere ist ein Stellvertreter, der irgendwann auseinander
 * läuft.
 *
 * WAS DAS FÜR DEN VORTAG HEISST: der Pin legt nur DIESEN Tag fest, der Solver
 * darf die Tage davor neu legen (AD-12, `completePlan` plant ab der aktuellen
 * Position). Die sm-Regel misst deshalb weiter ab dem Vortagsziel des
 * AKTUELLEN Plans — sie ist die seemännische Plausibilitätsgrenze —, aber die
 * Runde, die der Solver am Ende baut, kann davor anders laufen.
 *
 * Bewusst ein VORFILTER: er bestimmt nur, was zur Auswahl steht. Ob die
 * konkrete Etappe an ihrem Tag fahrbar ist, beurteilen weiterhin
 * Etappen-Simulation (scoring.ts) und Solver; deren Ablehnung meldet der
 * Editor als Fehlertext.
 *
 * Rein (AD-2): Zeit/Position injiziert, keine I/O. Die Views konsumieren die
 * Menge aus dem Assessment (StageAssessment.reachableIslandIds) und rechnen
 * selbst keine Distanzen.
 */

import type { PlanningSnapshot } from './schema/snapshot.ts';
import { bearingDeg, distanceNm, normDeg, twaDeg } from './geo.ts';
import { roundTripLayers } from './roundTrips.ts';
import { deadlineFrame, hourIndices, legWindow } from './time.ts';

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
 * Welche Insel kann an welchem Törntag Tagesziel sein — gelesen aus DEM
 * Kandidatenraum, den auch der Solver durchsucht (`roundTripLayers`).
 *
 * DIE ABBILDUNG KETTENPOSITION → TÖRNTAG ist die des Packers, und sie ist
 * bewusst die STRENGE Lesart: der Vertrag ist "ein Törntag, eine Etappe", also
 * endet die p-te Etappe an Tag `startDay + p − 1`. Wartetage schieben das nach
 * hinten — eine Kette mit `L` Etappen in `D` Tagen hat `D − L` davon frei zu
 * verteilen —, und mehr Spielraum nimmt dieser Filter sich nicht.
 *
 * WARUM DER DOPPELSCHLAG HIER NICHT ZÄHLT, obwohl es ihn gibt. Ein Tag mit
 * zwei Etappen zieht die ganze Kette um eine Position nach vorn, das Menü
 * dürfte also auch die Insel an Position N+1 für Tag N anbieten. Gemessen am
 * 2026-08-07 gegen die echte Bibliothek kostet genau das: 20 Ziele mehr im
 * Menü, davon 19 vom Solver abgelehnt — denn eine volle Runde hat `L = D` und
 * damit KEINEN Wartetag (`completePlan`: `maxWaitDays = D − L`), den der
 * Doppelschlag hinterher bräuchte. Der Doppelschlag ist eine Nachgabe der
 * Eskalationsleiter, kein Planungsmittel; ein Menü, das mit ihm rechnet,
 * verspricht mehr, als der Normalfall hält.
 *
 * Die Vorauswahl des Solvers (`solver.kannPinTragen`) rechnet ihn dagegen
 * SEHR WOHL mit: sie darf keinen Kandidaten wegwerfen, der den Pin doch noch
 * tragen könnte. Zwei Richtungen, zwei Fehler — der Filter hier darf nichts
 * versprechen, der dort nichts wegwerfen.
 *
 * NUR DIE ERSTE TRAGENDE SCHICHT. `completePlan` fragt die Schichten in
 * derselben Vorzugsreihenfolge und bricht ab, sobald eine trägt — der Filter
 * bleibt damit auf der sicheren Seite: er bietet höchstens an, was die Suche
 * auch zuerst anfassen würde, nie mehr.
 */
const tagszieleCache = new WeakMap<PlanningSnapshot, Map<string, Set<string>>>();

function islandsPossibleOnDay(
  snapshot: PlanningSnapshot,
  startIslandId: string,
  day: number,
): Set<string> {
  let proSnapshot = tagszieleCache.get(snapshot);
  if (!proSnapshot) {
    proSnapshot = new Map();
    tagszieleCache.set(snapshot, proSnapshot);
  }
  const key = `${startIslandId}:${day}`;
  const gecacht = proSnapshot.get(key);
  if (gecacht) return gecacht;

  const startDay = snapshot.trip.currentDay;
  const daysAvailable = deadlineFrame(snapshot.params).deadlineDay - startDay + 1;
  /** Position, die dieser Tag ohne Wartetag hätte. */
  const position = day - startDay + 1;
  const out = new Set<string>();
  if (position >= 1) {
    for (const layer of roundTripLayers(snapshot, startIslandId, daysAvailable)) {
      for (const trip of layer.trips) {
        const wartetage = Math.max(0, daysAvailable - trip.length);
        const von = Math.max(1, position - wartetage);
        const bis = Math.min(position, trip.length);
        for (let p = von; p <= bis; p++) {
          out.add(trip[p - 1]!.toIslandId);
        }
      }
      // Die erste Schicht, die überhaupt Runden trägt, entscheidet.
      if (layer.trips.length > 0) break;
    }
  }
  proSnapshot.set(key, out);
  return out;
}

/**
 * Inseln, die von `fromIslandId` aus an Tag `day` als Tagesziel in Frage
 * kommen.
 *
 * Die Ausgangsinsel ist NICHT MEHR bedingungslos dabei. Sie stand hier als
 * "Wechsel des Liegeplatzes auf derselben Insel", aber dafür gibt es das
 * Platz-Menü und den Hafentag; als Tagesziel heisst sie "fahr dorthin, wo du
 * schon bist", und ob eine Runde das an diesem Tag hergibt, ist genau die
 * Frage, die für jede andere Insel auch gestellt wird. Ohne die Prüfung war
 * sie der letzte verbliebene Menüeintrag, den der Solver ablehnen konnte
 * (Tag 1 → Basis). Der aktuell gewählte Wert des Tages bleibt trotzdem
 * sichtbar — die Ansicht ergänzt ihn selbst (DayView `selectableIslands`).
 *
 * Kursabhängig: liegt das Ziel gegenan (TWA unter params.upwindTwaDeg),
 * gilt maxDayRangeUpwindNm, sonst maxDayRangeNm. Ist KEIN Wind bestimmbar,
 * gilt konservativ die Gegenan-Reichweite — eine unbekannte Windrichtung
 * darf das Fenster nicht verdoppeln.
 *
 * UND: eine aufgezählte Runde muss die Insel an DIESEM Törntag ansteuern
 * können (`islandsPossibleOnDay`, Begründung im Kopfkommentar). Ohne die
 * zweite Bedingung steht im Menü, was der Solver hinterher ablehnt.
 *
 * `startIslandId` ist die Insel, ab der der Solver plant — dort steht das
 * Schiff am Morgen des aktuellen Törntags. Sie ist NICHT `fromIslandId`: das
 * ist das Vortagsziel dieses einen Tages, und der liegt in aller Regel später
 * im Törn.
 */
export function reachableIslands(
  snapshot: PlanningSnapshot,
  fromIslandId: string,
  day: number,
  startIslandId: string,
): string[] {
  const { params, library } = snapshot;
  const from = library.islands.find((i) => i.id === fromIslandId);
  if (!from) return [];

  const windFromDeg = representativeWindFromDeg(snapshot, fromIslandId, day);
  const imKandidatenraum = islandsPossibleOnDay(snapshot, startIslandId, day);

  const out: string[] = [];
  for (const island of library.islands) {
    if (!imKandidatenraum.has(island.id)) continue;
    if (island.id === fromIslandId) {
      // Distanz 0 — die sm-Regel hat dazu nichts zu sagen.
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
