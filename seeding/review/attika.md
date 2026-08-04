# Review: Attische Küste (`attika`)

Status: **FREIGEGEBEN** (`approved: true`)

Quelle der Datei: Deep-Research Lauf 1 vom 2026-08-03 (Heikell Greek Waters Pilot 14. Aufl. S. 92/98/102 — Seitenangaben unverifiziert; CruisersWiki Attika Coast; D-Marin Zea; Alimos Marina Guide 2024). Neu aufgenommen als Festlandküste. WICHTIG: Der Bericht lieferte Marina Alimos hier als 'attika-alimos' — dieser Platz wurde VERWORFEN, weil er als 'athen-alimos' bereits existiert und in routes.json sowie config.json (baseIslandId/basePlaceId) referenziert wird. Diese Datei enthält nur die drei zusätzlichen Festlandplätze.

> FR24: Sichere Liegeplätze zuerst prüfen — sie steuern die Nacht-Ampel. Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.

## Plätze (3)

### Lavrion (`attika-lavrion`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 200°–140° (Wrap über Nord), bis 35 kn |
| Welle | geschützt aus 200°–140° (Wrap über Nord), bis 0.4 m |

Quelle: Deep-Research Lauf 1 (Heikell 14. Aufl. S. 102, CruisersWiki Attika Coast): Öffnung nach S, Sektor 200–140, maxKn 35 — Sektor und Öffnungsrichtung konsistent, unverändert übernommen.

Koordinaten: 37.7125, 24.0560 · Qualitäten: Schönheit 3/5, Restaurant 4/5, Badestrand 2/5

Warnungen: ⚠ Seegras im Hafengrund — Anker gründlich einfahren, Kette lang stecken · ⚠ Große Fähren legen am Nordkai an, Gewerbekai freihalten · ⚠ Schwell bei starkem Südwind

### Kap Sounion (`attika-sounion`, bucht)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 220°–120° (Wrap über Nord), bis 30 kn |
| Welle | geschützt aus 220°–120° (Wrap über Nord), bis 0.5 m |

Quelle: Deep-Research Lauf 1 (Heikell 14. Aufl. S. 98, CruisersWiki Attika Coast): Öffnung nach S bis SW, Sektor 220–120, maxKn 30 — Sektor und Öffnungsrichtung konsistent, unverändert übernommen.

Koordinaten: 37.6515, 24.0242 · Qualitäten: Schönheit 5/5, Restaurant 3/5, Badestrand 4/5

Warnungen: ⚠ Starke Fallböen von den Hügeln bei Meltemi — reichlich Kette stecken · ⚠ Passierende Fähren nach Lavrion erzeugen leichten Schwell · ⚠ Liegt direkt an der Kap-Sounion-Düse, siehe Etappen-Warnungen

### Marina Zea (Piräus) (`attika-zea`, marina)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | **RUNDUMSCHUTZ (0°–360°, alle Richtungen!)**, bis 40 kn |
| Welle | **RUNDUMSCHUTZ (0°–360°, alle Richtungen!)**, bis 0.2 m |

Quelle: Deep-Research Lauf 1 (D-Marin Zea Official Guide 2024 — Betreiberseite, also amtliche Kategorie): vollständig geschützte Marina, Rundumschutz bis 40 kn, unverändert übernommen.

Koordinaten: 37.9372, 23.6465 · Qualitäten: Schönheit 4/5, Restaurant 5/5, Badestrand 1/5

Warnungen: ⚠ Hohes Preisniveau (laut Quelle 90–140 EUR/Nacht für 12–15 m) · ⚠ Vorabreservierung dringend erforderlich · ⚠ Ankerverbot im Marinabecken

---
Freigabe: in `seeding/data/islands/attika.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
