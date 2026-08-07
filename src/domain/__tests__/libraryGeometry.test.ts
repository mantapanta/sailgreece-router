/**
 * Die Bibliothek gegen die Küstenlinie — der Wächter über die Staging-Daten.
 *
 * Die kuratierten Etappen liefen quer über Inseln: 21 von 30 Luftlinien
 * kreuzten Land, und neun Wegpunkte lagen selbst an Land (u.a. mitten auf
 * Naxos). Das ist mit seeding/tools/seaRouteLegs.ts bereinigt — und dieser Test
 * ist der Grund, dass es so bleibt. Wer eine Etappe von Hand ergänzt oder eine
 * Distanz nachträgt, erfährt hier, ob der Kurs fahrbar ist.
 *
 * Gelesen wird die Staging-Datei per fs, nicht per JSON-Import: der Import
 * bräuchte `resolveJsonModule`, und der Typcheck des Projekts läuft ohne.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isOnLand, landCrossingNm, pathCrossesLand } from '../searoute.ts';
import { reverseLeg } from '../legs.ts';
import { distanceNm } from '../geo.ts';
import { sailedLeg, sailedLegsByDay } from '../legGeometry.ts';
import type { Place } from '../schema/place.ts';
import type { Leg } from '../schema/route.ts';
import type { Coordinates } from '../schema/common.ts';

const dataDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../seeding/data',
);

const legs: Leg[] = (
  JSON.parse(readFileSync(path.join(dataDir, 'legs.json'), 'utf8')) as { legs: Leg[] }
).legs;

/**
 * Die Insel-Dateien werden AUFGEZÄHLT, nicht aufgelistet.
 *
 * Bis 2026-08-07 stand hier eine hart kodierte Liste von zwanzig Inseln. Sie
 * war eine stille Falle: eine neue Etappe nach Donousa liess nicht etwa den
 * Geometrie-Test anschlagen, sondern `kennt zu jeder Etappe Start- und
 * Zielplatz` — mit einer Meldung, die nach einem Datenfehler aussah, obwohl
 * bloss der Test die Insel nicht kannte. Das Verzeichnis weiss besser als eine
 * Kopie davon, welche Inseln es gibt.
 */
const allPlaces: Place[] = (() => {
  const out: Place[] = [];
  const islandDir = path.join(dataDir, 'islands');
  for (const file of readdirSync(islandDir).filter((f) => f.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(path.join(islandDir, file), 'utf8')) as {
      places?: Place[];
    };
    for (const place of doc.places ?? []) out.push(place);
  }
  return out;
})();

/**
 * Die `islandId` kommt aus der DATEI, nicht aus dem Platz-Namen. Ein
 * `id.split('-')[0]` läge bei `delos-rinia-miskanti` ('delos') und
 * `porto-heli-hafen` ('porto') daneben — und eine Prüfung, die die halbe Insel
 * gar nicht findet, prüft nichts.
 */
const places: Record<string, Coordinates> = Object.fromEntries(
  allPlaces.map((p) => [p.id, p.coordinates]),
);

const pathOf = (leg: Leg): Coordinates[] | null => {
  const from = places[leg.fromPlaceId];
  const to = places[leg.toPlaceId];
  if (!from || !to) return null;
  return [from, ...leg.waypoints, to];
};

const variants: { id: string; legIds: string[] }[] = (
  JSON.parse(readFileSync(path.join(dataDir, 'variants.json'), 'utf8')) as {
    variants: { id: string; legIds: string[] }[];
  }
).variants;

describe('Etappen-Bibliothek: kein Kurs führt über Land', () => {
  it('hat Etappen zu prüfen', () => {
    expect(legs.length).toBeGreaterThan(20);
  });

  it('kennt zu jeder Etappe Start- und Zielplatz', () => {
    const orphans = legs
      .filter((l) => !pathOf(l))
      .map((l) => `${l.id} (${l.fromPlaceId} -> ${l.toPlaceId})`);
    expect(orphans).toEqual([]);
  });

  it('legt jede Etappe von JEDEM Liegeplatz ihrer Inseln landfrei', () => {
    /**
     * DIE LÜCKE, DIE DIESER TEST ZWEI MONATE OFFEN LIESS — und die den
     * Screenshot-Befund des Skippers vom 2026-08-07 erzeugt hat.
     *
     * Geprüft wurden bisher nur die KURATIERTEN Endpunkte einer Etappe. Ein
     * Plan verankert sie aber an dem Liegeplatz, an dem das Boot wirklich
     * liegt (legGeometry.ts) — und der wird für die NACHT gewählt, nicht für
     * die Etappe. Genau dort, wo der Anker die Endpunkte verschiebt, hat der
     * alte Wächter nicht hingesehen.
     *
     * Der Fund: von 620 Kombinationen aus Etappe und Ankerplätzen waren
     * VIERZEHN unauflösbar — und alle vierzehn hingen an einem einzigen Platz,
     * `santorin-akrotiri`, dessen kuratierte Koordinate AUF DER LANDMASKE lag.
     * Von einem Punkt an Land findet `seaRoute` zu keinem Ziel einen Weg. Die
     * Bewertung rechnete dann auf der Luftlinie quer über Santorin weiter, und
     * heraus kam eine rote Etappe mit Zahlen, die kein Boot fahren kann.
     *
     * NICHT geprüft wird "liegt der Platz im Wasser": Häfen liegen auf der
     * Küstenlinie, und im 9-m-Raster meldet die Maske sie reihenweise als Land.
     * Das ist kein Befund. Der Befund ist, ob von dort ein Kurs zustande kommt
     * — und das prüft diese Schleife für jede Richtung, die der Heimweg bauen
     * kann.
     */
    const gerichtet: Leg[] = [];
    for (const leg of legs) {
      gerichtet.push(leg);
      gerichtet.push(reverseLeg(leg));
    }
    const placesOf = (islandId: string): Place[] =>
      allPlaces.filter((p) => p.islandId === islandId);
    const kaputt: string[] = [];
    for (const leg of gerichtet) {
      for (const von of placesOf(leg.fromIslandId)) {
        for (const nach of placesOf(leg.toIslandId)) {
          const s = sailedLeg(leg, allPlaces, {
            fromPlaceId: von.id,
            toPlaceId: nach.id,
            probe: true,
          });
          if (s.kursUnaufloesbar) kaputt.push(`${leg.id}: ${von.id} -> ${nach.id}`);
        }
      }
    }
    expect(kaputt).toEqual([]);
    // 620 Kombinationen mit je einem Sichtbarkeitsgraphen — das dauert, und die
    // Frist steht sichtbar hier, damit eine echte Verlangsamung auffällt.
  }, 120_000);

  it('hat keinen Wegpunkt an Land', () => {
    const onLand: string[] = [];
    for (const leg of legs) {
      leg.waypoints.forEach((w, n) => {
        if (isOnLand(w)) onLand.push(`${leg.id}:${n} (${w.lat}, ${w.lon})`);
      });
    }
    expect(onLand).toEqual([]);
  });

  it('legt jeden gespeicherten Kurs landfrei', () => {
    const crossing: string[] = [];
    for (const leg of legs) {
      const points = pathOf(leg);
      if (!points) continue;
      for (let i = 0; i < points.length - 1; i++) {
        const nm = landCrossingNm(points[i]!, points[i + 1]!);
        if (nm > 0.15) {
          crossing.push(`${leg.id} Abschnitt ${i}: ${nm.toFixed(1)} sm über Land`);
        }
      }
    }
    expect(crossing).toEqual([]);
  });

  /**
   * Die Gegenprobe OHNE `landCrossingNm` — der Wächter, der zweimal gefehlt hat.
   *
   * Die Prüfung darüber validiert die Daten mit derselben Funktion, die sie
   * erzeugt hat. Genau darin konnten sich zwei Fehler verstecken: erst der
   * Kreis um die Endpunkte (jeder Schlag bis 3 sm galt als landfrei), dann der
   * pauschale Ansteuerungsbetrag (1,5 sm Landzunge je Endpunkt galten als
   * Ansteuerung). Beide Male meldete `landCrossingNm` 0,000 sm für einen Kurs,
   * der sichtbar über die Insel lief.
   *
   * Dieser Test tastet die Landmaske stattdessen direkt ab und unterscheidet
   * dabei, was die Ausnahme decken DARF: Land am Anfang oder Ende des Kurses
   * ist die Ansteuerung einer Bucht, die die 250-m-Auflösung zugeschnitten hat.
   * Land MITTEN im Kurs ist ein Landweg, egal was die Ausnahme dazu sagt.
   */
  it('führt auch nach direkter Abtastung der Landmaske über kein Land', () => {
    /** Zusammenhängende Landstücke eines Kurses, mit Abstand zum nächsten Ende. */
    const landRuns = (points: Coordinates[]): { nm: number; vomEnde: number }[] => {
      const samples: { s: number; land: boolean }[] = [];
      let s = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]!;
        const b = points[i + 1]!;
        const len = distanceNm(a, b);
        const steps = Math.max(80, Math.ceil(len * 200)); // ~9 m Raster
        for (let k = 0; k < steps; k++) {
          const t = k / steps;
          samples.push({
            s: s + len * t,
            land: isOnLand({
              lat: a.lat + (b.lat - a.lat) * t,
              lon: a.lon + (b.lon - a.lon) * t,
            }),
          });
        }
        s += len;
      }
      const out: { nm: number; vomEnde: number }[] = [];
      for (let i = 0; i < samples.length; ) {
        if (!samples[i]!.land) {
          i++;
          continue;
        }
        const start = samples[i]!.s;
        while (i < samples.length && samples[i]!.land) i++;
        const end = samples[i - 1]!.s;
        out.push({ nm: end - start, vomEnde: Math.min(start, s - end) });
      }
      return out;
    };

    const crossing: string[] = [];
    for (const leg of [...legs, ...legs.map(reverseLeg)]) {
      const points = pathOf(leg);
      if (!points) continue;
      for (const run of landRuns(points)) {
        // Am Kursende: Ansteuerung einer zugeschnittenen Bucht.
        if (run.vomEnde < 0.05) continue;
        // Mitten im Kurs: nur die Auflösung der Quelle selbst ist entschuldbar.
        if (run.nm <= 0.15) continue;
        crossing.push(
          `${leg.id}: ${run.nm.toFixed(2)} sm Land, ${run.vomEnde.toFixed(2)} sm vom nächsten Endpunkt`,
        );
      }
    }
    expect(crossing).toEqual([]);
  });

  it('gilt auch für die Gegenrichtungen, aus denen der Heimweg gebaut wird', () => {
    // ppr.ts baut den Rückweg teils aus umgedrehten Etappen (legs.ts). Deren
    // Geometrie ist gespiegelt — und muss genauso fahrbar sein.
    const crossing = legs
      .map(reverseLeg)
      .filter((leg) => {
        const points = pathOf(leg);
        return points ? pathCrossesLand(points) : false;
      })
      .map((leg) => leg.id);
    expect(crossing).toEqual([]);
  });
});

describe('Routen der Bibliothek: gesegelt ist die Kette lückenlos', () => {
  const legsById = new Map<string, Leg>();
  for (const leg of legs) if (!legsById.has(leg.id)) legsById.set(leg.id, leg);
  for (const leg of legs) {
    const rev = reverseLeg(leg);
    if (!legsById.has(rev.id)) legsById.set(rev.id, rev);
  }
  it('hat Routen zu prüfen', () => {
    expect(variants.length).toBeGreaterThan(3);
  });

  /**
   * Die kuratierte Bibliothek SPRINGT an einigen Übergängen — genau das ist der
   * Befund: `polyaigos--paros` endet in Parikia, `paros--syros` startet in
   * Naoussa. Der Test hält fest, dass die gesegelte Kette diese Sprünge
   * schliesst, statt sie an die Karte weiterzugeben.
   */
  it.each(variants.map((v) => v.id))('verkettet %s ohne Sprung', (variantId) => {
    const variant = variants.find((v) => v.id === variantId)!;
    const chain = sailedLegsByDay(
      variant.legIds.map((legId, i) => ({ day: i + 1, legIds: [legId], placeId: null })),
      legsById,
      allPlaces,
    );
    const sailed = variant.legIds.map((_, i) => chain.get(i + 1)![0]!);
    for (let i = 1; i < sailed.length; i++) {
      expect({
        von: sailed[i]!.id,
        start: sailed[i]!.fromPlaceId,
      }).toEqual({ von: sailed[i]!.id, start: sailed[i - 1]!.toPlaceId });
    }
  });

  it.each(variants.map((v) => v.id))('legt %s vollständig landfrei', (variantId) => {
    const variant = variants.find((v) => v.id === variantId)!;
    const chain = sailedLegsByDay(
      variant.legIds.map((legId, i) => ({ day: i + 1, legIds: [legId], placeId: null })),
      legsById,
      allPlaces,
    );
    for (const [, dayLegs] of chain) {
      for (const leg of dayLegs) {
        expect(leg).toBeDefined();
        const points = pathOf(leg!);
        expect(points).not.toBeNull();
        expect(pathCrossesLand(points!)).toBe(false);
      }
    }
  });
});
