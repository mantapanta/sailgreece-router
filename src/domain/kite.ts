/**
 * KITE-SPOTS am Törn (Skipper-Wunsch 2026-08-06) — die eine Stelle, an der aus
 * einem kuratierten Spot ein HINWEIS an der Etappe wird.
 *
 * Zwei Fragen werden hier beantwortet, und nur diese zwei:
 *
 *  1. LIEGT DER SPOT AN DIESEM TAG? Er liegt an ihm, wenn er auf der Start-
 *     oder Ziel-Insel der Etappe liegt oder innerhalb `params.kiteKorridorNm`
 *     neben der GESEGELTEN Linie (`LegAssessment.sailedLeg`, nicht der
 *     kuratierten Luftlinie — sonst behauptete der Hinweis einen Kurs, der so
 *     nicht gefahren wird).
 *  2. TAUGT ER AN DIESEM TAG? Stunde für Stunde durch das Kite-Fenster
 *     (`params.kiteFenster*HourAthens`, Athen-Zeit wie alle Fenster dieser App,
 *     AD-9): Richtung im Sektor des Spots, Stärke im Band
 *     [`kiteMinKn`, `kiteMaxKn`].
 *
 * WOHER DER WIND KOMMT — und das ist die wichtigste Einschränkung dieses
 * Moduls: für einen Kite-Spot wird KEIN eigener Forecast geholt. Forecast-Keys
 * sind normativ Plätze und Etappen-Wegpunkte (AD-3), und 14 zusätzliche Orte
 * wären 14 zusätzliche Abrufe für eine Anzeige, die nichts bewertet. Gelesen
 * wird deshalb der Wind am kuratierten `refPlaceId` des Spots — im Revier ist der
 * regelmässig einige Seemeilen entfernt, und die Kanaldüse am Spot kann
 * schärfer stehen als im Hafen daneben. Der Hinweistext sagt darum den Platz,
 * an dem gemessen wurde, dazu; er behauptet nie den Wind AM Spot.
 *
 * NICHTS HIER BEWERTET DEN TÖRN. Kein Rückgabewert dieses Moduls geht in Ampel,
 * Solver, Budget oder Gültigkeit ein — ein Kite-Spot verschiebt keine Route und
 * kippt keine Ampel (schema/kite.ts, Modulkopf). Er sagt, wo an einem Tag, der
 * ohnehin gefahren wird, das Board mitkommt.
 */

import type { Coordinates } from './schema/common.ts';
import type {
  KiteBezug,
  KiteEignung,
  KiteHinweis,
  KiteSpot,
  KiteSpotTag,
} from './schema/kite.ts';
import type { Params } from './schema/params.ts';
import type {
  DataBasis,
  LegAssessment,
  PlanningSnapshot,
} from './schema/snapshot.ts';
import { sectorContains } from './ampel.ts';
import { compassPoint, distanceToPathNm } from './geo.ts';
import { legTrack } from './legs.ts';
import { athensToUtcMs, dateForTripDay, hourIndices } from './time.ts';

/**
 * Rangfolge der Eignung: das GÜNSTIGSTE Urteil des Fensters wird berichtet.
 *
 * Nicht das schlechteste (anders als bei der Nacht-Ampel, die den Worst Case
 * sucht): die Nacht muss man durchhalten, eine Kite-Session sucht man sich aus.
 * Steht der Wind um 14 Uhr zu stark und um 18 Uhr im Band, ist der Spot ein
 * Hinweis wert — mit der Stunde, in der er passt.
 */
const EIGNUNG_RANG: Record<KiteEignung, number> = {
  passt: 0,
  stark: 1,
  'wenig-wind': 2,
  richtung: 3,
  unbewertet: 4,
};

const WATER_LABEL = {
  flachwasser: 'Flachwasser',
  choppy: 'Kabbelwasser',
  welle: 'Welle',
  tiefwasser: 'Tiefwasser',
} as const;

const LAUNCH_LABEL = {
  strand: 'Strandstart',
  dinghy: 'Beiboot-Start',
  boot: 'Start vom Boot',
} as const;

/** Sektoren als Himmelsrichtungen, z. B. "N–NE". */
export function kiteSektorLabel(spot: KiteSpot): string {
  return spot.windSectors
    .map((s) => `${compassPoint(s.fromDeg)}–${compassPoint(s.toDeg)}`)
    .join(' / ');
}

/** Kurzprofil des Spots für Hinweis und Karte: "Flachwasser · Strandstart". */
export function kiteProfilLabel(spot: KiteSpot): string {
  return [WATER_LABEL[spot.water], ...spot.launch.map((l) => LAUNCH_LABEL[l])].join(' · ');
}

/**
 * Das Kite-Fenster eines Törntags als UTC-Indizes der Stundenachse.
 * Athen-Zeit rein, UTC-Indizes raus — die eine Übersetzung dieser App (AD-9).
 */
export function kiteWindowIndices(day: number, snapshot: PlanningSnapshot): number[] {
  const { params } = snapshot;
  const date = dateForTripDay(params.tripStartDate, day);
  return hourIndices(
    {
      startMs: athensToUtcMs(date, params.kiteFensterStartHourAthens),
      endMs: athensToUtcMs(date, params.kiteFensterEndeHourAthens),
    },
    snapshot.times,
  );
}

/** Urteil für EINE Stunde: Richtung zuerst, dann Stärke. */
function hourEignung(
  spot: KiteSpot,
  windKn: number,
  windDirDeg: number,
  params: Params,
): KiteEignung {
  if (!spot.windSectors.some((s) => sectorContains(s, windDirDeg))) return 'richtung';
  if (windKn < params.kiteMinKn) return 'wenig-wind';
  if (windKn > params.kiteMaxKn) return 'stark';
  return 'passt';
}

interface Governing {
  eignung: KiteEignung;
  windKn: number | null;
  windDirDeg: number | null;
  passendeStunden: number;
  basis: DataBasis;
}

/**
 * Das Kite-Fenster eines Tages an einem Spot, verdichtet auf die Stunde, die
 * das Urteil trägt — plus die Zahl der Stunden, in denen alles passt (die
 * eigentliche Planungsgrösse: eine Stunde im Band ist keine Session).
 */
function governingHour(
  spot: KiteSpot,
  day: number,
  snapshot: PlanningSnapshot,
): Governing {
  const fc = snapshot.forecast[spot.refPlaceId];
  const leer: Governing = {
    eignung: 'unbewertet',
    windKn: null,
    windDirDeg: null,
    passendeStunden: 0,
    basis: 'forecast',
  };
  if (!fc) return leer;

  let best: Governing | null = null;
  let passende = 0;
  for (const i of kiteWindowIndices(day, snapshot)) {
    const knots = fc.windKn[i] ?? null;
    const dir = fc.windDirDeg[i] ?? null;
    if (knots === null || dir === null) continue;
    const eignung = hourEignung(spot, knots, dir, snapshot.params);
    if (eignung === 'passt') passende++;
    const kandidat: Governing = {
      eignung,
      windKn: knots,
      windDirDeg: dir,
      passendeStunden: 0,
      basis: fc.windAssumed[i] ? 'annahme' : 'forecast',
    };
    if (
      !best ||
      EIGNUNG_RANG[eignung] < EIGNUNG_RANG[best.eignung] ||
      // Gleiches Urteil: die kräftigere Stunde ist die aussagekräftigere —
      // ausser bei 'stark', wo die schwächste am nächsten am Band liegt.
      (EIGNUNG_RANG[eignung] === EIGNUNG_RANG[best.eignung] &&
        (eignung === 'stark'
          ? knots < (best.windKn ?? Infinity)
          : knots > (best.windKn ?? -Infinity)))
    ) {
      best = kandidat;
    }
  }
  if (!best) return leer;
  return { ...best, passendeStunden: passende };
}

/** Der Hinweis in einem Satz — formuliert hier, nie in der View (AD-2). */
function kiteText(
  spot: KiteSpot,
  g: Governing,
  snapshot: PlanningSnapshot,
  /** Null = Revier-Sicht der Karte: der Spot liegt, wo er liegt (keine Etappe). */
  bezug: KiteBezug | null,
  abstandNm: number | null,
): string {
  const { params } = snapshot;
  const platz =
    snapshot.library.places.find((p) => p.id === spot.refPlaceId)?.name ??
    spot.refPlaceId;
  const fenster = `${params.kiteFensterStartHourAthens}–${params.kiteFensterEndeHourAthens} Uhr`;
  const wind =
    g.windKn !== null && g.windDirDeg !== null
      ? `${compassPoint(g.windDirDeg)} ${Math.round(g.windKn)} kn`
      : null;
  const insel =
    snapshot.library.islands.find((i) => i.id === spot.islandId)?.name ?? spot.islandId;
  const ort =
    bezug === null
      ? insel
      : bezug === 'strecke'
        ? abstandNm !== null && abstandNm >= 1
          ? `${abstandNm.toFixed(1)} sm neben dem Kurs`
          : 'am Kurs'
        : bezug === 'start'
          ? 'am Startrevier des Tages'
          : 'auf der Ziel-Insel';
  const profil = kiteProfilLabel(spot);
  const kopf = `${spot.name} (${profil}, ${ort})`;

  switch (g.eignung) {
    case 'passt':
      return (
        `${kopf}: ${wind} — passt, ${g.passendeStunden} h im Fenster ${fenster}. ` +
        `Wind gelesen an ${platz}.`
      );
    case 'stark':
      return (
        `${kopf}: ${wind} — Richtung passt, aber über der Kite-Obergrenze ` +
        `(${params.kiteMaxKn} kn). Wind gelesen an ${platz}.`
      );
    case 'wenig-wind':
      return (
        `${kopf}: ${wind} — unter der Kite-Untergrenze (${params.kiteMinKn} kn) ` +
        `im Fenster ${fenster}. Wind gelesen an ${platz}.`
      );
    case 'richtung':
      return (
        `${kopf}: ${wind} — der Spot braucht ${kiteSektorLabel(spot)}. ` +
        `Wind gelesen an ${platz}.`
      );
    default:
      return `${kopf}: kein Wind-Forecast für diesen Tag an ${platz} — unbewertet.`;
  }
}

function toTag(
  spot: KiteSpot,
  day: number,
  snapshot: PlanningSnapshot,
  bezug: KiteBezug | null,
  abstandNm: number | null,
): KiteSpotTag {
  const g = governingHour(spot, day, snapshot);
  return {
    spotId: spot.id,
    name: spot.name,
    islandId: spot.islandId,
    placeId: spot.refPlaceId,
    day,
    eignung: g.eignung,
    windKn: g.windKn,
    windDirDeg: g.windDirDeg,
    passendeStunden: g.passendeStunden,
    basis: g.basis,
    text: kiteText(spot, g, snapshot, bezug, abstandNm),
  };
}

/**
 * Alle kuratierten Spots, bewertet für EINEN Tag — die Ebene der Karte.
 *
 * Bewusst ohne Bezug zu einer Etappe (`bezug: null`): die Karte zeigt das
 * Revier, nicht den Plan — der Hinweistext nennt deshalb die Insel und
 * behauptet keine Zugehörigkeit zu einem Tagesziel.
 */
export function kiteSpotsForDay(
  snapshot: PlanningSnapshot,
  day: number,
): KiteSpotTag[] {
  return (snapshot.library.kiteSpots ?? []).map((spot) =>
    toTag(spot, day, snapshot, null, null),
  );
}

/**
 * Die Kite-Hinweise EINER Etappe (oder eines Hafentags).
 *
 * Reihenfolge: erst was passt, dann Start/Ziel vor Strecke, dann der nähere
 * Spot. Der Skipper liest die erste Zeile — sie muss die sein, die heute
 * zählt.
 */
export function kiteHinweiseForStage(
  snapshot: PlanningSnapshot,
  day: number,
  fromIslandId: string | null,
  toIslandId: string,
  legs: LegAssessment[],
): KiteHinweis[] {
  const spots = snapshot.library.kiteSpots ?? [];
  if (spots.length === 0) return [];

  /** Der gesegelte Kurs des Tages als ein Zug — pro Etappe ein Abschnitt. */
  const tracks: Coordinates[][] = legs
    .map((l) => (l.sailedLeg ? legTrack(l.sailedLeg, snapshot.library.places) : []))
    .filter((t) => t.length >= 2);

  const hinweise: KiteHinweis[] = [];
  for (const spot of spots) {
    // Insel-Zugehörigkeit schlägt Korridor: auf der Ziel-Insel liegt der Spot
    // beim Liegeplatz, und "1,8 sm neben dem Kurs" wäre die unwichtigere
    // Aussage über denselben Spot.
    let bezug: KiteBezug | null =
      spot.islandId === toIslandId
        ? 'ziel'
        : fromIslandId && spot.islandId === fromIslandId
          ? 'start'
          : null;
    let abstandNm: number | null = null;
    if (bezug === null) {
      let best: number | null = null;
      for (const track of tracks) {
        const d = distanceToPathNm(spot.coordinates, track);
        if (d !== null && (best === null || d < best)) best = d;
      }
      if (best === null || best > snapshot.params.kiteKorridorNm) continue;
      bezug = 'strecke';
      abstandNm = best;
    }
    hinweise.push({ ...toTag(spot, day, snapshot, bezug, abstandNm), bezug, abstandNm });
  }

  const BEZUG_RANG: Record<KiteBezug, number> = { ziel: 0, start: 1, strecke: 2 };
  return hinweise.sort(
    (a, b) =>
      EIGNUNG_RANG[a.eignung] - EIGNUNG_RANG[b.eignung] ||
      BEZUG_RANG[a.bezug] - BEZUG_RANG[b.bezug] ||
      (a.abstandNm ?? 0) - (b.abstandNm ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

/** Die Spots, die im Platzdetail dieses Liegeplatzes stehen. */
export function kiteSpotsOfPlace(spots: KiteSpot[], placeId: string): KiteSpot[] {
  return spots.filter((s) => s.refPlaceId === placeId);
}
