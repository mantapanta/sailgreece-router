---
title: 'Plan-Begründung: was den Möglichkeitsraum begrenzt'
type: 'feature'
created: '2026-08-07'
status: 'proposed'
review_loop_iteration: 0
baseline_commit: 'b68d6b484285c485ebfbc9d6aa505e429ee0fdf1'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md'
salvaged_from: 'feat/plan-reasoning-and-forecast-persistence @ 36ea436 (src/domain/overview.ts)'
---

## Woher das kommt

Der Branch `feat/plan-reasoning-and-forecast-persistence` (letzter Commit 2026-08-04,
inzwischen 160 Commits hinter `main`) trug ein Modul `src/domain/overview.ts` — 403
Zeilen plus 259 Zeilen Tests, nirgends sonst im Repo vorhanden. Es lässt sich nicht
mergen: es liest einen Snapshot, den es nicht mehr gibt (`LegAssessment.headroom`,
`RouteOptionAssessment.returnLegAssessments`, `Library.routes`,
`TripFrame.trackedRouteId`, `PprResult.legAssessments`, `params.disembarkDay`,
geänderte `OptionState`-Werte). Dieses Dokument hält fest, was die Idee war, was
davon `main` inzwischen selbst tut, und was übrig bleibt.

Achtung bei der Nummerierung: Das Modul nannte sich „FR22". Dieses FR22 gibt es nicht
mehr — seit der Feldtest-Entscheidung vom 2026-08-02 heißt FR22 „Die App schlägt den
Round-Trip aktiv vor". Der Branch schrieb also bereits gegen ein veraltetes PRD. Für
Plan-Ebene-Begründung existiert heute **kein** FR; das nächstliegende ist FR30, und
das ist ausdrücklich Etappen-Transparenz, nicht Plan-Transparenz.

## Die damalige Idee

Ein Satz aus dem Kopfkommentar trägt sie:

> Die Begründungen je Etappe und je Option erklären einzelne Urteile. Sie beantworten
> nicht die Frage, die der Skipper morgens wirklich stellt: „Warum sieht der Plan
> HEUTE so aus?"

Daraus wurde ein `PlanRationale { summary: string; sections: { title, lines[] }[] }`
mit sieben Abschnitten, rein abgeleitet über bereits gerechnete Teile (AD-2 — es wird
nichts neu geurteilt, nur in Sätze gebracht):

1. **Ausgangslage** — Standort, Törntag, Abfahrtszeit, harte Klammer bis Stichtag
2. **Möglichkeitsraum** — wie viele Optionen offen/zu, weiteste offene, Befristungen
3. **Was den Raum begrenzt** — Wind oder Kalender oder Strecke; dazu die engste Stelle
4. **Nächster Druckpunkt** — der erste Entscheidungspunkt
5. **Wetterbild der nächsten Tage** — Revier-Spanne und Hauptrichtung je Tag
6. **Rückweg** — spätester Umkehrtag, Restdistanz
7. **Datenbasis** — Modell, Lauf, Abruf, ab wann Persistenz-Annahme

## Was `main` davon heute schon tut

| Abschnitt | Stand in `main` |
|---|---|
| 1 Ausgangslage | **weitgehend** — `positionNote`, Tageskontext-Block mit Position-Popover, `AbfahrtMenu`, `ppr.effectiveDeadlineDay` in der Trip-Statuszeile |
| 2 Möglichkeitsraum | **ja** — `DayView`-Abschnitt „Optionsraum" über `dayViewModel.optionsSummary` (`openCount`, `nextDeadlineDay`); je Option zusätzlich `empfehlung`, `abratenGruende`, `konzeptWarnung`, `costLevel`/`costNote` — reicher als die alte Fassung |
| 3 **Was den Raum begrenzt** | **nein — vollständige Lücke** |
| 4 Nächster Druckpunkt | **ja** — `decisionPoints` in `TripStatusLine` und `DayView` |
| 5 Wetterbild nächste Tage | **nein** — Wind steht je Etappe (`WindBarb`) und als Feld auf der Karte (`windField.ts`), aber es gibt keinen Mehrtages-Streifen |
| 6 Rückweg | **ja** — `TripStatusLine` (Rückkehr-Frist, spätester Umkehrtag, Meltemi-fest), `rueckwegEmpfehlung` |
| 7 Datenbasis | **ja** — `assumptionNote`, „Stand vor {h} h"-Segment, `provenance` |

Fünf von sieben Abschnitten sind erledigt, teils besser als damals. Die Idee war gut —
sie ist zum größten Teil auch ohne diesen Branch umgesetzt worden, nur verteilt statt
in einem Block.

## Was übrig bleibt

**Abschnitt 3 ist der eigentliche Wert und fehlt komplett.** Er beantwortet nicht „wie
steht es", sondern „wo muss ich hinschauen":

- **Welche Fessel bindet?** Drei Fälle, unterschieden statt geraten: der Wind (Etappen
  reißen die Aufkreuz-Grenze), die Strecke (Etappen sind rot, ohne die Windgrenze zu
  reißen), oder der Kalender (keine Etappe rot — die Optionen scheitern an der Restzeit).
  Die drei schicken den Skipper an verschiedene Orte: auf Wind warten, den Plan kürzen,
  oder umkehren. Ein „rot" allein sagt nicht welches.
- **Wo ist die engste Stelle?** Die Etappe mit der kleinsten Reserve im ganzen Plan.
  Knoten Wind und Stunden Zeit sind nicht vergleichbar, deshalb rangiert die alte
  Fassung nach Reserve *relativ zum eigenen Limit*: 4 von 25 kn (16 %) ist enger als
  2,4 von 8 h (30 %). Bei Gleichstand gewinnt der Wind, weil die Windregel die
  Sicherheitsgrenze ist (FR16) und das Tagesbudget nur Komfort.

Das ist ein Diagnose-Werkzeug, kein weiterer Statusbericht — und nichts in `main`
leistet es.

## Machbarkeit: `headroom` ist rekonstruierbar

Abschnitt 3 hängt an `LegAssessment.headroom` (`{ windKn, hours }`), das es in `main`
nicht gibt. Die **Eingangsdaten sind aber vollständig vorhanden**:

- `hours` = `(params.maxSailHours + params.maxMotorHours) − leg.totalHours`
  — beide Felder existieren.
- `windKn` = `params.maxUpwindTwsKn − max(twsKn über die Aufkreuz-Stunden)`
  — `leg.breakdown[]` führt je Stunde `twsKn`, `twaDeg`, `kreuzen`; `params` hat
  `maxUpwindTwsKn` und `beatTwaDeg`. `null`, wenn die Etappe nie kreuzt.

Der Reserve-Begriff selbst ist `main` nicht fremd: `params.gelbReserveKn` trägt in
`ampel.ts` und `scoring.ts` genau diese Logik, nur unveröffentlicht — sie entscheidet
grün gegen gelb, wird aber nicht ausgewiesen. `headroom` macht sie sichtbar, ohne ein
neues Urteil einzuführen (AD-2 bleibt gewahrt).

## Vorschlag

**Bauen:**

1. `LegHeadroom { windKn: number | null; hours: number | null }` als Feld auf
   `LegAssessment`, gerechnet in `scoring.ts` aus `breakdown` + `params`.
2. Eine Ableitung „Engpass" über den aktuellen Plan und den Optionsraum: bindende
   Fessel (Wind / Strecke / Kalender) plus engste Stelle, formuliert gegen das heutige
   Vokabular (Konzept, `costLevel`, `empfehlung`) statt gegen die alte Routen-Bibliothek.
3. Anzeige im Rest-Trip-Detail der `TripStatusLine` — dort steht der Rest-Trip-Kontext
   schon, und der Skipper klappt für Begründungen ohnehin dorthin auf.

**Nicht bauen:** Abschnitte 1, 2, 4, 6, 7 — sie würden vorhandene Anzeigen doppeln.

**Getrennt entscheiden:** Abschnitt 5 (Mehrtages-Wetterbild). Das ist kein Argument
über den Plan, sondern ein Forecast-Streifen — ein eigenes Feature mit eigenem Nutzen,
das nicht an dieser Begründung hängt. Anmerkung zur alten Umsetzung: `dayWeather`
iterierte je Tag über alle Forecast-Punkte × Stunden (97 Plätze × 6 Tage) innerhalb
von `assess` — bei einer Neuauflage gehört das gemessen.

**Nicht wiederbeleben:** der alte `LegAssessment.rationale: string[]` (Etappen-Prosa).
`main` löst Etappen-Transparenz über `pointPassages`, `breakdown` und `kursAbschnitte`
— eine Tabelle statt eines Absatzes, und FR30 ist damit bedient.

## Herkunft

Der Branch bleibt für die Nachlese stehen. Der Quellstand:

```
git show 36ea436:src/domain/overview.ts
git show 36ea436:src/domain/__tests__/overview.test.ts
```
