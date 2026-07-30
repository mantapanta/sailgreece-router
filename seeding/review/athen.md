# Review: Athen (Basis) (`athen`)

Status: **NICHT freigegeben** (`approved: false`)

Quelle der Datei: Brief-Addendum 2026-07-30 (Quelle 1: Basen); Koordinaten approximiert — vor Freigabe prüfen

> FR24: Schutzprofile zuerst prüfen — sie steuern die Nacht-Ampel. Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.

## Plätze (1)

### Marina Alimos (`athen-alimos`, marina)

**Schutzprofil (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 0°–360°, bis 40 kn |
| Welle | geschützt aus 0°–360°, bis 1.5 m |

Quelle: Brief-Addendum: Charterbasis, voll ausgebaute Marina — allseitiger Schutz

Koordinaten: 37.9103, 23.7008 · Qualitäten: Schönheit 2/5, Restaurant 4/5, Badestrand 1/5

---
Freigabe: in `seeding/data/islands/athen.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
