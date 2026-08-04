# Review: Kythnos (`kythnos`)

Status: **FREIGEGEBEN** (`approved: true`)

Quelle der Datei: Brief-Addendum 2026-07-30 (Quelle 1+2: Kolona/Fikiada 37°24.7'N 24°23'E, Merichas, Loutra) + Deep-Research Lauf 2 vom 2026-08-03 (Liegeplatz-Details; Kolona und Fikiada als getrennte Plätze). Sektorgeometrie und Koordinaten aus dem Bestand beibehalten, Stärkegrenzen auf den kleineren Wert beider Quellen gesetzt. SCHWERER KONFLIKT bei Loutra (Nordschutz) — vor Freigabe zwingend gegen Heikell prüfen, siehe seeding/research/lauf-2-pruefprotokoll.md.

> FR24: Sichere Liegeplätze zuerst prüfen — sie steuern die Nacht-Ampel. Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.

## Plätze (4)

### Kolona (`kythnos-kolona`, bucht)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 90°–300°, bis 22 kn |
| Welle | geschützt aus 90°–300°, bis 0.8 m |

Quelle: Quelle 2: Doppelbucht, Sandbank — nach N offen, bei starkem Meltemi Schwell um die Landzunge. KONFLIKT: Lauf 2 gibt für die Nordbucht Sektor 30–160 an (also Ostschutz statt Westschutz), maxKn 22. Bestandsgeometrie beibehalten, Windgrenze auf den kleineren Wert 22 kn gesenkt.

Koordinaten: 37.4117, 24.3833 · Qualitäten: Schönheit 5/5, Restaurant 2/5, Badestrand 5/5

Warnungen: ⚠ Bei Meltemi über 25 kn pfeift der Wind über die flache Sandbank · ⚠ Meltemi-sicher: nein · ⚠ Schwojraum einplanen, Böen drehen über der Landzunge

### Fikiada (`kythnos-fikiada`, bucht)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 100°–260°, bis 16 kn |
| Welle | geschützt aus 100°–260°, bis 0.8 m |

Quelle: Deep-Research Lauf 2 (Sightsee Sailing Guide 2024, CruisersWiki Kythnos): Sektor 100–260, maxKn 20, Welle 1.0 m. SELBSTWIDERSPRUCH in der Quelle — der Shelter-Block nennt die Öffnung nach N, der Warnhinweis nach NW; Fikiada liegt als SÜDbucht der Landzunge, was eine Öffnung nach S/SW nahelegt. Grenzen daher konservativ auf 16 kn und 0.8 m gekappt, bis die Öffnungsrichtung geprüft ist.

Koordinaten: 37.4100, 24.3750 · Qualitäten: Schönheit 4/5, Restaurant 1/5, Badestrand 4/5

Warnungen: ⚠ Öffnungsrichtung UNGEPRÜFT — Quelle widerspricht sich (N vs. NW); bei Süd- bis Südwestlagen nicht auf den Schutzsektor verlassen · ⚠ Meltemi-sicher: nein (laut Quelle) · ⚠ Freie Sandflecken zwischen Seegras gezielt ansteuern

### Merichas (`kythnos-merichas`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 340°–240° (Wrap über Nord), bis 30 kn |
| Welle | geschützt aus 340°–240° (Wrap über Nord), bis 0.6 m |

Quelle: Quelle 1: Rückfallhafen; Bucht öffnet nach W — bei Meltemi brauchbar. Lauf 2 bestätigt die Öffnung (WNW) mit Sektor 340–220 und maxKn 35; Bestandsgeometrie beibehalten, Windgrenze bei 30 kn und Wellengrenze beim kleineren Wert 0.6 m belassen.

Koordinaten: 37.3897, 24.3953 · Qualitäten: Schönheit 3/5, Restaurant 4/5, Badestrand 2/5

Warnungen: ⚠ Fährschwell — ausreichend Abstand vom Heck zur Kaimauer halten · ⚠ Böen drehen im Hafenbecken · ⚠ Meltemi-sicher: ja

### Loutra (`kythnos-loutra`, marina)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 60°–330°, bis 25 kn |
| Welle | geschützt aus 60°–330°, bis 0.4 m |

Quelle: Quelle 1: Alternative zu Merichas; Bucht öffnet nach NE — bei starkem Meltemi Schwell im Vorhafen. SCHWERER KONFLIKT: Lauf 2 gibt Sektor 270–120 mit maxKn 35 an und urteilt 'Meltemi-sicher: ja', behauptet also Nordschutz für eine nach NE offene Bucht. Bestandsgeometrie beibehalten, Wellengrenze auf den kleineren Wert 0.4 m gesenkt. Nicht freigeben, ohne diesen Widerspruch gegen Heikell aufzulösen.

Koordinaten: 37.4442, 24.4306 · Qualitäten: Schönheit 3/5, Restaurant 4/5, Badestrand 2/5

Warnungen: ⚠ Nordschutz in den Quellen widersprüchlich — bei Meltemi über 20 kn nicht als sicherer Nachtplatz einplanen · ⚠ Hafenbecken klein, in der Hochsaison ab Mittag voll · ⚠ Lauf 2 stuft den Platz als 'hafen' ein, der Bestand als 'marina' — Ausbauzustand ungeprüft

---
Freigabe: in `seeding/data/islands/kythnos.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
