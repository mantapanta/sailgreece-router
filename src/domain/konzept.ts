/**
 * ROUTEN-KONZEPTE — die zentrale, alles überschreibende Logik der App
 * (Skipper-Entscheidung 2026-08-05, Törnanalyse "Zweiwöchige Kykladentörns").
 *
 * Geroutet wird nach einem von ZWEI Revier-Konzepten:
 *
 *   Route 1 — KLASSISCHE KYKLADEN-RUNDE (Zentrale & Westliche Kykladen).
 *   Hinweg mit Raum-/Halbwindkursen über die Zentral-Kykladen, Rückweg
 *   konsequent im westlichen LEE-KORRIDOR Milos–Sifnos–Serifos–Kythnos:
 *   kurze Etappen in Inselabdeckung statt offener See mit voller Welle.
 *   Funktioniert bei Meltemi 4–6 Bft; kritisch erst, wenn ein stabiles
 *   Starkwindfeld ≥ 7 Bft über mehrere Tage anhält.
 *
 *   Route 2 — OST-KYKLADEN (Mykonos, Amorgos, Ios, Santorin …).
 *   Exponierte Ost-Ziele mit langem Am-Wind-Rückweg gegen den ungebremsten
 *   Meltemi (110–130 sm Aufkreuzen aus der Ost-Ägäis). Nur bei moderatem
 *   Meltemi (≤ 5 Bft) segelbar; bei anhaltend 6–7 Bft für den Törn
 *   ungeeignet — dann wird der Vorstoß nach Osten GESTRICHEN und auf
 *   Route 1 umgeschwenkt (Abbruchroute der Törnanalyse).
 *
 * "Zentral und alles überschreibend" heißt konkret:
 *   1. Der Solver stellt die Konzept-Eignung VOR die Reichweite (preferred):
 *      kein noch so ferner Wendepunkt zieht den Törn in ein Konzept, das die
 *      Wetterlage nicht trägt.
 *   2. Der Rückweg wird am Lee-Korridor gemessen (rueckwegAbweichung):
 *      unter sonst gleichen Plänen gewinnt der, dessen Heimweg westlich in
 *      Abdeckung läuft — die Rückweg-Empfehlung der Törnanalyse.
 *   3. Kippt das aktive Konzept, entsteht ein Entscheidungspunkt HEUTE
 *      (Konzeptwechsel), nicht irgendwann: die Luv-Falle schnappt in den
 *      ersten Tagen zu, nicht am Ende.
 *
 * Die Eignung ist bewusst eine EMPFEHLUNGS-Ebene über der täglichen
 * Machbarkeits-Maschine (Solver, Abbruch-Notation), keine Gültigkeits-
 * bedingung: ein Ost-Plan bleibt baubar und wird ehrlich bepreist — aber er
 * verliert die Rangfolge und trägt die Warnung sichtbar. Die App ersetzt das
 * Kopfrechnen, nicht das seemännische Urteil (README).
 *
 * ABRATEN, NICHT VERBIETEN (Skipper 2026-08-06: "andere Best-Practice-Routen
 * wie West-Kykladen trotzdem erlauben und lediglich davon abraten, wenn der
 * Wind zu stark ist"). Daraus folgt für alles unten:
 *   - Kein Konzept und keine kuratierte Route verschwindet je aus dem
 *     Angebot, weil die Lage sie nicht trägt. Sie behält ihren Plan, bleibt
 *     ansehbar und übernehmbar (RouteOptionAssessment.plan) und trägt die
 *     Empfehlung 'abgeraten' samt Begründung.
 *   - Die Rangfolge (`preferred`) und die Empfehlung sind die Werkzeuge des
 *     Abratens — nicht ein Filter. Der Solver SCHLÄGT die tragende Route vor;
 *     er nimmt die andere nicht weg.
 *   - Die Sprache folgt dem: "abgeraten", "wählbar", nie "gestrichen".
 */

import type { PlanningSnapshot, Library, PlanAssessment } from './schema/snapshot.ts';
import type { Params } from './schema/params.ts';
import type { Plan } from './schema/plan.ts';
import type { Variant } from './schema/route.ts';
import type {
  KonzeptAssessment,
  KonzeptEignung,
  KonzeptEntscheid,
  KonzeptId,
  TorCheck,
} from './schema/konzept.ts';
import { stagesOf } from './schema/plan.ts';
import { returnFeasibleStarting, routeIslandSequence } from './ppr.ts';
import { legsOfVariant } from './legs.ts';
import { deadlineFrame, dateForTripDay, athensToUtcMs, hourIndices } from './time.ts';

export type {
  KonzeptAssessment,
  KonzeptEignung,
  KonzeptEntscheid,
  KonzeptId,
  TorCheck,
} from './schema/konzept.ts';

/** Kuratierte Anzeige-Namen — die Views sollen keine Ids formatieren müssen. */
export const KONZEPT_NAME: Record<KonzeptId, string> = {
  klassik: 'Route 1 · Klassische Kykladen-Runde (West & Zentral)',
  ost: 'Route 2 · Ost-Kykladen (Mykonos, Amorgos, Santorin)',
};

export const KONZEPT_BESCHREIBUNG: Record<KonzeptId, string> = {
  klassik:
    'Hinweg über die Zentral-Kykladen, Rückweg im westlichen Lee-Korridor ' +
    'Milos–Sifnos–Serifos–Kythnos. Trägt bei Meltemi bis 6 Bft; gute Ausweichoptionen.',
  ost:
    'Exponierte Ost-Ziele mit langem Am-Wind-Rückweg gegen den ungebremsten ' +
    'Meltemi. Nur bei moderatem Meltemi (≤ 5 Bft) — kippt die Lage, wird auf ' +
    'Route 1 umgeschwenkt.',
};

/**
 * Marker-Inseln des OST-Konzepts: läuft eine Route (Variante, Plan, Runde)
 * eine davon an, folgt sie Route 2. Alles andere — Zentral-Dreieck
 * (Syros/Paros/Naxos), West-Kette, Saronisches — ist Route 1: die
 * Zentral-Inseln gehören zu BEIDEN Konzepten (Hinweg bzw. Rückweg) und
 * können deshalb nicht unterscheiden.
 */
export const OST_MARKER_INSELN: ReadonlySet<string> = new Set([
  'andros',
  'tinos',
  'mykonos',
  'delos-rinia',
  'donousa',
  'amorgos',
  'koufonisia',
  'schinoussa',
  'iraklia',
  'keros',
  'ios',
  'santorin',
  'thirasia',
  'anafi',
]);

/**
 * Der westliche LEE-KORRIDOR — die normative Rückweg-Empfehlung der
 * Törnanalyse: im Windschatten der Kette Milos–Sifnos–Serifos–Kythnos nach
 * Nordwesten, kurze Etappen zwischen den Abdeckungen, minimaler Aufenthalt in
 * offener See mit voll entwickelter Welle. Folegandros/Sikinos zählen dazu:
 * sie sind der westliche Ausstieg der Santorin-Schleife in den Korridor.
 */
export const WEST_LEE_KORRIDOR: ReadonlySet<string> = new Set([
  'milos',
  'kimolos',
  'polyaigos',
  'folegandros',
  'sikinos',
  'sifnos',
  'serifos',
  'kythnos',
  'kea',
  'attika',
]);

/** Konzept einer Inselfolge: Ost, sobald ein Ost-Marker angelaufen wird. */
export function konzeptOfIslands(islandIds: Iterable<string>): KonzeptId {
  for (const id of islandIds) {
    if (OST_MARKER_INSELN.has(id)) return 'ost';
  }
  return 'klassik';
}

/** Konzept eines Plans — aus den tatsächlich angelaufenen Tageszielen. */
export function konzeptOfPlan(plan: Plan): KonzeptId {
  return konzeptOfIslands(stagesOf(plan).map((s) => s.toIslandId));
}

/** Konzept einer kuratierten Variante — aus ihrer Inselfolge. */
export function konzeptOfVariant(variant: Variant, library: Library): KonzeptId {
  return konzeptOfIslands(routeIslandSequence(legsOfVariant(variant, library)));
}

// ---------------------------------------------------------------------------
// Die Schwellen als REGLER — wo "zu stark" anfängt, entscheidet der Skipper
// ---------------------------------------------------------------------------

/**
 * Die vier Zahlen, die "zu viel Wind" definieren. Sie stehen bewusst als
 * eigener Typ neben `Params`: der Skipper stellt genau diese vier ein
 * (Skipper 2026-08-06 "bitte als Regler einstellbar machen"), alles andere
 * bleibt Konfiguration der Bibliothek.
 */
export interface KonzeptSchwellen {
  konzeptOstMaxKn: number;
  konzeptOstDauerTage: number;
  konzeptKlassikMaxKn: number;
  konzeptKlassikDauerTage: number;
}

export type KonzeptSchwelleKey = keyof KonzeptSchwellen;

/**
 * Die Regler-Definitionen — Grenzen, Schrittweite und Beschriftung gehören in
 * die Domäne, nicht ins Formular (AD-2): welche Windstärke überhaupt sinnvoll
 * als Schwelle taugt, ist Revier-Wissen. Die View liest diese Liste und baut
 * daraus stumpf ihre `<input type="range">`.
 *
 * Die kn-Bereiche sind an der Beaufort-Skala aufgehängt: Route 2 kippt laut
 * Törnanalyse im Bereich 6–7 Bft (22–33 kn), Route 1 erst bei stabilen 7–8 Bft
 * (28–40 kn). Die Regler lassen daneben Luft nach beiden Seiten — wer
 * vorsichtiger oder mutiger ist als die Analyse, soll das einstellen können.
 */
export const KONZEPT_REGLER: ReadonlyArray<{
  key: KonzeptSchwelleKey;
  konzept: KonzeptId;
  label: string;
  hilfe: string;
  min: number;
  max: number;
  step: number;
  einheit: string;
}> = [
  {
    key: 'konzeptOstMaxKn',
    konzept: 'ost',
    label: 'Route 2 — Wind ab',
    hilfe:
      'Spitzenwind im Revier, ab dem für die Ost-Kykladen ein Starkwindfeld zählt. ' +
      'Törnanalyse: 22 kn (≈ 6 Bft) — darüber wird der lange Am-Wind-Rückweg zäh.',
    min: 12,
    max: 36,
    step: 1,
    einheit: 'kn',
  },
  {
    key: 'konzeptOstDauerTage',
    konzept: 'ost',
    label: 'Route 2 — über',
    hilfe:
      'So viele Tage in Folge muss die Schwelle halten, bevor abgeraten wird. ' +
      'Ein einzelner Starkwindtag ist "grenzwertig", kein Starkwindfeld.',
    min: 1,
    max: 5,
    step: 1,
    einheit: 'Tage',
  },
  {
    key: 'konzeptKlassikMaxKn',
    konzept: 'klassik',
    label: 'Route 1 — Wind ab',
    hilfe:
      'Dasselbe für die klassische Runde im Lee-Korridor. Törnanalyse: 28 kn ' +
      '(≈ 7 Bft) — die Abdeckung der West-Kette trägt deutlich länger.',
    min: 15,
    max: 45,
    step: 1,
    einheit: 'kn',
  },
  {
    key: 'konzeptKlassikDauerTage',
    konzept: 'klassik',
    label: 'Route 1 — über',
    hilfe:
      'Törnanalyse: erst ein stabiles Starkwindfeld über mehr als drei Tage ' +
      'macht auch die geschützte Runde untragbar.',
    min: 1,
    max: 5,
    step: 1,
    einheit: 'Tage',
  },
];

const REGLER_BY_KEY = new Map(KONZEPT_REGLER.map((r) => [r.key, r]));

/** Die aktuell gültigen Schwellen eines Parametersatzes — der Regler-Stand. */
export function konzeptSchwellenOf(params: Params): KonzeptSchwellen {
  return {
    konzeptOstMaxKn: params.konzeptOstMaxKn,
    konzeptOstDauerTage: params.konzeptOstDauerTage,
    konzeptKlassikMaxKn: params.konzeptKlassikMaxKn,
    konzeptKlassikDauerTage: params.konzeptKlassikDauerTage,
  };
}

function klemme(key: KonzeptSchwelleKey, wert: number): number {
  const regler = REGLER_BY_KEY.get(key)!;
  if (!Number.isFinite(wert)) return regler.min;
  const gerastert = Math.round(wert / regler.step) * regler.step;
  return Math.min(Math.max(gerastert, regler.min), regler.max);
}

/**
 * EINEN Regler bewegen — die einzige Stelle, an der Schwellen entstehen.
 *
 * Sie hält die Invariante der Params-Prüfung (`konzeptOstMaxKn ≤
 * konzeptKlassikMaxKn`: das exponiertere Konzept kippt zuerst) aufrecht, ohne
 * dass ein Regler unter der Hand zurückspringt: wer Route 2 über Route 1
 * schiebt, SCHIEBT Route 1 mit; wer Route 1 unter Route 2 zieht, zieht Route 2
 * mit. Der angefasste Regler folgt immer der Hand, der andere gibt nach — das
 * ist die einzige Auflösung, die sich nicht wie ein Fehler anfühlt.
 */
export function setKonzeptSchwelle(
  current: KonzeptSchwellen,
  key: KonzeptSchwelleKey,
  wert: number,
): KonzeptSchwellen {
  const next: KonzeptSchwellen = { ...current, [key]: klemme(key, wert) };
  if (key === 'konzeptOstMaxKn' && next.konzeptOstMaxKn > next.konzeptKlassikMaxKn) {
    next.konzeptKlassikMaxKn = klemme('konzeptKlassikMaxKn', next.konzeptOstMaxKn);
  }
  if (key === 'konzeptKlassikMaxKn' && next.konzeptKlassikMaxKn < next.konzeptOstMaxKn) {
    next.konzeptOstMaxKn = klemme('konzeptOstMaxKn', next.konzeptKlassikMaxKn);
  }
  // Bleibt nach dem Klemmen eine Kollision (die Regler-Bereiche überlappen
  // nicht vollständig), gewinnt die Invariante: Ost darf nie über Klassik
  // stehen, sonst kippt das geschütztere Konzept zuerst.
  if (next.konzeptOstMaxKn > next.konzeptKlassikMaxKn) {
    next.konzeptOstMaxKn = klemme('konzeptOstMaxKn', next.konzeptKlassikMaxKn);
  }
  return next;
}

/**
 * Einen ganzen Regler-Stand auf Bereich und Invariante bringen. Nötig, weil er
 * aus dem localStorage kommt (ungeprüfte Eingabe) und weil die Regler-Bereiche
 * sich zwischen zwei App-Versionen ändern dürfen, ohne einen gespeicherten
 * Törn unbrauchbar zu machen.
 */
export function klemmeKonzeptSchwellen(schwellen: KonzeptSchwellen): KonzeptSchwellen {
  let sicher = schwellen;
  for (const { key } of KONZEPT_REGLER) {
    sicher = setKonzeptSchwelle(sicher, key, schwellen[key]);
  }
  return sicher;
}

/**
 * Die eingestellten Schwellen auf einen Parametersatz legen. `null` heisst
 * "nichts eingestellt" — dann gelten die Werte der Bibliothek unverändert.
 */
export function withKonzeptSchwellen(
  params: Params,
  schwellen: KonzeptSchwellen | null,
): Params {
  if (!schwellen) return params;
  return { ...params, ...klemmeKonzeptSchwellen(schwellen) };
}

// ---------------------------------------------------------------------------
// Konzept-Lage: welche Konzepte trägt die Wetterlage?
// ---------------------------------------------------------------------------

export interface KonzeptLage {
  eignung: Record<KonzeptId, KonzeptEignung>;
  gruende: Record<KonzeptId, string[]>;
  /**
   * Mindestens eine tragende Stunde stammt aus der Persistenz-Annahme —
   * die Lage-Aussage steht dann unter demselben Vorbehalt wie jede andere
   * Annahme-Bewertung (AD-13): sie warnt, sie verurteilt nicht.
   */
  basisAnnahme: boolean;
}

/**
 * Revier-Spitzenwind je Törntag: das Maximum über ALLE Forecast-Punkte des
 * Snapshots (Plätze und Etappen-Wegpunkte) innerhalb des Kalendertags
 * (Athen). Bewusst das Maximum, nicht ein Mittel: die Törnanalyse-Schwellen
 * beschreiben, was der Wind im Revier ERREICHT — Düsen- und Kap-Zonen sind
 * genau die Stellen, an denen ein Konzept bricht.
 */
export function dailyPeakWindKn(
  snapshot: PlanningSnapshot,
): Map<number, { kn: number; assumed: boolean }> {
  const { params, times, forecast } = snapshot;
  const frame = deadlineFrame(params);
  const out = new Map<number, { kn: number; assumed: boolean }>();
  const series = Object.values(forecast);
  for (let day = snapshot.trip.currentDay; day <= frame.deadlineDay; day++) {
    const date = dateForTripDay(params.tripStartDate, day);
    const startMs = athensToUtcMs(date, 0);
    const idx = hourIndices({ startMs, endMs: startMs + 24 * 3600_000 }, times);
    let kn: number | null = null;
    let assumed = false;
    for (const fc of series) {
      for (const i of idx) {
        const v = fc.windKn[i];
        if (v === null || v === undefined) continue;
        if (kn === null || v > kn) {
          kn = v;
          assumed = fc.windAssumed[i] ?? false;
        }
      }
    }
    if (kn !== null) out.set(day, { kn, assumed });
  }
  return out;
}

/**
 * Längster zusammenhängender Lauf von Tagen mit Spitzenwind ≥ Schwelle.
 * Tage ohne Daten unterbrechen den Lauf nicht stillschweigend zugunsten der
 * Eignung — sie beenden ihn (keine Daten sind kein Freispruch, aber auch
 * keine Verurteilung; der Annahme-Vorbehalt steht an der Lage selbst).
 */
function staerksterLauf(
  daily: Map<number, { kn: number; assumed: boolean }>,
  thresholdKn: number,
): { laenge: number; abTag: number | null; maxKn: number; assumed: boolean } {
  let best = { laenge: 0, abTag: null as number | null, maxKn: 0, assumed: false };
  let lauf = 0;
  let abTag: number | null = null;
  let maxKn = 0;
  let assumed = false;
  const days = [...daily.keys()].sort((a, b) => a - b);
  let prev: number | null = null;
  for (const day of days) {
    const { kn, assumed: a } = daily.get(day)!;
    const fortlaufend = prev !== null && day === prev + 1;
    if (kn >= thresholdKn) {
      if (lauf === 0 || !fortlaufend) {
        lauf = 1;
        abTag = day;
        maxKn = kn;
        assumed = a;
      } else {
        lauf += 1;
        maxKn = Math.max(maxKn, kn);
        assumed = assumed || a;
      }
      if (lauf > best.laenge) best = { laenge: lauf, abTag, maxKn, assumed };
    } else {
      lauf = 0;
      abTag = null;
    }
    prev = day;
  }
  return best;
}

/**
 * Memo je Snapshot-Objekt: die Lage wird vom Solver (jede preferred-Metrik),
 * vom Optionsraum und vom Assessment gebraucht — einmal rechnen reicht.
 */
const lageCache = new WeakMap<PlanningSnapshot, KonzeptLage>();

/** Die EINE Antwort auf "welches Konzept trägt die Wetterlage?". */
export function konzeptLageFor(snapshot: PlanningSnapshot): KonzeptLage {
  const cached = lageCache.get(snapshot);
  if (cached) return cached;
  const { params } = snapshot;
  const daily = dailyPeakWindKn(snapshot);

  const beurteile = (
    maxKn: number,
    dauerTage: number,
    konzeptName: string,
  ): { eignung: KonzeptEignung; gruende: string[]; assumed: boolean } => {
    const lauf = staerksterLauf(daily, maxKn);
    if (lauf.laenge >= dauerTage) {
      return {
        eignung: 'ungeeignet',
        gruende: [
          `Ab Tag ${lauf.abTag}: ${lauf.laenge} Tage in Folge Spitzenwind ≥ ${maxKn} kn ` +
            `(bis ${Math.round(lauf.maxKn)} kn) — ${konzeptName} trägt diese Lage nicht.`,
        ],
        assumed: lauf.assumed,
      };
    }
    if (lauf.laenge >= 1) {
      return {
        eignung: 'grenzwertig',
        gruende: [
          `Tag ${lauf.abTag}: Spitzenwind ≥ ${maxKn} kn (bis ${Math.round(lauf.maxKn)} kn), ` +
            `aber kein anhaltendes Starkwindfeld (< ${dauerTage} Tage in Folge).`,
        ],
        assumed: lauf.assumed,
      };
    }
    return {
      eignung: 'geeignet',
      gruende: [`Kein Tag mit Spitzenwind ≥ ${maxKn} kn im Törnfenster.`],
      assumed: false,
    };
  };

  const ost = beurteile(params.konzeptOstMaxKn, params.konzeptOstDauerTage, 'Route 2 (Ost)');
  const klassik = beurteile(
    params.konzeptKlassikMaxKn,
    params.konzeptKlassikDauerTage,
    'Route 1 (Klassik)',
  );

  const lage: KonzeptLage = {
    eignung: { klassik: klassik.eignung, ost: ost.eignung },
    gruende: { klassik: klassik.gruende, ost: ost.gruende },
    basisAnnahme: ost.assumed || klassik.assumed,
  };
  lageCache.set(snapshot, lage);
  return lage;
}

// ---------------------------------------------------------------------------
// Rückweg-Empfehlung: der westliche Lee-Korridor
// ---------------------------------------------------------------------------

/**
 * Rückweg-Inseln eines Plans AUSSERHALB des Lee-Korridors (nach dem
 * Wendepunkt, Basis ausgenommen). Zentral-Inseln wie Paros/Naxos zählen mit:
 * wer nach der Wende noch dort steht, steht noch nicht in Abdeckung — genau
 * das misst die Kennzahl. Sie ist ein RANGFOLGE-Maß (preferred) und eine
 * Anzeige, nie eine Gültigkeitsbedingung: der Ost-Rückweg MUSS durch
 * Paros/Naxos, und unter Ost-Plänen ist das für alle gleich teuer.
 */
export function rueckwegAbweichungInseln(
  plan: Plan,
  turnDay: number | null,
  baseIslandId: string,
): string[] {
  if (turnDay === null) return [];
  const out: string[] = [];
  for (const stage of stagesOf(plan)) {
    if (stage.day <= turnDay) continue;
    const island = stage.toIslandId;
    if (island === baseIslandId) continue;
    if (WEST_LEE_KORRIDOR.has(island)) continue;
    if (!out.includes(island)) out.push(island);
  }
  return out;
}

/** Dieselbe Kennzahl als Zahl — für die lexikografische Rangfolge. */
export function rueckwegAbweichung(
  plan: Plan,
  turnDay: number | null,
  baseIslandId: string,
): number {
  return rueckwegAbweichungInseln(plan, turnDay, baseIslandId).length;
}

/**
 * Mindestanteil der Restzeit, der zum Wendezeitpunkt noch vor dem Schiff
 * liegen soll (Törnanalyse: "Mindestens 60 Prozent der zur Verfügung
 * stehenden Zeitreserven für die zweite Törnhälfte"). Revier-Wissen, kein
 * Tuning-Parameter: die Zahl stammt aus der Analyse, nicht aus Kalibrierung.
 */
export const RUECKWEG_ZEITANTEIL_MIN = 0.6;

/**
 * Die Rückweg-Empfehlung der Törnanalyse, angewendet auf die HAUPTROUTE —
 * Sätze für die Anzeige, aus denselben Kennzahlen, mit denen der Solver
 * bereits gerankt hat (AD-3: eine Rechnung, eine Aussage):
 *
 *   1. Lee-Korridor-Treue: läuft der Heimweg nach der Wende in der Abdeckung
 *      Milos–Sifnos–Serifos–Kythnos, oder steht er noch in offener See?
 *   2. Zeitreserve: mindestens 60 % der verbleibenden Törnzeit gehören der
 *      zweiten Hälfte — die Luv-Falle schnappt zu, wenn die Wende zu spät fällt.
 *   3. Tages-Taktik: Am-Wind-Etappen des Rückwegs früh auslaufen — der
 *      Meltemi hat sein Maximum am Nachmittag.
 */
export function rueckwegEmpfehlungFor(
  main: PlanAssessment,
  snapshot: PlanningSnapshot,
): string[] {
  const stages = stagesOf(main.plan);
  if (stages.length === 0) return [];
  const out: string[] = [];
  const { params, trip } = snapshot;
  const frame = deadlineFrame(params);
  const turnDay = main.turnDay;

  const abweichung = rueckwegAbweichungInseln(
    main.plan,
    turnDay,
    params.baseIslandId,
  );
  if (abweichung.length > 0) {
    out.push(
      `Der Rückweg führt über ${abweichung.join(', ')} — außerhalb des westlichen ` +
        `Lee-Korridors. Bei auffrischendem Meltemi früh westwärts in die Abdeckung ` +
        `Sifnos–Serifos–Kythnos wechseln, statt in offener See aufzukreuzen.`,
    );
  } else if (turnDay !== null && turnDay < frame.deadlineDay) {
    out.push(
      'Der Rückweg läuft nach der Wende im westlichen Lee-Korridor ' +
        '(Milos–Sifnos–Serifos–Kythnos) — die empfohlene Heimweg-Kette: kurze ' +
        'Etappen in Inselabdeckung, minimale offene See.',
    );
  }

  if (turnDay !== null) {
    const verbleibend = frame.deadlineDay - trip.currentDay;
    const nachWende = frame.deadlineDay - turnDay;
    if (verbleibend > 0 && nachWende < RUECKWEG_ZEITANTEIL_MIN * verbleibend) {
      out.push(
        `Wende erst an Tag ${turnDay}: nur ${nachWende} von ${verbleibend} Resttagen ` +
          `bleiben für den Rückweg — empfohlen sind mindestens 60 % der Zeitreserven ` +
          `für die zweite Törnhälfte (Luv-Falle).`,
      );
    }
  }

  const amWindZurueck = main.stages.some(
    (s) =>
      s.kind === 'stage' &&
      turnDay !== null &&
      s.day > turnDay &&
      s.day >= trip.currentDay &&
      s.legs.some((l) => l.upwind),
  );
  if (amWindZurueck) {
    out.push(
      'Am-Wind-Etappen des Rückwegs früh auslaufen (≈ 06:00): die ersten ' +
        '15–20 sm fallen ins morgendliche Windminimum — der Meltemi erreicht ' +
        'sein Maximum zwischen 13 und 17 Uhr.',
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entscheidungstore: Festlegung dahinter nur mit gedecktem Fenster
// ---------------------------------------------------------------------------

/**
 * Die ENTSCHEIDUNGSTORE des Reviers (Törnanalyse/Breezada: "decision gates
 * at natural junctions — Paros/Naxos is one; the moment you commit beyond
 * that, you're increasing exposure"). Hinter jedem Tor liegt die Zone, in
 * der der Rückweg lang, exponiert und gegenan wird:
 *
 *   - Paros/Naxos: der Süd- und Ost-Rand (Ios, Santorin, Amorgos, Kleine
 *     Kykladen) — dahinter steht die volle Am-Wind-Strecke heim.
 *   - Syros: der Ost-Abzweig zur Mykonos-Gruppe — dahinter die Mykonos-Düse
 *     und der freie Ägäis-Schwell.
 *
 * Der westliche Lee-Korridor (Milos-Gruppe) hat bewusst KEIN Tor: er IST
 * der Rückweg — eine Festlegung dorthin erhöht die Exposition nicht.
 */
export const ENTSCHEIDUNGSTORE: ReadonlyArray<{
  id: string;
  name: string;
  dahinter: ReadonlySet<string>;
}> = [
  {
    id: 'tor-paros-naxos',
    name: 'Paros/Naxos',
    dahinter: new Set([
      'ios',
      'santorin',
      'thirasia',
      'anafi',
      'amorgos',
      'donousa',
      'koufonisia',
      'schinoussa',
      'iraklia',
      'keros',
    ]),
  },
  {
    id: 'tor-syros',
    name: 'Syros (Ost-Abzweig)',
    dahinter: new Set(['mykonos', 'tinos', 'delos-rinia', 'andros']),
  },
];

/**
 * Die Tor-Prüfungen eines Plans: für jedes Tor der Tag, an dem sich der Plan
 * ERSTMALS dahinter festlegt — mit den beiden Bedingungen der Törnanalyse:
 *
 *   Fenster:  ab dem Festlegungstag müssen `torFensterStunden` (48 h) im
 *             VERLÄSSLICHEN Forecast liegen (reliableHorizonDays) — jenseits
 *             davon trägt nur die Persistenz-Annahme, und auf einer Annahme
 *             legt man sich nicht hinter ein Tor.
 *   Rückweg:  von der ersten Insel hinter dem Tor muss die Rückkehr nach
 *             aktuellem Forecast machbar sein (dieselbe Maschine wie
 *             Gültigkeitsbedingung 2' und PoR, AD-3).
 *
 * Nur zukünftige Festlegungen (Tag ≥ heute): eine durchfahrene ist keine
 * Entscheidung mehr. Die Prüfung ist eine EMPFEHLUNGS-Ebene wie die
 * Konzept-Eignung — sie macht keinen Plan ungültig, sie steht sichtbar am
 * Tag der Entscheidung (StageAssessment.torCheck, Entscheidungspunkte).
 */
export function deriveTorChecks(
  plan: Plan,
  snapshot: PlanningSnapshot,
): TorCheck[] {
  const { params, trip } = snapshot;
  const frame = deadlineFrame(params);
  const fensterTage = Math.ceil(params.torFensterStunden / 24);
  const checks: TorCheck[] = [];
  const stages = stagesOf(plan).sort((a, b) => a.day - b.day);

  for (const tor of ENTSCHEIDUNGSTORE) {
    const commit = stages.find(
      (s) => s.day >= trip.currentDay && tor.dahinter.has(s.toIslandId),
    );
    if (!commit) continue;

    // Fenster: letzter Tag, den das 48-h-Fenster ab Festlegung abdeckt, muss
    // im verlässlichen Horizont liegen.
    const letzterFensterTag = commit.day + fensterTage - 1;
    const fensterOk =
      letzterFensterTag - trip.currentDay <= params.reliableHorizonDays;

    // Rückweg: von der ersten Insel hinter dem Tor, ab dem Folgetag.
    const rueckweg = returnFeasibleStarting(
      commit.toIslandId,
      commit.day + 1,
      snapshot,
      'forecast',
      frame.deadlineDay,
    );
    const rueckwegOk = rueckweg !== 'infeasible';

    const erfuellt = fensterOk && rueckwegOk;
    const gruende: string[] = [];
    if (!fensterOk) {
      gruende.push(
        `das ${params.torFensterStunden}-h-Fenster ab Tag ${commit.day} reicht über den verlässlichen Forecast-Horizont hinaus`,
      );
    }
    if (!rueckwegOk) {
      gruende.push(
        `der Rückweg von ${commit.toIslandId} ist nach aktuellem Forecast nicht darstellbar`,
      );
    }
    checks.push({
      torId: tor.id,
      name: tor.name,
      day: commit.day,
      islandId: commit.toIslandId,
      fensterOk,
      rueckwegOk,
      erfuellt,
      note: erfuellt
        ? `Entscheidungstor ${tor.name}: Festlegung hinter das Tor (Tag ${commit.day}, ${commit.toIslandId}) ist gedeckt — ` +
          `${params.torFensterStunden}-h-Forecast-Fenster steht, Rückweg nach Forecast machbar. Ab hier steigt die Exposition.`
        : `Entscheidungstor ${tor.name}: Festlegung hinter das Tor (Tag ${commit.day}, ${commit.toIslandId}) ist NICHT gedeckt — ` +
          `${gruende.join('; ')}. Empfehlung: vor dem Tor bleiben oder umplanen.`,
    });
  }
  return checks.sort((a, b) => a.day - b.day);
}

// ---------------------------------------------------------------------------
// Konzept-Assessment: Lage + aktives Konzept -> Empfehlung, Wechsel, Hinweise
// ---------------------------------------------------------------------------

/**
 * Die Konzept-Entscheidung: welches der beiden Konzepte empfiehlt die App?
 *
 * Regel (deterministisch und ablesbar):
 *   - Das AKTIVE Konzept (Hauptroute, sonst Vorschlag, sonst Klassik) wird
 *     beibehalten, solange es nicht 'ungeeignet' ist — Kurs halten ist eine
 *     Entscheidung, kein Unterlassen.
 *   - Kippt das Ost-Konzept, EMPFIEHLT die App Route 1 (Abbruchroute der
 *     Törnanalyse). Der Wechsel-Hinweis nennt das ausdrücklich — und ebenso
 *     ausdrücklich, dass Route 2 wählbar bleibt: es ist eine Empfehlung,
 *     keine Streichung (Skipper 2026-08-06).
 *   - Route 1 wechselt NIE aus Eignungsgründen nach Ost: nach Osten geht man
 *     aus Ambition, nicht als Wetterausweich. Ist auch Klassik ungeeignet,
 *     bleibt Klassik empfohlen (der geschütztere Rahmen) — mit dem Hinweis,
 *     dass nur Abwettern in Abdeckung bleibt; die tägliche Abbruch-Notation
 *     (deriveReturnChecks) trägt dann die konkrete Entscheidung.
 */
export function deriveKonzeptEntscheid(
  lage: KonzeptLage,
  aktivKonzept: KonzeptId,
  library: Library,
  currentIslandId: string | null,
): KonzeptEntscheid {
  const aktivTraegt = lage.eignung[aktivKonzept] !== 'ungeeignet';
  const empfohlenId: KonzeptId = aktivTraegt ? aktivKonzept : 'klassik';

  let wechselHinweis: string | null = null;
  if (!aktivTraegt && aktivKonzept === 'ost') {
    const von = currentIslandId ? ` ab ${currentIslandId}` : '';
    wechselHinweis =
      `Konzeptwechsel empfohlen: Vom Vorstoß in die Ost-Kykladen wird abgeraten —` +
      `${von} nach Südwesten auf Route 1 (West-Korridor) umschwenken. ` +
      lage.gruende.ost.join(' ') +
      ' Route 2 bleibt wählbar: das ist eine Empfehlung, keine Sperre.';
  } else if (!aktivTraegt) {
    wechselHinweis =
      'Auch Route 1 trägt diese Lage nicht: es gibt kein besseres Konzept, ' +
      'auf das sich umschwenken liesse — in Abdeckung bleiben und abwettern; ' +
      'die tägliche Abbruch-Notation der Hauptroute nennt den Umkehrpunkt. ' +
      lage.gruende.klassik.join(' ') +
      ' Beide Konzepte bleiben wählbar; die App rät ab, sie sperrt nicht.';
  }

  const routeIdsOf = (konzept: KonzeptId): string[] =>
    library.variants
      .filter((v) => !v.isReturnChain && konzeptOfVariant(v, library) === konzept)
      .map((v) => v.id);

  const karte = (id: KonzeptId): KonzeptAssessment => ({
    id,
    name: KONZEPT_NAME[id],
    beschreibung: KONZEPT_BESCHREIBUNG[id],
    eignung: lage.eignung[id],
    gruende: lage.gruende[id],
    routeIds: routeIdsOf(id),
    empfohlen: id === empfohlenId,
    aktiv: id === aktivKonzept,
  });

  return {
    konzepte: [karte('klassik'), karte('ost')],
    empfohlenId,
    wechselHinweis,
    basisAnnahme: lage.basisAnnahme,
  };
}
