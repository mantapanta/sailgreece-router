/**
 * Ein Segelboot fährt nicht durch eine Insel.
 *
 * Bis hierher war eine Etappe eine gerade Linie zwischen zwei Häfen. In den
 * Kykladen liegt zwischen zwei Häfen aber fast immer Land: Ermoupoli sitzt auf
 * der OSTseite von Syros, wer von Kea kommt, hat die ganze Insel vor dem Bug.
 * Die Karte zeichnete diese Linie quer über Syros, und schlimmer — die
 * Bewertung rechnete sie auch so: ein Kurs, den kein Boot fahren kann, mit
 * einem Windeinfallswinkel, den es nie sehen wird.
 *
 * Dieses Modul beantwortet zwei Fragen gegen die Küstenlinie des Reviers
 * (data/landmass.ts):
 *   1. `landCrossingNm` — wie viele Seemeilen dieser Schlag über Land laufen
 *   2. `seaRoute` — welcher Kurs stattdessen um das Land herum führt
 *
 * Beides ist reine Geometrie: keine I/O, deterministisch, gecacht.
 *
 * Bewusst NICHT modelliert: Tiefen, Untiefen, Riffe, Sperrgebiete. Das Modul
 * sagt "hier ist Land", nicht "hier ist es sicher" — die Ansteuerung bleibt
 * Seekarte und Skipper. Genau deshalb bekommt jeder Endpunkt eine
 * Ansteuerungszone (`APPROACH_NM`), in der die eigene Insel den Kurs nicht
 * blockiert: der letzte Kilometer in die Bucht ist Pilotage, nicht Routing.
 */

import type { Coordinates } from './schema/common.ts';
import { distanceNm } from './geo.ts';
import { LAND_RINGS } from './data/landmass.ts';

// ---------------------------------------------------------------------------
// Ebene Projektion (sm)
// ---------------------------------------------------------------------------

/**
 * Alle Schnitttests laufen in einer ebenen Karte mit Seemeilen als Einheit:
 * Schnittpunkte, Abstände und Versätze sind darin eine Zeile Algebra statt
 * sphärischer Trigonometrie. Der Bezugsbreitengrad liegt in der Mitte des
 * Reviers; über 2,4° Breite bleibt der Längenfehler unter einem Prozent — für
 * "liegt da Land?" bedeutungslos. Streckenlängen werden trotzdem sphärisch
 * gerechnet (geo.distanceNm), damit keine zweite Wahrheit über Distanzen
 * entsteht.
 */
const LAT0_DEG = 37.3;
const NM_PER_DEG_LAT = 60;
const NM_PER_DEG_LON = 60 * Math.cos((LAT0_DEG * Math.PI) / 180);

interface Pt {
  x: number;
  y: number;
}

const project = (c: Coordinates): Pt => ({
  x: c.lon * NM_PER_DEG_LON,
  y: c.lat * NM_PER_DEG_LAT,
});

const unproject = (p: Pt): Coordinates => ({
  lon: p.x / NM_PER_DEG_LON,
  lat: p.y / NM_PER_DEG_LAT,
});

const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

// ---------------------------------------------------------------------------
// Landmasken
// ---------------------------------------------------------------------------

interface Ring {
  /** Stützpunkte in der sm-Ebene, implizit geschlossen. */
  pts: Pt[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Umlaufsinn: +1 gegen den Uhrzeigersinn (in x/y-Orientierung). */
  orientation: 1 | -1;
  /** Konvexe Stützpunkte, nach aussen versetzt — die Ecken zum Umfahren. */
  corners: Pt[] | null;
}

function buildRing(flat: readonly number[]): Ring {
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    pts.push(project({ lon: flat[i]!, lat: flat[i + 1]! }));
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    area2 += p.x * q.y - q.x * p.y;
  }
  return {
    pts,
    minX,
    minY,
    maxX,
    maxY,
    orientation: area2 >= 0 ? 1 : -1,
    corners: null,
  };
}

const RINGS: Ring[] = LAND_RINGS.map(buildRing);

/** Wie weit die Umfahrungsecken vom Land abgesetzt werden (sm). */
const CLEARANCE_NM = 0.3;

/**
 * Die Ecken, an denen ein Kurs eine Insel umfahren kann: konvexe Stützpunkte,
 * um `CLEARANCE_NM` nach aussen versetzt.
 *
 * Konkave Stützpunkte fallen weg — sie liegen in einer Bucht, und der kürzeste
 * Weg um ein Hindernis biegt niemals in eine Bucht hinein. Das ist keine
 * Optimierung am Rand: es halbiert bis viertelt die Knotenzahl und macht die
 * Sichtbarkeitssuche erst bezahlbar.
 */
function cornersOf(ring: Ring): Pt[] {
  if (ring.corners) return ring.corners;
  const { pts, orientation } = ring;
  const n = pts.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!;
    const cur = pts[i]!;
    const next = pts[(i + 1) % n]!;
    const cross =
      (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
    if (cross * orientation <= 0) continue;
    // Nach aussen entlang der Winkelhalbierenden der beiden anliegenden Kanten.
    const l1 = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
    const l2 = Math.hypot(cur.x - next.x, cur.y - next.y) || 1;
    let bx = (cur.x - prev.x) / l1 + (cur.x - next.x) / l2;
    let by = (cur.y - prev.y) / l1 + (cur.y - next.y) / l2;
    let bl = Math.hypot(bx, by);
    if (bl < 1e-9) {
      // Gestreckte Ecke: Normale auf die Kante nehmen, Richtung ist beliebig,
      // weil eine gestreckte Ecke keine Rolle für die Umfahrung spielt.
      bx = -(cur.y - prev.y) / l1;
      by = (cur.x - prev.x) / l1;
      bl = 1;
    }
    out.push({ x: cur.x + (bx / bl) * CLEARANCE_NM, y: cur.y + (by / bl) * CLEARANCE_NM });
  }
  ring.corners = out;
  return out;
}

// ---------------------------------------------------------------------------
// Elementargeometrie
// ---------------------------------------------------------------------------

/** Liang-Barsky: schneidet die Strecke das Rechteck (inkl. Rand)? */
function segmentHitsBox(
  a: Pt,
  b: Pt,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return (
    clip(-dx, a.x - minX) &&
    clip(dx, maxX - a.x) &&
    clip(-dy, a.y - minY) &&
    clip(dy, maxY - a.y)
  );
}

/** Liegt der Punkt in diesem Ring? (Ray-Casting, Rand zählt als aussen.) */
function pointInRing(p: Pt, ring: Ring): boolean {
  if (p.x < ring.minX || p.x > ring.maxX || p.y < ring.minY || p.y > ring.maxY) {
    return false;
  }
  const { pts } = ring;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const pi = pts[i]!;
    const pj = pts[j]!;
    if (
      pi.y > p.y !== pj.y > p.y &&
      p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Liegt dieser Punkt auf Land? */
export function isOnLand(c: Coordinates): boolean {
  const p = project(c);
  for (const ring of RINGS) if (pointInRing(p, ring)) return true;
  return false;
}

/** Kürzester Abstand eines Punkts zur Kante dieses Rings (sm). */
function distanceToRing(p: Pt, ring: Ring): number {
  let best = Infinity;
  const { pts } = ring;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const l2 = vx * vx + vy * vy;
    const t =
      l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
    const d = Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
    if (d < best) best = d;
  }
  return best;
}

/**
 * Wie weit dieser Punkt im Land liegt (sm); 0 im Wasser.
 *
 * Häfen liegen in Buchten, und eine 250-m-Küstenlinie schneidet Buchten ab —
 * bis zu 1 sm bei Poros. Das ist normal und wird von der Ansteuerungszone
 * getragen. Liegt ein Punkt WEITER im Land, ist er keine Position auf dem
 * Wasser: dann sucht `seaRoute` keinen Kurs dorthin, sondern sagt, dass es
 * keinen gibt.
 */
export function landInsetNm(c: Coordinates): number {
  const p = project(c);
  for (const ring of RINGS) {
    if (pointInRing(p, ring)) return distanceToRing(p, ring);
  }
  return 0;
}

/** Schnittparameter t (auf a→b) aller Ringkanten, aufsteigend. */
function ringCrossings(a: Pt, b: Pt, ring: Ring): number[] {
  const out: number[] = [];
  const { pts } = ring;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (let i = 0; i < pts.length; i++) {
    const c = pts[i]!;
    const d = pts[(i + 1) % pts.length]!;
    const ex = d.x - c.x;
    const ey = d.y - c.y;
    const den = dx * ey - dy * ex;
    if (den === 0) continue;
    const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / den;
    const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push(t);
  }
  out.sort((m, n) => m - n);
  return out;
}

/**
 * Obergrenze der Ansteuerung. Der am weitesten "landeinwärts" liegende
 * kuratierte Platz (Poros, Russian Bay) sitzt 1,03 sm hinter der
 * 250-m-Küstenlinie — tiefe Buchten schneidet die Quellauflösung ab. Weiter als
 * das darf keine Ansteuerung reichen, was auch immer die Geometrie sagt.
 */
const APPROACH_NM = 1.5;

/**
 * Toleranz, unter der ein Landberührer kein Landberührer ist: 0,15 sm ≈ 280 m,
 * die Grössenordnung der Quellauflösung. Ohne sie würde jede Kap-Umfahrung an
 * der eigenen Diskretisierung scheitern.
 */
const TOUCH_TOLERANCE_NM = 0.15;

/**
 * Wieviel Land dieser Endpunkt sich als ANSTEUERUNG anrechnen darf.
 *
 * Nicht pauschal `APPROACH_NM`, sondern so tief, wie der Punkt selbst hinter
 * der Küstenlinie sitzt. Das ist der ganze Grund für die Ausnahme: eine Bucht,
 * die die 250-m-Auflösung zugeschnitten hat, macht aus dem Hafen einen
 * Landpunkt, und der Weg aus dieser gedachten Bucht heraus ist Pilotage.
 *
 * Ein pauschaler Betrag hat genau diese Begründung überdehnt. Grammata liegt im
 * Wasser (Einbettung 0) und bekam trotzdem 1,5 sm gutgeschrieben — genug, um
 * die 0,6 sm breite Landzunge davor zu verschlucken. Dasselbe vor Ornos: 1,3 sm
 * quer über Mykonos, gemeldet als 0,000. Wer im Wasser liegt, braucht keine
 * Ansteuerung durch Land; ihm bleibt die Auflösungstoleranz und sonst nichts.
 */
function approachAllowanceNm(p: Pt): number {
  for (const ring of RINGS) {
    if (pointInRing(p, ring)) {
      return Math.min(distanceToRing(p, ring) + TOUCH_TOLERANCE_NM, APPROACH_NM);
    }
  }
  return TOUCH_TOLERANCE_NM;
}

/**
 * Dasselbe, gemerkt. Die Sichtbarkeitssuche fragt für dieselben zwei Endpunkte
 * quadratisch oft; der Wert hängt nur am Punkt.
 */
const allowanceCache = new WeakMap<Pt, number>();
function allowanceOf(p: Pt): number {
  const hit = allowanceCache.get(p);
  if (hit !== undefined) return hit;
  const nm = approachAllowanceNm(p);
  allowanceCache.set(p, nm);
  return nm;
}

/**
 * Die Landstücke auf a→b, als Parameterintervalle [t0,t1], vereinigt über alle
 * Ringe.
 *
 * Vereinigt, nicht je Ring gezählt: zwei aneinanderstossende Ringe (Insel und
 * vorgelagerter Felsen) sind ein Hindernis, und nur als EIN Intervall lässt
 * sich sagen, ob es am Endpunkt klebt oder mitten im Schlag liegt.
 */
function landIntervals(a: Pt, b: Pt): [number, number][] {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const raw: [number, number][] = [];
  for (const ring of RINGS) {
    if (!segmentHitsBox(a, b, ring.minX, ring.minY, ring.maxX, ring.maxY)) continue;
    const marks = [0, ...ringCrossings(a, b, ring), 1];
    for (let i = 0; i < marks.length - 1; i++) {
      const t0 = marks[i]!;
      const t1 = marks[i + 1]!;
      if (t1 - t0 < 1e-12) continue;
      const mid = (t0 + t1) / 2;
      if (pointInRing({ x: a.x + vx * mid, y: a.y + vy * mid }, ring)) raw.push([t0, t1]);
    }
  }
  raw.sort((m, n) => m[0] - n[0]);
  const merged: [number, number][] = [];
  for (const [t0, t1] of raw) {
    const last = merged[merged.length - 1];
    if (last && t0 <= last[1] + 1e-9) last[1] = Math.max(last[1], t1);
    else merged.push([t0, t1]);
  }
  return merged;
}

/**
 * Darf dieses Landstück als Ansteuerung durchgehen?
 *
 * Zwei Bedingungen, und beide sind nötig:
 *   1. Der Endpunkt klebt daran — er liegt darin oder höchstens einen
 *      Toleranzabstand davor. Land, das erst nach einem Stück offenem Wasser
 *      beginnt, ist ein Hindernis auf dem Weg, keine Ansteuerung.
 *   2. Das Landstück ist von diesem Endpunkt aus in beide Richtungen kürzer
 *      als seine Ansteuerung (`approachAllowanceNm`). Sonst wäre der Weg quer
 *      über die eigene Insel eine Ansteuerung: Ermoupoli liegt selbst knapp
 *      hinter der Küstenlinie, und ohne diese Schranke dürfte ein Kurs von dort
 *      quer über Syros laufen.
 */
function isApproach(t0: number, t1: number, anchor: Anchor, len: number): boolean {
  const gap = len > 0 ? TOUCH_TOLERANCE_NM / len : 0;
  const tp = anchor.t;
  if (tp < t0 - gap || tp > t1 + gap) return false;
  return Math.max(t1 - tp, tp - t0, 0) * len <= anchor.allowance;
}

/** Ein Endpunkt auf der Strecke: wo er liegt und wieviel Land er sich anrechnet. */
interface Anchor {
  t: number;
  allowance: number;
}

/**
 * Der Parameter t, unter dem `e` auf a→b liegt — oder null, wenn `e` nicht auf
 * dieser Strecke liegt. Im Sichtbarkeitsgraphen laufen Kanten zwischen Ecken,
 * die mit Start und Ziel nichts zu tun haben; für die gibt es keine
 * Ansteuerung.
 */
function parameterOn(a: Pt, b: Pt, e: Pt): number | null {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const l2 = vx * vx + vy * vy;
  if (l2 === 0) return null;
  const t = ((e.x - a.x) * vx + (e.y - a.y) * vy) / l2;
  const off = Math.hypot(e.x - (a.x + t * vx), e.y - (a.y + t * vy));
  return off <= 1e-9 ? t : null;
}

/**
 * Seemeilen dieses Schlags, die über Land laufen — ohne die Ansteuerung der
 * Punkte in `exempt` (normalerweise Start und Ziel des Schlags).
 */
function landCrossingPlanar(a: Pt, b: Pt, exempt: Pt[]): number {
  const len = dist(a, b);
  if (len === 0) return 0;
  const anchors: Anchor[] = [];
  for (const e of exempt) {
    const t = parameterOn(a, b, e);
    if (t !== null) anchors.push({ t, allowance: allowanceOf(e) });
  }
  let total = 0;
  for (const [t0, t1] of landIntervals(a, b)) {
    if (anchors.some((anchor) => isApproach(t0, t1, anchor, len))) continue;
    total += (t1 - t0) * len;
  }
  return total;
}

/**
 * Seemeilen Land auf dem direkten Schlag von `a` nach `b`. Die Ansteuerung von
 * `a` und `b` selbst zählt nicht mit (siehe `APPROACH_NM`) — sonst wäre jeder
 * Hafen in einer Bucht unerreichbar.
 */
export function landCrossingNm(a: Coordinates, b: Coordinates): number {
  const pa = project(a);
  const pb = project(b);
  return landCrossingPlanar(pa, pb, [pa, pb]);
}

/** Führt der direkte Schlag über Land? */
export function crossesLand(a: Coordinates, b: Coordinates): boolean {
  return landCrossingNm(a, b) > TOUCH_TOLERANCE_NM;
}

/** Führt dieser Kurs (Punktfolge) irgendwo über Land? */
export function pathCrossesLand(points: Coordinates[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    if (crossesLand(points[i]!, points[i + 1]!)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Umfahrung: Sichtbarkeitsgraph + Dijkstra
// ---------------------------------------------------------------------------

const blocked = (a: Pt, b: Pt, exempt: Pt[]): boolean =>
  landCrossingPlanar(a, b, exempt) > TOUCH_TOLERANCE_NM;

/**
 * Kürzester landfreier Kurs von `a` nach `b` — oder null, wenn keiner
 * gefunden wird.
 *
 * Verfahren: Sichtbarkeitsgraph über die Umfahrungsecken der Ringe im Korridor
 * (`cornersOf`), Kanten nur zwischen Ecken, deren Verbindung landfrei ist,
 * darauf Dijkstra. Das ist das Standardverfahren für kürzeste Wege um
 * polygonale Hindernisse und liefert hier den Kurs, den ein Skipper auch
 * fahren würde: aussen ums Kap, nicht in die Bucht.
 *
 * Der Korridor beschränkt die Knotenmenge: Ecken, deren Umweg über 80 % länger
 * ist als die Luftlinie, kommen in einem kürzesten Weg nicht vor. Findet sich
 * darin kein Weg, wird der Korridor einmal verdoppelt (Amorgos hinter Naxos
 * herum ist ein solcher Fall) und die Suche wiederholt.
 */
function routeAround(a: Pt, b: Pt): Pt[] | null {
  const exempt = [a, b];
  const direct = dist(a, b);

  for (const slack of [0.8, 2.0]) {
    const pad = Math.max(2, direct * slack * 0.5);
    /** Kandidaten mit ihrem Umwegmass — daraus wird die Knotenmenge gesiebt. */
    const candidates: { p: Pt; detour: number }[] = [];
    const budget = direct * (1 + slack) + 2;
    for (const ring of RINGS) {
      if (
        ring.minX > Math.max(a.x, b.x) + pad ||
        ring.maxX < Math.min(a.x, b.x) - pad ||
        ring.minY > Math.max(a.y, b.y) + pad ||
        ring.maxY < Math.min(a.y, b.y) - pad
      ) {
        continue;
      }
      for (const corner of cornersOf(ring)) {
        const detour = dist(a, corner) + dist(corner, b);
        if (detour > budget) continue;
        // Eine Ecke, die an Land liegt, ist kein Wegpunkt — auch nicht im Land
        // des EIGENEN Rings. Der Versatz nach aussen führt normalerweise aus
        // der Insel heraus, aber in einer zerklüfteten Bucht zeigt die
        // Winkelhalbierende einer für sich konvexen Ecke zurück ins Land: bei
        // Vourkari (Kea) landete der Umfahrungspunkt so 14 m INNERHALB der
        // Küstenlinie.
        let onLand = false;
        for (const other of RINGS) {
          if (pointInRing(corner, other)) {
            onLand = true;
            break;
          }
        }
        if (!onLand) candidates.push({ p: corner, detour });
      }
    }

    /**
     * Deckel auf die Knotenzahl: die Sichtbarkeitssuche ist quadratisch, und
     * ein Schlag entlang der attischen Küste hat hunderte Kandidaten (das
     * Festland allein bringt über 600 Stützpunkte mit). Behalten werden die mit
     * dem kleinsten Umweg — die, durch die ein kürzester Weg auch läuft. Reicht
     * das nicht, greift der zweite, weitere Durchlauf; findet auch der keinen
     * Weg, sagt `seaRoute` das offen (`unresolved`) statt eine Linie zu
     * behaupten.
     */
    const MAX_NODES = 120;
    candidates.sort((m, n) => m.detour - n.detour);
    const nodes: Pt[] = [a, b, ...candidates.slice(0, MAX_NODES).map((c) => c.p)];

    // Sichtbarkeit
    const n = nodes.length;
    const edges: { to: number; nm: number }[][] = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (blocked(nodes[i]!, nodes[j]!, exempt)) continue;
        const nm = dist(nodes[i]!, nodes[j]!);
        edges[i]!.push({ to: j, nm });
        edges[j]!.push({ to: i, nm });
      }
    }

    // Dijkstra 0 → 1. Lineare Auswahl statt Heap: n bleibt im zweistelligen
    // Bereich, und ein Heap wäre hier mehr Code als Rechenzeit.
    const dists = new Array<number>(n).fill(Infinity);
    const prev = new Array<number>(n).fill(-1);
    const done = new Array<boolean>(n).fill(false);
    dists[0] = 0;
    for (;;) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        if (!done[i] && dists[i]! < best) {
          best = dists[i]!;
          u = i;
        }
      }
      if (u < 0 || u === 1) break;
      done[u] = true;
      for (const e of edges[u]!) {
        const nd = best + e.nm;
        if (nd < dists[e.to]!) {
          dists[e.to] = nd;
          prev[e.to] = u;
        }
      }
    }
    if (dists[1] === Infinity) continue;

    const path: Pt[] = [];
    for (let u = 1; u !== -1; u = prev[u]!) path.push(nodes[u]!);
    path.reverse();

    // Glätten: jede Ecke, die man auch überspringen kann, ist keine Ecke.
    for (let i = 0; i < path.length - 2; ) {
      if (!blocked(path[i]!, path[i + 2]!, exempt)) path.splice(i + 1, 1);
      else i++;
    }
    return path;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Öffentliche Kursberechnung
// ---------------------------------------------------------------------------

export interface SeaRoute {
  /** Der landfreie Kurs, inklusive Start und Ziel. */
  path: Coordinates[];
  /** Länge des Kurses in sm (sphärisch gerechnet). */
  nm: number;
  /** Zahl der eingefügten Umfahrungspunkte. */
  inserted: number;
  /**
   * true, wenn für mindestens einen Schlag KEIN landfreier Kurs gefunden wurde
   * — dann steht dort die Luftlinie. Das darf nicht stillschweigend passieren:
   * wer den Kurs anzeigt, muss sagen können, dass er ungeprüft ist.
   */
  unresolved: boolean;
}

/**
 * Cache über die Punktfolge. Etappen sind stabil; ohne Cache würde jede
 * Neubewertung (jede Forecast-Aktualisierung, jedes Rendern der Karte) dieselbe
 * Umfahrung neu suchen.
 */
const cache = new Map<string, SeaRoute>();
const cacheKey = (points: Coordinates[]): string =>
  points.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join('|');

/**
 * Der landfreie Kurs durch eine gegebene Punktfolge: jeder Schlag wird
 * geprüft, und wo er über Land führt, werden Umfahrungspunkte eingefügt. Sind
 * schon alle Schläge frei, kommt die Eingabe unverändert zurück (`inserted: 0`)
 * — kuratierte Wegpunkte werden also nie "wegoptimiert", sondern nur ergänzt.
 */
export function seaRoute(points: Coordinates[]): SeaRoute {
  if (points.length < 2) {
    return { path: [...points], nm: 0, inserted: 0, unresolved: false };
  }
  const key = cacheKey(points);
  const hit = cache.get(key);
  if (hit) return hit;

  const path: Coordinates[] = [points[0]!];
  let inserted = 0;
  let unresolved = false;
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    if (crossesLand(from, to)) {
      // Ein Punkt tief im Land ist kein Hafen: dorthin führt kein Kurs, und die
      // Suche danach wäre teuer und sinnlos.
      const reachable =
        landInsetNm(from) <= APPROACH_NM && landInsetNm(to) <= APPROACH_NM;
      const around = reachable ? routeAround(project(from), project(to)) : null;
      if (around && around.length > 2) {
        for (let k = 1; k < around.length - 1; k++) {
          path.push(unproject(around[k]!));
          inserted++;
        }
      } else {
        unresolved = true;
      }
    }
    path.push(to);
  }
  let nm = 0;
  for (let i = 0; i < path.length - 1; i++) nm += distanceNm(path[i]!, path[i + 1]!);
  const result: SeaRoute = { path, nm, inserted, unresolved };
  cache.set(key, result);
  return result;
}

/** Länge einer Punktfolge in sm. */
export function pathLengthNm(points: Coordinates[]): number {
  let nm = 0;
  for (let i = 0; i < points.length - 1; i++) nm += distanceNm(points[i]!, points[i + 1]!);
  return nm;
}
