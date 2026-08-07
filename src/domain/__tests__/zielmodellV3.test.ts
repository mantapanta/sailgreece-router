/**
 * ZIELMODELL V3 gegen die ECHTE Bibliothek.
 *
 * Diese Datei ist der Wächter über die Kernfunktion der App. Die Beanstandung
 * des Skippers vom 2026-08-07 lautete: "das, was die App eigentlich machen
 * soll, macht sie nicht" — Hauptroute mit neun statt elf Etappen, Alternativen
 * mit sechs und acht, "Paros–Naxos" als gerade Linie hin und zurück, und eine
 * "Verlängerung nach Santorin", die nicht nach Santorin führt.
 *
 * DER SUCHRAUM IST WINZIG UND EXAKT AUFZÄHLBAR. Über die 39 kuratierten
 * Etappen (60 gerichtete Kanten, 20 Inseln) gibt es von der Basis aus
 * insgesamt 41 wiederholungsfreie Rundkurse bis elf Etappen — und GENAU SECHS,
 * die den vollen Rahmen füllen: elf Etappen, elf verschiedene Inseln, keine
 * Wiederholung. Vier davon laufen Santorin an.
 *
 * Die App hat keinen einzigen davon angeboten. Nicht, weil die Suche zu klein
 * gerechnet hätte — sechs Kandidaten kann man vollständig durchrechnen —,
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
import { completePlan, planTurn } from '../solver.ts';
import { islandSequence } from '../legs.ts';
import { stagesOf } from '../schema/plan.ts';
import { DEFAULT_PARAMS } from '../schema/params.ts';
import { deadlineFrame } from '../time.ts';
import type { Island } from '../schema/island.ts';
import type { Place } from '../schema/place.ts';
import type { Leg, Variant } from '../schema/route.ts';
import type { PlanningSnapshot } from '../schema/snapshot.ts';
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

  return {
    fetchedAtIso: `${TRIP_START}T06:00:00Z`,
    modelRunIso: `${TRIP_START}T00:00:00Z`,
    model: 'test',
    times,
    forecast,
    library: { islands, places, invalidPlaces: [], legs, variants },
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
}

const RAHMEN = deadlineFrame({ ...DEFAULT_PARAMS, tripStartDate: TRIP_START }).deadlineDay;

describe('Zielmodell v3 — der Suchraum enthält die richtigen Runden', () => {
  it('Der Törnrahmen ist elf Tage — elf Tage, elf Etappen', () => {
    expect(RAHMEN).toBe(11);
  });

  it('Schicht A liefert GENAU die sechs wiederholungsfreien 11-Etappen-Runden', () => {
    /**
     * Die Zahl ist der eigentliche Befund: sechs Runden füllen den Rahmen
     * sauber, und die App hat keine einzige davon angeboten. Der Suchraum ist
     * damit vollständig durchrechenbar — es braucht keine Notbremse, sondern
     * einen engeren Filter. Bricht dieser Test nach unten, ist wieder etwas
     * still gekappt; nach oben, hat jemand Etappen ergänzt (dann ist die neue
     * Zahl hier einzutragen und die Zunahme erwünscht).
     */
    const snapshot = realSnapshot();
    const [schichtA] = [...roundTripLayers(snapshot, 'athen', 11)];
    expect(schichtA?.gekappt).toBe(false);
    expect(schichtA?.trips).toHaveLength(6);
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

  it('Santorin braucht den GANZEN Rahmen — ab Tag 2 gibt es keine Santorin-Runde mehr', () => {
    /**
     * Der wahre Sachverhalt hinter Beispiel 3, und er ist schärfer als die
     * Beanstandung: Santorin hängt im Graphen nur an Ios, Naxos und
     * Folegandros. Die kürzeste wiederholungsfreie Runde über Santorin braucht
     * deshalb ALLE ELF Etappen — es gibt keine mit zehn oder weniger.
     *
     * "Santorin geht ab Törntag 2 nicht mehr" ist damit die RICHTIGE Antwort.
     * Falsch war, dass die App das Ziel trotzdem angeboten und einen Plan
     * dazugelegt hat, der nicht dorthin führt. Dieser Test hält beide Seiten
     * fest: an Tag 1 existiert die Runde, danach nicht — und keine der beiden
     * Aussagen darf sich hinter der anderen verstecken.
     */
    const anTag1 = enumerateRoundTrips(realSnapshot({ currentDay: 1 }), 'athen', RAHMEN)
      .filter((t) => islandSequence(t).includes('santorin'));
    expect(anTag1.length).toBeGreaterThan(0);
    for (const trip of anTag1) expect(trip).toHaveLength(11);

    for (const currentDay of [2, 3]) {
      const rest = RAHMEN - currentDay + 1;
      const alle = enumerateRoundTrips(realSnapshot({ currentDay }), 'athen', rest);
      expect(alle.filter((t) => islandSequence(t).includes('santorin'))).toHaveLength(0);
    }
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

  it('Das Windmittel ist windstärke-gewichtet und meldet seine Kohärenz', () => {
    const m = windMittelFor(realSnapshot({ windKn: 18, windDirDeg: 45 }));
    expect(m.fromDeg).toBeCloseTo(45, 0);
    expect(m.kn).toBeCloseTo(18, 0);
    // Konstantes Fenster = perfekte Kohärenz.
    expect(m.kohaerenz).toBeCloseTo(1, 2);
  });
});
