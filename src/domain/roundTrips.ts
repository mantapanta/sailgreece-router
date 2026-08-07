/**
 * Zielmodell v3 — der Rundkurs-Raum, vollständig statt gekappt.
 *
 * WAS HIER VORHER SCHIEFLIEF (Befund 2026-08-07). Die Suche war ein DFS über
 * den Etappen-Graphen mit einer Notbremse `MAX_TRIPS = 600`. Die griff nie —
 * der ganze Raum ist kleiner als sie —, aber sie stand für eine falsche
 * Vorstellung von der Größe des Problems und verstellte den Blick darauf, dass
 * der Suchraum vollständig durchrechenbar ist.
 *
 * DIE EINSICHT: der RICHTIGE Raum ist klein und exakt aufzählbar. Gesucht ist
 * nicht "irgendein Pfad", sondern "eine geschlossene Runde, die jeden Törntag
 * mit einer Etappe füllt". An der ausgelieferten Bibliothek (39 Etappen, 60
 * gerichtete Kanten, 20 Inseln) sind das über elf Etappen:
 *
 *     6 Runden ohne jede Wiederholung
 *    88 mit einem Zweitanlauf
 *   534 mit zweien
 *
 * Es braucht also keine Notbremse, sondern einen engeren Filter.
 *
 * DREI SCHICHTEN, in dieser Reihenfolge abgefragt (`roundTripLayers`):
 *
 *   A — genau `legCount` Etappen, keine Insel zweimal. Der Normalfall.
 *   B — genau `legCount` Etappen, bis zu `MAX_ZWEITANLAEUFE` Zweitanläufe an
 *       jeweils ANDEREN Häfen derselben Insel. Kalibriert an zwei
 *       professionellen Törnvorschlägen, die genau das tun (siehe dort) — und
 *       erst damit sind Amorgos und die Kleinen Kykladen überhaupt erreichbar:
 *       in den 6 wiederholungsfreien Runden kommen sie NICHT vor.
 *   C — WENIGER als `legCount` Etappen. Der Rückfall für zwei Lagen: der Törn
 *       läuft schon (Restplan von unterwegs), oder das Wetter färbt jede volle
 *       Runde rot und die App muss trotzdem antworten (FR18).
 *
 * Die SCHICHTUNG ist die Umsetzung von "lieber ohne Wiederholung". Sie steht
 * bewusst hier und nicht als Rangkriterium in `preferred`: eine Runde aus B
 * kann nur gewinnen, wenn A nichts Tragfähiges hergibt — eine stärkere
 * Zusicherung als jede Gewichtung, die von genug anderen Kriterien überstimmt
 * werden kann. Gleichzeitig bleibt der Suchraum klein, ohne dass irgendetwas
 * still weggeschnitten wird.
 *
 * Deterministisch: Nachbarn werden in fester Ordnung (Ziel-Insel, Etappen-Id)
 * besucht, das Ergebnis ist bei gleichem Snapshot identisch.
 */

import type { Leg } from './schema/route.ts';
import type { PlanningSnapshot } from './schema/snapshot.ts';
import { legIndexWithReverses } from './legs.ts';

/**
 * Obergrenze der Pfadlänge, unabhängig vom Zeitrahmen — eine Runde kann nie
 * mehr Etappen haben als der Törn Tage hat, und mehr als das hier wäre eine
 * Bibliothek, die nicht mehr dieses Revier beschreibt.
 */
const MAX_LEGS_CEILING = 20;

/**
 * Notbremse gegen eine pathologisch dichte Bibliothek. Bewusst weit über dem
 * echten Bedarf (die größte Schicht liefert 534): sie soll NIE im Normalbetrieb
 * greifen. Wenn sie greift, ist das ein Befund über die Bibliothek und wird
 * über `RoundTripEnumeration.gekappt` nach oben gemeldet — die alte Bremse
 * schwieg, und eine Suche, die still die halbe Ägäis abschneidet, ist genau
 * die Art Fehler, die zwei Monate unentdeckt bleibt.
 */
const HARD_CEILING = 50_000;

/**
 * Wie viele ZWEITANLÄUFE eine Runde höchstens haben darf.
 *
 * Kalibriert an zwei professionellen Törnvorschlägen (aegeansails.gr, beide
 * zwei Wochen ab Athen bzw. Lavrion): der eine läuft Kythnos zweimal an, der
 * andere Kythnos UND Paros — jeweils an verschiedenen Häfen (Loutra/Mericha,
 * Paroikia/Naoussa). Zwei ist also genau das, was die Praxis tut.
 *
 * Die Zahl ist zugleich die Zusicherung gegen das Pendeln: dieselbe Kette über
 * elf Etappen hin und zurück bräuchte fünf Wiederholungen.
 *
 * Wirkung an der ausgelieferten Bibliothek: 6 wiederholungsfreie Runden über
 * den vollen Rahmen, 88 mit einem Zweitanlauf, 534 mit zweien — und erst bei
 * zweien werden Amorgos und die Kleinen Kykladen überhaupt erreichbar.
 */
const MAX_ZWEITANLAEUFE = 2;

/** Welche Schicht einen Kandidaten hervorgebracht hat. */
export type RoundTripLayer = 'voll-ohne-wiederholung' | 'voll-mit-zweitanlauf' | 'verkuerzt';

export interface RoundTripEnumeration {
  layer: RoundTripLayer;
  trips: Leg[][];
  /** True, wenn HARD_CEILING gegriffen hat — dann ist die Schicht unvollständig. */
  gekappt: boolean;
}

interface Adjacency {
  base: string;
  edges: Map<string, Leg[]>;
  index: Map<string, Leg>;
  /** Kuratierte Liegeplätze je Insel — die Obergrenze für Zweitanläufe. */
  plaetze: (islandId: string) => number;
}

function adjacencyOf(snapshot: PlanningSnapshot): Adjacency {
  const index = legIndexWithReverses(snapshot.library);
  const plaetzeJeInsel = new Map<string, number>();
  for (const p of snapshot.library.places) {
    plaetzeJeInsel.set(p.islandId, (plaetzeJeInsel.get(p.islandId) ?? 0) + 1);
  }
  const edges = new Map<string, Leg[]>();
  for (const leg of index.values()) {
    const list = edges.get(leg.fromIslandId) ?? [];
    list.push(leg);
    edges.set(leg.fromIslandId, list);
  }
  // Feste Ordnung — die Determinismus-Garantie der Suche.
  for (const list of edges.values()) {
    list.sort((a, b) => a.toIslandId.localeCompare(b.toIslandId) || a.id.localeCompare(b.id));
  }
  return {
    base: snapshot.params.baseIslandId,
    edges,
    index,
    plaetze: (islandId) => plaetzeJeInsel.get(islandId) ?? 0,
  };
}

interface SearchOpts {
  /** Genau so viele Etappen (Schicht A/B) oder höchstens so viele (Schicht C). */
  legCount: number;
  exact: boolean;
  /**
   * Wie viele ZWEITANLÄUFE die ganze Runde haben darf (0 = keiner).
   *
   * Ein Zweitanlauf ist erlaubt, wenn die Insel mehr kuratierte Liegeplätze
   * hat als bisherige Aufenthalte — dieselbe Bedingung, die `validatePlan`
   * (1e) an den fertigen Plan stellt. Eine Regel, zwei Orte: der Suchraum
   * erzeugt nichts, was die Gültigkeit hinterher verwerfen müsste.
   *
   * Der Deckel ist auch die Zusicherung gegen das PENDELN: eine Runde über elf
   * Etappen, die dieselbe Kette hin und zurück fährt, bräuchte fünf
   * Wiederholungen. Bei zwei ist das strukturell ausgeschlossen — stärker als
   * jedes Rangkriterium, das von genug anderen überstimmt werden kann.
   */
  maxRepeats: number;
}

function search(adj: Adjacency, startIslandId: string, opts: SearchOpts): RoundTripEnumeration {
  const bound = Math.min(Math.max(opts.legCount, 1), MAX_LEGS_CEILING);
  const out: Leg[][] = [];
  let gekappt = false;

  // Eine Runde ab der Basis braucht mindestens zwei Etappen (hin UND zurück);
  // von unterwegs ist schon die eine Etappe heim ein vollständiger Restplan.
  const minLegs = opts.exact ? bound : startIslandId === adj.base ? 2 : 1;

  /** Wie oft jede Insel auf dem aktuellen Pfad schon angelaufen wurde. */
  const anlaeufe = new Map<string, number>([[startIslandId, 1]]);
  let wiederholungen = 0;
  const path: Leg[] = [];

  const accept = (closing: Leg): void => {
    const length = path.length + 1;
    if (length < minLegs) return;
    if (opts.exact && length !== bound) return;
    out.push([...path, closing]);
  };

  const dfs = (node: string): void => {
    if (out.length >= HARD_CEILING) {
      gekappt = true;
      return;
    }
    for (const leg of adj.edges.get(node) ?? []) {
      const to = leg.toIslandId;
      if (to === adj.base) {
        // Die Basis wird nie DURCHFAHREN: wer sie erreicht, ist zu Hause.
        accept(leg);
        continue;
      }
      // Noch mindestens die Schluss-Etappe zur Basis muss danach passen.
      if (path.length + 2 > bound) continue;

      const bisher = anlaeufe.get(to) ?? 0;
      if (bisher > 0) {
        // ZWEITANLAUF an einem ANDEREN Hafen (Skipper 2026-08-07, kalibriert
        // gegen zwei professionelle Törnvorschläge: beide laufen Kythnos
        // zweimal an — Loutra und Mericha —, einer zusätzlich Paros zweimal
        // — Paroikia und Naoussa). Genau das macht den Vorstoß nach Osten
        // möglich: die Westkette trägt den Törn zweimal.
        if (wiederholungen >= opts.maxRepeats) continue;
        if (bisher >= adj.plaetze(to)) continue;
        wiederholungen++;
      }

      anlaeufe.set(to, bisher + 1);
      path.push(leg);
      dfs(to);
      path.pop();
      anlaeufe.set(to, bisher);
      if (bisher > 0) wiederholungen--;
    }
  };

  dfs(startIslandId);
  return {
    layer: opts.exact
      ? opts.maxRepeats > 0
        ? 'voll-mit-zweitanlauf'
        : 'voll-ohne-wiederholung'
      : 'verkuerzt',
    trips: out,
    gekappt,
  };
}

/**
 * Die drei Schichten in Vorzugsreihenfolge — A vor B vor C.
 *
 * Bewusst LAZY (Generator): der Aufrufer bricht ab, sobald eine Schicht einen
 * gültigen Plan getragen hat. Schicht A allein reicht im Normalfall, und die
 * teureren Schichten werden dann gar nicht erst aufgezählt.
 */
/**
 * Memo je Snapshot: die Aufzählung hängt nur an Bibliothek, Basis, Startinsel
 * und Etappenzahl — nicht am Wetter. Sie wird aber OFT gebraucht: einmal für
 * die Hauptroute, einmal je Ziel im Optionsraum, einmal für den FR2-Zeugen.
 * Ohne Memo zählt der Solver denselben Raum ein Dutzend Mal auf, und mit den
 * Zweitanläufen (bis 1340 Runden je Schicht) kostet das Sekunden statt
 * Millisekunden — sichtbar als Ladezeit der Tagesansicht.
 *
 * Der Cache liegt bewusst HIER und nicht im Solver: `candidateLayers` verpackt
 * die Runden noch je Kandidat, und diese Verpackung ist billig.
 */
const layerCache = new WeakMap<PlanningSnapshot, Map<string, RoundTripEnumeration[]>>();

export function* roundTripLayers(
  snapshot: PlanningSnapshot,
  startIslandId: string,
  legCount: number,
): Generator<RoundTripEnumeration> {
  const key = `${startIslandId}:${legCount}`;
  let proSnapshot = layerCache.get(snapshot);
  if (!proSnapshot) {
    proSnapshot = new Map();
    layerCache.set(snapshot, proSnapshot);
  }
  const gecacht = proSnapshot.get(key);
  if (gecacht) {
    yield* gecacht;
    return;
  }

  const adj = adjacencyOf(snapshot);
  const alle: RoundTripEnumeration[] = [];
  /**
   * Die Lazy-Auswertung bleibt erhalten: gecacht wird, was TATSÄCHLICH
   * aufgezählt wurde. Bricht der Aufrufer nach Schicht A ab, steht auch nur
   * Schicht A im Cache — und der nächste Aufruf zählt erst weiter, wenn er
   * weiter braucht.
   */
  const merke = (e: RoundTripEnumeration): RoundTripEnumeration => {
    alle.push(e);
    proSnapshot.set(key, [...alle]);
    return e;
  };

  // A — der Vertrag: jeder Törntag eine Etappe, jede Insel höchstens einmal.
  yield merke(search(adj, startIslandId, { legCount, exact: true, maxRepeats: 0 }));

  // B — voller Rahmen, bis zu MAX_ZWEITANLAEUFE Zweitanläufe an anderen Häfen.
  //     Das ist, was die Ost-Kykladen überhaupt in Reichweite bringt: Amorgos
  //     und die Kleinen Kykladen kommen in KEINER wiederholungsfreien Runde
  //     vor, mit zwei Zweitanläufen schon.
  yield merke(
    search(adj, startIslandId, { legCount, exact: true, maxRepeats: MAX_ZWEITANLAEUFE }),
  );

  // C — kürzer als der Rahmen. Restplan von unterwegs, und die FR18-Antwort,
  //     wenn das Wetter jede volle Runde rot färbt.
  yield merke(
    search(adj, startIslandId, { legCount, exact: false, maxRepeats: MAX_ZWEITANLAEUFE }),
  );
}

/**
 * Alle Rundkurse von `startIslandId` zurück zur Basis mit HÖCHSTENS `maxLegs`
 * Etappen — die flache Sicht über alle drei Schichten, dedupliziert.
 *
 * Für Aufrufer, die den Raum als Ganzes brauchen (Tests, Diagnose). Der Solver
 * nimmt `roundTripLayers`, weil er die Vorzugsreihenfolge braucht.
 */
export function enumerateRoundTrips(
  snapshot: PlanningSnapshot,
  startIslandId: string,
  maxLegs: number,
): Leg[][] {
  const seen = new Set<string>();
  const out: Leg[][] = [];
  for (const layer of roundTripLayers(snapshot, startIslandId, maxLegs)) {
    for (const trip of layer.trips) {
      const key = trip.map((l) => l.id).join('>');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trip);
    }
  }
  return out;
}
