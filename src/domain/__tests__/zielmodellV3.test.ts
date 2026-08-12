/**
 * ZIELMODELL V3 gegen die ECHTE Bibliothek.
 *
 * Diese Datei ist der Wächter über die Kernfunktion der App. Die Beanstandung
 * des Skippers vom 2026-08-07 lautete: "das, was die App eigentlich machen
 * soll, macht sie nicht" — Hauptroute mit neun statt elf Etappen, Alternativen
 * mit sechs und acht, "Paros–Naxos" als gerade Linie hin und zurück, und eine
 * "Verlängerung nach Santorin", die nicht nach Santorin führt.
 *
 * DER SUCHRAUM WÄCHST MIT DER BIBLIOTHEK, und dreimal war die Bibliothek das
 * Problem — nie die Kriterien:
 *
 *      6 volle Runden — 39 Etappen, der Stand beim Umbau am 2026-08-07
 *     68 — nach den sieben Etappen aus der Törnanalyse (Naxos–Sifnos,
 *          Milos–Serifos, Sifnos–Kythnos, Mykonos–Donousa, Donousa–Amorgos,
 *          Schinoussa–Naxos, Mykonos–Delos/Rinia)
 *   2947 — nach den 110 ABGELEITETEN Etappen (deriveLegs.ts), über den
 *          ausgedünnten Aufzählungs-Graphen
 *
 * Der letzte Schritt kam aus dem Einwand des Skippers: „am Ende kann ich ja als
 * Segler überall hinfahren." Die Bibliothek kannte 37 Insel-Paare, während 41
 * weitere unter 30 sm lagen und gar nicht existierten — der Graph war eine
 * Stichprobe des Reviers, kein Modell davon.
 *
 * Die App hat von den sechs keinen einzigen angeboten. Nicht, weil die Suche zu
 * klein gerechnet hätte — sechs Kandidaten kann man vollständig durchrechnen —,
 * sondern weil ein zweiter Kandidatengenerator ("Variante bis zum Wendepunkt +
 * Rückfallkette heim") Pendelrouten erzeugte und im Dedup gewann, und weil die
 * Rangfolge die Etappenzahl auf Rang 14 von 14 führte.
 *
 * Deshalb läuft dieser Test gegen die ECHTEN Staging-Daten und nicht gegen
 * Fixtures (wie libraryGeometry.test.ts): ein Zielmodell, das nur an
 * konstruierten Miniatur-Graphen stimmt, hat genau nichts bewiesen.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assessPlanning } from '../assess.ts';
import {
  konzeptOfIslands,
  konzeptOfPlan,
  OST_MARKER_INSELN,
  umlaufsinnGebot,
  windMittelFor,
} from '../konzept.ts';
import { enumerateRoundTrips, roundTripLayers } from '../roundTrips.ts';
import { routeIslandSequence } from '../ppr.ts';
import {
  candidateLayers,
  completePlan,
  planMetricsFor,
  planTurn,
  preferred,
  type Candidate,
  type Pin,
  type PlanMetrics,
  type SolveResult,
} from '../solver.ts';
import { islandSequence } from '../legs.ts';
import { islandAtEndOfDay } from '../schema/plan.ts';
import { stagesOf } from '../schema/plan.ts';
import { DEFAULT_PARAMS } from '../schema/params.ts';
import { deadlineFrame } from '../time.ts';
import type { Island } from '../schema/island.ts';
import type { Place } from '../schema/place.ts';
import type { Leg, Variant } from '../schema/route.ts';
import type { PlanningSnapshot } from '../schema/snapshot.ts';
import type { WindTopoZone } from '../schema/windTopo.ts';
import { applyWindTopo } from '../windTopo.ts';
import { collectLocations } from '../../adapters/openMeteo.ts';
import { constantForecast, makeTimes, TEST_POLAR, TRIP_START } from './fixtures.ts';

const dataDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../seeding/data',
);
const read = <T,>(...p: string[]): T =>
  JSON.parse(readFileSync(path.join(dataDir, ...p), 'utf8')) as T;

const legs = read<{ legs: Leg[] }>('legs.json').legs;
const variants = read<{ variants: Variant[] }>('variants.json').variants;
/**
 * Die kuratierten Wind-Zonen (Düsen und Lee-Keulen, domain/windTopo.ts) gehören
 * zur Bibliothek und damit in diesen Snapshot. Ohne sie prüfte der Test eine
 * Physik, die zur Laufzeit gar nicht gilt: `Library.windTopoZones` ist optional,
 * eine fehlende Liste heisst schlicht "keine Topographie" — und die Tests wären
 * grün geblieben, während die App etwas anderes rechnet.
 */
const windTopoZones = read<{ zones: WindTopoZone[] }>('windtopo.json').zones;

/** Nur die Inseln, die im Etappen-Graphen überhaupt vorkommen. */
const graphIslandIds = [...new Set(legs.flatMap((l) => [l.fromIslandId, l.toIslandId]))];

const { islands, places } = (() => {
  const islands: Island[] = [];
  const places: Place[] = [];
  for (const id of graphIslandIds) {
    const doc = read<{ island: Island; places?: Place[] }>('islands', `${id}.json`);
    islands.push(doc.island);
    for (const p of doc.places ?? []) places.push(p);
  }
  return { islands, places };
})();

/**
 * Ein Snapshot auf der echten Bibliothek mit einem KONSTANTEN Wetterfenster.
 * Default: 14 kn aus Nord — der Meltemi in seiner milden, planbaren Form, in
 * der eine volle Runde segelbar sein MUSS. Wo das Wetter die Frage ist,
 * setzen die einzelnen Tests es selbst.
 */
function realSnapshot(
  opts: { windKn?: number; windDirDeg?: number; currentDay?: number } = {},
): PlanningSnapshot {
  const windKn = opts.windKn ?? 14;
  const windDirDeg = opts.windDirDeg ?? 0;
  const params = { ...DEFAULT_PARAMS, tripStartDate: TRIP_START };
  const days = deadlineFrame(params).deadlineDay + 2;
  const times = makeTimes(days);
  const fc = constantForecast(times.length, windKn, windDirDeg, 0.4);
  // Dieselben Schlüssel, die der Adapter vergibt (AD-3): Platz-Id für
  // kuratierte Plätze, `leg:<legId>:<n>` für Etappen-Wegpunkte.
  const forecast: PlanningSnapshot['forecast'] = Object.fromEntries(
    collectLocations({ islands, places, invalidPlaces: [], legs, variants }).map((e) => [
      e.key,
      fc,
    ]),
  );

  const roh: PlanningSnapshot = {
    fetchedAtIso: `${TRIP_START}T06:00:00Z`,
    modelRunIso: `${TRIP_START}T00:00:00Z`,
    model: 'test',
    times,
    forecast,
    library: { islands, places, invalidPlaces: [], legs, variants, windTopoZones },
    params,
    polar: TEST_POLAR,
    trip: {
      currentDay: opts.currentDay ?? 1,
      position: {
        source: 'manual',
        placeId: params.basePlaceId,
        lat: 37.9,
        lon: 23.7,
      },
      plan: null,
      departureHourByDay: {},
      empfohleneAbfahrtByDay: {},
      stopHoursByDay: {},
    },
  };

  /**
   * Der DÜSEN-Zuschlag, genau wie `assessPlanning` ihn setzt: als erster
   * Schritt, bevor irgendetwas bewertet wird. Die Lee-Keulen brauchen das
   * nicht — die liest `assessLeg` selbst aus `library.windTopoZones`.
   */
  return applyWindTopo(roh).snapshot;
}

const RAHMEN = deadlineFrame({ ...DEFAULT_PARAMS, tripStartDate: TRIP_START }).deadlineDay;

/**
 * DIE FRIST STEHT HIER, WEIL DIESE TESTS DIE GANZE MASCHINE ANWERFEN.
 *
 * `assessPlanning` auf den echten Staging-Daten braucht am 2026-08-07 rund
 * 3,5–4,5 s: 46 Etappen, 68 volle Runden je Schicht, elf Suchen (Hauptroute
 * plus zehn Ziele) und 31 Lee-Zonen, die für jeden Forecast-Punkt jeder Stunde
 * geprüft werden. Vitests Vorgabe von 5 s trifft das im kalten Prozess knapp
 * nicht — mit einer Fehlermeldung ("Test timed out"), die wie ein Sachfehler
 * aussieht und keiner ist.
 *
 * Die Frist ist bewusst grosszügig und bewusst SICHTBAR: sie ist kein
 * Freibrief, sondern der Ort, an dem eine Laufzeit-Regression auffällt. Wer
 * sie erhöhen muss, hat etwas verlangsamt.
 *
 * VON 20 s AUF 60 s (2026-08-12): verlangsamt hat sie der TÖRNRAHMEN. Er ist
 * von elf auf vierzehn Etappen gewachsen (Rückgabe Fr 21.8.), und damit die
 * Schicht A von 5192 auf 85 452 Runden — gemessen 1,0 s → 2,6 s für einen
 * Solver-Lauf und 4,9 s → 8,6 s für eine volle Bewertung, im kalten Prozess
 * mit den Optionen darüber. Nicht der Code ist langsamer geworden, der Raum
 * ist grösser.
 */
const VOLLE_BEWERTUNG_MS = 60_000;

/**
 * Die Frist für den Menü-Wächter weiter unten: er rechnet EINEN vollen
 * Solver-Lauf je angebotenem Tagesziel, an einer Stichprobe von vier
 * Törntagen also rund vierzig. Das ist der Preis dafür, die Zusage des Menüs
 * gegen die echte Bibliothek zu prüfen statt gegen eine Miniatur.
 */
const ETAPPEN_MENUE_MS = 120_000;

/**
 * Die Frist für Tests, die ALLE DREI Schichten aufzählen — Schicht C zählt
 * gegen den Deckel (80 000 Runden) und ist die teuerste der drei. In der App
 * wird sie nur befragt, wenn die vollen Runden nichts tragen; hier ist genau
 * ihre Vollständigkeit die Frage.
 */
const ALLE_SCHICHTEN_MS = 60_000;

describe('Zielmodell v3 — der Suchraum enthält die richtigen Runden', () => {
  it('Der Törnrahmen ist vierzehn Tage — vierzehn Tage, vierzehn Etappen', () => {
    /**
     * Der Rahmen ist der Chartervertrag: Übernahme Sa 8.8., zurück in Marina
     * Alimos am Fr 21.8. um 19:00 (Skipper 2026-08-12). Bis dahin standen hier
     * elf Tage mit Stichtag Di 18.8., und die App plante folgerichtig einen
     * Törn, der drei Tage vor der Rückgabe endete.
     */
    expect(RAHMEN).toBe(14);
  });

  it('Schicht A liefert GENAU die 85 452 wiederholungsfreien 14-Etappen-Runden', () => {
    /**
     * Die Zahl ist der eigentliche Befund: 68 Runden füllen den Rahmen sauber,
     * und die App hat lange keine einzige davon angeboten. Der Suchraum ist
     * vollständig durchrechenbar — es braucht keine Notbremse, sondern einen
     * engeren Filter. Bricht dieser Test nach unten, ist wieder etwas still
     * gekappt; nach oben, hat jemand Etappen ergänzt (dann ist die neue Zahl
     * hier einzutragen und die Zunahme erwünscht).
     *
     * 2026-08-07: 6 → 68, durch die sieben Etappen aus der Törnanalyse.
     * 2026-08-07 (später): 68 → 2947, durch die 110 ABGELEITETEN Etappen
     * (deriveLegs.ts). Der Aufzählungs-Graph nimmt davon je Insel die zwei
     * kürzesten bis 30 sm — gemessen der Punkt, an dem der Raum VOLLSTÄNDIG
     * aufzählbar bleibt. Mit allen 110 wären es über 300 000, die Tiefensuche
     * liefe in den Deckel, und eine abgeschnittene Tiefensuche ist verzerrt:
     * sie lieferte gemessen einen Plan mit zehn statt elf Etappentagen.
     * 2026-08-07 (zuletzt): 2947 → 3272, durch `SKIPPER_BESTAETIGT` —
     * Serifos–Paros, vom Skipper als Tagesschlag bestätigt, umgeht die
     * Ausdünnung. 545 dieser Runden fahren die Verbindung; über die Parameter
     * hätte dieselbe Kante 23 585 Runden gekostet (roundTrips.ts).
     * 2026-08-08: 3272 → 5192, durch `kea--serifos` in derselben Liste. Kea
     * hatte KEINEN abgeleiteten Nachbarn unter 30 sm — Serifos ist mit 40,1 sm
     * der kürzeste —, und damit stand ab Kea nur die kuratierte Nachbarschaft
     * im Etappen-Menü (Attika, Kythnos, Syros, Athen).
     * 2026-08-12: 5192 → 85 452, weil der Rahmen von elf auf VIERZEHN Etappen
     * gewachsen ist (Rückgabe Fr 21.8. statt Di 18.8.). Nicht die Bibliothek
     * hat sich geändert, sondern die Etappenzahl — drei Etappen mehr kosten
     * gemessen den Faktor 16 im Suchraum (5192 → 14 453 → 37 013 → 85 452).
     * Die Schicht bleibt VOLLSTÄNDIG; sie ist die, die den Rahmen trägt.
     */
    const snapshot = realSnapshot();
    const [schichtA] = [...roundTripLayers(snapshot, 'athen', RAHMEN)];
    expect(schichtA?.gekappt).toBe(false);
    expect(schichtA?.trips).toHaveLength(85_452);
  }, ALLE_SCHICHTEN_MS);

  it('SCHICHT A ist vollständig — und ab elf Etappen sind es wieder alle drei', () => {
    /**
     * Der Deckel (`roundTrips.HARD_CEILING`) ist eine Notbremse, kein
     * Arbeitsmittel: greift er, sammelt die Tiefensuche ihre Runden aus EINER
     * Ecke des Raumes, weil alle einen langen gemeinsamen Anfang teilen.
     *
     * Gemessen am 2026-08-08, als `kea--serifos` dazukam: die verkürzte Schicht
     * wuchs von 68 527 auf 95 814 Runden und lief in den damaligen Deckel von
     * 80 000 — und die kürzeste Santorin-Runde (acht Etappen, der Test unten)
     * verschwand aus dem Ergebnis. Nicht weil es sie nicht mehr gäbe, sondern
     * weil der DFS vorher abbrach. Deshalb wurde der Deckel damals gehoben und
     * nicht die Zusage gesenkt.
     *
     * SEIT DEM VIERZEHN-TAGE-RAHMEN (2026-08-12) IST DIE ZUSAGE KLEINER, UND
     * DAS IST EINE MESSUNG, KEINE MEINUNG. Über vierzehn Etappen hat Schicht B
     * 2 861 717 und Schicht C 4 123 050 Runden (Deckel probeweise auf 20 Mio.);
     * sie vollständig zu halten kostet 2,7 GB und 50 s. Das ist im Browser
     * nicht bezahlbar, und die Zahlen stehen bei `HARD_CEILING`.
     *
     * Was hier deshalb geprüft wird, ist das, was auch gilt:
     *   - Schicht A — die Schicht, die den Rahmen trägt — ist VOLLSTÄNDIG,
     *     über den vollen Rahmen und über jede kürzere Restlänge;
     *   - ab elf Etappen (also ab Törntag 4, wenn der Rahmen geschrumpft ist)
     *     sind wieder ALLE DREI Schichten vollständig.
     *
     * Wer die verkürzte Schicht auch an Törntag 1 vollständig braucht, zählt
     * sie nach steigender Etappenzahl auf (Notiz bei `HARD_CEILING`) — der
     * Deckel ist dafür das falsche Werkzeug.
     */
    const snapshot = realSnapshot();
    for (let legCount = RAHMEN; legCount >= 2; legCount--) {
      const [schichtA] = [...roundTripLayers(snapshot, 'athen', legCount)];
      expect(schichtA?.gekappt, `Schicht A bei ${legCount} Etappen`).toBe(false);
    }
    for (const layer of roundTripLayers(snapshot, 'athen', 11)) {
      expect(layer.gekappt, layer.layer).toBe(false);
    }
  }, ALLE_SCHICHTEN_MS);

  it('Keine Runde der Schicht A läuft eine Insel zweimal an', () => {
    const snapshot = realSnapshot();
    const [schichtA] = [...roundTripLayers(snapshot, 'athen', RAHMEN)];
    for (const trip of schichtA?.trips ?? []) {
      const seq = islandSequence(trip);
      // Die Basis steht am Anfang UND am Ende — sie ist die Ausnahme.
      const ohneBasis = seq.filter((id) => id !== 'athen');
      expect(new Set(ohneBasis).size).toBe(ohneBasis.length);
      expect(trip).toHaveLength(RAHMEN);
    }
  }, ALLE_SCHICHTEN_MS);

  it('Santorin braucht acht Etappen — danach reicht der Rest des Rahmens nicht mehr', () => {
    /**
     * Der wahre Sachverhalt hinter der Beanstandung "die Verlängerung nach
     * Santorin führt nicht nach Santorin": Santorin hängt im Graphen nur an
     * Ios, Naxos und Folegandros. Eine Runde dorthin ist deshalb lang.
     *
     * Die Zahl ist zweimal gefallen, beide Male ohne dass eine Regel weicher
     * geworden wäre:
     *   ELF Etappen (Törntag 1) — Ausgangslage, Santorin nur am ersten Tag.
     *   ZEHN (Törntag 2), als Zweitanläufe an anderen Häfen zugelassen wurden.
     *   NEUN (Törntag 3), seit `naxos--sifnos` aus der Törnanalyse existiert:
     *   der Heimweg von Naxos muss nicht mehr über Paros laufen.
     *   ACHT (Törntag 4), seit die abgeleiteten Etappen den Graphen füllen.
     *
     * Und die MINDESTLÄNGE ist am 2026-08-07 von neun auf acht Etappen
     * gefallen, als Serifos–Paros dazukam (`SKIPPER_BESTAETIGT`): der Westteil
     * der Runde spart eine Insel. Die Grenze "ab Törntag 5 nicht mehr" bleibt.
     *
     * "Santorin geht ab Törntag 5 nicht mehr" ist die richtige Antwort. Falsch
     * war, dass die App das Ziel trotzdem angeboten und einen Plan dazugelegt
     * hat, der nicht dorthin führt.
     */
    /**
     * DIE MINDESTLÄNGE IST EINE EIGENSCHAFT DER BIBLIOTHEK, NICHT DES RAHMENS —
     * gefragt wird sie deshalb über ELF Etappen. Über die vierzehn des echten
     * Törns wäre die flache Aufzählung gekappt (Zahlen bei
     * `roundTrips.HARD_CEILING`), und gemessen kommt die achtstellige
     * Santorin-Runde dann nicht mehr vor: der Test würde 10 statt 8 sehen und
     * eine Eigenschaft des Deckels für eine des Reviers ausgeben.
     */
    const kurzeRunden = enumerateRoundTrips(realSnapshot({ currentDay: 1 }), 'athen', 11)
      .filter((t) => islandSequence(t).includes('santorin'));
    expect(kurzeRunden.length).toBeGreaterThan(0);
    // Acht Etappen ist das Minimum — keine kürzere Santorin-Runde existiert.
    expect(Math.min(...kurzeRunden.map((t) => t.length))).toBe(8);

    /**
     * UND WANN GEHT ES NICHT MEHR? Die Grenze verschiebt sich mit dem Rahmen,
     * die Rechnung dahinter bleibt dieselbe: ab Törntag N bleiben
     * `RAHMEN − N + 1` Etappen, und unter acht ist Santorin nicht zu erreichen.
     * Im Elf-Tage-Rahmen war das Törntag 5, im Vierzehn-Tage-Rahmen Törntag 8.
     */
    const letzterTag = RAHMEN - 8 + 1;
    const nochMoeglich = enumerateRoundTrips(
      realSnapshot({ currentDay: letzterTag }),
      'athen',
      RAHMEN - letzterTag + 1,
    ).filter((t) => islandSequence(t).includes('santorin'));
    expect(nochMoeglich.length, `Törntag ${letzterTag}`).toBeGreaterThan(0);

    const nichtMehr = enumerateRoundTrips(
      realSnapshot({ currentDay: letzterTag + 1 }),
      'athen',
      RAHMEN - letzterTag,
    ).filter((t) => islandSequence(t).includes('santorin'));
    expect(nichtMehr, `Törntag ${letzterTag + 1}`).toHaveLength(0);
  }, ALLE_SCHICHTEN_MS);

  it('Die Ost-Kykladen sind WIEDERHOLUNGSFREI erreichbar — Amorgos, Donousa, die Kleinen Kykladen', () => {
    /**
     * Die Kalibrierung gegen die Praxis (Skipper 2026-08-07): zwei
     * professionelle Törnvorschläge laufen die Ost-Kykladen an, und beide waren
     * über unseren Graphen nicht darstellbar. Amorgos und Koufonisia kamen in
     * KEINER wiederholungsfreien Runde vor; Donousa hing als isolierter Knoten
     * ganz ausserhalb des Graphen, mit eigener Insel-Datei und ohne eine
     * einzige Etappe.
     *
     * Mit `mykonos--donousa`, `donousa--amorgos` und `schinoussa--naxos` ist
     * das erledigt — und zwar in SCHICHT A, ohne Zweitanlauf. Das ist der
     * Unterschied zwischen "die Regel war zu streng" und "der Bibliothek
     * fehlten Verbindungen": angefasst wurde die Bibliothek.
     */
    const snapshot = realSnapshot();
    const [ohne] = [...roundTripLayers(snapshot, 'athen', RAHMEN)];
    for (const ziel of ['amorgos', 'koufonisia', 'donousa', 'schinoussa']) {
      expect(
        (ohne?.trips ?? []).filter((t) => islandSequence(t).includes(ziel)).length,
        `${ziel} in Schicht A`,
      ).toBeGreaterThan(0);
    }
  });

  it('KEIN PENDELN: keine Runde kehrt sofort dorthin zurück, wo sie herkam', () => {
    /**
     * REGRESSION zum Screenshot-Review des Skippers (2026-08-07). Die App bot
     * ihm `Paros (Naoussa) → Ios → Paros (Parikia)` an: zwei Törntage für EINE
     * Insel, der Rückweg der Hinweg gegenan, im Screenshot 34 sm mit 32 sm
     * Kreuzen und rot. Genau die Form, gegen die er sich von Anfang an gewehrt
     * hat — "Paros–Naxos ist eine direkte Linie hin und zurück".
     *
     * `MAX_ZWEITANLAEUFE` hat das nicht verhindert und konnte es nicht: der
     * Deckel wehrt das Pendeln über die GANZE Runde ab, ein lokales A → B → A
     * kostet genau EINEN Zweitanlauf.
     *
     * Geprüft über ALLE Schichten, nicht nur die wiederholungsfreie — in
     * Schicht A kann es ohnehin nicht vorkommen, und genau deshalb wäre ein
     * Test nur darauf wertlos.
     *
     * DIE EIGENE FRIST steht hier seit 2026-08-08, und sie ist der Preis dafür,
     * dass der Test seit dem Cache-Fix wirklich tut, was er behauptet: der
     * Schicht-Cache lieferte einem späteren Aufrufer nur die Schichten, die ein
     * früherer schon gebraucht hatte (roundTrips.ts) — dieser Test lief also
     * bislang meist über Schicht A allein und war damit genau das, was der
     * Absatz darüber ausschliesst. Jetzt zählt er B (50 752 Runden) und C auf.
     */
    const snapshot = realSnapshot();
    const sackgassen = new Set(['delos-rinia']);
    for (const layer of roundTripLayers(snapshot, 'athen', RAHMEN)) {
      for (const trip of layer.trips) {
        const seq = islandSequence(trip);
        for (let i = 2; i < seq.length; i++) {
          if (seq[i] !== seq[i - 2]) continue;
          // Erlaubt bleibt genau eins: die Sackgasse, deren einziger Weg
          // hinaus der zurück ist — und die Basis, die Anfang UND Ende ist.
          const mitte = seq[i - 1]!;
          expect(
            sackgassen.has(mitte) || seq[i] === 'athen',
            `${layer.layer}: ${seq.join(' > ')} pendelt über ${mitte}`,
          ).toBe(true);
        }
      }
    }
  }, ALLE_SCHICHTEN_MS);

  it('KEIN UMWEG NACH LUV: von Polyaigos geht es nicht 40 sm nach Paros, wenn Sifnos 11 sm entfernt liegt', () => {
    /**
     * DER FALL DES SKIPPERS vom 2026-08-07, an den echten Daten festgehalten.
     *
     * Die ausgelieferte App bot ihm diese Alternative an:
     *
     *   Tag 7  Polyaigos (Manolis-Bucht)
     *   Tag 8  Polyaigos -> Paros (Naoussa)  40 sm, davon "ca. 38 sm Kreuz
     *          (24 kn)" bei Wind N 23 kn
     *   Tag 9  Sifnos (Vathy)
     *
     * Also 38 Seemeilen hart am Wind nach Nordosten, um am nächsten Tag wieder
     * nach Westen zurückzufahren. Sein Urteil: „so wird ein Segler nicht
     * denken."
     *
     * Der Router hatte nichts falsch gemacht — er hatte keine Wahl. Polyaigos
     * hing an genau zwei kuratierten Etappen: Milos (8,1 sm) und Paros
     * (33,4 sm). Die Verbindung, die jeder Segler nehmen würde, stand nicht in
     * der Bibliothek: `polyaigos--sifnos`, 11,3 sm.
     *
     * Geprüft wird die EIGENSCHAFT, nicht der Einzelfall: keine angebotene
     * Route darf Polyaigos direkt mit Paros verbinden, solange sie danach in
     * den Westen zurückkehrt. Das ist die Form, die er beanstandet hat — hin
     * nach Luv und gleich wieder zurück.
     */
    const assessment = assessPlanning(realSnapshot({ windKn: 23, windDirDeg: 0 }));
    const plaene = [
      assessment.proposal,
      ...assessment.alternatives,
      ...assessment.routeOptions.map((o) => o.plan).filter((p) => p !== null),
    ].filter((p) => p !== null && p !== undefined);

    const WESTEN = new Set(['sifnos', 'serifos', 'kythnos', 'milos', 'kea']);
    for (const plan of plaene) {
      const ziele = stagesOf('plan' in plan ? plan.plan : plan).map((s) => s.toIslandId);
      for (let i = 1; i < ziele.length; i++) {
        if (ziele[i - 1] !== 'polyaigos' || ziele[i] !== 'paros') continue;
        const danachWesten = ziele.slice(i + 1).some((id) => WESTEN.has(id));
        expect(
          danachWesten,
          `Umweg nach Luv: ${ziele.join(' > ')}`,
        ).toBe(false);
      }
    }
  }, VOLLE_BEWERTUNG_MS);

  it('Delos/Rinia ist KEINE Sackgasse mehr — und das ist der Beleg für den Umbau', () => {
    /**
     * UMGEDREHT AM 2026-08-07, weil die Wirklichkeit sich geändert hat.
     *
     * Vorher hiess dieser Test "Delos/Rinia bleibt eine Sackgasse — erreichbar
     * NUR über den Zweitanlauf Mykonos", und er hatte recht: die Insel hing an
     * genau EINER kuratierten Etappe. Wer hin wollte, musste über Mykonos und
     * wieder zurück.
     *
     * Das war nie eine Eigenschaft des Reviers, sondern eine der Bibliothek.
     * Rinia liegt 15,2 sm von Syros, 19,6 von Paros und 22,3 von Naxos — alles
     * gewöhnliche Tagesschläge, die bloss niemand kuratiert hatte. Seit
     * `deriveLegs.ts` stehen sie im Graphen, und die Insel ist ohne jede
     * Wiederholung erreichbar.
     *
     * Genau das ist der Einwand des Skippers vom 2026-08-07, als Test: „am Ende
     * kann ich ja als Segler überall hinfahren." Der Graph war eine Stichprobe
     * des Reviers, kein Modell davon — und was wie eine Sackgasse aussah, war
     * ein Loch in den Daten.
     */
    const snapshot = realSnapshot();
    const [ohne] = [...roundTripLayers(snapshot, 'athen', RAHMEN)];
    expect(
      (ohne?.trips ?? []).filter((t) => islandSequence(t).includes('delos-rinia')).length,
      'Delos/Rinia ohne Zweitanlauf',
    ).toBeGreaterThan(0);
  });
});

describe('Zielmodell v3 — die Hauptroute erfüllt den Vertrag', () => {
  const snapshot = realSnapshot();
  const solved = completePlan(snapshot, 'athen');

  it('Vierzehn Törntage, vierzehn Etappentage, kein Hafentag', () => {
    // Beispiel 1: die App lieferte neun Etappen in elf Tagen, weil die
    // Etappenzahl auf Rang 14 von 14 stand und bis zu fünf Hafentage nur ein
    // weicher Strukturbefund waren.
    expect(solved).not.toBeNull();
    expect(solved!.plan.days).toHaveLength(RAHMEN);
    expect(stagesOf(solved!.plan)).toHaveLength(RAHMEN);
    expect(solved!.plan.days.filter((d) => d.kind === 'harbour')).toHaveLength(0);
  });

  it('Keine Insel zweimal — und vierzehn verschiedene', () => {
    // Beispiel 2: "Paros–Naxos" war eine gerade Linie hin und zurück, mit
    // fünf Inseln doppelt. Solche Ketten entstanden im Generator "Variante +
    // Rückfallkette", weil die Kette die Umkehrung der Varianten ist.
    const ziele = stagesOf(solved!.plan).map((s) => s.toIslandId);
    const ohneBasis = ziele.filter((id) => id !== 'athen');
    expect(new Set(ohneBasis).size).toBe(ohneBasis.length);
    expect(new Set(ziele).size).toBe(RAHMEN);
  });

  it('Die Runde beginnt und endet an der Basis', () => {
    const days = [...solved!.plan.days].sort((a, b) => a.day - b.day);
    const last = days[days.length - 1]!;
    expect(last.kind === 'stage' ? last.toIslandId : last.islandId).toBe('athen');
  });

  it('Der gemeldete Wendepunkt wird wirklich angelaufen', () => {
    /**
     * Die Wurzel von Beispiel 3: `turnIslandId` stammte aus dem KANDIDATEN und
     * wurde ungeprüft ins Ergebnis übernommen — ein abgebrochener Plan
     * behauptete damit eine Wende, die er nie erreicht, und bekam in der
     * Rangfolge sogar die Reichweiten-Gutschrift dafür.
     */
    const ziele = stagesOf(solved!.plan).map((s) => s.toIslandId);
    expect(ziele).toContain(solved!.turnIslandId);
    expect(planTurn(solved!.plan, snapshot)?.islandId).toBe(solved!.turnIslandId);
  });
});


describe('Zielmodell v3 — der Optionsraum lügt nicht mehr', () => {
  it('Jede Option mit Plan läuft ihre Ziel-Insel wirklich an', () => {
    /**
     * REGRESSION Beispiel 3, als EIGENSCHAFT über alle Optionen statt als
     * Einzelfall für Santorin: ein Ziel darf nur einen Plan zurückgeben, der
     * es enthält. Vorher fiel der Optionsraum bei Bedarf auf eine freie Suche
     * zurück und lieferte deren Plan unter dem Namen der Variante aus.
     */
    const assessment = assessPlanning(realSnapshot());
    expect(assessment.routeOptions.length).toBeGreaterThan(0);
    for (const opt of assessment.routeOptions) {
      if (!opt.plan) continue;
      const ziele = stagesOf(opt.plan).map((s) => s.toIslandId);
      expect(ziele, `Option ${opt.routeId} (${opt.name})`).toContain(opt.turnIslandId);
    }
  }, VOLLE_BEWERTUNG_MS);

  it('KEINE OPTION IST "empfohlen", WENN IHR EIGENER PLAN ROTE ETAPPEN TRÄGT', () => {
    /**
     * REGRESSION zum Screenshot-Review des Skippers (2026-08-07): "die
     * alternativen Routen sind teilweise sinnbefreit, da rote Legs enthalten
     * sind".
     *
     * Der Optionsraum rechnete die Ampel jeder Option aus (`worstAmpel` über
     * die Etappen ihres Plans) und liess sie dann auf NICHTS wirken: die
     * Empfehlung kam allein aus der Wetter-Eignung des Konzepts, und nur
     * Sicherheits-Befunde nahmen eine Option aus dem Angebot. Eine rote Etappe
     * ohne solchen Befund — "Wind nahe der Aufkreuz-Schwelle", "hartes
     * Tagesbudget überschritten" — tat gar nichts. Die App bewertete die
     * Etappe rot und empfahl im selben Atemzug die Route, die sie enthält.
     *
     * Geprüft über ein BAND von Windlagen, nicht an einem Wert: eine
     * Eigenschaft, die nur bei einer Windstärke stimmt, hat nichts bewiesen.
     * Und geprüft wird die Eigenschaft, nicht das Vorkommen — ob bei diesen
     * Lagen überhaupt rote Etappen auftreten, ist eine Frage ans Wetter.
     */
    for (const [kn, dir] of [[16, 340], [22, 340], [26, 20]] as [number, number][]) {
      const assessment = assessPlanning(realSnapshot({ windKn: kn, windDirDeg: dir }));
      for (const opt of assessment.routeOptions) {
        const rot = (opt.legAssessments ?? []).filter((l) => l.ampel === 'rot');
        if (rot.length === 0) continue;
        expect(
          opt.empfehlung,
          `${kn} kn aus ${dir}° — Option ${opt.name} hat ${rot.length} rote Etappe(n)`,
        ).not.toBe('empfohlen');
        expect(
          opt.abratenGruende.join(' '),
          `${kn} kn aus ${dir}° — Option ${opt.name} nennt den Grund nicht`,
        ).toContain('rot');
      }
    }
  }, VOLLE_BEWERTUNG_MS);

  it('Alternativen tragen keine kuratierten Routen-Namen mehr', () => {
    // Die Namen aus variants.json ("Verlängerung Santorin", "Süd-Route bis
    // Naxos") dürfen nirgends mehr an einem Plan hängen — genau daran hing
    // die Behauptung, die der Plan nicht einlöste.
    const assessment = assessPlanning(realSnapshot());
    const kuratiert = variants.map((v) => v.name);
    for (const opt of assessment.routeOptions) {
      expect(kuratiert).not.toContain(opt.name);
    }
  }, VOLLE_BEWERTUNG_MS);
});

/**
/**
 * DAS ETAPPEN-MENÜ HÄLT, WAS ES ANBIETET.
 *
 * Der Befund des Skippers vom 2026-08-07: „Alle Optionen, die mir Menü Etappe
 * ändern angeboten werden, sollten dann tatsächlich auch möglich sein. Hier
 * habe ich Paros ausgewählt und das war ja auch angezeigt und dann sagt mir
 * die App, dass das nicht möglich ist."
 *
 * Es war kein Einzelfall. Gemessen an der ausgelieferten Bibliothek (mildes
 * Fenster, 14 kn aus Nord) lehnte der Solver 126 von 208 angebotenen Zielen
 * ab — sechs von zehn. Drei Ursachen, alle gezählt:
 *
 *   76 — `reach.ts` fragte den vollen Etappen-Index nach zwei Hops ab dem
 *        Vortagsziel, der Solver sucht aber Runden über den AUSGEDÜNNTEN
 *        Aufzählungs-Graphen.
 *   50 — `solver.vorauswahl` kappte je Schicht auf 120 Kandidaten nach einer
 *        Rangfolge, die den Pin nicht kannte. Passende Runden gab es, sie
 *        standen nur nicht unter den ersten 120.
 *    - — und Serifos–Paros selbst fehlte im Aufzählungs-Graphen ganz; sie
 *        steht jetzt in `roundTrips.SKIPPER_BESTAETIGT`.
 *
 * Dieser Test ist der Wächter darüber: JEDES Ziel, das im Menü steht, muss
 * sich auch übernehmen lassen — bei gehaltenen Vortagen, so wie die App es
 * tut.
 */
describe('Zielmodell v3 — das Etappen-Menü verspricht nichts, was der Solver ablehnt', () => {
  it('Jedes angebotene Tagesziel lässt sich auch übernehmen', () => {
    const snapshot = realSnapshot();
    const frei = completePlan(snapshot, 'athen', []);
    expect(frei).not.toBeNull();
    const mitPlan: PlanningSnapshot = {
      ...snapshot,
      trip: { ...snapshot.trip, plan: frei!.plan },
    };
    const assessment = assessPlanning(mitPlan);

    /** Die Tage davor gehalten — genau das, was `usePlanning.editStage` tut. */
    const gehaltenBis = (day: number): Pin[] => {
      const out: Pin[] = [];
      for (let d = mitPlan.trip.currentDay; d < day; d++) {
        const islandId = islandAtEndOfDay(frei!.plan, d);
        if (islandId) out.push({ day: d, toIslandId: islandId, gehalten: true });
      }
      return out;
    };

    const angeboten: string[] = [];
    const abgelehnt: string[] = [];
    for (const stage of assessment.mainRoute!.stages) {
      for (const islandId of stage.reachableIslandIds) {
        angeboten.push(`Tag ${stage.day} → ${islandId}`);
        const solved = completePlan(mitPlan, assessment.currentIslandId!, [
          ...gehaltenBis(stage.day),
          { day: stage.day, toIslandId: islandId },
        ]);
        if (!solved) abgelehnt.push(`Tag ${stage.day} → ${islandId}`);
      }
    }

    // Der Test darf nicht dadurch grün werden, dass gar nichts mehr im Menü
    // steht: der Filter ist eine Zusage, keine Sperre.
    expect(angeboten.length).toBeGreaterThan(25);
    expect(abgelehnt, abgelehnt.join(', ')).toHaveLength(0);
  }, ETAPPEN_MENUE_MS);

  it('Paros ab Serifos — der Fall, mit dem der Befund anfing', () => {
    /**
     * „Meiner Meinung nach Paros durchaus Sinn von Serifos kommend … es ist
     * der erste Teil der Reise, und es ist weiter östlich, also eigentlich
     * meiner Meinung nach durchaus optimal."
     *
     * Zwei Zusagen in einem: die Insel steht an Tag 3 im Menü, UND die
     * Übernahme lässt die Tage davor in Ruhe.
     */
    const snapshot = realSnapshot();
    const mitSerifos = completePlan(snapshot, 'athen', [
      { day: 2, toIslandId: 'serifos' },
    ]);
    expect(mitSerifos).not.toBeNull();
    const mitPlan: PlanningSnapshot = {
      ...snapshot,
      trip: { ...snapshot.trip, plan: mitSerifos!.plan },
    };
    const tag3 = assessPlanning(mitPlan).mainRoute!.stages.find((s) => s.day === 3)!;
    expect(tag3.reachableIslandIds).toContain('paros');

    const vorher = [1, 2].map((d) => islandAtEndOfDay(mitSerifos!.plan, d));
    const gepinnt = completePlan(mitPlan, 'athen', [
      { day: 1, toIslandId: vorher[0]!, gehalten: true },
      { day: 2, toIslandId: vorher[1]!, gehalten: true },
      { day: 3, toIslandId: 'paros' },
    ]);
    expect(gepinnt).not.toBeNull();
    expect(islandAtEndOfDay(gepinnt!.plan, 3)).toBe('paros');
    // KEINE Rückwirkung nach hinten — der Kern der Beanstandung.
    expect([1, 2].map((d) => islandAtEndOfDay(gepinnt!.plan, d))).toEqual(vorher);
    // Und die Tage davor sind deshalb noch lange keine Festlegungen.
    for (const d of [1, 2]) {
      const tag = gepinnt!.plan.days.find((x) => x.day === d)!;
      expect(tag.source, `Tag ${d}`).not.toBe('skipper');
    }
  }, ETAPPEN_MENUE_MS);

  /**
   * DIE ROUTE ZIEHT NACH (Skipper 2026-08-08).
   *
   * „Ich will am ersten Tag statt vorgeschlagen attische Küste direkt nach Kea
   * … der zweite Tag will wieder zurück nach attische Küste, statt Kea–Kythnos
   * oder Kea–Syros vorzugeben."
   *
   * Der Plan zog durchaus nach — das Menü tat es nicht. Nach der Änderung stand
   * für Tag 2 GENAU EIN Ziel zur Wahl (Syros), während der Solver bei
   * gehaltenem Tag 1 zehn Ziele lieferte. Ein Tag mit einer einzigen Option
   * sieht aus wie ein Tag, der nichts mehr hergibt.
   */
  it('Tag 1 nach Kea — und Tag 2 bietet Kythnos UND Syros an', () => {
    const snapshot = realSnapshot();
    const nachKea = completePlan(snapshot, 'athen', [{ day: 1, toIslandId: 'kea' }]);
    expect(nachKea).not.toBeNull();
    expect(islandAtEndOfDay(nachKea!.plan, 1)).toBe('kea');

    const mitPlan: PlanningSnapshot = {
      ...snapshot,
      trip: { ...snapshot.trip, plan: nachKea!.plan },
    };
    const tag2 = assessPlanning(mitPlan).mainRoute!.stages.find((s) => s.day === 2)!;
    // Die beiden Ziele, die der Skipper beim Namen genannt hat.
    expect(tag2.reachableIslandIds).toContain('kythnos');
    expect(tag2.reachableIslandIds).toContain('syros');

    // Und beide lassen sich auch übernehmen, mit gehaltenem Tag 1.
    for (const ziel of ['kythnos', 'syros']) {
      const gepinnt = completePlan(mitPlan, 'athen', [
        { day: 1, toIslandId: 'kea', gehalten: true },
        { day: 2, toIslandId: ziel },
      ]);
      expect(gepinnt, ziel).not.toBeNull();
      expect(islandAtEndOfDay(gepinnt!.plan, 1), ziel).toBe('kea');
      expect(islandAtEndOfDay(gepinnt!.plan, 2)).toBe(ziel);
    }
  }, ETAPPEN_MENUE_MS);

  /**
   * DER SCHICHT-CACHE DARF KEINE ANTWORT ERFINDEN (Fehler bis 2026-08-08).
   *
   * `roundTripLayers` ist lazy und gecacht — und der Cache gab das, was der
   * ERSTE Aufrufer gebraucht hatte, als vollständige Aufzählung aus. Der erste
   * Aufrufer ist in der App immer die Hauptroute, und die bricht nach Schicht A
   * ab. Jede spätere Frage auf demselben Snapshot war damit blind für die
   * Schichten B und C: eine manuelle Änderung, die eine Runde mit Zweitanlauf
   * braucht, wurde abgelehnt — mit der Begründung, es führe keine Runde
   * dorthin. Auf einem frischen Snapshot ging dieselbe Änderung durch.
   *
   * Deshalb prüft dieser Test dieselbe Frage ZWEIMAL auf demselben Snapshot,
   * einmal davor und einmal danach. Es muss dieselbe Antwort sein.
   */
  it('Dieselbe Frage vor und nach dem Lauf der Hauptroute — dieselbe Antwort', () => {
    const pins: Pin[] = [
      { day: 1, toIslandId: 'attika', gehalten: true },
      { day: 2, toIslandId: 'kea', gehalten: true },
      // Kythnos an Tag 3 gibt es NUR in Schicht B: keine wiederholungsfreie
      // Runde läuft es so früh an und kommt trotzdem elftägig heim.
      { day: 3, toIslandId: 'kythnos' },
    ];
    const frisch = realSnapshot();
    expect(completePlan(frisch, 'athen', pins)).not.toBeNull();

    const gebraucht = realSnapshot();
    completePlan(gebraucht, 'athen', []); // die Hauptroute, bricht nach Schicht A ab
    expect(completePlan(gebraucht, 'athen', pins)).not.toBeNull();
  }, ETAPPEN_MENUE_MS);

  it('Serifos ab Kea — derselbe Fall andersherum (Skipper 2026-08-08)', () => {
    /**
     * „Warum kann ich beim manuellen Ändern einer Etappe nicht von Kea nach
     * Serifos einstellen?"
     *
     * Nicht die sm-Regel sperrte: 40,1 sm raumschots liegen weit innerhalb der
     * Tagesreichweite. Es war die Ausdünnung des Aufzählungs-Graphen — Kea hat
     * KEINE abgeleitete Etappe unter 30 sm (Serifos 40,1 · Delos/Rinia 50 ·
     * Mykonos 51,2), also blieb nur die kuratierte Nachbarschaft übrig und
     * keine Runde konnte die Verbindung fahren. Die Etappe steht seither in
     * `roundTrips.SKIPPER_BESTAETIGT`.
     *
     * Zwei Zusagen wie beim Paros-Fall: die Insel steht im Menü, UND die
     * Übernahme lässt den Tag davor in Ruhe.
     */
    const snapshot = realSnapshot();
    const mitKea = completePlan(snapshot, 'athen', [{ day: 1, toIslandId: 'kea' }]);
    expect(mitKea).not.toBeNull();
    const mitPlan: PlanningSnapshot = {
      ...snapshot,
      trip: { ...snapshot.trip, plan: mitKea!.plan },
    };
    const tag2 = assessPlanning(mitPlan).mainRoute!.stages.find((s) => s.day === 2)!;
    expect(tag2.reachableIslandIds).toContain('serifos');

    const gepinnt = completePlan(mitPlan, 'athen', [
      { day: 1, toIslandId: 'kea', gehalten: true },
      { day: 2, toIslandId: 'serifos' },
    ]);
    expect(gepinnt).not.toBeNull();
    expect(islandAtEndOfDay(gepinnt!.plan, 1)).toBe('kea');
    expect(islandAtEndOfDay(gepinnt!.plan, 2)).toBe('serifos');
  }, ETAPPEN_MENUE_MS);
});

/**
 * BEIDE KONZEPTE MÜSSEN IM ANGEBOT ANKOMMEN (Skipper 2026-08-07: "Macht das
 * Sinn, dass es einerseits beim üblichen Konzept sagt, dass es trägt, aber
 * dann keine Routing-Option im Angebot hat?").
 *
 * Nein, es machte keinen Sinn — und es lag an zwei Stellen, die einzeln je
 * plausibel aussahen:
 *
 *   1. `vorauswahl` kappte JEDE Schicht auf 120 Kandidaten. Über den vollen
 *      Rahmen sind ihre beiden obersten Kriterien bei allen 2947 Runden der
 *      Schicht A gleich (elf Etappentage, elf Inseln); entschieden hat also
 *      die Lee-Abweichung und danach das Alphabet der Etappen-Ids. Von 188
 *      klassik-Runden blieben 13 übrig, mit zwei Wendepunkten — und der
 *      Optionsraum schöpft seine Ziele aus genau diesen Kandidaten.
 *   2. `assessTargetOption` suchte allein über den Wendepunkt und las das
 *      Konzept danach aus dem gelieferten PLAN. Die bestgerankte Runde nach
 *      Milos lief über Mykonos — ein westliches Ziel, unter Route 2 einsortiert.
 *
 * Zusammen hiess das: Route 1 trug die Lage und hatte keine einzige Route.
 */
describe('Zielmodell v3 — das Routen-Konzept überlebt bis ins Angebot', () => {
  const istOst = (islands: string[]): boolean =>
    islands.some((i) => OST_MARKER_INSELN.has(i));

  it('Die Vorauswahl zieht ihre Quote JE KONZEPT — nicht über das Gesamtfeld', () => {
    const snapshot = realSnapshot();
    const zaehle = (cs: Candidate[]): { klassik: number; ost: number } => {
      const nachKonzept = { klassik: 0, ost: 0 };
      for (const c of cs) nachKonzept[konzeptOfIslands(routeIslandSequence(c.legs))] += 1;
      return nachKonzept;
    };

    /**
     * DAS KLASSISCHE KONZEPT LIEGT IM VIERZEHN-TAGE-RAHMEN NICHT MEHR IN
     * SCHICHT A — und das ist eine Eigenschaft des Reviers, kein Fehler.
     *
     * Eine wiederholungsfreie Runde über vierzehn Etappen braucht dreizehn
     * verschiedene Inseln ausser der Basis, und so viele hat der Westen nicht:
     * gemessen an der ausgelieferten Bibliothek sind ALLE 85 452 Runden der
     * Schicht A „ost" (im Elf-Tage-Rahmen waren 333 von 5192 klassik, bei
     * zwölf 237, bei dreizehn 86, bei vierzehn keine).
     *
     * Genau das tun die professionellen Zwei-Wochen-Vorschläge auch, an denen
     * `MAX_ZWEITANLAEUFE` kalibriert ist: sie laufen Kythnos zweimal an. Die
     * klassische Westrunde über vierzehn Tage IST eine Runde mit Zweitanlauf —
     * also Schicht B, und dort muss sie ankommen.
     */
    const [schichtA, schichtB] = [...candidateLayers(snapshot, 'athen')];
    const inA = zaehle(schichtA ?? []);
    expect(inA.klassik).toBe(0);
    expect(inA.ost).toBe(120);

    /**
     * UND IN SCHICHT B KOMMT ES AN, mit seiner VOLLEN Quote von 120 — obwohl
     * die Aufzählung dieser Schicht über vierzehn Etappen gekappt ist (2,86
     * Mio. Runden, gesammelt 120 000, davon gemessen 2382 klassik). Genau das
     * ist der Sinn der Quote je Konzept: sie zieht ihre Spitzengruppe aus
     * BEIDEN Konzepten statt aus dem Gesamtfeld. Bricht die Zahl weg, kappt
     * wieder etwas quer über die Konzepte hinweg, und das Angebot verliert eine
     * ganze Strategie — der Befund des Skippers vom 2026-08-07.
     *
     * Die ost-Zahl ist hier KLEINER (33), und das ist richtig so: Schicht B
     * lässt Zweitanläufe ZU, verbietet sie aber nicht, ihr Raum ist also eine
     * Obermenge von Schicht A. Ihre bestgerankten ost-Runden sind deshalb genau
     * die, die Schicht A schon geliefert hat, und `fresh` gibt keine Kette
     * zweimal aus. Was übrig bleibt, ist der ost-Zuwachs DURCH den Zweitanlauf.
     */
    const inB = zaehle(schichtB ?? []);
    expect(inB.klassik).toBe(120);
    expect(inB.ost).toBe(33);
  }, ALLE_SCHICHTEN_MS);

  it('completePlan mit Konzept-Filter liefert nur Runden DIESES Konzepts', () => {
    const snapshot = realSnapshot();
    const solved = completePlan(snapshot, 'athen', [], { konzeptId: 'klassik' });
    expect(solved).not.toBeNull();
    const inseln = stagesOf(solved!.plan).map((s) => s.toIslandId);
    expect(istOst(inseln), inseln.join(' > ')).toBe(false);
    expect(konzeptOfPlan(solved!.plan)).toBe('klassik');
    // Und der Rahmen-Vertrag gilt auch für die eingeschränkte Suche.
    expect(planMetricsFor(snapshot)(solved!).legDays).toBe(RAHMEN);
  });

  it('Ein Ziel im Lee-Korridor bekommt eine Route-1-Antwort, keine Ost-Runde', () => {
    /**
     * DER GEMESSENE FALL. Vorher lieferte "Ziel Milos" den Plan
     * kea > syros > MYKONOS > paros > polyaigos > milos > … — eine
     * Ost-Kykladen-Runde, angeboten unter dem westlichsten Ziel des Reviers.
     */
    const assessment = assessPlanning(realSnapshot());
    const milos = assessment.routeOptions.find((o) => o.turnIslandId === 'milos');
    expect(milos, 'Milos steht im Optionsraum').toBeDefined();
    expect(milos!.plan).not.toBeNull();
    const inseln = stagesOf(milos!.plan!).map((s) => s.toIslandId);
    expect(istOst(inseln), inseln.join(' > ')).toBe(false);
    expect(milos!.konzeptId).toBe('klassik');
  }, VOLLE_BEWERTUNG_MS);

  it('Trägt ein Konzept, führt der Optionsraum eine ANSEHBARE Route darin', () => {
    /**
     * Die Aussage der Konzept-Karte, in der Sprache der Daten: `previewIndex`
     * ist der Zeiger auf den bewerteten Plan, den die Karte als "Etappen
     * ansehen" anbietet (DayView) — ohne ihn steht das Konzept mit "trägt" und
     * leerer Routenliste da, und genau das war die Beanstandung.
     */
    const assessment = assessPlanning(realSnapshot());
    for (const k of assessment.konzeptEntscheid.konzepte) {
      if (k.eignung === 'ungeeignet') continue;
      const ansehbar = assessment.routeOptions.filter(
        (o) => o.konzeptId === k.id && o.previewIndex !== null,
      );
      expect(ansehbar.length, `${k.name} trägt (${k.eignung}), hat aber keine Route`)
        .toBeGreaterThan(0);
    }
  }, VOLLE_BEWERTUNG_MS);
});

describe('Zielmodell v3 — Umlaufsinn und Rückweg', () => {
  it('Stetiger Nordwind gibt den Uhrzeigersinn vor', () => {
    expect(umlaufsinnGebot(realSnapshot({ windKn: 20, windDirDeg: 0 }))).toBe(
      'im-uhrzeigersinn',
    );
  });

  it('Stetiger Südwind kehrt das Gebot um — es ist eine Windregel, kein Dogma', () => {
    expect(umlaufsinnGebot(realSnapshot({ windKn: 20, windDirDeg: 180 }))).toBe(
      'gegen-uhrzeigersinn',
    );
  });

  it('Bei wenig Wind entscheidet die Drehrichtung nichts', () => {
    // Skipper: "es sei denn es ist wenig Wind, dann geht das".
    expect(umlaufsinnGebot(realSnapshot({ windKn: 5, windDirDeg: 0 }))).toBe('egal');
  });

  it('MELTEMI-LAGE ROUTET IM UHRZEIGERSINN — und der Rückweg bleibt im Lee', () => {
    /**
     * REGRESSION zum Review des Skippers (2026-08-07, Kartenansicht): "Gegen
     * den Uhrzeigersinn geroutet, was nach allen recherchierten Regeln wegen
     * der Windrichtung keinen Sinn macht. Hier scheint irgendwie eine falsche
     * Optimierungsregel zu hoch priorisiert worden sein."
     *
     * Er hatte recht, und zwar auch gegen die ERSTE Fassung dieses Umbaus. Dort
     * standen die gemessenen Kreuzstunden des Rückwegs ÜBER der
     * Lee-Korridor-Treue, mit der Begründung "die Messung schlägt die
     * Faustregel". Bei 16 kn aus 45° — der klassischen Meltemi-Richtung —
     * lieferte das eine Runde gegen den Uhrzeigersinn: den Westweg hinunter,
     * quer nach Osten, und über die offene Ägäis nach Nordwesten heim.
     *
     * Die Messung war nicht falsch: bei NE-Wind liegt dieser Heimweg wirklich
     * näher am Raumschots. Falsch war die Annahme, der Lee-Korridor sei bloss
     * eine gröbere Näherung derselben Frage. Er ist eine WELLEN- und
     * EXPOSITIONS-Regel ("minimaler Aufenthalt in offener See mit voll
     * entwickelter Welle", konzept.ts) — davon misst `kreuzHours` nichts.
     *
     * Geprüft über das ganze nördliche Meltemi-Band, nicht nur an einem Wert:
     * eine Rangfolge, die nur bei 0° stimmt, hat nichts bewiesen.
     */
    for (const dir of [0, 10, 20, 30, 45]) {
      const snapshot = realSnapshot({ windKn: 16, windDirDeg: dir });
      expect(umlaufsinnGebot(snapshot), `${dir}°`).toBe('im-uhrzeigersinn');

      const solved = completePlan(snapshot, 'athen')!;
      const metrics = planMetricsFor(snapshot)(solved);
      // Der Umlaufsinn ist KEIN Rangkriterium mehr (siehe unten) — er ergibt
      // sich aus der Lee-Korridor-Treue. Genau das prüfen die beiden Zeilen:
      // der Heimweg läuft in Abdeckung, und die Runde ist deshalb rechtsherum.
      expect(metrics.rueckwegAbweichung, `${dir}° — Lee-Korridor`).toBe(0);
      expect(metrics.clockwise, `${dir}° — Umlaufsinn als Folge`).toBe(true);
    }
    /**
     * FÜNF volle Hauptrouten-Suchen auf der echten Bibliothek — der Test lief
     * gemessen 3,8 s und damit knapp unter Vitests Vorgabe von 5 s. Seit die
     * Vorauswahl ihre Quote JE KONZEPT zieht (solver.ts), sind es 6,1 s: der
     * Kandidatenraum je Schicht ist grösser, und das ist der Preis dafür, dass
     * die klassische Runde überhaupt noch im Angebot vorkommt. Die Frist steht
     * hier sichtbar, damit die nächste Verlangsamung wieder auffällt.
     */
  }, VOLLE_BEWERTUNG_MS);

  it('bei NNW findet die App JETZT eine Runde im Uhrzeigersinn — vorher gab es keine', () => {
    /**
     * UMGEDREHT AM 2026-08-07, und zwar in die gute Richtung.
     *
     * Vorher stand hier "bei NNW gibt es GAR KEINE Runde im Uhrzeigersinn — und
     * die App behauptet auch keine", mit dieser Begründung: Athen liegt
     * nordwestlich der Kykladen, bei 16 kn aus 340° läuft die westliche
     * Heimkette (Milos → Sifnos → Serifos → Kythnos) dead upwind, während der
     * östliche Heimweg 30–40° besser anliegt. Von den 27 packbaren vollen
     * Runden war keine einzige rechtsherum. Der Test hielt die GRENZE der Regel
     * fest, statt sie wegzuoptimieren — richtig so.
     *
     * Die Grenze lag aber nicht in der Physik, sondern im Graphen. Mit den
     * abgeleiteten Etappen (deriveLegs.ts) gibt es jetzt Verbindungen, die es
     * vorher nicht gab — und damit eine Runde im Uhrzeigersinn, die den vollen
     * Rahmen füllt UND den Lee-Korridor auf dem ganzen Rückweg hält.
     *
     * Das ist genau, was der Skipper gemeint hat: „warum sollte man nicht
     * hinfahren, wenn der Wind es erlaubt und es diese roten Strecken
     * vermeidet?" Es war nie der Wind, der es verboten hat.
     */
    const snapshot = realSnapshot({ windKn: 16, windDirDeg: 340 });
    expect(umlaufsinnGebot(snapshot)).toBe('im-uhrzeigersinn');

    const solved = completePlan(snapshot, 'athen')!;
    const metrics = planMetricsFor(snapshot)(solved);

    /**
     * Der Rahmen-Vertrag hält — und die Richtung jetzt auch.
     *
     * DREIZEHN verschiedene Inseln auf vierzehn Etappen: die Runde läuft eine
     * Insel an einem zweiten Hafen an (Schicht B). Über elf Etappen war die
     * Gewinnerin noch wiederholungsfrei; über vierzehn gibt es bei NNW 16 kn
     * keine wiederholungsfreie, die den Lee-Korridor lückenlos hält — und die
     * Korridor-Treue steht in der Rangfolge über der Inselvielfalt. Genau das
     * tun die professionellen Zwei-Wochen-Törns auch (siehe
     * `roundTrips.MAX_ZWEITANLAEUFE`).
     */
    expect(metrics.legDays).toBe(RAHMEN);
    expect(metrics.distinctIslands).toBe(RAHMEN - 1);
    expect(metrics.clockwise).toBe(true);
    // Und der Rückweg bleibt vollständig im Lee-Korridor.
    expect(metrics.rueckwegAbweichung).toBe(0);
  });

  it('der Lee-Korridor rankt ÜBER den gemessenen Kreuzstunden des Rückwegs', () => {
    /**
     * Dieselbe Korrektur als Eigenschaft der Rangfolge statt als Szenario:
     * ein Heimweg quer über die offene See gewinnt NICHT, nur weil er im
     * Windwinkel bequemer liegt. Kreuzen ist ein Preis, offene See im Meltemi
     * ist eine Lage.
     */
    const snapshot = realSnapshot({ windKn: 16, windDirDeg: 45 });
    const metrics = planMetricsFor(snapshot);
    const solved = completePlan(snapshot, 'athen')!;
    const mk = (over: Partial<PlanMetrics>) => (r: SolveResult) =>
      ({ ...metrics(solved), ...(r.variantId === 'offen-see' ? over : {}) });
    const imLee = { ...solved, variantId: 'a-im-lee' };
    const offenSee = { ...solved, variantId: 'offen-see' };
    expect(
      preferred(offenSee, imLee, mk({ rueckwegAbweichung: 3, kreuzTenthsRueckweg: 10 })),
    ).toBe(imLee);
  });

  it('Das Windmittel ist windstärke-gewichtet und meldet seine Kohärenz', () => {
    const m = windMittelFor(realSnapshot({ windKn: 18, windDirDeg: 45 }));
    expect(m.fromDeg).toBeCloseTo(45, 0);
    expect(m.kn).toBeCloseTo(18, 0);
    // Konstantes Fenster = perfekte Kohärenz.
    expect(m.kohaerenz).toBeCloseTo(1, 2);
  });
});
