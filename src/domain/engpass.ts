/**
 * WAS DEN MÖGLICHKEITSRAUM BEGRENZT — die Begründung eine Ebene über den
 * Einzelurteilen.
 *
 * Die Etappen-Karten erklären, warum EINE Etappe so bewertet ist; der
 * Optionsraum erklärt, was EINE Route kostet. Beide beantworten nicht die
 * Frage, die morgens zuerst kommt: warum sieht der Plan heute so aus, und wo
 * muss ich hinschauen, wenn er mir nicht gefällt?
 *
 * Darauf gibt es zwei Antworten, und beide werden hier abgeleitet:
 *
 *  1. WELCHE FESSEL BINDET — der Wind, die Strecke oder der Kalender. Die drei
 *     schicken den Skipper an verschiedene Orte: auf Wind warten, den Plan
 *     kürzen, oder umkehren. Eine rote Etappe allein unterscheidet das nicht;
 *     rot ist sie im Starkwind gegenan genauso wie bei gerissenem Tagesbudget.
 *  2. WO DIE ENGSTE STELLE LIEGT — die Etappe mit der kleinsten Reserve. Nicht
 *     die schlechteste: eine grüne Etappe mit 1 kn Luft kippt beim nächsten
 *     Modelllauf, eine gelbe mit 8 kn Luft nicht.
 *
 * Reine Ableitung über bereits Gerechnetes (AD-2): jede Zahl hier stammt aus
 * `LegHeadroom`, den Optionszuständen oder dem PPR. Es wird nichts geurteilt,
 * was nicht scoring.ts, options.ts oder ppr.ts schon geurteilt haben.
 *
 * Herkunft: geborgen aus `overview.ts` des Branches
 * feat/plan-reasoning-and-forecast-persistence, dort als Teil einer
 * siebenteiligen Plan-Begründung. Die anderen sechs Teile sind inzwischen
 * anderswo umgesetzt — siehe spec-plan-begruendung.md.
 */

import type { Params } from './schema/params.ts';
import type {
  Engpass,
  Fessel,
  LegAssessment,
  PlanAssessment,
  PlanningSnapshot,
  PprResult,
  RouteOptionAssessment,
} from './schema/snapshot.ts';

const num1 = (v: number) => v.toFixed(1).replace('.', ',');

export interface EngpassInput {
  snapshot: PlanningSnapshot;
  /** Der Plan, der gerade gilt — seine Etappen zählen mit. */
  mainRoute: PlanAssessment | null;
  routeOptions: RouteOptionAssessment[];
  ppr: PprResult;
}

function legName(snapshot: PlanningSnapshot, leg: LegAssessment): string {
  const sailed = leg.sailedLeg;
  if (!sailed) return leg.legId.replace('--', ' → ');
  const name = (id: string) =>
    snapshot.library.islands.find((i) => i.id === id)?.name ?? id;
  return `${name(sailed.fromIslandId)} → ${name(sailed.toIslandId)}`;
}

/**
 * Jede Etappe im Blick — der gültige Plan UND der Optionsraum.
 *
 * Der Optionsraum muss mit hinein: die Frage lautet, was den RAUM begrenzt,
 * nicht was den einen Plan begrenzt. Eine Option ist zu, weil IHRE Etappen
 * nicht gehen — die stehen nicht im Hauptplan.
 *
 * Entdoppelt über `legId@day`: dieselbe Etappe am selben Tag ist dasselbe
 * Urteil, egal über wie viele Optionen sie läuft. Ohne das zählte eine
 * Verbindung, die in fünf Optionen vorkommt, fünfmal — und "5 Etappen reißen
 * die Grenze" wären in Wahrheit eine.
 */
function allLegs(input: EngpassInput): LegAssessment[] {
  const seen = new Set<string>();
  const out: LegAssessment[] = [];
  const push = (leg: LegAssessment) => {
    const key = `${leg.legId}@${leg.day}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(leg);
  };
  for (const stage of input.mainRoute?.stages ?? []) {
    for (const leg of stage.legs) push(leg);
  }
  for (const option of input.routeOptions) {
    for (const leg of option.legAssessments) push(leg);
  }
  return out;
}

interface Kandidat {
  kind: 'wind' | 'stunden';
  reserve: number;
  /** Reserve relativ zum eigenen Limit — siehe tightest(). */
  share: number;
}

function kandidaten(leg: LegAssessment, params: Params): Kandidat[] {
  const out: Kandidat[] = [];
  const { windKn, hours } = leg.headroom;
  if (windKn !== null && params.maxUpwindTwsKn > 0) {
    out.push({ kind: 'wind', reserve: windKn, share: windKn / params.maxUpwindTwsKn });
  }
  if (hours !== null && leg.sailHours !== null && leg.motorHours !== null) {
    // Gegen DAS Limit normiert, das die Reserve gestellt hat — `hours` ist das
    // Minimum über Segel- und Motorbudget, und die beiden sind verschieden gross.
    const sailLeft = params.maxSailHours - leg.sailHours;
    const motorLeft = params.maxMotorHours - leg.motorHours;
    const limit = sailLeft <= motorLeft ? params.maxSailHours : params.maxMotorHours;
    if (limit > 0) out.push({ kind: 'stunden', reserve: hours, share: hours / limit });
  }
  return out;
}

/**
 * Die Etappe mit der kleinsten Reserve.
 *
 * Knoten Wind und Stunden Zeit sind keine vergleichbaren Einheiten — "4 kn"
 * ist nicht enger oder weiter als "2,4 h". Verglichen wird deshalb die Reserve
 * RELATIV zum eigenen Limit: 4 von 25 kn (16 %) ist enger als 2,4 von 8 h
 * (30 %). Bei Gleichstand gewinnt der Wind, weil die Aufkreuz-Regel die
 * Sicherheitsgrenze ist (FR16) und das Tagesbudget nur Komfort.
 */
function tightest(
  legs: LegAssessment[],
  params: Params,
): { leg: LegAssessment; kind: 'wind' | 'stunden'; reserve: number } | null {
  let best: { leg: LegAssessment; kind: 'wind' | 'stunden'; reserve: number; share: number } | null =
    null;
  for (const leg of legs) {
    for (const c of kandidaten(leg, params)) {
      if (!best) {
        best = { leg, ...c };
        continue;
      }
      // Mit Toleranz, nicht auf Gleichheit: 1,2 h von 6 h ergibt in Fließkomma
      // 0,19999999999999998, 5 kn von 25 kn glatte 0,2 — auf === geprüft griffe
      // der Sicherheits-Vorrang des Windes nie, und zwar unsichtbar.
      const gleichauf = Math.abs(c.share - best.share) < 1e-9;
      const besser = gleichauf
        ? c.kind === 'wind' && best.kind === 'stunden'
        : c.share < best.share;
      if (besser) best = { leg, ...c };
    }
  }
  return best ? { leg: best.leg, kind: best.kind, reserve: best.reserve } : null;
}

export function deriveEngpass(input: EngpassInput): Engpass {
  const { params } = input.snapshot;
  const legs = allLegs(input);
  const etappe = (n: number) => (n === 1 ? 'Etappe' : 'Etappen');

  const zu = input.routeOptions.filter((o) => o.state === 'zu');
  const befristet = input.routeOptions.filter((o) => o.state === 'schliesst');
  const rot = legs.filter((l) => l.ampel === 'rot');
  // Rot heisst nicht Wind. Unterschieden wird an der Reserve, nicht an der
  // Ampel: negativ = die Aufkreuz-Grenze ist gerissen (upwindWindVerdict),
  // alles andere ist rot aus einem anderen Grund.
  const windGerissen = rot.filter(
    (l) => l.headroom.windKn !== null && l.headroom.windKn < 0,
  );

  let fessel: Fessel;
  let fesselText: string;
  if (zu.length === 0 && befristet.length === 0) {
    fessel = 'keine';
    fesselText =
      `Momentan begrenzt nichts den Raum: jede Option hat bis Tag ` +
      `${input.ppr.effectiveDeadlineDay} einen zulässigen Restplan.`;
  } else if (windGerissen.length > 0) {
    // Die am weitesten über der Grenze, nicht die erstbeste — sie ist das
    // Beispiel, an dem der Skipper die Lage prüft.
    const schlimmste = windGerissen.reduce((a, b) =>
      (a.headroom.windKn ?? 0) <= (b.headroom.windKn ?? 0) ? a : b,
    );
    fessel = 'wind';
    fesselText =
      `Der Wind: ${windGerissen.length} ${etappe(windGerissen.length)} im ` +
      `Möglichkeitsraum reißen die Aufkreuz-Grenze von ${params.maxUpwindTwsKn} kn. ` +
      `Am weitesten darüber: ${legName(input.snapshot, schlimmste)} an Tag ` +
      `${schlimmste.day} — ${num1(Math.abs(schlimmste.headroom.windKn ?? 0))} kn zu viel.`;
  } else if (rot.length > 0) {
    const beispiel = rot[0]!;
    fessel = 'strecke';
    fesselText =
      `Nicht der Wind, sondern die Strecke: ${rot.length} ${etappe(rot.length)} sind rot, ` +
      `ohne die Aufkreuz-Grenze zu reißen. Beispiel ` +
      `${legName(input.snapshot, beispiel)} an Tag ${beispiel.day} — ` +
      `${beispiel.reasons[0] ?? 'außerhalb der Familien-Schwellen'}.`;
  } else {
    fessel = 'kalender';
    fesselText =
      `Der Kalender, nicht der Wind: keine Etappe ist rot — die ` +
      `${zu.length + befristet.length} betroffenen Optionen scheitern an der Restzeit ` +
      `bis Tag ${input.ppr.effectiveDeadlineDay}.`;
  }

  const eng = tightest(
    legs.filter((l) => l.ampel !== 'unbewertet'),
    params,
  );
  let engsteStelleText: string | null = null;
  if (eng) {
    const wo = `${legName(input.snapshot, eng.leg)} an Tag ${eng.leg.day}`;
    // Nominativ und Dativ getrennt: Deutsch braucht beide Artikel, und "die
    // harten Tagesmaximum" ist genau der Patzer, der einen Begründungstext
    // maschinell statt vertrauenswürdig aussehen lässt.
    const grenze =
      eng.kind === 'wind'
        ? {
            nom: `die Aufkreuz-Grenze (${params.maxUpwindTwsKn} kn)`,
            dat: `zur Aufkreuz-Grenze (${params.maxUpwindTwsKn} kn)`,
            einheit: 'kn',
            hinweis: 'Frischt es dort stärker auf, kippt diese Etappe.',
          }
        : {
            nom: `das harte Tagesmaximum`,
            dat: `zum harten Tagesmaximum`,
            einheit: 'h',
            hinweis: 'Wird es langsamer, kippt diese Etappe.',
          };
    engsteStelleText =
      // Eine negative Reserve ist keine kleine Reserve — sonst liest sich
      // "nur -0,2 h bis zum Maximum" so, als wäre da noch Luft.
      eng.reserve < 0
        ? `Engste Stelle im Plan: ${wo} — ${grenze.nom} ist bereits um ` +
          `${num1(Math.abs(eng.reserve))} ${grenze.einheit} überschritten.`
        : `Engste Stelle im Plan: ${wo} — nur ${num1(eng.reserve)} ${grenze.einheit} ` +
          `bis ${grenze.dat}. ${grenze.hinweis}`;
  }

  return {
    fessel,
    fesselText,
    engsteStelle: eng
      ? { legId: eng.leg.legId, day: eng.leg.day, kind: eng.kind, reserve: eng.reserve }
      : null,
    engsteStelleText,
  };
}
