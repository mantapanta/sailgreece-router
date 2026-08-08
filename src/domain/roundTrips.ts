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
 * Notbremse gegen einen Raum, der nicht mehr aufzählbar ist. An der
 * ausgelieferten Bibliothek greift sie bei KEINER Schicht — alle drei sind
 * vollständig (5192 / 71 088 / 95 814 Runden über elf Etappen).
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
 * Gemessen kosten alle drei Schichten zusammen 0,9 s — einmal je Snapshot,
 * danach aus dem Memo (`layerCache`).
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
  return {
    base: snapshot.params.baseIslandId,
    edges,
    index,
    plaetze: (islandId) => plaetzeJeInsel.get(islandId) ?? 0,
    grad: (islandId) => nachbarn.get(islandId)?.size ?? 0,
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

  /** Die drei Schichten als Bauplan — gerechnet wird erst, was gebraucht wird. */
  const bauplan: SearchOpts[] = [
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

  let adj: Adjacency | null = null;
  for (const [i, opts] of bauplan.entries()) {
    const gecacht = alle[i];
    if (gecacht) {
      yield gecacht;
      continue;
    }
    adj ??= adjacencyOf(snapshot);
    const erzeugt = search(adj, startIslandId, opts);
    // VOR dem yield in den Vorrat: ein Aufrufer, der innerhalb seiner Schleife
    // dieselbe Aufzählung noch einmal anstösst, findet sie dann schon vor.
    alle[i] = erzeugt;
    yield erzeugt;
  }
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
