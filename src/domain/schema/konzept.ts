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

/**
 * ENTSCHEIDUNGSTOR-PRÜFUNG eines Plans (domain/konzept.ts): an natürlichen
 * Knoten (Paros/Naxos; Syros für den Ost-Abzweig) steigt die Exposition,
 * sobald der Törn sich DAHINTER festlegt. Die Regel der Törnanalyse: nur
 * weiter vorstoßen mit einem Forecast-Fenster von ≥ `torFensterStunden`
 * (48 h), das einen machbaren Rückweg einschließt. Je Tor, das der Plan
 * durchfährt, eine Prüfung — am Tag der Festlegung.
 */
export interface TorCheck {
  torId: string;
  /** Anzeige-Name des Tors, z. B. "Paros/Naxos". */
  name: string;
  /** Törntag, an dem der Plan sich hinter das Tor festlegt. */
  day: number;
  /** Erste Insel HINTER dem Tor, die der Plan anläuft. */
  islandId: string;
  /** Das 48-h-Fenster ab Festlegung liegt im verlässlichen Forecast. */
  fensterOk: boolean;
  /** Rückweg von hinter dem Tor nach aktuellem Forecast machbar. */
  rueckwegOk: boolean;
  /** Beide Bedingungen erfüllt — der Vorstoß ist gedeckt. */
  erfuellt: boolean;
  /** Satz für die Anzeige. */
  note: string;
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
