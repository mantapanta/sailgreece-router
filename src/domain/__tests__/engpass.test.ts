import { describe, expect, it } from 'vitest';
import { deriveEngpass } from '../engpass.ts';
import { assessLeg } from '../scoring.ts';
import type {
  LegAssessment,
  PlanAssessment,
  PlanningSnapshot,
  PprResult,
  RouteOptionAssessment,
} from '../schema/snapshot.ts';
import {
  constantForecast,
  makeLeg,
  makePlace,
  makeSnapshot,
  makeTimes,
  TEST_POLAR,
} from './fixtures.ts';

/**
 * Zwei Inseln, volle Abdeckung, konstanter Wind — genug, um assessLeg wirklich
 * laufen zu lassen. Die Kurse liegen so, dass sich Gegenan und Raumschots über
 * die Windrichtung einstellen lassen.
 */
function zweiInseln(windKn: number, windDirDeg: number): PlanningSnapshot {
  const times = makeTimes(3);
  const start = makePlace({
    id: 'start-hafen',
    islandId: 'startinsel',
    coordinates: { lat: 37.0, lon: 25.0 },
  });
  const ziel = makePlace({
    id: 'ziel-bucht',
    islandId: 'zielinsel',
    // Rund 20 sm genau nach Norden.
    coordinates: { lat: 37.3333, lon: 25.0 },
  });
  const leg = makeLeg({ distanceNm: 20 });
  const fc = constantForecast(times.length, windKn, windDirDeg);
  return makeSnapshot({
    times,
    forecast: { 'start-hafen': fc, 'ziel-bucht': fc },
    polar: TEST_POLAR,
    library: {
      islands: [
        { id: 'startinsel', name: 'Startinsel', coordinates: start.coordinates },
        { id: 'zielinsel', name: 'Zielinsel', coordinates: ziel.coordinates },
      ],
      places: [start, ziel],
      invalidPlaces: [],
      legs: [leg],
      variants: [],
    },
  });
}

/** Eine bewertete Etappe mit gesetzten Reserven, ohne Simulation. */
function stubLeg(over: Partial<LegAssessment> & { legId: string }): LegAssessment {
  return {
    sailedLeg: null,
    day: 1,
    ampel: 'gruen',
    sailHours: 3,
    motorHours: 0,
    totalHours: 3,
    avgTwsKn: 12,
    avgTwaDeg: 90,
    avgTwdDeg: 0,
    avgSpeedKn: 6,
    upwind: false,
    kreuzHours: 0,
    kreuzExtraNm: 0,
    wenden: 0,
    kreuzTrack: [],
    headroom: { windKn: null, hours: 3 },
    basis: 'forecast',
    reasons: [],
    nightLeg: false,
    arrivalHourAthens: 12,
    breakdown: [],
    pointPassages: [],
    kursAbschnitte: [],
    ...over,
  };
}

function option(
  over: Partial<RouteOptionAssessment> & { routeId: string },
): RouteOptionAssessment {
  return {
    name: over.routeId,
    konzeptId: 'klassik',
    konzeptWarnung: null,
    empfehlung: 'empfohlen',
    abratenGruende: [],
    state: 'offen',
    closesOnDay: null,
    ampel: 'gruen',
    legAssessments: [],
    reasons: [],
    turnIslandId: 'zielinsel',
    reachNm: 20,
    costLevel: null,
    costNote: null,
    plan: null,
    turnDay: null,
    previewIndex: null,
    ...over,
  };
}

const PPR: PprResult = {
  latestReturnStartDay: 6,
  remainingDistanceNm: 40,
  effectiveDeadlineDay: 11,
  reasons: [],
};

function derive(opts: {
  snapshot?: PlanningSnapshot;
  options?: RouteOptionAssessment[];
  mainRoute?: PlanAssessment | null;
}) {
  return deriveEngpass({
    snapshot: opts.snapshot ?? makeSnapshot({}),
    mainRoute: opts.mainRoute ?? null,
    routeOptions: opts.options ?? [],
    ppr: PPR,
  });
}

describe('headroom aus der Simulation', () => {
  it('misst die Wind-Reserve gegen die Aufkreuz-Grenze, wenn die Etappe gegenan liegt', () => {
    // Kurs 0°, Wind aus 0° => TWA 0°, also klar unter upwindTwaDeg (55°).
    const snapshot = zweiInseln(18, 0);
    const leg = assessLeg(snapshot.library.legs[0]!, 1, snapshot);
    // 25 kn Grenze − 18 kn tatsächlich = 7 kn Luft.
    expect(leg.headroom.windKn).toBeCloseTo(7, 5);
  });

  it('lässt die Wind-Reserve null, wenn die Etappe nie gegenan liegt', () => {
    // Kurs 0°, Wind aus 180° => TWA 180°, raumschots.
    const snapshot = zweiInseln(18, 180);
    const leg = assessLeg(snapshot.library.legs[0]!, 1, snapshot);
    expect(leg.headroom.windKn).toBeNull();
  });

  it('weist eine überschrittene Aufkreuz-Grenze negativ aus', () => {
    const snapshot = zweiInseln(30, 0);
    const leg = assessLeg(snapshot.library.legs[0]!, 1, snapshot);
    expect(leg.headroom.windKn).toBeCloseTo(-5, 5);
    expect(leg.ampel).toBe('rot');
  });

  it('misst die Stunden-Reserve an der Komponente, die zuerst bricht', () => {
    const snapshot = zweiInseln(12, 180);
    const leg = assessLeg(snapshot.library.legs[0]!, 1, snapshot);
    const { maxSailHours, maxMotorHours } = snapshot.params;
    expect(leg.headroom.hours).toBeCloseTo(
      Math.min(maxSailHours - leg.sailHours!, maxMotorHours - leg.motorHours!),
      5,
    );
  });

  it('gibt für eine nicht simulierbare Etappe keine Reserve aus, keine Null', () => {
    const snapshot = makeSnapshot({ library: { islands: [], places: [], invalidPlaces: [], legs: [], variants: [] } });
    const leg = assessLeg(makeLeg(), 1, snapshot);
    expect(leg.ampel).toBe('unbewertet');
    expect(leg.headroom).toEqual({ windKn: null, hours: null });
  });
});

describe('welche Fessel bindet', () => {
  it('meldet keine Fessel, solange keine Option zu oder befristet ist', () => {
    const e = derive({ options: [option({ routeId: 'a' }), option({ routeId: 'b' })] });
    expect(e.fessel).toBe('keine');
    expect(e.fesselText).toContain('Tag 11');
  });

  it('nennt den Wind, wenn eine rote Etappe die Aufkreuz-Grenze reisst', () => {
    const e = derive({
      options: [
        option({
          routeId: 'a',
          state: 'zu',
          legAssessments: [
            stubLeg({ legId: 'x--y', ampel: 'rot', headroom: { windKn: -4, hours: 2 } }),
          ],
        }),
      ],
    });
    expect(e.fessel).toBe('wind');
    expect(e.fesselText).toContain('4,0 kn zu viel');
  });

  it('nennt die Strecke, wenn rot ist, ohne dass die Windgrenze fällt', () => {
    const e = derive({
      options: [
        option({
          routeId: 'a',
          state: 'zu',
          legAssessments: [
            stubLeg({
              legId: 'x--y',
              ampel: 'rot',
              headroom: { windKn: 6, hours: -1.5 },
              reasons: ['Hartes Tagesbudget überschritten'],
            }),
          ],
        }),
      ],
    });
    expect(e.fessel).toBe('strecke');
    expect(e.fesselText).toContain('Nicht der Wind');
    expect(e.fesselText).toContain('Hartes Tagesbudget überschritten');
  });

  it('nennt den Kalender, wenn eine Option zu ist, ohne dass eine Etappe rot wäre', () => {
    const e = derive({
      options: [
        option({ routeId: 'a', state: 'zu' }),
        option({ routeId: 'b', state: 'schliesst', closesOnDay: 4 }),
      ],
    });
    expect(e.fessel).toBe('kalender');
    expect(e.fesselText).toContain('2 betroffenen Optionen');
  });

  it('wählt als Beispiel die Etappe, die am weitesten über der Windgrenze liegt', () => {
    const e = derive({
      options: [
        option({
          routeId: 'a',
          state: 'zu',
          legAssessments: [
            stubLeg({ legId: 'knapp--drueber', ampel: 'rot', headroom: { windKn: -1, hours: 2 } }),
            stubLeg({ legId: 'weit--drueber', ampel: 'rot', headroom: { windKn: -9, hours: 2 } }),
          ],
        }),
      ],
    });
    expect(e.fesselText).toContain('9,0 kn zu viel');
    expect(e.fesselText).not.toContain('1,0 kn zu viel');
  });

  it('zählt dieselbe Etappe am selben Tag nur einmal, egal über wie viele Optionen sie läuft', () => {
    const geteilte = stubLeg({
      legId: 'x--y',
      ampel: 'rot',
      headroom: { windKn: -4, hours: 2 },
    });
    const e = derive({
      options: [
        option({ routeId: 'a', state: 'zu', legAssessments: [geteilte] }),
        option({ routeId: 'b', state: 'zu', legAssessments: [geteilte] }),
        option({ routeId: 'c', state: 'zu', legAssessments: [geteilte] }),
      ],
    });
    expect(e.fesselText).toContain('1 Etappe im Möglichkeitsraum');
  });
});

describe('die engste Stelle', () => {
  it('rangiert nach Reserve relativ zum eigenen Limit, nicht nach Rohwert', () => {
    // 4 von 25 kn = 16 %; 2,4 von 6 h Segelbudget = 40 %. Der Wind ist enger,
    // obwohl "4" die groessere Zahl ist.
    const e = derive({
      options: [
        option({
          routeId: 'a',
          legAssessments: [
            stubLeg({
              legId: 'wind--eng',
              headroom: { windKn: 4, hours: 5 },
              sailHours: 1,
              motorHours: 0,
            }),
            stubLeg({
              legId: 'zeit--eng',
              headroom: { windKn: null, hours: 2.4 },
              sailHours: 3.6,
              motorHours: 0,
            }),
          ],
        }),
      ],
    });
    expect(e.engsteStelle?.legId).toBe('wind--eng');
    expect(e.engsteStelle?.kind).toBe('wind');
  });

  it('lässt bei gleichem Anteil den Wind gewinnen — Sicherheit vor Komfort', () => {
    // 5 von 25 kn = 20 %; 1,2 von 6 h = 20 %.
    const e = derive({
      options: [
        option({
          routeId: 'a',
          legAssessments: [
            stubLeg({
              legId: 'zeit--eng',
              headroom: { windKn: null, hours: 1.2 },
              sailHours: 4.8,
              motorHours: 0,
            }),
            stubLeg({
              legId: 'wind--eng',
              headroom: { windKn: 5, hours: 6 },
              sailHours: 0,
              motorHours: 0,
            }),
          ],
        }),
      ],
    });
    expect(e.engsteStelle?.kind).toBe('wind');
  });

  it('sagt "überschritten" statt "nur noch", wenn die Reserve negativ ist', () => {
    const e = derive({
      options: [
        option({
          routeId: 'a',
          legAssessments: [
            stubLeg({
              legId: 'x--y',
              ampel: 'rot',
              headroom: { windKn: -0.2, hours: 4 },
            }),
          ],
        }),
      ],
    });
    expect(e.engsteStelleText).toContain('überschritten');
    expect(e.engsteStelleText).not.toContain('nur ');
  });

  it('übergeht unbewertete Etappen — ohne Simulation gibt es keinen Abstand', () => {
    const e = derive({
      options: [
        option({
          routeId: 'a',
          legAssessments: [
            stubLeg({
              legId: 'unbewertet--x',
              ampel: 'unbewertet',
              headroom: { windKn: 0.1, hours: 0.1 },
            }),
            stubLeg({
              legId: 'echt--y',
              headroom: { windKn: 8, hours: 4 },
              sailHours: 2,
              motorHours: 0,
            }),
          ],
        }),
      ],
    });
    expect(e.engsteStelle?.legId).toBe('echt--y');
  });

  it('bleibt ohne messbare Reserve stumm statt eine Zahl zu erfinden', () => {
    const e = derive({
      options: [
        option({
          routeId: 'a',
          legAssessments: [
            stubLeg({
              legId: 'x--y',
              ampel: 'unbewertet',
              headroom: { windKn: null, hours: null },
            }),
          ],
        }),
      ],
    });
    expect(e.engsteStelle).toBeNull();
    expect(e.engsteStelleText).toBeNull();
  });

  it('nennt die Etappe bei ihren Inselnamen, wenn die gesegelte Geometrie dranhängt', () => {
    const snapshot = zweiInseln(12, 180);
    const e = derive({
      snapshot,
      options: [
        option({
          routeId: 'a',
          legAssessments: [
            stubLeg({
              legId: 'start--ziel',
              sailedLeg: snapshot.library.legs[0]!,
              headroom: { windKn: 4, hours: 4 },
              sailHours: 2,
              motorHours: 0,
            }),
          ],
        }),
      ],
    });
    expect(e.engsteStelleText).toContain('Startinsel → Zielinsel');
  });

  it('zieht auch die Etappen des geltenden Plans heran, nicht nur den Optionsraum', () => {
    const mainRoute = {
      stages: [
        {
          legs: [
            stubLeg({
              legId: 'plan--eng',
              headroom: { windKn: 1, hours: 5 },
              sailHours: 1,
              motorHours: 0,
            }),
          ],
        },
      ],
    } as unknown as PlanAssessment;
    const e = derive({
      mainRoute,
      options: [
        option({
          routeId: 'a',
          legAssessments: [
            stubLeg({
              legId: 'option--weit',
              headroom: { windKn: 20, hours: 5 },
              sailHours: 1,
              motorHours: 0,
            }),
          ],
        }),
      ],
    });
    expect(e.engsteStelle?.legId).toBe('plan--eng');
  });
});
