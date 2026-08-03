---
title: 'Round-Trip-Umbau I: Domänen-Kern (Plan-Modell, Solver, Bewertung)'
type: 'feature'
created: '2026-08-02'
status: 'done'
review_loop_iteration: 0
baseline_commit: '1992f4f8fd47c5b2888ddc1347f9e5fed50671d9'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Die Engine bewertet heute Tagesoptionen und hält einen Optionsraum offen
(`assessPlanning` liefert `routeOptions` + `dayOptions`, der State kennt nur
`trackedRouteId`). Der Feldtest hat das Kernkonzept gedreht: Geplant wird immer der
vollständige Round-Trip Alimos → Alimos über 12 Törntage (11 Etappen + 1 Hafentag),
täglich neu bewertet, mit editierbaren Etappen. Dafür fehlt dem Core das zentrale
Konzept: ein Plan als Entität und ein Solver, der ihn erzeugt.

**Approach:** Der Domänen-Kern wird umgebaut — Plan-Schema, Solver (`completePlan`
durch Erweiterung des vorhandenen `packLegsFeasible`-DP von Boolean-Feasibility auf
Plan-Rückgabe), dreistufige Gültigkeit und ein neues `Assessment`. Alles über Vitest
verifizierbar. Seeding-Umbau und UI folgen als eigene Durchläufe (`deferred-work.md`);
die bestehende UI bricht dabei vorübergehend — akzeptiert auf dem Feature-Branch.

## Boundaries & Constraints

**Always:**
- Der Spine (`context`) ist bindend, insbesondere AD-12 (Plan-Modell, ein
  Mutationspfad, `toPlaceId` nur Skipper-gesetzt) und AD-13 (Gültigkeit dreistufig,
  feste Relaxationsreihenfolge, FR2-Existenzprädikat). Bei Konflikt gewinnt der Spine.
- `domain/` bleibt pur: kein `Date.now()`, kein `fetch`, kein React-Import; Zeit,
  Törntag und Position werden injiziert.
- Es gibt genau einen Rechenpfad für Dauern (`assessLeg`) und einen
  Machbarkeitsbegriff — Solver und Point of Return teilen ihn.
- Die 83 bestehenden Vitest-Tests bleiben grün oder werden bewusst an geänderte
  Verträge angepasst — nie stumm gelöscht.

**Ask First:**
- Jede Änderung an der 65°/25-kn-Aufkreuzschwelle oder ihrer Relaxierbarkeit.
- Wenn sich zeigt, dass das Leg/Variant-Schema die bestehende `routes.json` nicht
  verlustfrei abbilden kann (die Wegpunkt-Anreicherung muss erhalten bleiben).

**Never:**
- Keine UI-Dateien in diesem Durchlauf (`src/ui/`) und kein Seeding-Umbau
  (`seeding/data/`) — beides ist bewusst zurückgestellt.
- Kein Router, kein globaler State-Manager, kein Backend, keine App-Schreibzugriffe
  auf Firestore.
- Keine erfundenen Schutzprofile, Distanzen oder Fährdaten im Core.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Vollständiger Plan | Forecast deckt alle Etappen, alle Bedingungen erfüllt | `completePlan` liefert 12 `PlanDay` (11 Stages + 1 Hafentag), Verdict `feasible`, Rest-Trip-Ampel `gruen` | — |
| Pin respektiert | Pin auf Tag 5 (Insel X) | Jeder gelieferte Plan führt an Tag 5 nach X; ungepinnte Folgetage frei vervollständigt | — |
| Kein gültiger Plan | Meltemi verbaut jede Rückkehr | Am wenigsten verletzender Plan + benannte verletzte Bedingung; Ampel `rot` | kein Throw — Ergebnis, kein Error |
| Relaxation | Ziel-Budget nicht haltbar | Reihenfolge Ziel-Budget → hartes Maximum → Nachtetappe; 65°/25 kn und Pickup nie relaxiert | — |
| Fern-Etappe | Stage jenseits `reliableHorizonDays` | Stage `unbewertet`; zählt nie für/gegen Gültigkeit; Ampel höchstens `gelb` | — |
| Rückkehr-Check | Resttage jenseits Horizont | Rechnung gegen Meltemi-Worst-Case (30 kn 0–45°, 2,0 m); identische Funktion wie PoR | — |
| Existenzprädikat | Hauptroute verletzt, Suchraum enthält gültigen Plan | Ampel `gelb`; der Existenzzeuge ist in der Alternativen-Menge enthalten | — |
| Pickup 15.8. | kein fähre-erreichbarer Hafen am 15.8. erreichbar | Plan ungültig; Bedingung wird nie relaxiert | — |
| Tote Leg-Referenz | Plan referenziert unbekannte Leg-ID | Stage `unbewertet`, gilt nicht als Pin, Plan bleibt bestehen | Konsolen-Warnung |

</frozen-after-approval>

## Code Map

- `src/domain/ppr.ts` -- `packLegsFeasible` = der vorhandene DP (Memo `legIdx:day`,
  drei Züge: eine Etappe, zwei kurze Etappen an einem Tag, Wartetag). Basis für
  `completePlan`. `effectiveDeadlineDay` rechnet heute aus
  `disembarkDay - 1 - bufferDays`.
- `src/domain/assess.ts` -- `assessPlanning` (142 Z.): Position→Insel, Platz-Ampeln,
  `bestPlaceByIsland`, `assessRouteOption` je Route, PoR, Entscheidungspunkte,
  `deriveDayOptions`.
- `src/domain/options.ts` -- `restPlanFeasible` verwirft heute die gefundene
  Tageszuordnung; `deriveDayOptions`, `deriveDecisionPoints`, Optionszustände.
- `src/domain/scoring.ts` -- `assessLeg(leg, day, snapshot, {departureOffsetHours})`
  = der eine Rechenpfad; `budgetVerdict`, `upwindWindVerdict`, `legWaypointKey`.
- `src/domain/schema/route.ts` -- `Leg` (mit `waypoints`, `waypointKeys?`,
  `rebasedFrom?`), `Route`, `RETURN_CHAIN_ROUTE_ID`.
- `src/domain/schema/params.ts` -- ~30 Felder mit Defaults + 5 Cross-Field-Checks.
- `src/domain/schema/snapshot.ts` -- `PlanningSnapshot`, `TripFrame`, `Assessment`
  (reine TS-Interfaces, kein Zod).
- `src/app/tripContext.tsx` -- Reducer, 8 Aktionen, localStorage
  `sailgreece-trip-v1`, Zod-validiert; `deriveCurrentDay(start, len, now)`.
- `src/app/usePlanning.ts` -- zwei TanStack-Queries, ruft `assessPlanning`.
- `src/domain/__tests__/fixtures.ts` -- `makeTimes`, `constantForecast`,
  `makePlace`, `TEST_POLAR`, Snapshot-Builder.

## Tasks & Acceptance

**Execution:**

- [x] `src/domain/schema/params.ts` -- Felder ergänzen: `returnDeadline` (ISO, Athens
  — einzige Deadline-Quelle, `disembarkDay`/`bufferDays` daraus ableiten),
  `reliableHorizonDays` (7), `meltemiWorstCase` ({twsKn:30, fromDeg:0, toDeg:45,
  waveM:2.0}), `pickupLatestArrival` (16:00), `motorThresholdKn`, `alternativesMax` (3)
  -- AD-8: Kalibrierung ohne Redeploy.
- [x] `src/domain/schema/plan.ts` (neu) -- `Plan {schemaVersion, days: PlanDay[]}`;
  `PlanDay` = Stage `{day, legId, toIslandId, toPlaceId?, source:'solver'|'skipper'}`
  oder Hafentag; `stageNumber(plan, day): number|null` als einzige
  Nummerierungsquelle -- AD-12/AD-2.
- [x] `src/domain/schema/route.ts` + `island.ts` -- `Leg` als First-Class-Entität
  (eigene Collection) und `Variant` als Leg-ID-Sequenz modellieren; Insel bekommt
  `pickup15Aug?: {ferryReachable, sourceNote}`, fehlend = nicht erreichbar. Der
  Adapter darf die Legs übergangsweise weiter aus den Routen-Dokumenten auflösen —
  der Seed-Umbau ist ein eigener Durchlauf -- AD-4.
- [x] `src/domain/time.ts` -- eine Funktion leitet aus `returnDeadline` den
  effektiven Deadline-Tag und die PoR-Reserve ab (Puffertag = Reserve)
  -- AD-9: sonst zählen Solver und PoR verschieden.
- [x] `src/domain/scoring.ts` -- `assessLeg` liefert zusätzlich den FR30-Breakdown
  (Segmente mit Wind, TWA, Polar-Speed; Segel- und Motorstunden getrennt); die
  Motor-Einsatzregel bekommt hier ihren Owner -- AD-6/AD-3.
- [x] `src/domain/solver.ts` (neu) -- `completePlan(snapshot, pins)` durch Erweiterung
  des `packLegsFeasible`-DP auf Plan-Rückgabe; dreistufige Gültigkeit, feste
  Relaxationsreihenfolge, Existenzprädikat als Nebenprodukt desselben Laufs
  -- AD-13: der Kern des Umbaus.
- [x] `src/domain/ppr.ts` -- `effectiveDeadlineDay` auf die neue Zeitfunktion
  umstellen; Rückkehr-Check gegen den Meltemi-Worst-Case jenseits des Horizonts;
  exakt diese Funktion nutzt der Solver als Bedingung (2') -- AD-13.
- [x] `src/domain/assess.ts` -- `Assessment` neu fassen: Bewertung der Hauptroute je
  Stage, Rest-Trip-Ampel nach AD-3, `proposal = completePlan(...)`, Alternativen
  inklusive Existenzzeuge, Optionszustände, PoR, Entscheidungspunkte; Platz-Ampeln
  und `bestPlaceByIsland` bleiben -- AD-3: FR22-Empfehlungsverbot aufgehoben.
- [x] `src/app/tripContext.tsx` -- `plan` + Pins statt `trackedRouteId`; Aktionen
  `EDIT_STAGE`, `CHECK_IN`, `ADOPT_INITIAL`, `RELEASE_PIN`; `schemaVersion`;
  `planUnreadable` als benannter Zustand statt stillem Reset; GPS zusätzlich still
  bei jedem Refresh -- AD-11/AD-12/FR27.
- [x] `src/app/usePlanning.ts` -- die Schale ruft `completePlan` synchron beim
  Dispatch und übergibt den fertigen Plan als Payload einer atomaren Aktion; kein
  Effekt dispatcht planverändernd außer `ADOPT_INITIAL` -- AD-12: ein Mutationspfad.
- [x] `src/domain/__tests__/` -- Fixtures um Plan/Pins erweitern; neue Tests für
  `solver.ts` (Gültigkeits-Dreistufung, Relaxationsreihenfolge, Existenzprädikat,
  Pickup-Prädikat, Pin-Respektierung), `plan.ts` (`stageNumber` bei verschobenem
  Hafentag), Horizont-Regel und Worst-Case-Rückkehr; bestehende Tests an geänderte
  Verträge anpassen -- AD-2.

**Acceptance Criteria:**

- Given ein Snapshot ohne Pins, when `completePlan` läuft, then umfasst der Plan
  genau 12 Törntage mit 11 Stages und exakt einem Hafentag.
- Given ein Plan mit Pin auf Tag 5, when erneut vervollständigt wird, then bleibt
  Tag 5 unverändert und nur ungepinnte Tage ändern sich.
- Given eine Hauptroute, die eine FR16-Schwelle verletzt, während im Suchraum ein
  gültiger Plan existiert, when bewertet wird, then ist die Rest-Trip-Ampel `gelb`
  und die Alternativen-Menge enthält diesen Plan.
- Given ein Snapshot, in dem keine Etappenfolge alle Bedingungen erfüllt, when
  bewertet wird, then ist die Ampel `rot`, ein Vorschlag existiert trotzdem, und die
  verletzte Bedingung ist benannt — ohne geworfenen Fehler.
- Given `src/domain/`, when `grep -rE "Date\.now|fetch\(|from 'react'"` läuft, then
  gibt es keine Treffer.

## Spec Change Log

### 2026-08-03 — Review-Runde (Blind Hunter + Edge Case Hunter)

**Auslöser:** Beide Reviewer fanden unabhängig vier sicherheitsrelevante Stellen, an
denen der Code eine Spine-Zusage nur behauptete. Zusätzlich der Befund, dass die
Solver-Fixture mit 5-Tage-Rahmen und Horizont 14 genau die Parameter neutralisierte,
an denen der Code scheitert — der erste Durchlauf war deshalb grün, ohne zu stimmen.

**Eingearbeitet (Code, kein Spec-Wechsel nötig):**
- Meltemi-Worst-Case griff nur bei fehlenden Forecast-Werten, nicht jenseits
  `reliableHorizonDays` → an den Horizont gekoppelt.
- Worst-Case nahm die **Sektormitte** (22°); für ein Rückkehr-Leg mit Kurs 310° ist
  das seitlich und damit harmloser als der reale Nordwind aus 0°. Jetzt wird pro
  Segment die Richtung im Sektor gewählt, die am meisten gegenan steht.
- Rückkehr-Check zweistufig: was der Forecast ausschließt, ist harte Verletzung; was
  nur die Worst-Case-Annahme ausschließt, ist Vorbehalt (gelb). Sonst wäre jeder Törn
  dauerhaft rot, weil bei 30 kn aus N keine Nord-Rückkehr segelbar ist.
- Tage nach dem letzten Leg wurden nie gegen die Tagesbedingung geprüft → der
  Pickup-Tag landete in Athen.
- Doppel-Etappen-Zweig hing an der Insel der *ersten* Etappe → Pins und Pickup, die nur
  per Doppelschlag erreichbar sind, waren unerfüllbar.
- Pins auf vergangene Tage machten `completePlan` zu `null` (jeden Morgen nach einem
  Edit) → werden verworfen, vergangene Tage bleiben im Plan (FR2-Nummerierung 1–11).
- `excludeKey` verwarf den Existenzzeugen → Dedupe jetzt über Plan-Inhalt, der Zeuge
  hat Vorrang (AD-13-Invariante: Gelb ist einlösbar).
- Unlesbarer Plan wurde beim ersten Render überschrieben → der Persist-Effect schreibt
  nicht, solange `planUnreadable` gilt.
- Bedingung (2') prüfte nur einen Wendepunkt und übersprang durch `-1 > -1` Inseln
  ohne Heimweg → prüft jeden Plan-Tag.
- Pickup-Ankunft zählte eine unbewertbare Etappe als 0 h → Ankunft wird nur bei
  bekannter Dauer geprüft.
- Relaxationsleiter hob nur `targetDayHours` (Grün/Gelb-Grenze), Rot hängt an den
  harten Maxima → `nightLeg` hebt jetzt die Decke, begrenzt durch `lightWindMaxHours`.
- Fehlende Position ergab Ampel **rot** → `unbewertet`.

**Fachliche Korrektur durch den Skipper (2026-08-03):** Hafentage sind nicht auf einen
begrenzt — Ziel bleibt 1, Notgrenze `harbourDaysMax` = 5. Die zuvor eingebaute harte
Obergrenze von 1 hätte jeden realistischen 12-Tage-Plan bei perfektem Wetter auf rot
gesetzt. Überschreitung ist eine strukturelle, keine sicherheitsrelevante Verletzung.

**Bekannt-schlechter Zustand, der vermieden wird:** Ampel grün für einen Plan, der nur
im Hafen liegt (keine Verletzung, aber kein Round-Trip) — Grün verlangt jetzt zusätzlich
mindestens eine Etappe.

**KEEP:** Die zweistufige Rückkehrprüfung (Forecast hart / Worst-Case Vorbehalt), die
kursabhängige Worst-Case-Richtung und die Trennung `safetyViolations` vs. strukturelle
Verletzungen müssen jede Neuableitung überleben — an ihnen hängt, ob die App im
Meltemi-Moment das Richtige sagt.

**Offen (in `deferred-work.md`):** Nachtetappen-Kontingent (FR16: max 2, zweite Woche),
Deadline-Uhrzeit statt nur -Tag, sechs Robustheitslücken im Plan-Randbereich,
dreifacher Solverlauf.

## Design Notes

`packLegsFeasible` behält Memo-Struktur (`legIdx:day`) und die drei Züge; nur der
Rückgabetyp wächst vom Etikett zum Pfad:

```ts
type SolveResult = { days: PlanDay[]; verdict: Feasibility; violated: Violation[] };
// search(legIdx, day) liefert den besten Rest-Pfad statt nur 'feasible'
```

Wartetage werden zu Hafentagen; da genau einer erlaubt ist, ist ihre Zahl im DP auf 1
begrenzt — das schrumpft den Suchraum, statt ihn zu vergrößern.

Die Relaxation ist eine äußere Schleife über denselben DP mit gelockerten Params
(Ziel-Budget → hartes Maximum → Nachtetappe), nie ein Sonderpfad im DP. So bleibt
garantiert, dass die nie-relaxierbaren Bedingungen strukturell unerreichbar für die
Lockerung sind.

## Verification

**Commands:**
- `npx vitest run` -- expected: alle Tests grün, inklusive der neuen Solver-Tests
- `npx tsc --noEmit` -- expected: keine Fehler in `src/domain/` und `src/app/`
  (Fehler in `src/ui/` sind in diesem Durchlauf erwartet und dokumentiert)
- `grep -rE "Date\.now|fetch\(|from 'react'" src/domain/` -- expected: keine Treffer

## Suggested Review Order

**Der Solver-Vertrag (hier zuerst lesen)**

- Einstieg: baut den Round-Trip, respektiert Pins, relaxiert in fester Reihenfolge
  [`solver.ts:501`](../../src/domain/solver.ts#L501)

- Die dreistufige Gültigkeit — was einen Plan ungültig macht und was nur ein Vorbehalt ist
  [`solver.ts:243`](../../src/domain/solver.ts#L243)

- Zweistufiger Rückkehr-Check: Forecast bindet hart, Worst-Case nur als Vorbehalt
  [`solver.ts:342`](../../src/domain/solver.ts#L342)

- FR2-Existenzprädikat: sicher UND fährt tatsächlich — sonst kein Zeuge
  [`solver.ts:611`](../../src/domain/solver.ts#L611)

**Sicherheitskritisch: der Meltemi-Worst-Case**

- Richtung im Sektor, die am meisten gegenan steht — nicht die harmlosere Sektormitte
  [`scoring.ts:129`](../../src/domain/scoring.ts#L129)

- Substitution am verlässlichen Horizont, nicht erst bei fehlenden Werten
  [`scoring.ts:210`](../../src/domain/scoring.ts#L210)

**Der Packer: vom Urteil zum Fahrplan**

- DP gibt jetzt die Tageszuordnung zurück statt sie zu verwerfen
  [`ppr.ts:63`](../../src/domain/ppr.ts#L63)

- Tage nach dem letzten Leg gegen die Tagesbedingung prüfen (sonst verfehlt der Pickup)
  [`ppr.ts:121`](../../src/domain/ppr.ts#L121)

**Plan-Modell und Ownership**

- Etappe = Tag mit Tagesziel; `legIds` als Liste wegen Doppelschlag-Tagen
  [`plan.ts:32`](../../src/domain/schema/plan.ts#L32)

- Trennung Sicherheits- vs. Strukturverletzung — entscheidet rot gegen gelb
  [`plan.ts:96`](../../src/domain/schema/plan.ts#L96)

- Die einzige Nummerierungsquelle, unabhängig von der Hafentag-Position
  [`plan.ts:141`](../../src/domain/schema/plan.ts#L141)

**Ein Mutationspfad (Schale)**

- Nur hier wird der Plan geändert; `ADOPT_INITIAL` genau einmal
  [`tripContext.tsx:106`](../../src/app/tripContext.tsx#L106)

- Kein Schreiben, solange der Plan unlesbar ist — sonst stiller Verlust aller Pins
  [`tripContext.tsx:216`](../../src/app/tripContext.tsx#L216)

- Schale rechnet synchron beim Dispatch, Reducer rechnet nie
  [`usePlanning.ts:126`](../../src/app/usePlanning.ts#L126)

**Bewertung und Konfiguration**

- Die FR2-Ampel: grün verlangt zusätzlich, dass der Plan fährt
  [`assess.ts:277`](../../src/domain/assess.ts#L277)

- Eine Deadline-Quelle, aus der Solver und PoR dieselben Tage lesen
  [`time.ts:106`](../../src/domain/time.ts#L106)

- Hafentage: Ziel 1, Notgrenze 5 (Skipper-Entscheid 2026-08-03)
  [`params.ts:89`](../../src/domain/schema/params.ts#L89)

**Peripherie**

- Regressionstests mit realistischen Parametern — je einer pro Review-Befund
  [`solver-regression.test.ts:1`](../../src/domain/__tests__/solver-regression.test.ts#L1)

- Solver-Grundverhalten: Kandidaten, Pins, Pickup, Determinismus
  [`solver.test.ts:1`](../../src/domain/__tests__/solver.test.ts#L1)
