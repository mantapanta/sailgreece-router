/**
 * Die beiden Ebenen aus der JSON-Datei (adapters/firestore.ts, Modulkopf):
 * dass in den Dateien wirklich etwas steht, und was das Anlegen an die Plätze
 * macht — die Datei gewinnt, wo sie etwas sagt, und erfindet sonst nichts.
 *
 * Die Firestore-Abfrage selbst ist hier nicht im Spiel.
 */

import { describe, expect, it } from 'vitest';
import {
  freigegebeneStagingKiteSpots,
  freigegebeneStagingRestaurants,
  mitRestaurants,
} from '../firestore.ts';
import type { Place, Restaurant } from '../../domain/schema/index.ts';

const TAVERNE: Restaurant = {
  id: 'antiparos-lollos',
  name: 'Taverna Lollos',
  qualityRating: 4.7,
  signatureDishes: [],
  confidence: 'hoch',
  sources: ['Deep-Research Kykladen-Hafen-und-Gastro 2026-08-06'],
};

function platz(id: string, restaurants?: Restaurant[]): Place {
  return {
    id,
    islandId: 'antiparos',
    name: id,
    type: 'hafen',
    coordinates: { lat: 37.03, lon: 25.08 },
    qualities: { schoenheit: 4, restaurant: 4, badestrand: 3 },
    shelter: {
      windSectors: [{ fromDeg: 0, toDeg: 180, maxKn: 25 }],
      waveSectors: [{ fromDeg: 0, toDeg: 180, maxM: 1.2 }],
      sourceNote: 'Testfixtur',
    },
    ...(restaurants ? { restaurants } : {}),
  };
}

describe('mitRestaurants', () => {
  it('legt die Tavernen an den passenden Platz und zählt sie', () => {
    const places = [platz('antiparos-hafen'), platz('paros-naoussa')];
    const { places: next, ergaenzt } = mitRestaurants(
      places,
      new Map([['antiparos-hafen', [TAVERNE]]]),
    );
    expect(ergaenzt).toBe(1);
    expect(next[0]!.restaurants).toEqual([TAVERNE]);
    expect(next[1]!.restaurants).toBeUndefined();
  });

  it('erfindet nichts für einen Platz ohne Eintrag in der Datei', () => {
    const { places: next, ergaenzt } = mitRestaurants([platz('kea-vourkari')], new Map());
    expect(ergaenzt).toBe(0);
    expect(next[0]!.restaurants).toBeUndefined();
  });

  it('überschreibt nichts an einem Platz, den die Datei nicht kennt', () => {
    const konsolenStand: Restaurant = { ...TAVERNE, id: 'kea-notkorrektur' };
    const { places: next } = mitRestaurants([platz('kea-vourkari', [konsolenStand])], new Map());
    expect(next[0]!.restaurants).toEqual([konsolenStand]);
  });

  it('die Datei gewinnt, wo sie etwas sagt', () => {
    const alt: Restaurant = { ...TAVERNE, id: 'antiparos-alt', name: 'Alter Stand' };
    const { places: next } = mitRestaurants(
      [platz('antiparos-hafen', [alt])],
      new Map([['antiparos-hafen', [TAVERNE]]]),
    );
    expect(next[0]!.restaurants).toEqual([TAVERNE]);
  });

  it('lässt die Eingabe unberührt (neue Objekte)', () => {
    const places = [platz('antiparos-hafen')];
    mitRestaurants(places, new Map([['antiparos-hafen', [TAVERNE]]]));
    expect(places[0]!.restaurants).toBeUndefined();
  });
});

/**
 * Beide Ebenen stehen und fallen damit, dass in den Dateien wirklich etwas
 * steht: eine Quelle, die still nichts liefert, wäre genau der Fehler, den
 * dieser Weg beheben soll. Deshalb wird hier gegen die ECHTEN Dateien gelesen
 * — mit derselben Freigabe-Prüfung wie im Import.
 */
describe('Freigegebene Staging-Stände im Bundle', () => {
  it('trägt Kite-Spots', async () => {
    const spots = await freigegebeneStagingKiteSpots();
    expect(spots.length).toBeGreaterThan(0);
    expect(spots.every((s) => s.id.startsWith('kite-'))).toBe(true);
  });

  it('trägt Tavernen an Plätzen', async () => {
    const byPlaceId = await freigegebeneStagingRestaurants();
    expect(byPlaceId.size).toBeGreaterThan(0);
    for (const [placeId, restaurants] of byPlaceId) {
      expect(placeId).toMatch(/^[a-z0-9-]+$/);
      expect(restaurants.length).toBeGreaterThan(0);
    }
  });
});
