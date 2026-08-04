---
title: "PRD: sailgreece-router"
status: final
created: 2026-07-30
updated: 2026-08-02
---

# PRD: sailgreece-router

**Törnplanungs-Web-App für den Kykladen-Familientörn 8.–19. August 2026 — 11 Etappen
ab und bis Marina Alimos.** Die App plant täglich den vollständigen Round-Trip neu —
sie ersetzt das Kopfrechnen des Skippers, nicht sein seemännisches Urteil.

*Revision 2026-08-02: Feldtest-Feedback eingearbeitet — Round-Trip-Planungslogik,
Rückkehrfenster-Strategie, Etappen-Editing, Gäste-Pickup, Karten-Overlay,
UI-Bereinigung (Quelle: Feedback-PDF „App sailgreece-router refinment", 2026-08-02).*

## 1. Problem & Kontext

Am 8. August 2026 (Samstagnachmittag) startet ein Törn mit einem 50-Fuß-Katamaran ab
Marina Alimos (Athen) in die Kykladen, Rückkehr am Mittwochnachmittag, 19. August —
12 Törntage, 11 Etappen plus ein frei platzierbarer Puffer-/Hafentag, mitten in der
Meltemi-Hochsaison (regelmäßig 6–8 Bft aus N–NE).
Ziel des Törns sind **schöne Plätze**: schöne Häfen und vor allem schöne Buchten — mit
gutem Restaurant, Badestrand und nachts wind- und wellengeschütztem Ankerplatz. So weit
wie möglich nach Süden (maximal Amorgos oder Santorin), ohne den Kindern den Törn durch
brutales Aufkreuzen bei über 30 Knoten zu verderben.
Kritisch ist der Rückweg gegen den Meltemi: Bei starkem Nordwind ist der Rückweg mit
einem Katamaran gegen 35 kn nicht erkreuzbar — der Weg nach Norden kann tagelang
verbaut sein. Faustregel des Reviers: **zwei Drittel der Zeit für den Rückweg**
einplanen, bzw. die Hälfte der Strecke muss im ersten Drittel der Zeit geschafft sein.
Eine Törnplanung im Saronischen Golf ist keine Option — geplant wird ausschließlich
der Kykladen-Round-Trip.

Das Wissen dafür ist verfügbar — Revierliteratur, Best-Practice-Routen,
Windvorhersagen. Einen fertigen Törnplan, den man nur abfahren könnte, gibt
es aber nicht, und die App setzt auch keinen voraus: Der Round-Trip muss jeden Tag
neu aus den noch offenen Optionen abgeleitet werden. Genau diese Arbeit —
**die tägliche Übersetzung von Vorhersage in Entscheidung — passiert heute komplett im
Kopf des Skippers**: Distanzen × Geschwindigkeit × Windwinkel × Restzeit, morgens und
abends neu. Diese Kaskade ist von Tag 1 an anspruchsvoll — schon die erste Frage
(„Fahren wir direkt nach Hydra oder lassen wir es weg?") hängt an ihr — und sie muss
über zwölf Tage exakt geplant und mit jedem Forecast-Lauf konsistent aktualisiert
werden. Im Kopf ist das fehleranfällig.

**Marktlücke (Landschafts-Recherche 2026-07-30):** Kein existierendes Tool kombiniert
Etappen-Scoring, Ankerplatz-Schutzampel und Umkehrpunkt-Logik. Navily bewertet
Ankerplatz-Schutz (nur 72 h, kein Routing), PredictWind/savvy navvy routen Einzelpassagen
(kein Mehrtages-Optionsraum), Windy zeigt Modelle ohne Interpretation. Einen Predicted
Point of Return für Charter-Rückgabetermine bietet niemand.

## 2. Ziele & Erfolgskriterien

**Produktziel:** Skipper und Crew sehen jeden Morgen und Abend auf einen Blick, welche
Tagesziele schön, nachts geschützt und mit einem tragfähigen Round-Trip (sichere
Rückkehr nach Alimos) vereinbar
sind — und welche Routen-Optionen sich öffnen oder schließen.

Erfolgskriterien:

- **E1 — Tägliche reale Nutzung:** Das Tool wird auf dem Törn täglich für die
  Morgen-/Abendentscheidung genutzt und ersetzt das Kopfrechnen. `[ANNAHME]` aus dem
  Brief übernommen.
- **E2 — Rechtzeitig fertig:** Nutzbares Tool zum Törnstart am 8. August (9 Tage
  Entwicklungszeit). Erste reale Nutzung ist die Morgenentscheidung am Samstag —
  einen separaten Routing-Vorentscheid Tage vorher gibt es nicht.
- **E3 — Vertrauenswürdige Daten:** Alle Schutzprofile und Routen stammen aus
  verlässlichen Quellen (Heikell, CruisersWiki u. a.), nichts ist erfunden; Philipp hat
  die Daten einmal reviewt.

**Gegen-Metriken (was Erfolg nicht heißen darf):**

- Das Tool wird nicht zur alleinigen Entscheidungsquelle: Windy und das seemännische
  Urteil bleiben parallel im Einsatz; die App trifft keine Entscheidungen, sie rechnet
  und vergleicht.
- Termindruck darf nicht zu ungeprüften Schutzprofilen führen — lieber weniger Plätze,
  aber jede Ampel quellenbasiert (sicherheitsrelevant).

## 3. Nutzer & Nutzungsmomente

Einziger Nutzer im MVP ist **Philipp als Skipper** — am PC und am Handy (Web-App im
Browser), mit Internetverbindung, die Karte als Besprechungsbild im Gespräch mit der
Crew.

- **UM-1 Morgenentscheidung (täglich, ~10 min):** Philipp öffnet die App im Hafen/vor
  Anker — allein oder mit der Crew als Besprechungsbild. Position (GPS, einmalig beim
  App-Start, FR27) und Törntag (aus dem Datum, FR32) kennt die App selbst. Sie zeigt:
  den aktuell berechneten Round-Trip mit der heutigen Etappe, Ziel-Ampeln der Häfen
  auf aktueller und Ziel-Insel, den Zustand des Rückkehrfensters und den Point of
  Return — daraus entsteht die gemeinsame Entscheidung für das Heute; bei Bedarf
  editiert Philipp die Etappe oder checkt eine Alternativ-Route ein.
- **UM-2 Abendcheck (täglich, ~5 min):** Nach dem neuen Forecast-Lauf prüft Philipp, ob
  der Round-Trip noch trägt — bestätigt die App den Kurs, ist der Abend frei; kippt
  das Rückkehrfenster oder eine Etappe, sieht er es hier zuerst (Rest-Trip färbt
  gelb/rot, FR2).

## 4. Kernkonzept: Der Round-Trip ist die Planungseinheit

Der Kernsatz des Produkts: **Die App plant immer den vollständigen Round-Trip** —
Abfahrt Alimos Samstagnachmittag 8.8., Rückkehr Alimos Mittwochnachmittag 19.8.:
12 Törntage, 11 nummerierte Etappen plus **ein Puffer-/Hafentag am 15.8.** — dem
Gäste-Zustiegstag (FR31); die App kann ihn bei Bedarf umplanen, wenn das
Rückkehrfenster es erzwingt. Nie
Segmente, nie Teilpläne: Jeder Vorschlag und jede Bewertung bezieht sich auf den
ganzen Rest-Trip bis zurück nach Alimos.

1. **Round-Trip-Plan (Hauptroute)** — die aktuell verfolgte Etappenfolge über alle
   Resttage, zusammengesetzt aus dem Möglichkeitsraum der Best-Practice-Routen (FR9),
   täglich neu berechnet aus Position, Törntag und Forecast (FR18).
2. **Rückkehrfenster-Strategie** — wie weit es nach Süden geht (maximal Santorin
   und/oder Amorgos; Wunschbild: Santorin am 15.8., Amorgos am 14.8.), entscheidet
   **ausschließlich das Wetterfenster für die Nord-Rückkehr** gegen den Meltemi:
   - Zeigt der Forecast an Tag 1 ein Nordfenster (z. B. Tag 5–8), plant die App
     dessen Nutzung fest ein — am Ende des Fensters muss ein Hafen erreicht sein,
     von dem aus Alimos in den Resttagen **auch bei vollem Meltemi** erreichbar ist.
   - Zeigt der Forecast **kein** Fenster, wird konservativ geplant: so, dass die
     Rückkehr auch bei durchgehendem Meltemi über alle Resttage gelingt. Öffnet sich
     später doch ein Fenster, rechnet die App ab dann die verbleibenden
     Süd-Optionen neu.
   - Das Fenster wird täglich neu bewertet — es wird besser, schlechter oder
     verschiebt sich; der Round-Trip folgt.
3. **Tagesentscheidung** — die Morgen-/Abendroutine: „Was machen wir heute?" Die
   heutige Etappe der Hauptroute, editierbar (FR28) und gegen Alternativ-Routen
   vergleichbar (FR29).

**Tagesziele sind Inseln — Plätze werden dort gewählt.** So denkt der Segler, und so
routet die App: Man entscheidet „Wir fahren heute nach Sifnos", und dort stellt sich
die zweite Frage — welche Buchten und Häfen hat die Insel, und welcher davon ist heute
Nacht der beste (Schutzampel, Qualitäten)? Die geschützte Traumbucht bleibt das
Sehnsuchtsziel, gefunden wird sie zweistufig: **erst Insel (Routing), dann Platz
(Ampel).** Abgewogen werden ausschließlich Entfernungen, Wind und Welle (Richtung und
Stärke), Segeldauer pro Etappe sowie Round-Trip und Tagesplan. Der Skipper
entscheidet, die App rechnet und vergleicht.

**Begriffe** (durchgängig so verwendet): **Tagesziel** = Insel; dort wird der beste
Platz gewählt · **Platz** = Bucht, Ankerplatz oder Hafen mit Qualitäten und
Schutzprofil · **Etappe** = Schlag von Insel zu Insel (konkret: von Platz zu Platz),
im Round-Trip nummeriert 1–11 · **Round-Trip** = vollständige Etappenfolge Alimos →
Süden → Alimos über alle Resttage · **Hauptroute** = der aktuell verfolgte
(eingecheckte) Round-Trip · **Alternativ-Route** = auswählbarer alternativer
Round-Trip; per Check-in wird sie zur neuen Hauptroute (FR29) ·
**Routen-Option** = kuratierte Best-Practice-Etappenfolge aus der Routenbibliothek,
Baustein des Round-Trips · **Möglichkeitsraum** (synonym: Optionsraum) = Menge aller
Routen-Optionen · **Rückkehrfenster** = Zeitraum mit Wind, der die Nord-Rückkehr
innerhalb der Schwellen (FR16) erlaubt · **Point of Return** (synonym: Umkehrpunkt)
= letzter Törntag/Ort, an dem noch umgekehrt werden kann, um die Basis rechtzeitig
zu erreichen · **Ampel** = deterministische Rot/Gelb/Grün-Bewertung; je Platz
(„Ziel-Ampel", FR8), je Etappe/Option (FR17) und je Rest-Trip (FR2).

## 5. Funktionale Anforderungen

### F1 — Karte & Besprechungsbild

- **FR1:** Google-Maps-Karte des Reviers (Kykladen-Korridor bis Amorgos/Santorin) mit
  den Plätzen der Bibliothek als Marker. **Ampel-Marker erscheinen nur für die
  aktuelle Insel/Position und die Ziel-Insel der heutigen Etappe** — nicht für den
  ganzen Trip (Karten-Entlastung: relevant ist, welchen Hafen ich heute anlaufe,
  nicht was in fünf Tagen ist). Satellit/Hybrid-Ansicht verfügbar (Buchten-Optik).
- **FR2:** **Round-Trip-Overlay:** Die Hauptroute liegt vollständig auf der Karte —
  die bereits zurückgelegte Strecke als **durchgezogene grüne Linie**, der geplante
  Rest-Trip als **gestrichelte Linie**; jede der 11 Etappen trägt ihre Etappen-Nummer
  am Tagesziel (Ziel-Insel Tag 1 = „1", Endhafen Alimos = „11"). Die
  **Rest-Trip-Ampel** der gestrichelten Linie ist deterministisch definiert:
  **Grün** = die Hauptroute ist gültig (FR18). **Gelb** = die Hauptroute verletzt
  in aktueller Form die Kriterien oder hängt von unbewertetem Forecast-Horizont ab,
  aber mindestens ein gültiger alternativer Round-Trip existiert (FR29). **Rot** =
  es existiert kein gültiger Round-Trip mehr (das FR18-Verhalten „am wenigsten
  verletzender Vorschlag" greift). Auslöser sind immer Neuberechnungen —
  Forecast-Verschlechterung, manuelle Etappen-Änderung (FR28) oder der bisherige
  Trip-Verlauf.
- **FR3:** Windpfeil-Overlay (Richtung und Stärke je Wegpunkt/Platz) aus dem
  Basis-Wettermodell (FR11).
- **FR4:** Itinerar ↔ Karte synchron: Hover/Auswahl eines Tages oder einer Etappe hebt
  das Gegenstück auf der Karte hervor (Design-Referenz: Y.CO-Itinerary, siehe NFR1).
- **FR5:** Platz-Detailansicht: Foto, Qualitäten (Schönheit, Restaurant, Badestrand),
  Schutzprofil und die daraus berechnete Ampel für die kommende Nacht. **Jeder Hafen
  in den Etappen-Cards ist per Mouseover/Klick mit allen verfügbaren Meta-Informationen
  aus Recherche und Routing hinterlegt** (geschützt für welche Windrichtungen,
  Ankerplätze, Einkaufs- und Tankmöglichkeiten etc.). Die Ampel gehört immer zum
  **konkreten Platz/Hafen**, nie zur Insel als Ganzes.

### F2 — Platzbibliothek

- **FR6:** Datenbankgestützte Bibliothek der Plätze des Törn-Korridors, **organisiert
  je Insel**. Größenordnung offen: bei ~10 Inseln mit je 10–15 Buchten/Häfen können es
  **100–150 Plätze** werden — die Kuration priorisiert je Insel die besten Plätze und
  wächst iterativ; jeder importierte Platz vollständig (NFR6). Je Platz: Koordinaten,
  Typ (Hafen/Bucht/Marina), Qualitäten (Schönheit, Restaurant, Badestrand), Foto
  `[ANNAHME: Fotoquelle wird bei der Kuration lizenzsauber mitrecherchiert]`.
  Bewusst schlank: keine Auslastungs-, Engpass- oder Logistik-Attribute (siehe §7).
- **FR7:** Schutzprofil je Platz: geschützte Wind- und Wellenrichtungssektoren mit
  Stärkegrenzen, quellenbasiert kuratiert (Heikell, CruisersWiki), ergänzt um die
  universelle Regel „Lee ist immer geschützt, Luv nie".
- **FR8:** Deterministische **Rot/Gelb/Grün-Ampel** je Platz: Forecast (Wind + Welle)
  gemappt auf das Schutzprofil, bewertet über das Übernachtungszeitfenster
  `[ANNAHME: 18:00–09:00 Ortszeit]`.

### F3 — Routenbibliothek

- **FR9:** Kuratierte Best-Practice-Routen als Möglichkeitsraum: Etappenfolgen **von
  Insel zu Insel** mit Distanzen (sm) — je Insel verweist die Bibliothek auf ihre
  kuratierten Plätze (FR6); keine frei erfundenen Routen. Das Routing verläuft
  **entlang der vordefinierten Rundrouten-Varianten** (Westkykladen-Runde über
  Kea–Kythnos–Serifos–Sifnos–Milos–Paros–Syros und Ostkykladen-Runde über
  Syros–Tinos–Mykonos–Paros–Ios–Santorin–Folegandros–Milos; vollständige
  Etappenlisten mit Distanzen: siehe `addendum.md`), mit Verlängerungsoptionen
  Amorgos/Santorin, gedeckelten Varianten (z. B. bis Paros/Antiparos) und der
  Rückfallhäfen-Kette westwärts als Eskalationsstufen: Verschärft sich der Forecast,
  bietet die App die nächstkonservativere Stufe als natürliche Alternative an.
  **Der Saronische Golf ist keine Routen-Option** — gestrichen (Feldtest-Entscheidung
  2026-08-02); geplant wird ausschließlich der Kykladen-Round-Trip.
- **FR10:** Etappen tragen statische Warn-Attribute — unabhängig vom Modellwert — für
  bekannte Düsen-/Beschleunigungszonen (Kea-Kanal, Kafireas, Andros/Tinos-Sektor,
  Paros–Antiparos, Paros–Naxos, Mykonos–Paros): reine Wind-Planungsinformation, weil
  Wettermodelle diese Zonen glätten. Navigationsgefahren (Wracks, Untiefen, Fallwinde)
  bleiben bewusst außen vor — Domäne von Seekarte und Plotter (siehe §7).

### F4 — Forecast-Integration

- **FR11:** Open-Meteo Forecast-API: Wind 10 m, Böen, Richtung aus **einem
  Basis-Wettermodell** (Default ECMWF; Modellwahl als Konfigurationsparameter, z. B.
  ICON-EU ~7 km für höhere Auflösung in den Kanälen). Bewusst **kein
  Multi-Modell-Vergleich in der App** — Modell-Konsens prüft der Skipper weiterhin
  parallel in Windy (siehe §7).
- **FR12:** Open-Meteo Marine-API: Wellenhöhe, -richtung, -periode inkl. Swell für die
  Schutzprofil-Prüfung.
- **FR13:** Client-Caching der Antworten (TTL 1–3 h); der Datenstand (Modelllauf,
  Abrufzeit) ist in der UI sichtbar.
- **FR14:** *Gestrichen (Scope-Entscheidung 2026-07-30):* Multi-Modell-Vergleich in
  der App entfällt — ein Basis-Modell genügt (FR11), Modell-Konsens läuft über Windy.
  ID bleibt reserviert.

### F5 — Etappen-Scoring

- **FR15:** Jede Etappe jeder offenen Routen-Option wird gegen die Vorhersage zum
  geplanten Zeitfenster `[ANNAHME: Standard-Abfahrt 09:00 Ortszeit, konfigurierbar]`
  bewertet. „Geplantes Zeitfenster" heißt: Für eine Etappe an Törntag N+3 zählt die
  Prognose für **genau diesen künftigen Tag und diese Uhrzeit** (wie das Vorspulen in
  Windy) — nie der heutige Wind. Bewertet wird: Windwinkel zum Kurs, Windstärke, Dauer aus dem
  hinterlegten **Polardiagramm** (FR26 — Geschwindigkeit als Funktion von wahrem
  Windwinkel und Windstärke); Motorfahrt mit ~8 kn als eigener Parameter.
- **FR16:** Familien-Schwellen sind explizit und im Scoring verdrahtet: **keine
  Schläge höher als 65° gegen den wahren Wind bei über 25 kn** (die harte
  Rückkehr-Bedingung — was darüber liegt, gilt als nicht erkreuzbar). Tagesbudget:
  **Ziel maximal ~6 Stunden unterwegs** (5 h Segeln + 1 h Motor oder 6 h reines
  Segeln), **grundsätzlich nicht länger als 6–7 h pro Tag** (keine Gewaltmärsche),
  hartes Maximum 6 h Segeln + 2 h Motor. **Nachtetappen** nur, wenn strategisch
  zwingend — für die Nord-Rückkehr wegen Meltemi oder um Santorin/Amorgos zu
  erreichen —, **nur bei Wind unter 10 kn**, nur in der zweiten Woche und **maximal
  2× in 11 Tagen** (glattes Wasser, ob Segeln oder Motoren ist dann egal, die
  Familie schläft).
- **FR17:** Ampel je Etappe plus aggregierte Bewertung je Routen-Option = die Ampel der
  schwächsten Etappe (schwächstes Glied sichtbar). Ampelbänder: **Grün** = Ziel-Budget
  eingehalten (FR16), **Gelb** = zwischen Ziel und hartem Maximum oder Grenzwert
  tangiert (z. B. Wind nahe 25 kn gegenan), **Rot** = hartes Maximum oder
  Aufkreuz-Schwelle verletzt. `[ANNAHME: Wind-Reserve der Bänder kalibrieren wir beim
  Bauen]`
- **FR26:** Die App hinterlegt das **Polardiagramm** (Fountaine Pajot 45,
  WindySail-Export, siehe `inputs/` im PRD-Workspace) als Grundlage aller
  Geschwindigkeits- und Dauerberechnungen. Das gecharterte Schiff (Fountaine Pajot
  Saona) ist im Schnitt **0,5 kn schneller** — die App rechnet mit Polare
  **+ 0,5 kn Offset** (als Parameter konfigurierbar). Die pauschalen
  Planungsgeschwindigkeiten (6,0 kn Segel / 7,5 kn Maschine / 6,5 kn gegenan) bleiben
  nur als Fallback, solange keine Polare geladen ist.
  *(ID nachgereicht — Nummerierung bleibt stabil.)*
- **FR30 — Etappen-Transparenz:** Jede Etappen-Card weist nachvollziehbar aus, wie
  ihre Segelzeit zustande kommt: Ist die Distanz die direkte Strecke oder führt sie
  über Wegpunkte? Welche Segmente mit welchem Wind (Stärke/Richtung), welchem
  Windwinkel zum Kurs und welcher Bootsgeschwindigkeit aus der Polare? Reine
  Segelzeit vs. Gesamtzeit (inkl. Motoranteil) getrennt sichtbar. Eine Zeitangabe
  wie „3,1 h für 17 sm" muss aus der Card heraus erklärbar sein — sonst vertraut
  der Skipper der Rechnung nicht. *(Neu aus Feldtest 2026-08-02.)*

### F6 — Round-Trip-Planung, Rückkehrfenster & Predicted Point of Return

- **FR18 — Täglicher Round-Trip:** Aus aktueller Position, Törntag (FR32) und
  Forecast berechnet die App täglich den **vollständigen Rest-Trip bis Alimos** als
  Hauptroute — 11 Etappen minus die bereits gefahrenen, entlang der
  Rundrouten-Varianten (FR9). Gültig ist ein Round-Trip nur, wenn (1) jede Etappe
  innerhalb der Familien-Schwellen (FR16, Dauer aus Polare + Offset) liegt,
  (2) die Rückkehr nach Alimos die Deadline hält — **Mittwochnachmittag 19.8.**
  `[ANNAHME: 18:00, vertraglich bestätigen]`, dieselbe Konstante wie in der
  Point-of-Return-Rechnung (FR19) — und (3) am 15.8. ein für die Gäste
  fähre-erreichbarer Pickup-Hafen erreicht ist (FR31, harte Bedingung). Der
  Möglichkeitsraum bleibt darunter sichtbar: Routen-Optionen werden weiter als
  **offen / schließt am Tag X / geschlossen** ausgewiesen, bevor sie sich schließen.
  **Etappen jenseits des Forecast-Horizonts** gelten als *unbewertet* — sie machen
  einen Round-Trip weder gültig noch ungültig; betroffene Optionen werden als
  „offen (Horizont)" mit Vorbehalt ausgewiesen, und für den Rückkehr-Check gilt
  ersatzweise das Meltemi-Worst-Case-Szenario (FR19). **Existiert kein gültiger
  Round-Trip**, schlägt die App dennoch den am wenigsten verletzenden vor, färbt
  den Rest-Trip rot (FR2) und benennt die verletzte Bedingung; relaxiert wird
  sichtbar und in fester Reihenfolge — erst Tagesbudget Richtung hartes Maximum,
  dann die Nachtetappen-Option (FR16) — **niemals** die 65°/25-kn-Schwelle.
  Alle Bewertungen sind **Momentaufnahmen des aktuellen Forecast-Laufs**: Scores,
  Optionszustände, Rückkehrfenster und Point of Return werden bei jedem Abruf (FR13)
  vollständig neu berechnet — was gestern „offen" war, kann heute „geschlossen"
  sein, und genau dafür gibt es die Morgen-/Abendroutine (UM-1/UM-2).
- **FR19 — Rückkehrfenster & Predicted Point of Return:** Die App erkennt im
  Forecast-Horizont **Wetterfenster für die Nord-Rückkehr** (Zeiträume, in denen die
  Rückkehr-Etappen innerhalb der FR16-Schwellen liegen) und plant deren Nutzung fest
  in den Round-Trip ein: Am Ende des Fensters muss ein Hafen erreicht sein, von dem
  aus Alimos in den verbleibenden Tagen **auch bei durchgehendem Meltemi** erreichbar
  ist. Zeigt der Forecast kein Fenster, plant die App konservativ (Rückkehr auch bei
  vollem Meltemi über alle Resttage gesichert) und rechnet Süd-Optionen neu, sobald
  sich eines öffnet. **„Durchgehender/voller Meltemi" ist dabei ein definiertes,
  konfigurierbares Worst-Case-Szenario** — kein vager Begriff: `[ANNAHME: Wind
  konstant 30 kn aus N–NE (0–45°) mit zugehöriger Welle; beim Bauen kalibrieren]`.
  Es greift überall dort, wo der Forecast-Horizont endet (FR18). Dazu fortlaufend
  der **Predicted Point of Return**: der späteste Umkehrpunkt für die stressfreie
  Rückkehr nach Alimos — gegen dieselbe Deadline wie FR18 (19.8. nachmittags),
  wobei der Puffer-/Hafentag (§4) die Reserve bildet; Restdistanz über die
  Rückfallhäfen-Kette vs. Resttage × Tagesbudget; Etappendauern wie im
  Etappen-Scoring aus der Polare (FR15/FR26).
- **FR20:** Aus Optionsraum und Point of Return leitet die App **Entscheidungspunkte**
  ab und macht sie sichtbar: an welchem Tag welche Frage entschieden sein muss, bevor
  die zugehörige Option verfällt (z. B. „Verlängerung nach Amorgos nur bei
  Doppel-Fenster für Hin- und Rückweg") — dynamisch berechnet, keine fest verdrahteten
  Kalender-Gates.
- **FR27:** Die App bestimmt die **aktuelle Position per GPS/Standortabfrage
  einmalig beim App-Start** (Browser-Geolocation, integriert mit der
  Google-Maps-Karte) — automatisch, **ohne eigenen Button**. Manuelles Übersteuern
  (Platz aus der Bibliothek wählen) bleibt als Fallback möglich, z. B. wenn der
  Browser den Standort nicht freigibt.
- **FR32 — Törntag-Automatik:** Die App kennt Start- (8.8.) und Endtag (19.8.) des
  Törns und leitet den aktuellen Törntag **selbst aus dem Datum ab** — keine
  manuelle Törntag-Eingabe, kein Auswahlelement. *(Neu aus Feldtest 2026-08-02.)*

### F7 — Tagesentscheidung & Round-Trip-Editing

- **FR21:** Morgen-/Abendansicht „Was machen wir heute?": die heutige Etappe der
  Hauptroute (**Ziel-Insel** mit ihren Häfen/Buchten und deren Ziel-Ampeln für die
  Nacht), Etappen-Score, Dauer (transparent nach FR30) und die Auswirkung auf den
  Rest-Trip. Es gibt **keine Header-Auswahlbox für Routen-Optionen** — es gibt die
  eine Hauptroute, editierbar über die Etappen-Cards (FR28) oder die
  Alternativ-Routen (FR29).
- **FR22:** Die App **schlägt den Round-Trip aktiv vor** (Feldtest-Entscheidung
  2026-08-02, ersetzt „empfiehlt nicht automatisch"), blendet aber nichts aus und
  entscheidet nichts: Der Skipper kann jeden Vorschlag ändern; die App rechnet,
  vergleicht und zeigt die Konsequenzen.
- **FR28 — Etappen-Editing:** Der Skipper kann **jede vorgeschlagene Etappe
  editieren** — für den jeweiligen Tag eine andere Insel oder einen anderen
  Hafen/Platz auf dieser Insel als Tagesziel festlegen. Nach jeder Änderung wird der
  **gesamte restliche Round-Trip neu berechnet** (inkl. Rückkehrfenster, Point of
  Return und Rest-Trip-Ampel FR2). *(Neu aus Feldtest 2026-08-02.)*
- **FR29 — Alternativ-Routen:** Ergänzend zur Hauptroute zeigt die App auf
  Anforderung eine **kleine, sinnvolle Zahl alternativer Round-Trips** (aus dem
  Möglichkeitsraum FR9). Eine Alternative wird erst angezeigt und dann vom Skipper
  explizit **eingecheckt** — damit wird sie zur neuen Hauptroute. *(Neu aus
  Feldtest 2026-08-02.)*
- **FR31 — Gäste-Pickup 15.8.:** Am Mittag des 15.8. landen zwei Gäste am
  Flughafen Santorin. **Harte Bedingung** jedes gültigen Round-Trips (FR18(3)):
  Am 15.8. — dem Puffer-/Hafentag (§4) — liegt das Schiff in einem Hafen, den die
  Gäste per Fähre ab Santorin erreichen können. **Weiche Präferenz** darüber:
  Pickup direkt auf Santorin — nur, wenn danach ein kriterienkonformer Rücktrip
  (FR16/FR19) bleibt; das ist nur bei optimalen Windbedingungen möglich, da es
  der 2/3-Rückweg-Faustregel widerspricht. Sonst gilt **jede fähre-erreichbare
  Insel als Pickup-Fallback** (z. B. Paros — Zustieg am Abend des 15.8. —, Naxos,
  Ios); die App schlägt den besten Pickup-Punkt vor. *(Neu aus Feldtest
  2026-08-02.)*

### F8 — Daten-Seeding & Kuration

- **FR23:** Die Bibliotheken (F2, F3) werden durch **KI-gestützte Recherche vollständig
  befüllt** — keine Handpflege durch Philipp. Quellen: Rod Heikell *Greek Waters
  Pilot*, CruisersWiki, sailingissues.com, Charter-Itineraries, dazu das
  **Detailmaterial des Product Briefs** (Hafenkatalog mit Koordinaten, Distanzen,
  Schutz- und Engpass-Hinweise) als Startbestand; Positions-Grundgerüst optional aus
  OSM/Overpass. Gegencheck: Navily/mySea. Lizenzgrenzen beachten: aus Heikell nur
  Fakten übernehmen (keine Texte/Pläne), CruisersWiki mit Attribution (CC).
- **FR24:** **Eine Review-Runde:** kompakte Abstimmungssicht der recherchierten Daten —
  Schutzprofile zuerst, denn sie sind sicherheitsrelevant. Philipp bestätigt oder
  korrigiert einmal, dann Import.
- **FR25:** Import mit Schema-Validierung und Normalisierung: Ortsschreibweisen
  (Merichas/Mericha u. ä.), abweichende Distanzangaben der Quellen auf einen
  Bezugspunkt vereinheitlicht — insbesondere **Basis-Rebasing auf Alimos** (viele
  Seed-Distanzen sind Lavrion-basiert; Rückweg-Distanzen Amorgos/Santorin → Alimos
  müssen ergänzt werden).

## 6. Nicht-funktionale Anforderungen

- **NFR0 — Leitprinzip „Reduce it to the max":** Jede Funktion und jedes UI-Element
  muss die Morgen-/Abendentscheidung direkt unterstützen — im Zweifel weglassen.
  Dieses Prinzip hat den Scope bereits geformt (ein Wettermodell statt drei, keine
  Hafen-Logistik, keine Gefahren-Datenbank, keine Notfall-Features) und gilt als
  Entscheidungsregel für alles, was während der Umsetzung dazukommen will.
- **NFR1 — Design-Anspruch:** Funktional zuerst, aber gestalterisch hochwertig — ruhige,
  fotogestützte Ästhetik nach dem Vorbild der Y.CO-Itinerary-Seiten: Day-by-Day-Aufbau
  mit Versal-Tageslabels, Sticky-Split-Layout (Tagesliste ↔ fixierte Karte, bidirektional
  gekoppelt), zurückhaltende Palette (Creme/Marine, Farbe aus Fotos und Ampeln), viel
  Weißraum. Keine Marketing-App; Design ist persönlicher Qualitätsmaßstab des Nutzers.
  Pattern-Extrakt fürs UX-Design: siehe `addendum.md`.
- **NFR2 — Plattform:** Web-App im Browser — **am PC und am Handy** (responsive;
  Sticky-Split-Layout am PC, gestapelt am Handy). Internetverbindung vorausgesetzt;
  keine native App, keine Offline-Fähigkeit im MVP.
- **NFR3 — Abgrenzung Navigation:** Die App navigiert nicht und zeigt keine Seekarte.
  Sie ist Planungs- und Besprechungswerkzeug; Navigation läuft über Plotter/GPS, Windy
  bleibt parallel im Einsatz. Ein sichtbarer Hinweis stellt klar, dass die App das
  seemännische Urteil nicht ersetzt.
- **NFR4 — Datenhaltung & Stack-Prinzip:** Bibliotheken liegen in **Firebase Firestore
  (GCP)** — entschieden. Solange nichts anderes zwingend nötig ist, bleibt der Stack
  **komplett im Google-Universum** (Maps, Geolocation, Firestore, Hosting). Die App ist
  voll funktionsfähig ohne manuelle Dateipflege.
- **NFR5 — Verfügbarkeit & Transparenz:** Open-Meteo ist kostenlos für
  nicht-kommerzielle Nutzung (CC BY 4.0 — Attribution in der App), Limit 10.000
  Calls/Tag (ein Wind- und ein Wellen-Abruf je Wegpunkt — weit darunter), kein API-Key, aber auch
  **kein SLA** — akzeptiertes Restrisiko; benannter Fallback wären direkte
  DWD-/NOAA-Endpunkte. Die App zeigt Datenstand und Modelllauf transparent an, damit
  veraltete Daten erkennbar sind.
- **NFR6 — Datenqualität:** Schutzprofile ausschließlich quellenbasiert; unkuratierte
  Plätze erscheinen nicht mit grüner Ampel (kein stiller Fallback im MVP).

## 7. Außerhalb des Scopes (bewusst)

- Freies Routen-Bauen auf der Karte (Langfrist-Produkt, nach dem Feldtest)
- Navigation und Seekartendarstellung
- Stimmungs-/Crew-Zustand als Eingabegröße
- Offline-Fähigkeit; native Mobile-Apps (mobil läuft die Web-App im Browser, NFR2)
- Revierübergreifende Platz-Datenbank (MVP kuratiert nur den Törn-Korridor)
- Editier-Oberfläche für die **Bibliotheken** (Daten kommen über die
  Seeding-Pipeline; Korrekturen im Feld via direkter DB-Änderung) — nicht zu
  verwechseln mit dem **Etappen-Editing des Round-Trips** (FR28), das ausdrücklich
  im Scope ist
- Törnplanung im Saronischen Golf (Feldtest-Entscheidung 2026-08-02: keine Option,
  auch nicht als Schwachwind-Fallback)
- Wind-Fetch-Heuristik als automatisches Schutz-Schätzverfahren (nur als späterer
  Fallback für unkuratierte Plätze vorgemerkt)
- Multi-Modell-Vergleich in der App — Windy Compare bleibt dafür das Werkzeug
- Navigationsgefahren-Daten (Wracks, Untiefen, Fallwind-Warnungen) — Domäne von
  Seekarte und Plotter, die App wird nicht überfrachtet
- Hafen-Auslastung/Belegung (volle Häfen, Marina-Engpässe, Fährschwell) als
  Platz-Attribute
- Notfall-/Exit-Logistik (Crew-Splitting, Delivery mit Reduktionscrew, Fähren-Exits):
  Notmaßnahme außerhalb der App — greift nur, wenn Wind oder Planung versagt haben,
  und ist bewusst keine Funktionalität

## 8. Meilensteine & Prioritäten

| Termin | Meilenstein |
|---|---|
| 2. Aug | Feldtest-Feedback eingearbeitet (dieses PRD-Update): Round-Trip-Logik, Rückkehrfenster, Etappen-Editing, Gäste-Pickup, Karten-Overlay, UI-Bereinigung |
| 7. Aug | Feature-komplett: Round-Trip-Umbau umgesetzt; Bibliotheken final reviewt und importiert; Karte + Tagesansicht fertig; Polar-Transkript gegen Original verifiziert |
| 8. Aug | Törnstart — erste reale Morgenentscheidung am Samstagnachmittag (Abfahrt), danach täglicher Einsatz |

**Priorität bei Zeitnot** `[ANNAHME]` aus dem Brief: Etappen-Scoring und Point of Return
vor Karten-Politur; Design-Anspruch (NFR1) wird zuerst bei der Tagesansicht eingelöst,
zuletzt bei Nebenansichten.

## 9. Offene Punkte

- **Datenbank-Wahl:** Entschieden — **Firebase Firestore auf GCP**, Stack bleibt
  komplett im Google-Universum, solange nichts anderes zwingend nötig ist (NFR4);
  Philipp richtet die Infrastruktur ein.
- **Fotoquellen je Platz:** lizenzsauber bei der Kuration mitrecherchieren (FR6).
- **Heikell-Beschaffung:** *Greek Waters Pilot* (15. Aufl. 2025, ~£65) als Primärquelle
  der Schutzprofile — Kauf empfohlen (Tech-Recherche), Entscheidung bei Philipp.
  **Zeitkritisch:** Bei 9 Tagen muss die Bestellung sofort raus (oder digitale
  Ausgabe), sonst startet die Kuration ohne Primärquelle — Fallback dann: CruisersWiki
  als Primärquelle mit konservativeren Ampeln. Die Schutzprofile sind laut Brief der
  aufwendigste Teil der Recherche — im Zeitplan entsprechend früh einplanen.
- **Google-Maps-Billing:** Preis-/Konditionsangaben der Recherche stammen teils aus
  Sekundärquellen — vor dem Billing-Setup einmal auf der offiziellen Pricing-Seite
  verifizieren (Free-Tier 10.000 Loads/Monat erwartet).
- **Rückkehrzeit vertraglich bestätigen:** Rückkehr Alimos am Mittwoch, 19.8.
  nachmittags (Annahme 18:00) — mit dem Vercharterer fixieren; der Wert ist die
  gemeinsame Deadline-Konstante von Round-Trip-Gültigkeit (FR18) und
  Point-of-Return-Rechnung (FR19).
- **Fährverbindungen für Gäste-Pickup (FR31):** Welche Inseln sind am 15.8. per
  Fähre ab Santorin erreichbar (Abfahrtszeiten, Dauer)? Daten für die
  Pickup-Fallback-Bewertung bei der Kuration mitrecherchieren.
- **Annahmen-Index** (alle inline als `[ANNAHME]` markiert): E1 tägliche Nutzung als
  Erfolgskriterium · FR6 Fotoquellen lizenzsauber bei Kuration · FR8 Übernachtungsfenster
  18:00–09:00 · FR15 Standard-Abfahrt 09:00 · FR17 Wind-Reserve der Ampelbänder beim
  Bauen kalibrieren · FR18 Rückkehr-Deadline 19.8. 18:00 (vertraglich bestätigen) ·
  FR19 Meltemi-Worst-Case-Szenario 30 kn N–NE (beim Bauen kalibrieren) ·
  §8 Priorität bei Zeitnot: Scoring vor Karten-Politur.
- **Vlychada/Santorin:** Entschieden — Santorin bleibt als eigener Schlag in der
  Routenbibliothek (alles mit dem Boot, kein Fähren-Ausflug). Offen bleibt die
  Liegeplatz-Frage: Vlychada ist die einzige gut geschützte Liegestelle Thiras, für den
  50-ft-Kat aber grenzwertig (formal max. ~15 m Länge / ~2,5 m Tiefe) — die Kuration
  hinterlegt das als Warn-Attribut am Platz; **telefonische Vorabklärung vor dem Törn**
  nötig, sonst gilt die Santorin-Option nur bei bestätigtem Liegeplatz als offen.
