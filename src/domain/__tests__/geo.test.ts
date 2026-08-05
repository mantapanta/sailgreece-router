import { describe, expect, it } from 'vitest';
import { compassPoint, isClockwise, signedAreaDeg2 } from '../geo.ts';

/**
 * Der Umlaufsinn entscheidet mit, welchen Round-Trip der Solver wählt: in den
 * Kykladen wird empfohlen, im Uhrzeigersinn zu routen — mit dem Meltemi im
 * Rücken nach Süden und an der Westseite zurück, statt sich am Ende gegenan
 * nach Norden zu quälen. Ein Vorzeichenfehler hier drehte die Empfehlung um.
 */
describe('signedAreaDeg2 / isClockwise — Umlaufsinn eines Kurses', () => {
  /** Einheitsquadrat gegen den Uhrzeigersinn (Osten rechts, Norden oben). */
  const gegenUhrzeiger = [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 1 },
    { lat: 1, lon: 1 },
    { lat: 1, lon: 0 },
  ];

  it('erkennt den Gegenuhrzeigersinn als positiv', () => {
    expect(signedAreaDeg2(gegenUhrzeiger)).toBeGreaterThan(0);
    expect(isClockwise(gegenUhrzeiger)).toBe(false);
  });

  it('erkennt den Uhrzeigersinn als negativ', () => {
    const imUhrzeiger = [...gegenUhrzeiger].reverse();
    expect(signedAreaDeg2(imUhrzeiger)).toBeLessThan(0);
    expect(isClockwise(imUhrzeiger)).toBe(true);
  });

  it('Athen → Ost → Süd → West → zurück ist der Uhrzeigersinn', () => {
    // Die reale Form der Ostkykladen-Runde: erst nach Osten, dann nach Süden,
    // dann an der Westseite zurück nach Norden.
    const runde = [
      { lat: 37.9, lon: 23.7 }, // Athen
      { lat: 37.5, lon: 24.9 }, // Syros/Mykonos (Ost)
      { lat: 36.4, lon: 25.4 }, // Santorin (Süd)
      { lat: 36.7, lon: 24.4 }, // Milos (West)
      { lat: 37.4, lon: 24.4 }, // Serifos/Kythnos (Nordwest)
    ];
    expect(isClockwise(runde)).toBe(true);
  });

  it('dieselbe Runde rückwärts gefahren ist es nicht', () => {
    const runde = [
      { lat: 37.9, lon: 23.7 },
      { lat: 37.5, lon: 24.9 },
      { lat: 36.4, lon: 25.4 },
      { lat: 36.7, lon: 24.4 },
      { lat: 37.4, lon: 24.4 },
    ];
    expect(isClockwise([...runde].reverse())).toBe(false);
  });

  it('weniger als drei Punkte umschliessen nichts — kein erfundener Umlaufsinn', () => {
    expect(signedAreaDeg2([])).toBe(0);
    expect(signedAreaDeg2([{ lat: 37, lon: 24 }])).toBe(0);
    expect(signedAreaDeg2([{ lat: 37, lon: 24 }, { lat: 38, lon: 25 }])).toBe(0);
  });

  it('ein doppelter Punkt am Ende (geschlossener Ring) ändert nichts', () => {
    const geschlossen = [...gegenUhrzeiger, gegenUhrzeiger[0]!];
    expect(signedAreaDeg2(geschlossen)).toBeCloseTo(signedAreaDeg2(gegenUhrzeiger), 9);
  });
});

describe('compassPoint — Richtungsnamen der Domain', () => {
  it('trifft die Hauptrichtungen', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(180)).toBe('S');
    expect(compassPoint(270)).toBe('W');
  });

  it('rundet auf den nächsten der 16 Punkte', () => {
    expect(compassPoint(22)).toBe('NNE');
    expect(compassPoint(338)).toBe('NNW');
  });

  it('normalisiert ausserhalb liegende Winkel', () => {
    expect(compassPoint(361)).toBe('N');
    expect(compassPoint(-90)).toBe('W');
  });
});
