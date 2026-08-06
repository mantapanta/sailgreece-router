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

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isOnLand, landCrossingNm, pathCrossesLand } from '../searoute.ts';
import { reverseLeg } from '../legs.ts';
import { sailedLegsByDay } from '../legGeometry.ts';
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

const places: Record<string, Coordinates> = (() => {
  const out: Record<string, Coordinates> = {};
  const islandFiles = [
    'athen',
    'attika',
    'kea',
    'kythnos',
    'serifos',
    'sifnos',
    'milos',
    'polyaigos',
    'folegandros',
    'santorin',
    'ios',
    'paros',
    'antiparos',
    'naxos',
    'amorgos',
    'syros',
    'mykonos',
  ];
  for (const island of islandFiles) {
    const doc = JSON.parse(
      readFileSync(path.join(dataDir, 'islands', `${island}.json`), 'utf8'),
    ) as { places?: { id: string; coordinates: Coordinates }[] };
    for (const place of doc.places ?? []) out[place.id] = place.coordinates;
  }
  return out;
})();

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
  const allPlaces: Place[] = Object.entries(places).map(([id, coordinates]) => ({
    id,
    islandId: id.split('-')[0]!,
    name: id,
    type: 'hafen',
    coordinates,
    qualities: { schoenheit: 3, restaurant: 3, badestrand: 3 },
    shelter: { windSectors: [], waveSectors: [], sourceNote: 'Geometrie-Test' },
  }));

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
