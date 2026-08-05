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
export const ALT_ROUTE_COLORS = ['#6f4a9c', '#1f7a8c', '#b05f2c'] as const;

export function altRouteColor(index: number): string {
  return ALT_ROUTE_COLORS[index % ALT_ROUTE_COLORS.length]!;
}
