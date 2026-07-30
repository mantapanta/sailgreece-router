---
title: "Product Brief: sailgreece-router"
status: draft
created: 2026-07-30
updated: 2026-07-30
---

# Product Brief: sailgreece-router

## Problem & Anlass

Am 8. August 2026 startet ein 12-Tage-Familientörn mit einem 50-Fuß-Katamaran ab Marina Alimos (Athen) in die Kykladen — mitten in der Meltemi-Hochsaison (regelmäßig 6–8 Bft aus N–NE). Das Ziel: so weit wie möglich nach Süden (maximal Amorgos oder Santorin), ohne den Kindern den Törn durch brutales Aufkreuzen bei über 30 Knoten zu verderben. Kritisch ist dabei nicht der Hinweg, sondern der Rückweg gegen den Meltemi — die Faustregel des Reviers lautet: zwei Drittel der Zeit für den Rückweg einplanen.

Die Planung dafür existiert bereits — als exzellentes PDF mit Entscheidungstoren, Wind-Szenarien und Eskalationsleiter — und Windvorhersagen liefert Windy. Was fehlt, ist das Bindeglied: **Die tägliche Übersetzung von Vorhersage in Entscheidung passiert heute komplett im Kopf des Skippers.** Jeden Morgen und Abend muss er neu durchrechnen, ob das Heute noch auf einem gültigen Mittelfristplan liegt — Distanzen × Geschwindigkeit × Windwinkel × Restzeit bis zur Basis — und wenn nicht, beide Planungsebenen konsistent neu ableiten. An Tag 6, müde, ist genau diese Kaskade fehleranfällig.

## Kernkonzept: Planung auf drei Ebenen

Törnplanung findet auf drei Ebenen statt, die die App als ein zusammenhängendes Modell abbildet:

1. **Langfristig** — das Zielbild: „Wir verfolgen den Santorin-Plan, weil der Wind sich in 3–4 Tagen passend entwickeln könnte."
2. **Mittelfristig** — die 3–5-Tage-Route: welcher Ast des Entscheidungsbaums aktuell gefahren wird.
3. **Täglich** — die Morgen-/Abendentscheidung: „Was machen wir heute?"

Der Kernsatz des Produkts: **Das Heute muss auf einem sinnvollen Mittelfristplan liegen.** Entwickelt sich der Wind wie erhofft, bestätigt die App den Kurs. Entwickelt er sich anders, kippt der Mittelfristplan — und die App zeigt, welche Alternativen noch offen sind und was das neue Heute ist. Optionen bleiben dabei immer sichtbar: Der Skipper entscheidet, die App rechnet und vergleicht.

Abgewogen werden ausschließlich: **Entfernungen, Wind (Richtung und Stärke je Wettermodell), Segeldauer pro Etappe sowie Mittelfrist- und Tagesplan.** Weiche Faktoren wie Crew-Stimmung sind bewusst kein Input.

## Lösungsumriss (MVP bis 8. August)

Eine **Web-App** (Nutzung am PC, Internetverbindung vorausgesetzt) mit einer Seekarte als zentraler Oberfläche:

- **Seekarte mit Wind-Overlay:** Häfen, Buchten und Routen des Reviers (Saronischer Golf, Westkykladen bis Amorgos/Santorin) auf einer Karte; Windvorhersage mehrerer Modelle (ECMWF/GFS/ICON) als Overlay oder Abfrage — via Windy (Widget oder API) `[ANNAHME: genaue Integrationsform offen; Alternative Open-Meteo-Multi-Modell-API wird in der technischen Recherche geprüft]`.
- **Best-Practice-Routenbibliothek:** eine kleine, kuratierte Bibliothek etablierter Routen aus verlässlichen Quellen (Sailing-Blogs, Charter-Websites, Standardliteratur wie Rod Heikell) — keine frei erfundenen Routen. Für den Törn vorkonfiguriert: Plan A (Kea–Kythnos–Serifos–Sifnos–Paros–Naxos), Plan B (Deckel Paros), Optionen Süd (Santorin) und Ost (Amorgos) samt Rückfallhafen-Kette. Einzelne Etappen sind manuell tauschbar; freies Routing ist nicht Teil des MVP.
- **Etappen-Scoring mit Ampellogik:** Jede Etappe jedes Routen-Asts wird gegen die Vorhersage zum geplanten Zeitfenster bewertet — Windwinkel zum Kurs, Windstärke, Dauer bei Planungsgeschwindigkeit (6,0 kn Segel / 7,5 kn Maschine / 6,5 kn gegenan). Die Familien-Schwellen sind explizit: **kein Aufkreuzen gegen an bei >25 kn wahrem Wind; normal maximal 6 Stunden Segeln pro Tag; bei Leichtwind sind 10–12-Stunden-Schläge oder Nachtetappen zulässig, wenn sie strategisch helfen.**
- **Mittelfrist-Check:** Die App zeigt pro Routen-Ast, ob er unter der aktuellen Vorhersage noch trägt — inklusive der Rückweg-Rechnung bis Alimos (~103 sm ab Naxos) mit Puffertag.

## Außerhalb des Scopes (bewusst)

- Freies Routen-Bauen auf der Karte (Langfrist-Produkt, nach dem Feldtest)
- Stimmungs-/Crew-Zustand als Eingabegröße
- Offline-Fähigkeit und Mobile-Optimierung
- Vollständige Hafen-/Ankerplatz-Datenbank (weitere Recherche folgt später; MVP nutzt die Häfen der Routenbibliothek)

## Rahmenbedingungen & Termine

| Was | Wert |
|---|---|
| Törnstart / -dauer | Sa, 8. August 2026 / 12 Tage |
| Basis | Marina Alimos, Athen (Rückkehr am Vorabend der Ausschiffung) |
| Schiff / Crew | 50-Fuß-Katamaran, Familie mit Kindern |
| Produkt-Deadline | Nutzbares Tool zum Törnstart — 9 Tage Entwicklungszeit |
| Detailmaterial | Etappenpläne, Entscheidungstore, Hafenkatalog, Distanzen: siehe `addendum.md` |

## Offene Punkte & Risiken

- **Winddaten-Integration** `[ANNAHME]`: Windy-API ist kommerziell lizenziert; ob Widget-Embed für das Scoring reicht oder eine Forecast-API (Windy bzw. Open-Meteo) nötig ist, klärt die technische Recherche. Das Scoring braucht maschinenlesbare Daten — ein reines Widget genügt dafür nicht.
- **Routenquellen-Recherche**: Die Best-Practice-Routen müssen vor dem Törn aus den genannten Quellen zusammengetragen werden — Aufwand unklar, im 9-Tage-Budget einzuplanen.
- **Erfolgskriterium** `[ANNAHME]`: Das Tool wird auf dem Törn täglich real für die Morgen-/Abendentscheidung genutzt und ersetzt das Kopfrechnen — nicht das seemännische Urteil.
- **Zeitrisiko**: 9 Tage bis zum Törnstart sind knapp; bei Verzug hat das Etappen-Scoring Vorrang vor der Kartendarstellung `[ANNAHME: Priorisierung im Zweifel Scoring > Karte]`.
