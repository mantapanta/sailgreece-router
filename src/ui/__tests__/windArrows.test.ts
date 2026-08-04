/**
 * Wind arrows are shown ONLY along the itinerary (FR3).
 * Arrows at bays the boat will not visit are noise — this fixture pins that
 * down, because the regression is invisible without a rendered map.
 */

import { describe, expect, it } from 'vitest';
import { itineraryWindPoints } from '../views/MapView.tsx';
import { legWaypointKey } from '../../domain/scoring.ts';
import type { Route } from '../../domain/schema/route.ts';
import {
  constantForecast,
  makeLeg,
  makePlace,
  makeSnapshot,
  makeTimes,
} from '../../domain/__tests__/fixtures.ts';

function scenario() {
  const alimos = makePlace({
    id: 'athen-alimos',
    islandId: 'athen',
    coordinates: { lat: 37.9, lon: 23.7 },
  });
  const vourkari = makePlace({
    id: 'kea-vourkari',
    islandId: 'kea',
    coordinates: { lat: 37.66, lon: 24.32 },
  });
  // A place the itinerary does NOT touch — must never carry an arrow.
  const santorin = makePlace({
    id: 'santorin-vlychada',
    islandId: 'santorin',
    coordinates: { lat: 36.35, lon: 25.44 },
  });

  const leg = makeLeg({
    id: 'athen--kea',
    fromIslandId: 'athen',
    toIslandId: 'kea',
    fromPlaceId: alimos.id,
    toPlaceId: vourkari.id,
    distanceNm: 36,
    waypoints: [{ lat: 37.75, lon: 24.05 }],
  });
  const route: Route = {
    id: 'kea-route',
    name: 'Kea',
    escalationRank: 1,
    isReturnChain: false,
    legs: [leg],
  };
  const times = makeTimes(3);
  const fc = constantForecast(times.length, 12, 20);
  const snapshot = makeSnapshot({
    times,
    forecast: {
      [alimos.id]: fc,
      [vourkari.id]: fc,
      [santorin.id]: fc,
      [legWaypointKey(leg.id, 0)]: fc,
    },
    library: {
      islands: [
        { id: 'athen', name: 'Athen', coordinates: alimos.coordinates },
        { id: 'kea', name: 'Kea', coordinates: vourkari.coordinates },
        { id: 'santorin', name: 'Santorin', coordinates: santorin.coordinates },
      ],
      places: [alimos, vourkari, santorin],
      invalidPlaces: [],
      routes: [route],
    },
  });
  return { snapshot, route, leg, santorin };
}

describe('itineraryWindPoints', () => {
  it('covers exactly the itinerary: start place, waypoints, destination place', () => {
    const { snapshot, route, leg } = scenario();
    const keys = itineraryWindPoints(route, snapshot).map((p) => p.key);
    expect(keys).toEqual([
      'athen-alimos',
      'kea-vourkari',
      legWaypointKey(leg.id, 0),
    ]);
  });

  it('omits places off the route — that was the noise on the briefing picture', () => {
    const { snapshot, route, santorin } = scenario();
    const keys = itineraryWindPoints(route, snapshot).map((p) => p.key);
    expect(keys).not.toContain(santorin.id);
    // Sanity: the place IS in the library, it is just not on the itinerary.
    expect(snapshot.library.places.map((p) => p.id)).toContain(santorin.id);
  });

  it('offsets place arrows northwards so they do not sit on the ampel pin', () => {
    const { snapshot, route } = scenario();
    const points = itineraryWindPoints(route, snapshot);
    const start = points.find((p) => p.key === 'athen-alimos')!;
    expect(start.position.lat).toBeCloseTo(37.9 + 0.045, 6);
    expect(start.position.lng).toBeCloseTo(23.7, 6);
    // Waypoints carry no offset — there is no pin underneath them.
    const wp = points.find((p) => p.key.startsWith('leg:'))!;
    expect(wp.position.lat).toBeCloseTo(37.75, 6);
  });

  it('no tracked route means no arrows at all', () => {
    const { snapshot } = scenario();
    expect(itineraryWindPoints(null, snapshot)).toEqual([]);
  });

  it('deduplicates places shared by consecutive legs', () => {
    const { snapshot, route } = scenario();
    const second = makeLeg({
      id: 'kea--kythnos',
      fromIslandId: 'kea',
      toIslandId: 'kea',
      fromPlaceId: 'kea-vourkari',
      toPlaceId: 'athen-alimos',
      distanceNm: 18,
      waypoints: [],
    });
    const twoLegs: Route = { ...route, legs: [...route.legs, second] };
    const keys = itineraryWindPoints(twoLegs, snapshot).map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
