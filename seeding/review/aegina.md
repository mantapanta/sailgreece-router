# Review: Ägina (`aegina`)

Status: **FREIGEGEBEN** (`approved: true`)

Quelle der Datei: Brief-Addendum 2026-07-30 (Quelle 2: Saronische Schwachwind-Alternative) + Deep-Research Lauf 1 vom 2026-08-03 (vier neue Plätze, Liegeplatz-Details). Lauf 1 bestätigte die Koordinate von Ägina-Stadt auf 0,02 sm; Sektor dort als Schnittmenge beider Quellen. Alle neuen Sektoren sind quellintern konsistent (Sektor, Öffnungsrichtung und Meltemi-Urteil passen zusammen).

> FR24: Sichere Liegeplätze zuerst prüfen — sie steuern die Nacht-Ampel. Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.

## Plätze (5)

### Ägina-Stadt (`aegina-stadt`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 350°–220° (Wrap über Nord), bis 30 kn |
| Welle | geschützt aus 350°–220° (Wrap über Nord), bis 0.8 m |

Quelle: Quelle 2: Saronischer Golf 4-6 Bft, deutlich milder; Hafen öffnet nach W. Lauf 1 (Heikell 14. Aufl. S. 112, CruisersWiki Ägina) gibt Öffnung nach W bis SW und Sektor 310–220 bei gleichen Grenzen. Eingetragen ist die SCHNITTMENGE 350–220 beider Sektoren, also die konservative Variante.

Koordinaten: 37.7469, 23.4264 · Qualitäten: Schönheit 3/5, Restaurant 4/5, Badestrand 2/5

Warnungen: ⚠ Erheblicher Schwell durch ein- und auslaufende Schnellfähren, im 20-Minuten-Takt in der Hauptsaison · ⚠ Bei starkem Wind aus S bis SW unruhig · ⚠ Ankerverbot im ausgewiesenen Fährfahrwasser

### Klima (`aegina-klima`, bucht)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 220°–120° (Wrap über Nord), bis 35 kn |
| Welle | geschützt aus 220°–120° (Wrap über Nord), bis 0.3 m |

Quelle: Deep-Research Lauf 1 (Heikell 14. Aufl. S. 115, CruisersWiki Ägina): Öffnung nach S bis SE, Sektor 220–120, maxKn 35 — Sektor und Öffnungsrichtung konsistent, unverändert übernommen.

Koordinaten: 37.6780, 23.4610 · Qualitäten: Schönheit 5/5, Restaurant 2/5, Badestrand 4/5

Warnungen: ⚠ Kein Schutz, wenn der Wind auf Süd bis Südost dreht · ⚠ Meltemi-sicher: ja

### Perdika (`aegina-perdika`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 320°–240° (Wrap über Nord), bis 32 kn |
| Welle | geschützt aus 320°–240° (Wrap über Nord), bis 0.5 m |

Quelle: Deep-Research Lauf 1 (Heikell 14. Aufl. S. 114, CruisersWiki Perdika): Öffnung nach W, Sektor 320–240, maxKn 32 — Sektor und Öffnungsrichtung konsistent, unverändert übernommen.

Koordinaten: 37.6912, 23.4528 · Qualitäten: Schönheit 4/5, Restaurant 5/5, Badestrand 3/5

Warnungen: ⚠ Sehr geringe Wassertiefen an der inneren Mole (ab 1,8 m) — bei 2,0 m Tiefgang kritisch · ⚠ Grössenlimit laut Quelle 15 m — für dieses Schiff zu knapp, vorab klären · ⚠ Vollständig offen gegen starken Westwind, dann steiler Schwell · ⚠ Steinballast am Molenfuß beachten

### Agia Marina (`aegina-agia-marina`, bucht)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 200°–60° (Wrap über Nord), bis 28 kn |
| Welle | geschützt aus 200°–60° (Wrap über Nord), bis 0.5 m |

Quelle: Deep-Research Lauf 1 (Heikell 14. Aufl. S. 115): Öffnung nach O bis SE, Sektor 200–60, maxKn 28 — Sektor und Öffnungsrichtung konsistent, unverändert übernommen.

Koordinaten: 37.7450, 23.5324 · Qualitäten: Schönheit 4/5, Restaurant 4/5, Badestrand 5/5

Warnungen: ⚠ Ungeschützt bei östlichen Windrichtungen · ⚠ Große Seegrasfelder im mittleren Buchtbereich

### Marathonas (`aegina-marathonas`, bucht)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 330°–200° (Wrap über Nord), bis 30 kn |
| Welle | geschützt aus 330°–200° (Wrap über Nord), bis 0.6 m |

Quelle: Deep-Research Lauf 1 (CruisersWiki Ägina, Abruf 2026-08): Öffnung nach W bis SW, Sektor 330–200, maxKn 30 — Sektor und Öffnungsrichtung konsistent. Einzige Quelle ist eine Crowd-Quelle, daher nur mittlere Konfidenz.

Koordinaten: 37.7245, 23.4452 · Qualitäten: Schönheit 3/5, Restaurant 3/5, Badestrand 5/5

Warnungen: ⚠ Offen nach Westen, kein Schutz bei auffrischendem Westwind · ⚠ Badezonen im Sommer mit Bojen markiert

---
Freigabe: in `seeding/data/islands/aegina.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
