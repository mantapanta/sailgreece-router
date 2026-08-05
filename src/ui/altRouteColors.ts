/**
 * Farben der Alternativ-Routen — EINE Zuordnung für beide Ansichten.
 *
 * Der Index ist die Position in `assessment.alternatives` (deren Reihenfolge
 * ist Domänen-Ergebnis, AD-2): die Vorschau in der Tagesansicht und die
 * eingeblendete Linie auf der Karte zeigen dieselbe Alternative in derselben
 * Farbe, sonst müsste der Skipper die Zuordnung im Kopf übersetzen.
 *
 * Bewusst weder Grün, Gelb, Rot (von der Ampel besetzt) noch das Navy der
 * Hauptroute — eine Alternative, die aussieht wie ein Urteil oder wie der
 * Plan selbst, wäre auf der Karte nicht mehr als Alternative lesbar.
 */
export const ALT_ROUTE_COLORS = ['#6f4a9c', '#1f7a8c', '#b05f2c', '#8a2f5e', '#4a6b2f'] as const;

export function altRouteColor(index: number): string {
  return ALT_ROUTE_COLORS[index % ALT_ROUTE_COLORS.length]!;
}

/**
 * Farbe je Ziel-Karte, in der Reihenfolge von `assessment.ziele`: nur Karten
 * MIT Route bekommen eine (nur die sind zeichenbar). Tagesansicht und Karte
 * rufen BEIDE diese Funktion auf derselben Liste auf — dieselbe Alternative
 * trägt so überall dieselbe Farbe.
 */
export function zielColors(ziele: { route: unknown | null }[]): (string | null)[] {
  let next = 0;
  return ziele.map((z) => (z.route ? altRouteColor(next++) : null));
}
