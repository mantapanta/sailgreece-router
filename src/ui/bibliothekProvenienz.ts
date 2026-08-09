/**
 * WAS IST ÜBERHAUPT GELADEN — die Bibliothek in einer Zeile, plus der Satz zur
 * Herkunft der nachgeladenen Ebenen (adapters/firestore.ts, Modulkopf).
 *
 * Der Anlass ist eine Frage, die die App bis 2026-08-09 nicht beantworten
 * konnte: „Die Kitespots & Restaurants sind nicht sichtbar." Eine Ebene, die
 * fehlt, sah aus wie eine Ebene, die es nicht gibt — auf der Karte kein Chip,
 * im Platzdetail keine Karte, in der Fusszeile kein Wort. Die Zählzeile macht
 * daraus eine Auskunft: 0 Kite-Spots heisst „nicht geladen", 14 heisst
 * „geladen, heute liegt eben keiner an der Route".
 *
 * Reine Anzeige-Verdichtung (AD-2): hier wird nichts bewertet und nichts
 * gerechnet, was die Domain nicht schon weiss.
 */

import type { Library, NachgeladeneEbene } from '../domain/schema/snapshot.ts';

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

const EBENEN_LABEL: Record<NachgeladeneEbene, string> = {
  kiteSpots: 'Kite-Spots',
  restaurants: 'Tavernen',
};

/**
 * Der Herkunftssatz für nachgeladene Ebenen — null, wenn alles aus der
 * konfigurierten Quelle kam (der Normalfall, und dann steht hier auch nichts).
 *
 * Er nennt beides: dass die Ebene da ist, UND dass die Datenbank sie nicht
 * hatte. Nur das erste zu sagen wäre bequem und würde den ausstehenden Import
 * verschweigen — der Ersatz ist ein Notnagel, kein Zustand.
 */
export function nachgeladenSatz(library: Library): string | null {
  const ebenen = library.nachgeladen ?? [];
  if (ebenen.length === 0) return null;
  const namen = ebenen.map((e) => EBENEN_LABEL[e]).join(' und ');
  return (
    `${namen} stammen aus dem App-Bundle, nicht aus Firestore: dort war die Ebene leer. ` +
    'Die Daten sind die freigegebenen Staging-Stände — nach dem nächsten Import ' +
    '(npm run seed:import) kommen sie wieder aus der Datenbank.'
  );
}
