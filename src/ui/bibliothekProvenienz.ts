/**
 * WAS IST ÜBERHAUPT GELADEN — die Bibliothek in einer Zeile.
 *
 * Der Anlass ist eine Frage, die die App bis 2026-08-09 nicht beantworten
 * konnte: „Die Kitespots & Restaurants sind nicht sichtbar." Eine Ebene, die
 * fehlt, sah aus wie eine Ebene, die es nicht gibt — auf der Karte kein Chip,
 * im Platzdetail keine Karte, in der Fusszeile kein Wort. Die Zählzeile macht
 * daraus eine Auskunft: 0 Kite-Spots heisst „nicht geladen" (dann steht etwas
 * in der Datei nicht, was dort stehen sollte), 14 heisst „geladen, heute liegt
 * eben keiner an der Route".
 *
 * Reine Anzeige-Verdichtung (AD-2): hier wird nichts bewertet und nichts
 * gerechnet, was die Domain nicht schon weiss.
 */

import type { Library } from '../domain/schema/snapshot.ts';

/** Deutscher Singular/Plural ohne Bibliothek — die App zählt kleine Zahlen. */
function zaehl(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * „Bibliothek: 42 Inseln · 97 Plätze · 31 Tavernen · 14 Kite-Spots".
 *
 * Tavernen werden über die Plätze summiert, weil die Gastronomie kein eigenes
 * Dokument hat (schema/gastro.ts) — genau der Grund, warum ihr Fehlen im
 * Deploy so schwer zu sehen war.
 */
export function bibliothekZeile(library: Library): string {
  const tavernen = library.places.reduce((s, p) => s + (p.restaurants?.length ?? 0), 0);
  const teile = [
    zaehl(library.islands.length, 'Insel', 'Inseln'),
    zaehl(library.places.length, 'Platz', 'Plätze'),
    zaehl(library.legs.length, 'Etappe', 'Etappen'),
    zaehl(tavernen, 'Taverne', 'Tavernen'),
    zaehl(library.kiteSpots?.length ?? 0, 'Kite-Spot', 'Kite-Spots'),
  ];
  return `Bibliothek: ${teile.join(' · ')}`;
}

/**
 * Der Satz zum gesicherten Forecast (adapters/forecastCache.ts) — null, solange
 * die Zahlen frisch vom Netz kommen.
 *
 * Er sagt zweierlei, und das zweite ist das wichtigere: dass etwas dasteht, UND
 * dass es von vorhin ist. Wie alt genau, steht schon in derselben Zeile
 * ("abgerufen …") und in der Stale-Markierung davor — hier fehlt also nur noch,
 * WOHER es kommt, damit niemand einen laufenden Abruf dahinter vermutet.
 */
export function ausSpeicherSatz(ausSpeicher: boolean): string | null {
  if (!ausSpeicher) return null;
  return (
    'Diese Zahlen stammen aus dem Gerätespeicher — dem letzten Abruf, der ' +
    'durchkam. Sobald wieder Netz da ist, ersetzt der nächste Abruf sie von ' +
    'selbst; bis dahin gilt der Zeitstempel oben.'
  );
}

/**
 * Woher die beiden Ebenen kommen, die NICHT in der Datenbank stehen
 * (adapters/firestore.ts, Modulkopf) — ein Satz, damit niemand sie dort sucht.
 */
export function dateiEbenenSatz(): string {
  return (
    'Kite-Spots und Tavernen kommen aus den JSON-Dateien der App ' +
    '(seeding/data/kitespots.json, seeding/data/islands/*.json), nicht aus Firestore — ' +
    'sie sind mit jedem Deploy aktuell und brauchen keinen Import.'
  );
}
