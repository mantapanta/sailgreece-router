---
title: "Addendum: PRD sailgreece-router — Technische Tiefe & Downstream-Material"
status: draft
created: 2026-07-30
updated: 2026-07-30
---

# Addendum zum PRD: sailgreece-router

Material für nachgelagerte Artefakte (Architektur, Datenmodell, UX-Spez), das im PRD
nur als Capability erscheint.

## Datenbank-Entscheidung (für Architektur-Phase)

Philipp will explizit **keine handgepflegten JSON-Dateien**, sondern eine echte Datenbank
und eine voll funktionsfähige App. Er richtet die Infrastruktur selbst ein („kein Stress
mit einer Datenbank"). Genannte Kandidaten:

- **Vercel-Stack** (z. B. Vercel + Postgres/Neon o. ä.)
- **Firebase Firestore**

Die saubere Auswahl (Datenmodell-Passung, Free-Tier, Aufwand im 9-Tage-Budget) ist in der
Architektur-Phase zu recherchieren und zu entscheiden — das PRD schreibt nur die
Capability fest (persistente, zentrale Bibliotheken statt statischer Dateien).

Hinweis aus der Tech-Recherche (Kontrast): Der ursprüngliche Vorschlag war „statische
kuratierte JSON-Dateien im Repo, kein Backend". Diese Empfehlung ist durch die
Nutzer-Entscheidung überholt; die Recherche-Argumente (Einfachheit, 9-Tage-Budget)
bleiben als Risiko-Hinweis relevant.

## Karten-Stack-Entscheidung (Abwägung dokumentiert)

**Entscheidung: Google Maps JS API** — bewusst gegen die Recherche-Empfehlung
(Leaflet + OSM). Gründe des Product Owners: Optik/Design-Anspruch, Satellitenbilder
der Buchten passen zum „schöne Plätze"-Kern. Bekannte Kosten der Entscheidung
(aus Tech-Recherche): Billing-/Key-Setup ~1–2 h, gestrichelte Linien via
Symbol-Workaround (`repeat`-Icons), Free-Tier 10.000 Map-Loads/Monat (für
Solo-Nutzung unkritisch).

## Daten-Seeding-Pipeline (Detail zu FR-Gruppe „Bibliotheks-Kuration")

Gewünschter Ablauf (vom Product Owner formuliert):

1. **KI-Recherche vollständig**: Routen, Plätze, Qualitäten und Schutzprofile aus den
   verlässlichen Quellen (Heikell *Greek Waters Pilot*, CruisersWiki, sailingissues.com,
   Charter-Itineraries; Gegencheck Navily/mySea) — Philipp macht keine Handarbeit.
2. **Eine Abstimmungsrunde**: kompakte Review-Sicht der recherchierten Daten
   (v. a. Schutzprofile — sicherheitsrelevant!), Philipp bestätigt/korrigiert einmal.
3. **Sauberer DB-Import**: validiertes Schema, Normalisierung (Ortsschreibweisen,
   abweichende Distanzangaben der Quellen — siehe Brief-Addendum), dann läuft die App
   auf der Datenbank.

Startliste: die ~25–35 Plätze des Törn-Korridors aus dem Brief-Addendum
(Hafen-Kernliste + Zielkatalog mit Koordinaten). Aufwandsschätzung Recherche laut
Tech-Report: 1–2 Tage, parallelisierbar zur Entwicklung.

## Polardiagramm (Detail zu FR15/FR26)

Vom Product Owner im Review eingebracht: Die pauschalen Planungsgeschwindigkeiten des
Briefs (6,0/7,5/6,5 kn) sind für einen Performance-Katamaran zu grob. Reale Richtwerte
laut Philipp: **12–13 kn bei 130° zum wahren Wind**, Kreuzen **6–7 kn** je nach
Windstärke, unter Motor **~8 kn**.

- Datenquelle: Polardiagramm eines **Fountaine Pajot 45** — **geliefert** (2026-07-30,
  WindySail-Export „Fountaine Pajot 45.txt", per Screenshot übermittelt). Transkript:
  `inputs/polar-fountaine-pajot-45.txt` (Raster: TWA 0–180° in 13 Stufen × TWS
  4/6/8/10/12/14/16/20/25 kn).
- **Verifikation vor DB-Import nötig:** Transkript aus Phone-Screenshot rekonstruiert
  (Zeilenumbrüche); ideal die Original-`.txt` direkt einchecken.
- Beobachtung: Die Polare ist konservativer als die mündlichen Richtwerte
  (Maximum ~9,9 kn bei 110° TWA / 25 kn TWS statt „12–13 kn bei 130°") — für die
  Törnplanung ist die konservative Kurve die sichere Rechengrundlage.
- **Schiffs-Offset (vom Product Owner vorgegeben):** Das gecharterte Schiff ist eine
  Fountaine Pajot **Saona** (Philipps Angabe: „Saona 57"; das gängige Modell heißt
  Saona 47 — Bezeichnung bei Gelegenheit bestätigen, ändert am Offset nichts) und läuft
  im Schnitt **+0,5 kn** gegenüber der FP45-Polare. Umsetzung: additiver Offset auf
  alle Polar-Werte, als Parameter konfigurierbar; gilt nicht für die Motorfahrt
  (~8 kn bleibt eigener Parameter).
- Datenmodell: Tabelle Geschwindigkeit = f(TWA, TWS); Interpolation zwischen Stützstellen;
  Motorfahrt als separater Parameter (~8 kn), Zuschlag/Abschlag gegenan über die Polare
  bzw. Motor-Regel — Detailentscheid in der Architektur-Phase.
- Fallback: Brief-Pauschalwerte, solange keine Polare geladen ist.

## Design-Referenz

- **Y.CO Itinerary-Seite**: <https://y.co/yacht-charter/itinerary/ancient-greece-modern-classic>
  — Vorbild für: Day-by-Day-Aufbau („Day One …"), elegantes Zusammenspiel
  Itinerar ↔ Karte (Hover), hochwertiger Foto-Einsatz, ruhige Gesamtästhetik.
  Anspruch: „reif funktional, aber es soll nicht schlecht aussehen" — keine
  Marketing-App, aber Design als persönlicher Qualitätsmaßstab des Nutzers.

### Design-Pattern-Extrakt (Analyse 2026-07-30)

*Quelle: y.co-Itinerary-Seitenfamilie; y.co selbst war proxy-blockiert (403), Analyse
basiert auf indexierten Treffern + identischem Seiten-Template — Fonts/Hex-Werte nicht
aus dem CSS verifiziert, daher als Charakterbeschreibung.*

Struktur des Vorbilds: Foto-Hero mit Titel → Meta-Zeile (Route, Dauer, Region) →
editorialer Intro-Absatz → Day-by-Day-Abschnitte („Day One", Versal-Label, Etappen-Headline,
1–2 erzählende Absätze, großformatiges Foto, Distanz in nm) → Karte mit Stopp-Markern,
auf Desktop sticky, bidirektional an die Tagesliste gekoppelt (aktiver Tag ↔ aktiver
Marker, Route zeichnet sich etappenweise nach).

Übertragbare Patterns für sailgreece-router (Input für UX-Phase):

1. **Sticky-Split-Layout:** links scrollende Tageskarten, rechts fixierte Kykladen-Karte;
   aktiver Tag ↔ aktiver Marker synchron (Scroll-Spy + Hover).
2. **Tageskarte:** Hero-Foto des Platzes + Versal-Label „TAG 3" + Etappen-Headline
   „Paros → Naxos" + Badges (Distanz sm, Segelzeit h, Windwinkel, Ampel).
3. **Etappenweise Routen-Animation:** Route zeichnet sich bis zum aktiven Tag nach.
4. **Erzählton statt Datenblatt:** pro Platz/Tag ein kurzer atmosphärischer Satz; harte
   Zahlen in Badges/Meta-Zeile.
5. **Ruhige Palette:** Creme + Marine-/Nachtblau + ein Akzent; Farbe kommt aus den Fotos;
   Versal-Labels mit Letterspacing, Serif-Headlines, Hairline-Trenner, viel Weißraum —
   Karte reduziert gestylt (monochrome Basemap), Ampelfarben bleiben dadurch das
   dominante Signal.

## Comparables-Digest (Kurzfassung, Quelle: Landschafts-Recherche 2026-07-30)

Kein Tool am Markt kombiniert Etappen-Scoring + Ankerplatz-Schutzampel +
Umkehrpunkt-Logik. Nächste Nachbarn: Navily (Schutz-Score je Ankerplatz, 72 h,
kein Routing), savvy navvy/PredictWind (Einzelpassagen-Routing bzw. Departure
Planning, kein Mehrtages-Optionsraum), Windy (Multi-Modell-Anzeige ohne
Interpretation). Predicted Point of Return für Charter-Rückgabetermine existiert
nirgends als Feature — die eigentliche Nische des MVP.
