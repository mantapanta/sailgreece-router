/**
 * SCHALTER DER ROUTENBERATUNG (Skipper 2026-08-08).
 *
 * „Ich plane den Trip Insel zu Insel frei von Hand ohne Routen-Warnungen und
 * Empfehlungen — alle Verbindungen sind zugelassen."
 *
 * Die App hat diese Beratung vollständig gerechnet: Optionsraum, Routen-
 * Konzept, Predicted Point of Return, Alternativ-Routen, Solver-Vorschlag,
 * Rest-Trip-Ampel, Entscheidungspunkte. Der Skipper will sie nicht mehr — er
 * legt die Kette selbst, Tag für Tag (`domain/manualPlan.ts`).
 *
 * GELÖSCHT WIRD DAFÜR NICHTS. Solver, Round-Trip-Aufzählung, Konzept-Logik,
 * PPR und Optionen bleiben samt Tests im Repo; sie werden nur nicht mehr
 * gerechnet und nicht mehr angezeigt. Dieser eine Schalter ist der Weg zurück:
 * `true` gibt der Bewertung ihre Routen-Ebene wieder (`assess.assessPlanning`
 * nimmt ihn als Parameter, Default ist dieser Wert), und die Ansichten, die
 * davon lasen, stehen in der Git-Historie vor diesem Commit.
 *
 * Warum ein Schalter und nicht bloss eine stumme Oberfläche: der Solver ist
 * der teuerste Schritt der ganzen Bewertung (vollständige Aufzählung der
 * Runden, elf Aufrufe je Lauf). Ihn bei jeder Planänderung für ein Ergebnis
 * laufen zu lassen, das niemand mehr sieht, wäre Wartezeit ohne Gegenwert.
 */
export const ROUTENBERATUNG = false;
