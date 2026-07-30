---
title: "Product Brief: sailgreece-router"
status: draft
created: 2026-07-30
updated: 2026-07-30
---

# Product Brief: sailgreece-router

## Problem & Anlass

Am 8. August 2026 startet ein 12-Tage-Familientörn mit einem 50-Fuß-Katamaran ab Marina Alimos (Athen) in die Kykladen — mitten in der Meltemi-Hochsaison (regelmäßig 6–8 Bft aus N–NE). Das eigentliche Ziel des Törns sind **schöne Plätze**: schöne Häfen und vor allem schöne Buchten — mit gutem Restaurant, Badestrand und nachts wind- und wellengeschütztem Ankerplatz. Eine geschützte Traumbucht hat höhere Priorität als das Anlaufen einer bestimmten Insel. Das Zielbild dahinter: so weit wie möglich nach Süden (maximal Amorgos oder Santorin), ohne den Kindern den Törn durch brutales Aufkreuzen bei über 30 Knoten zu verderben. Kritisch ist dabei nicht der Hinweg, sondern der Rückweg gegen den Meltemi — die Faustregel des Reviers lautet: zwei Drittel der Zeit für den Rückweg einplanen.

Die Planung dafür existiert bereits — als exzellentes PDF mit Entscheidungstoren, Wind-Szenarien und Eskalationsleiter — und Windvorhersagen liefert Windy. Was fehlt, ist das Bindeglied: **Die tägliche Übersetzung von Vorhersage in Entscheidung passiert heute komplett im Kopf des Skippers.** Jeden Morgen und Abend muss er neu durchrechnen, ob das Heute noch auf einem gültigen Mittelfristplan liegt — Distanzen × Geschwindigkeit × Windwinkel × Restzeit bis zur Basis — und wenn nicht, Mittelfrist- und Tagesplan konsistent neu ableiten. An Tag 6, wenn der Skipper müde ist, ist genau diese Kaskade fehleranfällig.

## Kernkonzept: Planung auf drei Ebenen

Törnplanung findet auf drei Ebenen statt, die die App als ein zusammenhängendes Modell abbildet:

1. **Langfristig** — das Zielbild: „Wir verfolgen den Santorin-Plan, weil der Wind sich in 3–4 Tagen passend entwickeln könnte."
2. **Mittelfristig** — die 3–5-Tage-Route: welcher Ast des Entscheidungsbaums aktuell gefahren wird.
3. **Täglich** — die Morgen-/Abendentscheidung: „Was machen wir heute?"

Der Kernsatz des Produkts: **Das Heute muss auf einem sinnvollen Mittelfristplan liegen.** Entwickelt sich der Wind wie erhofft, bestätigt die App den Kurs. Entwickelt er sich anders, kippt der Mittelfristplan — und die App zeigt, welche Alternativen noch offen sind und was das neue Heute ist. Optionen bleiben dabei immer sichtbar: Der Skipper entscheidet, die App rechnet und vergleicht.

Die Ziele selbst sind dabei keine Inseln, sondern **Plätze**: Buchten und Häfen mit ihren Qualitäten (Schönheit, Restaurant, Badestrand) und ihrem Nachtschutz gegen Wind *und* Welle bei der vorhergesagten Windrichtung. Ein Tagesziel ist gut, wenn es ein schöner, für die Nacht geschützter Platz ist, der auf einem tragfähigen Mittelfristplan liegt — nicht, weil es eine bestimmte Insel ist.

Abgewogen werden ausschließlich: **Entfernungen, Wind und Welle (Richtung und Stärke je Wettermodell), Segeldauer pro Etappe sowie Mittelfrist- und Tagesplan.**

## Lösungsumriss (MVP bis 8. August)

Eine **Web-App** (Nutzung am PC, Internetverbindung vorausgesetzt) mit einer Seekarte als zentraler Oberfläche:

- **Seekarte mit Wind-Overlay:** Häfen, Buchten und Routen des Reviers (Saronischer Golf, Westkykladen bis Amorgos/Santorin) auf einer Karte; Windvorhersage mehrerer Modelle (ECMWF/GFS/ICON) als Overlay oder Abfrage — via Windy (Widget oder API) `[ANNAHME: Integrationsform offen, siehe Offene Punkte]`.
- **Best-Practice-Routenbibliothek:** eine kleine, kuratierte Bibliothek etablierter Routen aus verlässlichen Quellen (Sailing-Blogs, Charter-Websites, Standardliteratur wie Rod Heikell) — keine frei erfundenen Routen. Für den Törn vorkonfiguriert: Plan A (Kea–Kythnos–Serifos–Sifnos–Paros–Naxos), Plan B (südlichster Punkt: Paros), Optionen Süd (Santorin) und Ost (Amorgos) samt Rückfallhafen-Kette. Einzelne Etappen sind manuell tauschbar.
- **Best-Practice-Platzbibliothek:** dieselbe Kuratierung für Buchten, Ankerplätze und Häfen — jeder Platz mit seinen Qualitäten (Schönheit, Restaurant, Badestrand) und einem **Schutzprofil**: bei welcher Wind- und Wellenrichtung/-stärke liegt man dort nachts geschützt. Die Tagesplanung mappt den Wind- und Wellen-Forecast auf dieses Profil und zeigt, welche Zielorte entlang der Route **grün** sind.
- **Etappen-Scoring mit Ampellogik:** Jede Etappe jedes Routen-Asts wird gegen die Vorhersage zum geplanten Zeitfenster bewertet — Windwinkel zum Kurs, Windstärke, Dauer bei Planungsgeschwindigkeit (6,0 kn Segel / 7,5 kn Maschine / 6,5 kn gegenan). Die Familien-Schwellen sind explizit: **kein Aufkreuzen gegenan bei >25 kn wahrem Wind; im Normalfall maximal 6 Stunden Segeln pro Tag; bei Leichtwind sind 10–12-Stunden-Schläge oder Nachtetappen zulässig, wenn sie strategisch helfen.**
- **Mittelfrist-Check:** Die App zeigt pro Routen-Ast, ob er unter der aktuellen Vorhersage noch trägt — inklusive der Rückweg-Rechnung bis Alimos (~103 sm ab Naxos) mit Puffertag.

## Außerhalb des Scopes (bewusst)

- Freies Routen-Bauen auf der Karte (Langfrist-Produkt, nach dem Feldtest)
- Stimmungs-/Crew-Zustand als Eingabegröße (bewusste Design-Entscheidung)
- Offline-Fähigkeit und Mobile-Optimierung
- Vollständige, revierübergreifende Hafen-/Ankerplatz-Datenbank (der MVP kuratiert nur die Plätze entlang der Törn-Routen; flächendeckende Abdeckung folgt später)

## Rahmenbedingungen & Termine

| Was | Wert |
|---|---|
| Törnstart / -dauer | Sa, 8. August 2026 / 12 Tage |
| Basis | Marina Alimos, Athen (Rückkehr am Vorabend der Ausschiffung) |
| Schiff / Crew | 50-Fuß-Katamaran, Familie mit Kindern |
| Produkt-Deadline | Nutzbares Tool zum Törnstart — 9 Tage Entwicklungszeit |
| Detailmaterial | Etappenpläne, Entscheidungstore, Hafenkatalog, Distanzen: siehe `addendum.md` |

## Offene Punkte & Risiken

- **Winddaten-Integration** `[ANNAHME]`: Windy-API ist kommerziell lizenziert; ob für die Kartendarstellung ein Widget-Embed reicht und woher das Scoring seine Forecast-Daten bezieht (Windy-API bzw. Open-Meteo), klärt die technische Recherche. Das Scoring braucht in jedem Fall maschinenlesbare Daten — ein reines Widget genügt dafür nicht.
- **Quellen-Recherche für beide Bibliotheken**: Routen und Platz-Schutzprofile müssen vor dem Törn aus den genannten Quellen zusammengetragen werden — Aufwand unklar, im 9-Tage-Budget einzuplanen; die Schutzprofile (Wind/Welle je Platz) sind dabei der aufwendigste Teil.
- **Wellendaten** `[ANNAHME]`: Für das Mapping auf die Schutzprofile braucht es neben Wind auch einen Wellen-/Schwell-Forecast (z. B. Open-Meteo Marine, Windy Waves) — Quelle klärt die technische Recherche.
- **Erfolgskriterium** `[ANNAHME]`: Das Tool wird auf dem Törn täglich real für die Morgen-/Abendentscheidung genutzt und ersetzt das Kopfrechnen — nicht das seemännische Urteil.
- **Zeitrisiko**: 9 Tage bis zum Törnstart sind knapp; bei Verzug hat das Etappen-Scoring Vorrang vor der Kartendarstellung `[ANNAHME]`.
