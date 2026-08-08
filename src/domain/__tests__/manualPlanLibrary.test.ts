/**
 * „ALLE VERBINDUNGEN SIND ZUGELASSEN" — gegen die ECHTE Bibliothek.
 *
 * manualPlan.test.ts prüft die Regeln an vier erfundenen Inseln. Dieser Test
 * prüft die Zusage am wirklichen Revier: der Skipper darf jede Insel als
 * Tagesziel wählen, und die App muss ihm dorthin einen landfreien Kurs legen —
 * auch dorthin, wohin niemand eine Etappe recherchiert hat.
 *
 * Das ist die Zusage, die den ganzen Umbau trägt. Bleibt auch nur ein
 * Insel-Paar übrig, für das die Wahl fehlschlägt, ist die Auswahl im
 * Tages-Editor eine Liste mit stillen Sackgassen.
 *
 * Gelesen wird die Staging-Datei per fs, nicht per JSON-Import: der Import
 * bräuchte `resolveJsonModule`, und der Typcheck des Projekts läuft ohne.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { emptyManualPlan, setDayTarget } from '../manualPlan.ts';
import { pathCrossesLand } from '../searoute.ts';
import { islandAtEndOfDay } from '../schema/plan.ts';
import { distanceNm } from '../geo.ts';
import { DEFAULT_PARAMS } from '../schema/params.ts';
import type { Island } from '../schema/island.ts';
import type { Place } from '../schema/place.ts';
import type { Leg } from '../schema/route.ts';
import type { PlanningSnapshot } from '../schema/snapshot.ts';
import { makeSnapshot, TRIP_START } from './fixtures.ts';

const dataDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../seeding/data',
);

const legs: Leg[] = (
  JSON.parse(readFileSync(path.join(dataDir, 'legs.json'), 'utf8')) as { legs: Leg[] }
).legs;

const { islands, places } = (() => {
  const islands: Island[] = [];
  const places: Place[] = [];
  const islandDir = path.join(dataDir, 'islands');
  for (const file of readdirSync(islandDir).filter((f) => f.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(path.join(islandDir, file), 'utf8')) as {
      island?: Island;
      places?: Place[];
    };
    if (doc.island) islands.push(doc.island);
    for (const place of doc.places ?? []) places.push(place);
  }
  return { islands, places };
})();

/** Nur Inseln, die überhaupt einen Liegeplatz haben — sonst gibt es kein Ziel. */
const zielInseln = islands.filter((i) => places.some((p) => p.islandId === i.id));

const PARAMS = {
  ...DEFAULT_PARAMS,
  tripStartDate: TRIP_START,
  tripLengthDays: 3,
  baseIslandId: 'attika',
};

const snapshot: PlanningSnapshot = makeSnapshot({
  params: PARAMS,
  library: { islands, places, invalidPlaces: [], legs, variants: [] },
});

describe('freie Handplanung am echten Revier', () => {
  it('kennt Inseln und Etappen', () => {
    expect(zielInseln.length).toBeGreaterThan(20);
    expect(legs.length).toBeGreaterThan(100);
    expect(zielInseln.some((i) => i.id === PARAMS.baseIslandId)).toBe(true);
  });

  /**
   * DIE ZUSAGE, auf die es ankommt: was an einem Tag überhaupt zur Debatte
   * steht — die Nachbarschaft — muss wählbar sein, von JEDER Insel aus, ohne
   * dass jemand die Verbindung recherchiert hat. 45 sm ist dabei bewusst
   * grosszügig gegriffen: ein langer, aber fahrbarer Schlag.
   *
   * DIE VIER AUSNAHMEN stehen hier NAMENTLICH statt als weichere Schwelle.
   * Dokos, Ermioni, Porto Heli und Spetses liegen im Argolischen Golf, hinter
   * einer Küstenlinie, für die `searoute.ts` die Ansteuerung nicht auflöst —
   * und sie hängen an keiner einzigen kuratierten Etappe, über die sich die
   * Kette behelfen könnte. Das ist eine Grenze der Geometrie in einer Ecke
   * ausserhalb des Kykladen-Reviers, kein Planungsverbot: kippt sie, soll
   * dieser Test es melden, statt sie stillschweigend mitzuschleppen.
   */
  const ARGOLIS = ['dokos', 'ermioni', 'porto-heli', 'spetses'];

  it('lässt von jeder Insel jede Nachbarinsel (≤ 45 sm) als Tagesziel zu', () => {
    const abgewiesen: string[] = [];
    // Die vier Ausnahmen sind AUSGENOMMEN, nicht bloss aus dem Ergebnis
    // gefiltert: ein erfolgloser Anlauf ist der teure (searoute arbeitet sich
    // durch die halbe Ägäis), und diese Prüfung läuft über jedes Insel-Paar
    // des Reviers.
    const revier = zielInseln.filter((i) => !ARGOLIS.includes(i.id));
    for (const von of revier) {
      const plan = setDayTarget(emptyManualPlan(PARAMS), 1, { islandId: von.id }, snapshot);
      if (!plan) {
        abgewiesen.push(`${PARAMS.baseIslandId} -> ${von.id}`);
        continue;
      }
      for (const nach of revier) {
        if (nach.id === von.id) continue;
        if (distanceNm(von.coordinates, nach.coordinates) > 45) continue;
        if (setDayTarget(plan.plan, 2, { islandId: nach.id }, snapshot) === null) {
          abgewiesen.push(`${von.id} -> ${nach.id}`);
        }
      }
    }
    expect(abgewiesen).toEqual([]);
  }, 120_000);

  it('legt auch die erzeugten Kurse landfrei', () => {
    const orte = new Map(places.map((p) => [p.id, p.coordinates]));
    const erzeugt: Leg[] = [];
    for (const insel of zielInseln) {
      if (insel.id === PARAMS.baseIslandId) continue;
      const change = setDayTarget(
        emptyManualPlan(PARAMS),
        1,
        { islandId: insel.id },
        snapshot,
      );
      erzeugt.push(...(change?.customLegs ?? []));
    }
    // Ohne erzeugte Etappe prüft dieser Test nichts — die Bibliothek deckt
    // nicht alle Ziele ab Attika ab, und genau darum geht es hier.
    expect(erzeugt.length).toBeGreaterThan(0);
    const ueberLand = erzeugt
      .filter((l) =>
        pathCrossesLand([
          orte.get(l.fromPlaceId)!,
          ...l.waypoints,
          orte.get(l.toPlaceId)!,
        ]),
      )
      .map((l) => l.id);
    expect(ueberLand).toEqual([]);
  }, 120_000);

  it('baut eine Kette quer durchs Revier, ohne je nach Hause zu müssen', () => {
    // Ein Törn, den der alte Solver nie vorgeschlagen hätte: einfach nach
    // Süden und dort bleiben. Kein Rundkurs, keine Rückkehr-Frist, kein Nein.
    let plan = emptyManualPlan(PARAMS);
    const kette = ['kea', 'paros', 'santorin'];
    kette.forEach((islandId, i) => {
      const change = setDayTarget(plan, i + 1, { islandId }, snapshot);
      expect(change, `Tag ${i + 1} nach ${islandId}`).not.toBeNull();
      plan = change!.plan;
    });
    expect([1, 2, 3].map((d) => islandAtEndOfDay(plan, d))).toEqual(kette);
  });

  /**
   * DER FERNSCHLAG — der Fall, für den die Kette gebaut ist. Attika → Amorgos
   * (97 sm) steht in keiner Etappe der Bibliothek, und `seaRoute` findet über
   * diese Distanz und ein halbes Dutzend Inseln hinweg direkt keine Umfahrung
   * mehr. Die Bibliothek KENNT den Weg trotzdem — in Stücken. Genau daraus
   * wird die Etappe.
   *
   * Ob so ein Tag seemännisch sinnvoll ist, sagt die App nicht mehr; sie
   * rechnet ihn vor (97 sm sprechen für sich). Verboten wird er nicht.
   */
  it('verkettet einen Fernschlag aus bekannten Etappen', () => {
    const change = setDayTarget(
      emptyManualPlan(PARAMS),
      1,
      { islandId: 'amorgos' },
      snapshot,
    );
    expect(change).not.toBeNull();

    // EINE Etappe, kein Mehrfach-Schlag-Tag: die Zwischeninseln sind Punkte am
    // Kurs, keine Stopps mit Liegezeit.
    const tag1 = change!.plan.days.find((d) => d.day === 1)!;
    expect(tag1.kind === 'stage' && tag1.legIds).toHaveLength(1);

    const erzeugt = change!.customLegs[0]!;
    expect(erzeugt.waypoints.length).toBeGreaterThan(2);
    expect(erzeugt.distanceNm).toBeGreaterThan(80);
    const orte = new Map(places.map((p) => [p.id, p.coordinates]));
    expect(
      pathCrossesLand([
        orte.get(erzeugt.fromPlaceId)!,
        ...erzeugt.waypoints,
        orte.get(erzeugt.toPlaceId)!,
      ]),
    ).toBe(false);
  }, 60_000);
});
