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
import { assessRouteOption } from '../options.ts';
import { deriveKonzeptEntscheid, konzeptLageFor, type KonzeptLage } from '../konzept.ts';
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
      departureHourOverride: null,
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

    const ost = snapshot.library.variants.find((v) => v.id === 'ost-runde')!;
    const opt = assessRouteOption(ost, 'athen', snapshot);

    expect(opt.empfehlung).toBe('abgeraten');
    expect(opt.abratenGruende.join(' ')).toContain('trägt die aktuelle Wetterlage nicht');
    // Und genau das ist der Punkt: die Route ist NICHT weg. Ihr Plan hängt
    // dran, also ist sie ansehbar und übernehmbar.
    expect(opt.plan).not.toBeNull();
  });

  it('bei tragender Lage ist dieselbe Route schlicht empfohlen', () => {
    const snapshot = revier(12);
    expect(konzeptLageFor(snapshot).eignung.ost).toBe('geeignet');
    const ost = snapshot.library.variants.find((v) => v.id === 'ost-runde')!;
    const opt = assessRouteOption(ost, 'athen', snapshot);
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
    const ost = snapshot.library.variants.find((v) => v.id === 'ost-runde')!;
    const opt = assessRouteOption(ost, 'athen', snapshot);
    expect(opt.empfehlung).toBe('moeglich');
  });

  it('auch ohne tragfähigen Plan bleibt der beste Versuch stehen — abraten, nicht entfernen', () => {
    // Sturm über dem ganzen Fenster: der Solver findet zu keinem Ziel mehr
    // einen Plan ohne Sicherheits-Befunde. Früher verschwand die Route damit
    // aus dem Angebot (plan: null, keine Vorschau, kein Übernehmen).
    const snapshot = revier(40);
    const west = snapshot.library.variants.find((v) => v.id === 'west-runde')!;
    const opt = assessRouteOption(west, 'athen', snapshot);

    expect(opt.state).toBe('zu');
    expect(opt.empfehlung).toBe('abgeraten');
    expect(opt.plan).not.toBeNull();
    expect(opt.abratenGruende.join(' ')).toContain('Sicherheits-Befunde');
    // Ehrlich bleibt sie trotzdem: einen gültigen Preis hat dieser Plan nicht.
    expect(opt.costLevel).toBeNull();
  });
});

describe('Eine Best-Practice-Route wird als sie selbst geplant', () => {
  it('die West-Runde läuft ihre eigene Kette, nicht den Direktschlag zum selben Wendepunkt', () => {
    const snapshot = revier(12);
    const west = snapshot.library.variants.find((v) => v.id === 'west-runde')!;
    const direkt = snapshot.library.variants.find((v) => v.id === 'direkt-sued')!;

    const optWest = assessRouteOption(west, 'athen', snapshot);
    const optDirekt = assessRouteOption(direkt, 'athen', snapshot);

    // Beide wenden an derselben Insel — der Wendepunkt allein kann die beiden
    // Routen also nicht unterscheiden.
    expect(optWest.turnIslandId).toBe('sued');
    expect(optDirekt.turnIslandId).toBe('sued');

    const inseln = (o: typeof optWest) =>
      stagesOf(o.plan!).map((s) => s.toIslandId);
    expect(inseln(optWest)).toContain('west1');
    expect(inseln(optWest)).toContain('west2');
    expect(inseln(optDirekt)).not.toContain('west1');
  });

  it('scheitert die kuratierte Kette, schliesst das ZIEL trotzdem nicht', () => {
    // Zwei-Tage-Fenster: für die dreigliedrige West-Kette samt Rückweg zu kurz,
    // für den Direktschlag zum selben Wendepunkt reicht es. "Süd geht nicht"
    // wäre hier falsch — nicht das Ziel scheitert, nur die eine Kette dorthin.
    const snapshot = revier(12, {
      tripLengthDays: 2,
      returnDeadlineDate: '2026-08-09',
      pickupDate: '2026-08-09',
    });
    const west = snapshot.library.variants.find((v) => v.id === 'west-runde')!;
    const opt = assessRouteOption(west, 'athen', snapshot);

    expect(opt.state).not.toBe('zu');
    expect(opt.plan).not.toBeNull();
    // Der Rückfall auf die freie Suche ist sichtbar: die West-Zwischenstopps
    // stehen nicht drin, der Wendepunkt schon.
    const inseln = stagesOf(opt.plan!).map((s) => s.toIslandId);
    expect(inseln).not.toContain('west2');
    expect(inseln).toContain('sued');
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
