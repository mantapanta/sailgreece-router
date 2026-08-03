---
title: 'Adversarial Review (Blind Hunter) — Round-Trip-Umbau I: Domänen-Kern'
type: review
method: adversarial-general
created: '2026-08-03'
reviewed_artifact: 'Diff gegen baseline 1992f4f (2754 Zeilen), Branch feat/round-trip-umbau'
reviewed_against:
  - '_bmad-output/implementation-artifacts/spec-round-trip-umbau.md'
  - '_bmad-output/planning-artifacts/architecture/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md (AD-2, AD-3, AD-4, AD-6, AD-8, AD-9, AD-11, AD-12, AD-13)'
---

# Adversarial Review — Round-Trip-Umbau I (Domänen-Kern)

## Vorgehen

Vollständiger Diff gelesen, gegen Spec und Spine gehalten, danach die tragenden
Behauptungen **empirisch geprüft** (temporäre Probe-Tests gegen die echten Module,
danach entfernt). Ergebnisse der vom Umbau selbst geforderten Verifikation:

- `npx vitest run` → 111 Tests grün (10 Dateien). Vorher 83.
- `npx tsc --noEmit` → keine Fehler (auch nicht in `src/ui/` — siehe Befund 21).
- `grep -rE "Date\.now|fetch\(|from 'react'" src/domain/` → keine Treffer. Reinheit hält.
- `grep -rn trackedRouteId src/ seeding/` → keine Reste. Der Umbau ist sauber
  durchgezogen, keine Zombie-Felder.

Der Code ist ungewöhnlich gut kommentiert und die Kommentare argumentieren fachlich.
Genau das ist hier das Risiko: **an mehreren Stellen behauptet der Kommentar eine
Eigenschaft, die der Code darunter nicht hat.** Die grüne Testsuite deckt das nicht
auf, weil die Solver-Fixture so zugeschnitten ist, dass der zentrale Strukturfehler
nicht auftreten kann.

---

## Befunde

### 1. Der Meltemi-Worst-Case greift nicht dort, wo AD-13 ihn verlangt — nachgewiesen

`src/domain/scoring.ts:181-184`

```ts
const substituteWorstCase = (w: {...} | null) =>
  scenario === 'worstCase' && !w ? wc : w;
```

Der Worst Case ersetzt den Forecast **nur wenn `windAt` null liefert**, also wenn die
Stundenachse überhaupt keinen Wert mehr hat (in der Praxis jenseits von ~Tag 16).
AD-13 (2′) verlangt: „**Stunden jenseits des Horizonts** gegen das
Meltemi-Worst-Case-Szenario gerechnet" — Horizont = `reliableHorizonDays` (Default 7).
Auch der Early-Return in `scoring.ts:174-180` lässt `worstCase` einfach durch, statt
auf den Worst Case zu schalten.

Probe (`reliableHorizonDays: 2`, Etappentag 8, `scenario: 'worstCase'`):
`ampel: gruen`, `avgTws: 10`, **0 von 3 Stunden** gegen den Worst Case gerechnet.

Konsequenz: Der Rückkehr-Check und der Point of Return verlassen sich auf
8-bis-16-Tage-Forecastwerte und melden „Rückkehr darstellbar" — exakt die
Scheingenauigkeit, die AD-13 in seinem `Prevents` ausschließt, und exakt in der
Rechnung, die entscheidet, ob der Törn noch nach Hause kommt.

### 2. Der Worst Case ignoriert die Welle vollständig

`src/domain/scoring.ts:120-124`, `src/domain/schema/params.ts:100-108`

`worstCaseWind()` liest `twsKn`, `fromDeg`, `toDeg` — `waveM` wird nie gelesen. Ein
`grep -rn waveM src/` zeigt: `meltemiWorstCase.waveM` (2,0 m) ist **totes Config-Feld**;
`assessLeg` kennt überhaupt kein Wellenkriterium, und die Wellenlogik in `ampel.ts`
arbeitet nur mit Forecastwerten. Ein Hafen gilt damit als „meltemi-sicher", wenn die
Rückkehrkette bei 30 kn Wind **ohne jede Seegangsbetrachtung** fahrbar wäre. Der
Spine nennt „Welle 2,0 m aus N" ausdrücklich als Teil des Szenarios.

### 3. „Worst Case" ist die Sektormitte — und die ist nicht der Worst Case

`src/domain/scoring.ts:120-124`

```ts
return { twsKn, fromDeg: (fromDeg + span / 2) % 360 };  // 0..45 -> 22.5°
```

Der Kommentar nennt das „deterministisch by construction" — das ist es, aber
Determinismus war nicht die Anforderung, Konservativität war es. Bei Kurs 100° ergibt
22,5° eine TWA von 77,5° (zulässig), die Sektorkante 45° eine TWA von 55° (rot über
25 kn). Der Check lässt also Pläne als meltemi-sicher durch, die an der Sektorkante
durchfallen. Worst Case heißt: über den Sektor minimieren, nicht mitteln.

### 4. Jeder 12-Tage-Plan ist strukturell ungültig — die Tests verdecken es

`src/domain/solver.ts:269-276` (Hafentag-Zählung), `:478` (`maxWaitDays`), `:485`
(`planFromPacking(... frame.deadlineDay ...)`)

`planFromPacking` füllt **jeden** Tag von `startDay` bis `deadlineDay`; alle Tage nach
der letzten Etappe werden Hafentage. `maxWaitDays: harbourDays` (=1) begrenzt nur
Wartetage *zwischen* Etappen, nicht die Schlepptage danach. Bedingung (1b) verwirft
jeden Plan mit mehr als einem Hafentag.

Probe im 12-Tage-Rahmen (Deadline = Törntag 12, 4 Legs, 10 kn, alles grün):

```
days:      1:stage 2:stage 3:stage 4:stage 5..12:harbour
valid:     false
violations: [{"kind":"incomplete","text":"8 Hafentage im Plan — erlaubt ist 1 (PRD §4)"}]
```

Bei perfektem Wetter liefert der Solver einen **ungültigen** Plan; `existsValidPlan`
liefert `null`; die Rest-Trip-Ampel wird `rot` mit „Kein gültiger Round-Trip mehr
darstellbar". Der Test `solver.test.ts` schlägt das nicht, weil die Fixture
`tripLengthDays: 5` / Deadline Törntag 5 mit **genau 4 Legs** den Rahmen exakt füllt
(der Fixture-Kommentar sagt das sogar: „Four legs therefore need a five-day frame").

Zweiter Effekt derselben Ursache: Da nur der Kandidat gültig sein kann, dessen
Leg-Zahl den Rahmen exakt ausfüllt, kann der Solver **nie eine konservativere,
kürzere Runde als gültig anbieten** — die FR9-Eskalationsleiter ist strukturell
unerreichbar, und im Meltemi-Fall ist jede Rückzugsoption per Definition ungültig.
Das steht der Zielfunktion „Gültigkeit vor Präferenz" (AD-13) diametral entgegen.

Das Akzeptanzkriterium der Spec („genau 12 Törntage mit 11 Stages und exakt einem
Hafentag") ist damit **nicht erfüllt und nicht getestet**.

### 5. Vergangene Tage fallen aus dem Plan, die Etappennummern wandern täglich

`src/domain/solver.ts:449-460`, `src/domain/schema/plan.ts:121-125`

`completePlan` baut Tage ab `snapshot.trip.currentDay`. Jeder `EDIT_STAGE` oder
`CHECK_IN` ersetzt damit die Hauptroute durch einen Plan **ohne die bereits gesegelten
Tage**. Probe:

```
currentDay 1 -> days 1..12, erste Stage = Tag 1, stageNumber = 1
currentDay 5 -> days 5..12, erste Stage = Tag 5, stageNumber = 1
```

AD-12 fordert das Gegenteil: „vergangene Tage (Törntag < heute) sind implizit
fixiert", und `stageNumber` soll die Ordinalzahl 1–11 über den ganzen Törn sein, damit
Karte und Tagesansicht nie auseinanderlaufen. Nach dem ersten Edit an Tag 5 heißt die
Etappe nach Kea plötzlich wieder „Etappe 1". `fixedDays(plan, currentDay)` ist genau
für diesen Zweck geschrieben, getestet — und **wird nirgends aufgerufen** (`grep`:
nur Definition und Test). Der Invariant existiert als Funktion, nicht als Verhalten.

### 6. Die Gelb-Invariante ist gebrochen — im eigenen Testszenario

`src/domain/solver.ts:533-547`, `src/domain/assess.ts:262-270`

AD-13, wörtlich: „**Invariante:** Ist das Prädikat wahr, enthält die Alternativen-Menge
(FR29) mindestens einen gültigen Plan (den Existenzzeugen) — Gelb ist immer einlösbar."

`assessPlanning` übergibt als `excludeKey` den Schlüssel des **Vorschlags**
(`solved.variantId:solved.turnIslandId`), und `deriveAlternatives` wirft den Zeugen
raus, wenn sein Schlüssel gleich ist — was er regelmäßig ist, weil Vorschlag und
Zeuge beide aus `completePlan` kommen. Probe mit genau dem Plan aus dem grünen Test
`'is gelb when the main route breaks but a valid round trip still exists'`:

```
ampel: gelb   witness? true   witnessKey: sued-route:sued
alternatives count: 0
```

Gelb ohne eine einzige Alternative — nicht einlösbar. Der Test prüft
`restTripReasons.length > 0`, aber **nie `alternatives`**; das Spec-Akzeptanzkriterium
„die Alternativen-Menge enthält diesen Plan" ist unverifiziert und unerfüllt.
Nebenbei: der JSDoc-Kommentar an `excludeKey` sagt „Key of the main route" — der
Aufrufer übergibt den des Vorschlags. Kommentar und Aufruf widersprechen sich.

### 7. Bedingung (2′) prüft einen einzigen Tag — und überspringt Inseln ohne Heimweg

`src/domain/solver.ts:301-320`

AD-13: „Von **jedem** Plan-Tag aus ist die Rückkehr nach Alimos … fahrbar."
Implementiert ist ein `reduce`, der den Wendepunkt mit der **größten
Rückkehrdistanz** sucht und nur diesen prüft. Ein Tag mit ungünstigerem Fenster,
aber kürzerer Reststrecke wird nie geprüft.

Schlimmer: `dist` ist `-1`, wenn `remainingReturnLegs` `null` liefert, und
`accDist` startet ebenfalls bei `-1`; `dist > accDist` ist für `-1 > -1` falsch. Eine
Insel **ohne jeden Rückweg** kann deshalb nie als Wendepunkt gewählt werden — genau
die Insel, deren Unerreichbarkeit der Check finden müsste, wird übersprungen. Fehlende
Rückkehrdaten lesen sich damit als „geprüft und in Ordnung".

Dazu: O(n²) `remainingReturnLegs`-Aufrufe im `reduce`, jeder mit voller
Kettensuche über alle Routen.

### 8. Zwei Deadline-Semantiken, obwohl AD-9 genau eine fordert

`src/domain/time.ts:82-95`, `src/domain/ppr.ts:295`, `src/domain/solver.ts:283-299`

`deadlineFrame` liefert `deadlineDay = 12` und `porDeadlineDay = 11`. Bedingung (2)
prüft gegen `frame.deadlineDay` (12), `completePlan` packt bis Tag 12 — Bedingung (2′)
ruft `returnFeasibleStarting`, das intern `effectiveDeadlineDay` = **11** verwendet.
Der Puffertag wird also einmal vom Plan verbraucht und einmal als Reserve verlangt.

Verschärft: (2′) prüft nicht den **tatsächlichen** Rückweg des Plans, sondern ob
*irgendein* Rückweg vom Wendepunkt bis Tag 11 packbar wäre. Ein Plan, der seine
Rückkehr real auf Tag 12 legt, kann (2′) bestehen, obwohl seine eigene Terminierung
die Reserve schon aufgebraucht hat — und ein Plan, der real in Ordnung ist, kann an
(2′) scheitern. Die Bedingung ist vom Plan entkoppelt. AD-9 nennt genau das als
`Prevents`: „Solver und PoR zählen Resttage verschieden."

### 9. Die Relaxationsleiter kann an der Gültigkeit nichts ändern

`src/domain/solver.ts:60-77` gegen `src/domain/scoring.ts:34-61`

`relaxParams('hardMax')` hebt `targetDayHours` und `targetMotorHours`.
`budgetVerdict` benutzt diese beiden Felder aber **nur für die Grenze grün/gelb**;
`rot` entsteht ausschließlich über `maxSailHours`/`maxMotorHours` — die bleiben
unangetastet. Und `packLegs` verwirft nur `rot`, `validatePlan` zählt nur `rot`.
Stufe `hardMax` ist damit ein **No-Op**: sie kann keinen ungültigen Plan gültig
machen und keine DP-Entscheidung ändern. Damit ist von der im Spine normierten
Leiter „Ziel-Budget → hartes Maximum → Nachtetappe" faktisch nur die dritte Stufe
wirksam. Der Test prüft ausschließlich, dass die Leiter die *verbotenen* Dinge nicht
relaxiert — nie, dass sie überhaupt etwas relaxiert.

### 10. Nachtetappen: drei Parameter, kein Regelwerk — und ein Begriffs-Kurzschluss

`src/domain/schema/params.ts:113-119`, `src/domain/solver.ts:68-76`

`nightLegMaxPerTrip` (max 2) und `nightLegEarliestDay` (nur zweite Woche) werden
**nirgends gelesen** (`grep`: nur die Schema-Definition). Von AD-13s Nachtetappen-Regeln
(Wind < 10 kn über die *gesamte* Etappe, max 2, nur zweite Woche, Folgetag aufs
Ziel-Budget begrenzt) ist keine implementiert.

Die einzige Wirkung der Stufe `nightLeg` ist
`lightWindMaxTwsKn = max(lightWindMaxTwsKn, nightLegMaxTwsKn)`. Das ist eine
Verwechslung zweier Begriffe: `lightWindMaxTwsKn` steuert die
**Leichtwind-Ausnahme im Tagesbudget** *und* (im Polar-Fallback,
`scoring.ts:293`) die **Motor-Entscheidung**. Die Stufe „Nachtetappe erlauben"
verändert also stillschweigend, wann die App Motorfahrt annimmt — eine
Dauer-Rechnung, die mit Nachtetappen nichts zu tun hat.

### 11. Der Pin-Constraint blockiert Doppel-Etappen-Tage — FR28 fällt still aus

`src/domain/ppr.ts:128` und `:155`

```ts
if (a.ampel !== 'rot' && ok(day, legs[legIdx]!.toIslandId)) {   // gilt für BEIDE Züge
```

Der Gate prüft die **Zwischeninsel** und umschließt auch den Zwei-Etappen-Zweig. Ein
Pin auf eine Insel, die nur über zwei kurze Legs an einem Tag erreichbar ist, macht
den Tag damit unpackbar. Probe (Pin Tag 1 → `sued`, erreichbar über
`athen→mitte→sued`):

```
completePlan(...) === null   // Pin unerfüllbar
```

`usePlanning.editStage` gibt dann `false` zurück — ohne benannte Bedingung, ohne
Violation, ohne Grund für den Skipper. Genau die „stumme" Reaktion, die AD-13 und die
Fehler-Konvention des Spine ausschließen („der Core wirft nie … Rot, `unbewertet` …
sind Ergebnisse"). Derselbe Gate trifft den FR31-Pickup-Tag.

Zusatz: beide Zusatzzüge (zwei Legs, Wartetag) sind mit
`if (best.verdict !== 'feasible')` bewacht. Sobald der Ein-Leg-Pfad machbar ist, wird
der Doppeltag nie mehr probiert — der in `better()` dokumentierte Tie-Break „auf
Gleichstand den früheren Abschluss bevorzugen" ist im Regelfall unerreichbar. Der DP
optimiert nicht, was sein Kommentar behauptet.

### 12. Der Pickup-Ankunftscheck rechnet auf einem anderen Pfad als der Rest

`src/domain/solver.ts:341-354`

```ts
let arrival = params.departureHourAthens;
for (const legId of legIds) { const a = assessLeg(leg, pickupDay, snapshot); arrival += a.totalHours ?? 0; }
```

Drei Probleme in vier Zeilen: (a) kein `departureOffsetHours` — die zweite Etappe
eines Doppeltags wird gegen den **Morgenwind** simuliert, während `packLegs`,
`assessPlan` und `validatePlan` (1) genau dafür den Offset übergeben; die
FR31-Ankunftszeit entsteht damit auf einem zweiten, abweichenden Rechenpfad (AD-3:
„genau **ein** Rechenpfad"). (b) `departureHourOverride` wird ignoriert, obwohl
`assessLeg` es für den heutigen Tag berücksichtigt. (c) Stundenarithmetik ohne
Tagesübergang.

Ebenfalls nicht implementiert: AD-13 (3) erlaubt den Pickup auch, wenn die
Anreise-Stage **im `nightWindow` des 14.8.** dort endet. Geprüft wird nur, wo das Boot
am **Ende** des Pickup-Tags liegt — ein Plan, der den Pickup-Hafen am Morgen des
15.8. verlässt und abends an einer anderen Fährinsel liegt, gilt als erfüllt.

### 13. Fehlende Position wird als härteste Sicherheitsaussage gerendert

`src/domain/assess.ts:38-52` (Bestand) mit `:245-292` (neu)

Ohne Positionsfix ab Törntag 2 ist `currentIslandId === null`. Dann sind `solved`,
`proposal` und `witness` alle `null`, und der `else`-Zweig setzt
`restTripAmpel = 'rot'` mit „Kein gültiger Round-Trip mehr darstellbar". Eine
**Datenlücke** (GPS verweigert, Handy im Flugmodus) erzeugt damit dieselbe Anzeige wie
„der Meltemi hat jeden Heimweg verbaut". Die Ampel-Konvention des Spine sieht dafür
`unbewertet` (grau) vor; `rot` ist die Aussage über das Existenzprädikat, nicht über
die Datenlage. Am Abend vor einer Rückkehrentscheidung ist das eine
sicherheitsrelevante Fehlmeldung in beide Richtungen (Panik statt Prüfung — und
umgekehrt Abstumpfung gegen Rot).

### 14. Die Hauptroute wird mit den Metadaten eines fremden Plans beschriftet

`src/domain/assess.ts:252-259`

```ts
variantId: solved?.variantId ?? 'hauptroute',
turnIslandId: solved?.turnIslandId ?? (currentIslandId ?? ''),
relaxedTo: 'none',
```

`solved` ist der **Vorschlag**. Variante und Wendepunkt, die die UI zur Hauptroute
anzeigt, kommen also aus einem anderen Plan; `relaxedTo` ist fest `'none'`, auch wenn
die Hauptroute nur mit Lockerung darstellbar wäre. Bei fehlender Position wird
`turnIslandId` der Leerstring. Das ist keine Anzeigekosmetik: Wendepunkt und
Eskalationsstufe sind die Größen, an denen der Skipper „wie weit nach Süden" entscheidet.

### 15. Existenzprädikat und Alternativen sind zusätzliche Solver-Läufe, kein Nebenprodukt

`src/domain/solver.ts:518-521`, `src/domain/assess.ts:245-270`

AD-13: „Der Existenz-Check ist **Nebenprodukt desselben DP-Laufs** — keine zweite
Machbarkeitsrechnung." Tatsächlich ruft `assessPlanning` pro Refresh:
`completePlan` (mit Pins) → `existsValidPlan` (= `completePlan` ohne Pins) →
`deriveAlternatives` (voller Kandidaten-Sweep). Jeder Lauf iteriert alle Kandidaten ×
3 Relaxationsstufen und ruft `validatePlan`, das seinerseits `assessLeg` über jedes Leg
laufen lässt — und `assessPlan` in `assess.ts` rechnet dieselben Legs danach ein
**viertes** Mal für die Anzeige. Auf dem Handy im Hafen-WLAN ist das die Rechenlast, die
NFR2 ausschließen soll; architektonisch ist es der von AD-3 verbotene „dritte,
informelle Solver-Aufrufpfad".

### 16. `score()` heißt nach Distanz, zählt aber Segeltage — und „am wenigsten verletzend" stimmt nicht

`src/domain/solver.ts:460-465`

```ts
const dist = r.plan.days.reduce((s, d) => s + (d.kind === 'stage' ? 1 : 0), 0);
return (r.validity.valid ? 1000 : 0) - r.validity.violations.length * 10 + dist;
```

`dist` ist die **Anzahl Etappentage**, nicht die Distanz — der Kommentar behauptet
„more distance covered ranks higher". Die in AD-13 geforderte weiche Süd-Präferenz
(Santorin/Amorgos) existiert damit überhaupt nicht; belohnt wird „viele Tage segeln".
Und weil 10 Etappentage eine Verletzung aufwiegen, ist `leastViolating` nicht
notwendigerweise der am wenigsten verletzende Plan — genau das verlangt aber Spec und
AD-13 im Meltemi-Fall. Zudem sind alle Verletzungen gleich schwer: eine `return`-
Verletzung (kein Heimweg) wiegt so viel wie eine `pickup`-Verletzung (Gäste stehen am
Kai). Bei einer sicherheitsrelevanten Auswahl darf das nicht gleich gewichtet sein.

### 17. Alternativen: alphabetisch sortiert, als Eskalationsleiter deklariert

`src/domain/solver.ts:578-580`

```ts
// Conservative first, so the escalation ladder reads naturally (FR9).
return out.sort((a, b) => a.turnIslandId.localeCompare(b.turnIslandId));
```

Sortiert wird nach **Insel-ID-Alphabet**. „Amorgos" landet vor „Kea", obwohl es die
ambitionierteste Option ist. `escalationRank` liegt am Kandidaten vor und wird nicht
benutzt. AD-13s Anforderung („mindestens eine konservativere Eskalationsstufe und —
falls offen — eine ambitioniertere Süd-Option") ist nicht implementiert: es wird
genommen, was `buildCandidates` zufällig zuerst liefert, bis `alternativesMax` voll ist.

### 18. Ein einziges korruptes Fremdfeld verwirft einen lesbaren Plan — still

`src/app/tripContext.tsx:158-182`

Der neue Zwei-Stufen-Parse ist gut gedacht, aber asymmetrisch: schlägt `position` oder
`departureHourOverride` fehl, scheitert auch `TripStateSchema.omit({ plan: true })`,
und die Funktion fällt auf `INITIAL` zurück — der **fehlerfrei persistierte Plan mit
allen Pins ist weg**, mit einer `console.warn`, die niemand auf See liest. AD-12
verbietet genau das („ein Schema-Redeploy auf See, der alle Pins stumm verwirft"). Die
Felder müssten einzeln geparst werden, oder der Plan zuerst und separat.
(Nebenbei: `JSON.parse(raw)` läuft zweimal.)

### 19. `DISCARD_UNREADABLE` + Adoptions-Effekt umgehen die verlangte Bestätigung

`src/app/tripContext.tsx:127-128`, `src/app/usePlanning.ts:98-104`

AD-12: „Ein unparsebarer persistierter Plan … die Adoption des Solver-Vorschlags
erfordert dann eine **explizite Bestätigung (Check-in-Semantik)**."
`DISCARD_UNREADABLE` setzt `planUnreadable: false, plan: null` — womit der
Guard in `ADOPT_INITIAL` (`if (state.plan || state.planUnreadable) return state`)
nicht mehr greift und der `useEffect` im nächsten Render **automatisch** adoptiert.
Die geforderte Bestätigung ist damit auf „Discard-Klick" reduziert; der explizite
Check-in-Pfad (`CHECK_IN`) wird nicht durchlaufen, und der Skipper sieht nicht, was
adoptiert wurde, bevor es Hauptroute ist.

### 20. `RELEASE_PIN` löst den Pin, aber niemand plant den Tag neu

`src/app/tripContext.tsx:112-124`, `src/app/usePlanning.ts:141-144`

Der Kommentar sagt „Release a pin so the solver may plan that day again". Da
Neuberechnungen die Hauptroute nach AD-12 korrekt **nie** mutieren und `releasePin`
nur `source` umschreibt, behält der Tag sein altes Ziel unbegrenzt — nur eben ohne
Pin-Kennzeichnung. Das Ergebnis ist der schlechteste von beiden Zuständen: das Ziel
bleibt, die Sichtbarkeit als bewusste Skipper-Entscheidung geht verloren. Entweder muss
`releasePin` (wie `editStage`) synchron neu vervollständigen und den fertigen Plan als
Payload schicken, oder der Kommentar muss die Wahrheit sagen.

### 21. Scope-Verletzung: `src/ui/` wurde angefasst, obwohl die Spec es unter „Never" führt

`src/ui/styles.css:447-470`, `src/ui/views/MapView.tsx:88-95`

Die Spec, im `frozen-after-approval`-Block: „**Never:** Keine UI-Dateien in diesem
Durchlauf (`src/ui/`)". Der Diff enthält beides. Der `MapView`-Eingriff ist wenigstens
erklärbar (`trackedRouteId` verschwindet, sonst bricht der Typecheck) — er sollte dann
aber als bewusste Ausnahme in der Spec/`deferred-work.md` stehen, nicht als
Kommentar im Code; nebenbei verschleiert er, dass die Verification-Erwartung der Spec
(„Fehler in `src/ui/` sind in diesem Durchlauf erwartet und dokumentiert") nicht mehr
zutrifft. Die `styles.css`-Änderung (Windpfeil von 1,05 rem auf 1,9 rem, Rahmen um das
kn-Label) hat mit dem Round-Trip-Umbau **nichts** zu tun — reiner Scope-Creep, der
in einem Domänen-Kern-Commit nicht auffindbar ist, wenn man ihn später sucht.

### 22. `VariantSchema` ist toter Code — die First-Class-Legs sind nicht angekommen

`src/domain/schema/route.ts:56-79`

`VariantSchema`/`Variant` werden nirgends importiert (`grep`: nur Definition). Der
Solver läuft weiter über `snapshot.library.routes[].legs` und dedupliziert die
vierfach kopierten Legs zur Laufzeit in `legLibrary()`. Das ist als Übergang
dokumentiert und legitim — aber dann ist das Schema eine unbenutzte Attrappe, die beim
nächsten Leser den Eindruck erzeugt, die Umstellung sei erfolgt. Gleiches Muster:
`unassessableStages` (`solver.ts:584`) und `islandAtEndOfDay` werden außerhalb der
Tests nie aufgerufen.

### 23. Zwei normative Schema-Namen weichen vom Spine ab, ohne dass der Spine amendiert wurde

`src/domain/schema/island.ts:11-21`, `src/domain/schema/plan.ts:53-57`

AD-4 fixiert normativ `pickup15Aug?: { ferryReachable, sourceNote }` — implementiert
ist `guestPickup`. AD-4/AD-12 fixieren `PlanDay`-Stage als `{ day, legId, … }`
(Singular) — implementiert ist `legIds: string[]`. Beide Abweichungen sind fachlich
**besser** begründet als der Spine (Doppel-Etappen-Tage gibt es wirklich; ein
Datumsfeld statt „15Aug" im Namen ist richtig). Aber der Spine ist laut Spec bindend
(„Bei Konflikt gewinnt der Spine"), und `seeding/` ist der zweite Konsument desselben
Schemas. Solange AD-4 nicht nachgezogen ist, wird das Seeding gegen die alten Namen
gebaut. Die Spec hat für genau diesen Fall eine „Ask First"-Klausel zum Leg/Variant-
Schema — sie wurde nicht gezogen.

### 24. `tripLengthDays` und `returnDeadlineDate` sind wieder zwei Quellen für denselben Rahmen

`src/domain/schema/params.ts:65, 71-77, 172-195`

AD-8 nennt als `Prevents` ausdrücklich „zwei Quellen für die Rückkehr-Deadline". Der
Umbau ersetzt `disembarkDay` durch `returnDeadlineDate` — behält aber
`tripLengthDays` (Default 12), aus dem `deriveCurrentDay` den Törntag klemmt. Die
beiden entfernten Cross-Checks (`disembarkDay > tripLengthDays`) wurden **nicht**
ersetzt: nichts verhindert, dass `returnDeadlineDate` hinter `tripLengthDays` liegt
und der Solver bis Tag 15 plant, während der Törntag bei 12 klemmt. Wenn
`tripLengthDays` gebraucht wird, muss es aus `tripStartDate`/`returnDeadlineDate`
abgeleitet werden; wenn nicht, muss es weg.

### 25. `LegHourBreakdown.timeIso` kann ein Nicht-ISO-String sein

`src/domain/scoring.ts:228-233, 310`

Im `worstCase`-Zweig läuft die Schleife jetzt bewusst über das Ende der Stundenachse
hinaus. Dort ist `snapshot.times[idx]` `undefined`, und der Breakdown schreibt den
Fallback `` `+${h}h` `` in ein Feld, das im Interface als „UTC hour this step was
simulated in" typisiert ist. Jede UI, die das als Datum formatiert (FR30 ist genau
dafür gedacht), zeigt dort Müll oder wirft. Entweder `timeIso: string | null` mit
einem separaten Offset-Feld — oder der Breakdown endet an der Achse.

### 26. Testlücken an den Stellen, die der Umbau neu eingeführt hat

- **Kein einziger Test für `tripContext`.** Fünf neue Aktionen (`ADOPT_INITIAL`,
  `CHECK_IN`, `EDIT_STAGE`, `RELEASE_PIN`, `DISCARD_UNREADABLE`), die
  `releaseAllPins`-Semantik, der Guard gegen doppelte Adoption und der ganze
  `planUnreadable`-Ladepfad sind unverifiziert (`ls src/app/__tests__` existiert
  nicht). AD-2 nimmt UI und Adapter von der Testpflicht aus — `app/tripContext` ist
  aber die von AD-11/AD-12 normierte Zustandsmaschine, keine View.
- **Der Gelb-Fall wird mit der falschen Ursache getestet.** Die Spec verlangt
  „Hauptroute, die eine **FR16-Schwelle** verletzt"; getestet wird ein Plan, der nur
  gegen die Hafentag-Struktur verstößt (`solver.test.ts`, `lazy`-Plan). Die
  eigentliche Zielsituation — rote Etappe bei existierender Alternative — ist nicht
  abgedeckt.
- **Kein Test der Pin-Stabilität.** Geprüft wird, dass ein Pin respektiert wird, nicht
  das Akzeptanzkriterium „**nur** ungepinnte Tage ändern sich" (zwei Läufe vergleichen).
- **Der Default-Horizont wird nie ausgeführt.** `options.test.ts` musste auf
  `reliableHorizonDays: 14` hochgesetzt werden, die Solver-Fixture nutzt ebenfalls 14.
  Mit dem Default 7 und einem 12-Tage-Törn sind die Etappen ab Tag 9 immer
  `unbewertet` → `horizonDependent` → die Rest-Trip-Ampel kann in der **ganzen ersten
  Woche nie `gruen`** werden. Das ist eine bewusste AD-13-Folge, aber sie ist nirgends
  getestet und niemand hat entschieden, ob der Skipper eine Woche Dauergelb akzeptiert.

### 27. Kleinere Beobachtungen

- `assessPlan` (`assess.ts:78-140`) und `validatePlan` (`solver.ts:238-267`) rechnen
  dieselben Legs mit derselben Offset-Logik doppelt; die Offset-Akkumulation ist
  zweimal ausgeschrieben und kann auseinanderlaufen.
- `stageNumber` ruft `stagesOf` (filter + sort) pro Aufruf; `assessPlan` ruft es pro
  Tag → O(n² log n) für eine Nummerierung.
- `const { planUnreadable: _drop, ...persistable } = state` (`tripContext.tsx:213`)
  hängt an einer stummen Konvention; sobald ein weiteres Laufzeitfeld dazukommt,
  landet es in `localStorage` und bricht `TripStateSchema`. Ein explizit getippter
  `PersistedTripState` wäre die Absicherung.
- `buildCandidates` nutzt `seq.indexOf(startIslandId)` — bei einer Variante, die eine
  Insel zweimal berührt, wird stumm das erste Vorkommen genommen.
- `CHECK_IN` → `releaseAllPins` setzt **alle** Tage auf `source: 'solver'`, auch
  bereits gesegelte. Sobald Befund 5 behoben ist (Vergangenheit bleibt im Plan), löscht
  ein Check-in die Provenienz der tatsächlich gefahrenen Etappen.

---

## Gesamtbild

Der Umbau ist handwerklich sauber gebaut, vollständig pur, typfehlerfrei und lässt
keine Reste des alten Modells zurück. Die tragende Architekturentscheidung — Plan als
persistierte Entität, ein Mutationspfad, Solver als Erweiterung des vorhandenen DP —
ist richtig umgesetzt und im Reducer sichtbar durchgehalten.

Was fehlt, ist die Verbindung zwischen den Kommentaren und dem Verhalten. Vier der
sicherheitsrelevantesten Zusagen des Spine sind im Code **behauptet, aber nicht
wirksam**: der Worst-Case-Rückkehr-Check (1, 2, 3), die Gültigkeit eines
12-Tage-Plans (4), die Einlösbarkeit von Gelb (6) und die Vollständigkeit von
Bedingung (2′) (7). Alle vier sind mit den vorliegenden Fixtures unsichtbar, weil die
Solver-Fixture einen 5-Tage-Rahmen mit exakt passender Leg-Zahl verwendet und den
Horizont auf 14 setzt — also genau die zwei Parameter neutralisiert, an denen die
Fehler hängen.

Empfohlene Reihenfolge zur Behebung: erst 4 und 5 (Plan-Rahmen und Vergangenheit,
sonst ist jede weitere Messung am falschen Objekt), dann 1–3 und 7–8 (der
Rückkehr-Check als das sicherheitskritische Herz), dann 6 (Gelb einlösbar), dann die
Testfixture auf den echten 12-Tage-Rahmen mit Default-Horizont 7 umstellen — sie ist
derzeit der Grund, warum der Umbau grün aussieht.
