/**
 * DIE EINE IDENTITÄT EINER ALTERNATIV-ROUTE — Name, Farbe, Herkunft.
 *
 * Feedback Skipper 2026-08-06: „Ich verstehe nicht, wie Routen-Konzept &
 * Optionsraum mit den alternativen Routen in der Kartenansicht zusammenpassen.
 * Die Namen sind anders, es ist nicht selbsterklärend."
 *
 * Die Ursache war keine Logik, sondern die Beschriftung: dieselbe Route hiess
 * auf der Karte „3. Wendepunkt Amorgos" (Listenplatz + Wendeinsel) und im
 * Optionsraum nach ihrem kuratierten Namen („Verlängerung Amorgos"), obwohl
 * beides derselbe `assessment.alternatives`-Eintrag ist: der Optionsraum zeigt
 * per `previewIndex` genau dorthin (assess.ts, VERSCHMELZUNG).
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

export const OPTION_STATE_LABEL: Record<OptionState, string> = {
  offen: 'offen',
  'offen-horizont': 'offen · Vorbehalt',
  schliesst: 'schliesst',
  zu: 'zu',
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
    return {
      index,
      color: altRouteColor(index),
      name: option ? option.name : `Tragfähiger Round-Trip über ${turnName}`,
      turnIslandId: plan.turnIslandId,
      turnName,
      stageCount: plan.stages.filter((s) => s.kind === 'stage').length,
      option,
      herkunft: option
        ? `Aus dem Optionsraum · ${KONZEPT_KURZ[option.konzeptId]} · ${
            OPTION_STATE_LABEL[option.state]
          } · ${EMPFEHLUNG_LABEL[option.empfehlung]}`
        : 'Nachweis der Rest-Trip-Ampel, dass ein tragfähiger Round-Trip existiert — keine Option des Optionsraums.',
      abratenGruende: option?.abratenGruende ?? [],
      plan,
    };
  });
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
