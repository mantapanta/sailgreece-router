/**
 * Der Kartenschnipsel einer Tagesetappe — reine Geometrie, kein React, kein
 * Google Maps.
 *
 * WOZU. Die Etappenkarte sagt bisher in Worten, wohin es geht ("Athen → Kea");
 * die Strecke selbst sieht man erst, wenn man die Rechnung aufklappt. Genau die
 * eine Frage, die ein Blick beantwortet — liegt das Ziel um die Ecke oder quer
 * übers Revier, und in welche Richtung — kostete damit zwei Klicks. Der
 * Schnipsel beantwortet sie an Ort und Stelle.
 *
 * WARUM SVG STATT GOOGLE MAPS. Ein Thumbnail ist ein Bild, keine Karte: nichts
 * daran wird gezoomt, verschoben oder angetippt. Eine Maps-Instanz je Etappe
 * wäre ein Skript-Ladevorgang und ein Kachel-Kontingent für 96×72 Pixel — und
 * sie fehlte genau dann, wenn kein Maps-Key konfiguriert ist. Die Küstenlinien
 * liegen ohnehin im Bundle (domain/data/landmass.ts, die Landfrage des
 * Routers), also zeichnet der Schnipsel aus denselben Daten, aus denen die
 * Etappe gelegt wurde.
 *
 * PROJEKTION. Äquidistant-zylindrisch mit cos(φ) auf der Längenachse: auf
 * Reviergrösse (rund 2° × 2°) ist der Unterschied zu Mercator kleiner als ein
 * Pixel, und die Umkehrung bleibt eine Multiplikation.
 */

import { LAND_RINGS } from '../domain/data/landmass.ts';

export interface ThumbPoint {
  x: number;
  y: number;
}

export interface StageThumbGeometry {
  width: number;
  height: number;
  /**
   * ALLE sichtbaren Landringe als EIN SVG-Pfad. Ein Pfad je Ring wäre je nach
   * Ausschnitt ein Dutzend zusätzlicher Knoten für dieselbe Füllung; die Ringe
   * der Bibliothek sind Aussenringe ohne Löcher, also darf alles in einen.
   * Leerer String heisst: offene See im ganzen Ausschnitt.
   */
  land: string;
  /** Die Etappe selbst — Startplatz, Wegpunkte, Ziel, in dieser Reihenfolge. */
  route: string;
  start: ThumbPoint;
  end: ThumbPoint;
}

export interface StageThumbOptions {
  width?: number;
  height?: number;
  /** Rand um die Etappe, als Anteil der längeren Kante ihrer Bounding-Box. */
  padding?: number;
  /**
   * Kleinster dargestellter Ausschnitt in Grad Breite. Ohne ihn zöge eine
   * Kurzetappe (Vourkari → Nachbarbucht) den Massstab so weit auf, dass der
   * Schnipsel nur noch Küstenkringel zeigt und die Etappe im Revier nicht mehr
   * wiederzuerkennen ist.
   */
  minSpanDeg?: number;
  /** Nur für Tests — sonst die Küstenlinien des Reviers. */
  rings?: readonly (readonly number[])[];
}

const DEFAULT_WIDTH = 96;
const DEFAULT_HEIGHT = 72;
const DEFAULT_PADDING = 0.3;
const DEFAULT_MIN_SPAN_DEG = 0.25;

/**
 * Küstenpunkte, die auf dem Schnipsel näher als das beieinander liegen, fallen
 * weg. Die Ringe sind auf 11 m genau — bei ~1 km je Pixel wären das rund
 * hundert Stützpunkte pro sichtbarem Pixel, alle im selben Punkt.
 *
 * Warum nicht gröber: der Schnipsel ist SVG und wird auf dem Telefon mit
 * zwei- bis dreifacher Pixeldichte gerastert. Ein Schwellwert, der bei 96 CSS-
 * Pixeln noch sauber aussieht, kantet dort sichtbar aus.
 */
const COAST_EPS_PX = 0.6;

/**
 * Ausserhalb dieses Rahmens (in Vielfachen der Leinwand) wird geklemmt: eine
 * Insel am Bildrand kann in Projektion Zehntausende Pixel weit reichen, und
 * solche Zahlen im Pfad kosten Bytes und Rechenzeit für nichts. Der Rahmen ist
 * bewusst gross — geklemmt wird weit ausserhalb des Sichtfelds, damit keine
 * Küste im Bild eine Kante bekommt, die sie nicht hat.
 */
const CLAMP_MARGIN = 2;

const DEG = Math.PI / 180;

/** Ein Nachkommastellen-Raster reicht: feiner als ein Zehntelpixel zeichnet niemand. */
function round(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Achse auf eine Mindestspanne aufziehen — symmetrisch um ihre Mitte. */
function growTo(min: number, max: number, minSpan: number): [number, number] {
  const fehlt = minSpan - (max - min);
  return fehlt > 0 ? [min - fehlt / 2, max + fehlt / 2] : [min, max];
}

/**
 * Die Geometrie eines Etappen-Schnipsels, oder null, wenn es nichts zu zeichnen
 * gibt (Hafentag, unauflösbare Etappe — dieselbe Bedingung wie in StageMap).
 */
export function stageThumbGeometry(
  path: readonly google.maps.LatLngLiteral[],
  options: StageThumbOptions = {},
): StageThumbGeometry | null {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const padding = options.padding ?? DEFAULT_PADDING;
  const minSpanDeg = options.minSpanDeg ?? DEFAULT_MIN_SPAN_DEG;
  const rings = options.rings ?? LAND_RINGS;

  if (path.length < 2) return null;

  // Massstab der Längenachse auf der mittleren Breite der Etappe. Auf 37° N
  // sind 1° Länge rund 0,8° Breite — ohne den Faktor läge das Revier gestaucht.
  let latSum = 0;
  for (const p of path) latSum += p.lat;
  const kx = Math.cos((latSum / path.length) * DEG);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of path) {
    const x = p.lng * kx;
    const y = -p.lat; // Norden ist oben, die Bildachse zeigt nach unten.
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  [minX, maxX] = growTo(minX, maxX, minSpanDeg * kx);
  [minY, maxY] = growTo(minY, maxY, minSpanDeg);

  // EIN Rand für beide Achsen, gemessen an der längeren: ein anteiliger Rand je
  // Achse würde die kurze Achse relativ weiter aufziehen und den Kurs damit
  // flacher zeichnen, als er liegt.
  const pad = padding * Math.max(maxX - minX, maxY - minY);
  minX -= pad;
  maxX += pad;
  minY -= pad;
  maxY += pad;

  // Einpassen ohne Verzerrung: der kleinere Massstab gewinnt, die freie Achse
  // bekommt den Überschuss als Wasser.
  const scale = Math.min(width / (maxX - minX), height / (maxY - minY));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const clampX = (v: number) =>
    Math.min(Math.max(v, -CLAMP_MARGIN * width), (1 + CLAMP_MARGIN) * width);
  const clampY = (v: number) =>
    Math.min(Math.max(v, -CLAMP_MARGIN * height), (1 + CLAMP_MARGIN) * height);
  const toX = (lon: number) => (lon * kx - cx) * scale + width / 2;
  const toY = (lat: number) => (-lat - cy) * scale + height / 2;

  // Sichtfeld in Projektionseinheiten — der Test, mit dem 148 Ringe auf die paar
  // reduziert werden, die überhaupt ins Bild ragen.
  const halfW = width / (2 * scale);
  const halfH = height / (2 * scale);
  const vMinX = cx - halfW;
  const vMaxX = cx + halfW;
  const vMinY = cy - halfH;
  const vMaxY = cy + halfH;

  const landParts: string[] = [];
  for (const ring of rings) {
    if (ring.length < 6) continue; // weniger als drei Punkte ist kein Ring

    let rMinLon = Infinity;
    let rMaxLon = -Infinity;
    let rMinLat = Infinity;
    let rMaxLat = -Infinity;
    for (let i = 0; i < ring.length - 1; i += 2) {
      const lon = ring[i]!;
      const lat = ring[i + 1]!;
      if (lon < rMinLon) rMinLon = lon;
      if (lon > rMaxLon) rMaxLon = lon;
      if (lat < rMinLat) rMinLat = lat;
      if (lat > rMaxLat) rMaxLat = lat;
    }
    // Bounding-Box gegen Sichtfeld — beide in Projektionseinheiten, y gespiegelt.
    if (
      rMaxLon * kx < vMinX ||
      rMinLon * kx > vMaxX ||
      -rMinLat < vMinY ||
      -rMaxLat > vMaxY
    ) {
      continue;
    }

    let d = '';
    let n = 0;
    let lastX = 0;
    let lastY = 0;
    for (let i = 0; i < ring.length - 1; i += 2) {
      const x = clampX(toX(ring[i]!));
      const y = clampY(toY(ring[i + 1]!));
      if (n > 0 && Math.abs(x - lastX) + Math.abs(y - lastY) < COAST_EPS_PX) continue;
      d += `${n === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`;
      lastX = x;
      lastY = y;
      n += 1;
    }
    // Nach dem Ausdünnen kann ein ferner Ring auf einen Punkt zusammenfallen —
    // eine Fläche ist das nicht mehr.
    if (n >= 3) landParts.push(`${d}Z`);
  }

  let route = '';
  for (let i = 0; i < path.length; i += 1) {
    const p = path[i]!;
    route += `${i === 0 ? 'M' : 'L'}${round(toX(p.lng))} ${round(toY(p.lat))}`;
  }

  const first = path[0]!;
  const last = path[path.length - 1]!;

  return {
    width,
    height,
    land: landParts.join(''),
    route,
    start: { x: round(toX(first.lng)), y: round(toY(first.lat)) },
    end: { x: round(toX(last.lng)), y: round(toY(last.lat)) },
  };
}
