# Review: Paros (`paros`)

Status: **NICHT freigegeben** (`approved: false`)

Quelle der Datei: Brief-Addendum 2026-07-30 (Quelle 2: 'Parikia bei Meltemi gut geschützt', Naoussa, Piso Livadi; Parikia ~27 Fähranläufe/Tag im Juli); Schutzsektoren abgeleitet — vor Freigabe prüfen

> FR24: Schutzprofile zuerst prüfen — sie steuern die Nacht-Ampel. Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.

## Plätze (3)

### Parikia (`paros-parikia`, hafen)

**Schutzprofil (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 355°–250° (Wrap über Nord), bis 30 kn |
| Welle | geschützt aus 355°–250° (Wrap über Nord), bis 1 m |

Quelle: Quelle 2: 'expliziter Meltemi-Schutzhafen'; Bucht öffnet nach W; Fährschwell beachten

Koordinaten: 37.0853, 25.1519 · Qualitäten: Schönheit 3/5, Restaurant 4/5, Badestrand 3/5

Warnungen: ⚠ Starker Fährverkehr (~27 Anläufe/Tag im Juli) — Schwell und Rangieren am Anleger

### Naoussa (`paros-naoussa`, hafen)

**Schutzprofil (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 60°–320°, bis 22 kn |
| Welle | geschützt aus 60°–320°, bis 0.8 m |

Quelle: Quelle 2: Zielkatalog; große Bucht öffnet nach N — bei Meltemi exponiert

Koordinaten: 37.1236, 25.2375 · Qualitäten: Schönheit 5/5, Restaurant 5/5, Badestrand 4/5

### Piso Livadi (`paros-piso-livadi`, hafen)

**Schutzprofil (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 160°–70° (Wrap über Nord), bis 28 kn |
| Welle | geschützt aus 160°–70° (Wrap über Nord), bis 0.8 m |

Quelle: Quelle 2: Zielkatalog; kleiner Hafen an der Ostküste, öffnet nach SE

Koordinaten: 37.0106, 25.2617 · Qualitäten: Schönheit 3/5, Restaurant 3/5, Badestrand 4/5

---
Freigabe: in `seeding/data/islands/paros.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
