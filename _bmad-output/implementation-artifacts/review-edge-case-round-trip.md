---
title: 'Edge-Case-Hunter Review — Round-Trip-Umbau I (Domänen-Kern)'
type: 'review'
method: 'edge-case-hunter (Pfad-Enumeration, keine Bewertung von Codequalität)'
created: '2026-08-03'
reviewed_diff: 'round-trip-diff.txt (2754 Z.)'
spec: '_bmad-output/implementation-artifacts/spec-round-trip-umbau.md'
baseline_commit: '1992f4f8fd47c5b2888ddc1347f9e5fed50671d9'
---

## Methode

Reine Pfad-Enumeration über die geänderten Hunks und die zwei neuen Dateien
(`src/domain/schema/plan.ts`, `src/domain/solver.ts`). Gemeldet werden
ausschließlich **erreichbare Pfade und Grenzwerte ohne explizite Behandlung** —
behandelte Fälle werden stillschweigend verworfen. Keine Severity-Ränge, keine
Aussage über Codequalität.

Sechs Befunde sind mit Wegwerf-Vitest-Fällen gegen den Branch reproduziert
(Repro-IDs A–L, Zeilenangaben auf den Dateien im Arbeitsverzeichnis, nicht auf
Diff-Zeilen).

---

## 1. Sicherheitsrelevante Pfade

### 1.1 Unlesbarer Plan wird beim ersten Render aus `localStorage` gelöscht
`src/app/tripContext.tsx:210-218` (Persist-Effect) gegen `:176` (`planUnreadable`)

`loadPersisted` liefert bei einem unparsebaren Plan `{plan: null,
planUnreadable: true}`. Der Persist-`useEffect` hat `[state]` als Dependency und
läuft **auch beim Mount** — er schreibt sofort `plan: null` über den rohen
gespeicherten Plan. Der unlesbare Plan (und mit ihm jeder Pin) ist damit
physisch weg, bevor der Skipper ihn sehen kann. Da `planUnreadable` bewusst
nicht persistiert wird (`:213`), ist beim nächsten Reload `plan: null,
planUnreadable: false` → `ADOPT_INITIAL` (`usePlanning.ts:100-104`) adoptiert
stumm einen frischen Plan. Das ist genau der von AD-12 verbotene stille Reset,
nur um einen Reload verzögert.

Verschärfend: `DISCARD_UNREADABLE` (`tripContext.tsx:127`) wird nirgends
dispatcht (grep über `src/`), d. h. der benannte Zustand hat außer `RESET`
keinen Ausgang.

Guard: vor dem ersten Schreiben abbrechen, solange `planUnreadable` gilt, oder
den Rohstring unter einem Quarantäne-Key sichern
(`if (state.planUnreadable) return;` im Effect).

### 1.2 Pin auf einen vergangenen Tag ⇒ `completePlan` liefert `null` (Repro C)
`src/domain/solver.ts:484-488`, `:508`; Aufrufer `src/app/usePlanning.ts:126-139`

`planFromPacking` erzeugt nur Tage `startDay = trip.currentDay … deadlineDay`
(`solver.ts:197`). `candidateHonoursPins` (`:416-418`) verlangt für **jeden** Pin
einen Eintrag im Plan und gibt sonst `false` zurück — ein Pin auf `day <
currentDay` disqualifiziert damit *alle* Kandidaten, `leastViolating` bleibt
`null`, `completePlan` gibt `null` zurück.

Der Pfad ist im Normalbetrieb garantiert erreichbar: der Plan wird beim
Tageswechsel nicht neu gebaut, also ist **jeder Pin am nächsten Morgen ein
Pin auf einen vergangenen Tag**. Folge in `assess.ts:245-250`: `proposal =
null` → kein Vorschlag, kein `ADOPT_INITIAL`, `editStage` gibt `false` ohne
Begründung zurück. Die Spec-Zeile „Kein gültiger Plan → am wenigsten
verletzender Plan + benannte Bedingung, kein Throw" ist hier durch ein stilles
`null` unterlaufen.

Guard: Pins mit `day < snapshot.trip.currentDay` beim Eintritt in
`completePlan` verwerfen (sie sind per AD-12 implizit fixiert, nicht
constraint-relevant), oder `candidateHonoursPins` auf `pins.filter(p => p.day >= startDay)` einschränken.

### 1.3 Etappe jenseits des Horizonts macht die Pickup-Bedingung *gültig* (Repro I)
`src/domain/solver.ts:343-350`

```ts
let arrival = params.departureHourAthens;
for (const legId of legIds) { … arrival += a.totalHours ?? 0; }
if (arrival > params.pickupLatestArrivalHourAthens) { … }
```

Liegt der Zustiegstag jenseits `reliableHorizonDays`, ist `a.ampel ===
'unbewertet'` und `a.totalHours === null` → `arrival` bleibt bei 9 → die
Fähren-Grenze wird stumm passiert. Damit macht eine unbewertbare Etappe die
harte FR31-Bedingung **gültig**, obwohl die Spec „zählt nie für/gegen
Gültigkeit" fordert. Zweiter, unabhängiger Pfad: eine tote Leg-Referenz
(`continue` in `:346`) wird ebenfalls als 0 h gerechnet.

Guard: `if (a.totalHours === null) { horizonDependent = true; arrivalKnown = false; break; }` und die Grenze nur bei `arrivalKnown` prüfen.

### 1.4 Rückkehr-Check rechnet jenseits des verlässlichen Horizonts mit dem rohen Forecast
`src/domain/scoring.ts:174-184`

```ts
const beyondHorizon = day - snapshot.trip.currentDay > params.reliableHorizonDays;
if (beyondHorizon && scenario === 'forecast') return unbewertet(…);
const substituteWorstCase = (w) => scenario === 'worstCase' && !w ? wc : w;
```

Die Worst-Case-Substitution hängt an der **Abwesenheit von Forecast-Werten**,
nicht am verlässlichen Horizont. Für Tage zwischen `reliableHorizonDays` (7) und
dem Ende der Open-Meteo-Achse (10–16 d) liefert `windAt` gültige Werte, also
rechnet Bedingung (2′) mit genau dem Forecast, den AD-13 dort für
Scheingenauigkeit erklärt („Stunden jenseits des Horizonts gegen das
Meltemi-Worst-Case-Szenario"). Ein 6-kn-Rauschen am Tag 9 kann so eine
Rückkehr als fahrbar ausweisen.

Guard: `const useWc = scenario === 'worstCase' && (beyondHorizon || !w);`

### 1.5 Doppel-Etappen-Tage können Pins und den Pickup nie erfüllen (Repro J, K, L)
`src/domain/ppr.ts:128` (Gate) und `:140-156` (Doppel-Etappen-Zweig)

Der Doppel-Etappen-Zweig liegt **innerhalb** von
`if (a.ampel !== 'rot' && ok(day, legs[legIdx]!.toIslandId))`. Die
Tages-Bedingung `ok(day, …)` beschreibt aber das Insel-Ziel am **Tagesende** —
bei zwei Etappen ist das `legs[legIdx+1].toIslandId`. Ein Pin oder der Pickup,
der nur über einen Doppelschlag erreichbar ist, blockiert also bereits den
Eintritt in den Zweig, der ihn erfüllen würde.

Reproduziert:
- **J** — Pin „Tag 1 → Insel c" (zwei 6-sm-Legs, bequem an einem Tag):
  `completePlan` ⇒ `null`.
- **K** — Pickup an Tag 1, nur `c` fähre-erreichbar: der Solver liefert
  „4 Tage im Hafen bleiben" mit `pickup`-Violation, obwohl ein gültiger
  Doppelschlag-Plan existiert. Eine harte Bedingung wird als verletzt
  gemeldet, weil der Suchraum sie nicht erreicht.
- **L** — `packLegs` direkt mit `dayConstraint: day !== 1 || isl === 'c'`
  ⇒ `infeasible`, `packed: []`.

Guard: Die Prüfung des Ein-Etappen-Ziels aus dem Gate herausziehen und je Zug
separat testen (`okOneLeg` vs. `okTwoLegs`).

### 1.6 `meltemiWorstCase.waveM` wird nie gerechnet
`src/domain/schema/params.ts:95-102` gegen `src/domain/scoring.ts:120-124`

`worstCaseWind` liefert nur `{twsKn, fromDeg}`; `assessLeg` kennt überhaupt
keinen Wellen-Eingang. Die von AD-13 normierten 2,0 m Welle aus N gehen in
Bedingung (2′) nicht ein — der „Worst Case" ist ein reiner Windfall. Die
Config suggeriert eine Kalibrierbarkeit, die es nicht gibt.

### 1.7 Worst-Case-Sektor: nur die Mitte, kein Guard gegen Vollkreis/Vertauschung
`src/domain/scoring.ts:120-124`; fehlender Cross-Field-Check
`src/domain/schema/params.ts:181-195`

```ts
const span = (toDeg - fromDeg + 360) % 360;
return { twsKn, fromDeg: (fromDeg + span / 2) % 360 };
```

Der Wrap über 0° ist korrekt (`350°/10° → 0°`). Ungeschützt bleiben:
- `fromDeg: 0, toDeg: 360` (Schema erlaubt bis 360) ⇒ `span = 0` ⇒ die
  Sektormitte kollabiert auf **0°**; „Wind aus allen Richtungen" wird zu
  „Wind aus Nord".
- Vertauschte Felder `fromDeg: 45, toDeg: 0` ⇒ `span = 315` ⇒ Mitte
  **202,5° (SSW)** — der Worst Case wird für die Nord-Rückkehr zu Vorwind,
  also *harmlos*. Kein Check fängt das; `twsKn > maxUpwindTwsKn` (`:187`)
  prüft nur die Stärke.
- Grundsätzlich: getestet wird ausschließlich die Sektormitte. Eine Richtung
  **innerhalb** des Sektors, die auf einem Rückkehr-Leg genau gegenan steht,
  wird nie simuliert. Für 0–45° und eine Westkette ist das meist unkritisch,
  bei jeder Sektor-Verbreiterung nicht mehr.

### 1.8 `nightLeg`-Relaxation: mit Polare ein No-Op, ohne jede Begrenzung (Repro F)
`src/domain/solver.ts:68-77`; `nightLegMaxPerTrip` / `nightLegEarliestDay`
(`params.ts:117,119`) werden nirgends gelesen (grep über `src/`)

Stufe 3 der Leiter hebt nur `lightWindMaxTwsKn` (6 → 10). Dieser Parameter
steuert ausschließlich den Fallback-Speed-Pfad (`scoring.ts:292-294`); sobald
eine Polare vorliegt (`:283-290`), ist er wirkungslos. `targetDayHours` und
`targetMotorHours` sind mit Stufe `hardMax` identisch ⇒ **Stufe 3 == Stufe 2**,
die Leiter hat effektiv zwei Sprossen.

Gleichzeitig sind die FR16-Nachtetappen-Bedingungen unimplementiert: kein
`< 10 kn über die GESAMTE Etappendauer`, kein `max. 2 pro Törn`, kein
`nur zweite Woche`, keine Kennzeichnung, welcher Tag eine Nachtetappe ist.

### 1.9 `assessLeg` verweigert den Start jenseits der Achse auch im Worst Case
`src/domain/scoring.ts:211`

`if (startIdx === null) return unbewertet('Abfahrtszeit außerhalb der
Forecast-Achse')` gilt szenariounabhängig. Für Rückkehr-Etappen, deren
Abfahrtstag hinter dem Ende der Stundenachse liegt, kann der Worst Case gar
nicht antreten: `packLegs` behandelt `unbewertet` als zulässig-unbestätigt
(`ppr.ts:132`) ⇒ Verdict `horizon` ⇒ `validatePlan` setzt nur
`horizonDependent = true` (`solver.ts:320-322`), nie eine `return`-Violation.
Der Worst-Case-Fallback greift also genau in den Fernbereichen nicht, für die
er eingeführt wurde. Die Achsenlänge selbst wird im Schleifenkörper bereits
worst-case-tauglich behandelt (`:228-233`) — nur der Einstieg nicht.

---

## 2. Plan-Integrität und Struktur

### 2.1 `currentDay > deadlineDay` ⇒ Plan mit `days: []` (Repro A)
`src/domain/solver.ts:197` (`for (let day = startDay; day <= deadlineDay; …)`),
`:279` (`Math.max(...plan.days.map(…))`), `:485`; Schema `plan.ts:67`

Der Kandidat „(bleiben)" hat `legs.length === 0` und wird von
`if (packing.packed.length === 0 && candidate.legs.length > 0) continue`
(`:482`) nicht gefiltert. `planFromPacking` läuft nullmal ⇒ `days: []`.
Folgen: `Math.max(...[])` = `-Infinity`, `lastDay` unbrauchbar, Violation-Text
„Plan endet nicht an der Basis …, sondern bei **unbekannt**" mit `day: null`.
`PlanSchema` verlangt `.min(1)` (`plan.ts:67`) — der Plan wird aber über
`ADOPT_INITIAL`/`EDIT_STAGE` in den State und in `localStorage` geschrieben und
kommt beim nächsten Reload als `planUnreadable` zurück (siehe 1.1).

Erreichbar über den Day-Override, über `returnDeadlineDate < tripLengthDays`
und über jeden Törn, dessen Deadline vor dem letzten Törntag liegt. Der
gelöschte Cross-Field-Check `disembarkDay > tripLengthDays` (siehe 4.1) war das
einzige Gegenstück.

### 2.2 `currentDay == deadlineDay` ⇒ Ein-Hafentags-Plan, `valid: true`, Ampel grün (Repro B)
`src/domain/solver.ts:269-297`, `assess.ts:277-278`

Am Stichtag entsteht `[{kind:'harbour', day:5, islandId:'athen'}]` mit **null**
Violations: `harbourCount 1 <= harbourDays 1`, `endIsland === baseIslandId`,
`lastDay === deadlineDay`, und der Zustiegstag ist nicht mehr Teil des Plans,
also entfällt Bedingung (3) komplett (siehe 2.3). Ergebnis: `restTripAmpel =
'gruen'` für einen Plan, der nichts tut.

### 2.3 Bedingung (3) hat keinen `else`-Zweig
`src/domain/solver.ts:326-328`

`if (pickupEntry) { … }` — deckt der Plan den Zustiegstag nicht ab (Tag in der
Vergangenheit, Plan abgeschnitten, Deadline vor dem Pickup), wird die harte,
nie relaxierbare Bedingung **stumm nicht geprüft**. Bei einem Pickup-Tag in der
Vergangenheit ist das richtig, bei einem abgeschnittenen Plan nicht — die zwei
Fälle sind nicht unterschieden.

### 2.4 Vergangene Tage fallen bei jedem Edit/Check-in aus dem Plan
`src/domain/solver.ts:197`; `fixedDays` (`plan.ts:136`) wird nirgends aufgerufen

`planFromPacking` beginnt bei `trip.currentDay`; `EDIT_STAGE`/`CHECK_IN`
ersetzen den Plan vollständig (`tripContext.tsx:112-114`). Ein Edit an Tag 5
liefert also einen Plan mit den Tagen 5–12; die Tage 1–4 existieren nicht mehr.
AD-12 („vergangene Tage sind implizit fixiert") ist damit unimplementiert —
`fixedDays()` ist toter Code, nur von `plan.test.ts` referenziert.

Zwei konkrete Folgeschäden:
- **Etappen-Nummerierung**: `stageNumber` (`plan.ts:120-124`) zählt Ordinale
  über die *vorhandenen* Stages. Nach dem Edit an Tag 5 trägt Tag 5 die Nummer
  1. Der Skipper sieht jeden Tag eine neue „Etappe 1"; die FR2-Zählung 1–11
  über den Törn existiert nicht. Der zugehörige Test (`plan.test.ts:41-56`)
  prüft nur Plan-lokale Umnummerierung beim Verschieben des Hafentags, nicht
  die Abschneidung.
- **Hafentag-Anzahl**: ein bereits verbrauchter Hafentag zählt nicht mehr in
  `harbourCount` (`solver.ts:269`), der Solver darf also einen zweiten
  einplanen.

### 2.5 Hafentag-Anzahl nur nach oben geprüft
`src/domain/solver.ts:269-276`

Geprüft wird `harbourCount > params.harbourDays`. Ungeprüft: `harbourCount <
harbourDays` und die „11 Stages"-Struktur aus PRD §4. Ein Plan mit 12 Stages
und **null** Hafentag ist gültig — er verbraucht die PoR-Reserve, die laut AD-9
genau dieser Puffertag *ist* (`time.ts:116`).

### 2.6 Hafentag-Pin („wir bleiben") erzeugt einen Nur-Hafen-Plan (Repro D)
`src/domain/solver.ts:398-409` + `:419-420`, `src/domain/ppr.ts:169-173`

Drei Pfade greifen ineinander:
1. `dayConstraintFor` ignoriert einen Pin mit `toIslandId === null`
   (`if (pin?.toIslandId && …)`), verbietet also **keine Etappe** am
   Hafentag-Pin.
2. Der DP bevorzugt Segeln; der Wartezweig wird nur betreten, wenn
   `best.verdict !== 'feasible'` (`ppr.ts:170`) — bei fahrbarem Wetter also nie.
3. `candidateHonoursPins` verwirft anschließend jede Packung, die am gepinnten
   Tag segelt (`solver.ts:419-420`).

Ergebnis (Repro D, Pin „Tag 1 = bleiben"): der einzige überlebende Kandidat ist
„(bleiben)" ⇒ **alle 5 Tage Hafentag an der Basis**, ungültig. Der von AD-12
ausdrücklich genannte Anwendungsfall („Verschieben des Hafentags, z. B. auf
heute: ‚wir bleiben'") führt zu einem Do-Nothing-Plan statt zu „heute bleiben,
morgen weiter".

Guard: Hafentag-Pins als DP-Constraint ausdrücken (am Pin-Tag ist nur der
Wartezug zulässig) statt als Nachfilter, und den Wartezug unabhängig von
`best.verdict` erlauben, wenn der Tag gepinnt ist.

### 2.7 Die Insel eines Hafentag-Pins geht verloren
`src/app/usePlanning.ts:111-115` und `src/domain/assess.ts:239-243`

```ts
toIslandId: d.kind === 'stage' ? d.toIslandId : null,
```

`HarbourDay.islandId` (`plan.ts:53`) wird beim Ableiten der Pins verworfen.
`candidateHonoursPins` prüft für `toIslandId === null` nur noch `entry.kind ===
'harbour'` (`solver.ts:419-420`). „Wir bleiben auf Naxos" degradiert zu „irgendwo
ein Hafentag" — der Solver darf das Boot am gepinnten Tag auf eine andere Insel
legen.

### 2.8 `PlanSchema` hat keine Eindeutigkeits- oder Lückenbedingung (Repro H)
`src/domain/schema/plan.ts:65-68`

`days: z.array(PlanDaySchema).min(1)` — doppelte `day`-Werte, Lücken und
nicht-zusammenhängende Insel-Ketten parsen anstandslos. Konsequenzen im
reproduzierten Fall (zwei Einträge mit `day: 1`):
- `planDay` (`:117`) liefert den **ersten** Treffer ⇒ `endIsland` falsch ⇒
  irreführende `deadline`-Violation.
- `stagesOf` (`:110-114`) zählt beide ⇒ `stageNumber` verschoben.

Ebenso ungeprüft: dass `day N`s Ziel-Insel die `fromIslandId` des Legs von
`day N+1` ist. Für vom Solver gebaute Pläne gilt das per Konstruktion, für einen
persistierten Plan gegen eine neu importierte Bibliothek nicht — `validatePlan`
merkt eine „springende" Route nicht.

### 2.9 Off-Plan-Position wird nirgends markiert
`src/domain/assess.ts:83-155` (`assessPlan`), `snapshot.ts` `StageAssessment`

AD-12 verlangt: „weicht die Position vom Plan ab, wird die heutige Stage als
**abweichend** markiert — der Plan bleibt unangetastet." `StageAssessment` hat
kein solches Feld, und `assessPlan` vergleicht `currentIslandId` nie mit
`islandAtEndOfDay(plan, currentDay - 1)` (der Helfer `plan.ts:143` ist toter
Code). Die Legs der Hauptroute werden weiter aus ihrer eigenen `fromIslandId`
simuliert, obwohl das Boot woanders liegt — der Skipper sieht Stundenwerte für
eine Etappe, die er von seiner Position aus nicht fährt, ohne Hinweis.
`proposal` und `witness` starten korrekt an der Ist-Position (`assess.ts:245`,
`:262`), `mainRoute` aber nicht.

---

## 3. Position, Ampel, Alternativen

### 3.1 Fehlende oder nicht zuordenbare Position ⇒ Ampel ROT
`src/domain/assess.ts:262`, `:287-292`

`witness = currentIslandId ? existsValidPlan(…) : null`. Ist `currentIslandId`
`null` — kein Fix und `currentDay !== 1` (`assess.ts:45-52`) oder weiter als
`maxSnapNm` vom nächsten Platz (`:64-69`) — fällt die Ampel in den
`else`-Zweig: `rot` mit „Kein gültiger Round-Trip mehr darstellbar". Eine
Datenlücke wird als fachliches Urteil ausgegeben, obwohl `positionNote` den
wahren Grund kennt. Zusätzlich ist `proposal` dann `null`, `ADOPT_INITIAL`
feuert nicht, die App hat bis zum GPS-Fix keine Hauptroute.

Guard: `if (!currentIslandId) { restTripAmpel = 'unbewertet'; reasons.push(positionNote) }` vor der Ampel-Kaskade.

### 3.2 Insel abseits der Rückfallkette ⇒ `completePlan` gibt `null`
`src/domain/solver.ts:456-457`

`buildCandidates` liefert nur Kandidaten, für die `remainingReturnLegs` einen
Weg findet (`:146-147`, `:159-160`). Liegt das Boot auf einer Insel, die weder
auf der Kette noch über einen kuratierten Connector-Leg erreichbar ist, ist
`candidates.length === 0` ⇒ `return null`. Die Matrix-Zeile „Kein gültiger Plan
→ Vorschlag existiert trotzdem, kein Throw" ist damit nicht erfüllt: es gibt
keinen Vorschlag und keine benannte Bedingung, nur `null`.

### 3.3 Alternativen sind strukturell fast immer leer
`src/domain/solver.ts:566-567` gegen `:269-276`

`deriveAlternatives` verwirft jeden Kandidaten mit `!validity.valid`. Jeder
konservativere (kürzere) Kandidat kehrt früher zurück, die Resttage werden von
`planFromPacking` zu Hafentagen an der Basis (`:209`) ⇒ `harbourCount >
harbourDays` ⇒ `incomplete`-Violation ⇒ `continue`. Nur der längste Kandidat
kann gültig sein. AD-13 („mindestens eine konservativere Eskalationsstufe")
ist damit unerreichbar; die Alternativen-Menge kollabiert auf den
Existenzzeugen. Die Gelb-Einlösbarkeits-Invariante hält formal (der Zeuge ist
drin), die FR29-Auswahl aber nicht.

### 3.4 `alternativesMax: 0` ist erlaubt und schneidet den Zeugen nicht ab
`src/domain/schema/params.ts:123`, `src/domain/solver.ts:545-551`, `:576`

Bei `alternativesMax = 0` wird der Zeuge vor der Schleife eingefügt (`:548`),
die `break`-Bedingung greift erst danach ⇒ die Rückgabe enthält genau ein
Element, obwohl 0 konfiguriert ist. Kein Guard, welche der beiden Lesarten
gewinnt.

---

## 4. Deadline, Zeit, Zeitzone

### 4.1 `porDeadlineDay` wird stumm auf 1 geklemmt (Repro G)
`src/domain/time.ts:116`

`porDeadlineDay: Math.max(1, deadlineDay - params.bufferDays)`. Bei
`bufferDays >= deadlineDay` (Repro G: Deadline Tag 3, Puffer 5) ergibt das
dauerhaft `1` — der PoR meldet ab Tag 1 „letzter Rückkehrstart ist heute".
Der gelöschte Check `disembarkDay - 1 - bufferDays >= 1` (`params.ts`, Diff
Z. 1099-1113) hat genau das verhindert; sein Ersatz
(`returnDeadlineDate >= tripStartDate`, `params.ts:172-178`) deckt es nicht ab.

### 4.2 Kein Check „Deadline-Tag ≤ tripLengthDays"
`src/domain/schema/params.ts:172-195`; `src/app/tripContext.tsx:197`,
`src/app/usePlanning.ts:70-74`

Der gelöschte Check `disembarkDay > tripLengthDays` hat keinen Ersatz.
`tripLengthDays` und `returnDeadlineDate` sind jetzt zwei unabhängige Felder:
`deriveCurrentDay` klemmt auf `tripLengthDays` (`tripContext.tsx:197`),
`deadlineFrame` leitet den Stichtag aus dem Datum ab. Liegt der Stichtag vor dem
letzten Törntag, läuft `currentDay` über den Stichtag hinaus → Befund 2.1
(leerer Plan). Liegt er danach, erreicht `currentDay` den Stichtag nie und der
Solver plant Tage, die die Ansicht nie anzeigt.

### 4.3 `returnDeadlineHourAthens` / `deadlineUtcMs` sind unbenutzt
`src/domain/time.ts:97`, `:115`; Bedingung (2) `src/domain/solver.ts:291`

`deadlineUtcMs` wird berechnet und von niemandem gelesen (grep). Bedingung (2)
prüft nur `lastDay > frame.deadlineDay`, also Tagesgranularität. Eine Ankunft um
23:00 am Stichtag passiert eine vertraglich auf 18:00 gesetzte Rückgabe
anstandslos. Die „eine Deadline" ist also nur zur Hälfte eine.

### 4.4 Zeitzone/DST an den Fenstergrenzen
`src/domain/time.ts:79-85` (behandelt), `src/app/tripContext.tsx:195-197`
(offen)

`tripDayForDate`/`dateForTripDay` rechnen über 12:00 UTC und sind damit
DST-fest; `athensToUtcMs` dokumentiert seine Regel für Sprung- und
Doppelstunde (`:39-51`). Offen bleibt `deriveCurrentDay`: es nimmt
`athensToUtcMs(start, 0)` und teilt dann durch ein festes `86_400_000`. Fällt
eine DST-Umstellung in das Törnfenster, kippt der Törntag um 23:00 bzw. 01:00
Athener Zeit statt um Mitternacht. Für den August-Törn nicht erreichbar, für
einen Frühjahrs-/Herbsttörn schon — und der Törntag ist der Index, an dem
`assessLeg`, Pins und der Pickup hängen.

### 4.5 `packLegs`-Memo-Key: keine Kollision, aber ein nicht erreichbarer Tie-Break
`src/domain/ppr.ts:122` (`${legIdx}:${day}:${waitsUsed}`), `:111-117`, `:140`, `:170`

Der Key deckt den vollständigen DP-Zustand ab (`legs`, `snapshot`,
`deadlineDay`, `dayConstraint` sind pro Aufruf konstant, `dayConstraint` hängt
nur von `(day, endIslandId)` ab, und `endIslandId` folgt aus `legIdx`) — eine
Kollision ist nicht konstruierbar. **Aber**: Doppel-Etappen- und Wartezug sind
beide hinter `best.verdict !== 'feasible'` gehängt (`:140`, `:170`). Sobald der
Ein-Etappen-Zug `feasible` liefert, wird der memoisierte Eintrag als „best"
festgeschrieben, ohne dass `better()` je gegen eine Alternative läuft. Der
dokumentierte Tie-Break „auf Gleichstand die frühere Ankunft" (`:110-117`) ist
im Regelfall unerreichbar; das Ergebnis ist die erste gefundene, nicht die
früheste Packung. Wirkung: der Hafentag landet praktisch immer am Ende
(Leerlauf an der Basis) statt dort, wo er die Reserve schützt — was über
Befund 2.5/3.3 in die Gültigkeit durchschlägt.

### 4.6 Dreifacher Solverlauf pro Assessment
`src/domain/assess.ts:246`, `:262`, `:264`

AD-13 fordert „Der Existenz-Check ist Nebenprodukt desselben DP-Laufs — keine
zweite Machbarkeitsrechnung". Tatsächlich laufen pro `assessPlanning` drei
vollständige Kandidaten-Sweeps: `completePlan` (Vorschlag), `existsValidPlan` →
`completePlan` (Zeuge), `deriveAlternatives` (eigener Sweep). Jeder davon
iteriert `RELAXATION_ORDER` × Kandidaten × DP, und `validatePlan` ruft darin
`assessLeg` sowie `returnFeasibleStarting` (ein weiterer DP) je Stage. Das ist
kein Korrektheitsfehler, aber die Grenze, an der ein `useMemo`
(`usePlanning.ts:92-95`) bei 11 Legs und 12 Tagen den Main-Thread blockiert, ist
nicht abgeschätzt.

---

## 5. Deletion Check

Der Diff entfernt inhaltlich tragende Zeilen; geprüft, ob die dadurch
verlorenen Zusicherungen ersetzt sind.

| Entfernt | Ersetzt? | Offener Pfad |
|---|---|---|
| `disembarkDay` + Check `disembarkDay - 1 - bufferDays >= 1` (`params.ts`) | Nein — neuer Check prüft `returnDeadlineDate >= tripStartDate` | 4.1: `porDeadlineDay` still auf 1 geklemmt |
| Check `disembarkDay > tripLengthDays` (`params.ts`) | Nein — an seiner Stelle steht der neue `meltemiWorstCase`-Check | 4.2 / 2.1: leerer Plan, Deadline außerhalb des Törnrahmens |
| Test `rejects disembarkDay beyond tripLengthDays` (`schema.test.ts:75`) | Nein — durch einen `meltemiWorstCase`-Test *ersetzt*, nicht migriert | Die Zusicherung ist unbeaufsichtigt (Spec: „nie stumm gelöscht") |
| `trackedRouteId` + `TRACK_ROUTE` + Header-Select (`App.tsx`, `tripContext.tsx`) | Teilweise — `plan` ist der Nachfolger | `MapView.tsx:88-94` zeigt jetzt „die ambitionierteste noch offene Option" statt der Hauptroute; bis zum UI-Durchlauf widerspricht die Karte dem Plan. Im Code als temporär deklariert. |
| `packLegsFeasible` als DP-Kern | Ja — Wrapper `ppr.ts:190-198`, `maxWaitDays` bleibt für den PoR unbegrenzt | — |
| `assessLeg`-Abbruch bei `idx >= times.length` | Teilweise — nur für `worstCase` aufgehoben (`scoring.ts:228-233`) | 1.9: der Einstiegs-Guard `:211` blieb szenariounabhängig |

Zusätzlich neu eingeführt und nirgends verwendet (grep über `src/`, ohne
Tests): `VariantSchema`/`Variant` (`route.ts:67-78`), `fixedDays`,
`islandAtEndOfDay`, `pinnedDays` (`plan.ts:128-146`), `unassessableStages`
(`solver.ts:584`), `deadlineUtcMs` (`time.ts:97`), `nightLegMaxPerTrip`,
`nightLegEarliestDay` (`params.ts:117-119`), `DISCARD_UNREADABLE`
(`tripContext.tsx:127`). Jedes dieser Symbole steht für ein AD-12/AD-13-Verhalten,
das damit als Schnittstelle existiert, aber keinen Aufrufer hat.

---

## 6. Behandelte Grenzfälle (still verworfen — hier nur als Abgrenzung)

- Leerer Kandidat „(bleiben)" hat einen eigenen Memo-Key statt als falsy zu
  verschwinden (`solver.ts:132`).
- Fehlendes `guestPickup` zählt als **nicht** erreichbar, an beiden Prüfstellen
  (`solver.ts:334`, `:406`).
- 65°/25 kn: `relaxParams` (`solver.ts:61-78`) berührt `maxUpwindTwsKn`,
  `beatTwaDeg`, `upwindTwaDeg` und die Pickup-Felder nicht; die Gültigkeit wird
  immer gegen die **Original**-Params geprüft (`solver.ts:491-493`). Der Test
  `never relaxes the pickup or the upwind threshold` (`solver.test.ts`) sichert
  das strukturell.
- Tote Leg-Referenz: `incomplete` statt `budget`/`upwind`, Plan bleibt bestehen
  (`solver.ts:234-245`, `assess.ts:105-119`).
- `ADOPT_INITIAL` ist doppelt gesichert (Reducer `tripContext.tsx:109`,
  Effect-Guard `usePlanning.ts:101`) und feuert bei `planUnreadable` nicht.
- `departureHourOverride` gilt nur für den heutigen Törntag
  (`scoring.ts:204-206`).
- Manuelle Position wird von GPS nie überschrieben (`tripContext.tsx:91`).
- Sektor-Wrap über 0° selbst ist arithmetisch korrekt (`scoring.ts:122`) —
  offen sind nur Vollkreis und Vertauschung (1.7).
- DST-Festigkeit von `tripDayForDate`/`dateForTripDay` über 12:00 UTC
  (`time.ts:66-85`).
