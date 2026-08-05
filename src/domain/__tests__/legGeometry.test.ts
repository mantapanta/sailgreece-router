import { describe, expect, it } from 'vitest';
import { sailedLeg, sailedLegsByDay } from '../legGeometry.ts';
import { pathCrossesLand } from '../searoute.ts';
import type { Leg } from '../schema/route.ts';
import type { Place } from '../schema/place.ts';
import { makePlace } from './fixtures.ts';

/** Echte Reviergeometrie — die Fehler, um die es geht, sind ortsgebunden. */
const places: Place[] = [
  makePlace({
    id: 'paros-parikia',
    islandId: 'paros',
    coordinates: { lat: 37.0853, lon: 25.1519 },
  }),
  makePlace({
    id: 'paros-naoussa',
    islandId: 'paros',
    coordinates: { lat: 37.1236, lon: 25.2394 },
  }),
  makePlace({
    id: 'mykonos-ornos',
    islandId: 'mykonos',
    coordinates: { lat: 37.4142, lon: 25.3283 },
  }),
  makePlace({
    id: 'sifnos-kamares',
    islandId: 'sifnos',
    coordinates: { lat: 36.9903, lon: 24.6708 },
  }),
  makePlace({
    id: 'kea-vourkari',
    islandId: 'kea',
    coordinates: { lat: 37.6642, lon: 24.3181 },
  }),
  makePlace({
    id: 'syros-ermoupoli',
    islandId: 'syros',
    coordinates: { lat: 37.4436, lon: 24.9436 },
  }),
];

const leg = (over: Partial<Leg> & { id: string }): Leg => ({
  fromIslandId: 'a',
  toIslandId: 'b',
  fromPlaceId: 'x',
  toPlaceId: 'y',
  distanceNm: 20,
  waypoints: [],
  windWarnings: [],
  ...over,
});

const KEA_SYROS = leg({
  id: 'kea--syros',
  fromIslandId: 'kea',
  toIslandId: 'syros',
  fromPlaceId: 'kea-vourkari',
  toPlaceId: 'syros-ermoupoli',
  distanceNm: 34,
});

const MYKONOS_PAROS = leg({
  id: 'mykonos--paros',
  fromIslandId: 'mykonos',
  toIslandId: 'paros',
  fromPlaceId: 'mykonos-ornos',
  toPlaceId: 'paros-naoussa',
  distanceNm: 20,
});

const PAROS_SIFNOS = leg({
  id: 'paros--sifnos',
  fromIslandId: 'paros',
  toIslandId: 'sifnos',
  // Die Bibliothek speichert diese Etappe ab PARIKIA — der Grund für den Sprung.
  fromPlaceId: 'paros-parikia',
  toPlaceId: 'sifnos-kamares',
  distanceNm: 26,
});

const pathOf = (l: Leg): { lat: number; lon: number }[] => {
  const from = places.find((p) => p.id === l.fromPlaceId)!;
  const to = places.find((p) => p.id === l.toPlaceId)!;
  return [from.coordinates, ...l.waypoints, to.coordinates];
};

describe('sailedLeg — der Kurs liegt landfrei', () => {
  it('legt Wegpunkte um Syros, statt quer darüber', () => {
    const sailed = sailedLeg(KEA_SYROS, places);
    expect(sailed.waypoints.length).toBeGreaterThan(0);
    expect(pathCrossesLand(pathOf(sailed))).toBe(false);
  });

  it('lässt die kuratierte Distanz unangetastet, solange die Häfen stehen', () => {
    expect(sailedLeg(KEA_SYROS, places).distanceNm).toBe(34);
  });

  it('behält die kuratierten Wegpunkte und ergänzt nur', () => {
    const curated = leg({
      ...KEA_SYROS,
      waypoints: [{ lat: 37.55, lon: 24.62 }],
    });
    const sailed = sailedLeg(curated, places);
    expect(sailed.waypoints).toContainEqual({ lat: 37.55, lon: 24.62 });
  });
});

describe('sailedLeg — Verankerung an einem anderen Hafen derselben Insel', () => {
  it('startet, wo das Boot liegt', () => {
    const sailed = sailedLeg(PAROS_SIFNOS, places, { fromPlaceId: 'paros-naoussa' });
    expect(sailed.fromPlaceId).toBe('paros-naoussa');
    expect(pathCrossesLand(pathOf(sailed))).toBe(false);
  });

  it('skaliert die Distanz mit, wenn der Ankerpunkt sich verschiebt', () => {
    const sailed = sailedLeg(PAROS_SIFNOS, places, { fromPlaceId: 'paros-naoussa' });
    // Von Naoussa (Nordseite) ist der Weg nach Sifnos länger als von Parikia:
    // die kuratierte Kalibrierung bleibt, der Weg ist ein anderer.
    expect(sailed.distanceNm).toBeGreaterThan(26);
    expect(sailed.distanceNm).toBeLessThan(26 * 2);
  });

  it('ignoriert einen Ankerplatz auf einer FREMDEN Insel', () => {
    const sailed = sailedLeg(PAROS_SIFNOS, places, { fromPlaceId: 'mykonos-ornos' });
    expect(sailed.fromPlaceId).toBe('paros-parikia');
    expect(sailed.distanceNm).toBe(26);
  });

  it('lässt eine Etappe unverändert, deren Plätze die Bibliothek nicht kennt', () => {
    const orphan = leg({ id: 'nirgendwo--nirgendwo' });
    expect(sailedLeg(orphan, places)).toBe(orphan);
  });
});

describe('sailedLegsByDay — kein Tag beginnt, wo der vorige nicht endete', () => {
  const legsById = new Map<string, Leg>([
    [MYKONOS_PAROS.id, MYKONOS_PAROS],
    [PAROS_SIFNOS.id, PAROS_SIFNOS],
  ]);

  it('verkettet Tag 4 (Ende Naoussa) mit Tag 5 (Start laut Bibliothek: Parikia)', () => {
    const chain = sailedLegsByDay(
      [
        { day: 4, legIds: [MYKONOS_PAROS.id], placeId: null },
        { day: 5, legIds: [PAROS_SIFNOS.id], placeId: null },
      ],
      legsById,
      places,
    );
    const day4 = chain.get(4)!;
    const day5 = chain.get(5)!;
    expect(day4[0]!.toPlaceId).toBe('paros-naoussa');
    expect(day5[0]!.fromPlaceId).toBe('paros-naoussa');
  });

  it('nimmt den gewählten Liegeplatz als Endpunkt UND als nächsten Startpunkt', () => {
    const chain = sailedLegsByDay(
      [
        { day: 4, legIds: [MYKONOS_PAROS.id], placeId: 'paros-parikia' },
        { day: 5, legIds: [PAROS_SIFNOS.id], placeId: 'sifnos-kamares' },
      ],
      legsById,
      places,
    );
    expect(chain.get(4)![0]!.toPlaceId).toBe('paros-parikia');
    expect(chain.get(5)![0]!.fromPlaceId).toBe('paros-parikia');
  });

  it('trägt die Position über einen Hafentag hinweg', () => {
    const chain = sailedLegsByDay(
      [
        { day: 4, legIds: [MYKONOS_PAROS.id], placeId: 'paros-naoussa' },
        { day: 5, legIds: [], placeId: null },
        { day: 6, legIds: [PAROS_SIFNOS.id], placeId: null },
      ],
      legsById,
      places,
    );
    expect(chain.get(5)).toEqual([]);
    expect(chain.get(6)![0]!.fromPlaceId).toBe('paros-naoussa');
  });

  it('lässt einen Hafentag die Position verschieben, wenn dort ein Platz steht', () => {
    const chain = sailedLegsByDay(
      [
        { day: 4, legIds: [MYKONOS_PAROS.id], placeId: 'paros-naoussa' },
        { day: 5, legIds: [], placeId: 'paros-parikia' },
        { day: 6, legIds: [PAROS_SIFNOS.id], placeId: null },
      ],
      legsById,
      places,
    );
    expect(chain.get(6)![0]!.fromPlaceId).toBe('paros-parikia');
  });

  it('überspringt eine tote Referenz, ohne die Kette abzureissen', () => {
    const chain = sailedLegsByDay(
      [
        { day: 4, legIds: [MYKONOS_PAROS.id], placeId: 'paros-naoussa' },
        { day: 5, legIds: ['gibt--es-nicht'], placeId: null },
        { day: 6, legIds: [PAROS_SIFNOS.id], placeId: null },
      ],
      legsById,
      places,
    );
    expect(chain.get(5)).toEqual([undefined]);
    expect(chain.get(6)![0]!.fromPlaceId).toBe('paros-naoussa');
  });

  it('verankert bei einem Doppelschlag nur die LETZTE Etappe am Tagesziel', () => {
    const chain = sailedLegsByDay(
      [
        {
          day: 4,
          legIds: [MYKONOS_PAROS.id, PAROS_SIFNOS.id],
          placeId: 'sifnos-kamares',
        },
      ],
      legsById,
      places,
    );
    const day = chain.get(4)!;
    // Zwischenstopp bleibt der kuratierte Hafen, und die Folge-Etappe beginnt
    // genau dort — auch innerhalb eines Tages gibt es keinen Sprung.
    expect(day[0]!.toPlaceId).toBe('paros-naoussa');
    expect(day[1]!.fromPlaceId).toBe('paros-naoussa');
    expect(day[1]!.toPlaceId).toBe('sifnos-kamares');
  });
});
