# Review: Naxos (`naxos`)

Status: **FREIGEGEBEN** (`approved: true`)

Quelle der Datei: Brief-Addendum 2026-07-30 (Quelle 1: Naxos Entscheidungstag, Marina im Juli/August Engpass) + Deep-Research Lauf 3 vom 2026-08-03 (drei neue Plätze im Süden und Osten, Liegeplatz-Details). Lauf 3 übernahm die Koordinate von Naxos-Stadt exakt; Sektor dort als Schnittmenge beider Quellen. Typ 'marina' aus dem Bestand beibehalten (Lauf 3 stuft als 'hafen' ein — Ausbauzustand ungeprüft).

> FR24: Sichere Liegeplätze zuerst prüfen — sie steuern die Nacht-Ampel. Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.

## Plätze (4)

### Naxos-Stadt (Marina) (`naxos-stadt`, marina)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 30°–240°, bis 30 kn |
| Welle | geschützt aus 30°–240°, bis 0.8 m |

Quelle: Quelle 1: Hafen-Kernliste; Hafen öffnet nach W, Mole gegen N. Lauf 3 (Heikell 14. Aufl., CruisersWiki Naxos) gibt Öffnung nach NW bis W und Sektor 30–290 bei gleicher Windgrenze. Eingetragen ist die SCHNITTMENGE 30–240, Wellengrenze auf 0.8 m gesenkt.

Koordinaten: 37.1075, 25.3736 · Qualitäten: Schönheit 4/5, Restaurant 5/5, Badestrand 4/5

Warnungen: ⚠ Marina im Juli/August Engpass — früh ankommen oder Alternative planen · ⚠ Hoher Schwell im Hafenbecken bei stürmischem Nordwestwind · ⚠ Riffgebiet nördlich der Hafeneinfahrt beachten · ⚠ Manövrierende Großfähren erzeugen kurzzeitig starken Seegang

### Kalandos (`naxos-kalandos`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 250°–110° (Wrap über Nord), bis 35 kn |
| Welle | geschützt aus 250°–110° (Wrap über Nord), bis 0.4 m |

Quelle: Deep-Research Lauf 3 (CruisersWiki Naxos, Navily 2025): Öffnung nach S bis SE, Sektor 250–110, maxKn 35 — Sektor und Öffnungsrichtung konsistent, unverändert übernommen.

Koordinaten: 36.9328, 25.4711 · Qualitäten: Schönheit 4/5, Restaurant 2/5, Badestrand 5/5

Warnungen: ⚠ Kaum Versorgung an Land, nur eine Saisontaverne · ⚠ Grössenlimit laut Quelle 15 m — für dieses Schiff knapp, vorab klären · ⚠ Meltemi-sicher: ja

### Panermos (`naxos-panermos`, bucht)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 240°–100° (Wrap über Nord), bis 35 kn |
| Welle | geschützt aus 240°–100° (Wrap über Nord), bis 0.4 m |

Quelle: Deep-Research Lauf 3 (Heikell 14. Aufl.): Öffnung nach S bis SE, Sektor 240–100, maxKn 35 — Sektor und Öffnungsrichtung konsistent, unverändert übernommen.

Koordinaten: 36.9031, 25.5450 · Qualitäten: Schönheit 5/5, Restaurant 1/5, Badestrand 5/5

Warnungen: ⚠ Offen nach Süden; Fallböen bei extremen Nordwinden · ⚠ Dichte Seegrasfelder im tiefen Buchtbereich meiden · ⚠ Meltemi-sicher: ja

### Moutsouna (`naxos-moutsouna`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 180°–30° (Wrap über Nord), bis 20 kn |
| Welle | geschützt aus 180°–30° (Wrap über Nord), bis 0.5 m |

Quelle: Deep-Research Lauf 3 (CruisersWiki Naxos): Öffnung nach E bis NE, Sektor 180–30, maxKn 20 — konsistent mit der Warnung, dass bei Meltemi Seegang direkt einläuft. Einzige Quelle ist eine Crowd-Quelle.

Koordinaten: 37.0083, 25.5906 · Qualitäten: Schönheit 4/5, Restaurant 3/5, Badestrand 3/5

Warnungen: ⚠ Bei starkem Meltemi läuft hoher Seegang direkt auf den kleinen Kai — dann unbenutzbar · ⚠ Grössenlimit laut Quelle 14 m — für dieses Schiff zu knapp · ⚠ Nur etwa 8 Plätze, felsiger Grund · ⚠ Meltemi-sicher: nein

---
Freigabe: in `seeding/data/islands/naxos.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
