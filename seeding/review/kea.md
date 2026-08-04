# Review: Kea (`kea`)

Status: **FREIGEGEBEN** (`approved: true`)

Quelle der Datei: Brief-Addendum 2026-07-30 (Quelle 2: Zielkatalog, Vourkari 37°40'N 24°19.5'E 'sehr gut geschützt') + Deep-Research Lauf 2 vom 2026-08-03 (Liegeplatz-Details, Warnhinweise). Sektorgeometrie und Koordinaten aus dem Bestand beibehalten, Stärkegrenzen auf den jeweils kleineren Wert beider Quellen gesetzt. OFFENER KONFLIKT zur Öffnungsrichtung beider Plätze — vor Freigabe gegen Heikell prüfen (siehe seeding/research/lauf-2-pruefprotokoll.md).

> FR24: Sichere Liegeplätze zuerst prüfen — sie steuern die Nacht-Ampel. Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.

## Plätze (2)

### Vourkari (`kea-vourkari`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 250°–190° (Wrap über Nord), bis 35 kn |
| Welle | geschützt aus 250°–190° (Wrap über Nord), bis 0.5 m |

Quelle: Quelle 2: 'sehr gut geschützt', Bucht öffnet nach SW. KONFLIKT: Lauf 2 (Heikell 14. Aufl. S. 225 / CruisersWiki Kea) gibt die Öffnung nach WNW an, Sektor 330–240, maxKn 35, Welle 0.5 m. Geometrie des Bestands beibehalten, Wellengrenze auf den kleineren Wert 0.5 m gesenkt.

Koordinaten: 37.6667, 24.3250 · Qualitäten: Schönheit 4/5, Restaurant 5/5, Badestrand 2/5

Warnungen: ⚠ Starke Fallböen bei Meltemi aus NE · ⚠ Wochenend-Andrang von Eignerbooten aus Athen · ⚠ Meltemi-sicher: ja (bei guter Ankerarbeit und ausreichend Kette) · ⚠ Öffnungsrichtung der Bucht in den Quellen widersprüchlich (SW vs. WNW) — bei West- bis Nordwestlagen nicht auf den Sektor verlassen

### Korissia (`kea-korissia`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 70°–290°, bis 30 kn |
| Welle | geschützt aus 70°–290°, bis 0.8 m |

Quelle: Quelle 1: Rückfallhafen-Kette; Hafenbucht öffnet nach N/NW — Schwell bei Nordlagen. KONFLIKT: Lauf 2 gibt Sektor 350–230 an und behauptet damit Nordschutz, urteilt im gleichen Datensatz aber 'Meltemi-sicher: bedingt' wegen Fährschwell. Bestandsgeometrie beibehalten (deckt sich mit der Schwellwarnung), Wellengrenze auf 0.8 m gesenkt.

Koordinaten: 37.6617, 24.3147 · Qualitäten: Schönheit 3/5, Restaurant 3/5, Badestrand 3/5

Warnungen: ⚠ Erheblicher Fährschwell bei An- und Ablegemanövern der Schnellfähren · ⚠ Meltemi-sicher: bedingt (Schwell im Fährbecken) · ⚠ Liegeplätze nahe dem Fähranleger meiden

---
Freigabe: in `seeding/data/islands/kea.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
