# Review: Kythnos (`kythnos`)

Status: **NICHT freigegeben** (`approved: false`)

Quelle der Datei: Brief-Addendum 2026-07-30 (Quelle 1+2: Kolona/Fikiada 37°24.7'N 24°23'E, Merichas, Loutra); Schutzsektoren abgeleitet — vor Freigabe prüfen

> FR24: Schutzprofile zuerst prüfen — sie steuern die Nacht-Ampel. Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.

## Plätze (3)

### Kolona / Fikiada (`kythnos-kolona`, bucht)

**Schutzprofil (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 90°–300°, bis 25 kn |
| Welle | geschützt aus 90°–300°, bis 0.8 m |

Quelle: Quelle 2: Doppelbucht, Sandbank — nach N offen, bei starkem Meltemi Schwell um die Landzunge

Koordinaten: 37.4117, 24.3833 · Qualitäten: Schönheit 5/5, Restaurant 2/5, Badestrand 5/5

### Merichas (`kythnos-merichas`, hafen)

**Schutzprofil (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 340°–240° (Wrap über Nord), bis 30 kn |
| Welle | geschützt aus 340°–240° (Wrap über Nord), bis 1 m |

Quelle: Quelle 1: Rückfallhafen; Bucht öffnet nach W — bei Meltemi brauchbar

Koordinaten: 37.3897, 24.3953 · Qualitäten: Schönheit 3/5, Restaurant 4/5, Badestrand 2/5

### Loutra (`kythnos-loutra`, marina)

**Schutzprofil (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 60°–330°, bis 25 kn |
| Welle | geschützt aus 60°–330°, bis 0.8 m |

Quelle: Quelle 1: Alternative zu Merichas; Bucht öffnet nach NE — bei starkem Meltemi Schwell im Vorhafen

Koordinaten: 37.4442, 24.4306 · Qualitäten: Schönheit 3/5, Restaurant 4/5, Badestrand 2/5

---
Freigabe: in `seeding/data/islands/kythnos.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
