/**
 * Zielmodell v3 — der Rundkurs-Raum, vollständig statt gekappt.
 *
 * WAS HIER VORHER SCHIEFLIEF (Befund 2026-08-07). Die Suche war ein DFS über
 * den Etappen-Graphen mit einer Notbremse `MAX_TRIPS = 600`. Die griff nie —
 * der ganze Raum ist kleiner als sie —, aber sie stand für eine falsche
 * Vorstellung von der Größe des Problems und verstellte den Blick darauf, dass
 * der Suchraum vollständig durchrechenbar ist.
 *
 * DIE EINSICHT: der RICHTIGE Raum ist aufzählbar, wenn man ihn richtig
 * zuschneidet. Gesucht ist nicht "irgendein Pfad", sondern "eine geschlossene
 * Runde, die jeden Törntag mit einer Etappe füllt".
 *
 * Die Bibliothek trägt seit 2026-08-07 auch ABGELEITETE Etappen
 * (seeding/tools/deriveLegs.ts) — 156 Etappen, 294 gerichtete Kanten. Über die
 * ALLE aufzuzählen geht nicht: mittlerer Grad 13,2, über 300 000 volle Runden,
 * und die Tiefensuche läuft in den Deckel. Der AUFZÄHLUNGS-Graph ist deshalb
 * ausgedünnt (siehe `adjacencyOf`), und über ihn sind es bei elf Etappen:
 *
 *     5 192 Runden ohne jede Wiederholung   (vollständig)
 *    71 088 mit bis zu zwei Zweitanläufen   (vollständig)
 *    95 814 kürzer als der Rahmen           (vollständig — die Notantwort-Schicht)
 *
 * Bewertet werden davon nicht alle: `solver.vorauswahl` nimmt je Schicht die
 * besten Kandidaten nach dem WETTERUNABHÄNGIGEN Teil der Rangfolge. Der Grund
 * steht dort.
 *
 * DREI SCHICHTEN, in dieser Reihenfolge abgefragt (`roundTripLayers`):
 *
 *   A — genau `legCount` Etappen, keine Insel zweimal. Der Normalfall.
 *   B — genau `legCount` Etappen, bis zu `MAX_ZWEITANLAEUFE` Zweitanläufe an
 *       jeweils ANDEREN Häfen derselben Insel. Kalibriert an zwei
 *       professionellen Törnvorschlägen, die genau das tun (siehe dort).
 *   C — WENIGER als `legCount` Etappen. Der Rückfall für zwei Lagen: der Törn
 *       läuft schon (Restplan von unterwegs), oder das Wetter färbt jede volle
 *       Runde rot und die App muss trotzdem antworten (FR18).
 *
 * KEIN PENDELN, quer durch alle drei Schichten: keine Runde kehrt SOFORT
 * dorthin zurück, wo sie herkam (`A → B → A`). Die Regel steht in `dfs`, ihre
 * einzige Ausnahme ist die Sackgasse mit Grad 1. Als sie entstand, war das im
 * echten Revier genau Delos/Rinia; seit die abgeleiteten Etappen den Graphen
 * füllen, gibt es dort keine Sackgasse mehr — die Ausnahme bleibt trotzdem
 * stehen, denn sie beschreibt eine Eigenschaft des Graphen, nicht eine
 * bestimmte Insel.
 *
 * Die SCHICHTUNG ist die Umsetzung von "lieber ohne Wiederholung". Sie steht
 * bewusst hier und nicht als Rangkriterium in `preferred`: eine Runde aus B
 * kann nur gewinnen, wenn A nichts Tragfähiges hergibt — eine stärkere
 * Zusicherung als jede Gewichtung, die von genug anderen Kriterien überstimmt
 * werden kann. Gleichzeitig bleibt der Suchraum klein, ohne dass irgendetwas
 * still weggeschnitten wird.
 *
 * Deterministisch: Nachbarn werden in fester Ordnung besucht — kuratiert vor
 * abgeleitet, dann nach Distanz (siehe `adjacencyOf`). Das Ergebnis ist bei
 * gleichem Snapshot identisch.
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
 * Notbremse gegen einen Raum, der nicht mehr aufzählbar ist.
 *
 * Dass sie greift, wird über `RoundTripEnumeration.gekappt` nach oben gemeldet
 * — die alte Bremse schwieg, und eine Suche, die still die halbe Ägäis
 * abschneidet, ist genau die Art Fehler, die zwei Monate unentdeckt bleibt.
 *
 * VON 50 000 AUF 80 000, als `SKIPPER_BESTAETIGT` dazukam. Schicht B stand mit
 * 45 470 Runden schon bei 91 % des alten Deckels; eine einzige zusätzliche
 * Kante kippte sie darüber (50 752). Die Zahl ist deshalb nicht "mehr Luft
 * nach oben", sondern der Preis dafür, dass die Schicht VOLLSTÄNDIG bleibt.
 *
 * VON 80 000 AUF 120 000, als `kea--serifos` dazukam (2026-08-08). Diesmal
 * kippte die VERKÜRZTE Schicht darüber: 68 527 → 95 814. Sie ist die
 * FR18-Notantwort-Schicht, und gerade dort ist eine abgeschnittene Tiefensuche
 * teuer — gemessen fiel die kürzeste Santorin-Runde (acht Etappen) aus dem
 * Ergebnis, weil der Deckel griff, bevor der DFS bei ihr ankam. Genau die Sorte
 * stiller Verzerrung, gegen die der ausgedünnte Graph oben gebaut ist.
 *
 * BEI VIERZEHN ETAPPEN GREIFT SIE — und das ist ab 2026-08-12 der Rahmen des
 * echten Törns (Rückgabe Fr 21.8. statt Di 18.8.). Gemessen an der
 * ausgelieferten Bibliothek, mit dem Deckel probeweise auf 20 Mio. gesetzt:
 *
 *              Etappen     Schicht A        Schicht B        Schicht C
 *                  11          5 192           71 088           95 814
 *                  12         14 453        1,2 Mio.*        1,2 Mio.*
 *                  14         85 452        2 861 717        4 123 050
 *
 *   Der Speicher ist die harte Grenze: A 0,13 GB, B 1,2 GB, C 2,7 GB — allein
 *   für die Arrays der Runden. (*bei 12/13 nur als „über dem Deckel" gemessen.)
 *
 * SCHICHT A BLEIBT VOLLSTÄNDIG, und sie ist die, die trägt: `roundTripLayers`
 * ist lazy, im Normalfall wird B und C nie gefragt (gemessen füllt Schicht A
 * den Vierzehn-Tage-Rahmen mit vierzehn Etappen und vierzehn verschiedenen
 * Inseln). Den Deckel dafür auf Millionen zu heben, wäre 2,7 GB und eine
 * halbe Minute im Browser — für eine Schicht, die nur dann befragt wird, wenn
 * das Wetter jede volle Runde rot färbt. Die Notantwort ist an Törntag 1
 * deshalb aus einer Ecke des Raumes gezogen statt aus dem ganzen; ab Törntag 3
 * (elf Etappen und kürzer) ist wieder alles vollständig, weil der Rahmen mit
 * jedem Tag schrumpft.
 *
 * WER DAS BESSER MACHEN WILL, hebt nicht den Deckel, sondern zählt Schicht C
 * nach STEIGENDER Etappenzahl auf (kurz zuerst) — dann ist die Notantwort
 * vollständig, wo sie gebraucht wird. Das ist ein Umbau der Schichtung, kein
 * Parameter.
 */
const HARD_CEILING = 120_000;

/**
 * Wie viele ZWEITANLÄUFE eine Runde höchstens haben darf.
 *
 * Kalibriert an zwei professionellen Törnvorschlägen (aegeansails.gr, beide
 * zwei Wochen ab Athen bzw. Lavrion): der eine läuft Kythnos zweimal an, der
 * andere Kythnos UND Paros — jeweils an verschiedenen Häfen (Loutra/Mericha,
 * Paroikia/Naoussa). Zwei ist also genau das, was die Praxis tut.
 *
 * Die Zahl wehrt das Pendeln über die GANZE Runde ab — dieselbe Kette über elf
 * Etappen hin und zurück bräuchte fünf Wiederholungen. Gegen ein LOKALES
 * `A → B → A`, das nur einen Zweitanlauf kostet, hilft sie nicht; dafür gibt es
 * seit 2026-08-07 eine eigene Regel in `search`.
 *
 * Wirkung an der ausgelieferten Bibliothek: 2947 wiederholungsfreie Runden über
 * den vollen Rahmen, 45 470 mit bis zu zwei Zweitanläufen. Sie tragen die
 * Inseln, die an wenigen Verbindungen hängen — bis 2026-08-07 war Delos/Rinia
 * ohne sie überhaupt nicht anzulaufen.
 */
const MAX_ZWEITANLAEUFE = 2;

/**
 * Wie viele ABGELEITETE Nachbarn je Insel in die AUFZÄHLUNG dürfen, und wie
 * weit sie reichen. Die Begründung und die Messreihe stehen bei `adjacencyOf`.
 *
 * Zwei bei 30 sm sind der gemessene Punkt, an dem der Raum vollständig
 * aufzählbar BLEIBT (2947 volle Runden statt über 300 000) und die Löcher
 * trotzdem zu sind — Polyaigos–Sifnos mit 11,3 sm ist die kürzeste abgeleitete
 * Nachbarin von Polyaigos und damit sicher dabei.
 */
const ABGELEITETE_JE_INSEL = 2;
const ABLEITUNG_AUFZAEHLUNG_NM = 30;

/**
 * ABGELEITETE ETAPPEN, DIE DER SKIPPER ALS TAGESSCHLAG BESTÄTIGT HAT — sie
 * umgehen die Ausdünnung, in BEIDEN Richtungen.
 *
 * Die Ausdünnung ist eine Rechen-Heuristik ("die zwei kürzesten je Insel"),
 * kein seemännisches Urteil. Sie kann deshalb eine Verbindung wegwerfen, die
 * ein Segler selbstverständlich fährt — und das ist am 2026-08-07 passiert:
 *
 *   „Meiner Meinung nach Paros durchaus Sinn von Serifos kommend … es ist der
 *    erste Teil der Reise, und es ist weiter östlich, also eigentlich meiner
 *    Meinung nach durchaus optimal."
 *
 * Serifos–Paros sind 31,2 sm. Serifos hat mit Polyaigos (23,5 sm) und Syros
 * (24,5 sm) schon zwei kürzere abgeleitete Nachbarn, Antiparos (27,1 sm) wäre
 * die dritte — die Etappe fiel also doppelt durch: am Deckel von zwei und an
 * der 30-sm-Grenze. Ab Paros ist sie sogar die siebtkürzeste.
 *
 * WARUM NICHT EINFACH DIE PARAMETER HOCHDREHEN: gemessen an der
 * ausgelieferten Bibliothek über elf Etappen holt `n=3 / 35 sm` diese Etappe
 * gar nicht herein (Paros bleibt die vierte) und verdreifacht den Suchraum
 * trotzdem — 9354 Runden statt 2947. Erst `n=4` bringt sie, dann aber
 * achtfach (23 585) und nur in EINER Richtung, weil die Ausdünnung je
 * Ausgangsinsel entscheidet. Diese Liste kostet +11 % (3272 Runden) und wirkt
 * symmetrisch.
 *
 * WARUM NICHT `abgeleitet: false` IN DEN DATEN: das Feld behauptet eine
 * RECHERCHIERTE Distanz und geprüfte Düsen-Warnungen (seeding/tools/
 * deriveLegs.ts). Die Etappe bleibt eine gemessene Geometrie — bestätigt ist
 * ihre seemännische Sinnhaftigkeit, nicht ihre Recherche. Zwei verschiedene
 * Aussagen, zwei verschiedene Orte.
 *
 * DERSELBE FALL EIN ZWEITES MAL, ANDERSHERUM (Skipper 2026-08-08): ab Kea liess
 * sich SERIFOS nicht als Tagesziel einstellen. Kea hat vier kuratierte Nachbarn
 * (Attika 15 sm, Kythnos 18, Syros 34, Athen 36) und KEINE EINZIGE abgeleitete
 * Etappe unter 30 sm — Serifos ist mit 40,1 sm die kürzeste, Delos/Rinia (50)
 * und Mykonos (51,2) folgen. Der Deckel von zwei je Insel war also gar nicht
 * das Problem, die 30-sm-Grenze war es allein: die Kante fiel aus der
 * Aufzählung, keine Runde konnte sie fahren, und das Menü zeigte deshalb nur
 * die vier kuratierten Nachbarn.
 *
 * Nicht die sm-Regel des Menüs hat gesperrt: 40,1 sm raumschots liegen weit
 * innerhalb der Tagesreichweite (100 sm). Es war ausschliesslich die
 * Rechen-Heuristik — genau das, wogegen diese Liste steht.
 *
 * Schlüssel ist das Insel-PAAR, alphabetisch sortiert und mit `--` verbunden.
 */
const SKIPPER_BESTAETIGT = new Set<string>([
  // Skipper 2026-08-07, siehe oben.
  'paros--serifos',
  // Skipper 2026-08-08, siehe oben.
  'kea--serifos',
]);

const inselPaar = (a: string, b: string): string => [a, b].sort().join('--');

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
  /**
   * Wie viele VERSCHIEDENE Nachbarinseln eine Insel hat — der Grad im Graphen.
   *
   * Er entscheidet, ob eine Insel eine SACKGASSE ist: bei Grad 1 führt der
   * einzige Weg hinaus derselbe zurück, den man gekommen ist. Die Regel gegen
   * das Pendeln (siehe `dfs`) macht davon ihre einzige Ausnahme.
   */
  grad: (islandId: string) => number;
  /**
   * WIE VIELE ETAPPEN MINDESTENS NOCH BIS NACH HAUSE — die Luftlinie in
   * Etappen, über den Aufzählungs-Graphen gezählt (Breitensuche, einmal je
   * Bibliothek).
   *
   * Sie ist eine ZULÄSSIGE Schranke: Zweitanläufe und die Pendel-Regel können
   * einen Weg nur verlängern, nie verkürzen. Passt `gefahren + heimHops` nicht
   * mehr in den Rahmen, gibt es unter diesem Zweig keine geschlossene Runde
   * mehr — der Zweig darf weg, ohne dass ein Ergebnis verloren geht.
   *
   * WARUM SIE DAZUKAM (2026-08-12): ohne sie läuft die Tiefensuche in jede
   * Sackgasse hinein und erst am Rahmen wieder heraus. Über elf Etappen war das
   * bezahlbar, über vierzehn nicht. Gemessen an EINER Bewertung der Tagesansicht
   * (das Etappen-Menü für jeden Törntag, `reach.ts`), auf der echten
   * Bibliothek:
   *
   *                                    ohne Schranke   mit Schranke
   *     Kette mit Hafentagen an der Basis     7,8 s         2,3 s
   *     volle Runde über vierzehn Etappen       —           2,0 s
   *     dieselbe Frage im Elf-Tage-Rahmen     0,9 s         0,5 s
   *
   * Die Menge der angebotenen Inseln ist dabei Zeichen für Zeichen dieselbe —
   * die Schranke schneidet nur Zweige weg, die nie hätten heimkommen können.
   */
  heimHops: (islandId: string) => number;
}

function adjacencyOf(snapshot: PlanningSnapshot): Adjacency {
  const index = legIndexWithReverses(snapshot.library);
  const plaetzeJeInsel = new Map<string, number>();
  for (const p of snapshot.library.places) {
    plaetzeJeInsel.set(p.islandId, (plaetzeJeInsel.get(p.islandId) ?? 0) + 1);
  }
  const alle = new Map<string, Leg[]>();
  for (const leg of index.values()) {
    const list = alle.get(leg.fromIslandId) ?? [];
    list.push(leg);
    alle.set(leg.fromIslandId, list);
  }

  /**
   * DER AUFZÄHLUNGS-GRAPH IST DÜNNER ALS DIE BIBLIOTHEK — gemessen, nicht
   * geschätzt.
   *
   * Mit allen 110 abgeleiteten Etappen (deriveLegs.ts) hat das Revier einen
   * mittleren Grad von 13,2 und über 300 000 volle Runden. Die Tiefensuche
   * lief dann in `HARD_CEILING` (50 000 je Schicht) — und eine ABGESCHNITTENE
   * Tiefensuche ist verzerrt: sie sammelt 50 000 Runden aus EINER Ecke des
   * Raumes, weil alle einen langen gemeinsamen Anfang teilen. Das Ergebnis war
   * gemessen ein Plan mit zehn statt elf Etappentagen — also genau der Fehler,
   * mit dem dieser ganze Umbau angefangen hat.
   *
   * Deshalb zählt die Suche über einen ausgedünnten Graphen auf, und zwar
   * VOLLSTÄNDIG statt gekappt:
   *
   *   alle KURATIERTEN Etappen (nichts, was je ging, geht verloren)
   *   + die `ABGELEITETE_JE_INSEL` kürzesten abgeleiteten je Insel bis
   *     `ABLEITUNG_AUFZAEHLUNG_NM`
   *
   * Gemessen an der ausgelieferten Bibliothek (74 kuratierte Kanten, 68 volle
   * Runden):
   *
   *     n=1 / 30 sm →  94 Kanten, Grad 4,3 →    602 Runden
   *     n=2 / 30 sm → 111 Kanten, Grad 5,0 →  2 947 Runden
   *     n=3 / 30 sm → 127 Kanten, Grad 5,8 →  8 778 Runden
   *     alle / 50 sm → 290 Kanten, Grad 13,2 → über 300 000 (gekappt)
   *
   * WAS DAMIT NICHT PASSIERT: die langen abgeleiteten Etappen verschwinden
   * nicht aus der Bibliothek. Sie tragen Forecast, Kurs und Distanz, und jeder
   * Plan, der sie enthält, wird normal bewertet. Was sie nicht mehr tun, ist
   * die vollständige Rundkurs-Aufzählung zu sprengen — ein Boot, das von Kea
   * nach Amorgos will, fährt ohnehin über die Inseln dazwischen.
   */
  const edges = new Map<string, Leg[]>();
  for (const [insel, list] of alle) {
    const kuratiert = list.filter((l) => l.abgeleitet !== true);
    const abgeleitet = list
      .filter((l) => l.abgeleitet === true && l.distanceNm <= ABLEITUNG_AUFZAEHLUNG_NM)
      .sort((a, b) => a.distanceNm - b.distanceNm || a.id.localeCompare(b.id));
    const genommen = new Set(kuratiert.map((l) => l.toIslandId));
    const dazu: Leg[] = [];
    // ZUERST die vom Skipper bestätigten Etappen — sie stehen ausserhalb des
    // Deckels und der sm-Grenze, sonst wären sie keine Bestätigung.
    for (const leg of list) {
      if (leg.abgeleitet !== true) continue;
      if (genommen.has(leg.toIslandId)) continue;
      if (!SKIPPER_BESTAETIGT.has(inselPaar(insel, leg.toIslandId))) continue;
      genommen.add(leg.toIslandId);
      dazu.push(leg);
    }
    for (const leg of abgeleitet) {
      if (dazu.length >= ABGELEITETE_JE_INSEL) break;
      // Eine abgeleitete Etappe zu einer Insel, die schon kuratiert erreichbar
      // ist, bringt der AUFZÄHLUNG nichts — die Kante gibt es dort bereits.
      if (genommen.has(leg.toIslandId)) continue;
      genommen.add(leg.toIslandId);
      dazu.push(leg);
    }
    edges.set(insel, [...kuratiert, ...dazu]);
  }
  /**
   * FESTE ORDNUNG — die Determinismus-Garantie der Suche. Aber nicht mehr
   * alphabetisch, sondern nach DISTANZ, kuratierte Etappen zuerst.
   *
   * Warum das mehr ist als Kosmetik: der Raum ist seit den abgeleiteten
   * Etappen (deriveLegs.ts) nicht mehr in jedem Fall vollständig aufzählbar —
   * bei mittlerem Grad 13 gibt es über 300 000 volle Runden, und `HARD_CEILING`
   * greift. WELCHE Runden dann übrig bleiben, entscheidet diese Reihenfolge.
   *
   * Alphabetisch war das der Fehler, mit dem dieses Modul einmal begonnen hat:
   * „weil die Nachbarn in fester alphabetischer Ordnung besucht wurden, immer
   * DENSELBEN Teil" — Santorin und Folegandros fielen komplett heraus. Nach
   * Distanz sortiert ist die Auswahl dagegen SEEMÄNNISCH: was zuerst gefunden
   * wird, sind die kurzen, naheliegenden Schläge, und die kuratierten vor den
   * abgeleiteten. Ein Deckel schneidet dann die weit hergeholten Runden ab,
   * nicht die mit dem späten Anfangsbuchstaben.
   */
  for (const list of edges.values()) {
    list.sort(
      (a, b) =>
        Number(a.abgeleitet === true) - Number(b.abgeleitet === true) ||
        a.distanceNm - b.distanceNm ||
        a.toIslandId.localeCompare(b.toIslandId) ||
        a.id.localeCompare(b.id),
    );
  }
  const nachbarn = new Map<string, Set<string>>();
  for (const leg of index.values()) {
    const set = nachbarn.get(leg.fromIslandId) ?? new Set<string>();
    set.add(leg.toIslandId);
    nachbarn.set(leg.fromIslandId, set);
  }
  const base = snapshot.params.baseIslandId;
  /**
   * Breitensuche RÜCKWÄRTS von der Basis: die Zahl der Etappen, die eine Insel
   * mindestens von ihr trennt. Unerreichbare Inseln bleiben unendlich weit weg
   * und werden damit gar nicht erst betreten.
   */
  const heim = new Map<string, number>([[base, 0]]);
  const rueckKanten = new Map<string, string[]>();
  for (const leg of index.values()) {
    const list = rueckKanten.get(leg.toIslandId) ?? [];
    list.push(leg.fromIslandId);
    rueckKanten.set(leg.toIslandId, list);
  }
  const schlange: string[] = [base];
  for (let i = 0; i < schlange.length; i++) {
    const node = schlange[i]!;
    const d = heim.get(node)!;
    for (const vor of rueckKanten.get(node) ?? []) {
      if (heim.has(vor)) continue;
      heim.set(vor, d + 1);
      schlange.push(vor);
    }
  }

  return {
    base,
    edges,
    index,
    plaetze: (islandId) => plaetzeJeInsel.get(islandId) ?? 0,
    grad: (islandId) => nachbarn.get(islandId)?.size ?? 0,
    heimHops: (islandId) => heim.get(islandId) ?? Number.POSITIVE_INFINITY,
  };
}

/**
 * Der Aufzählungs-Graph, EINMAL je Snapshot. Er hängt nur an der Bibliothek und
 * der Basis; gebaut wird er aber von jeder Frage, und das Etappen-Menü stellt
 * vierzehn davon je Bewertung.
 */
const adjacencyCache = new WeakMap<PlanningSnapshot, Adjacency>();

function adjacencyFor(snapshot: PlanningSnapshot): Adjacency {
  let adj = adjacencyCache.get(snapshot);
  if (!adj) {
    adj = adjacencyOf(snapshot);
    adjacencyCache.set(snapshot, adj);
  }
  return adj;
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
   * Der Deckel wehrt das Pendeln über die GANZE Runde ab: dieselbe Kette über
   * elf Etappen hin und zurück bräuchte fünf Wiederholungen.
   *
   * ER TUT ABER NICHT MEHR ALS DAS — bis 2026-08-07 stand hier das Gegenteil.
   * Ein LOKALES `A → B → A` kostet genau EINEN Zweitanlauf und war damit voll
   * erlaubt; der Skipper bekam `Paros → Ios → Paros` angeboten. Dagegen steht
   * jetzt eine eigene Regel in `dfs`, und der Satz hier sagt nur noch, was er
   * belegen kann.
   */
  maxRepeats: number;
}

/**
 * DIE TIEFENSUCHE SELBST — einmal geschrieben, zwei Auswertungen.
 *
 * `search` sammelt die Runden in ein Array (das ist die Aufzählung, die der
 * Solver braucht). Das Etappen-MENÜ braucht etwas anderes: nur die Frage
 * „welche Insel kann als nächste kommen?", und für die ist ein Array aus
 * Millionen Runden der falsche Weg — es beantwortet eine kleine Frage mit dem
 * ganzen Raum und läuft in den Deckel (siehe `moeglicheNaechsteInseln`).
 *
 * Deshalb läuft die Suche gegen einen BESUCHER: er sieht jede fertige Runde als
 * `path` + Schluss-Etappe und sagt mit `false`, dass er genug gesehen hat.
 *
 * WICHTIG: `path` ist der LEBENDE Pfad der Suche, keine Kopie. Wer ihn behalten
 * will, kopiert ihn selbst — genau das tut `search`.
 */
type TripVisitor = (path: readonly Leg[], closing: Leg, nachPosition: number) => boolean;

/**
 * DIE VORGESCHICHTE ALS SUCHVORGABE — nicht als Filter hinterher.
 *
 * Das Etappen-Menü fragt nach dem Tag N eines Plans, der bis zum Vorabend schon
 * liegt. Die Runden, die dazu passen, sind ein winziger Teil des Raumes; sie
 * hinterher herauszufiltern heisst, den ganzen Raum aufzuzählen, um ein paar
 * Zweige zu behalten. Über vierzehn Etappen ist das nicht mehr bezahlbar.
 *
 * Als VORGABE gelesen führt dieselbe Bedingung die Suche: `folge` muss als
 * Teilfolge in der Runde vorkommen, und ihr letztes Glied darf nicht hinter
 * `maxPosition` liegen. Beides prunt hart —
 *
 *   - Trifft eine Etappe das nächste offene Glied der Folge, MUSS sie es
 *     belegen (die Zuordnung ist gierig, genau wie die alte Filter-Rechnung in
 *     `reach.positionNachVorgeschichte`: sie nahm immer das erste Vorkommen).
 *   - Trifft sie es nicht, ist der Schritt nur erlaubt, solange die restlichen
 *     Glieder noch vor `maxPosition` unterkommen. Im Regelfall — die Folge ist
 *     so lang wie die Tage, die sie beschreibt — bleibt damit GENAU der Weg des
 *     Plans übrig, und die Suche beginnt praktisch am Tag der Frage.
 *
 * `bereitsGefunden` ist der zweite Hebel: die Antwort ist eine MENGE von
 * Inseln, und für jede genügt EINE Runde. Steht eine Insel schon in der Menge,
 * braucht ihr Zweig nicht noch einmal durchsucht zu werden.
 */
export interface VorgabeGlied {
  insel: string;
  /** Frühestmögliche und spätestmögliche Position in der Insel-Folge (1-basiert). */
  minPosition: number;
  maxPosition: number;
}

interface Vorgabe {
  glieder: readonly VorgabeGlied[];
  /**
   * Zweige überspringen, deren Insel direkt hinter der Vorgabe schon gefunden
   * ist. Nur für Fragen, die eine MENGE von Inseln suchen und für jede genau
   * eine Runde brauchen (`moeglicheNaechsteInseln`) — für die Aufzählung bleibt
   * die Menge leer.
   */
  bereitsGefunden?: ReadonlySet<string>;
}

function walkRoundTrips(
  adj: Adjacency,
  startIslandId: string,
  opts: SearchOpts,
  besucher: TripVisitor,
  vorgabe?: Vorgabe,
): void {
  const bound = Math.min(Math.max(opts.legCount, 1), MAX_LEGS_CEILING);
  let gestoppt = false;

  // Eine Runde ab der Basis braucht mindestens zwei Etappen (hin UND zurück);
  // von unterwegs ist schon die eine Etappe heim ein vollständiger Restplan.
  const minLegs = opts.exact ? bound : startIslandId === adj.base ? 2 : 1;

  /** Wie oft jede Insel auf dem aktuellen Pfad schon angelaufen wurde. */
  const anlaeufe = new Map<string, number>([[startIslandId, 1]]);
  let wiederholungen = 0;
  const path: Leg[] = [];
  /** Wie viele Glieder der Vorgabe schon belegt sind, und an welcher Position. */
  let belegt = 0;
  let nachPosition = 0;
  const glieder = vorgabe?.glieder.length ?? 0;

  const accept = (closing: Leg): void => {
    const length = path.length + 1;
    if (length < minLegs) return;
    if (opts.exact && length !== bound) return;
    /**
     * DIE BASIS KANN DAS LETZTE GLIED SEIN. Sie wird nie durchfahren, steht in
     * `dfs` also gar nicht zur Wahl — und ein Pin auf sie (der Skipper setzt
     * „Tag 14 zurück nach Athen") wäre damit unerfüllbar geworden. Sie belegt
     * ihr Glied deshalb hier, an der Schluss-Etappe, wo sie vorkommt.
     */
    let belegtHier = belegt;
    let nachHier = nachPosition;
    if (vorgabe !== undefined && belegt === glieder - 1) {
      const glied = vorgabe.glieder[belegt]!;
      if (
        glied.insel === closing.toIslandId &&
        length >= glied.minPosition &&
        length <= glied.maxPosition
      ) {
        belegtHier = glieder;
        nachHier = length;
      }
    }
    // Eine Runde, die die Vorgabe nicht vollständig belegt, gehört nicht dazu.
    if (belegtHier < glieder) return;
    if (!besucher(path, closing, nachHier)) gestoppt = true;
  };

  const dfs = (node: string): void => {
    if (gestoppt) return;
    for (const leg of adj.edges.get(node) ?? []) {
      if (gestoppt) return;
      const to = leg.toIslandId;
      /** Position, die diese Etappe in der Insel-Folge der Runde einnimmt. */
      const position = path.length + 1;
      if (to === adj.base) {
        // Die Basis wird nie DURCHFAHREN: wer sie erreicht, ist zu Hause.
        accept(leg);
        continue;
      }
      // Noch mindestens die Schluss-Etappe zur Basis muss danach passen.
      if (path.length + 2 > bound) continue;
      // Und der Weg nach Hause muss überhaupt noch in den Rahmen passen
      // (`Adjacency.heimHops` — zulässige Schranke, begründet dort).
      if (position + adj.heimHops(to) > bound) continue;

      /**
       * DIE VORGABE FÜHRT DIE SUCHE (Begründung bei `Vorgabe`). Drei Fälle:
       * das nächste offene Glied wird belegt, es wird übersprungen (nur solange
       * die restlichen Glieder noch vor `maxPosition` passen), oder die Vorgabe
       * ist voll und die Insel direkt dahinter ist eine, die schon gefunden ist.
       */
      let belegtJetzt = false;
      if (vorgabe !== undefined) {
        if (belegt < glieder) {
          const glied = vorgabe.glieder[belegt]!;
          // Hinter dem Fenster ist das Glied nicht mehr unterzubringen.
          if (position > glied.maxPosition) continue;
          // Die Zuordnung ist GIERIG: das früheste Vorkommen im Fenster belegt
          // das Glied. Bei Fenstern in aufsteigender Reihenfolge lässt das den
          // nachfolgenden Gliedern den grössten Spielraum — es kann also keine
          // Runde verlieren, die die Vorgabe sonst erfüllt hätte.
          if (to === glied.insel && position >= glied.minPosition) belegtJetzt = true;
        } else if (
          position === nachPosition + 1 &&
          vorgabe.bereitsGefunden?.has(to) === true
        ) {
          continue;
        }
      }

      /**
       * KEIN PENDELN: nicht sofort dorthin zurück, wo man gerade herkam.
       *
       * Der Befund des Skippers vom 2026-08-07 an der ausgelieferten App:
       * `Paros (Naoussa) → Ios → Paros (Parikia)`. Zwei Törntage für EINE
       * Insel, und der Rückweg ist der Hinweg gegenan — im Screenshot eine rote
       * Etappe mit 32 sm Kreuzen. Genau die Form, gegen die er sich von Anfang
       * an gewehrt hat ("Paros–Naxos ist eine direkte Linie hin und zurück").
       *
       * WARUM DER DECKEL DAS NICHT SCHON TAT. `MAX_ZWEITANLAEUFE` verhindert
       * das Pendeln über die GANZE Runde — dieselbe Kette elf Etappen hin und
       * zurück bräuchte fünf Wiederholungen. Ein LOKALES A → B → A kostet
       * genau EINEN Zweitanlauf und war voll erlaubt. Der Kommentar am Deckel
       * hat mehr zugesagt, als die Regel hielt; das ist hier korrigiert.
       *
       * DIE EINZIGE AUSNAHME IST AUS DEN DATEN HERGELEITET, NICHT ERFUNDEN.
       * Route 2 der Törnanalyse fährt `Mykonos → Delos/Rinia → Mykonos`, und
       * das MUSS weiter gehen: Delos/Rinia hat genau eine Etappe (Grad 1), der
       * einzige Weg hinaus ist der zurück. Es ist die einzige solche Insel im
       * Revier — Ios, Donousa, Folegandros, Iraklia und Polyaigos haben alle
       * zwei Nachbarn, für sie gibt es also immer eine Weiterfahrt.
       *
       * Die Basis braucht keine Ausnahme: sie wird oben abgefangen, wer sie
       * erreicht, ist zu Hause.
       */
      const herkunft = path[path.length - 1]?.fromIslandId;
      if (herkunft !== undefined && to === herkunft && adj.grad(node) > 1) continue;

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
      const nachPositionVorher = nachPosition;
      if (belegtJetzt) {
        belegt++;
        nachPosition = position;
      }
      dfs(to);
      if (belegtJetzt) {
        belegt--;
        nachPosition = nachPositionVorher;
      }
      path.pop();
      anlaeufe.set(to, bisher);
      if (bisher > 0) wiederholungen--;
    }
  };

  dfs(startIslandId);
}

function search(adj: Adjacency, startIslandId: string, opts: SearchOpts): RoundTripEnumeration {
  const out: Leg[][] = [];
  let gekappt = false;
  walkRoundTrips(adj, startIslandId, opts, (path, closing) => {
    out.push([...path, closing]);
    if (out.length >= HARD_CEILING) {
      gekappt = true;
      return false;
    }
    return true;
  });
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

/** Die drei Schichten als Bauplan — gerechnet wird erst, was gebraucht wird. */
function bauplanFor(legCount: number): SearchOpts[] {
  return [
    // A — der Vertrag: jeder Törntag eine Etappe, jede Insel höchstens einmal.
    { legCount, exact: true, maxRepeats: 0 },
    // B — voller Rahmen, bis zu MAX_ZWEITANLAEUFE Zweitanläufe an anderen
    //     Häfen. Das ist, was die Ost-Kykladen überhaupt in Reichweite bringt:
    //     Amorgos und die Kleinen Kykladen kommen in KEINER wiederholungsfreien
    //     Runde vor, mit zwei Zweitanläufen schon.
    { legCount, exact: true, maxRepeats: MAX_ZWEITANLAEUFE },
    // C — kürzer als der Rahmen. Restplan von unterwegs, und die FR18-Antwort,
    //     wenn das Wetter jede volle Runde rot färbt.
    { legCount, exact: false, maxRepeats: MAX_ZWEITANLAEUFE },
  ];
}

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
  /**
   * DER CACHE IST EIN VORRAT, KEIN ERGEBNIS (Fehler bis 2026-08-08).
   *
   * Hier stand `const gecacht = proSnapshot.get(key); if (gecacht) { yield*
   * gecacht; return; }` — und weil die Aufzählung LAZY ist, enthielt der
   * Eintrag genau die Schichten, die der ERSTE Aufrufer gebraucht hatte. Der
   * erste Aufrufer ist immer die Hauptroute, und die bricht nach Schicht A ab,
   * sobald diese trägt. Ab da war der Snapshot für ALLE weiteren Fragen blind
   * für die Schichten B und C: das `return` gab vor, es gäbe keine mehr.
   *
   * Gemessen an der echten Bibliothek war das der Grund, warum eine manuelle
   * Änderung nicht mehr durchging. „Tag 3 nach Kythnos" braucht bei gehaltenen
   * Vortagen eine Runde mit Zweitanlauf (Schicht B): KEINE der 5192 Runden der
   * Schicht A trägt diesen Pin, 1316 der 71 088 Runden der Schicht B tragen
   * ihn. Auf einem frischen Snapshot liefert der Solver den
   * Plan; nach dem Lauf der Hauptroute auf DEMSELBEN Snapshot — also immer, in
   * der laufenden App — lieferte er `null`, und die Ansicht meldete „kein
   * Round-Trip führt dorthin". Der Fehler war nicht die Suche, sondern ein
   * Cache, der Unwissen als Antwort auslieferte.
   *
   * Gecacht wird deshalb POSITIONSWEISE: was schon aufgezählt ist, kommt aus
   * dem Vorrat, der Rest wird jetzt gerechnet. Die Lazy-Auswertung bleibt
   * damit erhalten — nur endet sie nicht mehr im Cache selbst.
   */
  const alle = proSnapshot.get(key) ?? [];
  proSnapshot.set(key, alle);

  const bauplan = bauplanFor(legCount);

  let adj: Adjacency | null = null;
  for (const [i, opts] of bauplan.entries()) {
    const gecacht = alle[i];
    if (gecacht) {
      yield gecacht;
      continue;
    }
    adj ??= adjacencyFor(snapshot);
    const erzeugt = search(adj, startIslandId, opts);
    // VOR dem yield in den Vorrat: ein Aufrufer, der innerhalb seiner Schleife
    // dieselbe Aufzählung noch einmal anstösst, findet sie dann schon vor.
    alle[i] = erzeugt;
    yield erzeugt;
  }
}

/**
 * DIE SCHICHTEN, VON EINER VORGABE GEFÜHRT — für eine Suche, die schon weiss,
 * wo sie hin soll.
 *
 * `roundTripLayers` zählt den GANZEN Raum auf und lässt den Aufrufer filtern.
 * Solange der Raum vollständig aufzählbar ist, ist das das Richtige: einmal
 * gerechnet, je Snapshot gecacht, von allen Fragen benutzt. Über vierzehn
 * Etappen ist er es nicht mehr (die Zahlen stehen bei `HARD_CEILING`) — und
 * dann trifft der Deckel genau die Frage, die der Skipper stellt, wenn er einen
 * Tag von Hand setzt: „gib mir eine Runde, die an Tag 3 nach Kythnos läuft".
 * Gemessen bot das Menü vier Ziele an, die der Solver danach ablehnte, nicht
 * weil es keine Runde gab, sondern weil sie nicht unter den ersten 120 000 der
 * Tiefensuche stand.
 *
 * Mit der Vorgabe fällt der Filter in die Suche: die gepinnten Inseln führen
 * die Tiefensuche, und der Raum, der übrig bleibt, ist klein. Der genaue Test
 * bleibt trotzdem stehen (`solver.kannPinTragen`) — die Vorgabe ist die
 * NOTWENDIGE Bedingung, die Tag-zu-Position-Rechnung des Packers ist die
 * hinreichende.
 *
 * BEWUSST OHNE MEMO: ein geführter Raum ist ein anderer je Vorgabe, und der
 * Aufrufer cacht ihn schon unter seinem Pin-Schlüssel (`solver.candidateCache`).
 */
export function* roundTripLayersGefuehrt(
  snapshot: PlanningSnapshot,
  startIslandId: string,
  legCount: number,
  glieder: readonly VorgabeGlied[],
): Generator<RoundTripEnumeration> {
  const adj = adjacencyFor(snapshot);
  for (const opts of bauplanFor(legCount)) {
    const out: Leg[][] = [];
    let gekappt = false;
    walkRoundTrips(
      adj,
      startIslandId,
      opts,
      (path, closing) => {
        out.push([...path, closing]);
        if (out.length >= HARD_CEILING) {
          gekappt = true;
          return false;
        }
        return true;
      },
      { glieder },
    );
    yield {
      layer: opts.exact
        ? opts.maxRepeats > 0
          ? 'voll-mit-zweitanlauf'
          : 'voll-ohne-wiederholung'
        : 'verkuerzt',
      trips: out,
      gekappt,
    };
  }
}

/**
 * WELCHE INSEL KANN ALS NÄCHSTE KOMMEN? — die Frage des Etappen-Menüs, direkt
 * gestellt statt über den aufgezählten Raum.
 *
 * `reach.islandsPossibleNext` hat sie bis 2026-08-12 an den Schichten
 * beantwortet: alle Runden materialisieren, je Runde die Vorgeschichte als
 * Teilfolge suchen, die Insel dahinter einsammeln. Über elf Etappen ging das
 * (71 088 Runden in Schicht B); über VIERZEHN nicht mehr — dort hat Schicht B
 * 2,86 Mio. Runden, der Deckel greift bei 120 000, und die Tiefensuche sammelt
 * sie alle aus EINER Ecke des Raumes.
 *
 * GEMESSEN AM ECHTEN TÖRN war das kein Randfall: nach „Tag 1 Kea" enthielten
 * die gekappten Schichten B und C über vierzehn Etappen NICHT EINE EINZIGE
 * Runde, die überhaupt über Kea läuft. Das Menü an Tag 2 verlor damit Kythnos
 * — genau die Zusage, die der Skipper am 2026-08-08 beim Namen genannt hatte.
 *
 * DIE FRAGE IST ABER KLEIN. Die Antwort kann nie mehr Inseln enthalten, als die
 * letzte Insel der Vorgeschichte Nachbarn hat — im Revier zwischen zwei und
 * dreizehn. Sie braucht also keinen aufgezählten Raum, sondern eine Suche, die
 * unterwegs einsammelt und AUFHÖRT, sobald die Nachbarschaft ausgeschöpft ist.
 * Genau das steht hier: dieselben Regeln, dieselbe Schichtung, kein Array und
 * kein Deckel.
 *
 * `vorgeschichte` ist der Weg des Plans bis zum Vorabend, als TEILFOLGE
 * gesucht (nicht als Präfix — dieselbe Regel wie vorher, sie lässt Wartetage
 * zwischen den Zielen zu), und `maxPosition` begrenzt, wie weit vorne in der
 * Runde diese Teilfolge enden darf.
 */
export function moeglicheNaechsteInseln(
  snapshot: PlanningSnapshot,
  startIslandId: string,
  legCount: number,
  vorgeschichte: readonly string[],
  maxPosition: number,
): Set<string> {
  const adj = adjacencyFor(snapshot);
  const out = new Set<string>();

  /**
   * Die Sättigungsgrenze: mehr als die Nachbarschaft der letzten
   * Vorgeschichte-Insel kann nicht herauskommen. Ist sie voll, ist die Antwort
   * fertig und die Suche darf abbrechen — der Normalfall, und mit der Vorgabe
   * oben der Grund, dass diese Frage auch über vierzehn Etappen billig bleibt.
   */
  const letzte = vorgeschichte[vorgeschichte.length - 1] ?? startIslandId;
  const nachbarschaft = new Set((adj.edges.get(letzte) ?? []).map((l) => l.toIslandId));

  for (const opts of bauplanFor(legCount)) {
    /**
     * Die verkürzte Schicht ist die FR18-Notantwort und kein Angebot — solange
     * die vollen Runden überhaupt etwas hergeben. Dieselbe Regel wie vorher in
     * `reach.islandsPossibleNext`, nur steht sie jetzt neben der Suche, die sie
     * betrifft.
     */
    if (!opts.exact && out.size > 0) break;
    if (out.size >= nachbarschaft.size) break;
    /**
     * Die Vorgeschichte als Vorgabe: Glied j muss mindestens auf Position j+1
     * liegen, und das LETZTE nicht hinter `maxPosition` — die Fenster der
     * vorderen Glieder folgen daraus, sie müssen den hinteren Platz lassen.
     * Damit steht hier dieselbe Bedingung wie in der alten Filter-Rechnung,
     * nur führt sie jetzt die Suche.
     */
    const glieder: VorgabeGlied[] = vorgeschichte.map((insel, j) => ({
      insel,
      minPosition: j + 1,
      maxPosition: maxPosition - (vorgeschichte.length - 1 - j),
    }));
    walkRoundTrips(
      adj,
      startIslandId,
      opts,
      (path, closing, nachPosition) => {
        // Die Insel an der Position hinter der Vorgeschichte — ohne die
        // Insel-Folge der Runde zu bauen.
        const i = nachPosition + 1;
        const insel = i === path.length + 1 ? closing.toIslandId : path[i - 1]?.toIslandId;
        if (insel !== undefined) out.add(insel);
        // Weitersuchen nur, solange die Nachbarschaft nicht ausgeschöpft ist.
        return out.size < nachbarschaft.size;
      },
      { glieder, bereitsGefunden: out },
    );
  }
  return out;
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
