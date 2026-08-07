/**
 * Zielmodell v3 — der Rundkurs-Raum, vollständig statt gekappt.
 *
 * WAS HIER VORHER SCHIEFLIEF (Befund 2026-08-07). Die Suche war ein DFS über
 * den Etappen-Graphen mit einer Notbremse `MAX_TRIPS = 600`, begründet mit
 * "an der echten Bibliothek (16 Inseln, 23 Verbindungen) entstehen unter 200
 * Runden". Die Bibliothek ist seither auf 39 Etappen / 78 gerichtete Kanten
 * gewachsen: es existieren 3378 Runden bei 11 verfügbaren Tagen. Die Bremse
 * hat also 82 % des Raums abgeschnitten — und weil die Nachbarn in fester
 * alphabetischer Ordnung besucht wurden, immer DENSELBEN Teil. Bei 11 Tagen
 * fielen Santorin und Folegandros komplett heraus: ab Törntag 2 existierte
 * Santorin für die Suche nicht mehr. Genau das war der Grund, warum eine
 * "Verlängerung nach Santorin" ohne Santorin herauskam.
 *
 * DIE EINSICHT: der RICHTIGE Raum ist klein und exakt aufzählbar. Gesucht ist
 * nicht "irgendein Pfad", sondern "eine geschlossene Runde, die jeden Törntag
 * mit einer Etappe füllt und keine Insel zweimal anläuft". Davon gibt es an
 * der ausgelieferten Bibliothek 112 — vollständig durchrechenbar. Es braucht
 * also keine Notbremse, sondern einen engeren Filter.
 *
 * DREI SCHICHTEN, in dieser Reihenfolge abgefragt (`roundTripLayers`):
 *
 *   A — genau `legCount` Etappen, keine Insel zweimal. Der Normalfall und der
 *       Vertrag: ein Törntag, eine Verbindung, jede Insel einmal.
 *   B — genau `legCount` Etappen, Wiederholung zugelassen, plus höchstens EINE
 *       Stichfahrt (eine Insel anlaufen und auf derselben Verbindung zurück).
 *       Ohne sie wäre jede Sackgassen-Insel ausgeschlossen — Amorgos hängt nur
 *       an Naxos und kommt in 0 von 112 A-Runden vor.
 *   C — WENIGER als `legCount` Etappen. Der Rückfall für zwei Lagen: der Törn
 *       läuft schon (Restplan von unterwegs), oder das Wetter färbt jede volle
 *       Runde rot und die App muss trotzdem antworten (FR18).
 *
 * Die SCHICHTUNG ist die Umsetzung von "keine Insel doppelt — weich, aber
 * schwer gewichtet" (Skipper 2026-08-07). Sie steht bewusst hier und nicht als
 * Rangkriterium in `preferred`: ein Kandidat aus B kann nur gewinnen, wenn A
 * nichts Gültiges hergibt, und das ist eine stärkere Zusicherung als jede
 * Gewichtung. Gleichzeitig bleibt der Suchraum klein, ohne dass irgendetwas
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
 * echten Bedarf (Schicht A liefert 112, der gesamte ungefilterte Raum 3378):
 * sie soll NIE im Normalbetrieb greifen. Wenn sie greift, ist das ein Befund
 * über die Bibliothek und wird über `RoundTripEnumeration.gekappt` nach oben
 * gemeldet — die alte Bremse schwieg, und genau deshalb hat zwei Monate lang
 * niemand gemerkt, dass die halbe Ägäis aus der Suche gefallen war.
 */
const HARD_CEILING = 50_000;

/** Welche Schicht einen Kandidaten hervorgebracht hat. */
export type RoundTripLayer = 'voll-ohne-wiederholung' | 'voll-mit-stichfahrt' | 'verkuerzt';

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
}

function adjacencyOf(snapshot: PlanningSnapshot): Adjacency {
  const index = legIndexWithReverses(snapshot.library);
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
  return { base: snapshot.params.baseIslandId, edges, index };
}

interface SearchOpts {
  /** Genau so viele Etappen (Schicht A/B) oder höchstens so viele (Schicht C). */
  legCount: number;
  exact: boolean;
  /**
   * Höchstens EINE Stichfahrt: eine Insel anlaufen und auf derselben
   * Verbindung zurück. Das ist die einzige Form von Wiederholung im ganzen
   * Suchraum — freie Wiederholung wäre nicht nur unerwünscht, sie wäre auch
   * unbezahlbar: ohne Insel-Pruning wächst der Raum bei Grad ~4 und 11
   * Etappen auf Millionen Pfade, und der Solver läuft pro Bewertung.
   */
  allowSpur: boolean;
}

function search(adj: Adjacency, startIslandId: string, opts: SearchOpts): RoundTripEnumeration {
  const bound = Math.min(Math.max(opts.legCount, 1), MAX_LEGS_CEILING);
  const out: Leg[][] = [];
  let gekappt = false;

  // Eine Runde ab der Basis braucht mindestens zwei Etappen (hin UND zurück);
  // von unterwegs ist schon die eine Etappe heim ein vollständiger Restplan.
  const minLegs = opts.exact ? bound : startIslandId === adj.base ? 2 : 1;

  const visited = new Set<string>([startIslandId]);
  const path: Leg[] = [];

  const accept = (closing: Leg): void => {
    const length = path.length + 1;
    if (length < minLegs) return;
    if (opts.exact && length !== bound) return;
    out.push([...path, closing]);
  };

  const dfs = (node: string, spurUsed: boolean): void => {
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
      if (visited.has(to)) continue;
      // Noch mindestens die Schluss-Etappe zur Basis muss danach passen.
      if (path.length + 2 > bound) continue;

      visited.add(to);
      path.push(leg);
      dfs(to, spurUsed);
      path.pop();

      /**
       * Stichfahrt: `to` anlaufen und auf der Gegenrichtung zurück — danach
       * geht es von `node` aus weiter. Braucht nach den zwei Etappen noch
       * mindestens eine bis zur Basis, sonst wäre sie nie abschliessbar. Nie
       * mit der BASIS als Angelpunkt: die Rückkehr der Stichfahrt läge dann
       * mitten im Törn an der Basis — und die wird nie durchfahren.
       */
      const back = adj.index.get(`${to}--${node}`);
      if (opts.allowSpur && !spurUsed && back && node !== adj.base && path.length + 3 <= bound) {
        path.push(leg, back);
        dfs(node, true);
        path.pop();
        path.pop();
      }
      visited.delete(to);
    }
  };

  dfs(startIslandId, false);
  return {
    layer: opts.exact
      ? opts.allowSpur
        ? 'voll-mit-stichfahrt'
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
export function* roundTripLayers(
  snapshot: PlanningSnapshot,
  startIslandId: string,
  legCount: number,
): Generator<RoundTripEnumeration> {
  const adj = adjacencyOf(snapshot);

  // A — der Vertrag: jeder Törntag eine Etappe, jede Insel höchstens einmal.
  yield search(adj, startIslandId, { legCount, exact: true, allowSpur: false });

  // B — voller Rahmen, aber eine Stichfahrt zugelassen. Das ist, was
  //     Sackgassen-Inseln überhaupt erreichbar macht: Amorgos hängt nur an
  //     Naxos und kommt in keiner einzigen A-Runde vor. Der Angelpunkt der
  //     Stichfahrt wird dabei zweimal angelaufen — genau das zählt
  //     `PlanMetrics.repeatStays` und rankt es unter A.
  yield search(adj, startIslandId, { legCount, exact: true, allowSpur: true });

  // C — kürzer als der Rahmen. Restplan von unterwegs, und die FR18-Antwort,
  //     wenn das Wetter jede volle Runde rot färbt.
  yield search(adj, startIslandId, { legCount, exact: false, allowSpur: true });
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
