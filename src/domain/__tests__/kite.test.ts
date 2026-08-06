/**
 * Kite-Spots (domain/kite.ts) — Referenzfälle.
 *
 * Geprüft wird, was die Anzeige tragen muss und was ein Datenfehler nie
 * verursachen darf: die Fenster-Auswertung (günstigste Stunde, gezählte
 * passende Stunden), die drei Bezugsarten (Ziel-Insel, Start-Insel, Korridor am
 * Kurs), die Korridor-Grenze — und dass ein Kite-Spot nichts bewertet.
 */

import { describe, expect, it } from 'vitest';
import { KiteSpotSchema, type KiteSpot } from '../schema/kite.ts';
import type { LegAssessment, PlanningSnapshot } from '../schema/snapshot.ts';
import { assessPlanning } from '../assess.ts';
import { kiteHinweiseForStage, kiteSpotsForDay } from '../kite.ts';
import { distanceToSegmentNm } from '../geo.ts';
import {
  TRIP_START,
  constantForecast,
  makeLeg,
  makePlace,
  makeSnapshot,
  makeTimes,
} from './fixtures.ts';
import KITE_JSON from '../../../seeding/data/kitespots.json' with { type: 'json' };
import { KiteSpotsStagingFileSchema } from '../schema/seeding.ts';

/** Spot-Fixture: N–NE, Flachwasser, Bezugsplatz 'start-hafen'. */
function makeSpot(over: Partial<KiteSpot> & { id: string }): KiteSpot {
  return {
    name: over.id,
    islandId: 'startinsel',
    coordinates: { lat: 37.4, lon: 24.5 },
    windSectors: [{ fromDeg: 340, toDeg: 60 }],
    water: 'flachwasser',
    launch: ['strand'],
    level: 'einsteiger',
    refPlaceId: 'start-hafen',
    accessInfo: 'fixture',
    hazards: [],
    confidence: 'mittel',
    sources: ['fixture'],
    ...over,
  };
}

/**
 * Nord-Süd-Etappe mit zwei Plätzen, dazu ein Wind, der stundenweise gesetzt
 * werden kann. `windByHourOfDay` gilt für JEDEN Tag der Achse (Athen-Stunden
 * sind im August UTC+3, das Kite-Fenster 12–19 Athen liegt also auf UTC 9–16).
 */
function scenario(opts: {
  spots: KiteSpot[];
  windKn: number;
  windDirDeg: number;
  /** Stundenweise Überschreibung, Index = UTC-Stunde des Tages. */
  windByUtcHour?: Record<number, { kn: number; dir: number }>;
}): { snapshot: PlanningSnapshot; legs: LegAssessment[] } {
  const north = makePlace({
    id: 'start-hafen',
    islandId: 'startinsel',
    coordinates: { lat: 37.4, lon: 24.5 },
  });
  const south = makePlace({
    id: 'ziel-bucht',
    islandId: 'zielinsel',
    coordinates: { lat: 37.0, lon: 24.5 },
  });
  const times = makeTimes();
  const fc = constantForecast(times.length, opts.windKn, opts.windDirDeg);
  for (const [h, v] of Object.entries(opts.windByUtcHour ?? {})) {
    for (let i = Number(h); i < times.length; i += 24) {
      fc.windKn[i] = v.kn;
      fc.windDirDeg[i] = v.dir;
    }
  }
  const leg = makeLeg({
    fromPlaceId: north.id,
    toPlaceId: south.id,
    fromIslandId: 'startinsel',
    toIslandId: 'zielinsel',
  });
  const snapshot = makeSnapshot({
    times,
    forecast: { [north.id]: fc, [south.id]: fc },
    library: {
      islands: [
        { id: 'startinsel', name: 'Startinsel', coordinates: north.coordinates },
        { id: 'zielinsel', name: 'Zielinsel', coordinates: south.coordinates },
      ],
      places: [north, south],
      invalidPlaces: [],
      legs: [leg],
      variants: [],
      kiteSpots: opts.spots,
    },
  });
  // Nur die Felder, die kite.ts liest — eine volle Bewertung wäre hier Beiwerk.
  const legs = [{ sailedLeg: leg } as LegAssessment];
  return { snapshot, legs };
}

describe('Kite-Fenster — die GÜNSTIGSTE Stunde trägt das Urteil', () => {
  it('meldet "passt" mit der Zahl der passenden Stunden', () => {
    const { snapshot, legs } = scenario({
      spots: [makeSpot({ id: 'kite-a', name: 'Spot A' })],
      windKn: 18,
      windDirDeg: 20,
    });
    const [h] = kiteHinweiseForStage(snapshot, 1, 'startinsel', 'zielinsel', legs);
    expect(h!.eignung).toBe('passt');
    // Fenster 12–19 Uhr Athen = 7 Stunden, alle im Band.
    expect(h!.passendeStunden).toBe(7);
    expect(h!.text).toContain('passt');
    expect(h!.text).toContain('7 h');
  });

  it('eine passende Stunde im zu starken Tag setzt "passt" (Session sucht man sich aus)', () => {
    const { snapshot, legs } = scenario({
      spots: [makeSpot({ id: 'kite-a' })],
      windKn: 40, // ganzer Tag über kiteMaxKn
      windDirDeg: 20,
      windByUtcHour: { 15: { kn: 20, dir: 20 } }, // 18 Uhr Athen im Band
    });
    const [h] = kiteHinweiseForStage(snapshot, 1, 'startinsel', 'zielinsel', legs);
    expect(h!.eignung).toBe('passt');
    expect(h!.passendeStunden).toBe(1);
    expect(h!.windKn).toBe(20);
  });

  it('zu viel Wind bei richtiger Richtung heisst "stark" und nennt die Obergrenze', () => {
    const { snapshot, legs } = scenario({
      spots: [makeSpot({ id: 'kite-a' })],
      windKn: 40,
      windDirDeg: 20,
    });
    const [h] = kiteHinweiseForStage(snapshot, 1, 'startinsel', 'zielinsel', legs);
    expect(h!.eignung).toBe('stark');
    expect(h!.passendeStunden).toBe(0);
    expect(h!.text).toContain('Obergrenze');
    expect(h!.text).toContain(String(snapshot.params.kiteMaxKn));
  });

  it('zu wenig Wind heisst "wenig-wind"', () => {
    const { snapshot, legs } = scenario({
      spots: [makeSpot({ id: 'kite-a' })],
      windKn: 6,
      windDirDeg: 20,
    });
    const [h] = kiteHinweiseForStage(snapshot, 1, 'startinsel', 'zielinsel', legs);
    expect(h!.eignung).toBe('wenig-wind');
  });

  it('Wind ausserhalb des Sektors heisst "richtung" — auch bei perfekter Stärke', () => {
    const { snapshot, legs } = scenario({
      spots: [makeSpot({ id: 'kite-a' })],
      windKn: 18,
      windDirDeg: 190, // Süd, der Spot braucht N–NE
    });
    const [h] = kiteHinweiseForStage(snapshot, 1, 'startinsel', 'zielinsel', legs);
    expect(h!.eignung).toBe('richtung');
    expect(h!.text).toContain('braucht');
  });

  it('ohne Forecast am Bezugsplatz bleibt der Spot unbewertet — nie "passt"', () => {
    const { snapshot, legs } = scenario({
      spots: [makeSpot({ id: 'kite-a', refPlaceId: 'gibt-es-nicht' })],
      windKn: 18,
      windDirDeg: 20,
    });
    const [h] = kiteHinweiseForStage(snapshot, 1, 'startinsel', 'zielinsel', legs);
    expect(h!.eignung).toBe('unbewertet');
    expect(h!.windKn).toBeNull();
  });

  it('Wrap über Nord: 350° liegt im Sektor 340–60', () => {
    const { snapshot, legs } = scenario({
      spots: [makeSpot({ id: 'kite-a' })],
      windKn: 18,
      windDirDeg: 350,
    });
    const [h] = kiteHinweiseForStage(snapshot, 1, 'startinsel', 'zielinsel', legs);
    expect(h!.eignung).toBe('passt');
  });
});

describe('Bezug — wie ein Spot an die Etappe kommt', () => {
  it('Ziel-Insel schlägt Korridor, auch wenn der Spot dicht am Kurs liegt', () => {
    const { snapshot, legs } = scenario({
      spots: [
        makeSpot({
          id: 'kite-ziel',
          islandId: 'zielinsel',
          coordinates: { lat: 37.0, lon: 24.51 },
        }),
      ],
      windKn: 18,
      windDirDeg: 20,
    });
    const [h] = kiteHinweiseForStage(snapshot, 1, 'startinsel', 'zielinsel', legs);
    expect(h!.bezug).toBe('ziel');
    expect(h!.abstandNm).toBeNull();
  });

  it('Start-Insel wird als solche benannt', () => {
    const { snapshot, legs } = scenario({
      spots: [makeSpot({ id: 'kite-start', islandId: 'startinsel' })],
      windKn: 18,
      windDirDeg: 20,
    });
    const [h] = kiteHinweiseForStage(snapshot, 1, 'startinsel', 'zielinsel', legs);
    expect(h!.bezug).toBe('start');
  });

  it('ein Spot auf einer FREMDEN Insel nahe am Kurs kommt als "strecke" mit Abstand', () => {
    const { snapshot, legs } = scenario({
      spots: [
        makeSpot({
          id: 'kite-unterwegs',
          islandId: 'dritte-insel',
          // 37.2 liegt mitten auf der Strecke, ~1,6 sm östlich davon.
          coordinates: { lat: 37.2, lon: 24.533 },
        }),
      ],
      windKn: 18,
      windDirDeg: 20,
    });
    const [h] = kiteHinweiseForStage(snapshot, 1, 'startinsel', 'zielinsel', legs);
    expect(h!.bezug).toBe('strecke');
    expect(h!.abstandNm).toBeGreaterThan(1);
    expect(h!.abstandNm).toBeLessThan(2);
    expect(h!.text).toContain('neben dem Kurs');
  });

  it('jenseits des Korridors fällt der Spot ganz weg (kein Hinweis ins Leere)', () => {
    const { snapshot, legs } = scenario({
      spots: [
        makeSpot({
          id: 'kite-weit-weg',
          islandId: 'dritte-insel',
          coordinates: { lat: 37.2, lon: 24.9 }, // ~19 sm neben dem Kurs
        }),
      ],
      windKn: 18,
      windDirDeg: 20,
    });
    expect(kiteHinweiseForStage(snapshot, 1, 'startinsel', 'zielinsel', legs)).toEqual([]);
  });

  it('ein Spot HINTER dem Ziel liegt nicht am Kurs (Klemmung des Querab-Abstands)', () => {
    const { snapshot, legs } = scenario({
      spots: [
        makeSpot({
          id: 'kite-dahinter',
          islandId: 'dritte-insel',
          // Auf der verlängerten Linie, 30 sm südlich des Ziels.
          coordinates: { lat: 36.5, lon: 24.5 },
        }),
      ],
      windKn: 18,
      windDirDeg: 20,
    });
    expect(kiteHinweiseForStage(snapshot, 1, 'startinsel', 'zielinsel', legs)).toEqual([]);
  });

  it('am Hafentag (ohne Ausgangsinsel und ohne Etappe) bleibt die Insel selbst', () => {
    const { snapshot } = scenario({
      spots: [makeSpot({ id: 'kite-ziel', islandId: 'zielinsel' })],
      windKn: 18,
      windDirDeg: 20,
    });
    const hinweise = kiteHinweiseForStage(snapshot, 1, null, 'zielinsel', []);
    expect(hinweise).toHaveLength(1);
    expect(hinweise[0]!.bezug).toBe('ziel');
  });

  it('sortiert Passendes nach vorn', () => {
    const { snapshot, legs } = scenario({
      spots: [
        makeSpot({ id: 'kite-falsche-richtung', windSectors: [{ fromDeg: 180, toDeg: 260 }] }),
        makeSpot({ id: 'kite-passt' }),
      ],
      windKn: 18,
      windDirDeg: 20,
    });
    const hinweise = kiteHinweiseForStage(snapshot, 1, 'startinsel', 'zielinsel', legs);
    expect(hinweise.map((h) => h.spotId)).toEqual(['kite-passt', 'kite-falsche-richtung']);
  });
});

describe('Revier-Sicht der Karte', () => {
  it('bewertet JEDEN Spot, unabhängig von Plan und Etappe', () => {
    const { snapshot } = scenario({
      spots: [
        makeSpot({ id: 'kite-a' }),
        makeSpot({ id: 'kite-b', islandId: 'ganz-woanders' }),
      ],
      windKn: 18,
      windDirDeg: 20,
    });
    const tags = kiteSpotsForDay(snapshot, 1);
    expect(tags.map((t) => t.spotId)).toEqual(['kite-a', 'kite-b']);
    expect(tags.every((t) => t.eignung === 'passt')).toBe(true);
    // Revier-Sicht nennt die Insel, nicht "Ziel-Insel" — es gibt keine Etappe.
    expect(tags[0]!.text).toContain('Startinsel');
  });

  it('ohne Kite-Bibliothek ist die Liste leer statt undefined', () => {
    expect(kiteSpotsForDay(makeSnapshot(), 1)).toEqual([]);
  });
});

describe('Kite-Spots bewerten NICHTS', () => {
  it('dieselbe Lage mit und ohne Kite-Bibliothek ergibt dieselben Ampeln', () => {
    const place = makePlace({
      id: 'insel-bucht',
      islandId: 'insel',
      coordinates: { lat: 37.4, lon: 24.5 },
    });
    const times = makeTimes();
    const base = makeSnapshot({
      times,
      forecast: { [place.id]: constantForecast(times.length, 18, 20) },
      library: {
        islands: [{ id: 'insel', name: 'Insel', coordinates: place.coordinates }],
        places: [place],
        invalidPlaces: [],
        legs: [],
        variants: [],
      },
      params: {
        ...makeSnapshot().params,
        baseIslandId: 'insel',
        basePlaceId: place.id,
      },
    });
    const ohne = assessPlanning(base);
    const mit = assessPlanning({
      ...base,
      library: {
        ...base.library,
        kiteSpots: [makeSpot({ id: 'kite-a', islandId: 'insel', refPlaceId: place.id })],
      },
    });
    expect(mit.nightAmpeln).toEqual(ohne.nightAmpeln);
    expect(mit.restTripAmpel).toBe(ohne.restTripAmpel);
    expect(mit.routeOptions).toEqual(ohne.routeOptions);
    // Und die Ebene ist trotzdem da.
    expect(mit.kiteSpotsHeute).toHaveLength(1);
    expect(ohne.kiteSpotsHeute).toEqual([]);
  });
});

describe('Querab-Abstand (geo.distanceToSegmentNm)', () => {
  const a = { lat: 37.4, lon: 24.5 };
  const b = { lat: 37.0, lon: 24.5 };

  it('misst quer zur Strecke, wenn der Fusspunkt dazwischen liegt', () => {
    const d = distanceToSegmentNm({ lat: 37.2, lon: 24.6 }, a, b);
    // 0,1° Länge auf 37,2° N ≈ 4,8 sm.
    expect(d).toBeGreaterThan(4.5);
    expect(d).toBeLessThan(5.1);
  });

  it('klemmt am Anfang: ein Punkt vor dem Start misst zum Start', () => {
    const p = { lat: 37.8, lon: 24.5 };
    expect(distanceToSegmentNm(p, a, b)).toBeCloseTo(24, 0);
  });

  it('klemmt am Ende: ein Punkt hinter dem Ziel misst zum Ziel', () => {
    const p = { lat: 36.5, lon: 24.5 };
    expect(distanceToSegmentNm(p, a, b)).toBeCloseTo(30, 0);
  });

  it('ein entartetes Segment (gleiche Enden) liefert den Punktabstand', () => {
    expect(distanceToSegmentNm({ lat: 37.4, lon: 24.5 }, a, a)).toBe(0);
  });
});

describe('kitespots.json — die kuratierte Bibliothek selbst', () => {
  const parsed = KiteSpotsStagingFileSchema.safeParse(KITE_JSON);

  it('erfüllt das Schema', () => {
    if (!parsed.success) console.error(parsed.error.issues);
    expect(parsed.success).toBe(true);
  });

  it('trägt eindeutige Ids mit kite-Präfix', () => {
    const ids = (parsed.success ? parsed.data.kiteSpots : []).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(KiteSpotSchema.shape.id.safeParse(id).success).toBe(true);
  });

  it('referenziert nur existierende Inseln und Plätze der Staging-Bibliothek', async () => {
    // Dieselbe Prüfung, die der Import erzwingt (seeding/importToFirestore.ts) —
    // hier als Test, damit ein Tippfehler nicht erst beim Import auffällt.
    const { readFileSync, globSync } = await import('node:fs');
    const islandIds = new Set<string>();
    const placeIds = new Set<string>();
    for (const f of globSync('seeding/data/islands/*.json')) {
      const data = JSON.parse(readFileSync(f, 'utf8'));
      islandIds.add(data.island.id);
      for (const p of data.places ?? []) placeIds.add(p.id);
    }
    for (const spot of parsed.success ? parsed.data.kiteSpots : []) {
      expect(islandIds, `Insel von ${spot.id}`).toContain(spot.islandId);
      expect(placeIds, `Bezugsplatz von ${spot.id}`).toContain(spot.refPlaceId);
    }
  });

  it('ist nicht freigegeben — Revierwissen ohne Quellenbeleg (siehe sourceNote)', () => {
    expect(parsed.success && parsed.data.approved).toBe(false);
  });
});

describe('Kite-Parameter', () => {
  it('das Kite-Fenster liegt im Nachmittags-Meltemi', () => {
    const { params } = makeSnapshot();
    expect(params.kiteFensterStartHourAthens).toBeLessThan(13);
    expect(params.kiteFensterEndeHourAthens).toBeGreaterThan(17);
    expect(TRIP_START).toBe('2026-08-08'); // Fixture-Anker der Fensterrechnung
  });
});
