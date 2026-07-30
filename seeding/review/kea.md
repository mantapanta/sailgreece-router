# Review: Kea (`kea`)

Status: **NICHT freigegeben** (`approved: false`)

Quelle der Datei: Brief-Addendum 2026-07-30 (Quelle 2: Zielkatalog, Vourkari 37°40'N 24°19.5'E 'sehr gut geschützt'); Schutzsektoren aus Beschreibung abgeleitet — vor Freigabe gegen Heikell/CruisersWiki prüfen

> FR24: Schutzprofile zuerst prüfen — sie steuern die Nacht-Ampel. Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.

## Plätze (2)

### Vourkari (`kea-vourkari`, hafen)

**Schutzprofil (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 250°–190° (Wrap über Nord), bis 35 kn |
| Welle | geschützt aus 250°–190° (Wrap über Nord), bis 1.2 m |

Quelle: Quelle 2: 'sehr gut geschützt'; Bucht öffnet nach SW

Koordinaten: 37.6667, 24.3250 · Qualitäten: Schönheit 4/5, Restaurant 5/5, Badestrand 2/5

### Korissia (`kea-korissia`, hafen)

**Schutzprofil (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 70°–290°, bis 30 kn |
| Welle | geschützt aus 70°–290°, bis 1 m |

Quelle: Quelle 1: Rückfallhafen-Kette; Hafenbucht öffnet nach N/NW — Schwell bei Nordlagen

Koordinaten: 37.6617, 24.3147 · Qualitäten: Schönheit 3/5, Restaurant 3/5, Badestrand 3/5

---
Freigabe: in `seeding/data/islands/kea.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
