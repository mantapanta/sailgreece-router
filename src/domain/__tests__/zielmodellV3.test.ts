/**
 * ZIELMODELL V3 gegen die ECHTE Bibliothek.
 *
 * Diese Datei ist der Wächter über die Kernfunktion der App. Die Beanstandung
 * des Skippers vom 2026-08-07 lautete: "das, was die App eigentlich machen
 * soll, macht sie nicht" — Hauptroute mit neun statt elf Etappen, Alternativen
 * mit sechs und acht, "Paros–Naxos" als gerade Linie hin und zurück, und eine
 * "Verlängerung nach Santorin", die nicht nach Santorin führt.
 *
 * DER SUCHRAUM IST KLEIN UND EXAKT AUFZÄHLBAR. Über die 46 kuratierten Etappen
 * (74 gerichtete Kanten, 22 Inseln) gibt es von der Basis aus GENAU 68 Runden,
 * die den vollen Rahmen füllen: elf Etappen, elf verschiedene Inseln, keine
 * Wiederholung.
 *
 * Beim Umbau am 2026-08-07 waren es SECHS — über 39 Etappen und 60 Kanten. Die
 * sieben Etappen, die am selben Tag aus dem Abgleich mit der Törnanalyse
 * dazukamen (Naxos–Sifnos, Milos–Serifos, Sifnos–Kythnos, Mykonos–Donousa,
 * Donousa–Amorgos, Schinoussa–Naxos, Mykonos–Delos/Rinia), haben den Raum
 * verelffacht. Das ist der ganze Punkt: die Kriterien mussten dafür nicht
 * angefasst werden, der Bibliothek fehlten Verbindungen.
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

describe('Zielmodell v3 — der Suchraum enthält die richtigen Runden', () => {
  it('Der Törnrahmen ist elf Tage — elf Tage, elf Etappen', () => {
    expect(RAHMEN).toBe(11);
  });

  it('Schicht A liefert GENAU die 68 wiederholungsfreien 11-Etappen-Runden', () => {
    /**
     * Die Zahl ist der eigentliche Befund: 68 Runden füllen den Rahmen sauber,
     * und die App hat lange keine einzige davon angeboten. Der Suchraum ist
     * vollständig durchrechenbar — es braucht keine Notbremse, sondern einen
     * engeren Filter. Bricht dieser Test nach unten, ist wieder etwas still
     * gekappt; nach oben, hat jemand Etappen ergänzt (dann ist die neue Zahl
     * hier einzutragen und die Zunahme erwünscht).
     *
     * 2026-08-07: 6 → 68, durch die sieben Etappen aus der Törnanalyse.
     */
    const snapshot = realSnapshot();
    const [schichtA] = [...roundTripLayers(snapshot, 'athen', 11)];
    expect(schichtA?.gekappt).toBe(false);
    expect(schichtA?.trips).toHaveLength(68);
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

  it('Santorin braucht neun Etappen — ab Törntag 4 gibt es keine Santorin-Runde mehr', () => {
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
     *
     * "Santorin geht ab Törntag 4 nicht mehr" ist die richtige Antwort. Falsch
     * war, dass die App das Ziel trotzdem angeboten und einen Plan dazugelegt
     * hat, der nicht dorthin führt.
     */
    const anTag1 = enumerateRoundTrips(realSnapshot({ currentDay: 1 }), 'athen', RAHMEN)
      .filter((t) => islandSequence(t).includes('santorin'));
    expect(anTag1.length).toBeGreaterThan(0);
    // Neun Etappen ist das Minimum — keine kürzere Santorin-Runde existiert.
    expect(Math.min(...anTag1.map((t) => t.length))).toBe(9);

    // Tag 3 lässt die neun noch zu, Tag 4 nicht mehr.
    const anTag3 = enumerateRoundTrips(realSnapshot({ currentDay: 3 }), 'athen', RAHMEN - 2)
      .filter((t) => islandSequence(t).includes('santorin'));
    expect(anTag3.length).toBeGreaterThan(0);

    const anTag4 = enumerateRoundTrips(realSnapshot({ currentDay: 4 }), 'athen', RAHMEN - 3)
      .filter((t) => islandSequence(t).includes('santorin'));
    expect(anTag4).toHaveLength(0);
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

  it('Delos/Rinia bleibt eine Sackgasse — erreichbar NUR über den Zweitanlauf Mykonos', () => {
    /**
     * Die Gegenprobe zum Test darüber, und der Grund, dass die Schicht B
     * überhaupt existiert.
     *
     * Rinia hat genau EINEN kuratierten Liegeplatz und genau EINE Etappe
     * (`mykonos--delos-rinia`, Törnanalyse Route 2 Tag 3). Wer hin will, muss
     * über Mykonos — und wieder zurück nach Mykonos. Das IST ein Zweitanlauf,
     * und keine Aufzählung ohne Wiederholung kann ihn hergeben.
     *
     * Bewusst so gelassen (Skipper-Entscheid 2026-08-07): ein zweiter Platz auf
     * Rinia wäre erfunden. Die Insel ist eine Ankerbucht, kein Revier.
     */
    const snapshot = realSnapshot();
    const [ohne, mit] = [...roundTripLayers(snapshot, 'athen', RAHMEN)];
    expect(
      (ohne?.trips ?? []).filter((t) => islandSequence(t).includes('delos-rinia')),
      'Delos/Rinia ohne Zweitanlauf',
    ).toHaveLength(0);
    expect(
      (mit?.trips ?? []).filter((t) => islandSequence(t).includes('delos-rinia')).length,
      'Delos/Rinia mit Zweitanlauf',
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
  });

  it('Alternativen tragen keine kuratierten Routen-Namen mehr', () => {
    // Die Namen aus variants.json ("Verlängerung Santorin", "Süd-Route bis
    // Naxos") dürfen nirgends mehr an einem Plan hängen — genau daran hing
    // die Behauptung, die der Plan nicht einlöste.
    const assessment = assessPlanning(realSnapshot());
    const kuratiert = variants.map((v) => v.name);
    for (const opt of assessment.routeOptions) {
      expect(kuratiert).not.toContain(opt.name);
    }
  });
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

  it('bei NNW gibt es GAR KEINE Runde im Uhrzeigersinn — und die App behauptet auch keine', () => {
    /**
     * DIE GRENZE DER REGEL, als Test festgehalten statt wegoptimiert.
     *
     * Bei 16 kn aus 340° (NNW) liefert der Solver eine Runde GEGEN den
     * Uhrzeigersinn. Das sieht aus wie der Fehler, den der Skipper am
     * 2026-08-07 beanstandet hat — ist aber die richtige Antwort, und der
     * Unterschied ist nachgerechnet: von den 27 packbaren vollen Runden ist
     * KEINE EINZIGE im Uhrzeigersinn. Es gibt nichts Besseres zu wählen.
     *
     * Der Grund ist Geometrie, nicht Rangfolge: Athen liegt nordwestlich der
     * Kykladen. Bei NNW-Wind läuft die westliche Heimkette (Milos → Sifnos →
     * Serifos → Kythnos → Athen, Kurse N bis NNO) dead upwind, während der
     * östliche Heimweg (Kurse um 310°) 30–40° besser anliegt.
     *
     * Und die Wind-Topographie kann daran nichts ändern: die Lee-Keulen auf
     * Kea/Kythnos/Serifos/Sifnos senken die Wind-STÄRKE, aber Kreuzen ist ein
     * WINKEL-Problem. Abdeckung hilft gegen zu viel Wind, nicht gegen zu spitz.
     *
     * Was der Test wirklich absichert: die App gibt bei so einer Lage nicht
     * vor, die Regel einzuhalten. `umlaufsinnPasst` steht auf false, die
     * Lee-Abweichung ist sichtbar — und der Rahmen-Vertrag hält trotzdem.
     */
    const snapshot = realSnapshot({ windKn: 16, windDirDeg: 340 });
    // Die grobe Regel sagt weiterhin "im Uhrzeigersinn" — sie kennt nur die
    // Nord-Komponente, nicht die Kurse der Heimkette.
    expect(umlaufsinnGebot(snapshot)).toBe('im-uhrzeigersinn');

    const solved = completePlan(snapshot, 'athen')!;
    const metrics = planMetricsFor(snapshot)(solved);

    // Der Rahmen-Vertrag hält auch hier — die Lage kostet die Richtung, nicht den Törn.
    expect(metrics.legDays).toBe(11);
    expect(metrics.distinctIslands).toBe(11);
    // Und die Abweichung wird zugegeben, nicht kaschiert.
    expect(metrics.clockwise).toBe(false);
    expect(metrics.rueckwegAbweichung).toBeGreaterThan(0);
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
