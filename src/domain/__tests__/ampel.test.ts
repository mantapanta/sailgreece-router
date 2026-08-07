import { describe, expect, it } from 'vitest';
import {
  placeNightAmpel,
  rankPlacesForNight,
  sectorContains,
  windHourAmpel,
  windSectorLimitKn,
} from '../ampel.ts';
import { DEFAULT_PARAMS } from '../schema/params.ts';
import {
  constantForecast,
  makePlace,
  makeSnapshot,
  makeTimes,
} from './fixtures.ts';

const params = DEFAULT_PARAMS;

describe('sector semantics (AD-4/AD-6): CW wrap over north, inclusive bounds', () => {
  const northSector = { fromDeg: 330, toDeg: 60 };

  it('north-wrap sector 330-60 contains wind from 10 deg', () => {
    expect(sectorContains(northSector, 10)).toBe(true);
  });

  it('contains the inclusive boundaries 330 and 60', () => {
    expect(sectorContains(northSector, 330)).toBe(true);
    expect(sectorContains(northSector, 60)).toBe(true);
    expect(sectorContains(northSector, 0)).toBe(true);
    expect(sectorContains(northSector, 360)).toBe(true);
  });

  it('does not contain directions outside the wrap', () => {
    expect(sectorContains(northSector, 180)).toBe(false);
    expect(sectorContains(northSector, 329)).toBe(false);
    expect(sectorContains(northSector, 61)).toBe(false);
  });

  it('non-wrapping sector works normally', () => {
    expect(sectorContains({ fromDeg: 90, toDeg: 180 }, 135)).toBe(true);
    expect(sectorContains({ fromDeg: 90, toDeg: 180 }, 200)).toBe(false);
  });

  it('full-circle sector 0-360 contains every direction (all-round shelter)', () => {
    for (const d of [0, 15, 90, 180, 270, 359.9]) {
      expect(sectorContains({ fromDeg: 0, toDeg: 360 }, d)).toBe(true);
    }
  });
});

describe('wind hour verdict (FR8)', () => {
  const sectors = [{ fromDeg: 330, toDeg: 60, maxKn: 30 }];

  it('protected sector + wind inside limit => gruen', () => {
    expect(windHourAmpel(sectors, 10, 20, params)).toBe('gruen');
  });

  it('protected sector + wind inside the yellow reserve => gelb', () => {
    expect(windHourAmpel(sectors, 10, 29, params)).toBe('gelb');
  });

  it('protected sector + wind above limit => rot', () => {
    expect(windHourAmpel(sectors, 10, 35, params)).toBe('rot');
  });

  it('unprotected direction (luv) is never gruen: calm => gelb, strong => rot', () => {
    expect(windHourAmpel(sectors, 180, 5, params)).toBe('gelb');
    expect(windHourAmpel(sectors, 180, 25, params)).toBe('rot');
  });

  it('DECISION fixture: overlapping sectors => the MOST GENEROUS limit wins (Math.max)', () => {
    const overlapping = [
      { fromDeg: 0, toDeg: 180, maxKn: 20 },
      { fromDeg: 90, toDeg: 270, maxKn: 30 },
    ];
    // Wind from 120 deg lies in BOTH sectors: limit 30 governs, so 25 kn is
    // still gruen (25 <= 30 - gelbReserve 3) although sector 1 alone caps 20.
    expect(windHourAmpel(overlapping, 120, 25, params)).toBe('gruen');
    expect(windHourAmpel(overlapping, 120, 29, params)).toBe('gelb');
    expect(windHourAmpel(overlapping, 120, 31, params)).toBe('rot');
  });
});

describe('windSectorLimitKn — welche Grenze eine Richtung regiert', () => {
  it('nennt die Grenze des deckenden Sektors', () => {
    expect(windSectorLimitKn([{ fromDeg: 330, toDeg: 60, maxKn: 35 }], 10)).toBe(35);
  });

  it('bei Überlappung gilt die großzügigste Grenze (wie in windHourAmpel)', () => {
    const overlapping = [
      { fromDeg: 90, toDeg: 180, maxKn: 20 },
      { fromDeg: 100, toDeg: 200, maxKn: 30 },
    ];
    expect(windSectorLimitKn(overlapping, 120)).toBe(30);
  });

  it('null für eine ungeschützte Richtung — kein stillschweigendes Limit 0', () => {
    expect(windSectorLimitKn([{ fromDeg: 330, toDeg: 60, maxKn: 35 }], 180)).toBeNull();
  });
});

/**
 * SKIPPER-ENTSCHEIDUNG 2026-08-05 — Wellen bewerten keinen Liegeplatz.
 *
 * Der Auslöser stand als konkreter Fehler auf dem Schirm: Serifos/Livadi ROT
 * bei 17 kn Nord, obwohl Nord mitten im Schutzsektor liegt (Grenze 30 kn).
 * Rot kam allein von 1,2 m offener See gegen eine kuratierte 0,5-m-Grenze.
 * Die Wellenhöhe des Modells gilt für die offene See, nicht für den Hafen —
 * diese Fälle halten die Regel fest.
 */
describe('FR8 — Wellen gehen NICHT in die Platz-Ampel ein', () => {
  const times = makeTimes();

  /** Der Fall aus dem Feld, mit den echten Zahlen von Livadi. */
  const livadi = () =>
    makePlace({
      id: 'serifos-livadi',
      shelter: {
        windSectors: [{ fromDeg: 190, toDeg: 90, maxKn: 30 }],
        waveSectors: [{ fromDeg: 190, toDeg: 90, maxM: 0.5 }],
        sourceNote: 'fixture nach seeding/data/islands/serifos.json',
      },
    });

  it('17 kn Nord im Schutzsektor bleibt grün, obwohl 1,2 m Welle die 0,5-m-Grenze reissen', () => {
    const place = livadi();
    const fc = constantForecast(times.length, 17, 0, 1.2, 0);
    const snapshot = makeSnapshot({
      times,
      forecast: { [place.id]: fc },
      library: { islands: [], places: [place], invalidPlaces: [], legs: [], variants: [] },
    });
    const result = placeNightAmpel(place, 1, snapshot);
    expect(result.ampel).toBe('gruen');
    // Die Welle wird weiterhin ausgewiesen — sie bewertet nur nichts.
    expect(result.maxWaveM).toBeCloseTo(1.2, 6);
  });

  it('auch eine haushohe Welle kippt die Ampel nicht, solange der Wind trägt', () => {
    const place = livadi();
    const fc = constantForecast(times.length, 12, 0, 4.0, 0);
    const snapshot = makeSnapshot({
      times,
      forecast: { [place.id]: fc },
      library: { islands: [], places: [place], invalidPlaces: [], legs: [], variants: [] },
    });
    expect(placeNightAmpel(place, 1, snapshot).ampel).toBe('gruen');
  });

  it('fehlende Marine-Stunden machen die Nacht nicht mehr unbewertet', () => {
    const place = livadi();
    // Wind vollständig, Marine-Horizont zu Ende — der häufige Normalfall.
    const fc = constantForecast(times.length, 17, 0, null, null);
    const snapshot = makeSnapshot({
      times,
      forecast: { [place.id]: fc },
      library: { islands: [], places: [place], invalidPlaces: [], legs: [], variants: [] },
    });
    const result = placeNightAmpel(place, 1, snapshot);
    expect(result.ampel).toBe('gruen');
    expect(result.maxWaveM).toBeNull();
    expect(result.reasons.join(' ')).not.toMatch(/Marine-Horizont/);
  });

  it('eine reine Wellen-Annahme macht die Nacht nicht zur Annahme', () => {
    const place = livadi();
    const fc = constantForecast(times.length, 17, 0, 1.2, 0);
    fc.waveAssumed = fc.waveAssumed.map(() => true);
    const snapshot = makeSnapshot({
      times,
      forecast: { [place.id]: fc },
      library: { islands: [], places: [place], invalidPlaces: [], legs: [], variants: [] },
    });
    expect(placeNightAmpel(place, 1, snapshot).basis).toBe('forecast');
  });

  it('eine Wind-Annahme dagegen schon', () => {
    const place = livadi();
    const fc = constantForecast(times.length, 17, 0, 1.2, 0);
    fc.windAssumed = fc.windAssumed.map(() => true);
    const snapshot = makeSnapshot({
      times,
      forecast: { [place.id]: fc },
      library: { islands: [], places: [place], invalidPlaces: [], legs: [], variants: [] },
    });
    expect(placeNightAmpel(place, 1, snapshot).basis).toBe('annahme');
  });
});

/**
 * Die Begründung muss auf die Ursache zeigen. Der alte Text behauptete pauschal
 * "Nacht außerhalb der Schutzsektoren" — auch dann, wenn der Wind mitten im
 * Sektor stand und nur die Stärke über der Grenze lag. Das schickt den Skipper
 * zum falschen Sektor in der Tabelle darunter.
 */
describe('FR8 — die Begründung nennt die Stunde, die das Urteil trägt', () => {
  const times = makeTimes();
  const nightAt = (place: ReturnType<typeof makePlace>, kn: number, dir: number) => {
    const snapshot = makeSnapshot({
      times,
      forecast: { [place.id]: constantForecast(times.length, kn, dir, 0.3, dir) },
      library: { islands: [], places: [place], invalidPlaces: [], legs: [], variants: [] },
    });
    return placeNightAmpel(place, 1, snapshot);
  };
  const sheltered = () =>
    makePlace({
      id: 'testinsel-sektorplatz',
      shelter: {
        windSectors: [{ fromDeg: 330, toDeg: 60, maxKn: 30 }],
        waveSectors: [{ fromDeg: 330, toDeg: 60, maxM: 1.5 }],
        sourceNote: 'fixture',
      },
    });

  it('rot INNERHALB des Sektors nennt die Grenze, nicht die Sektorlage', () => {
    const r = nightAt(sheltered(), 34, 10);
    expect(r.ampel).toBe('rot');
    expect(r.reasons.join(' ')).toContain('über der Schutzgrenze dieses Sektors (30 kn)');
    expect(r.reasons.join(' ')).not.toMatch(/außerhalb/);
  });

  it('rot AUSSERHALB des Sektors sagt genau das', () => {
    const r = nightAt(sheltered(), 22, 180);
    expect(r.ampel).toBe('rot');
    expect(r.reasons.join(' ')).toContain('in keinem Schutzsektor');
  });

  it('die Begründung nennt Stärke und Richtung als Himmelsrichtung und Grad', () => {
    const r = nightAt(sheltered(), 34, 20);
    expect(r.reasons.join(' ')).toContain('34 kn aus NNE (20°)');
  });

  it('gelb in der Reserve benennt die Reserve, nicht eine Sektorverletzung', () => {
    const r = nightAt(sheltered(), 29, 10);
    expect(r.ampel).toBe('gelb');
    expect(r.reasons.join(' ')).toContain('in der Reserve vor der Grenze');
  });

  it('grün begründet sich nicht — es gibt nichts zu erklären', () => {
    const r = nightAt(sheltered(), 12, 10);
    expect(r.ampel).toBe('gruen');
    expect(r.reasons).toEqual([]);
  });
});

describe('place night ampel — reference cases (AD-2/AD-6)', () => {
  // Meltemi: 25 kn from due north over the whole axis.
  const times = makeTimes();
  const meltemi = constantForecast(times.length, 25, 0, 0.4, 0);

  it('Meltemi from N, bay open to the SOUTH (protected from N) => gruen', () => {
    // Open to the south = shelter sectors cover everything except south.
    const bay = makePlace({
      id: 'testinsel-suedbucht',
      shelter: {
        windSectors: [{ fromDeg: 250, toDeg: 110, maxKn: 40 }],
        waveSectors: [{ fromDeg: 250, toDeg: 110, maxM: 1.5 }],
        sourceNote: 'fixture',
      },
    });
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: meltemi },
      library: { islands: [], places: [bay], invalidPlaces: [], legs: [], variants: [] },
    });
    expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('gruen');
  });

  // The very same green case, but the curation is disputed. Regression guard:
  // `confidence` used to be a documentation-only field, so a place the review
  // had flagged as doubtful still went green on a favourable forecast.
  it('confidence niedrig caps an otherwise green night at gelb', () => {
    const bay = makePlace({
      id: 'testinsel-strittig',
      confidence: 'niedrig',
      shelter: {
        windSectors: [{ fromDeg: 250, toDeg: 110, maxKn: 40 }],
        waveSectors: [{ fromDeg: 250, toDeg: 110, maxM: 1.5 }],
        sourceNote: 'fixture',
      },
    });
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: meltemi },
      library: { islands: [], places: [bay], invalidPlaces: [], legs: [], variants: [] },
    });
    const result = placeNightAmpel(bay, 1, snapshot);
    expect(result.ampel).toBe('gelb');
    expect(result.reasons.join(' ')).toMatch(/Kuratierung unsicher/);
  });

  it('confidence mittel and hoch leave a green night green', () => {
    for (const confidence of ['mittel', 'hoch'] as const) {
      const bay = makePlace({
        id: `testinsel-${confidence}`,
        confidence,
        shelter: {
          windSectors: [{ fromDeg: 250, toDeg: 110, maxKn: 40 }],
          waveSectors: [{ fromDeg: 250, toDeg: 110, maxM: 1.5 }],
          sourceNote: 'fixture',
        },
      });
      const snapshot = makeSnapshot({
        times,
        forecast: { [bay.id]: meltemi },
        library: { islands: [], places: [bay], invalidPlaces: [], legs: [], variants: [] },
      });
      expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('gruen');
    }
  });

  it('a missing confidence field changes nothing (most of the library has none)', () => {
    const bay = makePlace({
      id: 'testinsel-ohne-confidence',
      shelter: {
        windSectors: [{ fromDeg: 250, toDeg: 110, maxKn: 40 }],
        waveSectors: [{ fromDeg: 250, toDeg: 110, maxM: 1.5 }],
        sourceNote: 'fixture',
      },
    });
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: meltemi },
      library: { islands: [], places: [bay], invalidPlaces: [], legs: [], variants: [] },
    });
    expect(bay.confidence).toBeUndefined();
    expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('gruen');
  });

  it('confidence niedrig does not upgrade a red night to gelb', () => {
    const bay = makePlace({
      id: 'testinsel-strittig-nordbucht',
      confidence: 'niedrig',
      shelter: {
        windSectors: [{ fromDeg: 90, toDeg: 270, maxKn: 40 }],
        waveSectors: [{ fromDeg: 90, toDeg: 270, maxM: 1.5 }],
        sourceNote: 'fixture',
      },
    });
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: meltemi },
      library: { islands: [], places: [bay], invalidPlaces: [], legs: [], variants: [] },
    });
    expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('rot');
  });

  it('Meltemi from N, bay open to the NORTH => rot', () => {
    const bay = makePlace({
      id: 'testinsel-nordbucht',
      shelter: {
        windSectors: [{ fromDeg: 90, toDeg: 270, maxKn: 40 }],
        waveSectors: [{ fromDeg: 90, toDeg: 270, maxM: 1.5 }],
        sourceNote: 'fixture',
      },
    });
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: meltemi },
      library: { islands: [], places: [bay], invalidPlaces: [], legs: [], variants: [] },
    });
    expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('rot');
  });

  it('north-wrap sector 330-60, wind from 10 deg => place counts as protected', () => {
    const bay = makePlace({
      id: 'testinsel-wrapbucht',
      shelter: {
        windSectors: [{ fromDeg: 330, toDeg: 60, maxKn: 35 }],
        waveSectors: [{ fromDeg: 330, toDeg: 60, maxM: 1.5 }],
        sourceNote: 'fixture',
      },
    });
    const wind10 = constantForecast(times.length, 22, 10, 0.4, 10);
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: wind10 },
      library: { islands: [], places: [bay], invalidPlaces: [], legs: [], variants: [] },
    });
    expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('gruen');
  });

  it('null forecast hours (horizon) => unbewertet — never gruen, never hidden', () => {
    const bay = makePlace({ id: 'testinsel-horizont' });
    const gap = constantForecast(times.length, null, null, null, null);
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: gap },
      library: { islands: [], places: [bay], invalidPlaces: [], legs: [], variants: [] },
    });
    const result = placeNightAmpel(bay, 1, snapshot);
    expect(result.ampel).toBe('unbewertet');
  });

  /**
   * Vor der Skipper-Entscheidung vom 2026-08-05 war dieser Fall 'unbewertet':
   * fehlende Marine-Stunden blockierten das Urteil. Der Marine-Horizont endet
   * aber regelmäßig früher als der Wind — und seit die Welle nichts mehr
   * bewertet, fehlt damit nichts, was zum Urteil gehört.
   */
  it('missing marine hours only => das Wind-Urteil steht trotzdem', () => {
    const bay = makePlace({ id: 'testinsel-marine' });
    const fc = constantForecast(times.length, 15, 0, null, null);
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: fc },
      library: { islands: [], places: [bay], invalidPlaces: [], legs: [], variants: [] },
    });
    // Der Default-Platz aus makePlace ist rundum bis 40 kn geschützt.
    expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('gruen');
  });

  it('fehlende WIND-Stunden blockieren das Urteil weiterhin', () => {
    const bay = makePlace({ id: 'testinsel-windluecke' });
    const fc = constantForecast(times.length, null, null, 0.4, 0);
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: fc },
      library: { islands: [], places: [bay], invalidPlaces: [], legs: [], variants: [] },
    });
    const result = placeNightAmpel(bay, 1, snapshot);
    expect(result.ampel).toBe('unbewertet');
    expect(result.reasons.join(' ')).toContain('Wind-Forecast unvollständig');
  });

  it('a red hour dominates missing hours: rot, not unbewertet', () => {
    const bay = makePlace({
      id: 'testinsel-mix',
      shelter: {
        windSectors: [{ fromDeg: 90, toDeg: 270, maxKn: 40 }],
        waveSectors: [{ fromDeg: 0, toDeg: 360, maxM: 2 }],
        sourceNote: 'fixture',
      },
    });
    const fc = constantForecast(times.length, 25, 0, 0.4, 0);
    // Punch horizon holes into the second half of the night window.
    for (let i = 25; i < times.length; i++) {
      fc.windKn[i] = null;
      fc.windDirDeg[i] = null;
    }
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: fc },
      library: { islands: [], places: [bay], invalidPlaces: [], legs: [], variants: [] },
    });
    expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('rot');
  });
});

describe('rankPlacesForNight — der schönste Platz taugt nichts, wenn es morgen nicht weitergeht', () => {
  /**
   * REGRESSION zum Screenshot-Review des Skippers (2026-08-07): rote Etappen,
   * „die überhaupt nicht notwendig werden".
   *
   * Die Rangfolge kannte nur die NACHT — Schutz, dann Schönheit, dann
   * Restaurant. Auf Ios gewann damit Manganari, die geschützte Bucht an der
   * Südküste; `legGeometry` verankerte die Etappe des nächsten Morgens dort,
   * und zwischen Manganari und Santorin-Akrotiri findet `seaRoute` keinen Weg
   * ums Land. Der Kurs wurde zur Luftlinie über die Insel, und darauf rechnete
   * die ganze Bewertung weiter.
   */
  const schoen = makePlace({
    id: 'sackgasse-schoen',
    islandId: 'ios',
    qualities: { schoenheit: 5, restaurant: 5, badestrand: 5 },
  });
  const nuechtern = makePlace({
    id: 'weiterfahrt-nuechtern',
    islandId: 'ios',
    qualities: { schoenheit: 1, restaurant: 1, badestrand: 1 },
  });
  const beideGruen = { [schoen.id]: 'gruen' as const, [nuechtern.id]: 'gruen' as const };

  it('ohne die Auskunft bleibt die alte Rangfolge — der schönste gewinnt', () => {
    const ranked = rankPlacesForNight([nuechtern, schoen], beideGruen);
    expect(ranked[0]!.id).toBe(schoen.id);
  });

  it('eine Sackgasse fällt hinter den nüchternen Platz zurück', () => {
    const ranked = rankPlacesForNight(
      [nuechtern, schoen],
      beideGruen,
      (id) => id !== schoen.id,
    );
    expect(ranked[0]!.id).toBe(nuechtern.id);
  });

  it('sie schlägt sogar die Ampel: ein gelber Platz mit Weiterfahrt geht vor', () => {
    // Die Sackgasse steht ÜBER der Ampel, weil ein grüner Liegeplatz, von dem
    // aus die Etappe nicht berechenbar ist, den ganzen nächsten Tag entwertet.
    const ranked = rankPlacesForNight(
      [schoen, nuechtern],
      { [schoen.id]: 'gruen', [nuechtern.id]: 'gelb' },
      (id) => id !== schoen.id,
    );
    expect(ranked[0]!.id).toBe(nuechtern.id);
  });

  it('sind ALLE Plätze Sackgassen, wird trotzdem einer gewählt', () => {
    // Kein Ausschluss, nur eine Rangfolge: sonst stünde der Plan ohne
    // Liegeplatz da, und die Etappe trüge ihren Befund gar nicht erst.
    const ranked = rankPlacesForNight([nuechtern, schoen], beideGruen, () => false);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.id).toBe(schoen.id);
  });
});
