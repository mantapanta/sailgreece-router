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
import {
  WindTopoDueseZoneSchema,
  WindTopoLeeZoneSchema,
  WindTopoZoneSchema,
  type WindTopoDueseZone,
  type WindTopoLeeZone,
  type WindTopoZone,
} from '../schema/windTopo.ts';
import { WindTopoStagingFileSchema } from '../schema/seeding.ts';
import type { LegAssessment } from '../schema/snapshot.ts';
import {
  applyWindTopo,
  leeAnsatzAt,
  leeBewertungsKn,
  leeHinweiseForStage,
  leeRueckwegSatz,
} from '../windTopo.ts';
import { assessLeg } from '../scoring.ts';
import { placeNightAmpel } from '../ampel.ts';
import {
  constantForecast,
  makeLeg,
  makePlace,
  makeSnapshot,
  makeTimes,
  TEST_POLAR,
} from './fixtures.ts';

const MITTE = { lat: 37.0, lon: 24.5 };
/** Rund 12 sm östlich — sicher ausserhalb jeder Zone dieser Tests. */
const WEIT_WEG = { lat: 37.0, lon: 24.75 };

function duese(over: Record<string, unknown> = {}): WindTopoDueseZone {
  return WindTopoDueseZoneSchema.parse({
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

/**
 * Die Testinsel liegt bei MITTE und wirft eine 10-sm-Keule nach Lee. Bei Wind
 * aus 010 Grad liegt der Schatten also SUEDLICH von MITTE — das ist die
 * Geometrie, die alle Faelle hier abklopfen.
 */
function lee(over: Record<string, unknown> = {}): WindTopoLeeZone {
  return WindTopoLeeZoneSchema.parse({
    id: 'topo-lee-test',
    name: 'Testlee',
    kind: 'lee',
    center: MITTE,
    obstacleRadiusNm: 3,
    lobeNm: 10,
    factor: 0.5,
    fallboeenNm: 0.5,
    sourceNote: 'fixture',
    kalibriertAus: 'fixture',
    confidence: 'niedrig',
    ...over,
  });
}

/** 6 sm suedlich von MITTE — bei Nordwind mitten in der Keule. */
const IM_LEE_SUED = { lat: 36.9, lon: 24.5 };
/** 6 sm noerdlich von MITTE — bei Nordwind in LUV, also nie im Schatten. */
const IN_LUV_NORD = { lat: 37.1, lon: 24.5 };

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

describe('WindTopoZoneSchema — die Asymmetrie ist GESTALT, nicht nur Prüfung', () => {
  const gemeinsam = {
    id: 'topo-x',
    name: 'X',
    center: MITTE,
    sourceNote: 'q',
    kalibriertAus: 'q',
    confidence: 'niedrig' as const,
  };
  const leeForm = { ...gemeinsam, kind: 'lee', obstacleRadiusNm: 3, lobeNm: 10 };
  const dueseForm = { ...gemeinsam, kind: 'duese', radiusNm: 4 };

  /**
   * Seit die beiden Arten getrennte Typen sind, ist eine Lee-Zone mit
   * factor > 1 nicht mehr bloss verboten, sondern nicht hinschreibbar: das Feld
   * selbst ist `gt(0).lt(1)`.
   */
  it('lehnt eine Lee-Zone ab, die den Wind erhöht', () => {
    expect(WindTopoZoneSchema.safeParse({ ...leeForm, factor: 1.2 }).success).toBe(false);
  });

  it('lehnt eine Düsen-Zone ab, die den Wind senkt', () => {
    const r = WindTopoZoneSchema.safeParse({
      ...dueseForm,
      sectors: [{ fromDeg: 340, toDeg: 40, factor: 0.8 }],
    });
    expect(r.success).toBe(false);
  });

  it('lehnt ein verrutschtes Komma ab (factor > 2)', () => {
    const r = WindTopoZoneSchema.safeParse({
      ...dueseForm,
      sectors: [{ fromDeg: 340, toDeg: 40, factor: 13 }],
    });
    expect(r.success).toBe(false);
  });

  it('lehnt den Punkt-Sektor ab, der still zum Vollkreis würde', () => {
    const r = WindTopoZoneSchema.safeParse({
      ...dueseForm,
      sectors: [{ fromDeg: 350, toDeg: 350, factor: 1.3 }],
    });
    expect(r.success).toBe(false);
  });

  /**
   * Die Felder sind nicht mehr mischbar: eine Lee-Zone hat keine `sectors`, eine
   * Düse keine Keule. Der Schatten dreht mit dem Wind (Geometrie), die Düse
   * nicht (Sektoren) — wer beides mischt, hat eines von beiden missverstanden.
   */
  it('lässt eine Lee-Zone ohne Keulenmasse nicht durch', () => {
    const { obstacleRadiusNm: _o, lobeNm: _l, ...ohne } = leeForm;
    expect(WindTopoZoneSchema.safeParse({ ...ohne, factor: 0.5 }).success).toBe(false);
  });

  it('lässt eine Düse ohne Sektoren nicht durch', () => {
    expect(WindTopoZoneSchema.safeParse(dueseForm).success).toBe(false);
  });

  it('verlangt das Präfix topo-', () => {
    const r = WindTopoZoneSchema.safeParse({ ...leeForm, id: 'serifos-sued', factor: 0.5 });
    expect(r.success).toBe(false);
  });
});

/**
 * DIE KEULE DREHT MIT DEM WIND — der Grund, warum die Sektor-Fassung ersetzt
 * wurde. Die Poseidon-Bilder vom 10.08. zeigen den Schatten bei NNW-Wind SSE der
 * Insel und bei NE-Wind SW davon; ein fest im Süden platzierter Kreis traf die
 * zweite Lage gar nicht und hätte die Absenkung dort angesetzt, wo kein Schatten
 * steht.
 */
describe('leeAnsatzAt — die Keule steht hinter der Insel', () => {
  const zone = lee({ confidence: 'mittel' });

  it('deckt bei Nordwind den Ort im Süden, nicht den im Norden', () => {
    expect(leeAnsatzAt([zone], IM_LEE_SUED, 10)).not.toBeNull();
    expect(leeAnsatzAt([zone], IN_LUV_NORD, 10)).toBeNull();
  });

  it('dreht mit: bei Südwind ist es genau umgekehrt', () => {
    expect(leeAnsatzAt([zone], IN_LUV_NORD, 190)).not.toBeNull();
    expect(leeAnsatzAt([zone], IM_LEE_SUED, 190)).toBeNull();
  });

  it('lässt den Schatten mit der Entfernung auslaufen', () => {
    // 6 sm südlich: 3 sm hinter der Leeküste, also 30 % der 10-sm-Keule.
    const nah = leeAnsatzAt([zone], IM_LEE_SUED, 10);
    // 12 sm südlich: 9 sm hinter der Küste, fast am Keulenende.
    const fern = leeAnsatzAt([zone], { lat: 36.8, lon: 24.5 }, 10);
    expect(nah!.factor).toBeCloseTo(0.5 + 0.5 * 0.3, 1);
    expect(fern!.factor).toBeGreaterThan(nah!.factor);
    expect(fern!.factor).toBeLessThan(1);
  });

  it('endet hinter der Keule', () => {
    // 24 sm südlich — 21 sm hinter der Küste, weit jenseits der 10-sm-Keule.
    expect(leeAnsatzAt([zone], { lat: 36.6, lon: 24.5 }, 10)).toBeNull();
  });

  it('greift nicht seitlich neben der Insel', () => {
    // 6 sm südlich, aber 6 sm westlich versetzt — quer weiter als das Hindernis.
    expect(leeAnsatzAt([zone], { lat: 36.9, lon: 24.375 }, 10)).toBeNull();
  });

  /**
   * Zwei Schatten übereinander werden NICHT multipliziert: das würde den Wind
   * rechnerisch fast auslöschen, und diese Behauptung hat niemand nachgemessen.
   */
  it('stapelt überlappende Lee-Zonen nicht, sondern nimmt die vorsichtigere', () => {
    const zweite = lee({ id: 'topo-lee-test2', factor: 0.3, confidence: 'mittel' });
    const beide = leeAnsatzAt([zone, zweite], IM_LEE_SUED, 10);
    const einzeln = leeAnsatzAt([zone], IM_LEE_SUED, 10);
    expect(beide!.factor).toBeCloseTo(einzeln!.factor, 6);
  });
});

describe('leeHinweiseForStage — der Schatten wird ein Satz', () => {
  const times = makeTimes(1);
  /**
   * Die Etappe läuft von IN_LUV_NORD nach IM_LEE_SUED, die schattenwerfende
   * Insel steht bei MITTE dazwischen: bei Wind aus 010 Grad liegt der Zielpunkt
   * 3 sm hinter ihrer Leeküste, der Startpunkt in Luv. Genau ein Punkt im
   * Schatten — mehr braucht der Hinweis nicht.
   */
  const leg = makeLeg({
    id: 'a--b',
    fromPlaceId: 'luv',
    toPlaceId: 'lee',
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
      headroom: { windKn: null, hours: 3 },
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
        luv: constantForecast(times.length, 24, windDirDeg),
        lee: constantForecast(times.length, 24, windDirDeg),
      },
      library: {
        islands: [],
        places: [
          makePlace({ id: 'luv', coordinates: IN_LUV_NORD }),
          makePlace({ id: 'lee', coordinates: IM_LEE_SUED }),
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
    // 3 sm hinter der Leeküste einer 10-sm-Keule: der Faktor ist schon auf
    // 0,5 + 0,5 × 0,3 ≈ 0,65 ausgelaufen — 24 × 0,65 ≈ 15,5 kn.
    expect(h!.leeKn).toBeCloseTo(15.5, 1);
    expect(h!.stunden).toBe(3);
    expect(h!.legId).toBe('a--b');
  });

  it('sagt bei niedrigem Vertrauen, dass er nichts bewertet — und warnt vor den Fallböen', () => {
    const [h] = leeHinweiseForStage(snap([lee()]), [legAssessment()]);
    expect(h!.bewertet).toBe(false);
    expect(h!.angesetztKn).toBe(24);
    expect(h!.text).toContain('BEWERTET NICHTS');
    expect(h!.text).toContain('24 kn');
    expect(h!.text).toContain('Fallböen');
  });

  /**
   * Die gefährlichste Zeile der Anzeige: eine Zone, die bewertet, darf NICHT
   * "die Ampel rechnet mit dem vollen Wind" behaupten — und sie muss den
   * GEKAPPTEN Wert nennen, nicht den vollen Lee-Wert. Sonst wäre die Kappung,
   * die genau diese Differenz absichert, unsichtbar.
   */
  it('nennt bei bewertender Zone den GEKAPPTEN Wert, nicht den vollen Lee-Wert', () => {
    const s = snap([lee({ confidence: 'mittel' })]);
    const [h] = leeHinweiseForStage(s, [legAssessment()]);
    expect(h!.bewertet).toBe(true);
    // 24 × 0,65 ≈ 15,5 — der Abzug von 8,5 kn liegt über der Kappung, also
    // rechnet die Ampel mit 24 − 8 = 16 kn.
    expect(h!.leeKn).toBeCloseTo(15.5, 1);
    expect(h!.angesetztKn).toBeCloseTo(16, 6);
    expect(h!.text).not.toContain('BEWERTET NICHTS');
    expect(h!.text).toContain('16 kn');
    expect(h!.text).toContain('höchstens gelb');
  });

  it('berät wieder nur, wenn die Kappung auf 0 steht', () => {
    const s = snap([lee({ confidence: 'mittel' })]);
    s.params = { ...s.params, leeBewertungMaxAbzugKn: 0 };
    const [h] = leeHinweiseForStage(s, [legAssessment()]);
    expect(h!.bewertet).toBe(false);
    expect(h!.text).toContain('BEWERTET NICHTS');
  });

  it('schweigt, wenn kein Punkt der Etappe im Schatten liegt', () => {
    // Wind aus Ost: die Keule zeigt nach Westen, beide Etappenpunkte liegen
    // quer daneben.
    expect(leeHinweiseForStage(snap([lee()], 90), [legAssessment()])).toEqual([]);
  });

  it('folgt dem Wind: bei Südwind meldet er den NÖRDLICHEN Punkt', () => {
    const [h] = leeHinweiseForStage(snap([lee()], 180), [legAssessment()]);
    // Dieselbe Insel, dieselbe Etappe — nur liegt der Schatten jetzt auf der
    // anderen Seite, und der Hinweis kommt trotzdem. Genau das konnte die
    // Sektor-Fassung nicht.
    expect(h).toBeDefined();
    expect(h!.windDirDeg).toBe(180);
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

    /**
     * Bei einer Lee-Keule hängt die Wirkfläche an der Windrichtung, also wird
     * gegen die Meltemi-Richtungen geprüft, für die diese Kuration überhaupt
     * gedacht ist (N, NNE, NE). Trifft eine Zone in KEINER davon einen
     * Forecast-Ort, ist sie im Revier dieser App wirkungslos.
     */
    const MELTEMI = [0, 22, 45];
    const trifft = (z: WindTopoZone): boolean =>
      z.kind === 'duese'
        ? orte.some((o) => distanceNm(o.coordinates, z.center) <= z.radiusNm)
        : MELTEMI.some((dir) =>
            orte.some((o) => leeAnsatzAt([z], o.coordinates, dir) !== null),
          );

    const stumm = zones.filter((z) => !trifft(z)).map((z) => z.id);
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
    ).zones.filter((z): z is WindTopoDueseZone => z.kind === 'duese');
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

/**
 * DER BEWERTUNGSPFAD — seit 2026-08-07 geht der Windschatten in Ampel und
 * Routing ein. Diese Gruppe prüft die vier Sicherungen aus dem Modulkopf von
 * domain/windTopo.ts einzeln; sie sind der Grund, warum das verantwortbar ist.
 */
describe('assessLeg — der Windschatten in der Bewertung', () => {
  /**
   * Geometrie dieser Gruppe: die Etappe läuft von 37,05 nach 37,15 (Kurs 000°),
   * die schattenwerfende Insel steht mit ihrer Mitte bei 37,20 — also GENAU IN
   * LUV, wenn der Wind aus Nord kommt. Die Keule reicht dann der Etappe entlang
   * nach Süden über beide Punkte: das ist der Rückweg unter Serifos in klein.
   *
   * Wind aus 000° heisst zugleich Kurs 000° gegenan (TWA 0) — dieselbe Lage,
   * die den Rückweg im Meltemi rot macht.
   */
  const ueberDerEtappe = (over: Record<string, unknown> = {}) =>
    WindTopoLeeZoneSchema.parse({
      id: 'topo-lee-etappe',
      name: 'Lee Testinsel',
      kind: 'lee',
      center: { lat: 37.2, lon: 24.5 },
      obstacleRadiusNm: 2,
      lobeNm: 12,
      factor: 0.5,
      fallboeenNm: 0.5,
      sourceNote: 'fixture',
      kalibriertAus: 'fixture',
      confidence: 'mittel',
      ...over,
    });

  const SUED = { lat: 37.05, lon: 24.5 };
  const NORD = { lat: 37.15, lon: 24.5 };

  function szenario(
    windKn: number,
    windFromDeg: number,
    zones: WindTopoZone[],
    over: { distanceNm?: number } = {},
  ) {
    const sued = makePlace({ id: 'sued-hafen', islandId: 'sued', coordinates: SUED });
    const nord = makePlace({ id: 'nord-hafen', islandId: 'nord', coordinates: NORD });
    const leg = makeLeg({
      id: 'sued--nord',
      fromIslandId: 'sued',
      toIslandId: 'nord',
      fromPlaceId: sued.id,
      toPlaceId: nord.id,
      distanceNm: over.distanceNm ?? 6,
    });
    const times = makeTimes();
    const fc = constantForecast(times.length, windKn, windFromDeg);
    const snapshot = makeSnapshot({
      times,
      polar: TEST_POLAR,
      forecast: { [sued.id]: fc, [nord.id]: fc },
      library: {
        islands: [
          { id: 'sued', name: 'Sued', coordinates: SUED },
          { id: 'nord', name: 'Nord', coordinates: NORD },
        ],
        places: [sued, nord],
        invalidPlaces: [],
        legs: [leg],
        variants: [],
        windTopoZones: zones,
      },
    });
    return { snapshot, leg };
  }

  it('hebt ein Rot auf: 28 kn gegenan werden mit Abdeckung segelbar', () => {
    const ohne = szenario(28, 0, []);
    const a = assessLeg(ohne.leg, 1, ohne.snapshot);
    expect(a.ampel).toBe('rot');
    expect(a.reasons.join(' ')).toContain('Aufkreuzen gegenan');

    const mit = szenario(28, 0, [ueberDerEtappe()]);
    const b = assessLeg(mit.leg, 1, mit.snapshot);
    expect(b.ampel).not.toBe('rot');
    expect(b.reasons.join(' ')).toContain('kuratiertem Windschatten');
  });

  it('nimmt nie mehr als die Kappung weg — auch dicht hinter der Insel nicht', () => {
    const { snapshot, leg } = szenario(28, 0, [ueberDerEtappe()]);
    const a = assessLeg(leg, 1, snapshot);
    // Der volle Faktor gäbe dicht hinter der Küste ~15 kn. Die Kappung lässt
    // 8 kn Abzug zu, also nie unter 20 — in KEINER Stunde der Etappe.
    expect(a.breakdown.length).toBeGreaterThan(0);
    for (const h of a.breakdown) expect(h.twsKn).toBeGreaterThanOrEqual(20 - 1e-9);
    // Und irgendwo muss die Abdeckung auch wirklich gegriffen haben.
    expect(Math.min(...a.breakdown.map((h) => h.twsKn))).toBeLessThan(28);
  });

  it('macht aus einem Grün höchstens Gelb — das Lee spricht keinen Tag frei', () => {
    // 1 sm bei 16 kn: kurz genug, dass weder Budget noch Kreuz-Stunden anschlagen.
    const ohne = szenario(16, 0, [], { distanceNm: 1 });
    expect(assessLeg(ohne.leg, 1, ohne.snapshot).ampel).toBe('gruen');

    const mit = szenario(16, 0, [ueberDerEtappe()], { distanceNm: 1 });
    const a = assessLeg(mit.leg, 1, mit.snapshot);
    expect(a.ampel).toBe('gelb');
    expect(a.reasons.join(' ')).toContain('steht die Abdeckung nicht');
  });

  it('lässt eine Zone mit niedrigem Vertrauen gar nicht erst in die Rechnung', () => {
    const { snapshot, leg } = szenario(28, 0, [
      ueberDerEtappe({ confidence: 'niedrig' }),
    ]);
    const a = assessLeg(leg, 1, snapshot);
    expect(a.breakdown[0]!.twsKn).toBeCloseTo(28, 6);
    expect(a.ampel).toBe('rot');
  });

  it('schaltet mit leeBewertungMaxAbzugKn = 0 komplett ab', () => {
    const { snapshot, leg } = szenario(28, 0, [ueberDerEtappe()]);
    snapshot.params = { ...snapshot.params, leeBewertungMaxAbzugKn: 0 };
    const a = assessLeg(leg, 1, snapshot);
    expect(a.breakdown[0]!.twsKn).toBeCloseTo(28, 6);
    expect(a.ampel).toBe('rot');
  });

  /**
   * Dass die Keule mit dem Wind dreht, hat eine Kehrseite, und die ist gewollt:
   * steht der Wind aus SÜD, liegt die Etappe in LUV der Insel — dann gibt es
   * keinen Schatten, und die Bewertung bekommt auch keinen.
   */
  it('greift nicht, wenn die Etappe in Luv der Insel liegt', () => {
    const { snapshot, leg } = szenario(28, 180, [ueberDerEtappe()]);
    const a = assessLeg(leg, 1, snapshot);
    expect(a.breakdown[0]!.twsKn).toBeCloseTo(28, 6);
    expect(a.reasons.join(' ')).not.toContain('Windschatten');
  });

  /**
   * Die wichtigste Sicherung von allen. Der Rückkehr-Check fragt "kommen wir
   * auch bei voller Meltemi-Lage heim?" — diese Frage mit kuratierter Abdeckung
   * zu beantworten hiesse, das Sicherheitsnetz aus dem zu knüpfen, wogegen es
   * sichert.
   */
  it('lässt den Meltemi-Worst-Case NIE ein Lee sehen', () => {
    const { snapshot, leg } = szenario(28, 0, [ueberDerEtappe()]);
    const a = assessLeg(leg, 1, snapshot, { scenario: 'worstCase' });
    expect(a.breakdown[0]!.twsKn).toBeCloseTo(28, 6);
    expect(a.reasons.join(' ')).not.toContain('Windschatten');
  });

  /**
   * Und die Nacht-Ampel: ein Hafen im Lee der Insel hat seinen Schutzsektor
   * bereits kuratiert. Ihm zusätzlich weniger Wind zu servieren wäre dieselbe
   * Abdeckung zweimal gezählt.
   */
  it('lässt die Nacht-Ampel eines Liegeplatzes unberührt', () => {
    const platz = makePlace({
      id: 'im-lee',
      coordinates: SUED,
      shelter: {
        windSectors: [{ fromDeg: 0, toDeg: 360, maxKn: 20 }],
        waveSectors: [{ fromDeg: 0, toDeg: 360, maxM: 2 }],
        sourceNote: 'fixture',
      },
    });
    const times = makeTimes();
    const bauen = (zones: WindTopoZone[]) =>
      makeSnapshot({
        times,
        forecast: { 'im-lee': constantForecast(times.length, 28, 0) },
        library: {
          islands: [],
          places: [platz],
          invalidPlaces: [],
          legs: [],
          variants: [],
          windTopoZones: zones,
        },
      });
    const ohne = placeNightAmpel(platz, 1, bauen([]));
    const mit = placeNightAmpel(platz, 1, bauen([ueberDerEtappe()]));
    expect(ohne.ampel).toBe('rot');
    expect(mit.ampel).toBe(ohne.ampel);
    expect(mit.maxWindKn).toBe(ohne.maxWindKn);
  });
});

describe('leeBewertungsKn — die Kappung', () => {
  it('lässt den vollen Faktor gelten, solange er unter der Kappung bleibt', () => {
    expect(leeBewertungsKn(28, 0.9, 8)).toBeCloseTo(25.2, 6);
  });

  it('kappt den Abzug, wenn der Faktor tiefer greift', () => {
    expect(leeBewertungsKn(28, 0.5, 8)).toBeCloseTo(20, 6);
  });

  it('gibt bei Kappung 0 den Modellwind zurück — der Aus-Schalter', () => {
    expect(leeBewertungsKn(28, 0.5, 0)).toBeCloseTo(28, 6);
  });
});
