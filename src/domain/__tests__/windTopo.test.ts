/**
 * TOPOGRAFISCHE WINDKORREKTUR — und vor allem: die Asymmetrie.
 *
 * Der wichtigste Test dieser Datei ist der, der prüft, dass NICHTS passiert:
 * ein Windschatten darf `windKn` nie anfassen. Alles andere in diesem Modul
 * wäre reparierbar; ein Lee, das sich in eine Ampel schleicht, macht aus einer
 * roten Etappe eine grüne und schickt die Crew bei 26 kn raus.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { distanceNm } from '../geo.ts';
import { WindTopoZoneSchema, type WindTopoZone } from '../schema/windTopo.ts';
import { WindTopoStagingFileSchema } from '../schema/seeding.ts';
import type { LegAssessment } from '../schema/snapshot.ts';
import { applyWindTopo, leeHinweiseForStage, leeRueckwegSatz } from '../windTopo.ts';
import { constantForecast, makeLeg, makePlace, makeSnapshot, makeTimes } from './fixtures.ts';

const MITTE = { lat: 37.0, lon: 24.5 };
/** Rund 12 sm östlich — sicher ausserhalb jeder Zone dieser Tests. */
const WEIT_WEG = { lat: 37.0, lon: 24.75 };

function duese(over: Partial<WindTopoZone> = {}): WindTopoZone {
  return WindTopoZoneSchema.parse({
    id: 'topo-duese-test',
    name: 'Testdüse',
    kind: 'duese',
    center: MITTE,
    radiusNm: 5,
    sectors: [{ fromDeg: 340, toDeg: 40, factor: 1.3 }],
    sourceNote: 'fixture',
    kalibriertAus: 'fixture',
    confidence: 'niedrig',
    ...over,
  });
}

function lee(over: Partial<WindTopoZone> = {}): WindTopoZone {
  return WindTopoZoneSchema.parse({
    id: 'topo-lee-test',
    name: 'Testlee',
    kind: 'lee',
    center: MITTE,
    radiusNm: 5,
    sectors: [{ fromDeg: 340, toDeg: 40, factor: 0.5 }],
    fallboeenNm: 0.5,
    sourceNote: 'fixture',
    kalibriertAus: 'fixture',
    confidence: 'niedrig',
    ...over,
  });
}

/** Snapshot mit einem Platz in der Zone und einem weit ausserhalb. */
function snapshotMitZonen(zones: WindTopoZone[], windDirDeg = 10) {
  const times = makeTimes(1);
  return makeSnapshot({
    times,
    forecast: {
      drin: constantForecast(times.length, 20, windDirDeg),
      draussen: constantForecast(times.length, 20, windDirDeg),
    },
    library: {
      islands: [],
      places: [
        makePlace({ id: 'drin', coordinates: MITTE }),
        makePlace({ id: 'draussen', coordinates: WEIT_WEG }),
      ],
      invalidPlaces: [],
      legs: [],
      variants: [],
      windTopoZones: zones,
    },
  });
}

describe('applyWindTopo — die Düse bewertet', () => {
  it('lässt den Snapshot unangetastet, wenn es gar keine Zonen gibt', () => {
    const snap = snapshotMitZonen([]);
    const { snapshot, info } = applyWindTopo(snap);
    // Identität, nicht nur Gleichheit: ohne Kuration wird nichts kopiert und
    // nichts gerechnet — die Invariante "nie schlechter als vorher".
    expect(snapshot).toBe(snap);
    expect(info.note).toBeNull();
    expect(info.korrigierteStunden).toBe(0);
  });

  it('erhöht den Wind in der Zone und markiert die Stunde', () => {
    const { snapshot, info } = applyWindTopo(snapshotMitZonen([duese()]));
    expect(snapshot.forecast['drin']!.windKn[0]).toBeCloseTo(26, 6);
    expect(snapshot.forecast['drin']!.windAdjusted?.[0]).toBe(true);
    expect(info.korrigierteStunden).toBe(24);
    expect(info.angewandteZonen).toEqual(['Testdüse']);
    expect(info.note).toContain('Testdüse');
  });

  it('lässt Orte ausserhalb des Radius unberührt', () => {
    const { snapshot } = applyWindTopo(snapshotMitZonen([duese()]));
    expect(snapshot.forecast['draussen']!.windKn[0]).toBe(20);
    expect(snapshot.forecast['draussen']!.windAdjusted).toBeUndefined();
  });

  it('greift nur in ihrem Windsektor — Süd dreht die Düse ab', () => {
    const { snapshot, info } = applyWindTopo(snapshotMitZonen([duese()], 180));
    expect(snapshot.forecast['drin']!.windKn[0]).toBe(20);
    expect(info.korrigierteStunden).toBe(0);
    // Kein Zuschlag heisst auch: kein Satz, der einen behauptet.
    expect(info.note).toBeNull();
  });

  it('nimmt bei überlappenden Düsen den STÄRKEREN Faktor', () => {
    const { snapshot } = applyWindTopo(
      snapshotMitZonen([
        duese(),
        duese({ id: 'topo-duese-test2', name: 'Stärker', sectors: [{ fromDeg: 340, toDeg: 40, factor: 1.5 }] }),
      ]),
    );
    expect(snapshot.forecast['drin']!.windKn[0]).toBeCloseTo(30, 6);
  });

  it('fasst Stunden ohne Richtung oder ohne Stärke nicht an', () => {
    const times = makeTimes(1);
    const snap = makeSnapshot({
      times,
      forecast: { drin: constantForecast(times.length, null, null) },
      library: {
        islands: [],
        places: [makePlace({ id: 'drin', coordinates: MITTE })],
        invalidPlaces: [],
        legs: [],
        variants: [],
        windTopoZones: [duese()],
      },
    });
    const { snapshot, info } = applyWindTopo(snap);
    expect(snapshot.forecast['drin']!.windKn[0]).toBeNull();
    expect(info.korrigierteStunden).toBe(0);
  });
});

describe('applyWindTopo — der Schatten bewertet NICHT', () => {
  it('lässt windKn unangetastet, obwohl der Ort mitten im Lee liegt', () => {
    const { snapshot, info } = applyWindTopo(snapshotMitZonen([lee()]));
    expect(snapshot.forecast['drin']!.windKn[0]).toBe(20);
    expect(snapshot.forecast['drin']!.windAdjusted).toBeUndefined();
    expect(info.korrigierteStunden).toBe(0);
  });

  it('ändert auch dann nichts, wenn eine Düse daneben greift', () => {
    // Beide Zonen decken denselben Ort und denselben Sektor. Würde das Lee
    // mitgerechnet, käme 20 × 1,3 × 0,5 = 13 heraus — der Wert, der eine rote
    // Etappe grün machen würde.
    const { snapshot } = applyWindTopo(snapshotMitZonen([lee(), duese()]));
    expect(snapshot.forecast['drin']!.windKn[0]).toBeCloseTo(26, 6);
  });
});

describe('WindTopoZoneSchema — die Asymmetrie ist Schema, nicht Konvention', () => {
  const basis = {
    id: 'topo-x',
    name: 'X',
    center: MITTE,
    radiusNm: 4,
    sourceNote: 'q',
    kalibriertAus: 'q',
    confidence: 'niedrig' as const,
  };

  it('lehnt eine Lee-Zone ab, die den Wind erhöht', () => {
    const r = WindTopoZoneSchema.safeParse({
      ...basis,
      kind: 'lee',
      sectors: [{ fromDeg: 340, toDeg: 40, factor: 1.2 }],
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('abdecken');
  });

  it('lehnt eine Düsen-Zone ab, die den Wind senkt', () => {
    const r = WindTopoZoneSchema.safeParse({
      ...basis,
      kind: 'duese',
      sectors: [{ fromDeg: 340, toDeg: 40, factor: 0.8 }],
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('beschleunigen');
  });

  it('lehnt ein verrutschtes Komma ab (factor > 2)', () => {
    const r = WindTopoZoneSchema.safeParse({
      ...basis,
      kind: 'duese',
      sectors: [{ fromDeg: 340, toDeg: 40, factor: 13 }],
    });
    expect(r.success).toBe(false);
  });

  it('lehnt den Punkt-Sektor ab, der still zum Vollkreis würde', () => {
    const r = WindTopoZoneSchema.safeParse({
      ...basis,
      kind: 'duese',
      sectors: [{ fromDeg: 350, toDeg: 350, factor: 1.3 }],
    });
    expect(r.success).toBe(false);
  });

  it('lehnt Fallböen an einer Düse ab', () => {
    const r = WindTopoZoneSchema.safeParse({
      ...basis,
      kind: 'duese',
      sectors: [{ fromDeg: 340, toDeg: 40, factor: 1.3 }],
      fallboeenNm: 0.5,
    });
    expect(r.success).toBe(false);
  });

  it('verlangt das Präfix topo-', () => {
    const r = WindTopoZoneSchema.safeParse({
      ...basis,
      id: 'serifos-sued',
      kind: 'lee',
      sectors: [{ fromDeg: 340, toDeg: 40, factor: 0.5 }],
    });
    expect(r.success).toBe(false);
  });
});

describe('leeHinweiseForStage — der Schatten wird ein Satz', () => {
  const times = makeTimes(1);
  const leg = makeLeg({
    id: 'a--b',
    fromPlaceId: 'drin',
    toPlaceId: 'draussen',
    waypoints: [],
  });

  function legAssessment(over: Partial<LegAssessment> = {}): LegAssessment {
    return {
      legId: 'a--b',
      sailedLeg: leg,
      day: 1,
      ampel: 'gruen',
      sailHours: 3,
      motorHours: 0,
      totalHours: 3,
      avgTwsKn: 20,
      avgTwaDeg: 40,
      avgTwdDeg: 10,
      avgSpeedKn: 6,
      upwind: true,
      kreuzHours: 3,
      kreuzExtraNm: 4,
      wenden: 4,
      kreuzTrack: [],
      basis: 'forecast',
      reasons: [],
      nightLeg: false,
      arrivalHourAthens: 12,
      breakdown: [0, 1, 2].map((i) => ({
        timeIso: times[i]!,
        hours: 1,
        courseDeg: 340,
        twdDeg: 10,
        twsKn: 20,
        twaDeg: 30,
        speedKn: 5,
        motoring: false,
        kreuzen: true,
        sailedTwaDeg: 55,
        boatSpeedKn: 6,
        distanceNm: 5,
        worstCase: false,
      })),
      pointPassages: [],
      kursAbschnitte: [],
      ...over,
    };
  }

  function snap(zones: WindTopoZone[], windDirDeg = 10) {
    return makeSnapshot({
      times,
      forecast: {
        drin: constantForecast(times.length, 24, windDirDeg),
        draussen: constantForecast(times.length, 24, windDirDeg),
      },
      library: {
        islands: [],
        places: [
          makePlace({ id: 'drin', coordinates: MITTE }),
          makePlace({ id: 'draussen', coordinates: WEIT_WEG }),
        ],
        invalidPlaces: [],
        legs: [leg],
        variants: [],
        windTopoZones: zones,
      },
    });
  }

  it('nennt Modellwind, Lee-Wind und die Zahl der Stunden', () => {
    const [h] = leeHinweiseForStage(snap([lee()]), [legAssessment()]);
    expect(h).toBeDefined();
    expect(h!.modellKn).toBe(24);
    expect(h!.leeKn).toBeCloseTo(12, 6);
    expect(h!.stunden).toBe(3);
    expect(h!.legId).toBe('a--b');
  });

  it('sagt im Text dazu, dass er nichts bewertet — und warnt vor den Fallböen', () => {
    const [h] = leeHinweiseForStage(snap([lee()]), [legAssessment()]);
    expect(h!.text).toContain('BEWERTET NICHTS');
    expect(h!.text).toContain('24 kn');
    expect(h!.text).toContain('Fallböen');
  });

  it('schweigt, wenn der Wind nicht aus dem Sektor der Zone kommt', () => {
    expect(leeHinweiseForStage(snap([lee()], 180), [legAssessment()])).toEqual([]);
  });

  it('schweigt für eine Etappe, die nicht simuliert werden konnte', () => {
    expect(
      leeHinweiseForStage(snap([lee()]), [legAssessment({ sailedLeg: null, breakdown: [] })]),
    ).toEqual([]);
  });

  it('meldet Düsen NICHT als Lee-Hinweis — die stehen schon in der Ampel', () => {
    expect(leeHinweiseForStage(snap([duese()]), [legAssessment()])).toEqual([]);
  });
});

describe('leeRueckwegSatz', () => {
  const stage = (day: number, leeHinweise: { name: string; modellKn: number; leeKn: number }[]) =>
    ({
      day,
      leeHinweise: leeHinweise.map((h) => ({
        zoneId: 'topo-x',
        name: h.name,
        legId: 'a--b',
        modellKn: h.modellKn,
        leeKn: h.leeKn,
        windDirDeg: 10,
        stunden: 2,
        basis: 'forecast' as const,
        text: '',
      })),
    }) as never;

  it('zählt nur den RÜCKWEG — der Hinweg läuft raumschots, dort hilft kein Lee', () => {
    const satz = leeRueckwegSatz({
      turnDay: 5,
      stages: [stage(3, [{ name: 'Lee Hinweg', modellKn: 24, leeKn: 12 }])],
    } as never);
    expect(satz).toBeNull();
  });

  it('nennt Inseln und den grössten Gewinn', () => {
    const satz = leeRueckwegSatz({
      turnDay: 5,
      stages: [
        stage(7, [{ name: 'Lee Serifos (Sued)', modellKn: 24, leeKn: 12 }]),
        stage(8, [{ name: 'Lee Kythnos (Sued)', modellKn: 20, leeKn: 13 }]),
      ],
    } as never);
    expect(satz).toContain('Lee Serifos (Sued)');
    expect(satz).toContain('Lee Kythnos (Sued)');
    expect(satz).toContain('12 kn');
    expect(satz).toContain('keine Ampel');
  });
});

describe('seeding/data/windtopo.json', () => {
  it('erfüllt das Schema — inklusive der Asymmetrie-Regel', () => {
    const raw: unknown = JSON.parse(readFileSync('seeding/data/windtopo.json', 'utf8'));
    const parsed = WindTopoStagingFileSchema.safeParse(raw);
    expect(parsed.success, JSON.stringify(parsed.error?.issues, null, 2)).toBe(true);
  });

  it('nennt für jede Zone, woraus ihr Faktor kalibriert ist', () => {
    const raw = JSON.parse(readFileSync('seeding/data/windtopo.json', 'utf8')) as {
      zones: WindTopoZone[];
    };
    // Ein Faktor ohne seine Kalibrierung ist eine erfundene Zahl (AD-4/AD-10).
    for (const z of raw.zones) expect(z.kalibriertAus.length).toBeGreaterThan(20);
  });

  /**
   * KEINE WIRKUNGSLOSE ZONE. Bei der Erstkalibrierung lag die Serifos-Zone
   * zunächst so, dass sie KEINEN einzigen Forecast-Ort traf — die zentrale
   * Zone der ganzen Übung war stumm, und nichts hätte das gemeldet. Eine
   * kuratierte Zone, die nie greift, ist schlimmer als keine: sie sieht in der
   * Datei nach Abdeckung aus, die es nicht gibt.
   */
  it('lässt keine Zone stumm — jede trifft mindestens einen Forecast-Ort', () => {
    const zones = (
      JSON.parse(readFileSync('seeding/data/windtopo.json', 'utf8')) as {
        zones: WindTopoZone[];
      }
    ).zones;
    const legs = (
      JSON.parse(readFileSync('seeding/data/legs.json', 'utf8')) as {
        legs: { id: string; waypoints: { lat: number; lon: number }[] }[];
      }
    ).legs;
    const places = readdirSync('seeding/data/islands').flatMap(
      (f) =>
        (
          JSON.parse(readFileSync(`seeding/data/islands/${f}`, 'utf8')) as {
            places: { id: string; coordinates: { lat: number; lon: number } }[];
          }
        ).places,
    );

    const orte = [
      ...places.map((p) => ({ key: p.id, coordinates: p.coordinates })),
      ...legs.flatMap((l) =>
        l.waypoints.map((w, n) => ({ key: `leg:${l.id}:${n}`, coordinates: w })),
      ),
    ];

    const stumm = zones
      .filter((z) => !orte.some((o) => distanceNm(o.coordinates, z.center) <= z.radiusNm))
      .map((z) => z.id);
    expect(stumm, `Zonen ohne einen einzigen Forecast-Ort: ${stumm.join(', ')}`).toEqual([]);
  });

  /**
   * Und die Gegenprobe zur Asymmetrie AUF DEN ECHTEN DATEN: keine Düsen-Zone
   * darf über einem kuratierten Liegeplatz liegen. Sie würde dessen Nacht-Ampel
   * anfassen — und wie exponiert ein Hafen ist, sagt sein Schutzsektor
   * (shelter.ts), nicht eine Fläche, die für die offene Passage gedacht ist.
   */
  it('legt keine Düsen-Zone über einen Liegeplatz', () => {
    const zones = (
      JSON.parse(readFileSync('seeding/data/windtopo.json', 'utf8')) as {
        zones: WindTopoZone[];
      }
    ).zones.filter((z) => z.kind === 'duese');
    const places = readdirSync('seeding/data/islands').flatMap(
      (f) =>
        (
          JSON.parse(readFileSync(`seeding/data/islands/${f}`, 'utf8')) as {
            places: { id: string; coordinates: { lat: number; lon: number } }[];
          }
        ).places,
    );
    const treffer = zones.flatMap((z) =>
      places
        .filter((p) => distanceNm(p.coordinates, z.center) <= z.radiusNm)
        .map((p) => `${z.id} → ${p.id}`),
    );
    expect(treffer).toEqual([]);
  });
});
