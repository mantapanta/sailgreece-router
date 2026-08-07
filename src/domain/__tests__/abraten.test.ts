/**
 * ABRATEN STATT VERBIETEN (Skipper 2026-08-06: "Der Router sollte mir andere
 * Best-Practice-Routen wie West-Kykladen trotzdem erlauben und lediglich davon
 * abraten, wenn der Wind zu stark ist").
 *
 * Zwei Zusagen werden hier festgehalten, und beide sind Invarianten, keine
 * Kalibrierung:
 *
 *   1. KEINE Wetterlage nimmt eine kuratierte Route aus dem Angebot. Sie
 *      behält ihren Plan (ansehbar, übernehmbar), trägt die Empfehlung
 *      'abgeraten' und die Begründung dazu. Der einzige Ausschluss ist
 *      Geometrie: zu diesem Ziel führt gar keine Etappenkette.
 *   2. Eine Best-Practice-Route wird als SIE SELBST geplant. "Westkykladen-
 *      Runde" heisst die Westkykladen-Runde — nicht irgendeine Kette zum
 *      selben Wendepunkt, angeboten unter ihrem Namen.
 */

import { describe, expect, it } from 'vitest';
import { assessTargetOption } from '../options.ts';
import {
  KONZEPT_REGLER,
  deriveKonzeptEntscheid,
  klemmeKonzeptSchwellen,
  konzeptLageFor,
  konzeptSchwellenOf,
  setKonzeptSchwelle,
  withKonzeptSchwellen,
  type KonzeptLage,
} from '../konzept.ts';
import { DEFAULT_PARAMS, ParamsSchema } from '../schema/params.ts';
import { stagesOf } from '../schema/plan.ts';
import type { PlanningSnapshot } from '../schema/snapshot.ts';
import type { Island } from '../schema/island.ts';
import {
  TEST_POLAR,
  TRIP_START,
  constantForecast,
  makeLeg,
  makePlace,
  makeSnapshot,
  makeTimes,
  makeVariant,
} from './fixtures.ts';

/**
 * Revier mit ZWEI Wegen zum selben Wendepunkt: die kuratierte West-Runde
 * (athen → west1 → west2 → sued) und der Direktschlag (athen → sued). Beide
 * wenden an 'sued' — genau die Konstellation, in der sich zeigt, ob eine
 * Option ihre eigene Kette plant oder nur ihren Wendepunkt weiterreicht.
 *
 * 'ost' ist Ost-Marker-Insel (mykonos) und trägt die Konzept-Frage.
 */
function revier(
  windKn: number,
  frame: { tripLengthDays: number; returnDeadlineDate: string; pickupDate: string } = {
    tripLengthDays: 8,
    returnDeadlineDate: '2026-08-15',
    pickupDate: '2026-08-14',
  },
): PlanningSnapshot {
  const athen = makePlace({ id: 'athen-alimos', islandId: 'athen', coordinates: { lat: 37.9, lon: 23.7 } });
  const west1 = makePlace({ id: 'west1-hafen', islandId: 'west1', coordinates: { lat: 37.82, lon: 23.85 } });
  const west2 = makePlace({ id: 'west2-hafen', islandId: 'west2', coordinates: { lat: 37.72, lon: 23.95 } });
  const sued = makePlace({ id: 'sued-hafen', islandId: 'sued', coordinates: { lat: 37.6, lon: 24.05 } });
  const mykonos = makePlace({ id: 'mykonos-hafen', islandId: 'mykonos', coordinates: { lat: 37.45, lon: 25.33 } });

  const leg = (f: typeof athen, t: typeof athen, nm: number) =>
    makeLeg({
      id: `${f.islandId}--${t.islandId}`,
      fromIslandId: f.islandId,
      toIslandId: t.islandId,
      fromPlaceId: f.id,
      toPlaceId: t.id,
      distanceNm: nm,
    });

  const aWest1 = leg(athen, west1, 12);
  const west1West2 = leg(west1, west2, 12);
  const west2Sued = leg(west2, sued, 12);
  const aSued = leg(athen, sued, 20);
  const suedAthen = leg(sued, athen, 20);
  const aMykonos = leg(athen, mykonos, 30);
  const mykonosAthen = leg(mykonos, athen, 30);
  const legs = [aWest1, west1West2, west2Sued, aSued, suedAthen, aMykonos, mykonosAthen];

  const islands: Island[] = [athen, west1, west2, sued, mykonos].map((p) => ({
    id: p.islandId,
    name: p.islandId,
    coordinates: p.coordinates,
    guestPickup: { ferryReachable: true, sourceNote: 'fixture' },
  }));

  const times = makeTimes(14);
  const fc = constantForecast(times.length, windKn, 0);
  const snapshot = makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: Object.fromEntries(
      [athen, west1, west2, sued, mykonos].map((p) => [p.id, fc]),
    ),
    library: {
      islands,
      places: [athen, west1, west2, sued, mykonos],
      invalidPlaces: [],
      legs,
      variants: [
        makeVariant('rueckfallkette-west', [suedAthen], {
          escalationRank: 0,
          isReturnChain: true,
          name: 'Rückfallkette',
        }),
        makeVariant('west-runde', [aWest1, west1West2, west2Sued], {
          escalationRank: 1,
          name: 'West-Runde',
        }),
        makeVariant('direkt-sued', [aSued], { escalationRank: 2, name: 'Direkt nach Süd' }),
        makeVariant('ost-runde', [aMykonos], { escalationRank: 3, name: 'Ost-Runde' }),
      ],
    },
    trip: {
      currentDay: 1,
      position: {
        source: 'manual',
        lat: athen.coordinates.lat,
        lon: athen.coordinates.lon,
        placeId: athen.id,
      },
      plan: null,
      departureHourByDay: {},
      empfohleneAbfahrtByDay: {},
      stopHoursByDay: {},
    },
  });
  snapshot.params = {
    ...snapshot.params,
    tripStartDate: TRIP_START,
    reliableHorizonDays: 14,
    ...frame,
  };
  return snapshot;
}

describe('Best-Practice-Routen bleiben wählbar — abgeraten ist nicht gesperrt', () => {
  it('bei gekipptem Konzept behält die Route ihren Plan und trägt die Empfehlung "abgeraten"', () => {
    // 23 kn dauerhaft: über konzeptOstMaxKn (22) an mehr als zwei Tagen in
    // Folge — das Ost-Konzept trägt diese Lage nicht.
    const snapshot = revier(23);
    expect(konzeptLageFor(snapshot).eignung.ost).toBe('ungeeignet');

    const opt = assessTargetOption('mykonos', 'athen', snapshot);

    expect(opt.empfehlung).toBe('abgeraten');
    expect(opt.abratenGruende.join(' ')).toContain('trägt die aktuelle Wetterlage nicht');
    // Und genau das ist der Punkt: die Route ist NICHT weg. Ihr Plan hängt
    // dran, also ist sie ansehbar und übernehmbar.
    expect(opt.plan).not.toBeNull();
  });

  it('bei tragender Lage ist dieselbe Route schlicht empfohlen', () => {
    const snapshot = revier(12);
    expect(konzeptLageFor(snapshot).eignung.ost).toBe('geeignet');
    const opt = assessTargetOption('mykonos', 'athen', snapshot);
    expect(opt.empfehlung).toBe('empfohlen');
    expect(opt.abratenGruende).toEqual([]);
    expect(opt.konzeptWarnung).toBeNull();
  });

  it('ein einzelner Starkwindtag rät nicht ab, er markiert die Lage als "möglich"', () => {
    const snapshot = revier(12);
    // Nur Törntag 4 über der Ost-Schwelle: grenzwertig, kein Starkwindfeld.
    for (const fc of Object.values(snapshot.forecast)) {
      fc.windKn = snapshot.times.map((_t, h) =>
        Math.floor((h + 3) / 24) + 1 === 4 ? 24 : 12,
      );
    }
    expect(konzeptLageFor(snapshot).eignung.ost).toBe('grenzwertig');
    const opt = assessTargetOption('mykonos', 'athen', snapshot);
    expect(opt.empfehlung).toBe('moeglich');
  });

  it('geht gar nichts mehr, bleibt das Ziel sichtbar — aber ohne untergeschobenen Plan', () => {
    /**
     * Sturm über dem ganzen Fenster. Das Ziel verschwindet NICHT aus dem
     * Angebot: es steht da, benannt, mit Begründung. Was nicht mehr passiert,
     * ist der frühere Ersatzplan — eine Kette, die woanders hinführt, unter
     * dem Namen dieses Ziels. Abraten heisst ehrlich sein, nicht ausweichen.
     */
    const snapshot = revier(40);
    const opt = assessTargetOption('sued', 'athen', snapshot);

    expect(opt.state).toBe('zu');
    expect(opt.empfehlung).toBe('abgeraten');
    expect(opt.reasons.length).toBeGreaterThan(0);
    expect(opt.costLevel).toBeNull();
    // Entweder es gibt einen Plan, der das Ziel wirklich anläuft — oder keinen.
    if (opt.plan) {
      expect(stagesOf(opt.plan).map((s) => s.toIslandId)).toContain('sued');
    }
  });
});

/**
 * ZIELMODELL V3 (2026-08-07) — DIE KURATIERTEN ROUTEN SIND KEINE
 * ANGEBOTS-EINHEIT MEHR.
 *
 * Hier standen zwei Fälle, die festhielten, dass eine Best-Practice-Route "als
 * sie selbst" geplant wird: ihre eigene Etappenkette zuerst, und bei deren
 * Scheitern ein Rückfall auf die freie Suche zum selben Wendepunkt.
 *
 * Genau dieser Rückfall war der Fehler. Er lieferte einen fremden Plan unter
 * dem Namen der Route — und das ist der beanstandete Befund des Skippers: "die
 * Verlängerung nach Santorin führt überhaupt nicht nach Santorin". Ein Name
 * kann nicht gleichzeitig eine Zusicherung sein und einen Ersatzplan tragen.
 *
 * Der Optionsraum fragt deshalb nach ZIEL-INSELN, und die Zusicherung ist
 * jetzt prüfbar statt gemeint: entweder der Plan enthält das Ziel, oder es
 * gibt keinen Plan. Die kuratierten Varianten bleiben Seed-Daten für den
 * Etappen-Graphen.
 */
describe('Ein Ziel bekommt nur Pläne, die es anlaufen', () => {
  it('der Plan zu einem Ziel enthält dieses Ziel — oder es gibt keinen Plan', () => {
    const snapshot = revier(12);
    for (const ziel of ['sued', 'west1', 'west2', 'mykonos']) {
      const opt = assessTargetOption(ziel, 'athen', snapshot);
      if (!opt.plan) continue;
      expect(stagesOf(opt.plan).map((s) => s.toIslandId), `Ziel ${ziel}`).toContain(ziel);
    }
  });

  it('reicht der Rahmen nicht, wird das Ziel ehrlich zu — kein Ersatzplan unter fremdem Namen', () => {
    // Zwei-Tage-Fenster: für eine Runde über west2 ist kein Platz. Früher fiel
    // die Option dann auf eine Kette zum selben Wendepunkt zurück und bot sie
    // unter dem Namen der West-Runde an.
    const snapshot = revier(12, {
      tripLengthDays: 2,
      returnDeadlineDate: '2026-08-09',
      pickupDate: '2026-08-09',
    });
    const opt = assessTargetOption('west2', 'athen', snapshot);
    if (opt.plan) {
      expect(stagesOf(opt.plan).map((s) => s.toIslandId)).toContain('west2');
    } else {
      expect(opt.state).toBe('zu');
      expect(opt.reasons.length).toBeGreaterThan(0);
    }
  });

  it('das nahe Ziel bleibt erreichbar, auch wenn das ferne es nicht ist', () => {
    const snapshot = revier(12, {
      tripLengthDays: 2,
      returnDeadlineDate: '2026-08-09',
      pickupDate: '2026-08-09',
    });
    const opt = assessTargetOption('sued', 'athen', snapshot);
    expect(opt.plan).not.toBeNull();
    expect(stagesOf(opt.plan!).map((s) => s.toIslandId)).toContain('sued');
  });
});

describe('Konzept-Entscheid — die Sprache einer Empfehlung, nicht einer Sperre', () => {
  const lage = (
    ost: KonzeptLage['eignung']['ost'],
    klassik: KonzeptLage['eignung']['klassik'],
  ): KonzeptLage => ({
    eignung: { ost, klassik },
    gruende: { ost: ['Ost-Grund.'], klassik: ['Klassik-Grund.'] },
    basisAnnahme: false,
  });
  const library = { islands: [], places: [], invalidPlaces: [], legs: [], variants: [] };

  it('das gekippte Ost-Konzept wird abgeraten, nicht gestrichen', () => {
    const e = deriveKonzeptEntscheid(lage('ungeeignet', 'geeignet'), 'ost', library, 'syros');
    expect(e.wechselHinweis).toContain('abgeraten');
    expect(e.wechselHinweis).toContain('wählbar');
    expect(e.wechselHinweis).not.toContain('gestrichen');
  });

  it('trägt auch Route 1 nicht, bleiben beide Konzepte wählbar', () => {
    const e = deriveKonzeptEntscheid(
      lage('ungeeignet', 'ungeeignet'),
      'klassik',
      library,
      'kythnos',
    );
    expect(e.wechselHinweis).toContain('abwettern');
    expect(e.wechselHinweis).toContain('wählbar');
  });
});

/**
 * DIE SCHWELLEN ALS REGLER (Skipper 2026-08-06). Zwei Zusagen: der angefasste
 * Regler folgt immer der Hand (kein stilles Zurückspringen), und die
 * Params-Invariante `konzeptOstMaxKn ≤ konzeptKlassikMaxKn` überlebt jeden
 * Reglerstand — auch einen aus dem localStorage, der nie geprüft wurde.
 */
describe('Konzept-Regler — wo "zu stark" anfängt, entscheidet der Skipper', () => {
  const stand = konzeptSchwellenOf(DEFAULT_PARAMS);

  it('liest den aktuellen Stand aus den Parametern', () => {
    expect(stand.konzeptOstMaxKn).toBe(DEFAULT_PARAMS.konzeptOstMaxKn);
    expect(stand.konzeptKlassikDauerTage).toBe(DEFAULT_PARAMS.konzeptKlassikDauerTage);
  });

  it('klemmt jeden Regler auf seinen Bereich', () => {
    for (const r of KONZEPT_REGLER) {
      expect(setKonzeptSchwelle(stand, r.key, -999)[r.key]).toBe(r.min);
      expect(setKonzeptSchwelle(stand, r.key, 9999)[r.key]).toBe(r.max);
      expect(setKonzeptSchwelle(stand, r.key, Number.NaN)[r.key]).toBe(r.min);
    }
  });

  it('Route 2 über Route 1 zu schieben SCHIEBT Route 1 mit — kein Zurückspringen', () => {
    const next = setKonzeptSchwelle(stand, 'konzeptOstMaxKn', 34);
    expect(next.konzeptOstMaxKn).toBe(34);
    expect(next.konzeptKlassikMaxKn).toBeGreaterThanOrEqual(34);
  });

  it('Route 1 unter Route 2 zu ziehen ZIEHT Route 2 mit', () => {
    const next = setKonzeptSchwelle(stand, 'konzeptKlassikMaxKn', 18);
    expect(next.konzeptKlassikMaxKn).toBe(18);
    expect(next.konzeptOstMaxKn).toBeLessThanOrEqual(18);
  });

  it('ein Reglerstand ergibt immer gültige Parameter — auch ein manipulierter', () => {
    const params = withKonzeptSchwellen(DEFAULT_PARAMS, {
      konzeptOstMaxKn: 999,
      konzeptOstDauerTage: 0,
      konzeptKlassikMaxKn: 1,
      konzeptKlassikDauerTage: 99,
    });
    expect(ParamsSchema.safeParse(params).success).toBe(true);
    expect(params.konzeptOstMaxKn).toBeLessThanOrEqual(params.konzeptKlassikMaxKn);
  });

  it('ein bereits geklemmter Stand bleibt beim Übernehmen unverändert', () => {
    // Sonst springt der Regler beim Loslassen — das Formular zieht mit
    // setKonzeptSchwelle, übergibt und die Engine klemmt nochmals.
    for (const r of KONZEPT_REGLER) {
      const gezogen = setKonzeptSchwelle(stand, r.key, r.max);
      expect(klemmeKonzeptSchwellen(gezogen)).toEqual(gezogen);
    }
  });

  it('ohne Reglerstand bleiben die Werte der Bibliothek unangetastet', () => {
    expect(withKonzeptSchwellen(DEFAULT_PARAMS, null)).toBe(DEFAULT_PARAMS);
  });

  it('ein höher gestellter Regler dreht ein "trägt nicht" wieder auf "trägt"', () => {
    // 23 kn dauerhaft kippt Route 2 bei der Voreinstellung (22 kn / 2 Tage) …
    const snapshot = revier(23);
    expect(konzeptLageFor(snapshot).eignung.ost).toBe('ungeeignet');
    // … mit einer Schwelle von 26 kn nicht mehr. Frischer Snapshot, weil die
    // Lage je Snapshot-Objekt gemerkt wird.
    const lockerer = revier(23);
    lockerer.params = withKonzeptSchwellen(lockerer.params, {
      ...konzeptSchwellenOf(lockerer.params),
      konzeptOstMaxKn: 26,
    });
    expect(konzeptLageFor(lockerer).eignung.ost).toBe('geeignet');
    expect(assessTargetOption('mykonos', 'athen', lockerer).empfehlung).toBe('empfohlen');
  });
});
