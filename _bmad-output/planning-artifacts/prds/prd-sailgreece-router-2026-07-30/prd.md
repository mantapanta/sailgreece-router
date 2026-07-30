---
title: "PRD: sailgreece-router"
status: draft
created: 2026-07-30
updated: 2026-07-30
---

# PRD: sailgreece-router

**Törnplanungs-Web-App für den 12-Tage-Kykladen-Familientörn ab 8. August 2026.**
Die App übersetzt Multi-Modell-Windvorhersagen täglich in bewertete Routen-Optionen —
sie ersetzt das Kopfrechnen des Skippers, nicht sein seemännisches Urteil.

## 1. Problem & Kontext

Am 8. August 2026 startet ein 12-Tage-Törn mit einem 50-Fuß-Katamaran ab Marina Alimos
(Athen) in die Kykladen — mitten in der Meltemi-Hochsaison (regelmäßig 6–8 Bft aus N–NE).
Ziel des Törns sind **schöne Plätze**: Buchten und Häfen mit gutem Restaurant, Badestrand
und nachts wind- und wellengeschütztem Ankerplatz. So weit wie möglich nach Süden (maximal
Amorgos oder Santorin), ohne der Familie brutales Aufkreuzen bei über 30 Knoten zuzumuten.
Kritisch ist der Rückweg gegen den Meltemi — Faustregel des Reviers: zwei Drittel der Zeit
für den Rückweg.

Die Planung existiert als exzellentes PDF (Etappenpläne, Entscheidungstore,
Eskalationsleiter), Windvorhersagen liefert Windy. Was fehlt, ist das Bindeglied:
**Die tägliche Übersetzung von Vorhersage in Entscheidung passiert heute komplett im Kopf
des Skippers** — Distanzen × Geschwindigkeit × Windwinkel × Restzeit, morgens und abends
neu. An Tag 6, wenn der Skipper müde ist, ist genau diese Kaskade fehleranfällig.

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
  Entwicklungszeit). Wünschenswert: Kernfunktionen bereits am 3.–5. August verfügbar,
  weil dann der Routing-Vorentscheid (Gate T−5 bis T−3) ansteht. `[ANNAHME]`
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
  Anker. Aktuelle Position ist gesetzt (manuell gewählt `[ANNAHME]`, kein GPS). Die App
  zeigt: heutige Tagesoptionen mit Ziel-Ampel und Etappen-Score, den Zustand des
  Mittelfristplans (welche Optionen noch offen sind) und den Point of Return. Die Crew
  schaut mit; man entscheidet gemeinsam das Heute.
- **UM-2 Abendcheck (täglich, ~5 min):** Nach dem neuen Forecast-Lauf prüft Philipp, ob
  das Morgen noch auf einem gültigen Mittelfristplan liegt — bestätigt die App den Kurs,
  ist der Abend frei; kippt eine Option, sieht er es hier zuerst.
- **UM-3 Routing-Vorentscheid (3.–5. August, vor dem Törn):** Modelle einig? Plan A
  (Richtung Naxos+) offen oder Plan B (Deckel Paros) enger? Erste reale Bewährungsprobe
  des Scorings. `[ANNAHME]`, dass die App hierfür schon nutzbar ist — siehe E2.

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
(Richtung und Stärke je Wettermodell), Segeldauer pro Etappe sowie Mittelfrist- und
Tagesplan. Der Skipper entscheidet, die App rechnet und vergleicht.

## 5. Funktionale Anforderungen

### F1 — Karte & Besprechungsbild

- **FR1:** Google-Maps-Karte des Reviers (Saronischer Golf, Westkykladen bis
  Amorgos/Santorin) mit allen Plätzen der Bibliothek als Marker in ihrer aktuellen
  Ampelfarbe. Satellit/Hybrid-Ansicht verfügbar (Buchten-Optik).
- **FR2:** 2–3 Routen-Optionen gleichzeitig als verschiedenfarbige gestrichelte Linien,
  die zeigen, wie der Weg jeweils weitergeht.
- **FR3:** Windpfeil-Overlay (Richtung und Stärke je Wegpunkt/Platz) aus dem gewählten
  Wettermodell.
- **FR4:** Itinerar ↔ Karte synchron: Hover/Auswahl eines Tages oder einer Etappe hebt
  das Gegenstück auf der Karte hervor (Design-Referenz: Y.CO-Itinerary, siehe NFR1).
- **FR5:** Platz-Detailansicht: Foto, Qualitäten (Schönheit, Restaurant, Badestrand),
  Schutzprofil und die daraus berechnete Ampel für die kommende Nacht.

### F2 — Platzbibliothek

- **FR6:** Datenbankgestützte Bibliothek der ~25–35 Plätze des Törn-Korridors:
  Koordinaten, Typ (Hafen/Bucht/Marina), Qualitäten (Schönheit, Restaurant, Badestrand),
  Foto `[ANNAHME: Fotoquelle wird bei der Kuration lizenzsauber mitrecherchiert]`.
- **FR7:** Schutzprofil je Platz: geschützte Wind- und Wellenrichtungssektoren mit
  Stärkegrenzen, quellenbasiert kuratiert (Heikell, CruisersWiki), ergänzt um die
  universelle Regel „Lee ist immer geschützt, Luv nie".
- **FR8:** Deterministische **Rot/Gelb/Grün-Ampel** je Platz: Forecast (Wind + Welle zum
  Übernachtungszeitfenster) gemappt auf das Schutzprofil.

### F3 — Routenbibliothek

- **FR9:** Kuratierte Best-Practice-Routen als Möglichkeitsraum: Etappenfolgen über
  Plätze der Bibliothek mit Distanzen (sm) — keine frei erfundenen Routen. Deckt
  mindestens ab: Plan A (bis Naxos, Optionen Amorgos/Santorin), Plan B (Deckel
  Paros/Antiparos), Rückfallhäfen-Kette, Saronische Schwachwind-Alternative.
- **FR10:** Etappen tragen statische Warn-Attribute für bekannte Düsen-/Beschleunigungszonen
  (Kea-Kanal, Kafireas, Paros–Antiparos, Paros–Naxos), unabhängig vom Modellwert.

### F4 — Forecast-Integration

- **FR11:** Open-Meteo Forecast-API: Wind 10 m, Böen, Richtung — je Modell **ECMWF, GFS,
  ICON einzeln** abfragbar.
- **FR12:** Open-Meteo Marine-API: Wellenhöhe, -richtung, -periode inkl. Swell für die
  Schutzprofil-Prüfung.
- **FR13:** Client-Caching der Antworten (TTL 1–3 h); der Datenstand (Modelllauf,
  Abrufzeit) ist in der UI sichtbar.
- **FR14:** Modell-Vergleich sichtbar: Gleichlauf der Modelle = Vertrauen; bei
  Abweichung zeigt die App die Spanne statt eines Scheinkonsens.
  `[ANNAHME: Darstellung als Nebeneinander-Vergleich je Etappe/Platz, keine
  Ensemble-Statistik im MVP]`

### F5 — Etappen-Scoring

- **FR15:** Jede Etappe jeder offenen Routen-Option wird gegen die Vorhersage zum
  geplanten Zeitfenster bewertet: Windwinkel zum Kurs, Windstärke, Dauer bei
  Planungsgeschwindigkeit (6,0 kn Segel / 7,5 kn Maschine / 6,5 kn gegenan).
- **FR16:** Familien-Schwellen sind explizit und im Scoring verdrahtet: **kein
  Aufkreuzen gegenan bei >25 kn wahrem Wind; im Normalfall maximal 6 Stunden pro Tag;
  bei Leichtwind sind 10–12-Stunden-Schläge oder Nachtetappen zulässig, wenn sie
  strategisch helfen.**
- **FR17:** Ampel je Etappe plus aggregierte Bewertung je Routen-Option (schwächstes
  Glied sichtbar).

### F6 — Mittelfrist-Optionsraum & Predicted Point of Return

- **FR18:** Aus aktueller Position, Törntag und Forecast leitet die App täglich ab,
  welche Routen-Optionen des Möglichkeitsraums noch offen sind — angezeigt als
  **offen / schließt am Tag X / geschlossen**, bevor sie sich schließen.
- **FR19:** **Predicted Point of Return:** fortlaufende Berechnung des spätesten
  Umkehrpunkts für die stressfreie Rückkehr nach Alimos (~103 sm ab Naxos, Rückkehr am
  Vorabend der Ausschiffung, mit Puffertag) — Restdistanz über die Rückfallhäfen-Kette
  vs. Resttage × Tagesbudget.
- **FR20:** Die Entscheidungstore des Törnplans (Tag 3, Tag 5/6 Hard Gate, Tag 8,
  Tag 10) erscheinen als Prüfpunkte mit ihrer jeweiligen Frage („Doppel-Fenster für
  Rückweg + Bonus?").

### F7 — Tagesentscheidung

- **FR21:** Morgen-/Abendansicht „Was machen wir heute?": die 2–3 Tagesoptionen mit
  Ziel-Ampel (Nachtschutz), Etappen-Score, Dauer und der Auswirkung auf den
  Mittelfristplan — nebeneinander vergleichbar.
- **FR22:** Die App empfiehlt nicht automatisch und blendet nichts aus: Optionen bleiben
  sichtbar, der Skipper entscheidet.

### F8 — Daten-Seeding & Kuration

- **FR23:** Die Bibliotheken (F2, F3) werden durch **KI-gestützte Recherche vollständig
  befüllt** (Quellen: Rod Heikell *Greek Waters Pilot*, CruisersWiki, sailingissues.com,
  Charter-Itineraries; Gegencheck Navily/mySea) — keine Handpflege durch Philipp.
- **FR24:** **Eine Review-Runde:** kompakte Abstimmungssicht der recherchierten Daten —
  Schutzprofile zuerst, denn sie sind sicherheitsrelevant. Philipp bestätigt oder
  korrigiert einmal, dann Import.
- **FR25:** Import mit Schema-Validierung und Normalisierung (Ortsschreibweisen
  Merichas/Mericha u. ä.; abweichende Distanzangaben der Quellen werden auf einen
  Bezugspunkt vereinheitlicht).

## 6. Nicht-funktionale Anforderungen

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
- **NFR5 — Verfügbarkeit & Transparenz:** Open-Meteo hat im Free-Tier kein SLA —
  akzeptiertes Restrisiko. Die App zeigt Datenstand und Modelllauf transparent an,
  damit veraltete Daten erkennbar sind.
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

## 8. Meilensteine & Prioritäten

| Termin | Meilenstein |
|---|---|
| 3.–5. Aug | App nutzbar für Routing-Vorentscheid: Forecast + Scoring + Optionsraum `[ANNAHME]` |
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
- **Vlychada/Santorin:** Quelle 1 nennt es grenzwertig für 50-ft-Kat, Quelle 2 rät vom
  Anlauf per Schiff generell ab — wie die Santorin-Option in der Routenbibliothek
  abgebildet wird (Fähren-Tagesausflug ab Paros/Naxos statt eigenem Anlauf?), klärt die
  Kuration.
