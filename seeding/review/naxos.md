# Review: Naxos (`naxos`)

Status: **NICHT freigegeben** (`approved: false`)

Quelle der Datei: Brief-Addendum 2026-07-30 (Quelle 1: Naxos Entscheidungstag, Marina im Juli/August Engpass); Schutzsektoren abgeleitet — vor Freigabe prüfen

> FR24: Schutzprofile zuerst prüfen — sie steuern die Nacht-Ampel. Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.

## Plätze (1)

### Naxos-Stadt (Marina) (`naxos-stadt`, marina)

**Schutzprofil (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 340°–240° (Wrap über Nord), bis 30 kn |
| Welle | geschützt aus 340°–240° (Wrap über Nord), bis 1 m |

Quelle: Quelle 1: Hafen-Kernliste; Hafen öffnet nach W, Mole gegen N

Koordinaten: 37.1075, 25.3736 · Qualitäten: Schönheit 4/5, Restaurant 5/5, Badestrand 4/5

Warnungen: ⚠ Marina im Juli/August Engpass — früh ankommen oder Alternative planen

---
Freigabe: in `seeding/data/islands/naxos.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
