/**
 * ERZEUGT DIE LEE-ZONEN aus der Landmaske — seeding/data/windtopo.json.
 *
 * WARUM ES DAS GIBT. Die Lee-Zonen wurden bis 2026-08-07 von Hand geschrieben,
 * und ihr Mittelpunkt war `island.coordinates` aus der Bibliothek. Das ist ein
 * KURATIERTER BEZUGSPUNKT, kein Landschwerpunkt — bei Milos liegt er im Hafen
 * mitten in der Bucht, also im WASSER, 1,9 sm vom Schwerpunkt der Insel
 * entfernt. Bei Naxos sind es 2,5 sm, bei Tinos 2,6, bei Aegina 2,3. Für eine
 * Keule, die genau an diesem Punkt ansetzt und von dort nach Lee zeigt, ist das
 * kein Detail: sie beginnt an der falschen Stelle und zeigt an der Insel vorbei.
 *
 * Zu beheben war das ohne jede neue Messung — die Landmaske liegt seit
 * `extractLandmass.ts` im Repo und ist dieselbe, gegen die auch die Kurse
 * geprüft werden. Zwei der drei Zahlen einer Zone kommen deshalb jetzt aus ihr
 * statt aus der Hand:
 *
 *   `center`            = Schwerpunkt der zusammenhängenden Landfläche
 *   `obstacleRadiusNm`  = mittlere halbe QUERSCHNITTSBREITE im Meltemi-Band
 *
 * DIE QUERSCHNITTSBREITE UND NICHT DER FLÄCHENRADIUS: was einen Schatten wirft,
 * ist die Breite des Hindernisses QUER ZUM WIND, nicht seine Fläche. Für
 * Amorgos — 30 km lang, 6 km breit, und im Meltemi längs angeströmt — sind das
 * 1,7 sm statt der 3,3 sm, die sich aus der Fläche ergäben. Gemittelt wird über
 * dieselben drei Windrichtungen, für die auch die Kuration gilt; eine Zahl je
 * Richtung ginge nicht, weil das Schema einen Radius trägt und keine Funktion.
 *
 * WAS VON HAND BLEIBT: Gipfelhöhe, Faktor, Confidence und der Beleg. Das sind
 * die Angaben, die aus den Poseidon-Bildern stammen oder aus ihnen abgeleitet
 * sind — sie stehen unten in der Tabelle, jede mit ihrer Herkunft.
 *
 * Aufruf (idempotent):
 *   node seeding/tools/leeZones.ts            # schreibt windtopo.json
 *   node seeding/tools/leeZones.ts --dry-run  # zeigt nur die Geometrie
 */

import { readFileSync, writeFileSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Coordinates } from '../../src/domain/schema/common.ts';
import { isOnLand } from '../../src/domain/searoute.ts';
import { distanceNm } from '../../src/domain/geo.ts';

/** Dieselben drei Lagen, für die die ganze Kuration gilt (windTopo.ts). */
const MELTEMI_DEG = [0, 20, 40];

/** Rasterweite der Landabtastung in sm. 0,25 sm ≈ 460 m. */
const RASTER_NM = 0.25;

/**
 * Unter dieser Gipfelhöhe bekommt eine Insel keine Zone: die Keule
 * (Höhe/60) wäre kürzer als der Näherungsradius der Insel selbst und damit
 * nicht von "keine Zone" zu unterscheiden.
 */
const MIN_HOEHE_M = 250;

interface Eintrag {
  /** Insel-Id der Bibliothek — liefert den Startpunkt der Landsuche. */
  insel: string;
  name: string;
  hoeheM: number;
  factor: number;
  confidence: 'hoch' | 'mittel' | 'niedrig';
  /** Beleg, wenn die Zunge DIESER Insel in einem Bild zu erkennen war. */
  beleg?: string;
}

const ANKER =
  "Anker aller Faktoren ist der einzige GEMESSENE Wert dieser Datei: Punktabruf im " +
  "Poseidon-Modell vom 10.08.2026, 15:00 LT, sued von Ios — 'wind: 12 km/h' (6,5 kn) bei rund " +
  '32 km/h freier Anstroemung in derselben Kachel, also Faktor 0,37 dicht hinter der Insel. ' +
  'Alle uebrigen Faktoren sind daraus nach Gipfelhoehe abgestuft; die Keulenlaenge folgt ' +
  'lobeNm ~ Gipfelhoehe/60 (empirisch: Naxos 1004 m -> 15-20 sm, Ios 713 m -> 10-12 sm). ' +
  'Mittelpunkt und Hindernisradius kommen NICHT aus der Hand, sondern aus der Landmaske ' +
  '(seeding/tools/leeZones.ts).';

const ABGELEITET =
  'NIE IM BILD GESEHEN. Der Faktor ist allein aus der Gipfelhoehe abgeleitet — die Zone ' +
  'behauptet nur, was Stroemungsmechanik ohnehin sagt: hinter einem hohen Hindernis liegt ' +
  'Abdeckung. WIE VIEL, weiss sie nicht. Deshalb \'niedrig\': sie erscheint als Hinweis an der ' +
  'Etappe und geht in die Kursoptimierung ein, aber sie fasst keine Ampel an.';

const TABELLE: Eintrag[] = [
  // --- Westkorridor Nord: an den Zoom-Bildern einzeln abgelesen -------------
  { insel: 'kea', name: 'Lee Kea', hoeheM: 561, factor: 0.45, confidence: 'mittel',
    beleg: 'Im Zoom-Bild Kea/Kythnos/Serifos (10.08., 15:00 LT, NNE ~025 Grad) als eigene tuerkise Zunge SSW der Insel abgelesen. Erste Abdeckung auf dem Heimweg in den Kea-Kanal.' },
  { insel: 'kythnos', name: 'Lee Kythnos', hoeheM: 336, factor: 0.55, confidence: 'mittel',
    beleg: 'Im selben Zoom-Bild als eigene Zunge SSW der Insel abgelesen — bis dahin war Kythnos die einzige Korridor-Zone, deren Faktor nur aus Serifos hochgerechnet war. Niedrigste der Korridor-Inseln, entsprechend kuerzeste Keule und schwaechster Faktor.' },
  { insel: 'serifos', name: 'Lee Serifos', hoeheM: 585, factor: 0.45, confidence: 'mittel',
    beleg: 'Der Lehrbuchfall der Ausgangsfrage: 585 m auf ~10 km Breite, von ICON-EU auf einen flachen Buckel gemittelt, der gar keinen Schatten wirft. Zunge im Zoom-Bild abgelesen.' },
  { insel: 'sifnos', name: 'Lee Sifnos', hoeheM: 680, factor: 0.42, confidence: 'mittel',
    beleg: 'Hoechste der vier noerdlichen Korridor-Inseln. Im Bild Milos/Kimolos/Sifnos als blaue Flaeche SSW der Insel bis hinunter nach Polyaigos sichtbar. Steilkueste im Sueden — die Fallboeen stehen hier besonders scharf.' },
  // --- Westkorridor Sued (Befund 2026-08-07: fehlte komplett) ---------------
  { insel: 'polyaigos', name: 'Lee Polyaigos', hoeheM: 358, factor: 0.55, confidence: 'mittel',
    beleg: 'Im Bild Milos/Kimolos/Sifnos als eigener, deutlich abgegrenzter blauer Fleck ueber und suedwestlich der Insel sichtbar — die kleinste Zone dieser Datei, die sich sauber isolieren liess.' },
  { insel: 'kimolos', name: 'Lee Kimolos', hoeheM: 364, factor: 0.55, confidence: 'niedrig',
    beleg: 'Die Insel liegt im Bild, ihre Zunge aber NICHT isoliert: sie faellt mit den Schatten von Sifnos und Polyaigos zusammen. Faktor deshalb nach Gipfelhoehe abgeleitet — beraet, bewertet nicht.' },
  { insel: 'milos', name: 'Lee Milos', hoeheM: 751, factor: 0.42, confidence: 'niedrig',
    beleg: 'Der Faktor ist ungemessen: Milos liegt im Bild, aber am suedwestlichen Rand, wo die freie Anstroemung selbst schon schwaecher ist; die Zunge liess sich vom grossflaechigen Gefaelle nicht trennen. WAS DIESE ZONE BESONDERS MACHT: ihr Mittelpunkt lag bis 2026-08-07 im Hafen in der BUCHT, also im Wasser und 2 sm neben dem Landschwerpunkt — die Keule setzte an der falschen Stelle an und deckte 16 Etappenpunkte, die gar nicht im Lee liegen. Richtig platziert deckt sie GENAU EINEN Forecast-Ort: milos-kleftiko, den klassischen Meltemi-Ankerplatz an der SW-Kueste. Alles andere um Milos liegt in Luv — die Etappen verlassen Adamas nach Norden, also gegen den Wind. Eine Messung des Faktors wuerde an dieser Bibliothek deshalb NICHTS aendern; die Zone ist richtig und wirkungslos zugleich.' },
  { insel: 'sikinos', name: 'Lee Sikinos', hoeheM: 553, factor: 0.45, confidence: 'mittel',
    beleg: 'Im Bild Folegandros/Sikinos (10.08., Wind aus NNW) als klar abgegrenzte blaue Zunge SSE der Insel abgelesen — dasselbe Bild, an dem sich zeigte, dass ein Schatten mit dem Wind dreht.' },
  { insel: 'folegandros', name: 'Lee Folegandros', hoeheM: 414, factor: 0.5, confidence: 'mittel',
    beleg: 'Im selben Bild wie Sikinos, eigene Zunge SSE der Insel.' },
  // --- Zentral- und Ostkykladen: in der Weitwinkel-Aufnahme abgelesen -------
  { insel: 'naxos', name: 'Lee Naxos', hoeheM: 1004, factor: 0.35, confidence: 'mittel',
    beleg: 'Zas ist der hoechste Berg der Kykladen und wirft die laengste Keule des Reviers: in der Weitwinkel-Aufnahme (10.08.) reicht die blaue Zunge rund 15-20 sm nach SW und deckt bei NE-Meltemi die halbe Strecke nach Ios/Sikinos ab.' },
  { insel: 'paros', name: 'Lee Paros', hoeheM: 771, factor: 0.4, confidence: 'mittel',
    beleg: 'In der Weitwinkel-Aufnahme abgelesen. Bei N-Lagen deckt die Keule den Weg nach Sifnos, bei NE die Bucht von Antiparos.' },
  { insel: 'ios', name: 'Lee Ios', hoeheM: 713, factor: 0.37, confidence: 'mittel',
    beleg: 'DIE GEMESSENE ZONE: der Punktabruf liegt in ihrer Keule. Die einzige Zone, deren Faktor auf einem abgelesenen Zahlenwert beruht statt auf einer Farbe.' },
  { insel: 'amorgos', name: 'Lee Amorgos', hoeheM: 821, factor: 0.38, confidence: 'mittel',
    beleg: 'Lang und schmal — schmale, aber weit reichende Keule nach SW, an der der Rueckweg aus der Ost-Aegaeis entlanglaeuft. In der Weitwinkel-Aufnahme abgelesen.' },
  { insel: 'syros', name: 'Lee Syros', hoeheM: 442, factor: 0.5, confidence: 'mittel',
    beleg: 'Lag im Bildausschnitt der ersten Poseidon-Aufnahme (Ermoupolis mittig); Abdeckung sued/suedwest der Insel dort unmittelbar sichtbar.' },
  // --- Nie im Bild: rein nach Gipfelhoehe abgeleitet ------------------------
  { insel: 'andros', name: 'Lee Andros', hoeheM: 997, factor: 0.35, confidence: 'niedrig' },
  { insel: 'tinos', name: 'Lee Tinos', hoeheM: 713, factor: 0.4, confidence: 'niedrig' },
  { insel: 'mykonos', name: 'Lee Mykonos', hoeheM: 341, factor: 0.55, confidence: 'niedrig' },
  { insel: 'antiparos', name: 'Lee Antiparos', hoeheM: 301, factor: 0.58, confidence: 'niedrig' },
  { insel: 'iraklia', name: 'Lee Iraklia', hoeheM: 419, factor: 0.5, confidence: 'niedrig' },
  { insel: 'keros', name: 'Lee Keros', hoeheM: 432, factor: 0.5, confidence: 'niedrig' },
  { insel: 'donousa', name: 'Lee Donousa', hoeheM: 385, factor: 0.53, confidence: 'niedrig' },
  { insel: 'santorin', name: 'Lee Santorin', hoeheM: 567, factor: 0.45, confidence: 'niedrig' },
  { insel: 'thirasia', name: 'Lee Thirasia', hoeheM: 295, factor: 0.58, confidence: 'niedrig' },
  { insel: 'anafi', name: 'Lee Anafi', hoeheM: 584, factor: 0.45, confidence: 'niedrig' },
  { insel: 'methana', name: 'Lee Methana', hoeheM: 740, factor: 0.42, confidence: 'niedrig' },
  { insel: 'hydra', name: 'Lee Hydra', hoeheM: 590, factor: 0.45, confidence: 'niedrig' },
  { insel: 'aegina', name: 'Lee Aegina', hoeheM: 532, factor: 0.47, confidence: 'niedrig' },
  { insel: 'salamina', name: 'Lee Salamina', hoeheM: 404, factor: 0.5, confidence: 'niedrig' },
  { insel: 'poros', name: 'Lee Poros', hoeheM: 358, factor: 0.55, confidence: 'niedrig' },
  { insel: 'angistri', name: 'Lee Angistri', hoeheM: 285, factor: 0.58, confidence: 'niedrig' },
  // Dokos (308 m) fehlt bewusst: im Lee dieser Insel liegt kein einziger
  // Forecast-Ort der Bibliothek. Der Waechter (windTopo.test.ts) meldet solche
  // Zonen als stumm — eine Zone, die nie greift, sieht in der Datei nach
  // Abdeckung aus, die es nicht gibt.
];

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data');
const round4 = (v: number): number => Number(v.toFixed(4));

function loadIslands(): Record<string, Coordinates> {
  const out: Record<string, Coordinates> = {};
  for (const file of globSync(path.join(dataDir, 'islands/*.json')).sort()) {
    const doc = JSON.parse(readFileSync(file, 'utf8')) as {
      island?: { id: string; coordinates: Coordinates };
    };
    if (doc.island) out[doc.island.id] = doc.island.coordinates;
  }
  return out;
}

/** Verschiebung um (dx, dy) Seemeilen — Ost/Nord positiv. */
function versetzt(c: Coordinates, dxNm: number, dyNm: number): Coordinates {
  return {
    lat: c.lat + dyNm / 60,
    lon: c.lon + dxNm / 60 / Math.cos((c.lat * Math.PI) / 180),
  };
}

/**
 * Die zusammenhängende Landfläche EINER Insel, als Rasterzellen.
 *
 * Flutfüllung statt Umkreis-Abtastung, und das ist der Punkt: ein Umkreis um
 * Paros zöge Antiparos mit hinein, ein Umkreis um Kimolos die Nachbarinsel
 * Polyaigos. Gesucht ist das Hindernis, das DIESE Zone beschreibt.
 *
 * Startpunkt ist die nächste Landzelle zur Bibliotheks-Koordinate — die liegt
 * bei Milos und Poros im Wasser (Hafen in der Bucht), deshalb wird sie gesucht
 * und nicht vorausgesetzt.
 */
interface Landflaeche {
  zellen: Coordinates[];
  /**
   * Die Füllung ist an den Rand des Suchfensters gestossen — dann gehört das
   * Land nicht mehr zu EINER Insel. Bei Methana, Salamina und Poros lief sie
   * über die schmale Strasse aufs Festland und lieferte Hindernisradien von
   * 16, 11 und 7 sm; das Keulenmodell haette dort eine halbe Halbinsel als
   * Insel behandelt.
   */
  abgeschnitten: boolean;
}

function landflaeche(start: Coordinates, maxNm: number): Landflaeche {
  // Startzelle suchen: spiralförmig nach aussen, bis Land gefunden ist.
  let seed: Coordinates | null = isOnLand(start) ? start : null;
  for (let r = RASTER_NM; !seed && r <= maxNm; r += RASTER_NM) {
    for (let b = 0; b < 360; b += 10) {
      const p = versetzt(
        start,
        r * Math.sin((b * Math.PI) / 180),
        r * Math.cos((b * Math.PI) / 180),
      );
      if (isOnLand(p)) {
        seed = p;
        break;
      }
    }
  }
  if (!seed) return { zellen: [], abgeschnitten: false };

  // Rasterkoordinaten relativ zum Startpunkt, in Zellen.
  const key = (ix: number, iy: number): string => `${ix},${iy}`;
  const gesehen = new Set<string>();
  const zellen: Coordinates[] = [];
  const grenze = Math.ceil(maxNm / RASTER_NM);
  const stapel: [number, number][] = [[0, 0]];
  let abgeschnitten = false;
  gesehen.add(key(0, 0));
  while (stapel.length > 0) {
    const [ix, iy] = stapel.pop()!;
    const p = versetzt(seed, ix * RASTER_NM, iy * RASTER_NM);
    if (!isOnLand(p)) continue;
    zellen.push(p);
    for (const [dx, dy] of [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ] as const) {
      const nx = ix + dx;
      const ny = iy + dy;
      if (Math.abs(nx) > grenze || Math.abs(ny) > grenze) {
        abgeschnitten = true;
        continue;
      }
      const k = key(nx, ny);
      if (gesehen.has(k)) continue;
      gesehen.add(k);
      stapel.push([nx, ny]);
    }
  }
  return { zellen, abgeschnitten };
}

interface Geometrie {
  center: Coordinates;
  obstacleRadiusNm: number;
  zellen: number;
  versatzNm: number;
}

function geometrie(inselKoord: Coordinates, hoeheM: number): Geometrie | 'kein-land' | 'am-festland' {
  // Suchradius grosszügig an der Gipfelhöhe orientiert — Andros (997 m) ist
  // 20 sm lang, Thirasia (295 m) keine drei. Die Höhe ist dafür ein
  // brauchbares Mass: hohe Inseln sind im Revier auch die grossen.
  const maxNm = Math.max(8, hoeheM / 40);
  const { zellen, abgeschnitten } = landflaeche(inselKoord, maxNm);
  if (zellen.length === 0) return 'kein-land';
  /**
   * DAS FESTLAND-TOR. Reicht die zusammenhängende Landfläche über das
   * Suchfenster hinaus, ist sie keine Insel mehr — sie hängt an einer grösseren
   * Landmasse. Genau derselbe Grund, aus dem Attika keine Zone hat: das
   * Keulenmodell nähert ein KOMPAKTES Hindernis durch einen Kreis an, und eine
   * Halbinsel ist keines.
   */
  if (abgeschnitten) return 'am-festland';

  const center = {
    lat: round4(zellen.reduce((s, c) => s + c.lat, 0) / zellen.length),
    lon: round4(zellen.reduce((s, c) => s + c.lon, 0) / zellen.length),
  };

  /**
   * Halbe Breite QUER ZUM WIND, gemittelt über das Meltemi-Band. Projiziert
   * wird auf die Achse senkrecht zur Windrichtung; genommen wird die halbe
   * Spannweite der Landzellen darauf.
   */
  let summe = 0;
  for (const dir of MELTEMI_DEG) {
    const quer = ((dir + 90) * Math.PI) / 180;
    let min = Infinity;
    let max = -Infinity;
    for (const z of zellen) {
      const dy = (z.lat - center.lat) * 60;
      const dx = (z.lon - center.lon) * 60 * Math.cos((center.lat * Math.PI) / 180);
      const proj = dx * Math.sin(quer) + dy * Math.cos(quer);
      if (proj < min) min = proj;
      if (proj > max) max = proj;
    }
    summe += (max - min) / 2;
  }
  return {
    center,
    obstacleRadiusNm: Number((summe / MELTEMI_DEG.length).toFixed(1)),
    zellen: zellen.length,
    versatzNm: distanceNm(inselKoord, center),
  };
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const inseln = loadIslands();
  const windtopoPath = path.join(dataDir, 'windtopo.json');
  const alt = JSON.parse(readFileSync(windtopoPath, 'utf8')) as {
    zones: { id: string; kind: string; [k: string]: unknown }[];
    [k: string]: unknown;
  };
  const duesen = alt.zones.filter((z) => z.kind === 'duese');

  const zones: Record<string, unknown>[] = [];
  for (const e of TABELLE) {
    if (e.hoeheM < MIN_HOEHE_M) {
      console.warn(`${e.insel}: ${e.hoeheM} m unter der Schwelle ${MIN_HOEHE_M} m — übersprungen`);
      continue;
    }
    const koord = inseln[e.insel];
    if (!koord) {
      console.warn(`${e.insel}: Insel fehlt in der Bibliothek — übersprungen`);
      continue;
    }
    const g = geometrie(koord, e.hoeheM);
    if (g === 'kein-land') {
      console.warn(`  ${e.insel.padEnd(14)} keine Landfläche gefunden — KEINE ZONE`);
      continue;
    }
    if (g === 'am-festland') {
      console.warn(
        `  ${e.insel.padEnd(14)} Landfläche haengt am Festland (Fuellung laeuft ueber) — KEINE ZONE`,
      );
      continue;
    }
    const mark = g.versatzNm >= 1 ? `  <== ${g.versatzNm.toFixed(1)} sm verschoben` : '';
    console.log(
      `  ${e.insel.padEnd(14)} r=${g.obstacleRadiusNm.toFixed(1).padStart(4)} sm  ` +
        `lobe=${String(Math.round(e.hoeheM / 60)).padStart(2)} sm  ` +
        `${String(g.zellen).padStart(5)} Landzellen${mark}`,
    );
    zones.push({
      id: `topo-lee-${e.insel}`,
      name: e.name,
      kind: 'lee',
      center: g.center,
      obstacleRadiusNm: g.obstacleRadiusNm,
      lobeNm: Math.round(e.hoeheM / 60),
      factor: e.factor,
      fallboeenNm: 0.5,
      sourceNote:
        `Gipfelhoehe ${e.hoeheM} m. Mittelpunkt und Hindernisradius aus der Landmaske ` +
        `(${g.zellen} Landzellen, Schwerpunkt ${g.versatzNm.toFixed(1)} sm von der ` +
        `Bibliotheks-Koordinate entfernt).` + (e.beleg ? ` ${e.beleg}` : ''),
      kalibriertAus: `${e.beleg ?? ABGELEITET} ${ANKER}`,
      confidence: e.confidence,
    });
  }

  const out = {
    approved: true,
    sourceNote: alt.sourceNote,
    zones: [...zones, ...duesen],
  };
  console.log(`\n${zones.length} Lee-Zonen + ${duesen.length} Düsen.`);
  if (dryRun) {
    console.log('--dry-run: windtopo.json bleibt unverändert.');
    return;
  }
  writeFileSync(windtopoPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`${path.relative(process.cwd(), windtopoPath)} geschrieben.`);
}

main();
