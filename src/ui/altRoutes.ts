/**
 * DIE EINE IDENTITÄT EINER ALTERNATIV-ROUTE — Name, Farbe, Herkunft.
 *
 * ZIELMODELL V3 (Skipper 2026-08-07): die KURATIERTEN ROUTEN-NAMEN sind
 * abgeschafft. Bis dahin hiess eine Alternative wie die Variante, aus deren
 * Option sie stammte — "Verlängerung Santorin", "Süd-Route bis Naxos". Der
 * Name war aber nur ein Etikett auf einem Plan, den eine ganz andere Suche
 * geliefert haben konnte: es gab eine "Verlängerung nach Santorin", die auf
 * Naxos endete, und zwei Optionen ("bis Paros", "bis Naxos") konnten auf
 * denselben Plan zusammenfallen, weil beide Ketten dieselbe südlichste Insel
 * (Sifnos) haben.
 *
 * Jede Alternative wird deshalb aus ihrem EIGENEN Plan benannt:
 *
 *     Westrunde · 11 Inseln · Wende Milos
 *
 * Der Name kann damit nichts mehr behaupten, was der Plan nicht tut — er wird
 * aus ihm abgelesen. Die kuratierten Varianten bleiben Seed-Daten für den
 * Etappen-Graphen (jede ihrer Verbindungen steht in legs.json), sind aber
 * keine Angebots-Einheit mehr.
 *
 * Dieses Modul leitet die Identität EINMAL ab, aus der Bewertung (AD-2 — hier
 * wird nichts geurteilt, nur benannt), und beide Ansichten lesen sie:
 *  - Karten-Chip, Karten-Menü und Legende,
 *  - Optionsraum-Zeile und Alternativ-Ansicht der Tagesansicht.
 *
 * `herkunft` ist die Antwort auf die Frage des Skippers in einem Satz: aus
 * welcher Option des Optionsraums die Route stammt und welchem Routen-Konzept
 * sie folgt — oder dass sie der Nachweis der Rest-Trip-Ampel ist und deshalb
 * in keiner Option vorkommt.
 */

import type { KonzeptId } from '../domain/schema/konzept.ts';
import type {
  Assessment,
  OptionState,
  PlanAssessment,
  RouteOptionAssessment,
  RoutenEmpfehlung,
} from '../domain/schema/snapshot.ts';
import { altRouteColor } from './altRouteColors.ts';

/** Kurzform des Routen-Konzepts fürs Badge (Langform im Konzept-Panel). */
export const KONZEPT_KURZ: Record<KonzeptId, string> = {
  klassik: 'Route 1 · West/Zentral',
  ost: 'Route 2 · Ost',
};

/** Wie die Himmelsrichtung im NAMEN einer Runde heisst (Kurzform fürs Chip). */
export const KONZEPT_RUNDE: Record<KonzeptId, string> = {
  klassik: 'Westrunde',
  ost: 'Ostrunde',
};

export const OPTION_STATE_LABEL: Record<OptionState, string> = {
  offen: 'offen',
  'offen-horizont': 'offen · Vorbehalt',
  schliesst: 'schließt',
  zu: 'geschlossen',
};

/**
 * Die EMPFEHLUNGS-Achse einer Option (schema/snapshot.ts). Bewusst getrennt
 * vom Zustands-Chip: "zu · abgeraten" ist eine andere Aussage als "zu", und
 * "offen · abgeraten" heisst — die Route geht, die App rät nur ab.
 */
export const EMPFEHLUNG_LABEL: Record<RoutenEmpfehlung, string> = {
  empfohlen: 'empfohlen',
  moeglich: 'möglich',
  abgeraten: 'abgeraten · wählbar',
};

export interface AltRouteView {
  /** Position in `assessment.alternatives` — sie bestimmt die Farbe. */
  index: number;
  color: string;
  /** DER Name dieser Route. Karte, Optionsraum und Tagesansicht sagen ihn gleich. */
  name: string;
  turnIslandId: string;
  turnName: string;
  stageCount: number;
  /** Die Option, aus der sie stammt — null beim Zeugen der Rest-Trip-Ampel. */
  option: RouteOptionAssessment | null;
  /** Woher diese Route kommt, in einem Satz (Optionsraum + Routen-Konzept). */
  herkunft: string;
  /** Warum die App abrät (leer = sie rät nicht ab). Abgeraten ist nie gesperrt. */
  abratenGruende: string[];
  /** Der bewertete Plan — angesehen wird exakt, was übernommen würde (AD-3). */
  plan: PlanAssessment;
}

/**
 * Identität JEDER Alternative, in der Reihenfolge von `assessment.alternatives`
 * (Domänen-Ergebnis, AD-2). `islandName` kommt vom Aufrufer, damit dieses Modul
 * ohne Snapshot testbar bleibt.
 */
export function altRouteViews(
  assessment: Pick<Assessment, 'alternatives' | 'routeOptions'>,
  islandName: (islandId: string) => string,
): AltRouteView[] {
  /**
   * Erste Option je Alternative gewinnt den Namen: zwei Optionen können nach
   * der Deduplizierung über den Plan-Inhalt (assess.ts) auf denselben Eintrag
   * zeigen — dann ist es EINE Route mit EINEM Namen, nicht zwei.
   */
  const optionByIndex = new Map<number, RouteOptionAssessment>();
  for (const opt of assessment.routeOptions) {
    if (opt.previewIndex === null) continue;
    if (!optionByIndex.has(opt.previewIndex)) optionByIndex.set(opt.previewIndex, opt);
  }

  return assessment.alternatives.map((plan, index) => {
    const option = optionByIndex.get(index) ?? null;
    const turnName = islandName(plan.turnIslandId);
    const stageCount = plan.stages.filter((s) => s.kind === 'stage').length;
    return {
      index,
      color: altRouteColor(index),
      name: altRouteName(plan, turnName, option?.konzeptId ?? null),
      turnIslandId: plan.turnIslandId,
      turnName,
      stageCount,
      option,
      herkunft: option
        ? `Ziel ${option.name} im Optionsraum · ${KONZEPT_KURZ[option.konzeptId]} · ${
            OPTION_STATE_LABEL[option.state]
          } · ${EMPFEHLUNG_LABEL[option.empfehlung]}`
        : 'Nachweis der Rest-Trip-Ampel, dass ein tragfähiger Round-Trip existiert — keine Option des Optionsraums.',
      abratenGruende: option?.abratenGruende ?? [],
      plan,
    };
  });
}

/**
 * DER NAME einer Alternative, abgelesen an ihrem eigenen Plan.
 *
 * Drei Angaben, weil genau die drei den Skipper interessieren und keine davon
 * lügen kann: welche Himmelsrichtung die Runde nimmt (Routen-Konzept), wie
 * viele verschiedene Inseln sie anläuft, und wo sie wendet. Eine Runde, die
 * eine Insel zweimal anläuft, sagt das ebenfalls — das ist der Unterschied,
 * den der Skipper am Namen sehen will.
 */
export function altRouteName(
  plan: PlanAssessment,
  turnName: string,
  konzeptId: KonzeptId | null,
): string {
  const ziele = plan.stages
    .filter((s) => s.kind === 'stage')
    .map((s) => s.toIslandId);
  const inseln = new Set(ziele).size;
  const wiederholt = ziele.length - inseln > 0;
  const richtung = konzeptId ? KONZEPT_RUNDE[konzeptId] : 'Runde';
  return (
    `${richtung} · ${inseln} ${inseln === 1 ? 'Insel' : 'Inseln'}` +
    `${wiederholt ? ' (eine doppelt)' : ''} · Wende ${turnName}`
  );
}

/**
 * Die gewählte Alternative — oder null für die Hauptroute.
 *
 * Jede Neubewertung rechnet die Alternativen neu und kann WENIGER davon
 * liefern; ein Index ins Leere darf nie eine Ansicht ohne Route zurücklassen,
 * sondern fällt auf die Hauptroute zurück. Beide Ansichten und der
 * Auswahl-Kontext prüfen deshalb an genau dieser Stelle.
 */
export function altRouteAt(
  views: AltRouteView[],
  index: number | null,
): AltRouteView | null {
  if (index === null) return null;
  return views[index] ?? null;
}

/** Woher die Route stammt, die eine Ansicht gerade zeichnet. */
export type GezeigteHerkunft = 'alternative' | 'hauptroute' | 'vorschlag' | 'keine';

/**
 * WELCHE ROUTE EINE ANSICHT ZEICHNET — und woher sie stammt.
 *
 * Steht hier und nicht in `MapView`, weil genau diese Entscheidung still
 * kaputtging: die Karte hing allein an `assessment.mainRoute`, und die gibt es
 * erst mit ÜBERNOMMENEM Plan (`assess.ts`: `trip.plan ? assessPlan(…) : null`).
 * Vor der ersten Übernahme zeichnete sie deshalb gar nichts — keine Linie,
 * keine Etappennummern, keine Liste. Der Skipper las das am 2026-08-07 als
 * "es wird gar keine Hauptroute berechnet"; berechnet wurde sie immer, die
 * Tagesansicht zeigte sie sogar. Nur die Karte schwieg.
 *
 * Die Vorrangordnung ist die eine Regel, um die es geht:
 *
 *   eingeblendete Alternative  >  übernommene Hauptroute  >  Vorschlag
 *
 * Der Vorschlag steht ZULETZT und ersetzt die Hauptroute nie — er springt nur
 * ein, wo sonst nichts stünde. Und er wird mit seiner Herkunft zurückgegeben,
 * damit die Ansicht ihn benennen kann: eine gezeichnete Linie ohne
 * Herkunftsangabe wäre eine Behauptung (AD-3).
 */
export function gezeigteRoute(
  shownAlt: PlanAssessment | null,
  mainRoute: PlanAssessment | null,
  vorschlag: PlanAssessment | null,
): { plan: PlanAssessment | null; herkunft: GezeigteHerkunft } {
  if (shownAlt) return { plan: shownAlt, herkunft: 'alternative' };
  if (mainRoute) return { plan: mainRoute, herkunft: 'hauptroute' };
  if (vorschlag) return { plan: vorschlag, herkunft: 'vorschlag' };
  return { plan: null, herkunft: 'keine' };
}
