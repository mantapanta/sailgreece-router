/**
 * Generator für `src/domain/data/landmass.ts` — die Landmasken des Reviers.
 *
 * Warum überhaupt Landgeometrie in einer Törnplanung: eine Etappe ist eine
 * Linie zwischen zwei Häfen, und eine Linie zwischen zwei Häfen führt in den
 * Kykladen fast immer über eine Insel. Ohne Küstenlinie kann die App den
 * Unterschied nicht sehen — sie zeichnete und rechnete Kurse, die quer über
 * Syros oder Paros liefen. Mit der Küstenlinie ist "geht da ein Boot durch?"
 * eine Frage, die die Domäne beantworten kann (domain/searoute.ts).
 *
 * Quelle: @geo-maps/earth-coastlines-250m (OpenStreetMap, ODbL 1.0), 250 m
 * Auflösung. Nicht als Abhängigkeit eingebunden: das Weltpaket ist ~19 MB, das
 * Revier daraus ~100 KB. Also einmal ziehen, zuschneiden, das Ergebnis
 * einchecken — die App lädt keine Weltkarte, um zu wissen, dass Syros im Weg
 * liegt.
 *
 * Aufruf:
 *   npm pack @geo-maps/earth-coastlines-250m --pack-destination /tmp
 *   tar xzf /tmp/geo-maps-earth-coastlines-250m-*.tgz -C /tmp
 *   node seeding/tools/extractLandmass.ts /tmp/package/map.geo.json
 *
 * Das Ergebnis ist deterministisch: gleiche Quelle, gleiche Datei.
 */

import { writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Revier-Fenster: Saronischer Golf bis Santorin/Anafi, Kea bis Amorgos. Alles
 * ausserhalb ist für diesen Törn Ballast — und Ballast, den jedes Handy im
 * Hafen-WLAN mitladen müsste.
 */
const BBOX = { lonMin: 22.7, latMin: 36.1, lonMax: 26.5, latMax: 38.5 } as const;

/** Nachkommastellen der Ausgabe: 4 ≈ 11 m — feiner als die 250-m-Quelle. */
const DECIMALS = 4;

type Point = [number, number];

// ---------------------------------------------------------------------------
// Zuschnitt
// ---------------------------------------------------------------------------

/**
 * Sutherland-Hodgman gegen das Revier-Fenster. Für konvexe Clip-Fenster ist
 * das Verfahren exakt, und ein Rechteck ist konvex.
 *
 * Der Zuschnitt legt künstliche Kanten auf die Fensterränder — dort, wo
 * Festland aus dem Revier hinausläuft. Das ist gewollt: eine Route, die den
 * Fensterrand kreuzt, hat das Revier verlassen und ist ohnehin keine Etappe
 * dieses Törns.
 */
function clipToBbox(ring: Point[]): Point[] {
  const edges: [(p: Point) => boolean, (a: Point, b: Point) => Point][] = [
    [
      (p) => p[0] >= BBOX.lonMin,
      (a, b) => [BBOX.lonMin, a[1] + ((b[1] - a[1]) * (BBOX.lonMin - a[0])) / (b[0] - a[0])],
    ],
    [
      (p) => p[0] <= BBOX.lonMax,
      (a, b) => [BBOX.lonMax, a[1] + ((b[1] - a[1]) * (BBOX.lonMax - a[0])) / (b[0] - a[0])],
    ],
    [
      (p) => p[1] >= BBOX.latMin,
      (a, b) => [a[0] + ((b[0] - a[0]) * (BBOX.latMin - a[1])) / (b[1] - a[1]), BBOX.latMin],
    ],
    [
      (p) => p[1] <= BBOX.latMax,
      (a, b) => [a[0] + ((b[0] - a[0]) * (BBOX.latMax - a[1])) / (b[1] - a[1]), BBOX.latMax],
    ],
  ];

  let pts = ring;
  for (const [inside, intersect] of edges) {
    if (pts.length === 0) return [];
    const out: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const aIn = inside(a);
      const bIn = inside(b);
      if (aIn) out.push(a);
      if (aIn !== bIn) out.push(intersect(a, b));
    }
    pts = out;
  }
  return pts;
}

/** Douglas-Peucker in Grad — hält die 250-m-Quelle, wirft nur Duplikate raus. */
function simplify(ring: Point[], epsDeg: number): Point[] {
  if (ring.length <= 4) return ring;
  const keep = new Array<boolean>(ring.length).fill(false);
  keep[0] = true;
  keep[ring.length - 1] = true;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    let far = -1;
    let maxD = 0;
    const a = ring[lo]!;
    const b = ring[hi]!;
    for (let i = lo + 1; i < hi; i++) {
      const p = ring[i]!;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      const d =
        len === 0
          ? Math.hypot(p[0] - a[0], p[1] - a[1])
          : Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / len;
      if (d > maxD) {
        maxD = d;
        far = i;
      }
    }
    if (far > 0 && maxD > epsDeg) {
      keep[far] = true;
      stack.push([lo, far], [far, hi]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

// ---------------------------------------------------------------------------
// Lauf
// ---------------------------------------------------------------------------

interface Geometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

async function main(): Promise<void> {
  const source = process.argv[2];
  if (!source) {
    console.error('Aufruf: node seeding/tools/extractLandmass.ts <map.geo.json>');
    process.exit(1);
  }
  const raw = JSON.parse(await readFile(source, 'utf8')) as {
    type: string;
    geometries?: Geometry[];
    features?: { geometry: Geometry }[];
  };
  const geometries: Geometry[] =
    raw.geometries ?? (raw.features ?? []).map((f) => f.geometry);

  // Nur die Aussenringe: Löcher sind Binnenseen, und ein Binnensee ist für
  // eine Segelroute genauso undurchdringlich wie das Land um ihn herum.
  const outerRings: Point[][] = [];
  for (const g of geometries) {
    const polygons = (
      g.type === 'Polygon' ? [g.coordinates] : g.coordinates
    ) as number[][][][];
    for (const poly of polygons) {
      const outer = poly[0];
      if (outer) outerRings.push(outer.map((c) => [c[0]!, c[1]!] as Point));
    }
  }

  const rings: Point[][] = [];
  for (const ring of outerRings) {
    // Geschlossene Ringe kommen mit doppeltem Endpunkt — der Clip arbeitet auf
    // der impliziten Schliessung.
    const open =
      ring.length > 1 &&
      ring[0]![0] === ring[ring.length - 1]![0] &&
      ring[0]![1] === ring[ring.length - 1]![1]
        ? ring.slice(0, -1)
        : ring;
    const clipped = simplify(clipToBbox(open), 0.0002);
    if (clipped.length >= 3) rings.push(clipped);
  }

  // Stabile Reihenfolge: grösste Landmasse zuerst. Damit ist die Datei bei
  // gleicher Quelle bitgleich, egal in welcher Reihenfolge die Quelle liest.
  const area = (r: Point[]): number => {
    let s = 0;
    for (let i = 0; i < r.length; i++) {
      const a = r[i]!;
      const b = r[(i + 1) % r.length]!;
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s / 2);
  };
  rings.sort((a, b) => area(b) - area(a) || a[0]![0] - b[0]![0] || a[0]![1] - b[0]![1]);

  const round = (v: number): string => Number(v.toFixed(DECIMALS)).toString();
  const body = rings
    .map((r) => `  [${r.map((p) => `${round(p[0])},${round(p[1])}`).join(', ')}],`)
    .join('\n');
  const vertices = rings.reduce((n, r) => n + r.length, 0);

  const out = `/**
 * Küstenlinien des Reviers — GENERIERT, nicht von Hand pflegen.
 *
 * Erzeugt von seeding/tools/extractLandmass.ts aus
 * @geo-maps/earth-coastlines-250m (OpenStreetMap-Daten, ODbL 1.0), zugeschnitten
 * auf ${BBOX.lonMin}–${BBOX.lonMax}° E / ${BBOX.latMin}–${BBOX.latMax}° N.
 * ${rings.length} Ringe, ${vertices} Stützpunkte, ${DECIMALS} Nachkommastellen (~11 m).
 *
 * Wozu: domain/searoute.ts beantwortet damit die Frage, die eine Törnplanung
 * nie raten darf — liegt zwischen diesen zwei Häfen Land? Ein Segelboot fährt
 * nicht durch eine Insel.
 *
 * Format: ein Ring je Eintrag, flach als [lon, lat, lon, lat, …]. Flach, weil
 * das die Datei rund ein Drittel kleiner macht als Punktpaare und die Schleifen
 * in searoute.ts ohnehin über Indizes laufen. Ringe sind implizit geschlossen
 * (letzter Punkt verbindet zurück zum ersten), Aussenringe only.
 */

/** Landringe des Reviers, flach kodiert: [lon, lat, lon, lat, …]. */
export const LAND_RINGS: readonly (readonly number[])[] = [
${body}
];

/** Fenster, auf das die Ringe zugeschnitten sind (lon/lat). */
export const LAND_BBOX = {
  lonMin: ${BBOX.lonMin},
  latMin: ${BBOX.latMin},
  lonMax: ${BBOX.lonMax},
  latMax: ${BBOX.latMax},
} as const;
`;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const target = path.resolve(here, '../../src/domain/data/landmass.ts');
  writeFileSync(target, out, 'utf8');
  console.log(
    `${rings.length} Ringe / ${vertices} Stützpunkte -> ${path.relative(process.cwd(), target)}`,
  );
}

await main();
