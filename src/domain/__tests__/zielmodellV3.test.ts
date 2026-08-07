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
import { umlaufsinnGebot, windMittelFor } from '../konzept.ts';
import { enumerateRoundTrips, roundTripLayers } from '../roundTrips.ts';
import {
  completePlan,
  planMetricsFor,
  planTurn,
  preferred,
  type PlanMetrics,
  type SolveResult,
} from '../solver.ts';
import { islandSequence } from '../legs.ts';
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
 */
const VOLLE_BEWERTUNG_MS = 20_000;

/**
 * Die Frist für den Menü-Wächter weiter unten: er rechnet EINEN vollen
 * Solver-Lauf je angebotenem Tagesziel, an einer Stichprobe von vier
 * Törntagen also rund vierzig. Das ist der Preis dafür, die Zusage des Menüs
 * gegen die echte Bibliothek zu prüfen statt gegen eine Miniatur.
 */
const ETAPPEN_MENUE_MS = 120_000;

describe('Zielmodell v3 — der Suchraum enthält die richtigen Runden', () => {
  it('Der Törnrahmen ist elf Tage — elf Tage, elf Etappen', () => {
    expect(RAHMEN).toBe(11);
  });

  it('Schicht A liefert GENAU die 2947 wiederholungsfreien 11-Etappen-Runden', () => {
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
     */
    const snapshot = realSnapshot();
    const [schichtA] = [...roundTripLayers(snapshot, 'athen', 11)];
    expect(schichtA?.gekappt).toBe(false);
    expect(schichtA?.trips).toHaveLength(2947);
  });

  it('Keine Runde der Schicht A läuft eine Insel zweimal an', () => {
    const snapshot = realSnapshot();
    const [schichtA] = [...roundTripLayers(snapshot, 'athen', 11)];
    for (const trip of schichtA?.trips ?? []) {
      const seq = islandSequence(trip);
      // Die Basis steht am Anfang UND am Ende — sie ist die Ausnahme.
      const ohneBasis = seq.filter((id) => id !== 'athen');
      expect(new Set(ohneBasis).size).toBe(ohneBasis.length);
      expect(trip).toHaveLength(11);
    }
  });

  it('Santorin braucht neun Etappen — ab Törntag 5 gibt es keine Santorin-Runde mehr', () => {
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
     * "Santorin geht ab Törntag 5 nicht mehr" ist die richtige Antwort. Falsch
     * war, dass die App das Ziel trotzdem angeboten und einen Plan dazugelegt
     * hat, der nicht dorthin führt.
     */
    const anTag1 = enumerateRoundTrips(realSnapshot({ currentDay: 1 }), 'athen', RAHMEN)
      .filter((t) => islandSequence(t).includes('santorin'));
    expect(anTag1.length).toBeGreaterThan(0);
    // Neun Etappen ist das Minimum — keine kürzere Santorin-Runde existiert.
    expect(Math.min(...anTag1.map((t) => t.length))).toBe(9);

    // Tag 4 lässt es noch zu, Tag 5 nicht mehr.
    const anTag4 = enumerateRoundTrips(realSnapshot({ currentDay: 4 }), 'athen', RAHMEN - 3)
      .filter((t) => islandSequence(t).includes('santorin'));
    expect(anTag4.length).toBeGreaterThan(0);

    const anTag5 = enumerateRoundTrips(realSnapshot({ currentDay: 5 }), 'athen', RAHMEN - 4)
      .filter((t) => islandSequence(t).includes('santorin'));
    expect(anTag5).toHaveLength(0);
  });

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
  });

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

  it('Elf Törntage, elf Etappentage, kein Hafentag', () => {
    // Beispiel 1: die App lieferte neun Etappen in elf Tagen, weil die
    // Etappenzahl auf Rang 14 von 14 stand und bis zu fünf Hafentage nur ein
    // weicher Strukturbefund waren.
    expect(solved).not.toBeNull();
    expect(solved!.plan.days).toHaveLength(11);
    expect(stagesOf(solved!.plan)).toHaveLength(11);
    expect(solved!.plan.days.filter((d) => d.kind === 'harbour')).toHaveLength(0);
  });

  it('Keine Insel zweimal — und elf verschiedene', () => {
    // Beispiel 2: "Paros–Naxos" war eine gerade Linie hin und zurück, mit
    // fünf Inseln doppelt. Solche Ketten entstanden im Generator "Variante +
    // Rückfallkette", weil die Kette die Umkehrung der Varianten ist.
    const ziele = stagesOf(solved!.plan).map((s) => s.toIslandId);
    const ohneBasis = ziele.filter((id) => id !== 'athen');
    expect(new Set(ohneBasis).size).toBe(ohneBasis.length);
    expect(new Set(ziele).size).toBe(11);
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
 * DAS ETAPPEN-MENÜ HÄLT, WAS ES ANBIETET.
 *
 * Der Befund des Skippers vom 2026-08-07: „Alle Optionen, die mir Menü Etappe
 * ändern angeboten werden, sollten dann tatsächlich auch möglich sein. Hier
 * habe ich Paros ausgewählt und das war ja auch angezeigt und dann sagt mir
 * die App, dass das nicht möglich ist."
 *
 * Es war kein Einzelfall. Gemessen an der ausgelieferten Bibliothek (mildes
 * Fenster, 14 kn aus Nord) lehnte der Solver 126 von 208 angebotenen Zielen
 * ab — sechs von zehn. Zwei Ursachen, beide gezählt:
 *
 *   76 — `reach.ts` fragte den vollen Etappen-Index nach zwei Hops ab dem
 *        Vortagsziel, der Solver sucht aber Runden über den AUSGEDÜNNTEN
 *        Aufzählungs-Graphen. Paros ab Serifos ist genau das: die abgeleitete
 *        Etappe (31,2 sm) steht in der Bibliothek und fehlt im Graphen.
 *   50 — `solver.vorauswahl` kappte je Schicht auf 120 Kandidaten nach einer
 *        Rangfolge, die den Pin nicht kannte. Passende Runden gab es, sie
 *        standen nur nicht unter den ersten 120.
 *
 * Dieser Test ist der Wächter darüber. Er ist teuer (ein voller Solver-Lauf je
 * angebotenem Ziel), deshalb prüft er eine Stichprobe von Törntagen über den
 * ganzen Rahmen statt aller elf.
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
    const stichprobe = [1, 4, 7, RAHMEN];

    const angeboten: string[] = [];
    const abgelehnt: string[] = [];
    for (const stage of assessment.mainRoute!.stages) {
      if (!stichprobe.includes(stage.day)) continue;
      for (const islandId of stage.reachableIslandIds) {
        angeboten.push(`Tag ${stage.day} → ${islandId}`);
        const solved = completePlan(mitPlan, assessment.currentIslandId!, [
          { day: stage.day, toIslandId: islandId },
        ]);
        if (!solved) abgelehnt.push(`Tag ${stage.day} → ${islandId}`);
      }
    }

    // Der Test darf nicht dadurch grün werden, dass gar nichts mehr im Menü
    // steht: der Filter ist eine Zusage, keine Sperre.
    expect(angeboten.length).toBeGreaterThan(30);
    /**
     * WAS ÜBRIG BLEIBT, ist die Wetter-Restmenge: der Filter ist ein Vorfilter
     * aus Geographie und Kandidatenraum, die Fahrbarkeit eines Tages
     * entscheidet erst die Simulation. Bei 14 kn aus Nord ist das an dieser
     * Stichprobe genau EIN Ziel (Santorin an Tag 7, das im Rahmen nicht mehr
     * aufgeht). Der Editor benennt diesen Fall jetzt auch als das, was er ist.
     *
     * Steigt die Zahl, ist der Filter wieder grosszügiger als die Suche.
     */
    expect(abgelehnt, abgelehnt.join(', ')).toHaveLength(1);
  }, ETAPPEN_MENUE_MS);
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
  });

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

    // Der Rahmen-Vertrag hält — und die Richtung jetzt auch.
    expect(metrics.legDays).toBe(11);
    expect(metrics.distinctIslands).toBe(11);
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
