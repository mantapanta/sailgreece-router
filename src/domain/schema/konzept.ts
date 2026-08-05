/**
 * ROUTEN-KONZEPTE — Typen der zentralen, alles überschreibenden Logik
 * (Skipper 2026-08-05). Die Regeln selbst (Marker-Inseln, Lee-Korridor,
 * Eignungs-Beurteilung, Vorrang im Solver) stehen in domain/konzept.ts;
 * hier liegen nur die Formen, damit das Assessment (schema/snapshot.ts) sie
 * tragen kann, ohne Domänen-Code zu importieren.
 */

export type KonzeptId = 'klassik' | 'ost';

export type KonzeptEignung = 'geeignet' | 'grenzwertig' | 'ungeeignet';

export interface KonzeptAssessment {
  id: KonzeptId;
  /** Kuratierter Anzeige-Name — die View soll keine Ids formatieren müssen. */
  name: string;
  beschreibung: string;
  eignung: KonzeptEignung;
  gruende: string[];
  /** Kuratierte Varianten (routeIds), die diesem Konzept folgen. */
  routeIds: string[];
  /** True = das Konzept, dem die App JETZT zu folgen empfiehlt. */
  empfohlen: boolean;
  /** True = die aktuelle Hauptroute (bzw. der Vorschlag) folgt diesem Konzept. */
  aktiv: boolean;
}

export interface KonzeptEntscheid {
  konzepte: KonzeptAssessment[];
  /** Id des empfohlenen Konzepts — Redundanz zur Liste, für direkte Leser. */
  empfohlenId: KonzeptId;
  /**
   * Konzeptwechsel-Hinweis, wenn das AKTIVE Konzept die Lage nicht mehr trägt
   * — der Abbruch-/Umschwenk-Satz der Törnanalyse. Null, solange das aktive
   * Konzept trägt.
   */
  wechselHinweis: string | null;
  /**
   * Die Lage-Beurteilung stützt sich mindestens teilweise auf die
   * Persistenz-Annahme jenseits des Forecast-Horizonts — sichtbarer
   * Vorbehalt, nie stumm (AD-13).
   */
  basisAnnahme: boolean;
}
