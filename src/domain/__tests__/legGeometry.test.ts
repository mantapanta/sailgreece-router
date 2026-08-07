import { describe, expect, it } from 'vitest';
import { sailedLeg, sailedLegsByDay } from '../legGeometry.ts';
import { pathCrossesLand } from '../searoute.ts';
import { distanceNm } from '../geo.ts';
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
    id: 'sifnos-vathy',
    islandId: 'sifnos',
    coordinates: { lat: 36.9333, lon: 24.7014 },
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
  makePlace({
    id: 'syros-grammata',
    islandId: 'syros',
    coordinates: { lat: 37.498, lon: 24.8911 },
  }),
  // Ios und Santorin: der Fall aus dem Screenshot-Review vom 2026-08-07.
  // Manganari liegt an der SÜDküste von Ios, Akrotiri an der Südwestecke
  // Santorins — beides Schönwetter-Ankerplätze, die die Nacht-Rangfolge
  // bevorzugt, und zwischen ihnen findet seaRoute keinen Weg ums Land.
  makePlace({
    id: 'ios-ormos',
    islandId: 'ios',
    coordinates: { lat: 36.7217, lon: 25.275 },
  }),
  makePlace({
    id: 'ios-manganari',
    islandId: 'ios',
    coordinates: { lat: 36.6617, lon: 25.3717 },
  }),
  makePlace({
    id: 'santorin-vlychada',
    islandId: 'santorin',
    coordinates: { lat: 36.3353, lon: 25.4353 },
  }),
  makePlace({
    id: 'santorin-akrotiri',
    islandId: 'santorin',
    coordinates: { lat: 36.3533, lon: 25.3983 },
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

const iosParosKuratiertNm = 32;
const IOS_PAROS = leg({
  id: 'ios--paros',
  fromIslandId: 'ios',
  toIslandId: 'paros',
  fromPlaceId: 'ios-ormos',
  toPlaceId: 'paros-naoussa',
  distanceNm: iosParosKuratiertNm,
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

  /**
   * Die tote Spitze: `kea--syros` trägt die Ansteuerung von Ermoupoli
   * (Ostseite). Endet der Tag in Grammata (Nordwestseite), fuhr das Boot an
   * Grammata vorbei bis vor Ermoupoli und über dieselben Punkte zurück — 5,6 sm
   * hin und her, auf der Karte zweimal übereinander und quer über die Insel.
   * Der Kurs muss sich dem Ziel monoton nähern.
   */
  it('schneidet die Ansteuerung des ersetzten Hafens ab', () => {
    const curated = leg({
      ...KEA_SYROS,
      waypoints: [
        { lat: 37.5087, lon: 24.9213 }, // nördlich Syros, auf dem Weg
        { lat: 37.4879, lon: 24.9528 }, // schon Ansteuerung Ermoupoli
        { lat: 37.4441, lon: 24.9541 }, // vor Ermoupoli — 4,4 sm hinter Grammata
      ],
    });
    const sailed = sailedLeg(curated, places, { toPlaceId: 'syros-grammata' });
    const path = pathOf(sailed);

    expect(pathCrossesLand(path)).toBe(false);
    const grammata = places.find((p) => p.id === 'syros-grammata')!.coordinates;
    const rest = path.map((p) => distanceNm(p, grammata));

    // Die ANSTEUERUNG muss monoton sein: ist das Boot einmal auf 5 sm heran,
    // darf es sich nicht wieder entfernen. Weiter draussen ist ein Bogen
    // erlaubt — aus der Bucht von Vourkari führt der erste Schlag zwangsläufig
    // ein Stück vom Ziel weg.
    const heran = rest.findIndex((nm) => nm < 5);
    expect(heran).toBeGreaterThan(0);
    for (let i = heran + 1; i < rest.length; i++) {
      expect(rest[i]!).toBeLessThan(rest[i - 1]!);
    }

    // Und der Kurs bleibt in der Grössenordnung der kuratierten Etappe: die
    // tote Spitze hatte 34 sm auf 39,4 sm aufgebläht.
    expect(sailed.distanceNm).toBeLessThan(36);
  });

  it('behält die Ansteuerung, solange ihr Hafen angelaufen wird', () => {
    const curated = leg({
      ...KEA_SYROS,
      waypoints: [{ lat: 37.4879, lon: 24.9528 }],
    });
    const sailed = sailedLeg(curated, places, { fromPlaceId: 'kea-vourkari' });
    expect(sailed.waypoints).toContainEqual({ lat: 37.4879, lon: 24.9528 });
  });
});

describe('sailedLeg — ein unauflösbarer Kurs sagt es, statt still zu rechnen', () => {
  /**
   * DER BEFUND VOM 2026-08-07, an der echten Geometrie nachgestellt.
   *
   * Der Skipper beanstandete rote Etappen, „die überhaupt nicht notwendig
   * werden". Eine davon war Santorin(Akrotiri) → Ios(Manganari) — beides
   * Liegeplätze, die die App selbst für die NACHT vorgeschlagen hatte
   * (`rankPlacesForNight` sortiert nach Schutz und Schönheit, nicht nach der
   * Etappe des nächsten Morgens).
   *
   * Zwischen diesen beiden Punkten findet `seaRoute` keinen landfreien Kurs.
   * Vorher stand dafür nur ein `console.warn`, und die Bewertung rechnete auf
   * der LUFTLINIE weiter: 14,2 sm quer über Land, daraus Fahrtzeit,
   * Kreuzschläge und eine rote Ampel. Zahlen zu einem Kurs, den kein Boot
   * fahren kann.
   */
  const iosSantorin = leg({
    id: 'ios--santorin',
    fromIslandId: 'ios',
    toIslandId: 'santorin',
    fromPlaceId: 'ios-ormos',
    toPlaceId: 'santorin-vlychada',
    distanceNm: 21,
  });

  it('markiert die Etappe, wenn zwischen den Ankerplätzen kein Weg ums Land führt', () => {
    const sailed = sailedLeg(iosSantorin, places, {
      fromPlaceId: 'ios-manganari',
      toPlaceId: 'santorin-akrotiri',
    });
    expect(sailed.kursUnaufloesbar).toBe(true);
    // Die Luftlinie steht weiterhin da — sie ist alles, was es gibt. Aber sie
    // ist jetzt als solche gekennzeichnet, und scoring.assessLeg rechnet nicht
    // mehr auf ihr.
    expect(sailed.waypoints).toHaveLength(0);
  });

  it('setzt die Marke NICHT, wo ein Weg existiert — auch wenn er lang wird', () => {
    /**
     * Die Gegenprobe, und zugleich die Korrektur einer voreiligen Diagnose:
     * Manganari → Paros IST auflösbar. Der Kurs geht um Ios herum und wird
     * dabei von 32 auf rund 36 sm länger — das ist echte Geometrie, keine
     * erfundene. Diese Etappe darf ihre Zahlen behalten; teuer ist sie
     * trotzdem, und zwar wegen der Platzwahl.
     */
    const sailed = sailedLeg(IOS_PAROS, places, { fromPlaceId: 'ios-manganari' });
    expect(sailed.kursUnaufloesbar).toBeUndefined();
    expect(sailed.waypoints.length).toBeGreaterThan(0);
    expect(sailed.distanceNm).toBeGreaterThan(iosParosKuratiertNm);
  });

  it('lässt die kuratierte Etappe unberührt', () => {
    expect(sailedLeg(IOS_PAROS, places).kursUnaufloesbar).toBeUndefined();
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

  /**
   * DER HAFEN DES ZWISCHENSTOPPS ist eine Skipper-Wahl (Plan: Stage.viaPlaceIds,
   * FR28) — kuratiert ist er nur, solange niemand etwas anderes gesagt hat. Er
   * verankert die Zwischen-Etappe und ist damit auch der Startpunkt der
   * Folge-Etappe: die Kette darf innerhalb eines Tages so wenig springen wie
   * über Nacht.
   */
  it('verankert den Zwischenstopp am gewählten Hafen, nicht am kuratierten', () => {
    const chain = sailedLegsByDay(
      [
        {
          day: 4,
          legIds: [MYKONOS_PAROS.id, PAROS_SIFNOS.id],
          placeId: 'sifnos-kamares',
          viaPlaceIds: ['paros-parikia'],
        },
      ],
      legsById,
      places,
    );
    const day = chain.get(4)!;
    expect(day[0]!.toPlaceId).toBe('paros-parikia');
    expect(day[1]!.fromPlaceId).toBe('paros-parikia');
    // Das Tagesziel bleibt das Tagesziel — der Stopp verschiebt nur den Weg.
    expect(day[1]!.toPlaceId).toBe('sifnos-kamares');
  });

  it('ignoriert einen Eintrag für die LETZTE Etappe — dort gilt das Tagesziel', () => {
    const chain = sailedLegsByDay(
      [
        {
          day: 4,
          legIds: [MYKONOS_PAROS.id, PAROS_SIFNOS.id],
          placeId: 'sifnos-kamares',
          viaPlaceIds: ['paros-parikia', 'sifnos-vathy'],
        },
      ],
      legsById,
      places,
    );
    expect(chain.get(4)![1]!.toPlaceId).toBe('sifnos-kamares');
  });
});
