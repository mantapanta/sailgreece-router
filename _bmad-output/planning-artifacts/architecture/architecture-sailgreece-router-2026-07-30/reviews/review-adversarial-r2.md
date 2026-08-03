# Adversarial Review — Architecture Spine Revision 2 (sailgreece-router)

- **Prüfobjekt:** `ARCHITECTURE-SPINE.md`, Revision 2 (2026-08-02) — Fokus AD-12 (Plan-Modell mit Pins), AD-13 (Round-Trip-Solver-Vertrag) und deren Naht zu AD-3/AD-11
- **Methode:** Für jede Fundstelle wurden zwei Units „eine Ebene tiefer" konstruiert, die **jede AD wörtlich einhalten** und trotzdem inkompatibel bauen. Nur echte Paare gemeldet; Geschmacksfragen verworfen.
- **Datum:** 2026-08-02
- **Verdict:** Der Spine hält dem Angriff nicht stand. AD-12/AD-13 sind in der Grundform stark (persistierter Plan, ein Machbarkeitsbegriff, Relaxation im Core), aber an drei Stellen lassen sie **zwei regelkonforme, inkompatible Bauweisen** mit unterschiedlicher FR2-Ampelfarbe für denselben Snapshot zu — bei einer Sicherheits-App ist das disqualifizierend. Dazu vier Löcher mittlerer Schwere an den Rändern (Persistenz, Referenz-Integrität, Nummerierung, Platz-Ebene).

---

## Loch 1 — EDIT_STAGE: Wo entsteht die Solver-Vervollständigung? (Schweregrad: HOCH)

**Fundstelle:** AD-12 („Etappen-Edit … ersetzt alle ungepinnten Folgetage durch die frische Solver-Vervollständigung") × AD-11 („ausschließlich über einen Reducer … nach jeder Änderung persistiert") × AD-3 („Einziger Engine-Einstieg: `assessPlanning(snapshot)`").

**Das Paar:**

- **Unit A („synchroner Reducer"):** Die `EDIT_STAGE`-Action trägt den aktuellen `PlanningSnapshot` als Payload; der Reducer ruft (pur, also reducer-legal) den Solver auf und schreibt Pin **und** Vervollständigung atomar, persistiert einen konsistenten Plan. Konform mit AD-11 (enumerierte Aktion), AD-2 (Solver bleibt pur), AD-12 (wörtlich). Aber: der Solver wird **an `assessPlanning` vorbei** direkt aufgerufen — AD-3 verbietet nur eine zweite *Forecast-Query*, nicht einen zweiten *Engine-Aufruf*; Unit A liest den Snapshot ja aus derselben Query-Familie.
- **Unit B („asynchron übers Assessment"):** Der Reducer setzt nur den Pin; die Folgetage bleiben zunächst stehen (alter Solver-Stand). `usePlanning` beobachtet die Plan-Änderung, wartet auf das nächste `assessPlanning`-Ergebnis und dispatcht dann `ADOPT_COMPLETION` (ebenfalls enumerierte Aktion). Konform mit AD-3 (alles über den einen Einstieg), AD-11, AD-12 (die Folgetage werden ja „ersetzt" — nur eben später).

**Inkompatibilität:** (1) Unit B **persistiert einen Zwischenzustand** — Reload im Zeitfenster zwischen Pin und Adoption liefert eine Hauptroute, deren `source:'solver'`-Folgetage gegen einen anderen Forecast-Stand gerechnet wurden als der Pin; Unit A kennt diesen Zustand nicht. (2) Es gibt **zwei Mutationspfade für dieselbe Entität** (Reducer-intern vs. Effekt-dispatcht) — genau das, was AD-12 unter „Prevents" verhindern will. (3) Unit B erzeugt einen Feedback-Zyklus Assessment→Dispatch→Persist→(Re-Render)→Assessment, dessen Terminierung nirgends geregelt ist. (4) Kombiniert man A und B in einem Team (DayView-Team baut A, MapView-Team erwartet B), überschreibt die verspätete `ADOPT_COMPLETION` aus B die synchrone Vervollständigung aus A.

**Verletzte Erwartung:** Ein Plan, ein Owner, ein Mutationszeitpunkt — der Spine legt fest *dass* vervollständigt wird, aber nicht *wer wann womit*.

**Vorgeschlagene Schärfung (AD-12):** Normativ festlegen: *„Die Solver-Vervollständigung eines Edits berechnet ausschließlich der Reducer synchron, pur, aus dem als Action-Payload mitgegebenen letzten `Assessment`/`PlanningSnapshot` (die Schale injiziert ihn beim Dispatch). Es gibt keinen zweiten, asynchronen Schreibpfad in den Plan; kein Effekt dispatcht planverändernde Aktionen als Reaktion auf ein Assessment (einzige Ausnahme: Erststart-Adoption, siehe AD-12a). Ein persistierter Plan ist immer in sich konsistent (Pin und Vervollständigung aus demselben Snapshot; `assessedWith`-Zeitstempel am Plan)."* Zusätzlich in AD-3 klären, ob `solve(snapshot, pins)` als zweiter benannter Core-Einstieg neben `assessPlanning` existiert oder Teil dessen Rückgabe ist.

---

## Loch 2 — FR2-Gelb: Zwei Definitionen von „ein gültiger alternativer Round-Trip existiert" (Schweregrad: KRITISCH)

**Fundstelle:** AD-3 (Gelb-Definition) × AD-13 („Alternativen: max. 2–3 …") × AD-12 (Pins sind „harte Constraints des Solvers"; Check-in „löst alle Pins").

**Das Paar (zwei Achsen, beide regelkonform):**

*Achse 1 — Existenzbeweis vs. Alternativen-Liste:*
- **Unit A:** „existiert" = der DP-Solver findet **irgendeinen** gültigen Plan im Suchraum (Leg-Bibliothek × Varianten). Billig als Nebenprodukt des DP.
- **Unit B:** „existiert" = **mindestens eine der max. 2–3 abgeleiteten Alternativen** (FR29) ist gültig — schließlich sind das die einzigen Round-Trips, die der Skipper einchecken *kann*; Gelb ohne einlösbare Alternative wäre eine leere Zusage.
- **Divergenz:** Es existiert ein gültiger Plan im Suchraum, der aber nicht unter den 2–3 kuratierten Alternativen ist (weil die Ableitung „eine konservativere + eine ambitioniertere" andere Kandidaten wählt): Unit A zeigt **Gelb**, Unit B **Rot**. Dieselbe Wetterlage, gegensätzliche Handlungsanweisung an den Skipper.

*Achse 2 — Pins respektieren oder lösen:*
- **Unit A':** Der Existenz-Check respektiert Pins (AD-12: „harte Constraints des Solvers" — und der Existenz-Check *ist* der Solver). Ein Pin, der jede Rückkehr verbaut → **Rot**.
- **Unit B':** Der Existenz-Check ignoriert Pins, denn die Alternative würde per Check-in adoptiert, und „Check-in löst alle Pins" (AD-12 wörtlich) → derselbe Zustand ist **Gelb**.

**Verletzte Erwartung:** FR2 nennt die Rest-Trip-Ampel „deterministisch definiert" — der Spine lässt aber vier verschiedene deterministische Prädikate zu.

**Vorgeschlagene Schärfung (AD-13):** Normativ: *„FR2-Gelb-Existenzprädikat: Es existiert ein gültiger Plan im vollen Suchraum (Leg-Bibliothek entlang der Varianten), der **vergangene Tage fixiert, aktive Pins jedoch NICHT bindet** (Begründung: der Einlöseweg ist der Check-in, und der löst Pins). Der Existenz-Check ist Nebenprodukt desselben DP-Laufs — keine zweite Machbarkeitsrechnung. Zusatzinvariante: Ist das Prädikat wahr, enthält die Alternativen-Menge (FR29) mindestens einen gültigen Plan — die Alternativen-Ableitung MUSS den Existenzzeugen aufnehmen, damit Gelb immer einlösbar ist."* (Die konkrete Pin-Entscheidung kann auch andersherum fallen — aber sie muss im Spine stehen.)

---

## Loch 3 — Gültigkeit hat drei Lesarten: Rückkehrfenster-Regel und Worst-Case-Horizont — Constraint oder Score? (Schweregrad: KRITISCH)

**Fundstelle:** AD-13: „**Gültigkeit normativ (FR18):** (1) FR16-Schwellen, (2) `returnDeadline`, (3) Pickup" — abschließende Liste. Zwei Absätze weiter: „Die Engine … **plant Fensterende auf einen meltemi-sicheren Hafen**" und „Stages jenseits `reliableHorizonDays` werden gegen das … Worst-Case-Szenario **bewertet**".

**Das Paar:**

- **Unit A („alles ist Constraint"):** Der Solver behandelt (a) „Fensterende auf meltemi-sicherem Hafen" und (b) „Fernbereichs-Stage besteht unter Worst-Case" als **vierte und fünfte Gültigkeitsbedingung**. Konsequenz: Im Hochsommer mit stehendem Meltemi im Fernbereich (30 kn aus 0–45°, jede Nord-Etappe reißt die 65°/25-kn-Schwelle unter Worst-Case) ist **fast nie** ein „gültiger" Plan konstruierbar → Dauer-**Rot** ab Tag 1, obwohl der reale Forecast harmlos ist. Regelkonform: „plant … auf" und „werden bewertet" decken das.
- **Unit B („Gültigkeit ist nur die Dreierliste"):** Fenster-Regel und Worst-Case sind **Score/Vorzugslogik**; Gültigkeit = exakt (1)–(3), Fernbereichs-Stages zählen via FR2-Gelb-Klausel („hängt am Horizont") nie gegen die Gültigkeit — PRD-FR18 sagt wörtlich, Horizont-Etappen „machen einen Round-Trip weder gültig noch ungültig". Konsequenz: Ein Plan, dessen Fensterende auf einem exponierten Hafen liegt, ist **Grün** — die Fenster-Strategie, der Kern des Feldtest-Pivots, ist dann unverbindliche Dekoration.
- **Divergenz:** Identischer Snapshot → Unit A: Rot mit Relaxation, Unit B: Grün/Gelb. Beide berufen sich auf denselben AD-13. Das ist exakt der „zweierlei Machbarkeitsbegriffe"-Fehler, den AD-3/AD-13 unter „Prevents" führen — nur diesmal zwischen zwei Auslegungen *desselben* Solvers statt zwischen Solver und PoR.

**Verletzte Erwartung:** „Ein Machbarkeitsbegriff" — die normative Gültigkeitsliste und die Fenster-/Horizont-Absätze definieren aber zwei Regelwerke mit ungeklärter Bindungskraft.

**Vorgeschlagene Schärfung (AD-13):** Dreistufig normieren: *„Gültigkeit im **verlässlichen Horizont** = Bedingungen (1)–(3) gegen den echten Forecast, abschließend. Stages **jenseits** des Horizonts zählen NIE gegen Gültigkeit (sie erzeugen höchstens FR2-Gelb ‚Horizont'). Das Worst-Case-Szenario ist bindend für **genau eine** Rechnung: den Rückkehr-Check (Kette Fensterende/aktueller Hafen → Alimos in den Resttagen) — dieser Check ist Bedingung (2') der Gültigkeit und identisch der PoR-Rechnung. Die Meltemi-Sicherheit des Fensterende-Hafens ist Bestandteil von (2') (Kette startet dort unter Worst-Case), nicht separater Score."* Damit ist eindeutig: Worst-Case bindet die Rückkehr, nie die Hin-Stages.

---

## Loch 4 — Erststart-Adoption × Persistenz-Parse-Fehler: der stille Planverlust (Schweregrad: HOCH)

**Fundstelle:** AD-12 („beim Erststart (kein Plan vorhanden) wird der Solver-Vorschlag automatisch adoptiert — es gibt immer eine Hauptroute" / „Neuberechnungen … mutieren sie nie") × AD-11 („Zod-validiert beim Laden" — Fehlerfall ungeregelt).

**Das Paar:**

- **Unit A („kein Plan = kein Plan"):** `Erststart` = Zod-Parse des localStorage liefert `null` **oder schlägt fehl** → Plan verwerfen, beim nächsten Assessment Solver-Vorschlag adoptieren. Regelkonform („kein Plan vorhanden" — ein unparsebarer Plan ist keiner). Konsequenz: Ein Schema-Update per Redeploy **während des Törns** (Feature-complete ist der 7.8., der Törn startet am 8.8. — Nachschärfungen auf See sind der erwartbare Fall) wirft alle Pins und Skipper-Entscheidungen weg und ersetzt sie **stumm** durch den Solver-Plan. Der Skipper bemerkt es nicht einmal — es „gibt ja immer eine Hauptroute".
- **Unit B („Parse-Fehler ist ein Zustand"):** Analog zur AD-4-Toleranzregel für Firestore („nie stumm ausgeblendet") wird ein invalider Plan tag-weise tolerant geparst; unrettbare Tage werden `unbewertet`, der Skipper bestätigt den Reset explizit. Ebenfalls regelkonform — AD-4 gilt wörtlich nur für Firestore-Dokumente, verbietet Unit B aber nichts.
- **Zweite Divergenz im selben Loch:** Wer dispatcht die Adoption? Sie ist zwingend eine **durch eine Neuberechnung ausgelöste Plan-Mutation** — genau das, was AD-12 einen Satz vorher kategorisch ausschließt. Unit A liest die Erststart-Klausel als *einmalige* Ausnahme (Flag „adopted once"), Unit B als *zustandsbasierte* („immer wenn kein Plan da ist") — Unit B re-adoptiert damit auch nach jedem Storage-Verlust/Private-Mode/Zweitgerät bei jedem Refresh aufs Neue, solange Persistenz fehlschlägt.

**Verletzte Erwartung:** „Der Solver überschreibt nie stumm" (Titel von AD-12) — über den Parse-Fehler-Pfad tut er in Unit A genau das.

**Vorgeschlagene Schärfung (AD-11/AD-12):** *„Der persistierte Plan trägt `schemaVersion`. Parse-Fehler beim Laden ist ein benannter Zustand `planUnreadable` — nie stiller Reset: die UI zeigt ihn an, die Adoption des Solver-Vorschlags erfordert dann eine explizite Bestätigung (Check-in-Semantik). Automatische Adoption gibt es genau einmal: beim allerersten erfolgreichen Assessment, wenn noch nie ein Plan persistiert wurde (`null`, nicht ‚invalid'). Sie ist die einzige planverändernde Reaktion auf ein Assessment und läuft als enumerierte Aktion `ADOPT_INITIAL` durch den Reducer."*

---

## Loch 5 — Plan referenziert Leg-IDs, die die Bibliothek nicht mehr kennt (Schweregrad: MITTEL)

**Fundstelle:** AD-12 (Stage = Leg-*Referenz*, in localStorage) × AD-4/AD-5 (Legs leben in Firestore, Seeding reimportiert; „Die Saronische Alternative … wird aus dem Seed entfernt" — Löschungen sind also der vorgesehene Normalfall, nicht Theorie) × Konventionen-Tabelle (`unbewertet` „für fehlende Daten/Parse-Fehler").

**Das Paar:**

- **Unit A:** Eine Stage mit unbekannter `legId` ist ein Datenfehler → Stage `unbewertet` (Konventionstabelle wörtlich), Plan bleibt bestehen. Aber: **Die Rest-Trip-Ampel hat für diesen Fall keinen definierten Wert** — FR2 kennt nur Grün (gültig)/Gelb (Kriterien verletzt oder Horizont)/Rot (nichts existiert); „Stage nicht bewertbar wegen Datenlücke" ist weder „verletzt Kriterien" noch „Horizont". Unit A wählt Gelb.
- **Unit B:** Ein Plan mit toter Referenz ist als Ganzes invalide (Zod-`refine` gegen die geladene Leg-Menge schlägt fehl) → Pfad aus Loch 4: Plan weg, Erststart-Adoption. Ebenfalls regelkonform — und der Reimport, der `saronisch--…`-Legs entfernt, löscht damit **rückwirkend die persistierte Hauptroute** eines Bestandsnutzers.

**Verletzte Erwartung:** Referenz-Integrität zwischen der einzigen Schreib-Domäne (Seeding→Firestore) und der einzigen App-Persistenz (Plan→localStorage) ist von niemandem verantwortet; „IDs sind stabil, nie umbenennen" deckt Umbenennung, nicht Löschung.

**Vorgeschlagene Schärfung (AD-12 + Konventionen):** *„Leg-Referenzen im Plan werden beim Laden gegen die geladene Bibliothek aufgelöst; eine tote Referenz macht die Stage `unbewertet` und pinnt sie implizit NICHT — der Plan als Ganzes bleibt bestehen. Rest-Trip-Ampel-Erweiterung: enthält die Hauptroute eine `unbewertet`e Stage aus Datenlücke, gilt die Gelb-Klausel (Hauptroute nicht als gültig nachweisbar), Existenzprädikat wie Loch 2. Seeding-Regel: Ein Import, der Leg-IDs entfernt, listet sie im Review-Markdown als BREAKING."*

---

## Loch 6 — FR31-Pickup: „am 15.8. erreicht" hat keine Uhrzeit und keinen festen Bezugstag (Schweregrad: HOCH)

**Fundstelle:** AD-13 Gültigkeit (3): „am 15.8. ist ein fähre-erreichbarer Pickup-Hafen erreicht (FR31, hart)" × AD-12: „Hafentag … Default 15.8. … der Solver darf ihn verschieben" × AD-4: Pickup-Fähigkeit als statisches Insel-Attribut.

**Das Paar:**

- **Unit A („Kalendertags-Lesart, Ankunft egal"):** Bedingung (3) = am Ende des `legWindow` des 15.8. liegt das Boot in einem Hafen einer Insel mit Pickup-Attribut. Der Solver darf also den Hafentag auf den 13.8. verschieben und am 15.8. eine **volle Segeletappe** planen, die um 18:30 im Pickup-Hafen ankommt — Gäste, die mittags in Santorin landen, warten den halben Tag oder die letzte Fähre ist weg. Niemand prüft die Uhrzeit: das Insel-Attribut ist statisch (AD-4), Fährzeiten sind explizit deferred, und AD-13 sagt nur „am 15.8. erreicht". Plan: **gültig**.
- **Unit B („Liegetags-Lesart"):** „Am 15.8. — dem Puffer-/Hafentag — **liegt** das Schiff" (PRD-FR31 wörtlich) = der Pickup-Hafen ist spätestens mit der `nightWindow` des **14.8.** bezogen; der 15.8. ist etappenfrei am Pickup-Hafen. Derselbe Unit-A-Plan: **ungültig** → Relaxation → Rot.
- **Zweite Divergenz:** AD-12 erlaubt das Verschieben des Hafentags, PRD-FR31 setzt „15.8. = Hafentag" gleich. Unit A koppelt die Pickup-Prüfung an den (verschobenen) Hafentag (prüft also am 13.8. — falsche Insel, falscher Tag), Unit B an den Kalendertag 15.8. Beide können sich auf eine Quelle berufen.

**Verletzte Erwartung:** Eine „harte Bedingung" muss ein entscheidbares Prädikat sein; hier variiert zwischen zwei Solvern, *welcher Tag*, *welche Uhrzeit* und *welcher Anker (Hafentag vs. Kalendertag)* geprüft wird — mit Gültig/Rot-Flip.

**Vorgeschlagene Schärfung (AD-13 (3)):** *„Pickup-Prädikat normativ: Die Stage, deren Ankunft die `nightWindow(N)` des 14.8. eröffnet (bzw. ein früherer Tag), endet an einem Platz einer Insel mit Pickup-Attribut, und Tag 15.8. ist im Plan etappenfrei an diesem Platz ODER seine Etappe endet dort vor `pickupLatestArrival` (config, Default 18:00 Athens `[ANNAHME: mit Fährzeiten kalibrieren]`). Das Prädikat bindet an den Kalendertag 15.8., NICHT an den (verschiebbaren) Hafentag; verschiebt der Solver den Hafentag weg vom 15.8., bleibt (3) unverändert bindend."*

---

## Loch 7 — Etappen-Nummer vs. Törntag: Karte und Tagesansicht können verschieden zählen (Schweregrad: MITTEL)

**Fundstelle:** AD-12 (`Plan = PlanDay[1..12]`, 11 Stages + 1 verschiebbarer Hafentag) × FR2 („jede der 11 Etappen trägt ihre Etappen-Nummer am Tagesziel … Endhafen Alimos = ‚11'") × AD-2 („Auswahl, Rangfolge und Aggregation über Fachwerte sind Domänenlogik").

**Das Paar:**

- **Unit A (MapView):** Etappen-Nummer = Ordinalzahl **unter den Stages** (Hafentag herausgefiltert), damit Alimos garantiert die „11" trägt (FR2 wörtlich). Liegt der Hafentag auf Törntag 8, trägt das Ziel von Törntag 9 die Nummer **8**.
- **Unit B (DayView):** Beschriftet die Etappen-Card mit dem **Törntag** (Array-Index des `PlanDay`), also **9** für dieselbe Etappe — für den Skipper die natürliche Sprache („was fahren wir am Tag 9?").
- **Inkompatibilität:** FR4 verlangt Hover-Synchronität Itinerar↔Karte; „Etappe 8" bezeichnet auf der Karte und in der Tagesansicht zwei verschiedene physische Etappen, sobald der Hafentag nicht am Törnende liegt. Beide Units sind regelkonform, weil die Nummerierung nirgends als Domänenfunktion definiert ist — und weil beide sie in der View berechnen (was AD-2 dem Buchstaben nach zulässt, solange man Nummerierung als „Präsentation" deklariert, dem Geist nach aber nicht: es ist Aggregation über Fachwerte).

**Verletzte Erwartung:** Ein Fachwert („Etappe N"), zwei Ableitungen in zwei Views — der klassische AD-2-Prevents-Fall, nur unterhalb der Sichtbarkeitsschwelle des Spine.

**Vorgeschlagene Schärfung (AD-12 oder AD-9):** *„`domain/plan.ts` (oder schema) exportiert die einzige Nummerierungsfunktion `stageNumber(plan, day): number | null` (null am Hafentag): Etappen-Nummern sind Ordinalzahlen über Stages in Tagesreihenfolge, 1..11, unabhängig von der Hafentag-Position. Views zeigen Etappen-Nummer UND Törntag stets als Paar (‚Etappe 8 · Törntag 9'); keine View zählt selbst."*

---

## Loch 8 — `toPlaceId`: Solver-gefüllt (friert ein) oder leer (morpht) — die Platz-Ebene der Hauptroute hat keinen Owner (Schweregrad: MITTEL)

**Fundstelle:** AD-12 (Stage: „optional gewählter Platz", `toPlaceId?`) × AD-3 (`bestPlace(insel, nachtN)` kommt aus dem Assessment) × AD-12 („Neuberechnungen mutieren die Hauptroute nie").

**Das Paar:**

- **Unit A:** Der Solver füllt `toPlaceId` immer (= `bestPlace` zum Rechenzeitpunkt), denn die Platzwahl ist Fachauswahl und gehört in die Domäne (AD-2). Konsequenz: Der Platz ist Teil des persistierten Plans, und da Neuberechnungen nie mutieren, zeigt die DayView drei Tage später noch den Platz, der **beim alten Forecast** der beste war — inklusive inzwischen roter Ampel — obwohl nebenan ein grüner liegt. Der Skipper muss jeden Platz-Wechsel als FR28-Edit vollziehen (und pinnt damit den Tag!).
- **Unit B:** Der Solver lässt `toPlaceId` leer (nur der Skipper setzt Plätze); die UI rendert für leere Stages `bestPlace(insel, nachtN)` aus dem **aktuellen** Assessment. Konsequenz: Der angezeigte Zielhafen der Hauptroute **morpht bei jedem Refresh** — genau das „stumme Morphen", das AD-12 auf Routen-Ebene verbietet, findet auf Platz-Ebene statt; Karte (Marker/Overlay-Endpunkt) und ein zwischengespeicherter Screenshot/Abendcheck divergieren.
- **Inkompatibilität:** Beide regelkonform (das `?` erlaubt beides), aber die persistierten Plan-Daten der beiden Units sind formverschieden (immer-gefüllt vs. nur-bei-Skipper-Wahl) und die FR28-Editsemantik („anderen Hafen festlegen") trifft auf zwei verschiedene Ausgangszustände. Zudem offen, ob eine Nacht-Ampel „Rot am gewählten Platz" die Stage-Gültigkeit berührt — die normative Dreierliste in AD-13 sagt nein, was Unit A zu „Plan grün, Nächte rot" führt.

**Verletzte Erwartung:** „Zwei Owner derselben Entität" (AD-5-Prevents-Formulierung) — hier: die Platz-Dimension der Stage, zwischen persistiertem Plan und flüchtigem Assessment.

**Vorgeschlagene Schärfung (AD-12):** *„`toPlaceId` ist ausschließlich Skipper-gesetzt (FR28-Edit auf Platz-Ebene pinnt den Tag). Solver-Stages tragen nie einen Platz; die Anzeige leerer Stages ist normativ `bestPlace(insel, nachtN)` aus dem aktuellen Assessment und wird als ‚Vorschlag (aktueller Stand)' gekennzeichnet — das Morphen ist damit deklariert, nicht stumm. Ein Skipper-gesetzter Platz mit roter Nacht-Ampel macht die Stage nicht ungültig, erzeugt aber zwingend FR2-Gelb-Anzeige am Tag `[Entscheid nötig — Alternative: Bedingung (1') der Gültigkeit]`."*

---

## Verworfen (kein Loch)

- **GPS vs. manuelle Position:** AD-11 regelt die Präzedenz vollständig (`manual` gewinnt bis explizites Lösen) — keine zwei Bauweisen konstruierbar.
- **Doppelter Polar-Offset / Rebasing:** AD-10 lokalisiert beides eindeutig („einzig in `domain/polar.ts`", „ausschließlich fertig Alimos-normalisiert") — dicht.
- **Zweiter Hafentag per Edit („heute bleiben wir"):** AD-12 sagt „genau einer" — eine Unit, die einen zweiten zulässt, wäre nicht regelkonform. Dass FR28 damit den im Feldtest-Review empfohlenen „Bleiben"-Edit nicht abbilden kann, ist eine PRD-Spine-Spannungsanzeige, kein Divergenz-Loch — als Hinweis notiert.
- **Athens/UTC-Fensterrechnung:** AD-9 mit genau einer Übersetzungsfunktion ist dicht.

## Zusammenfassung

| # | Loch | Schweregrad | Zu schärfen |
| --- | --- | --- | --- |
| 1 | EDIT_STAGE-Vervollständigung: sync im Reducer vs. async übers Assessment | HOCH | AD-12 (+AD-3) |
| 2 | FR2-Gelb-Existenzprädikat: DP-Suchraum vs. Alternativen-Liste; Pins binden vs. lösen | KRITISCH | AD-13 |
| 3 | Gültigkeit: Rückkehrfenster-Regel & Worst-Case-Horizont als Constraint vs. Score | KRITISCH | AD-13 |
| 4 | Erststart-Adoption × Parse-Fehler: stiller Planverlust vs. benannter Fehlzustand | HOCH | AD-11/AD-12 |
| 5 | Tote Leg-Referenzen im persistierten Plan nach Reimport | MITTEL | AD-12 + Konventionen |
| 6 | FR31-Pickup: Bezugstag (Hafentag vs. 15.8.) und Ankunftszeit unentscheidbar | HOCH | AD-13 (3) |
| 7 | Etappen-Nummer vs. Törntag bei verschobenem Hafentag (Karte ≠ Tagesansicht) | MITTEL | AD-12/AD-2 |
| 8 | `toPlaceId`-Ownership: eingefrorener vs. morphender Zielplatz | MITTEL | AD-12 |
