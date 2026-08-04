# Review: Amorgos (`amorgos`)

Status: **FREIGEGEBEN** (`approved: true`)

Quelle der Datei: Brief-Addendum 2026-07-30 (Quelle 1: 'Katapola guter Meltemi-Schutz') + Deep-Research Lauf 3 vom 2026-08-03 (zwei neue Plätze, Liegeplatz-Details). BEMERKENSWERT: Lauf 3 liefert für Katapola exakt denselben Sektor (320–240) und dieselbe Windgrenze wie der Bestand, unabhängig hergeleitet — die stärkste Bestätigung eines Sektors in allen drei Läufen. Wellengrenze auf den kleineren Wert gesenkt.

> FR24: Sichere Liegeplätze zuerst prüfen — sie steuern die Nacht-Ampel. Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.

## Plätze (3)

### Katapola (`amorgos-katapola`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 320°–240° (Wrap über Nord), bis 35 kn |
| Welle | geschützt aus 320°–240° (Wrap über Nord), bis 0.8 m |

Quelle: Quelle 1: 'Katapola guter Meltemi-Schutz'; tiefe Bucht öffnet nach W. Lauf 3 (Heikell 14. Aufl., CruisersWiki Amorgos) leitet unabhängig denselben Sektor 320–240 und dieselbe Windgrenze 35 kn her — zwei Quellen deckungsgleich. Wellengrenze auf den kleineren Wert 0.8 m gesenkt.

Koordinaten: 36.8306, 25.8583 · Qualitäten: Schönheit 4/5, Restaurant 4/5, Badestrand 3/5

Warnungen: ⚠ Fallwinde von den steil aufragenden Bergrücken bei starkem Meltemi — wiederkehrende Lee-Böen im Becken · ⚠ Anlegebereich der Fähren freihalten · ⚠ Meltemi-sicher: ja

### Kalotaritissa (`amorgos-kalotaritissa`, bucht)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 90°–360°, bis 30 kn |
| Welle | geschützt aus 90°–360°, bis 0.5 m |

Quelle: Deep-Research Lauf 3 (CruisersWiki Amorgos, Navily 2025): Öffnung nach NE, Sektor 90–0, maxKn 30 — Sektor und Öffnungsrichtung konsistent. toDeg als 360 statt 0 notiert, weil 0 hier das Sektorende meint (Schutz von O über S und W bis N).

Koordinaten: 36.7972, 25.7461 · Qualitäten: Schönheit 5/5, Restaurant 2/5, Badestrand 4/5

Warnungen: ⚠ Enger Durchfahrtskanal zwischen Riffen bei der Ansteuerung · ⚠ Sektor lässt den Bereich N bis O offen — bei Meltemi aus NNE genau prüfen · ⚠ Grössenlimit laut Quelle 20 m

### Aegiali (`amorgos-aegiali`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 1°–260°, bis 25 kn |
| Welle | geschützt aus 1°–260°, bis 1 m |

Quelle: Deep-Research Lauf 3 (CruisersWiki Amorgos): Öffnung nach NW bis W, Sektor 0–260, maxKn 25 — Sektor und Öffnungsrichtung konsistent. fromDeg auf 1 gesetzt, weil 0–260 im Schema nicht von einem Vollkreis unterscheidbar wäre; die Abweichung von einem Grad ist ohne Bedeutung.

Koordinaten: 36.9031, 25.9772 · Qualitäten: Schönheit 4/5, Restaurant 4/5, Badestrand 4/5

Warnungen: ⚠ Spürbarer Schwell am Kai bei anhaltenden Nordwestwinden — laut Quelle ab Bft 7 nicht abschließend geklärt · ⚠ Haltegrund stellenweise felsig, dichter Seegrasbewuchs · ⚠ Meltemi-sicher: bedingt

---
Freigabe: in `seeding/data/islands/amorgos.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
