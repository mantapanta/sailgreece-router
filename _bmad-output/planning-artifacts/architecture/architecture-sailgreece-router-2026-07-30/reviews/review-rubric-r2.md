# Rubric-Review — Architecture Spine Revision 2 (sailgreece-router)

- **Prüfobjekt:** `_bmad-output/planning-artifacts/architecture/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md` (Rev 2, 2026-08-02)
- **Reviewer:** Rubric-Walker (Architektur-Reviewer-Gate)
- **Datum:** 2026-08-02
- **Kontext:** Feature-Altitude, brownfield. Bestandscode in `src/` folgt Revision 1 (u. a. `trackedRouteId`, keine `solver.ts`, Legs in Routen eingebettet); der Spine bindet den Round-Trip-Umbau. Stichproben gelesen: `src/domain/assess.ts`, `src/domain/ppr.ts`, `src/app/tripContext.tsx`, `src/domain/schema/route.ts`, `src/domain/schema/params.ts`, `package.json`, PRD (`prd.md`).

**Gate-Verdict: BESTANDEN MIT AUFLAGEN** — keine kritischen Befunde; zwei hohe Befunde (Deadline-Migration, Horizont-Fall der Rest-Trip-Ampel) sollten vor dem Story-Schnitt in den Spine eingearbeitet werden, da sie genau die Divergenz erzeugen können, die AD-3/AD-13 verhindern wollen.

---

## Checkliste

### 1. Fixiert der Spine die echten Divergenzpunkte für die Ebene darunter?

**Weitgehend ja.** Die großen Pivot-Divergenzpunkte sind sauber gebunden: Plan als persistierte Entität mit Pin-Semantik und Erststart-Adoption (AD-12), ein einziger Machbarkeitsbegriff über `assessLeg` (AD-3/AD-13), Leg-Deduplizierung und Varianten als Leg-ID-Sequenzen (AD-4/AD-5), Relaxations-Reihenfolge fix im Core (AD-13), Sektor- und TWA-Semantik (AD-6), Zeitfenster (AD-9), Config-Ownership (AD-8). Das ist die richtige Menge für Feature-Altitude.

**Vier Divergenzpunkte fehlen oder sind unterbestimmt:**

#### Befund R1 — Deadline-Migration: `returnDeadline` (Zeitpunkt) vs. bestehendes `disembarkDay`/`bufferDays` (Tagesgranular) ungeregelt
- **Schweregrad:** hoch
- **Fundstelle:** AD-8 („neu: `returnDeadline` (19.8. 18:00 Athens)"), AD-13 Gültigkeit (2) („Ankunft Alimos ≤ **einer** Deadline-Konstante `returnDeadline` … dieselbe Konstante für Gültigkeit und PoR") vs. Bestand `src/domain/ppr.ts` (`effectiveDeadlineDay = disembarkDay - 1 - bufferDays`, tagesgranular, inkl. Puffertag-Semantik „Vorabend der Abgabe") und `src/domain/schema/params.ts` (`disembarkDay`, `bufferDays` mit Refinements).
- **Problem:** Der Spine führt eine **Datetime**-Konstante ein, der ratifizierte PoR-Kern rechnet aber in **Törntagen** mit Puffer-Arithmetik. Ob `disembarkDay`/`bufferDays` entfallen, auf `returnDeadline` abgebildet werden (wie?) oder parallel weiterleben, ist unfixiert. Zwei unabhängig bauende Einheiten (Solver-Story vs. PoR-Anpassungs-Story) können hier exakt die zwei Machbarkeitsbegriffe bauen, die AD-13 ausdrücklich verhindern will (Solver: „Ankunft ≤ 19.8. 18:00", PoR: „Tag ≤ disembarkDay−1−buffer").
- **Fix:** In AD-13 einen Satz binden, z. B.: „`returnDeadline` ersetzt das Paar `disembarkDay`/`bufferDays`; `effectiveDeadlineDay` wird pur aus `returnDeadline` abgeleitet (Ankunftstag, dessen `legWindow` vor der Deadline endet), die alten Config-Felder werden entfernt" — oder die bewusste Koexistenz mit Ableitungsregel festschreiben.

#### Befund R2 — Rest-Trip-Ampel: der Horizont-Fall ist doppelt geregelt und dadurch mehrdeutig
- **Schweregrad:** hoch
- **Fundstelle:** AD-3 (FR2-Definition: „`gelb` = Hauptroute verletzt Kriterien **oder hängt am Horizont**, aber ein gültiger alternativer Round-Trip existiert; `rot` = kein gültiger Round-Trip existiert") vs. AD-13 Horizont („Stages jenseits `reliableHorizonDays` werden gegen das … Worst-Case-Szenario bewertet").
- **Problem:** Wenn Fern-Stages per AD-13 gegen das Worst-Case-Szenario bewertet werden und **bestehen**, „hängt" die Hauptroute dann noch „am Horizont" (→ gelb) oder ist sie gültig (→ grün)? Und was ist eine Route, die nur am Horizont hängt, während **keine** Alternative existiert — gelb-Definition greift nicht, rot-Definition („kein gültiger Round-Trip") womöglich auch nicht? Zwei Teams (Solver vs. Ampel-Aggregation/UI-Story) können hier verschieden mappen; die Ampel ist das zentrale FR2-Signal.
- **Fix:** Ein normatives Mapping in AD-3 (oder AD-13) festschreiben, z. B.: „Worst-Case-bestandene Fern-Stages machen die Hauptroute gültig; grün trägt dann die Kennzeichnung ‚Fernbereich — Worst-Case-Annahme'. Gelb entsteht nur durch Kriterienverletzung bei existierender Alternative; Horizont allein färbt nie gelb" — oder die gegenteilige Entscheidung, aber genau eine.

#### Befund R3 — Off-Plan-Position: Boot weicht ohne Etappen-Edit vom Plan ab
- **Schweregrad:** mittel
- **Fundstelle:** AD-12 („Neuberechnungen re-bewerten sie nur … mutieren sie nie"; „vergangene Tage sind implizit fixiert") i. V. m. AD-3 (Bewertung der Hauptroute je Stage) und FR18 (Solver plant „aus aktueller Position").
- **Problem:** Wenn die reale Position (GPS) nicht dem Ziel der gestrigen Plan-Stage entspricht (Skipper ist spontan woanders hingefahren, ohne zu editieren), ist unfixiert, wogegen die heutige Stage re-bewertet wird (Leg ab Plan-Insel vs. ab Ist-Insel) und ob der Solver-Vorschlag ab Ist-Position stumm vom Plan divergiert. Bewertungs-Story und Solver-Story können das verschieden auflösen.
- **Fix:** Einen Satz in AD-12 binden, z. B.: „Weicht die Ist-Position von der Plan-Position ab, wird die Hauptroute unverändert re-bewertet (Stage ab Plan-Insel) und als verletzt markiert, wenn sie von der Ist-Position nicht erreichbar ist; der Vorschlag startet immer an der Ist-Position."

#### Befund R4 — FR31-Pickup: Datenform deferred, obwohl ein harter Solver-Constraint darauf steht
- **Schweregrad:** mittel
- **Fundstelle:** AD-4 („Pickup-Fähigkeit … `[ASSUMPTION: Feldname/Form bei der Kuration]`"), Deferred („Fähren-Daten für FR31 … Datenform am Insel-Dokument: bei der Kuration recherchieren und festlegen"), AD-13 Gültigkeit (3) (Pickup als harte, nie relaxierte Bedingung).
- **Problem:** Die **Form** (nicht nur der Inhalt) eines Feldes, das ein harter Solver-Constraint konsumiert, ist auf die Kuration verschoben. Solver-Story und Seeding-Story bauen parallel; ohne fixierte Form im Schema entsteht ein Sequenzierungs-/Divergenzrisiko (siehe auch Checkpunkt 3).
- **Fix:** Die Form jetzt in `domain/schema` normieren (z. B. `island.ferryPickupReachable: boolean` oder eine Insel-Liste im `config`-Dokument), nur die **Inhalte** (welche Inseln) deferred lassen.

### 2. Ist jede AD-Rule durchsetzbar und verhindert sie die genannte Divergenz?

**Überwiegend ja.** Die Rules sind fast durchgehend als Code-Review-Prädikate formuliert: Import-Verbote und Testpflicht (AD-2), ein Engine-Einstieg + eine Query-Familie (AD-3, AD-7), Zod-Schemas als einzige Quelle (AD-4), `read: true / write: false` (AD-5), normative Fenster-Formeln und das TWA-Prädikat mit expliziter Fehllesart-Warnung (AD-6, AD-9), Config-Feldliste (AD-8), enumerierte Reducer-Aktionen und Präzedenz (AD-11), Pin-/Check-in-Semantik (AD-12), Relaxations-Reihenfolge und Nie-Relaxierbares (AD-13). `[ASSUMPTION]`-Marker sind ehrlich gesetzt statt versteckt. Schwächen:

#### Befund R5 — AD-12: „der Solver darf den Hafentag verschieben, wenn das Rückkehrfenster es erzwingt" ist nicht nachprüfbar
- **Schweregrad:** niedrig
- **Fundstelle:** AD-12, Klammerzusatz zum Hafentag.
- **Problem:** „erzwingt" ist kein Prädikat; zudem ist offen, ob der Hafentag pinbar ist bzw. ob FR28-Editing ihn erfasst (FR28 spricht nur von Etappen).
- **Fix:** Präzisieren: „Der Solver verschiebt den Hafentag nur, wenn mit Hafentag am 15.8. kein gültiger Plan existiert, mit Verschiebung aber schon; ein `source: 'skipper'`-Hafentag ist ein Pin wie jede Stage."

#### Befund R6 — AD-6: Ablageort der Böen-Ausnahme unbenannt
- **Schweregrad:** niedrig
- **Fundstelle:** AD-6 („Böen zählen nicht gegen diese Schwelle `[ASSUMPTION: kalibrieren]`") vs. AD-8-Config-Liste.
- **Problem:** Kalibrierbar „ohne Redeploy" (AD-8-Prinzip) wäre das nur als Config-Feld; die AD-8-Aufzählung nennt es nicht. Zwei Leser können es als Code-Konstante bzw. Config-Flag bauen.
- **Fix:** In AD-8 unter „FR16-Schwellen und -Budgets" explizit aufnehmen (z. B. `gustsCountAgainstTwaThreshold: boolean`).

### 3. Kann ein Deferred-Punkt zwei unabhängig bauende Einheiten divergieren lassen?

Fünf von sieben Deferred-Punkten sind sauber „einbesitzt" (Solver-Interna hinter dem AD-13-Vertrag; Hafentag-UX rein in der UI; Kalibrier-Werte mit einem Owner im Config-Dokument; Foto-Hosting hinter `photoUrl`; CI ohne Konsument). **Ausnahme:** die Fähren-**Datenform** (Befund R4) — sie hat zwei Konsumenten (Seeding und Solver) und ist der einzige Deferred-Punkt mit echtem Divergenzpotenzial. Zweite, kleinere Beobachtung: „Gelb-Band-Reserve & Kalibrier-Werte" deferred auch die „Nachtetappen-Folgetag-Regel" — deren **Mechanik** ist aber in AD-13 bereits fixiert („Folgetag auf das Ziel-Budget begrenzt"), deferred ist nur der Wert; die Formulierung im Deferred-Block sollte das nicht wieder aufweichen (niedrig, redaktionell).

### 4. Ratifiziert der Spine den Brownfield-Bestand statt ihm zu widersprechen?

**Inhaltlich ja — die Ratifikation ist auffallend präzise:** AD-13 benennt korrekt den vorhandenen `packLegsFeasible`-Kern in `ppr.ts` als DP über Etappe × Tag (verifiziert); AD-10s „keine Orts- oder Distanzkonstanten in `ppr.ts`" und die fixe ID `rueckfallkette-west` stimmen mit `src/domain/ppr.ts`/`src/domain/schema/route.ts` (`RETURN_CHAIN_ROUTE_ID`) überein; AD-11-Präzedenz (manual schlägt GPS bis zum expliziten Lösen) ist exakt der Reducer in `src/app/tripContext.tsx`; die Stack-Tabelle deckt sich mit `package.json` (Vite ^8.2.0, React ^19.2.8, TS ~5.9.0, Zod ^4.4.3, firebase-admin ^14.2.0, Node ≥ 22.18); AD-8-Config-Felder (`polarOffsetKn` 0.5, `motorSpeedKn` 8) existieren in `params.ts`. Der geplante Umbau (Plan statt `trackedRouteId`, `solver.ts` neu, Legs first-class) ist korrekt als Umbau markiert (Kursiv-Punkte im Structural Seed, „NEU", „entfällt zugunsten"). **Ein Widerspruch auf Behauptungsebene:**

#### Befund R7 — Präambel behauptet, der Bestand halte „AD-1 bis AD-11 nachweislich ein" — falsch für die amendierten Fassungen
- **Schweregrad:** mittel
- **Fundstelle:** Spine-Präambel (Z. 21–24) vs. Bestand: `src/app/tripContext.tsx` hat `trackedRouteId` und keinen Plan (AD-11 Rev 2: „`trackedRouteId` entfällt zugunsten des Plans"); `src/domain/schema/route.ts` bettet volle `Leg`-Objekte in Routen ein statt Leg-ID-Sequenzen über eine Top-Level-`legs`-Collection (AD-4/AD-5 Rev 2); `src/domain/assess.ts` dokumentiert ausdrücklich „NO recommendation field (FR22)" gegen den Rev-2-AD-3 (aktiver Vorschlag Pflicht).
- **Problem:** Dieselbe Präambel listet AD-3, AD-4, AD-5, AD-11 als **amendiert** — der Bestand kann die amendierten Fassungen logisch nicht einhalten. Ein Story-Autor, der der Präambel glaubt, plant den Umbau dieser ADs nicht ein.
- **Fix:** Formulieren: „Der Bestandscode hält AD-1 bis AD-11 **in ihrer Revision-1-Fassung** nachweislich ein; die Rev-2-Amendments von AD-3, AD-4, AD-5, AD-11 sowie AD-12/AD-13 definieren den Umbau-Sollzustand."

#### Befund R8 — Kleinere Bestandsabweichungen (redaktionell)
- **Schweregrad:** niedrig
- **Fundstellen:** (a) AD-9: „`deriveCurrentDay` … Rechnung in der Domäne" — die Tages-Arithmetik liegt tatsächlich in `src/app/tripContext.tsx` (pur, nutzt `athensToUtcMs` aus `domain/time`), nicht in `domain/`. (b) Structural Seed zählt die Domain-Module auf, `geo.ts` (existiert, wird von `assess.ts` genutzt) fehlt. (c) AD-11 nennt den Day-Override „ohne UI-Element `[ASSUMPTION]`" — der Bestand trägt `SET_DAY`/`CLEAR_DAY_OVERRIDE` bereits reducerseitig, konsistent, aber der Persistenz-Schlüssel `sailgreece-trip-v1` und die Migrationsregel für den Plan-Umbau (alter State wird beim Zod-Fail stumm verworfen — inkl. Position) sind unbenannt.
- **Fix:** (a) entweder Formulierung angleichen („pur in der Schale, Zeitlogik aus `domain/time`") oder Verschiebung nach `domain/` als Umbau-Punkt markieren; (b) `geo.ts` ergänzen; (c) einen Satz zur Storage-Versionierung binden (neuer Key `…-v2` oder Migrationsregel: Position übernehmen, `trackedRouteId` verwerfen) — sonst entscheidet das jede Story anders (Teilaspekt von R1/R3-Umfeld, eigenständig niedrig).

### 5. Deckt der Spine alle Capabilities des treibenden PRD ab?

**Ja.** `binds`-Frontmatter: F1–F8 + NFR0–NFR6 vollständig. Die Capability-→-Architecture-Map ordnet alle acht Capabilities mit FR-Nummern zu (F1: FR1–5, F2: FR6–8, F3: FR9–10, F4: FR11–13, F5: FR15–17/26/30, F6: FR18–20/27/31/32, F7: FR21–22/28–29, F8: FR23–25); gegen die PRD-FR-Liste geprüft fehlt nur FR14 — korrekt, denn FR14 ist im PRD gestrichen. Die Feldtest-FRs (FR28–FR32) sind alle gebunden (AD-11/12/13). Randnotiz (niedrig, kein eigener Befund): NFR1 (Design-Anspruch) hat kein governing AD, wird aber von den Consistency Conventions (Styling, Pflicht-UI-Hinweise) getragen — auf Feature-Altitude vertretbar.

### 6. Ist jede Dimension entschieden, deferred oder als offene Frage benannt?

**Ja — keine stumme Dimension.** Der operative Umschlag ist explizit: Deployment & Environments (AD-8: ein Projekt, `vite build` → klassisches Firebase Hosting, manuell; CI ausdrücklich deferred), Infra/Provider (Firebase/GCP, Open-Meteo, Google Maps mit Key-Restriktionsregel), Betrieb (Tuning ohne Redeploy via Config-Dokument, Notweg Firebase-Konsole mit Rücktrag-Pflicht, Logging = `console` als bewusste Solo-Entscheidung), Fehlerbehandlung (Konventionen-Tabelle: typisierte Adapter-Fehler → Query-Error-States → sichtbarer Hinweis, Core wirft nie fachlich), Security (Rules `read: true/write: false`, Key im Bundle „öffentlich by design"), Testing (AD-2: Domain-Fixtures ja, UI/Adapter testfrei — entschieden, nicht vergessen), Persistenz-Topologie (Firestore lesend vs. `localStorage` für den Plan). Einzige Restlücke ist die schon unter R8(c) genannte Storage-Migrationsregel; dass der Plan **nur** in `localStorage` lebt (Verlust = Neu-Adoption des Solver-Vorschlags per AD-12-Erststart-Regel) ist implizit abgefedert und akzeptabel.

### 7. Sind die Diagramme valides Mermaid und tragen sie Struktur?

**Ja.** Alle vier Diagramme (Schichten-`graph TD`, `erDiagram`, Deployment-`graph LR`) sind syntaktisch valide (alle Labels mit Sonderzeichen/Klammern/Pipes konsequent gequotet; `subgraph`-Titel gequotet; Zylinder-Shape `[( )]` korrekt). Sie tragen Struktur statt Deko: das Schichtendiagramm kodiert die Abhängigkeitsrichtung (und der Text expliziert die Regel zusätzlich — gut, denn Diagramm allein wäre nicht normativ), das ER-Diagramm kodiert genau die Pivot-Entscheidungen (LEG first-class, VARIANT referenziert Leg-IDs, PLAN 12 Tage = 11 Stages + 1 Hafentag, SHELTER_PROFILE Pflicht mit beiden Sektorsätzen), das Deployment-Diagramm kodiert AD-1/AD-5/AD-3-Invarianten an den Kanten (read-only, eine Query-Familie, einziger Schreiber). Kein Befund.

---

## Befundliste (sortiert)

| # | Schweregrad | Kurztitel | Fundstelle |
|---|---|---|---|
| R1 | hoch | Deadline-Migration `returnDeadline` ↔ `disembarkDay`/`bufferDays` ungeregelt — Risiko zweier Machbarkeitsbegriffe | AD-8, AD-13 vs. `src/domain/ppr.ts`, `src/domain/schema/params.ts` |
| R2 | hoch | Rest-Trip-Ampel: Horizont-Fall mehrdeutig (gelb „hängt am Horizont" vs. Worst-Case-Bewertung; Horizont ohne Alternative undefiniert) | AD-3 vs. AD-13 |
| R3 | mittel | Off-Plan-Position: Re-Bewertung/Vorschlag bei Abweichung Ist-Position ↔ Plan unfixiert | AD-12, AD-3 |
| R4 | mittel | FR31-Fähren-**Datenform** deferred trotz hartem Solver-Constraint mit zwei Konsumenten | AD-4, AD-13, Deferred |
| R7 | mittel | Präambel: „Bestand hält AD-1 bis AD-11 ein" widerspricht den eigenen Rev-2-Amendments | Präambel vs. `src/app/tripContext.tsx`, `src/domain/schema/route.ts`, `src/domain/assess.ts` |
| R5 | niedrig | Hafentag-Verschiebung/-Pinbarkeit nicht als Prädikat formuliert | AD-12 |
| R6 | niedrig | Ablageort der Böen-Ausnahme (Config vs. Code) unbenannt | AD-6, AD-8 |
| R8 | niedrig | Redaktionelles: AD-9-Formulierung vs. Code-Ort von `deriveCurrentDay`; `geo.ts` fehlt im Seed; Storage-Versionierung/Migration unbenannt | AD-9, Structural Seed, AD-11 |

**Empfehlung:** R1 und R2 vor dem Story-Schnitt als kurze Amendments in AD-13 bzw. AD-3 einarbeiten (je 2–4 Sätze); R4 durch sofortige Schema-Normierung entschärfen; R3, R7, R8 im selben Edit miterledigen. Danach ist der Spine aus Rubric-Sicht freigabefähig.
