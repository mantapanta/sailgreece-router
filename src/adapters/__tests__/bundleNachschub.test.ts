/**
 * Der Nachschub aus dem Bundle (adapters/firestore.ts, Modulkopf): WANN eine
 * Ebene als fehlend gilt und was das Auffüllen mit den Plätzen macht.
 *
 * Die Firestore-Abfrage selbst ist hier nicht im Spiel — geprüft werden die
 * drei reinen Entscheidungen, an denen die Regel hängt: ganz fehlend statt
 * halb, nie überschreiben, nie erfinden.
 */

import { describe, expect, it } from 'vitest';
import {
  freigegebeneStagingKiteSpots,
  freigegebeneStagingRestaurants,
  gastroEbeneFehlt,
  kiteEbeneFehlt,
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

describe('kiteEbeneFehlt', () => {
  it('meldet die leere Sammlung als fehlende Ebene', () => {
    expect(kiteEbeneFehlt([])).toBe(true);
  });

  it('meldet eine geladene Sammlung nicht als fehlend', () => {
    expect(kiteEbeneFehlt([{ id: 'kite-naxos-mikri-vigla' } as never])).toBe(false);
  });
});

describe('gastroEbeneFehlt', () => {
  it('fehlt, wenn kein einziger Platz Tavernen trägt', () => {
    expect(gastroEbeneFehlt([platz('a'), platz('b')])).toBe(true);
  });

  it('fehlt NICHT, sobald ein Platz Tavernen trägt — der Rest ist dann eine echte Lücke', () => {
    expect(gastroEbeneFehlt([platz('a'), platz('b', [TAVERNE])])).toBe(false);
  });

  it('behandelt einen leeren Gastro-Block wie keinen', () => {
    expect(gastroEbeneFehlt([platz('a', [])])).toBe(true);
  });
});

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

  it('erfindet nichts für einen Platz ohne Eintrag im Bundle', () => {
    const { places: next, ergaenzt } = mitRestaurants([platz('kea-vourkari')], new Map());
    expect(ergaenzt).toBe(0);
    expect(next[0]!.restaurants).toBeUndefined();
  });

  it('lässt die Eingabe unberührt (neue Objekte)', () => {
    const places = [platz('antiparos-hafen')];
    mitRestaurants(places, new Map([['antiparos-hafen', [TAVERNE]]]));
    expect(places[0]!.restaurants).toBeUndefined();
  });
});

/**
 * Der Nachschub steht und fällt damit, dass im Bundle wirklich etwas liegt:
 * ein Ersatz, der still nichts liefert, wäre genau der Fehler, den er beheben
 * soll. Deshalb wird hier gegen die ECHTEN Staging-Dateien gelesen — dieselbe
 * Freigabe-Prüfung wie im Import.
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
