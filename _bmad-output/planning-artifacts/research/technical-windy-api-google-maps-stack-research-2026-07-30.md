---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  - _bmad-output/planning-artifacts/briefs/brief-sailgreece-router-2026-07-30/brief.md
  - _bmad-output/planning-artifacts/briefs/brief-sailgreece-router-2026-07-30/addendum.md
workflowType: 'research'
lastStep: 6
research_type: 'technical'
research_topic: 'Tech-Stack sailgreece-router MVP: Windy API + Google Maps Routen-Overlay'
research_goals: 'Belastbare Stack-Entscheidung fuer den 9-Tage-MVP: (a) Windy-API-Produkte, Preise, Modelle, Wellen-Abdeckung, Limits; (b) Karten-Stack fuer farbige gestrichelte Routen-Optionen und Wind-Pfeile (Google Maps JS API, Alternativen); (c) Zusammenspiel Forecast-Abfrage und Etappen-Scoring; (d) Datenquellen fuer Best-Practice-Routen und Platz-Schutzprofile'
user_name: 'Philipp'
date: '2026-07-30'
web_research_enabled: true
source_verification: true
---

# Research Report: technical

**Date:** 2026-07-30
**Author:** Philipp
**Research Type:** technical

---

## Research Overview

**Methodik:** Drei parallele Web-Recherche-Stränge (Wetterdaten-APIs, Karten-Stack, Datenquellen für Routen/Plätze) mit Quellenverifikation gegen offizielle Dokumentation, Community-Foren und Sekundärquellen (Stand 30. Juli 2026). Preisangaben zu Windy und Google Maps waren über den Session-Proxy teils nur via Sekundärquellen prüfbar — vor einer Zahlungsentscheidung einmal manuell auf der Original-Pricing-Seite gegenprüfen. Konfidenzangaben (hoch/mittel/niedrig) stehen bei jeder kritischen Aussage.

---

## Technical Research Scope Confirmation

**Research Topic:** Tech-Stack sailgreece-router MVP: Windy API + Google Maps Routen-Overlay
**Research Goals:** Belastbare Stack-Entscheidung für den 9-Tage-MVP — Windy-API-Produkte/Preise/Wellen-Abdeckung; Karten-Stack für 2–3 farbige gestrichelte Routen-Optionen mit Windpfeil-Overlay; Zusammenspiel mit dem Etappen-Scoring; Datenquellen-Kandidaten für Routen- und Platz-Bibliothek.

**Rahmen aus dem Product Brief:** Windy-Paid-API-Lizenz akzeptiert; keine Seekarten (Google Maps als Basiskarte ok, App navigiert nicht); Web-App am PC, Internet vorausgesetzt.

**Research Methodology:**

- Aktuelle Webdaten mit Quellenprüfung (Preise/Produkte live recherchiert, nicht aus Trainingswissen)
- Multi-Quellen-Validierung für kritische Aussagen
- Confidence-Angaben bei unsicheren Informationen

**Scope Confirmed:** 2026-07-30 (im freigegebenen Arbeitsplan bestätigt)

## Executive Summary

Die Recherche kippt zwei Vorannahmen des Briefs — zugunsten einfacherer und günstigerer Lösungen:

1. **Windy Point Forecast API ist für dieses Projekt ungeeignet** — trotz Zahlungsbereitschaft. Nur Jahresabo (~990 €/Jahr, keine Monatspläne), **ECMWF ist aus Lizenzgründen gar nicht enthalten**, und der kostenlose Trial-Key liefert absichtlich verfälschte Daten („randomly shuffled") — für echte Törnplanung unbrauchbar. *(Konfidenz: mittel-hoch)*
2. **Open-Meteo liefert alles Benötigte kostenlos**: ECMWF, GFS und ICON einzeln abfragbar (echter Multi-Modell-Vergleich), dazu eine **Marine-API mit Wellenhöhe/-richtung/-periode und Swell** (Mittelmeer-Abdeckung via DWD EWAM ~5 km und Météo-France MFWAM ~8 km). 10.000 Calls/Tag frei — bei 20–40 Wegpunkten mehr als genug. CC-BY-4.0-Lizenz, kein API-Key. *(Konfidenz: hoch)*
3. **Karten-Stack: Leaflet + OSM schlägt Google Maps** für den 9-Tage-MVP: farbige gestrichelte Routen sind eine Zeile (`dashArray`), Windpfeile sind rotierte SVG-Icons, kein Billing-Setup, kein API-Key. Google Maps funktioniert auch (Free-Tier reicht), kostet aber Setup-Zeit und braucht für gestrichelte Linien einen Symbol-Workaround. *(Konfidenz: hoch)*
4. **Platz-Schutzprofile müssen manuell kuratiert werden** — es gibt keine offene Datenquelle mit Wind-Schutz-Attributen. Empfohlener Weg: Positionen aus OSM (Overpass, ODbL), Schutzprofile aus Rod Heikell *Greek Waters Pilot* (15. Aufl. 2025) und CruisersWiki (CC-lizenziert), Navily/mySea als Gegencheck. Als automatischer Fallback existiert die etablierte **Wind-Fetch-Heuristik** (Distanz zur Landmasse je Richtungssektor). *(Konfidenz: hoch)*

**Empfohlener Stack:** Web-App (SPA) mit Leaflet + OSM-Tiles (optional OpenSeaMap-Overlay), Forecast-Daten von Open-Meteo (Forecast-API für Wind je Modell + Marine-API für Welle/Swell), kuratierte JSON-Dateien für Routen- und Platzbibliothek, Scoring clientseitig. Windy bleibt was es ist: das Tool, das Philipp parallel im Browser offen hat — optional als kostenloses Map-Embed (GFS-only) hinter einem Feature-Flag.

---

## 1. Wind- und Wellendaten

### 1.1 Windy API (geprüft, verworfen)

| Aspekt | Befund | Konfidenz |
|---|---|---|
| Produkte | Point Forecast API (JSON-Punktprognosen), Map Forecast API (einbettbare Leaflet-Karte), Webcams API | hoch |
| Modelle Point API | GFS, ICON/ICON-EU/ICON-D2, AROME (nicht GR), NAM, HRRR; Wellen: gfsWave, iconWave, iconEuWave | hoch |
| **ECMWF** | **Nicht enthalten** (Lizenzgründe; Community-Anfrage Sept. 2025 erneut verneint) | hoch |
| Preis | ~990 €/Jahr für 1 Mio. Requests/Monat; **nur Jahresabo**, automatische Verlängerung | mittel |
| Trial | Kostenlos, 500 Sessions/Tag, aber **Daten absichtlich verfälscht** — nur für Entwicklung | hoch |
| Zeitschritt/Horizont | 3 h (Professional tlw. 1 h); GFS ~10 Tage, ICON-EU ~5 Tage | mittel |

Bewertung: Selbst mit Zahlungsbereitschaft für „ein paar Wochen" scheitert es an der Jahresbindung — und das wichtigste Modell (ECMWF, laut Törnplan-Workflow die primäre Referenz) fehlt komplett. Quellen: [api.windy.com/point-forecast/pricing](https://api.windy.com/point-forecast/pricing), [community.windy.com/topic/42032](https://community.windy.com/topic/42032/ecmwf-model), [community.windy.com/topic/23138](https://community.windy.com/topic/23138/trial-api-data-randomly-shuffled), [community.windy.com/topic/38642](https://community.windy.com/topic/38642/price-of-point-forecast-api-professional-on-a-monthly-basis), [github.com/mikasjp/windy-mcp](https://github.com/mikasjp/windy-mcp)

### 1.2 Open-Meteo (empfohlen)

- **Forecast-API**: bis 16 Tage Horizont, Modelle einzeln wählbar (`&models=`) oder dedizierte Endpoints — ECMWF IFS 0,25°, NOAA GFS, DWD ICON/ICON-EU, Météo-France. Wind 10 m, Böen, Richtung. → Der Multi-Modell-Vergleich aus Philipps Wetter-Workflow (ECMWF/GFS/ICON „laufen die Modelle zusammen?") ist direkt abbildbar.
- **Marine-API**: `wave_height/direction/period`, `wind_wave_*`, `swell_wave_*` (inkl. Peak); Modelle: ECMWF WAM 0,25°, DWD EWAM (~5 km, Mittelmeer), MFWAM (~8 km). → Deckt die Schutzprofil-Prüfung (Welle/Schwell am Ankerplatz) ab.
- **Konditionen**: kostenlos für nicht-kommerzielle Nutzung, CC BY 4.0, 10.000 Calls/Tag, kein Key, CORS-freundlich (direkt aus dem Browser abfragbar). Multi-Location pro Request möglich.
- Rechenbeispiel: 40 Wegpunkte × 3 Wind-Modelle + 40 × 1 Wellen-Abruf ≈ 160 Calls pro Aktualisierung — selbst bei stündlicher Aktualisierung weit unter dem Limit.

Quellen: [open-meteo.com/en/docs/ecmwf-api](https://open-meteo.com/en/docs/ecmwf-api), [open-meteo.com/en/docs/marine-weather-api](https://open-meteo.com/en/docs/marine-weather-api), [open-meteo.com/en/terms](https://open-meteo.com/en/terms), [github.com/open-meteo/open-meteo](https://github.com/open-meteo/open-meteo)

### 1.3 Modellgüte Ägäis/Meltemi

Synoptisch erfassen ECMWF/GFS den Meltemi 48–72 h gut; kritisch sind die **Düseneffekte** in den Kanälen (Kea-Kanal, Paros–Naxos, Mykonos–Paros), die globale 0,25°-Modelle glätten — ICON-EU (~7 km) als hochauflösende Ergänzung einplanen; AROME deckt Griechenland nicht ab. ECMWF gilt im Langzeitvergleich als genauer als GFS. Lokale Gegenchecks: griechisches Poseidon-System (HCMR), meteo.gr, HNMS. *(Konfidenz: mittel)* Quellen: [windy.app/blog/ecmwf-vs-gfs](https://windy.app/blog/ecmwf-vs-gfs-differences-accuracy.html), Addendum (Wetter-Workflow des Törnplans)

## 2. Karten-Stack

### 2.1 Optionen im Vergleich

| Kriterium | Leaflet + OSM | Google Maps JS | MapLibre + OpenFreeMap | Windy Map Embed |
|---|---|---|---|---|
| Gestrichelte farbige Routen | nativ (`dashArray`) | Workaround (Symbol-Icons mit `repeat`) | nativ (`line-dasharray`) | via Leaflet-API |
| Windpfeile | rotierte divIcon-SVGs / RotatedMarker-Plugin | Symbol-`rotation` / AdvancedMarker | Symbol-Layer `icon-rotate` (data-driven) | animierter Partikel-Layer inklusive |
| Setup | kein Key, kein Billing | Cloud-Projekt + Kreditkarte + Key (~1–2 h) | kein Key (OpenFreeMap) | API-Key, Leaflet 1.4.x erzwungen |
| Kosten | 0 € (OSM-Policy: Hobby ok) | Free-Tier 10.000 Loads/Monat, dann 7 $/1.000 | 0 € | Trial nur GFS + formal „development only"; Paid ~720 $–990 €/Jahr |
| Aufwand Karte+Routen+Pfeile | ~0,5–1 Tag | ~1–2 Tage | ~1–2 Tage | ~1 Tag, aber Lizenz-Graubereich |

*(Konfidenz: hoch, außer Windy-Preise: mittel)* Quellen: [leafletjs.com/reference](https://leafletjs.com/reference.html), [Leaflet.RotatedMarker](https://github.com/bbecquet/Leaflet.RotatedMarker), [Leaflet.PolylineDecorator](https://github.com/bbecquet/Leaflet.PolylineDecorator), [developers.google.com — dashed lines](https://developers.google.com/maps/documentation/javascript/examples/overlay-symbol-dashed), [woosmap.com Google-Pricing-Analyse](https://www.woosmap.com/blog/google-maps-api-pricing-breakdown), [maplibre.org Style-Spec](https://maplibre.org/maplibre-style-spec/layers/), [openfreemap.org](https://openfreemap.org), [github.com/windycom/API](https://github.com/windycom/API)

### 2.2 Empfehlung

**Leaflet + OSM-Tiles**, optional OpenSeaMap-Seamark-Overlay (ein TileLayer, ~5 Zeilen). Begründung: exakt die geforderte Visualisierung (2–3 verschiedenfarbige gestrichelte Optionsrouten + Windpfeile) mit dem geringsten Aufwand und null Vendor-Setup. Google Maps bleibt als Basiskarte machbar, bringt aber für diesen Anwendungsfall keinen Mehrwert, der Billing-Setup und Dashed-Line-Workaround rechtfertigt — es sei denn, Satellitenbilder der Buchten sind gewünscht (dann Google `SATELLITE`/`HYBRID` als Pluspunkt abwägen; Esri-World-Imagery ist die keyless Alternative auf Leaflet). Die Windkarten-Optik von Windy wird nicht nachgebaut — Windy läuft ohnehin parallel im Browser; die App zeigt Windpfeile je Wegpunkt aus den Open-Meteo-Daten.

## 3. Datenquellen: Routen- und Platzbibliothek

### 3.1 Befund

Es existiert **keine offene, maschinenlesbare Quelle für Ankerplatz-Schutzprofile** (bei welcher Wind-/Wellenrichtung ein Platz grün ist). Navily hat genau diese Daten (Sektor-Logik + Forecast-Verrechnung via Meteomatics), aber keine API und proprietäre ToS. *(Konfidenz: hoch)*

### 3.2 Kuratierungs-Strategie (empfohlen)

| Baustein | Quelle | Lizenz | Rolle |
|---|---|---|---|
| Positionen/IDs der Plätze | OSM via Overpass-API (`seamark:type=harbour/anchorage`, `natural=bay`, `leisure=marina`) | ODbL | maschinelles Grundgerüst |
| Schutzprofile | Rod Heikell, *Greek Waters Pilot*, 15. Aufl. 2025 (Imray, ~£65) — standardisierte „Shelter"-Bewertung je Hafen | Fakten extrahierbar, Texte/Pläne nicht | Primärquelle, Kauf lohnt |
| Schutzprofile (Zweitquelle) | CruisersWiki (Kykladen-/Inselseiten) | CC 3.0 (mit Attribution) | legal zitierbare Textquelle |
| Verifikation | Navily, mySea (my-sea.com) — manuell gegenlesen | proprietär | Gegencheck einzelner Plätze |
| Routen-Itineraries | sailingissues.com (Kykladen + Saronisch), Moorings/Sunsail-Itineraries ab Athen, yachtico/samboat ab Lavrion | Fakten (Abfolgen/Distanzen) extrahierbar | Seed für Routenbibliothek |
| Automatischer Fallback | **Wind-Fetch-Heuristik**: Distanz zur nächsten Landmasse je 22,5°-Sektor aus OSM-Küstenpolygonen; kurzer Fetch in Windrichtung ⇒ geschützt (Tools: GRASS `r.windfetch`, Python `WindFetch`) | offen | Schutz-Schätzung für unkuratierte Plätze |

Quellen: [Overpass/OSM-Tags](https://wiki.openstreetmap.org/wiki/Tag:seamark:type=anchorage), [Imray Greek Waters Pilot 2025](https://store.imray.com/products/greek-waters-pilot-2025), [CruisersWiki Kykladen](https://www.cruiserswiki.org/wiki/Cruising_the_Cyclades_Islands), [Navily](https://www.navily.com), [my-sea.com](https://my-sea.com/en/greece/anchorages), [sailingissues.com](https://sailingissues.com/yachting-guide/cyclades-itineraries.html), [GRASS windfetch](https://grass-tutorials.osgeo.org/content/tutorials/windfetch/windfetch.html)

Aufwandsschätzung Kuration: für die ~25–35 Plätze des Törn-Korridors (Addendum-Hafenkatalog als Startliste) realistisch 1–2 Tage manuelle Arbeit mit Heikell + CruisersWiki — im 9-Tage-Budget einplanbar, parallelisierbar mit der Entwicklung.

## 4. Empfohlene Architektur (MVP)

- **Frontend-SPA** (z. B. React oder Vanilla + Vite): Leaflet-Karte, Routen-/Platzbibliothek als **statische, kuratierte JSON-Dateien** im Repo (kein Backend, keine Datenbank für den MVP nötig).
- **Forecast-Layer**: Open-Meteo Forecast-API (Wind je Modell ECMWF/GFS/ICON) + Marine-API (Welle/Swell) direkt aus dem Browser (CORS ok, kein Key); Antworten clientseitig cachen (z. B. localStorage, TTL 1–3 h).
- **Scoring clientseitig**: pro Etappe Kurswinkel vs. Windrichtung, Windstärke je Modell, Dauer bei 6,0/7,5/6,5 kn; pro Platz Forecast vs. Schutzprofil; Ampellogik nach den Brief-Schwellen (>25 kn kein Aufkreuzen, 6 h Normaltag, 10–12 h bei Leichtwind). Point-of-Return-Rechnung: Restdistanz nach Alimos über Rückfallketten-Graph vs. Resttage × Tagesbudget.
- **Hosting**: statisch (GitHub Pages/Netlify/Vercel Free) — passt zur „immer Internet, PC"-Nutzung.
- Optional hinter Feature-Flag: Windy-Map-Embed als zweiter Karten-Tab (Trial-Lizenz-Graubereich beachten).

## 5. Risiken & offene Punkte

- **Preis-/Konditionsangaben** zu Windy und Google stammen teils aus Sekundärquellen (Pricing-Seiten proxy-blockiert) — vor einer Kaufentscheidung manuell verifizieren. *(explizit markiert, Konfidenz je Tabelle)*
- **Open-Meteo-Verfügbarkeit**: kein SLA im Free-Tier; Fallback wäre ein zweiter kostenloser Anbieter (z. B. DWD/NOAA direkt) — für ein Hobby-Tool akzeptables Restrisiko.
- **Düseneffekte** bleiben modellblind: Die App sollte bekannte Beschleunigungszonen (Addendum: Kea-Kanal, Paros–Antiparos, Paros–Naxos, Kafireas) als statische Warn-Attribute an Etappen hängen, statt sich auf Modellwerte zu verlassen.
- **OSM-Tile-Policy**: Für mehr als Hobby-Traffic später auf OpenFreeMap/eigenen Tile-Cache wechseln.

## Strategische Empfehlung (Kurzfassung)

> **Leaflet + OSM + Open-Meteo (Forecast- und Marine-API) + kuratierte JSON-Bibliotheken, statisch gehostet.** Kein Windy-API-Kauf, kein Google-Billing, keine Datenbank. Das gesparte Windy-Budget (~990 €) in den Heikell-Pilot (~75 €) und 1–2 Tage Kurationszeit investieren.
