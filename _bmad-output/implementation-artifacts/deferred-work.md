- source_spec: `_bmad-output/implementation-artifacts/spec-mvp-sailgreece-router.md`
  status: ENTSCHIEDEN (2026-08-03, Philipp: "böen raus") — gustKn ersatzlos entfernt (Abruf, Schema, Fixtures); Planungsgröße bleibt der Mittelwind. wavePeriodS bleibt erhalten: Wellenhöhe plus Periode beschreiben den Schwell-Charakter einer Bucht und sind für die Platz-Ampel fachlich anschlussfähig — falls auch das raus soll, separat entscheiden.
  summary: Böen (gustKn) und Wellenperiode werden abgerufen, fließen aber weder in die 25-kn-Regel noch in die Platz-Ampel ein — Produktentscheidung nötig (z. B. Böen-Schwelle als config-Parameter).
  evidence: Beide Review-Agenten unabhängig; PRD FR11 nennt Böen als Datenpunkt, definiert aber keine Verwendungsregel — jede Implementierung wäre erfundenes Produktverhalten.
- source_spec: `_bmad-output/implementation-artifacts/spec-round-trip-umbau.md`
  status: ERLEDIGT (2026-08-03, Commit a449581) — 14 Legs aus 31 Vorkommen, verlustfrei per Skript verifiziert; saronische-alternative samt ihrer 3 Legs gestrichen; legs-Collection im Import; BREAKING-Ausweis in der Review-Sicht. OFFEN geblieben: die Addendum-Rundrouten (Westkykladen-/Ostkykladen-Runde) sind NICHT angelegt — dort widersprechen sich die Distanzen (Kythnos–Serifos: 17 sm im Seed vs. 31 sm im Addendum), und Distanzen dürfen nicht erfunden werden (AD-10/NFR6). Das ist eine Datenentscheidung für Philipp, kein Strukturthema. Der M3-Kettenbruch Milos→Polyaigos betrifft ebendiese Rundrouten und ist für die aktuellen Daten gegenstandslos.
  summary: Seeding-Umbau — routes.json in deduplizierte legs.json + variants.json überführen (Wegpunkte verlustfrei), saronische-alternative entfernen, M3-Kettenbruch Milos→Polyaigos auflösen, importToFirestore.ts um die legs-Collection erweitern, Leg-Löschung als BREAKING in der Review-Sicht ausweisen.
  evidence: Aus dem Round-Trip-Umbau gesplittet (Spec ~3200 Token, Richtwert 1600). Hängt am Leg/Variant-Schema des Domänen-Kerns, ist danach aber mechanisch und ohne Solver-Risiko.
- source_spec: `_bmad-output/implementation-artifacts/spec-round-trip-umbau.md`
  status: ERLEDIGT (Commit 01741c0, 2026-08-03)
  summary: UI des Round-Trip-Umbaus — DayView mit editierbaren Etappen-Cards (Insel/Platz je Tag, "heute bleiben") und aufklappbarem FR30-Berechnungsausweis, MapView mit Round-Trip-Overlay (gefahren grün durchgezogen, Rest gestrichelt in Rest-Trip-Ampelfarbe, Etappen-Nummern via stageNumber), Ampel-Marker nur für aktuelle und Ziel-Insel.
  evidence: Aus dem Round-Trip-Umbau gesplittet. Setzt das neue Assessment und den TripContext-Plan des Domänen-Kerns voraus; bis dahin bleibt die alte UI auf dem Feature-Branch vorübergehend gebrochen.
- source_spec: `_bmad-output/implementation-artifacts/spec-round-trip-umbau.md`
  status: ERLEDIGT (2026-08-03: nightLeg in assessLeg, Kontingent/Fenster/Windgrenze in validatePlan, 4 Tests)
  summary: FR16-Nachtetappen-Kontingent ist nicht implementiert — die Parameter (nightLegMaxTwsKn, nightLegMaxPerTrip=2, nightLegEarliestDay=8) existieren, aber der Solver zählt Nachtetappen nicht, begrenzt sie nicht auf zwei pro Törn und nicht auf die zweite Woche; die nightLeg-Relaxationsstufe hebt nur das Zeitbudget.
  evidence: Beide Reviewer unabhängig (Edge Case 1.8, Blind Hunter 6). Verifiziert: grep über src/domain zeigt keine Verwendung von nightLegMaxPerTrip/nightLegEarliestDay. PRD FR16 fordert beide Grenzen explizit.
- source_spec: `_bmad-output/implementation-artifacts/spec-round-trip-umbau.md`
  status: ERLEDIGT (2026-08-03: Ankunftszeit gegen returnDeadlineHourAthens, unbekannte Dauer -> Vorbehalt, 3 Tests)
  summary: Die Rückkehr-Deadline wird nur tagesgenau geprüft — returnDeadlineHourAthens (18:00) und deadlineUtcMs aus deadlineFrame() werden nirgends ausgewertet, ein Plan mit Ankunft am 19.8. um 23:00 gilt als rechtzeitig.
  evidence: Edge Case 4.3. Verifiziert: deadlineUtcMs hat keine Leseverwendung. Für den Chartervertrag (Rückgabe 18:00) ist die Stunde die eigentliche Grenze.
- source_spec: `_bmad-output/implementation-artifacts/spec-round-trip-umbau.md`
  status: ERLEDIGT (2026-08-03: Pickup-Tag-else-Zweig, Platz-Insel-Konsistenz, PlanSchema Dubletten+Lücken, offPlan im Assessment, porClamped; 6 Tests)
  summary: Robustheitslücken im Plan-Randbereich — Pickup-Tag nicht im Plan enthalten (Bedingung 3 ohne else-Zweig), Insel eines Hafentag-Pins geht verloren, PlanSchema erlaubt doppelte und lückenhafte Tage, Off-Plan-Position wird nicht markiert, porDeadlineDay wird stumm auf 1 geklemmt, kein Check ob der Deadline-Tag in tripLengthDays passt.
  evidence: Edge Case 2.3, 2.7, 2.8, 2.9, 4.1, 4.2 — je mit Fundstelle belegt. Keiner davon ist sicherheitskritisch, alle sind billig nachzuziehen.
- source_spec: `_bmad-output/implementation-artifacts/spec-round-trip-umbau.md`
  summary: assessPlanning ruft den Solver dreifach pro Durchlauf (Vorschlag, Existenzzeuge, Alternativen) — bei 100-150 Plätzen und 11 Etappen ist das messbar; ein gemeinsamer DP-Lauf würde reichen.
  evidence: Edge Case 4.6. Reine Performance, kein Korrektheitsproblem; erst nach dem Seeding-Umbau mit echten Datenmengen bewertbar.
