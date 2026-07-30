---
title: "Quellen-Abgleich: Tech-Recherche (Windy API / Google Maps Stack) vs. PRD + Addendum"
status: done
created: 2026-07-30
input: _bmad-output/planning-artifacts/research/technical-windy-api-google-maps-stack-research-2026-07-30.md
targets:
  - _bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/prd.md
  - _bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/addendum.md
---

# Quellen-Abgleich: Tech-Recherche → PRD/Addendum

**Input:** `technical-windy-api-google-maps-stack-research-2026-07-30.md` (Tech-Stack-Recherche: Windy API, Open-Meteo, Karten-Stack, Datenquellen)
**Abgeglichen gegen:** `prd.md` + `addendum.md` (prd-sailgreece-router-2026-07-30)
**Datum:** 2026-07-30

## Vorbemerkung: Bewusste Abweichungen (kein Befund)

Zwei Recherche-Empfehlungen wurden vom Product Owner bewusst überstimmt und sind
**korrekt und transparent im Addendum dokumentiert** — sie zählen nicht als Lücke:

1. **Google Maps statt Leaflet + OSM** — Addendum „Karten-Stack-Entscheidung": Abweichung
   explizit benannt, Gründe (Optik, Satellitenbilder der Buchten) und die bekannten Kosten
   der Entscheidung (Billing-Setup ~1–2 h, Dashed-Line-Symbol-Workaround, Free-Tier
   10.000 Loads/Monat) sind aus der Recherche übernommen. Sauber.
2. **Echte Datenbank statt statischer JSON-Dateien** — Addendum „Datenbank-Entscheidung":
   der ursprüngliche Recherche-Vorschlag ist als überholter Kontrast dokumentiert, die
   Recherche-Argumente bleiben als Risiko-Hinweis erhalten. Sauber.

## Abgleich im Detail

### 1. Open-Meteo (Recherche §1.2, §5)

| Recherche-Erkenntnis | Status im PRD/Addendum |
|---|---|
| Forecast-API: Wind 10 m, Böen, Richtung; ECMWF/GFS/ICON einzeln abfragbar | **Angekommen** — FR11 wörtlich abgedeckt |
| Marine-API: Wellenhöhe/-richtung/-periode inkl. Swell | **Angekommen** — FR12 |
| Client-Caching (TTL 1–3 h), Datenstand sichtbar | **Angekommen** — FR13, NFR5 |
| Kein SLA im Free-Tier → akzeptiertes Restrisiko | **Angekommen** — NFR5 (Risiko akzeptiert) |
| **Limit 10.000 Calls/Tag** (mit Rechenbeispiel ~160 Calls/Aktualisierung) | **FEHLT** — weder PRD noch Addendum nennen das Limit oder das Call-Budget. Für die Architektur-Phase relevant (Polling-/Cache-Design, Multi-Location-Requests) |
| **Lizenz CC BY 4.0** (Attributionspflicht in der App) + **nur nicht-kommerzielle Nutzung** frei | **FEHLT** — keine Attributions- oder Nutzungsbedingung im PRD. FR6 verlangt Lizenzsauberkeit nur für Fotos; die Datenlizenz der Kern-Wetterquelle ist ungenannt |
| Kein API-Key, CORS-freundlich (direkt aus dem Browser) | **Fehlt** (nur implizit) — vertretbar als Architektur-Detail, sollte aber in die Architektur-Phase mitgehen |
| **Fallback bei Ausfall**: zweiter kostenloser Anbieter (z. B. DWD/NOAA direkt) | **FEHLT** — NFR5 akzeptiert das Restrisiko, nennt aber den in der Recherche skizzierten Fallback-Pfad nicht. Sollte mindestens als Option in NFR5/Offene Punkte stehen |
| Marine-Modelle für Mittelmeer: DWD EWAM ~5 km, MFWAM ~8 km, ECMWF WAM 0,25° | Fehlt — Architektur-Detail, unkritisch fürs PRD, aber für die Modellwahl in FR12 nützlich |

### 2. ICON-EU / Düseneffekte / Modellgüte (Recherche §1.3, §5)

| Recherche-Erkenntnis | Status im PRD/Addendum |
|---|---|
| Globale 0,25°-Modelle glätten die Kanal-Düseneffekte; **ICON-EU (~7 km) als hochauflösende Ergänzung einplanen** | **Teilweise / unpräzise** — FR11 sagt nur „ICON". Die Recherche-Pointe ist gerade die hochauflösende Variante **ICON-EU**; Open-Meteo bietet ICON, ICON-EU und ICON-D2 getrennt an. Präzisierung in FR11 empfohlen |
| Düsenzonen als **statische Warn-Attribute** an Etappen (statt Modellvertrauen) | **Angekommen** — FR10 setzt genau das um |
| Zonenliste: §1.3 nennt Kea-Kanal, Paros–Naxos, **Mykonos–Paros**; §5 nennt Kea, Paros–Antiparos, Paros–Naxos, Kafireas | **Teilweise** — FR10 übernimmt die §5-Liste; **Mykonos–Paros fehlt**. Bei der Kuration prüfen, ob die Zone im Törn-Korridor liegt |
| AROME deckt Griechenland nicht ab | Angekommen (implizit) — AROME taucht im PRD nicht auf; kein Handlungsbedarf |
| ECMWF im Langzeitvergleich genauer als GFS; lokale Gegenchecks Poseidon (HCMR), meteo.gr, HNMS | Fehlt — nice-to-have; die lokalen Gegencheck-Quellen könnten als Hinweis in FR14 oder ins Addendum (Wetter-Workflow) |

### 3. Kuratierungsstrategie & Quellen (Recherche §3)

| Recherche-Erkenntnis | Status im PRD/Addendum |
|---|---|
| Keine offene Quelle für Schutzprofile → manuelle Kuration | **Angekommen** — E3, FR23, NFR6 |
| Quellenliste: Heikell *Greek Waters Pilot* (15. Aufl. 2025), CruisersWiki, sailingissues.com, Charter-Itineraries; Gegencheck Navily/mySea | **Angekommen** — FR23 + Addendum (Seeding-Pipeline) vollständig |
| Primäre Schutzlogik: explizite Sektoren aus Heikell/CruisersWiki + Lee/Luv-Regel → deterministische Ampel | **Angekommen** — FR7/FR8 wörtlich |
| Wind-Fetch-Heuristik nur als Fallback für unkuratierte Plätze | **Angekommen** — bewusst in „Außerhalb des Scopes" geparkt, konsistent mit NFR6 (keine grüne Ampel für unkuratierte Plätze) |
| Aufwand Kuration 1–2 Tage, parallelisierbar | **Angekommen** — Addendum |
| Heikell-Kaufempfehlung (~£65) | **Angekommen** — Offene Punkte |
| **OSM/Overpass als maschinelles Grundgerüst der Platz-Positionen (ODbL)** | **FEHLT** — die Quellen-Tabelle der Recherche hat OSM als ersten Baustein (Positionen/IDs); FR23 und das Addendum nennen OSM/Overpass nicht. Für die Seeding-Pipeline relevant (Koordinaten kommen sonst nur aus dem Brief-Addendum) |
| **Lizenzgrenzen der Quellen**: Heikell — Fakten extrahierbar, Texte/Pläne nicht; CruisersWiki — CC 3.0 mit Attribution; Navily/mySea — proprietär, nur manueller Gegencheck | **FEHLT** — gerade weil FR23 eine **KI-gestützte Voll-Befüllung** vorsieht, gehören die Extraktionsgrenzen (nur Fakten, keine Textübernahme; Attributionspflicht CruisersWiki) als Leitplanke in FR23/FR25 oder das Addendum |

### 4. Google Maps: Kosten & Workarounds (Recherche §2)

| Recherche-Erkenntnis | Status im PRD/Addendum |
|---|---|
| Billing-/Key-Setup ~1–2 h | **Angekommen** — Addendum |
| Gestrichelte Linien nur via Symbol-Workaround (`repeat`-Icons) | **Angekommen** — Addendum |
| Free-Tier 10.000 Map-Loads/Monat, für Solo-Nutzung unkritisch | **Angekommen** — Addendum |
| Kosten jenseits Free-Tier: 7 $/1.000 Loads | Fehlt — verschmerzbar (Free-Tier reicht laut beiden Dokumenten), eine Zeile im Addendum würde die Abwägung komplettieren |
| Satellit/Hybrid als Google-Pluspunkt für Buchten-Optik | **Angekommen** — FR1 + Addendum (Entscheidungsgrund) |
| Windpfeile via Symbol-`rotation`/AdvancedMarker | Fehlt — Architektur-Detail, unkritisch |

### 5. Risiken & offene Punkte (Recherche §5)

| Recherche-Risiko | Status im PRD/Addendum |
|---|---|
| **Preisangaben Windy/Google teils aus Sekundärquellen (proxy-blockiert) — vor Zahlungs-/Billing-Entscheidung manuell auf der Original-Pricing-Seite verifizieren** | **FEHLT** — nirgends übernommen. Da die Google-Billing-Einrichtung (Kreditkarte!) laut Addendum ansteht, gehört dieser Verifikations-Schritt in „Offene Punkte" |
| Open-Meteo kein SLA | Angekommen — NFR5 |
| Open-Meteo-**Fallback** (DWD/NOAA direkt) | **FEHLT** — siehe Abschnitt 1 |
| Düsenzonen als statische Warn-Attribute | Angekommen — FR10 |
| OSM-Tile-Policy | Obsolet — durch Google-Maps-Entscheidung gegenstandslos; kein Handlungsbedarf |

### 6. Verworfene Optionen (Recherche §1.1, §2, §4)

- **Windy API verworfen** (Jahresabo ~990 €, kein ECMWF, Trial-Daten verfälscht): korrekt
  umgesetzt — das PRD baut vollständig auf Open-Meteo; Windy bleibt als Parallel-Tool
  (NFR3), genau wie die Recherche empfiehlt. Konsistent.
- **Windy-Map-Embed hinter Feature-Flag** (optionale Recherche-Idee): stillschweigend
  entfallen. Vertretbar (war „optional", Lizenz-Graubereich), aber nirgends als bewusst
  verworfen dokumentiert — Mini-Lücke ohne Priorität.
- **Statisches Hosting (GitHub Pages/Netlify/Vercel Free)**: durch die DB-Entscheidung
  überholt; Vercel taucht als DB-Kandidat in NFR4 wieder auf. Konsistent.

## Verfälschungen

**Keine inhaltlichen Verfälschungen gefunden.** Alle übernommenen Zahlen (25-kn-Schwelle,
6 h/10–12 h-Budgets, ~25–35 Plätze, 1–2 Tage Kuration, TTL 1–3 h, 10.000 Loads/Monat,
~£65 Heikell) stimmen mit der Recherche überein. Zwei Präzisions-Anmerkungen:

1. **„ICON" statt „ICON-EU"** (FR11): keine Verfälschung, aber ein Präzisionsverlust mit
   fachlicher Konsequenz (Düseneffekte-Auflösung) — siehe Abschnitt 2.
2. PRD §1 nennt „brutales Aufkreuzen bei über 30 Knoten", FR16 verdrahtet >25 kn. Beide
   Werte stammen aus dem Brief-Kontext, die Recherche bestätigt 25 kn als Scoring-Schwelle;
   die 30 kn in der Problembeschreibung sind erzählerisch, könnten aber als Inkonsistenz
   gelesen werden. Empfehlung: in §1 auf die 25-kn-Schwelle angleichen oder als „jenseits
   der 25-kn-Grenze" formulieren. (Kein Recherche-Widerspruch, nur interne Kosmetik.)

## Lücken priorisiert (Empfehlung)

| # | Lücke | Schwere | Vorschlag |
|---|---|---|---|
| 1 | Open-Meteo-Konditionen unvollständig: 10.000-Calls/Tag-Limit, CC-BY-4.0-Attributionspflicht, „frei nur nicht-kommerziell" fehlen | Mittel-Hoch | NFR5 ergänzen (Limit + Lizenz/Attribution); Call-Budget-Rechenbeispiel ins Addendum |
| 2 | Risiko „Preisangaben unverifiziert" (Google/Windy, Sekundärquellen) nicht übernommen | Mittel | „Offene Punkte": vor Google-Billing-Setup Pricing manuell verifizieren |
| 3 | Open-Meteo-Fallback (DWD/NOAA direkt) aus Recherche-Risiken fehlt | Mittel | NFR5 um Fallback-Hinweis ergänzen (kein MVP-Feature, nur benannter Plan B) |
| 4 | ICON-EU-Präzision verloren (FR11: nur „ICON"); Düsenzone Mykonos–Paros fehlt in FR10 | Mittel | FR11: „ICON/ICON-EU"; FR10-Zonenliste bei Kuration gegen §1.3 prüfen |
| 5 | Kurationsquellen: OSM/Overpass (ODbL) als Positions-Grundgerüst und Lizenzgrenzen (Heikell nur Fakten, CruisersWiki CC-3.0-Attribution) fehlen in FR23/FR25 | Mittel | Addendum Seeding-Pipeline: Quellen-Lizenz-Tabelle der Recherche übernehmen |
| 6 | Kleinigkeiten: Google-Preis jenseits Free-Tier (7 $/1.000), lokale Gegencheck-Quellen (Poseidon/meteo.gr/HNMS), Windy-Embed als bewusst verworfen dokumentieren | Niedrig | je eine Zeile im Addendum, optional |

## Fazit

Der Kern der Recherche ist gut im PRD angekommen: Open-Meteo als Datenquelle (FR11–FR14),
deterministische Schutzampel mit Kurationsstrategie und Quellen (FR7/FR8/FR23), statische
Düsenzonen-Warnungen (FR10), Wind-Fetch nur als geparkter Fallback, und beide bewussten
Abweichungen (Google Maps, Datenbank) sind vorbildlich mit Kosten/Kontrast im Addendum
dokumentiert. Was fehlt, ist fast ausschließlich die **Betriebs- und Lizenz-Randschicht**:
Open-Meteo-Limit und CC-BY-Attribution, der Verifikations-Vorbehalt bei Preisangaben,
der benannte Forecast-Fallback sowie die Lizenzgrenzen der Kurationsquellen — alles mit
wenigen Zeilen in NFR5, FR23/FR25 und „Offene Punkte" schließbar.
