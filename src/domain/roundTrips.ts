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
 *     2 947 Runden ohne jede Wiederholung   (vollständig)
 *    45 470 mit bis zu zwei Zweitanläufen   (vollständig)
 *    50 000 kürzer als der Rahmen           (gekappt — die Notantwort-Schicht)
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
 * Notbremse gegen einen Raum, der nicht mehr aufzählbar ist. Sie greift heute
 * bei EINER Schicht: der verkürzten (50 000 von mehr). Das ist die
 * FR18-Notantwort-Schicht — sie wird nur befragt, wenn keine volle Runde trägt,
 * und dort ist die Vollständigkeit weniger wert als die Antwort überhaupt.
 * Die beiden vollen Schichten bleiben unter der Bremse und damit VOLLSTÄNDIG.
 *
 * Dass sie greift, wird über `RoundTripEnumeration.gekappt` nach oben gemeldet
 * — die alte Bremse schwieg, und eine Suche, die still die halbe Ägäis
 * abschneidet, ist genau die Art Fehler, die zwei Monate unentdeckt bleibt.
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
