# Review: Sifnos (`sifnos`)

Status: **NICHT freigegeben** (`approved: false`)

Quelle der Datei: Brief-Addendum 2026-07-30 (Quelle 2: Kamares; Buchten Fikiada, Vathy geschützt, Faros); Schutzsektoren abgeleitet — vor Freigabe prüfen

> FR24: Schutzprofile zuerst prüfen — sie steuern die Nacht-Ampel. Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.

## Plätze (3)

### Kamares (`sifnos-kamares`, hafen)

**Schutzprofil (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 330°–230° (Wrap über Nord), bis 30 kn |
| Welle | geschützt aus 330°–230° (Wrap über Nord), bis 1 m |

Quelle: Quelle 1: Rückfallhafen-Kette; Fjordbucht öffnet nach W

Koordinaten: 36.9903, 24.6603 · Qualitäten: Schönheit 4/5, Restaurant 4/5, Badestrand 4/5

### Vathy (`sifnos-vathy`, bucht)

**Schutzprofil (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 300°–250° (Wrap über Nord), bis 35 kn |
| Welle | geschützt aus 300°–250° (Wrap über Nord), bis 0.8 m |

Quelle: Quelle 2: 'Vathy geschützt' — fast geschlossene Bucht, schmale Öffnung nach W

Koordinaten: 36.9264, 24.6903 · Qualitäten: Schönheit 5/5, Restaurant 4/5, Badestrand 4/5

### Faros (`sifnos-faros`, bucht)

**Schutzprofil (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 210°–110° (Wrap über Nord), bis 25 kn |
| Welle | geschützt aus 210°–110° (Wrap über Nord), bis 0.8 m |

Quelle: Quelle 2: Zielkatalog; Bucht öffnet nach S/SE

Koordinaten: 36.9394, 24.7458 · Qualitäten: Schönheit 4/5, Restaurant 3/5, Badestrand 4/5

---
Freigabe: in `seeding/data/islands/sifnos.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
