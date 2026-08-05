/**
 * FR3/FR10-Lesbarkeit — wie viele Windfiedern die Karte verträgt.
 *
 * Die Fiedern hingen an der PLATZ-Liste: 97 Liegeplätze, auf mancher Insel vier
 * oder fünf davon wenige Seemeilen auseinander. Meteorologisch sind das keine
 * 97 Aussagen, sondern eine Handvoll — die dicht beieinander liegenden Plätze
 * lesen dieselbe Modellzelle. Auf Zoom 8, wo die ganzen Kykladen ins Bild
 * passen, lagen sie deshalb als Knäuel übereinander und verdeckten genau das,
 * wofür die Karte da ist.
 *
 * Zwei Regeln, beide hier und beide pur (die View rechnet nichts nach):
 *
 *   1. EINE Fieder je Insel. Fünf Pfeile über Paros zeigen fünfmal denselben
 *      Wind — das ist keine Information, das ist Farbe.
 *   2. Danach ein Mindestabstand AUF DEM SCHIRM. Der ist zoomabhängig, weil
 *      Überladung eine Frage von Pixeln ist und nicht von Seemeilen: heraus-
 *      gezoomt bleiben ein paar Fiedern über dem Revier, hineingezoomt kommen
 *      die Nachbarinseln von selbst dazu.
 *
 * Wer wegfällt, entscheidet die Priorität, nicht der Zufall: die Inseln, um die
 * es heute geht, stehen immer da.
 */

/** Eine Fieder-Kandidatin: ein Windwert an einem Ort. */
export interface BarbPoint {
  /** Stabiler React-Key — zugleich der deterministische Tie-Break. */
  key: string;
  lat: number;
  lon: number;
  /** Richtung, AUS DER der Wind weht (AD-6). */
  dirDeg: number;
  knots: number;
  /**
   * Kleiner = wichtiger. 0 = heute entscheidungsrelevant (aktuelle Insel und
   * Tagesziel), 1 = auf der Hauptroute, 2 = Revier ringsum. Beim Ausdünnen
   * gewinnt die kleinere Zahl — eine Fieder über dem heutigen Ziel darf nie
   * einer beliebigen Nachbarinsel weichen.
   */
  priority: number;
}

/**
 * Mindestabstand zweier Fiedern auf dem Schirm.
 *
 * Eine Fieder ist rund 34 px hoch und sitzt luvseitig versetzt; unter etwa der
 * doppelten Kantenlänge fangen Schaft und Fiedern an, sich zu überschneiden.
 */
export const MIN_BARB_SPACING_PX = 72;

/**
 * Pixel je Längengrad in der Web-Mercator-Kachelpyramide, die Google Maps
 * verwendet: 256 px pro Kachel, 2^zoom Kacheln über 360°.
 */
export function pxPerLonDeg(zoom: number): number {
  return (256 * 2 ** zoom) / 360;
}

/**
 * Bildschirmabstand zweier Koordinaten in Pixeln (Näherung um die mittlere
 * Breite). In Mercator ist ein Breitengrad um 1/cos(φ) länger als ein
 * Längengrad — ohne diese Korrektur wären die Abstände auf 37° N in
 * Nord-Süd-Richtung rund 20 % zu klein geschätzt und die Fiedern stünden
 * untereinander doch wieder zu dicht.
 */
export function pixelDistance(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  zoom: number,
): number {
  const scale = pxPerLonDeg(zoom);
  const midLatRad = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  const cos = Math.max(Math.cos(midLatRad), 0.2);
  const dx = (b.lon - a.lon) * scale;
  const dy = ((b.lat - a.lat) * scale) / cos;
  return Math.hypot(dx, dy);
}

/**
 * Eine Fieder je Insel. `byIsland` bildet den Key auf die Insel ab; Punkte ohne
 * Insel-Zuordnung bleiben einzeln stehen, statt stillschweigend zu einer
 * Sammelinsel zu verschmelzen.
 *
 * Es gewinnt die wichtigere Priorität, bei Gleichstand der kleinere Key — damit
 * dieselbe Karte zweimal dasselbe zeigt.
 */
export function onePerIsland(
  points: BarbPoint[],
  islandOf: (key: string) => string | null,
): BarbPoint[] {
  const best = new Map<string, BarbPoint>();
  const loose: BarbPoint[] = [];
  for (const p of points) {
    const island = islandOf(p.key);
    if (island === null) {
      loose.push(p);
      continue;
    }
    const current = best.get(island);
    if (
      !current ||
      p.priority < current.priority ||
      (p.priority === current.priority && p.key < current.key)
    ) {
      best.set(island, p);
    }
  }
  return [...best.values(), ...loose];
}

/**
 * Greedy-Ausdünnung: in Prioritätsreihenfolge durchgehen und eine Fieder nur
 * behalten, wenn sie weit genug von allen bereits behaltenen entfernt ist.
 *
 * Das ist die Entzerrung, die meteorologische Karten seit jeher machen — und
 * sie ist stabil: gleiche Eingabe, gleiche Karte, unabhängig von der Reihenfolge
 * der Bibliothek.
 */
export function thinBarbs(
  points: BarbPoint[],
  zoom: number,
  minSpacingPx: number = MIN_BARB_SPACING_PX,
): BarbPoint[] {
  const ordered = [...points].sort(
    (a, b) => a.priority - b.priority || a.key.localeCompare(b.key),
  );
  const kept: BarbPoint[] = [];
  for (const p of ordered) {
    if (kept.every((k) => pixelDistance(k, p, zoom) >= minSpacingPx)) kept.push(p);
  }
  return kept;
}

/**
 * Der ganze Weg von den Kandidaten zur gezeigten Auswahl.
 *
 * Gibt AUCH zurück, wie viele weggefallen sind: eine Karte, die stillschweigend
 * kürzt, behauptet Vollständigkeit, die sie nicht hat. Die Legende sagt es
 * dazu, und die Zahl ist der Hinweis, dass Hineinzoomen mehr zeigt.
 */
export function windFieldFor(
  points: BarbPoint[],
  islandOf: (key: string) => string | null,
  zoom: number,
  minSpacingPx: number = MIN_BARB_SPACING_PX,
): { shown: BarbPoint[]; hidden: number; islands: number } {
  const perIsland = onePerIsland(points, islandOf);
  const shown = thinBarbs(perIsland, zoom, minSpacingPx);
  return {
    shown,
    hidden: perIsland.length - shown.length,
    islands: perIsland.length,
  };
}
