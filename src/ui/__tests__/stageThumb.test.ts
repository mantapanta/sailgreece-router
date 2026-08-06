/**
 * Der Etappen-Schnipsel ist ein Bild ohne Beschriftung — was er falsch zeichnet,
 * fällt niemandem auf. Deshalb steht hier, was er nicht darf: aus dem Rahmen
 * laufen, eine Kurzetappe bis zur Unkenntlichkeit aufziehen, Nord und Süd
 * verwechseln oder die halbe Küste des Reviers in einen Pfad schreiben, der gar
 * nicht im Bild liegt.
 */
import { describe, expect, it } from 'vitest';
import { stageThumbGeometry } from '../stageThumb.ts';

const ATHEN = { lat: 37.9, lng: 23.7 };
const KEA = { lat: 37.66, lng: 24.32 };

/** Alle Zahlenpaare eines SVG-Pfads als Punkte. */
function pathPoints(d: string): { x: number; y: number }[] {
  return [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
  }));
}

describe('stageThumbGeometry', () => {
  it('zeichnet nichts, wo es keine Strecke gibt (Hafentag, unauflösbare Etappe)', () => {
    expect(stageThumbGeometry([])).toBeNull();
    expect(stageThumbGeometry([ATHEN])).toBeNull();
  });

  it('legt die Etappe vollständig und mit Rand in die Leinwand', () => {
    const geo = stageThumbGeometry([ATHEN, KEA], { width: 96, height: 72 })!;
    expect(geo).not.toBeNull();
    const pts = pathPoints(geo.route);
    expect(pts).toHaveLength(2);
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(96);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(72);
    }
    expect(geo.start).toEqual(pts[0]);
    expect(geo.end).toEqual(pts[1]);
  });

  it('behält jeden Punkt der Etappe — die Strecke wird nicht ausgedünnt', () => {
    const path = [ATHEN, { lat: 37.8, lng: 23.9 }, { lat: 37.7, lng: 24.1 }, KEA];
    const geo = stageThumbGeometry(path, { width: 96, height: 72 })!;
    expect(pathPoints(geo.route)).toHaveLength(path.length);
  });

  it('zeichnet Norden oben und Osten rechts', () => {
    // Athen liegt nördlich und westlich von Kea.
    const geo = stageThumbGeometry([ATHEN, KEA])!;
    expect(geo.start.y).toBeLessThan(geo.end.y);
    expect(geo.start.x).toBeLessThan(geo.end.x);
  });

  it('hält den Massstab bei einer Kurzetappe an der Mindestspanne', () => {
    // Zwei Buchten derselben Insel — knapp 2 sm auseinander. Ohne Mindest-
    // ausschnitt füllte diese Etappe den Schnipsel wie eine Revierquerung.
    const geo = stageThumbGeometry(
      [
        { lat: 37.66, lng: 24.32 },
        { lat: 37.64, lng: 24.34 },
      ],
      { width: 96, height: 72, minSpanDeg: 0.25 },
    )!;
    const laenge = Math.hypot(geo.end.x - geo.start.x, geo.end.y - geo.start.y);
    // 0,028° von 0,25° Mindestspanne — mit Rand rund ein Zehntel der Leinwand.
    expect(laenge).toBeLessThan(20);
    expect(laenge).toBeGreaterThan(2);
  });

  it('nimmt nur Landringe auf, die in den Ausschnitt ragen', () => {
    const imBild = [23.6, 37.8, 23.8, 37.8, 23.8, 38.0, 23.6, 38.0];
    const weitWeg = [20.0, 30.0, 20.2, 30.0, 20.2, 30.2, 20.0, 30.2];
    const geo = stageThumbGeometry([ATHEN, KEA], { rings: [imBild, weitWeg] })!;
    expect(geo.land).not.toBe('');
    // Ein Ring, ein geschlossener Teilpfad.
    expect(geo.land.match(/M/g)).toHaveLength(1);
    expect(geo.land.endsWith('Z')).toBe(true);
  });

  it('meldet offene See als leeren Landpfad', () => {
    const weitWeg = [20.0, 30.0, 20.2, 30.0, 20.2, 30.2, 20.0, 30.2];
    const geo = stageThumbGeometry([ATHEN, KEA], { rings: [weitWeg] })!;
    expect(geo.land).toBe('');
  });

  it('dünnt Küstenpunkte aus, die im selben Pixel lägen', () => {
    // 200 Stützpunkte auf einem Grad-Hundertstel — auf dem Schnipsel ein Punkt.
    const dicht: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      dicht.push(23.75 + i * 0.00005, 37.78 + (i % 2) * 0.00005);
    }
    dicht.push(23.9, 37.9, 23.7, 37.95);
    const geo = stageThumbGeometry([ATHEN, KEA], { rings: [dicht] })!;
    expect(pathPoints(geo.land).length).toBeLessThan(10);
  });

  it('klemmt ferne Küsten, statt Pfade über Zehntausende Pixel zu schreiben', () => {
    // Ein Ring, der den Ausschnitt schneidet und weit darüber hinausreicht.
    const riesig = [10, 20, 40, 20, 40, 50, 10, 50];
    const geo = stageThumbGeometry([ATHEN, KEA], { width: 96, height: 72, rings: [riesig] })!;
    for (const p of pathPoints(geo.land)) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(3 * 96);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(3 * 72);
    }
  });

  it('zeichnet aus den echten Küstenlinien des Reviers', () => {
    // Ohne Ring-Option: die Etappe Athen → Kea hat Attika und Kea im Bild.
    const geo = stageThumbGeometry([ATHEN, KEA])!;
    expect(geo.land.length).toBeGreaterThan(50);
  });
});
