import { describe, expect, it } from 'vitest';
import {
  crossesLand,
  isOnLand,
  landCrossingNm,
  landInsetNm,
  pathCrossesLand,
  pathLengthNm,
  seaRoute,
} from '../searoute.ts';
import { distanceNm } from '../geo.ts';

/** Bekannte Punkte des Reviers — Prüfsteine gegen die Landmaske selbst. */
const SYROS_ERMOUPOLI = { lat: 37.4436, lon: 24.9436 };
const KEA_VOURKARI = { lat: 37.6642, lon: 24.3181 };
const PAROS_NAOUSSA = { lat: 37.1236, lon: 25.2394 };
const PAROS_PARIKIA = { lat: 37.0853, lon: 25.1519 };
const MYKONOS_ORNOS = { lat: 37.4142, lon: 25.3283 };
const SIFNOS_KAMARES = { lat: 36.9903, lon: 24.6708 };
const OPEN_SEA = { lat: 37.25, lon: 24.72 }; // zwischen Syros und Serifos

describe('Landmaske', () => {
  it('kennt offenes Wasser als offenes Wasser', () => {
    expect(isOnLand(OPEN_SEA)).toBe(false);
  });

  it('kennt Landeinwärts als Land', () => {
    // Mitte von Naxos, rund 6 sm von jeder Küste.
    expect(isOnLand({ lat: 37.05, lon: 25.5 })).toBe(true);
    // Mitte von Syros.
    expect(isOnLand({ lat: 37.44, lon: 24.9 })).toBe(true);
  });

  it('misst Land auf der Luftlinie Kea → Ermoupoli', () => {
    // Ermoupoli liegt auf der Ostseite von Syros: die Luftlinie von Kea läuft
    // quer über die Insel. Genau der Fehler, wegen dem dieses Modul existiert.
    expect(landCrossingNm(KEA_VOURKARI, SYROS_ERMOUPOLI)).toBeGreaterThan(2);
    expect(crossesLand(KEA_VOURKARI, SYROS_ERMOUPOLI)).toBe(true);
  });

  it('lässt offene Schläge offen', () => {
    // Zwischen Syros und Paros hindurch — 16 sm freies Wasser.
    expect(crossesLand(OPEN_SEA, { lat: 37.3, lon: 25.05 })).toBe(false);
  });

  it('blockiert die eigene Ansteuerung nicht', () => {
    // Ein kurzer Schlag von Parikia hinaus nach Westen liegt in der
    // Ansteuerungszone — der Hafen selbst darf nie unerreichbar sein.
    expect(crossesLand(PAROS_PARIKIA, { lat: 37.0853, lon: 25.0 })).toBe(false);
  });

  /**
   * Der Fehler, wegen dem die Karte bei Syros über Land führte: die
   * Ansteuerung war ein KREIS von 1,5 sm um Start und Ziel. Zwei solche Kreise
   * decken jeden Schlag bis 3 sm restlos ab — auf kurzen Schlägen war die
   * Landprüfung damit abgeschaltet. Dieser Schlag ist 3,0 sm lang und läuft
   * 2,3 sm quer über Syros; gemeldet wurden 0,007 sm.
   */
  it('sieht Land auch auf einem kurzen Schlag', () => {
    const ansteuerung = { lat: 37.4879, lon: 24.9528 }; // vor Ermoupoli
    const grammata = { lat: 37.498, lon: 24.8911 }; // Nordwestküste
    // Kaum länger als die beiden alten Ansteuerungsradien zusammen — genau der
    // Bereich, in dem die Prüfung blind war.
    expect(distanceNm(ansteuerung, grammata)).toBeLessThan(3.5);
    expect(landCrossingNm(ansteuerung, grammata)).toBeGreaterThan(2);
    expect(crossesLand(ansteuerung, grammata)).toBe(true);
  });

  /**
   * Die Ansteuerung gilt dem Land, an dem der Endpunkt KLEBT — nicht jedem
   * Land in seiner Nähe. Ermoupoli liegt selbst knapp hinter der
   * Küstenlinie; ohne diese Unterscheidung wäre der Weg quer über die eigene
   * Insel eine Ansteuerung.
   */
  it('lässt die eigene Insel nicht als Ansteuerung durchgehen', () => {
    expect(crossesLand(SYROS_ERMOUPOLI, { lat: 37.4425, lon: 24.85 })).toBe(true);
  });

  /**
   * Die Ansteuerung ist so tief wie der Endpunkt selbst im Land sitzt, nicht
   * pauschal `APPROACH_NM`. Als pauschaler Betrag deckte sie ganze Landzungen:
   * Grammata liegt IM WASSER und bekam trotzdem 1,5 sm gutgeschrieben — die
   * 0,6 sm breite Zunge davor wurde als 0,000 sm gemeldet, und die Karte führte
   * weiter über Land.
   */
  it('rechnet einem Platz im Wasser keine Landzunge als Ansteuerung an', () => {
    const nordVonSyros = { lat: 37.5118, lon: 24.9059 };
    const grammata = { lat: 37.498, lon: 24.8911 };
    expect(landInsetNm(grammata)).toBe(0);
    expect(landCrossingNm(nordVonSyros, grammata)).toBeGreaterThan(0.4);
    expect(crossesLand(nordVonSyros, grammata)).toBe(true);
  });

  it('sieht die Landzunge vor Ornos', () => {
    // 1,3 sm quer über Mykonos, gemeldet als 0,000 sm.
    const nordOestlich = { lat: 37.52, lon: 25.1865 };
    expect(landCrossingNm(nordOestlich, MYKONOS_ORNOS)).toBeGreaterThan(1);
  });

  /**
   * Die Gegenprobe: enger gefasst darf die Ansteuerung nicht heissen, dass der
   * tiefste kuratierte Platz des Reviers unerreichbar wird. Russian Bay (Poros)
   * liegt 1,03 sm hinter der Küstenlinie — die Bucht schneidet die Auflösung ab.
   */
  it('lässt den am tiefsten liegenden Hafen erreichbar', () => {
    const russianBay = { lat: 37.4862, lon: 23.432 };
    expect(landInsetNm(russianBay)).toBeGreaterThan(1);
    const r = seaRoute([russianBay, { lat: 37.55, lon: 23.55 }]);
    expect(r.unresolved).toBe(false);
  });
});

describe('seaRoute — der Kurs um das Land herum', () => {
  it('lässt einen freien Schlag unverändert', () => {
    const r = seaRoute([OPEN_SEA, { lat: 37.3, lon: 25.05 }]);
    expect(r.inserted).toBe(0);
    expect(r.path).toHaveLength(2);
    expect(r.unresolved).toBe(false);
  });

  it('umfährt Syros auf dem Weg von Kea nach Ermoupoli', () => {
    const r = seaRoute([KEA_VOURKARI, SYROS_ERMOUPOLI]);
    expect(r.inserted).toBeGreaterThan(0);
    expect(r.unresolved).toBe(false);
    expect(pathCrossesLand(r.path)).toBe(false);
    // Der Umweg ist ein Umweg, aber kein Ausflug: höchstens 40 % länger als
    // die Luftlinie.
    const direct = distanceNm(KEA_VOURKARI, SYROS_ERMOUPOLI);
    expect(r.nm).toBeGreaterThan(direct);
    expect(r.nm).toBeLessThan(direct * 1.4);
  });

  it('umfährt Paros auf dem Weg von Naoussa nach Sifnos', () => {
    const r = seaRoute([PAROS_NAOUSSA, SIFNOS_KAMARES]);
    expect(pathCrossesLand(r.path)).toBe(false);
    expect(r.unresolved).toBe(false);
  });

  it('führt von Ornos nach Naoussa ohne Delos zu queren', () => {
    const r = seaRoute([MYKONOS_ORNOS, PAROS_NAOUSSA]);
    expect(pathCrossesLand(r.path)).toBe(false);
  });

  it('behält Start und Ziel exakt', () => {
    const r = seaRoute([KEA_VOURKARI, SYROS_ERMOUPOLI]);
    expect(r.path[0]).toEqual(KEA_VOURKARI);
    expect(r.path[r.path.length - 1]).toEqual(SYROS_ERMOUPOLI);
  });

  it('führt auch von Bucht zu Bucht derselben Insel ums Land', () => {
    // Parikia (West) nach Naoussa (Nord) — quer über Paros wäre kürzer, aber
    // kein Boot fährt das.
    const r = seaRoute([PAROS_PARIKIA, PAROS_NAOUSSA]);
    expect(pathCrossesLand(r.path)).toBe(false);
    expect(r.nm).toBeGreaterThan(distanceNm(PAROS_PARIKIA, PAROS_NAOUSSA));
  });

  /**
   * Ein Umfahrungspunkt an Land ist kein Umfahrungspunkt. Die Ecken werden vom
   * Land nach aussen versetzt, aber in einer zerklüfteten Bucht zeigt die
   * Winkelhalbierende zurück ins Land — bei Vourkari (Kea) landete so ein
   * Punkt 14 m INNERHALB der Küstenlinie.
   */
  it('legt keinen Umfahrungspunkt an Land', () => {
    const r = seaRoute([KEA_VOURKARI, SYROS_ERMOUPOLI]);
    // Start und Ziel selbst dürfen hinter der Küstenlinie liegen (Buchten
    // schneidet die Quellauflösung ab) — die EINGEFÜGTEN Punkte nie.
    expect(r.path.slice(1, -1).filter(isOnLand)).toEqual([]);
  });

  it('rechnet die Kurslänge über alle Punkte', () => {
    const pts = [KEA_VOURKARI, OPEN_SEA, SIFNOS_KAMARES];
    expect(pathLengthNm(pts)).toBeCloseTo(
      distanceNm(KEA_VOURKARI, OPEN_SEA) + distanceNm(OPEN_SEA, SIFNOS_KAMARES),
      6,
    );
  });
});
