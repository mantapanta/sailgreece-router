---
title: "Quellen-Abgleich: Brief-Addendum ↔ PRD sailgreece-router"
status: review
created: 2026-07-30
input: ../../briefs/brief-sailgreece-router-2026-07-30/addendum.md
targets:
  - prd.md
  - addendum.md
---

# Quellen-Abgleich: Brief-Addendum → PRD + PRD-Addendum

**Prüfauftrag:** Das PDF-Planungs-Framing (feste Kalender-Gates, „Plan A/B") wurde bewusst
verworfen; die Daten (Distanzen, Häfen, Koordinaten, Düsenzonen, Schutzhinweise) sollen
als Kurations-Seed für die Bibliotheken erhalten bleiben. Geprüft wird: (a) Ist der Weg
dieser Daten in die Kurations-Pipeline klar verankert? (b) Gehen sicherheitsrelevante
Details verloren? (c) Was gehört ins PRD (Capability/Scope) vs. Addendum vs. bewusst weg?

**Gesamturteil:** Das verworfene Framing ist sauber ersetzt (Gates → FR20 dynamische
Entscheidungspunkte; Plan B → FR9 gedeckelte Variante; Pauschalgeschwindigkeiten →
FR26-Fallback). Der Seed-Pfad für **Plätze** ist verankert, für die **mitreisenden
Detail-Daten** (Schutzhinweise, Gefahrzonen, Engpässe, Exit-Logistik) aber nur implizit
oder gar nicht. Fünf Befunde sind sicherheits- bzw. planungsrelevant (L1–L5).

---

## 1. Abgleich-Matrix

Legende: ✅ verankert · 🟡 nur implizit/teilweise · ❌ fehlt · ⛔ bewusst verworfen (ok)

### Quelle 1 — Etappenpläne, Gates, Wind-Szenarien, Exit-Logistik

| # | Brief-Addendum-Element | PRD / PRD-Addendum | Status |
|---|---|---|---|
| 1.1 | Etappenplan Plan A (Tagesetappen, Distanzen, Dauern) | FR9 „kuratierte Best-Practice-Routen … mit Distanzen"; Süd-Route bis Naxos abgedeckt | 🟡 Route ja, aber Etappenplan/Distanzmatrix nicht als benannter Seed-Input (→ L1); Distanzen sind **Lavrion-basiert**, PRD rechnet ab **Alimos** (→ L5) |
| 1.2 | Optionen Naxos→Santorin ~51 sm / Naxos→Amorgos ~31 sm | FR9 Verlängerungsoptionen Amorgos/Santorin | ✅ (Distanzwerte via Seed, siehe L1) |
| 1.3 | Rückweg-Distanzen (Naxos→Lavrion 79 / Naxos→Alimos 103 / Santorin→Lavrion 115 / Amorgos→Lavrion 110) | FR19 nutzt nur „~103 sm ab Naxos" nach Alimos | 🟡 Santorin/Amorgos→**Alimos** existiert in keiner Quelle; Rückweg-Distanzen der Verlängerungsoptionen müssen in der Kuration neu bezogen werden (→ L5) |
| 1.4 | Basisdistanzen bis Kea (Lavrion 14 / Alimos 36 / Rafina 29) | PRD setzt Basis fix = Alimos; Lavrion/Rafina als Alternativbasen nicht erwähnt | 🟡 Wenn Alimos vertraglich fix ist: ok. Tag‑1‑Etappe wird dann ~36 statt ~14 sm — der Seed-Etappenplan trägt nicht 1:1 (→ L5) |
| 1.5 | Kalender-Gates T−5…Tag 10 | FR20: Entscheidungspunkte **dynamisch berechnet, keine fest verdrahteten Kalender-Gates** | ⛔ bewusst ersetzt — korrekt und explizit dokumentiert |
| 1.6 | Plan B (Deckel Paros/Antiparos, Paros = südlichster fester Punkt) | FR9 „gedeckelte Variante bis Paros/Antiparos" | ✅ |
| 1.7 | **Eskalationsleiter starker Meltemi** (4 Stufen: früh umdrehen → Familien-Exit Naxos/Paros → Exit Santorin → Amorgos nur mit vorgedachtem Fähr-Exit via Naxos) | Nirgends. FR20-Beispiel nennt nur „Doppel-Fenster" für Amorgos; der Fähr-Exit-Vorbehalt fehlt | ❌ → L3 |
| 1.8 | Wind-Szenarien schwach/moderat/stark → Routenkonsequenz | Konzeptionell in FR15–FR20 (Scoring + Optionsraum) aufgegangen | ✅ (als Mechanik statt Szenario-Tabelle — angemessen) |
| 1.9 | Exponierte Zonen: Kafireas, **Andros/Tinos-Sektor**, Insel-Beschleunigungszonen | FR10 nennt Kea-Kanal, Kafireas, Paros–Antiparos, Paros–Naxos | 🟡 Andros/Tinos-Sektor fehlt; generische „Insel-Beschleunigungszonen" nur als Beispielliste (→ L2) |
| 1.10 | Planungsgeschwindigkeiten 6,0/7,5/6,5 kn | FR26: Polare primär, Pauschalwerte als Fallback; PRD-Addendum dokumentiert Polare inkl. Verifikationsvorbehalt | ✅ vorbildlich (inkl. Konservativitäts-Beobachtung) |
| 1.11 | Komfortregeln 50-ft-Kat/Familie (konservative Etappen, frühe Starts, lieber motoren; **Nachtläufe nur als Delivery mit Reduktionscrew**) | FR16: >25 kn kein Aufkreuzen, max 6 h/Tag, Nachtetappen bei Leichtwind „wenn strategisch" | 🟡 Kern verdrahtet; die Bedingung „Nachtlauf nur als Delivery mit Reduktionscrew" ist zur weicheren Leichtwind-Regel geworden — Familien-an-Bord-Nachtlauf ist im PRD nicht explizit ausgeschlossen (→ L3, Teilaspekt) |
| 1.12 | Wetter-Workflow (ECMWF Charts → Windy Compare → PredictWind → Meteo.gr → HNMS) | FR11–FR14: Open-Meteo mit ECMWF/GFS/ICON einzeln + Modellvergleich; Windy bleibt parallel (NFR3) | ⛔ bewusst reduziert — Kernprinzip „Modell-Gleichlauf = Vertrauen" ist als FR14 erhalten. PredictWind/HNMS/Meteo.gr entfallen ersatzlos (vertretbar; HNMS-Morgencheck bleibt Praxis außerhalb der App) |
| 1.13 | Timing: Start 8.8., Vorentscheid 3.–5.8., Rückkehr Vorabend | E2, UM-3, FR19, Meilensteine | ✅ |
| 1.14 | „Rückkehrzeit **vertraglich bestätigen**" (Alimos-Beispiel 18:00) | FR19 nennt „Vorabend der Ausschiffung", der Bestätigungs-Vorbehalt fehlt in den Offenen Punkten | 🟡 → L5 (kleiner, aber der Point of Return rechnet gegen genau diese Deadline) |
| 1.15 | Fährverbindungen (Seajets/Blue Star/Golden Star mit Zeiten), Direktflüge Naxos/Paros/Santorin, Notruf 112/108 | Nirgends | ❌ Fahrpläne + Notrufnummern: bewusst weglassbar (volatil bzw. außerhalb App-Zweck). Aber die **Eigenschaft „Exit-fähiger Hafen"** (Fähre/Flug nach Athen) ist statisches, planungsrelevantes Platz-Attribut → L3 |
| 1.16 | Häfen-Kernliste (Basen + Rückfallhäfen-Kette) | FR9 Rückfallhäfen-Kette; PRD-Addendum „Startliste … Hafen-Kernliste + Zielkatalog" | ✅ |
| 1.17 | Vlychada-Restriktion (max ~15 m/2,5 m, grenzwertig für 50-ft-Kat) + Konflikt mit Quelle 2 („Santorini per Kiel vermeiden") | PRD Offene Punkte: Konflikt **explizit entschieden** (Santorin bleibt Bootsschlag), Warn-Attribut + telefonische Vorabklärung, Option nur „offen" bei bestätigtem Liegeplatz | ✅ vorbildlich — Muster, wie L4 behandelt werden sollte |
| 1.18 | Katapola guter Meltemi-Schutz; **Naxos Marina Juli/Aug Engpass**; Parikia ~27 Fähranläufe/Tag | Katapola: implizit via Seed. Naxos-Engpass + Parikia-Fährschwell: nirgends | ❌ → L4 |

### Quelle 2 — Revierinfos, Zielkatalog, Distanzmatrix, Praxis

| # | Brief-Addendum-Element | PRD / PRD-Addendum | Status |
|---|---|---|---|
| 2.1 | Reviercharakteristik (Kykladen 6–8 Bft, Saronisch 4–6 Bft milder) | PRD Abschnitt 1 + FR9 Saronische Schwachwind-Alternative | ✅ |
| 2.2 | **Meltemi flaut abends oft ab**, weht tagsüber aus N | Nirgends | 🟡 relevant für FR8-Übernachtungszeitfenster und „frühe Starts" (FR16-Rationale) — gehört als Kurations-/Scoring-Hinweis ins PRD-Addendum |
| 2.3 | Düseneffekte explizit: **Lavrion↔Makronisos**, Paros↔Antiparos, Paros↔Naxos | FR10 („Kea-Kanal" deckt Makronisos-Zone sinngemäß, Rest benannt) | ✅ (Benennungs-Mapping in Kuration klarstellen) |
| 2.4 | **Fallwinde** in Buchten und an der Peloponnes-Küste südlich Nafplion | Nirgends — obwohl FR9 die Saronisch/Argolische Alternative bis Nafplion/Monemvasia umfasst | ❌ → L2 |
| 2.5 | Sommer-Regel: Uhrzeigersinn, ⅔ der Zeit für den Rückweg | ⅔-Regel in Abschnitt 1; Uhrzeigersinn implizit in FR9-Routengeometrie | ✅ |
| 2.6 | Santorini per Kiel vermeiden, Vlychada oft versandet → Fähre ab Paros | Offene Punkte: bewusst überstimmt (dokumentiert). „**oft versandet**" (aktuelle Tiefe!) verschärft die Vorabklärung — im PRD steht nur die Formal-Restriktion | 🟡 Versandungs-Hinweis in den Offenen Punkt bzw. das Warn-Attribut aufnehmen |
| 2.7 | Schutz-Detailwissen: Folegandros/Karavostasi kaum Schutz (Fallback Vathi), Ios sicher außer Südwind, Parikia = Schutzhafen, Vourkari sehr gut geschützt, Ermoupolis Fährschwell, Finikas gut, Adamas Naturhafen, Kleine Kykladen „kurze Distanzen, gut für Familien" | Nur implizit: PRD-Addendum-Startliste referenziert „Zielkatalog mit Koordinaten" — die **mitgelieferten Schutz-/Qualitätshinweise** sind nicht als Seed benannt; FR23-Quellenliste nennt das Brief-Addendum nicht | 🟡 → L1 (Kern des Befunds) |
| 2.8 | **Passage Attika↔Kea: besondere Vorsicht (Wracks)** | Nirgends — FR10-Warnattribute kennen nur Düsen-/Beschleunigungszonen | ❌ → L2 |
| 2.9 | Zielkatalog mit Koordinaten (Kykladen + Saronisch/Argolisch) | PRD-Addendum Startliste ✅; Saronische Plätze via FR9-Alternative abgedeckt | ✅ |
| 2.10 | Distanzmatrix-Auszüge + Hinweis abweichende Distanzen/Schreibweisen | FR25 Normalisierung („Merichas/Mericha", Bezugspunkt-Vereinheitlichung); PRD-Addendum Pipeline Schritt 3 verweist auf Brief-Addendum | ✅ (Distanzen selbst → L1) |
| 2.11 | Rastergrafik-Hinweis (2 Entfernungskarten nicht maschinell extrahiert) | Nirgends | 🟡 Kurations-Notiz: diese Werte fehlen im Seed und müssen aus Sekundärquellen kommen — ins PRD-Addendum (Pipeline) |
| 2.12 | Tools My-Sea/Navily/Portbooker | FR23 Gegencheck Navily/mySea | ✅ (Portbooker entfällt — unkritisch) |
| 2.13 | Ortszeit UTC+3 | Nirgends | 🟡 Implementierungsdetail für Forecast-Zeitfenster (FR8/FR15) — Architektur-Phase, eine Zeile im PRD-Addendum genügt |
| 2.14 | Ankergrund Sand ohne Seegras | Nirgends | 🟡 Kurationsfeld fürs Schutzprofil/Ankerqualität — Seed-Hinweis (L1-Beifang) |
| 2.15 | **Wasserarme Kykladen — sparsam bunkern** | Nirgends | ❌ → L5-Beifang: „Wasser verfügbar" als Platz-Attribut oder bewusster Out-of-Scope-Eintrag; aktuell stillschweigend verloren |

---

## 2. Befunde (Lücken), priorisiert

### L1 — Der Seed-Pfad ist nur für Platz-*Namen* verankert, nicht für das mitreisende Detailwissen (strukturell, hohe Priorität)

FR23 zählt als Recherche-Quellen Heikell, CruisersWiki, sailingissues.com,
Charter-Itineraries, Navily/mySea — **das Brief-Addendum selbst fehlt in der Liste**.
Das PRD-Addendum nennt es nur als „Startliste" (Platznamen + Koordinaten). Damit hängen
alle bereits extrahierten Detail-Daten in der Luft: Schutzhinweise (2.7), Distanzmatrix
(2.10), Etappenpläne (1.1), Düsen-Mapping (2.3), Engpässe (1.18), Exit-Häfen (1.15),
Ankergrund (2.14). Risiko: Die KI-Recherche startet bei null, und vom Nutzer bereits
validiertes Quellwissen (aus seinen eigenen PDFs) wird nicht gegen die Recherche
abgeglichen — genau die Daten, deretwegen das Framing-Verwerfen ausdrücklich *nicht*
Daten-Verwerfen sein sollte.
**Fix:** FR23 um „Seed/Primär-Abgleich: Brief-Addendum (Quellen 1+2)" ergänzen; im
PRD-Addendum Pipeline-Schritt 1 das Brief-Addendum als Input Nr. 0 mit allen sieben
Datenklassen benennen.

### L2 — Gefahren-Kategorie fehlt: Wracks Attika–Kea, Fallwinde, Andros/Tinos-Sektor (sicherheitsrelevant)

FR10 modelliert statische Warn-Attribute **nur für Düsen-/Beschleunigungszonen**. Verloren
gehen: (a) **Wracks in der Passage Attika↔Kea** — die allererste Etappe jedes Törns und
jeder Rückkehr; (b) **Fallwinde** in Buchten und an der Peloponnes-Küste südlich Nafplion —
mitten in der Saronisch/Argolischen Schwachwind-Alternative, die FR9 explizit fordert;
(c) der **Andros/Tinos-Sektor** aus der Exponierte-Zonen-Liste.
**Fix (PRD, FR10):** Warn-Attribute von „Düsenzonen" auf Kategorien verallgemeinern
(Düse/Beschleunigung · Hindernis/Wrack · Fallwind/Kap-Effekt) und die drei fehlenden
Zonen als Mindestabdeckung nennen. Kein neues Feature — dasselbe statische Attribut,
eine Kategorie mehr.

### L3 — Eskalationsleiter/Exit-Logistik: der app-relevante Kern fehlt (sicherheitsrelevant)

Die vierstufige Eskalationsleiter ist als menschliches Playbook zu Recht nicht als
Feature verdrahtet. Aber zwei Bestandteile sind Daten bzw. Logik, auf denen das PRD
bereits implizit aufbaut:
1. **Exit-fähige Häfen** (Fähre/Flug nach Athen: Naxos, Paros, Santorin; Amorgos nur
   via Fähr-Umweg Naxos) — das FR20-Beispiel („Amorgos nur bei Doppel-Fenster") ist
   ohne den Fähr-Exit-Vorbehalt der Quelle unvollständig, und die Stufen 2–4 der Leiter
   sind ohne dieses Platz-Attribut nicht besprechbar. → **PRD:** FR6 um ein statisches
   Attribut „Exit-Option (Fähre/Flug Athen)" ergänzen; Fahrpläne/Notrufnummern bleiben
   bewusst draußen (volatil, nicht App-Zweck) — als solche im Addendum vermerken.
2. **Nachtlauf-Bedingung:** Quelle sagt „Nachtläufe **nur** als Delivery mit
   Reduktionscrew"; FR16 erlaubt Nachtetappen bei Leichtwind „wenn strategisch" —
   die Familien-Restriktion ist stillschweigend entfallen. → **PRD (FR16):** eine
   Halbzeile: Nachtetappen gelten als Delivery-Modus (Reduktionscrew), nicht als
   Familien-Etappe.

### L4 — Naxos-Marina-Engpass & Parikia-Fährschwell fehlen als Warn-Attribut (planungsrelevant)

Naxos ist Dreh- und Angelpunkt des gesamten Optionsraums (Entscheidungs-Hub, Exit-Hafen,
Start der Verlängerungen) — und die Quelle warnt ausdrücklich: **Marina im Juli/August
Engpass**. Parikia (der explizite Meltemi-Schutzhafen der Route) hat ~27 Fähranläufe/Tag.
Vlychada hat für dieselbe Problemklasse bereits die Musterlösung bekommen (Warn-Attribut
+ Vorabklärung, Offener Punkt) — Naxos und Parikia gingen leer aus.
**Fix:** Kapazitäts-/Komfort-Warnattribut am Platz (FR6-Kuration, keine neue FR nötig);
Naxos-Liegeplatz-Frage analog Vlychada in die Offenen Punkte (ggf. gleiche telefonische
Vorabklärung).

### L5 — Basis-Rebasing Lavrion→Alimos + Vertragsdeadline nicht abgesichert (Konsistenz)

Der komplette Seed-Etappenplan und drei von vier Rückweg-Distanzen sind **Lavrion-basiert**
(Lavrion→Kea 14 sm); das PRD rechnet fix **ab/nach Alimos** (Alimos→Kea 36 sm, +22 sm am
ersten und letzten Tag; Santorin/Amorgos→Alimos existiert in keiner Quelle). FR25
normalisiert „abweichende Distanzangaben", adressiert aber nicht das Rebasing auf die
Alimos-Basis. Zudem fehlt der Quell-Vorbehalt „Rückkehrzeit **vertraglich bestätigen**"
in den Offenen Punkten — der Predicted Point of Return (FR19, Kern-Feature) rechnet gegen
genau diese Deadline. Beifang: „Wasserarme Kykladen — sparsam bunkern" (2.15) ist komplett
verloren; als Platz-Attribut „Wasser verfügbar" in die Kuration oder als bewusste
Auslassung dokumentieren.
**Fix:** FR25 um Basis-Rebasing ergänzen (bzw. Kurations-Notiz im PRD-Addendum);
Offener Punkt „Ausschiffungs-Deadline vertraglich bestätigen (Alimos, Vorabend, Uhrzeit)".

---

## 3. Einordnung: PRD vs. Addendum vs. bewusst weggelassen

### Gehört ins PRD (Capability/Scope-Ebene)

- **FR10-Erweiterung** um Gefahren-Kategorien (Wrack/Hindernis, Fallwind) + Zonen
  Attika–Kea, Peloponnes südl. Nafplion, Andros/Tinos (L2).
- **FR6-Attribute:** Exit-Option (Fähre/Flug), Kapazitäts-/Engpass-Warnung,
  optional Wasser-Verfügbarkeit (L3, L4, L5).
- **FR16-Präzisierung:** Nachtetappen = Delivery-Modus mit Reduktionscrew (L3).
- **FR23-Ergänzung:** Brief-Addendum als benannte Seed-/Abgleichquelle (L1).
- **FR25-Ergänzung:** Distanz-Rebasing auf die Alimos-Basis (L5).
- **Offene Punkte:** Naxos-Liegeplatz-Vorabklärung (analog Vlychada);
  Ausschiffungs-Deadline vertraglich bestätigen; Vlychada-Warnattribut um
  „oft versandet" (aktuelle Tiefe erfragen) schärfen (L4, L5, 2.6).

### Gehört ins PRD-Addendum (Detail für Downstream)

- Seeding-Pipeline: Brief-Addendum als Input Nr. 0 mit Datenklassen-Liste
  (Plätze+Koordinaten, Schutzhinweise, Distanzmatrix inkl. Quellendifferenzen,
  Etappenpläne als Routen-Rohmaterial, Düsen-/Gefahrzonen, Engpass-/Exit-Daten,
  Ankergrund/Wasser); Hinweis Rastergrafik-Distanzen nicht extrahiert (2.11).
- Namens-Mapping Düsenzonen (Kea-Kanal ↔ Lavrion↔Makronisos).
- Meltemi-Tagesgang (abends abflauend) als Scoring-/Zeitfenster-Hinweis (2.2).
- Zeitzone UTC+3 für Forecast-Zeitfenster (2.13).
- Eskalationsleiter als dokumentiertes Domänen-Playbook (Referenz, nicht Feature) —
  damit die vier Stufen im UX-Wording der Entscheidungspunkte wiederauffindbar sind.

### Bewusst weggelassen — korrekt (bestätigen, nicht ändern)

- Feste Kalender-Gates und Plan-A/B-Nomenklatur (ersetzt durch FR9-Möglichkeitsraum +
  FR18/FR20-Dynamik) — die Ersetzung ist im PRD sogar explizit begründet.
- Fünf-Tool-Wetter-Workflow inkl. PredictWind/Meteo.gr/HNMS (ersetzt durch Open-Meteo
  3-Modell-Vergleich, FR14-Prinzip „Gleichlauf = Vertrauen" bleibt; Windy parallel per NFR3).
- Konkrete Fährfahrpläne und Notrufnummern 112/108 (volatil bzw. außerhalb des
  App-Zwecks „Planung, nicht Navigation/Notfall") — Empfehlung: als bewusste Auslassung
  eine Zeile in Abschnitt 7 des PRD, damit es nicht als Versehen gelesen wird.
- Portbooker.com als Tool-Empfehlung (Navily/mySea reichen als Gegencheck).

---

## 4. Positivbefunde (kein Handlungsbedarf)

- **Vlychada/Santorin:** Der Quellenkonflikt (Q1 grenzwertig möglich vs. Q2 vermeiden)
  ist im PRD explizit entschieden, mit Warn-Attribut, Vorabklärungs-Auflage und
  Bedingung an den Optionsstatus — genau das richtige Muster.
- **Polardiagramm:** Pauschalwerte des Briefs sauber zu FR26-Fallback degradiert,
  Polare inkl. Verifikationsvorbehalt und Konservativitäts-Beobachtung im PRD-Addendum.
- **Distanz-/Schreibweisen-Normalisierung:** FR25 + Pipeline-Schritt 3 referenzieren
  den Quellendifferenz-Hinweis des Brief-Addendums direkt.
- **⅔-Rückweg-Regel und Meltemi-Charakteristik** tragen die Problemdarstellung des PRD.
- **Saronische Schwachwind-Alternative** samt Zielkatalog ist als Pflichtabdeckung in
  FR9 verankert.
