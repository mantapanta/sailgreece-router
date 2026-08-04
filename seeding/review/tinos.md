# Review: Tinos (`tinos`)

Status: **FREIGEGEBEN** (`approved: true`)

Quelle der Datei: Deep-Research Lauf 3 vom 2026-08-03 (Heikell Greek Waters Pilot 14. Aufl. ohne Seitenangabe; CruisersWiki Tinos). Neu aufgenommen. Tinos-Stadt und Panormos sind quellintern konsistent; bei Kolimvithra widerspricht der Sektor der eigenen Beschreibung, dort wurden die Grenzen gekappt.

> FR24: Sichere Liegeplätze zuerst prüfen — sie steuern die Nacht-Ampel. Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.

## Plätze (3)

### Panormos (`tinos-panormos`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 200°–60° (Wrap über Nord), bis 35 kn |
| Welle | geschützt aus 200°–60° (Wrap über Nord), bis 0.4 m |

Quelle: Deep-Research Lauf 3 (Heikell 14. Aufl.): Öffnung nach E bis SE, Sektor 200–60, maxKn 35 — Sektor und Öffnungsrichtung konsistent, unverändert übernommen.

Koordinaten: 37.6492, 25.0408 · Qualitäten: Schönheit 5/5, Restaurant 4/5, Badestrand 4/5

Warnungen: ⚠ Geringe Wassertiefen im inneren Hafenbereich (ab 2,0 m) — bei 2,0 m Tiefgang genau prüfen · ⚠ Grössenlimit laut Quelle 16 m — für dieses Schiff knapp, vorab klären · ⚠ Nur etwa 12 Plätze, kein Landstrom · ⚠ Meltemi-sicher: ja

### Tinos-Stadt (`tinos-stadt`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 250°–130° (Wrap über Nord), bis 30 kn |
| Welle | geschützt aus 250°–130° (Wrap über Nord), bis 0.7 m |

Quelle: Deep-Research Lauf 3 (Heikell 14. Aufl.): Öffnung nach S bis SW, Sektor 250–130, maxKn 30 — Sektor und Öffnungsrichtung konsistent, unverändert übernommen.

Koordinaten: 37.5361, 25.1606 · Qualitäten: Schönheit 3/5, Restaurant 5/5, Badestrand 2/5

Warnungen: ⚠ Kräftige Fallböen im Hafenbecken bei starkem Meltemi · ⚠ Große Linienfähren legen am äußeren Kai an, Fährpier freihalten

### Kolimvithra (`tinos-kolimvithra`, bucht)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 240°–110° (Wrap über Nord), bis 12 kn |
| Welle | geschützt aus 240°–110° (Wrap über Nord), bis 0.4 m |

Quelle: Deep-Research Lauf 3 (CruisersWiki Tinos): Sektor 240–110 mit maxKn 25 und Öffnung nach S bis SW. SELBSTWIDERSPRUCH: Der Platz wird als Bucht an der NORDküste beschrieben und der Warnhinweis lautet 'offen nach Nordosten, bei Meltemi schwerer Seegang' — der Sektor behauptet dagegen Nordschutz. Windgrenze auf 12 kn und Welle auf 0.4 m gekappt, damit der Platz bei Meltemi nicht als brauchbar gilt.

Koordinaten: 37.6322, 25.1481 · Qualitäten: Schönheit 4/5, Restaurant 2/5, Badestrand 5/5

Warnungen: ⚠ SEKTOR VERMUTLICH VERDREHT: Die Quelle beschreibt eine Nordküstenbucht, offen nach NE, gibt aber einen Sektor mit Nordschutz an. Grenzen deshalb stark gekappt — bei Meltemi grundsätzlich meiden · ⚠ Bei Meltemi laut Quelle schwerer Seegang in der Bucht · ⚠ Haltekraft im östlichen Buchtabschnitt laut Quelle schwankend — Ankerprüfmanöver durchführen

---
Freigabe: in `seeding/data/islands/tinos.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
