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
 * DIE TAGE DAVOR BLEIBEN STEHEN. Bis 2026-08-07 band ein Pin nur seinen
 * eigenen Tag, und der Solver legte den Törn ab der aktuellen Position neu —
 * wer Tag 5 änderte, bekam womöglich auch einen anderen Tag 2. Der Skipper
 * dazu: „es gibt ja eine Route, die bis dahin festgelegt ist und das neue Leg
 * funktioniert auch, es gibt keinen Sinn nach hinten zu verändern."
 *
 * Deshalb rechnet dieser Filter mit der VORGESCHICHTE des Plans: angeboten
 * wird, was eine Runde ansteuern kann, die bis zum Vortag genau da entlang
 * läuft, wo der Plan schon liegt. Das schliesst mehr aus als die blosse
 * Nachbarschaft — eine Insel, die der Törn vorher schon angelaufen hat, kommt
 * in einer wiederholungsfreien Runde kein zweites Mal vor.
 *
 * Bewusst ein VORFILTER: er bestimmt nur, was zur Auswahl steht. Ob die
 * konkrete Etappe an ihrem Tag fahrbar ist, beurteilen weiterhin
 * Etappen-Simulation (scoring.ts) und Solver; deren Ablehnung meldet der
 * Editor als Fehlertext.
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
import { islandSequence, legIndexWithReverses } from './legs.ts';
import { roundTripLayers, type RoundTripEnumeration } from './roundTrips.ts';
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
 * Die Lage des Plans, gegen die der Filter rechnet — beides kommt aus dem
 * Plan, der gerade bewertet wird, und beides ist NICHT das Vortagsziel.
 */
export interface Planlage {
  /**
   * Insel, ab der der Solver plant: dort steht das Schiff am Morgen des
   * aktuellen Törntags (`completePlan`s `startIslandId`).
   */
  startIslandId: string;
  /**
   * Die Etappenziele des bestehenden Plans zwischen Startinsel und dem
   * fraglichen Tag, als KETTE — Hafentage fallen weg, weil sie keine Etappe
   * verbrauchen. Leer für den ersten planbaren Tag.
   */
  vorgeschichte: string[];
}

/**
 * Welche Insel kann NACH dieser Vorgeschichte das nächste Tagesziel sein —
 * gelesen aus DEM Kandidatenraum, den auch der Solver durchsucht
 * (`roundTripLayers`).
 *
 * DIE VORGESCHICHTE BESTIMMT DIE POSITION. Weil die Tage vor dem geänderten
 * gehalten werden (`solver.Pin.gehalten`), muss die Runde bis dorthin genau
 * den Weg des Plans nehmen; das nächste Ziel ist dann die Etappe danach. Das
 * ist strenger als jede Positionsrechnung und braucht keine: die Runde selbst
 * sagt, wo der Tag steht.
 *
 * GESUCHT WIRD ALS TEILFOLGE, nicht Position für Position. Ein Doppelschlag-Tag
 * trägt zwei Etappen und schiebt die Kette gegen die Tage; ein starrer
 * Positionsvergleich fände dann gar nichts mehr und das Menü wäre LEER —
 * schlimmer als zu grosszügig, weil es den Tag unbearbeitbar macht.
 *
 * BEIDE VOLLEN SCHICHTEN, nicht nur die erste (Skipper 2026-08-08: „ich will am
 * ersten Tag statt attische Küste direkt nach Kea … der zweite Tag will wieder
 * zurück, statt Kea–Kythnos oder Kea–Syros vorzugeben").
 *
 * Der Filter brach bis dahin bei der ersten Schicht ab, die überhaupt Runden
 * trug — und das ist immer Schicht A, denn die Aufzählung hängt am Graphen, nicht
 * am Wetter. GEMESSEN an der echten Bibliothek: nach „Tag 1 nach Kea" stand für
 * Tag 2 genau EIN Ziel zur Wahl (Syros; seit `kea--serifos` in der Aufzählung
 * ist, wären es zwei), während der Solver bei gehaltenem Tag 1 zehn Ziele
 * lieferte — vier davon über den vollen Rahmen. Ein Tag mit einer einzigen
 * Option sieht aus, als zöge die App die Route nicht mehr nach.
 *
 * Der Fehler war die Abbruch-Bedingung, nicht die Schicht: `completePlan` bricht
 * ab, sobald eine Schicht einen TRAGENDEN PLAN geliefert hat — mit einem Pin,
 * den Schicht A nicht tragen kann, zählt sie folgerichtig weiter. Kea–Kythnos an
 * Tag 2 ist genau so ein Fall: Kythnos steht in KEINER wiederholungsfreien
 * Runde direkt hinter Kea, wohl aber in einer mit Zweitanlauf (Schicht B), und
 * die fährt der Solver dann auch. Angeboten wird deshalb, was die beiden Runden
 * des VOLLEN Rahmens hergeben.
 *
 * Die verkürzte Schicht bleibt draussen, solange die vollen etwas hergeben. Sie
 * ist die FR18-Notantwort ("heute umkehren", "gar nicht erst losfahren"); ihre
 * Ziele sind zwar lieferbar, aber als Tagesziel-Vorschlag wäre die Basis an
 * Tag 2 genau der Menüeintrag, den dieser Filter loswerden sollte. Nur wenn
 * KEINE volle Runde existiert, ist sie die einzige Antwort, die es gibt — dann
 * steht sie auch im Menü, denn ein leeres Menü macht den Tag unbearbeitbar.
 */
const tagszieleCache = new WeakMap<PlanningSnapshot, Map<string, Set<string>>>();

/**
 * Position der LETZTEN Vorgeschichte-Insel in der Kette, oder null, wenn die
 * Kette die Vorgeschichte nicht in dieser Reihenfolge enthält. 0 heisst
 * "keine Vorgeschichte" — die Startinsel selbst.
 */
function positionNachVorgeschichte(
  islands: string[],
  vorgeschichte: string[],
  maxPosition: number,
): number | null {
  let p = 0;
  for (const id of vorgeschichte) {
    let gefunden = -1;
    for (let k = p + 1; k < islands.length; k++) {
      if (islands[k] === id) {
        gefunden = k;
        break;
      }
    }
    if (gefunden < 0) return null;
    p = gefunden;
  }
  return p <= maxPosition ? p : null;
}

/**
 * Die Insel-Folgen einer Schicht, EINMAL gebaut. Die Schicht-Objekte selbst
 * sind je Snapshot gecacht (roundTrips.layerCache), ihre Identität also stabil
 * — und Schicht B trägt über 45 000 Runden, die sonst für jeden Törntag neu
 * durchgerechnet würden.
 */
const sequenzCache = new WeakMap<RoundTripEnumeration, string[][]>();

function sequenzenOf(layer: RoundTripEnumeration): string[][] {
  let seqs = sequenzCache.get(layer);
  if (!seqs) {
    seqs = layer.trips.map(islandSequence);
    sequenzCache.set(layer, seqs);
  }
  return seqs;
}

function islandsPossibleNext(
  snapshot: PlanningSnapshot,
  lage: Planlage,
  day: number,
): Set<string> {
  let proSnapshot = tagszieleCache.get(snapshot);
  if (!proSnapshot) {
    proSnapshot = new Map();
    tagszieleCache.set(snapshot, proSnapshot);
  }
  const key = [day, lage.startIslandId, ...lage.vorgeschichte].join('>');
  const gecacht = proSnapshot.get(key);
  if (gecacht) return gecacht;

  const startDay = snapshot.trip.currentDay;
  const daysAvailable = deadlineFrame(snapshot.params).deadlineDay - startDay + 1;
  /**
   * Wie viele Etappen bis zum VORABEND dieses Tages höchstens gefahren sein
   * können — ein Törntag trägt eine. Ohne diese Schranke fand die Teilfolge
   * auch Runden, die dieselbe Vorgeschichte-Insel erst kurz vor Schluss
   * anlaufen: an Tag 2 stand dann die BASIS im Menü, weil es eine Runde gibt,
   * die über dieselbe Insel an Tag 10 nach Hause fährt.
   */
  const maxPosition = Math.max(0, day - startDay);
  const out = new Set<string>();
  for (const layer of roundTripLayers(snapshot, lage.startIslandId, daysAvailable)) {
    /**
     * Die verkürzte Schicht ist die FR18-Notantwort und kein Angebot — solange
     * die vollen Runden überhaupt etwas hergeben. Geben sie nichts her (ein
     * Revier, in dem keine Runde den Rahmen füllt), ist sie die einzige
     * Antwort, die es gibt, und dann steht ihr Ziel auch im Menü: ein leeres
     * Menü macht den Tag unbearbeitbar.
     */
    if (layer.layer === 'verkuerzt' && out.size > 0) break;
    for (const islands of sequenzenOf(layer)) {
      const p = positionNachVorgeschichte(islands, lage.vorgeschichte, maxPosition);
      if (p === null) continue;
      const naechste = islands[p + 1];
      if (naechste !== undefined) out.add(naechste);
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
 * `lage` beschreibt den Plan, nicht den Tag: wo der Solver zu planen beginnt
 * und welchen Weg der Plan bis zum Vortag schon nimmt. `fromIslandId` ist
 * davon getrennt das Vortagsziel DIESES Tages — es trägt die sm-Regel.
 */
export function reachableIslands(
  snapshot: PlanningSnapshot,
  fromIslandId: string,
  day: number,
  lage: Planlage,
): string[] {
  const { params, library } = snapshot;
  const from = library.islands.find((i) => i.id === fromIslandId);
  if (!from) return [];

  const windFromDeg = representativeWindFromDeg(snapshot, fromIslandId, day);
  const imKandidatenraum = islandsPossibleNext(snapshot, lage, day);

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
