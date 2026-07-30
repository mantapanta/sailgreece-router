---
title: 'sailgreece-router MVP — kompletter Build in einem Rutsch'
type: 'feature'
created: '2026-07-30'
status: 'done'
baseline_commit: 'ee58689afc88410ddbb553434eab2984ec70d065'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/prd.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/addendum.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Törnstart 8. August; die tägliche Übersetzung von Windvorhersage in
Routen-Entscheidung passiert im Kopf des Skippers. PRD (27 FRs) und Architektur-Spine
(11 ADs) sind final — es fehlt die lauffähige App.

**Approach:** Kompletter MVP in einem Build gemäß Spine: Vite/React/TS-SPA mit purem
Domain-Core (Scoring, Ampel, Optionsraum, PPR, Polare), Adaptern (Open-Meteo,
Firestore, Geolocation), drei Views (Tagesansicht, Karte, Platz-Detail) und
Seeding-Pipeline mit Review-Gate. Beispieldaten aus dem Brief-Addendum als
Entwicklungs-Startbestand (`approved: false`).

## Boundaries & Constraints

**Always:** Die 11 ADs des Spines sind bindend (Pfad in `context`); insbesondere
AD-2 (Core pur, keine react/firebase/fetch/`Date.now()`-Imports in `domain/`,
Vitest-Fixtures für `ampel`/`scoring`/`polar` Pflicht), AD-4 (normative
ShelterProfile-Form, Zod-Schemas als einzige Quelle), AD-6/AD-9
(Richtungs-/Zeitsemantik), AD-10 (Offset nur in `polar.ts`). UI-Texte Deutsch,
Code Englisch. Ampel-Typ `gruen|gelb|rot|unbewertet`. Pflicht-UI-Hinweise (NFR3,
Datenstand, Attributionen).

**Ask First:** Neue Dependencies jenseits der Spine-Stack-Tabelle; Abweichung von
einer AD; alles, was ein reales Firebase-Projekt/Billing anlegt oder deployed
(Philipp richtet GCP/Firebase selbst ein).

**Never:** Backend/Cloud Functions, Router, Auth, Offline/PWA, Multi-Modell-Vergleich,
Editier-UI, Hafen-Auslastung, Navigationsgefahren-Daten. Keine erfundenen
Schutzprofile als kuratiert ausgeben: Beispieldaten tragen Quellenvermerk aus dem
Brief-Addendum und bleiben `approved: false`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Etappe im Fenster | Etappe Tag N+2, Forecast vorhanden | Score aus Polare+Offset gegen FR16-Budgets, Ampel = schlechtester Punkt (Start/Ziel/Wegpunkte) | N/A |
| Horizont-Ende | Marine-Daten enden vor Tag N+k | Stunden = `null` im Snapshot → Ampel `unbewertet`, Option „offen (Horizont)" mit Vorbehalt | nie grün/rot |
| Nord-Sektor | Schutzsektor `330–60`, Wind aus 10° | Platz gilt als geschützt (CW-Wrap, inklusiv) | N/A |
| Aufkreuzen >25 kn | Kurs gegenan, TWS 27 kn | Etappen-Ampel rot | N/A |
| Invalides Platz-Dokument | Zod-Parse schlägt fehl beim Lesen | Konsolen-Log + Platz sichtbar als `unbewertet` | nie stumm ausblenden |
| Manuelle Position | Nutzer wählt Platz, danach GPS-Fix | `manual` bleibt, bis explizit gelöst | N/A |
| Import ohne Freigabe | Insel-JSON `approved: false` | Import-Skript verweigert mit klarer Meldung | Exit ≠ 0 |
| Forecast-API down | Open-Meteo nicht erreichbar | Query-Error-State, sichtbarer Hinweis + letzter Datenstand mit Zeitstempel | kein Crash |

</frozen-after-approval>

## Code Map

Greenfield — es existiert noch kein Quellcode. Zielstruktur = Structural Seed des
Spines (`src/domain|adapters|ui|app`, `seeding/`, `firebase.json`, `firestore.rules`).

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `index.html` -- Scaffold Vite 8 + React 19 + TS 5.9, Deps exakt aus Spine-Stack -- Fundament
- [x] `firebase.json`, `firestore.rules` -- Hosting → `dist/`; Rules `read: true, write: false` -- AD-5/AD-8
- [x] `src/domain/schema/*.ts` -- Zod-Schemas: Island, Place (+photoUrl), ShelterProfile/Sector (normativ, AD-4), Route/Leg (escalationRank, Wegpunkte), Polar, Params, Ampel-Typ, PlanningSnapshot/Assessment -- einzige Datenform-Quelle
- [x] `src/domain/polar.ts` -- Interpolation f(TWA,TWS), +Offset (einziger Ort), Motor-Param, Fallback-Pauschalen -- FR26/AD-10
- [x] `src/domain/time.ts` -- nightWindow/legWindow (Athens) → UTC-Indizes -- AD-9
- [x] `src/domain/scoring.ts` -- Etappen-Score: Windwinkel, FR16-Budgets (Ziel/Max), Ampelbänder -- FR15–17
- [x] `src/domain/ampel.ts` -- Platz-Ampel (platz, nachtN, snapshot): Sektor-Match inkl. Wrap, Lee/Luv-Laufzeitregel, Welle -- FR8/AD-6
- [x] `src/domain/options.ts`, `src/domain/ppr.ts` -- Restplan-Machbarkeit (gemeinsame Dauerfunktion), Optionszustände offen/schließt/zu, PPR, Entscheidungspunkte, bestPlace je Insel -- FR18–20
- [x] `src/domain/__tests__/*.test.ts` -- Vitest-Fixtures: Sektorsemantik-Referenzfälle, 25-kn-Regel, Budgets, Polar-Interpolation+Offset, Zeitfenster -- AD-2 Pflicht
- [x] `src/adapters/openMeteo.ts` -- Snapshot-Builder: eine Query-Familie, normative Ortsmenge, Stundenachse UTC, `null` jenseits Horizont, Modelllauf-Metadaten -- AD-3
- [x] `src/adapters/firestore.ts` -- Read-only-Reader mit tolerantem Zod-Parse; `VITE_DATA_SOURCE=local` liest Staging-JSON (Dev ohne Firebase-Projekt, gleiches Schema) -- AD-4/AD-5
- [x] `src/adapters/geolocation.ts` -- Browser-Geolocation → Position {source:'gps'} -- FR27
- [x] `src/app/*` -- QueryClient (staleTime 1h), TripContext-Reducer (+localStorage, manual>gps), View-Switch-State -- AD-7/AD-11
- [x] `src/ui/*` -- Tagesansicht (Y.CO-Tageskarten, Optionen nebeneinander, kein Empfehlungsfeld), Karte (@vis.gl, Ampel-Marker, kopierte Polyline-Komponente + Symbol-`repeat` gestrichelt, Windpfeile, Hover-Sync), Platz-Detail; Pflicht-Hinweise; responsive (Split→gestapelt); Vanilla CSS Custom Properties, Creme/Navy -- F1/F7/NFR1–3
- [x] `seeding/` -- Staging-JSON-Struktur je Insel (approved-Flag), Beispieldaten aus Brief-Addendum mit Quellenvermerk, Review-Generator (Markdown → `seeding/review/`), Import-Skript (firebase-admin, strikte Validierung, approved-Gate, Alimos-Rebasing-Feld) -- F8/AD-10
- [x] `README.md` -- Setup: Firebase-Projekt anlegen, Keys/`VITE_`-Vars, Seeding-Ablauf, Deploy -- Übergabe an Philipp

**Acceptance Criteria:**
- Given `npm install && npm run dev` mit `VITE_DATA_SOURCE=local`, when die App öffnet, then zeigt die Tagesansicht Optionen mit Ampeln aus echten Open-Meteo-Daten für die Beispiel-Plätze.
- Given der Forecast-Refresh, when neu berechnet wird, then tragen alle Anzeigen denselben Modelllauf-/Abrufzeitstempel und ändern sich konsistent (AD-3).
- Given ein Platz mit Nord-Wrap-Sektor und Meltemi-Forecast, when die Nacht-Ampel berechnet wird, then entspricht sie den Fixture-Referenzfällen.
- Given `npm test` und `npm run build` und `tsc --noEmit`, when ausgeführt, then alle grün ohne Fehler.
- Given ein grep nach `from 'react'|firebase|fetch(|Date.now` in `src/domain/`, when geprüft, then keine Treffer (AD-2 mechanisch erfüllt).

## Design Notes

Die UX-Phase ist bewusst übersprungen („in einem Rutsch"): Die UI setzt die fünf
Y.CO-Patterns aus dem PRD-Addendum direkt um (Sticky-Split, Tageskarten mit
Versal-Labels + Badges, ruhige Creme/Navy-Palette, Erzählton knapp); Feinschliff
folgt iterativ am laufenden Produkt. Firestore bleibt Ziel-Persistenz; der
`local`-Datenmodus existiert nur, damit Entwicklung und Tests vor Philipps
Firebase-Setup lauffähig sind — gleiche Zod-Schemas, gleicher Reader-Vertrag.

## Verification

**Commands:**
- `npm run build` -- expected: Vite-Build ohne Fehler
- `npm test` -- expected: alle Vitest-Fixtures grün
- `npx tsc --noEmit` -- expected: keine Typfehler
- `grep -rE "from 'react'|from 'firebase|Date.now\(" src/domain/ | wc -l` -- expected: 0

**Manual checks (if no CLI):**
- `npm run dev` → Tagesansicht lädt mit lokalen Beispieldaten und echten Forecasts; Karte zeigt Ampel-Marker + gestrichelte Routen; Handy-Viewport (DevTools) stapelt das Layout.

## Suggested Review Order

**Engine-Vertrag & Assessment (Einstiegspunkt)**

- Der eine Engine-Einstieg: Snapshot rein, komplettes Assessment mit Zeitstempeln raus (AD-3).
  [`assess.ts:64`](../../src/domain/assess.ts#L64)

- Optionszustände offen/offen-horizont/schließt/zu — die FR18-Definition als Code.
  [`options.ts:46`](../../src/domain/options.ts#L46)

- Etappen-Score gegen das künftige Zeitfenster; Override nur für heute.
  [`scoring.ts:124`](../../src/domain/scoring.ts#L124)

**Sicherheitslogik (Schutzampel & Polare)**

- Sektor-Semantik mit Nord-Wrap, inklusiv; Lee/Luv als Laufzeitregel.
  [`ampel.ts:34`](../../src/domain/ampel.ts#L34)

- Punkt-Sektor-Verbot und getrennte Wind-/Wellensektoren im normativen Schema (AD-4).
  [`shelter.ts:24`](../../src/domain/schema/shelter.ts#L24)

- Polar-Offset wird genau hier addiert — nirgendwo sonst (AD-10).
  [`polar.ts:4`](../../src/domain/polar.ts#L4)

**Zeit & Rückweg**

- Athens-definierte Fenster → UTC-Indizes; die einzige Zeitzonen-Übersetzung (AD-9).
  [`time.ts:85`](../../src/domain/time.ts#L85)

- Umgedrehte Etappen behalten die Forecast-Keys der Originale (Review-Kernfix).
  [`ppr.ts:181`](../../src/domain/ppr.ts#L181)

**Schale (Adapter & App-State)**

- Normative Ortsmenge: eine Query-Familie für Plätze + Wegpunkte (AD-3).
  [`openMeteo.ts:45`](../../src/adapters/openMeteo.ts#L45)

- Eine Engine-Instanz pro App statt doppelter Berechnung.
  [`planningContext.tsx:2`](../../src/app/planningContext.tsx#L2)

- TripContext-Reducer: manual schlägt GPS, localStorage validiert (AD-11).
  [`tripContext.tsx:2`](../../src/app/tripContext.tsx#L2)

**UI & Seeding (Peripherie)**

- Tagesansicht: Optionen nebeneinander, kein Empfehlungsfeld (FR21/22).
  [`DayView.tsx:1`](../../src/ui/views/DayView.tsx#L1)

- Import mit Per-Datei-Freigabe-Gate, Uniqueness- und Referenz-Checks (AD-10).
  [`importToFirestore.ts:4`](../../seeding/importToFirestore.ts#L4)

- 83 Fixture-Tests, darunter die Referenzfälle der Sektor-/Budget-/Horizont-Semantik.
  [`__tests__/`](../../src/domain/__tests__)
