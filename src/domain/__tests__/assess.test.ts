import { describe, expect, it } from 'vitest';
import { deriveCurrentIsland } from '../assess.ts';
import { makePlace, makeSnapshot } from './fixtures.ts';

function libSnapshot(overrides: Parameters<typeof makeSnapshot>[0] = {}) {
  const kea = makePlace({
    id: 'kea-vourkari',
    islandId: 'kea',
    coordinates: { lat: 37.66, lon: 24.32 },
  });
  const base = makePlace({
    id: 'athen-alimos',
    islandId: 'athen',
    coordinates: { lat: 37.91, lon: 23.7 },
  });
  return makeSnapshot({
    library: {
      islands: [
        { id: 'athen', name: 'Athen', coordinates: base.coordinates },
        { id: 'kea', name: 'Kea', coordinates: kea.coordinates },
      ],
      places: [base, kea],
      invalidPlaces: [],
      routes: [],
    },
    ...overrides,
  });
}

describe('deriveCurrentIsland — snap radius and visible reasons', () => {
  it('GPS fix near a library place snaps to its island', () => {
    const snapshot = libSnapshot();
    snapshot.trip.position = { source: 'gps', lat: 37.65, lon: 24.33 };
    const r = deriveCurrentIsland(snapshot);
    expect(r.islandId).toBe('kea');
    expect(r.note).toBeNull();
  });

  it('GPS fix beyond maxSnapNm (default 30) is NOT silently snapped: null island + reason', () => {
    const snapshot = libSnapshot();
    // Somewhere in central Turkey — hundreds of nm from every library place.
    snapshot.trip.position = { source: 'gps', lat: 39.0, lon: 33.0 };
    const r = deriveCurrentIsland(snapshot);
    expect(r.islandId).toBeNull();
    expect(r.note).toContain('sm');
  });

  it('maxSnapNm is a config parameter: a huge radius snaps the same distant fix', () => {
    const snapshot = libSnapshot();
    snapshot.params = { ...snapshot.params, maxSnapNm: 100000 };
    snapshot.trip.position = { source: 'gps', lat: 39.0, lon: 33.0 };
    expect(deriveCurrentIsland(snapshot).islandId).not.toBeNull();
  });

  it('no position on day 1: the boat is at the base', () => {
    const snapshot = libSnapshot();
    snapshot.trip.currentDay = 1;
    snapshot.trip.position = null;
    const r = deriveCurrentIsland(snapshot);
    expect(r.islandId).toBe('athen');
  });

  it('no position from day 2 on: null island with a clear "Keine Position" reason', () => {
    const snapshot = libSnapshot();
    snapshot.trip.currentDay = 2;
    snapshot.trip.position = null;
    const r = deriveCurrentIsland(snapshot);
    expect(r.islandId).toBeNull();
    expect(r.note).toContain('Keine Position');
  });

  it('a manual place selection wins over coordinates', () => {
    const snapshot = libSnapshot();
    snapshot.trip.position = {
      source: 'manual',
      lat: 0,
      lon: 0,
      placeId: 'kea-vourkari',
    };
    expect(deriveCurrentIsland(snapshot).islandId).toBe('kea');
  });
});
