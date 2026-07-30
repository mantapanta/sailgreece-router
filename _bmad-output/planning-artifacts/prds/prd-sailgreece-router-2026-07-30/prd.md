---
title: "PRD: sailgreece-router"
status: final
created: 2026-07-30
updated: 2026-07-30
---

# PRD: sailgreece-router

**Törnplanungs-Web-App für den 12-Tage-Kykladen-Familientörn ab 8. August 2026.**
Die App übersetzt Windvorhersagen täglich in bewertete Routen-Optionen —
sie ersetzt das Kopfrechnen des Skippers, nicht sein seemännisches Urteil.

## 1. Problem & Kontext

Am 8. August 2026 startet ein 12-Tage-Törn mit einem 50-Fuß-Katamaran ab Marina Alimos
(Athen) in die Kykladen — mitten in der Meltemi-Hochsaison (regelmäßig 6–8 Bft aus N–NE).
Ziel des Törns sind **schöne Plätze**: schöne Häfen und vor allem schöne Buchten — mit
gutem Restaurant, Badestrand und nachts wind- und wellengeschütztem Ankerplatz. So weit
wie möglich nach Süden (maximal Amorgos oder Santorin), ohne den Kindern den Törn durch
brutales Aufkreuzen bei über 30 Knoten zu verderben.
Kritisch ist der Rückweg gegen den Meltemi — Faustregel des Reviers: zwei Drittel der Zeit
für den Rückweg.

Das Wissen dafür ist verfügbar — Revierliteratur, Best-Practice-Routen,
Windvorhersagen. Einen fertigen Törnplan, den man nur abfahren könnte, gibt
es aber nicht, und die App setzt auch keinen voraus: Der Mittelfristplan muss jeden Tag
neu aus den noch offenen Optionen abgeleitet werden. Genau diese Arbeit —
**die tägliche Übersetzung von Vorhersage in Entscheidung — passiert heute komplett im
Kopf des Skippers**: Distanzen × Geschwindigkeit × Windwinkel × Restzeit, morgens und
abends neu. An Tag 6, wenn der Skipper müde ist, ist genau diese Kaskade fehleranfällig.

**Marktlücke (Landschafts-Recherche 2026-07-30):** Kein existierendes Tool kombiniert
Etappen-Scoring, Ankerplatz-Schutzampel und Umkehrpunkt-Logik. Navily bewertet
Ankerplatz-Schutz (nur 72 h, kein Routing), PredictWind/savvy navvy routen Einzelpassagen
(kein Mehrtages-Optionsraum), Windy zeigt Modelle ohne Interpretation. Einen Predicted
Point of Return für Charter-Rückgabetermine bietet niemand.

## 2. Ziele & Erfolgskriterien

**Produktziel:** Skipper und Crew sehen jeden Morgen und Abend auf einen Blick, welche
Tagesziele schön, nachts geschützt und mit einem tragfähigen Mittelfristplan vereinbar
sind — und welche Routen-Optionen sich öffnen oder schließen.

Erfolgskriterien:

- **E1 — Tägliche reale Nutzung:** Das Tool wird auf dem Törn täglich für die
  Morgen-/Abendentscheidung genutzt und ersetzt das Kopfrechnen. `[ANNAHME]` aus dem
  Brief übernommen.
- **E2 — Rechtzeitig fertig:** Nutzbares Tool zum Törnstart am 8. August (9 Tage
  Entwicklungszeit). Kernfunktionen bereits am 3.–5. August verfügbar, weil dann der
  Routing-Vorentscheid vor dem Törn ansteht (bestätigt).
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

Einziger Nutzer im MVP ist **Philipp als Skipper** — am PC, mit Internetverbindung, die
Karte als Besprechungsbild im Gespräch mit der Crew.

- **UM-1 Morgenentscheidung (täglich, ~10 min):** Philipp öffnet die App im Hafen/vor
  Anker — allein oder mit der Crew als Besprechungsbild. Die aktuelle Position kommt
  per GPS/Standortabfrage (FR27), manuell übersteuerbar. Die App zeigt: heutige
  Tagesoptionen mit Ziel-Ampel und Etappen-Score, den Zustand des Mittelfristplans
  (welche Optionen noch offen sind) und den Point of Return — daraus entsteht die
  gemeinsame Entscheidung für das Heute.
- **UM-2 Abendcheck (täglich, ~5 min):** Nach dem neuen Forecast-Lauf prüft Philipp, ob
  das Morgen noch auf einem gültigen Mittelfristplan liegt — bestätigt die App den Kurs,
  ist der Abend frei; kippt eine Option, sieht er es hier zuerst.
- **UM-3 Routing-Vorentscheid (3.–5. August, vor dem Törn):** Ist die Süd-Route
  (Richtung Naxos und weiter) offen, oder deckelt der Meltemi das Zielbild früher?
  (Modell-Konsens prüft Philipp parallel in Windy.) Erste reale Bewährungsprobe des
  Scorings — die App ist hierfür bereits nutzbar (bestätigt, siehe E2).

## 4. Kernkonzept: Planung auf drei Ebenen

Der Kernsatz des Produkts: **Das Heute muss auf einem sinnvollen Mittelfristplan liegen.**

1. **Langfristig** — das Zielbild („Wir verfolgen den Santorin-Plan, weil der Wind sich
   in 3–4 Tagen passend entwickeln könnte").
2. **Mittelfristig** — die 3–5-Tage-Route: welche der noch offenen Routen-Optionen
   aktuell verfolgt wird. Der Mittelfristplan ist nicht fest verdrahtet, sondern entsteht
   täglich neu aus dem **Möglichkeitsraum** der Best-Practice-Routen.
3. **Täglich** — die Morgen-/Abendentscheidung: „Was machen wir heute?"

Ziele sind **Plätze, keine Inseln**: Eine geschützte Traumbucht schlägt das Anlaufen
einer bestimmten Insel. Abgewogen werden ausschließlich Entfernungen, Wind und Welle
(Richtung und Stärke), Segeldauer pro Etappe sowie Mittelfrist- und Tagesplan. Der Skipper entscheidet, die App rechnet und vergleicht.

**Begriffe** (durchgängig so verwendet): **Platz** = Bucht, Ankerplatz oder Hafen mit
Qualitäten und Schutzprofil · **Etappe** = Schlag von Platz zu Platz ·
**Routen-Option** = kuratierte Etappenfolge aus der Routenbibliothek ·
**Möglichkeitsraum** (synonym: Optionsraum) = Menge aller Routen-Optionen ·
**Mittelfristplan** = die aktuell verfolgte Routen-Option über 3–5 Tage ·
**Point of Return** (synonym: Umkehrpunkt) = letzter Törntag/Ort, an dem noch
umgekehrt werden kann, um die Basis rechtzeitig zu erreichen · **Ampel** = deterministische Rot/Gelb/Grün-Bewertung;
je Platz („Ziel-Ampel", FR8) und je Etappe/Option (FR17).

## 5. Funktionale Anforderungen

### F1 — Karte & Besprechungsbild

- **FR1:** Google-Maps-Karte des Reviers (Saronischer Golf, Westkykladen bis
  Amorgos/Santorin) mit allen Plätzen der Bibliothek als Marker in ihrer aktuellen
  Ampelfarbe. Satellit/Hybrid-Ansicht verfügbar (Buchten-Optik).
- **FR2:** 2–3 Routen-Optionen gleichzeitig als verschiedenfarbige gestrichelte Linien,
  die zeigen, wie der Weg jeweils weitergeht.
- **FR3:** Windpfeil-Overlay (Richtung und Stärke je Wegpunkt/Platz) aus dem
  Basis-Wettermodell (FR11).
- **FR4:** Itinerar ↔ Karte synchron: Hover/Auswahl eines Tages oder einer Etappe hebt
  das Gegenstück auf der Karte hervor (Design-Referenz: Y.CO-Itinerary, siehe NFR1).
- **FR5:** Platz-Detailansicht: Foto, Qualitäten (Schönheit, Restaurant, Badestrand),
  Schutzprofil und die daraus berechnete Ampel für die kommende Nacht.

### F2 — Platzbibliothek

- **FR6:** Datenbankgestützte Bibliothek der ~25–35 Plätze des Törn-Korridors:
  Koordinaten, Typ (Hafen/Bucht/Marina), Qualitäten (Schönheit, Restaurant, Badestrand),
  Foto `[ANNAHME: Fotoquelle wird bei der Kuration lizenzsauber mitrecherchiert]`.
  Bewusst schlank: keine Auslastungs-, Engpass- oder Logistik-Attribute (siehe §7).
- **FR7:** Schutzprofil je Platz: geschützte Wind- und Wellenrichtungssektoren mit
  Stärkegrenzen, quellenbasiert kuratiert (Heikell, CruisersWiki), ergänzt um die
  universelle Regel „Lee ist immer geschützt, Luv nie".
- **FR8:** Deterministische **Rot/Gelb/Grün-Ampel** je Platz: Forecast (Wind + Welle)
  gemappt auf das Schutzprofil, bewertet über das Übernachtungszeitfenster
  `[ANNAHME: 18:00–09:00 Ortszeit]`.

### F3 — Routenbibliothek

- **FR9:** Kuratierte Best-Practice-Routen als Möglichkeitsraum: Etappenfolgen über
  Plätze der Bibliothek mit Distanzen (sm) — keine frei erfundenen Routen. Deckt
  mindestens ab: die Süd-Route bis Naxos mit Verlängerungsoptionen Amorgos/Santorin,
  eine gedeckelte Variante bis Paros/Antiparos, die Rückfallhäfen-Kette westwärts und
  die Saronische Schwachwind-Alternative. Diese Varianten sind als **Eskalationsstufen**
  zueinander geordnet: Verschärft sich der Forecast, bietet die App die
  nächstkonservativere Stufe als natürliche Alternative an.
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
  bewertet: Windwinkel zum Kurs, Windstärke, Dauer aus dem
  hinterlegten **Polardiagramm** (FR26 — Geschwindigkeit als Funktion von wahrem
  Windwinkel und Windstärke); Motorfahrt mit ~8 kn als eigener Parameter.
- **FR16:** Familien-Schwellen sind explizit und im Scoring verdrahtet: **kein
  Aufkreuzen gegenan bei >25 kn wahrem Wind.** Tagesbudget: **Ziel maximal ~6 Stunden
  unterwegs** (5 h Segeln + 1 h Motor oder 6 h reines Segeln), **hartes Maximum
  6 h Segeln + 2 h Motor.** **Bei Leichtwind sind 10–12-Stunden-Schläge zulässig; bei
  ~4–6 kn Wind auch Nachtetappen mit der ganzen Familie an Bord** (glattes Wasser —
  ob Segeln oder Motoren ist dann egal, alle können schlafen) — maximal ~2× pro Törn,
  wenn sie strategisch helfen.
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

### F6 — Mittelfrist-Optionsraum & Predicted Point of Return

- **FR18:** Aus aktueller Position, Törntag und Forecast leitet die App täglich ab,
  welche Routen-Optionen des Möglichkeitsraums noch offen sind — angezeigt als
  **offen / schließt am Tag X / geschlossen**, bevor sie sich schließen.
  Definition: Eine Option ist **offen**, wenn sich mit dem aktuellen Forecast ein
  Restplan konstruieren lässt, der (1) jede Etappe innerhalb der Familien-Schwellen
  (FR16, Dauer aus Polare + Offset) hält und (2) die Rückkehr nach Alimos am Vorabend
  der Ausschiffung inklusive Puffertag erreicht (FR19). **Schließt am Tag X** = ab
  Tag X+1 existiert kein solcher Restplan mehr; **geschlossen** = es existiert keiner.
  Kippt der Mittelfristplan, leitet die App daraus konsistent das neue Heute ab
  (FR21).
- **FR19:** **Predicted Point of Return:** fortlaufende Berechnung des spätesten
  Umkehrpunkts für die stressfreie Rückkehr nach Alimos (~103 sm ab Naxos, Rückkehr am
  Vorabend der Ausschiffung, mit Puffertag) — Restdistanz über die Rückfallhäfen-Kette
  vs. Resttage × Tagesbudget; Etappendauern wie im Etappen-Scoring aus der Polare
  (FR15/FR26).
- **FR20:** Aus Optionsraum und Point of Return leitet die App **Entscheidungspunkte**
  ab und macht sie sichtbar: an welchem Tag welche Frage entschieden sein muss, bevor
  die zugehörige Option verfällt (z. B. „Verlängerung nach Amorgos nur bei
  Doppel-Fenster für Hin- und Rückweg") — dynamisch berechnet, keine fest verdrahteten
  Kalender-Gates.
- **FR27:** Die App bestimmt die **aktuelle Position per GPS/Standortabfrage**
  (Browser-Geolocation, integriert mit der Google-Maps-Karte) — Teil des Produkts,
  keine reine Handeingabe. Manuelles Übersteuern (Platz aus der Bibliothek wählen)
  bleibt als Fallback möglich, z. B. wenn der Browser den Standort nicht freigibt.
  *(ID nachgereicht — Nummerierung bleibt stabil.)*

### F7 — Tagesentscheidung

- **FR21:** Morgen-/Abendansicht „Was machen wir heute?": die 2–3 Tagesoptionen mit
  Ziel-Ampel (Nachtschutz), Etappen-Score, Dauer und der Auswirkung auf den
  Mittelfristplan — nebeneinander vergleichbar.
- **FR22:** Die App empfiehlt nicht automatisch und blendet nichts aus: Optionen bleiben
  sichtbar, der Skipper entscheidet.

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
- **NFR2 — Plattform:** Web-App am PC, Internetverbindung vorausgesetzt. Keine
  Offline-Fähigkeit, keine Mobile-Optimierung im MVP.
- **NFR3 — Abgrenzung Navigation:** Die App navigiert nicht und zeigt keine Seekarte.
  Sie ist Planungs- und Besprechungswerkzeug; Navigation läuft über Plotter/GPS, Windy
  bleibt parallel im Einsatz. Ein sichtbarer Hinweis stellt klar, dass die App das
  seemännische Urteil nicht ersetzt.
- **NFR4 — Datenhaltung:** Bibliotheken liegen in einer zentralen Datenbank (Kandidaten:
  Vercel-Stack oder Firebase Firestore — Entscheidung in der Architektur-Phase);
  die App ist voll funktionsfähig ohne manuelle Dateipflege.
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
- Offline-Fähigkeit und Mobile-Optimierung
- Revierübergreifende Platz-Datenbank (MVP kuratiert nur den Törn-Korridor)
- Editier-Oberfläche für die Bibliotheken (Daten kommen über die Seeding-Pipeline;
  Korrekturen im Feld via direkter DB-Änderung)
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
| 3.–5. Aug | App nutzbar für Routing-Vorentscheid: Forecast + Scoring + Optionsraum (bestätigt); Vorbedingung: Polar-Transkript gegen Original verifiziert |
| 7. Aug | Bibliotheken final reviewt und importiert; Karte + Tagesansicht komplett |
| 8. Aug | Törnstart — Tool im täglichen Einsatz |

**Priorität bei Zeitnot** `[ANNAHME]` aus dem Brief: Etappen-Scoring und Point of Return
vor Karten-Politur; Design-Anspruch (NFR1) wird zuerst bei der Tagesansicht eingelöst,
zuletzt bei Nebenansichten.

## 9. Offene Punkte

- **Datenbank-Wahl** (Vercel-Stack vs. Firebase Firestore): Recherche und Entscheidung in
  der Architektur-Phase; Philipp richtet die Infrastruktur ein.
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
- **Rückkehrzeit vertraglich bestätigen:** Rückgabe am Vorabend der Ausschiffung
  (Annahme 18:00, Alimos) — mit dem Vercharterer fixieren; der Wert geht als Konstante
  in die Point-of-Return-Rechnung (FR19) ein.
- **Annahmen-Index** (alle inline als `[ANNAHME]` markiert): E1 tägliche Nutzung als
  Erfolgskriterium · FR6 Fotoquellen lizenzsauber bei Kuration · FR8 Übernachtungsfenster
  18:00–09:00 · FR15 Standard-Abfahrt 09:00 · FR17 Wind-Reserve der Ampelbänder beim
  Bauen kalibrieren · §8 Priorität bei Zeitnot: Scoring vor Karten-Politur.
- **Vlychada/Santorin:** Entschieden — Santorin bleibt als eigener Schlag in der
  Routenbibliothek (alles mit dem Boot, kein Fähren-Ausflug). Offen bleibt die
  Liegeplatz-Frage: Vlychada ist die einzige gut geschützte Liegestelle Thiras, für den
  50-ft-Kat aber grenzwertig (formal max. ~15 m Länge / ~2,5 m Tiefe) — die Kuration
  hinterlegt das als Warn-Attribut am Platz; **telefonische Vorabklärung vor dem Törn**
  nötig, sonst gilt die Santorin-Option nur bei bestätigtem Liegeplatz als offen.
