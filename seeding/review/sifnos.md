# Review: Sifnos (`sifnos`)

Status: **FREIGEGEBEN** (`approved: true`)

Quelle der Datei: Brief-Addendum 2026-07-30 (Quelle 2: Kamares; Buchten Fikiada, Vathy geschützt, Faros) + Deep-Research Lauf 2 vom 2026-08-03 (Liegeplatz-Details). Koordinaten und Sektorgeometrie aus dem Bestand beibehalten, Stärkegrenzen auf den kleineren Wert beider Quellen gesetzt. Kamares deckt sich in beiden Quellen vollständig.

> FR24: Sichere Liegeplätze zuerst prüfen — sie steuern die Nacht-Ampel. Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.

## Plätze (3)

### Kamares (`sifnos-kamares`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 330°–230° (Wrap über Nord), bis 30 kn |
| Welle | geschützt aus 330°–230° (Wrap über Nord), bis 1 m |

Quelle: Quelle 1: Rückfallhafen-Kette; Fjordbucht öffnet nach W. Lauf 2 (Heikell 14. Aufl. S. 241, CruisersWiki Sifnos) bestätigt Sektor, Grenzen und Öffnung nach W bis WSW unabhängig — beide Quellen deckungsgleich.

Koordinaten: 36.9903, 24.6603 · Qualitäten: Schönheit 4/5, Restaurant 4/5, Badestrand 4/5

Warnungen: ⚠ Unangenehmer Grundschwell im Hafenbecken bei starkem Meltemi, reflektiert an der Kaimauer · ⚠ Fallböen aus den Bergen · ⚠ Meltemi-sicher: bedingt · ⚠ Ruckdämpfer und lange Festmacher einplanen

### Vathy (`sifnos-vathy`, bucht)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 300°–250° (Wrap über Nord), bis 35 kn |
| Welle | geschützt aus 300°–250° (Wrap über Nord), bis 0.3 m |

Quelle: Quelle 2: 'Vathy geschützt' — fast geschlossene Bucht, schmale Öffnung nach W. Lauf 2 gibt die Öffnung nach SW und Sektor 300–200 an, gleiche Windgrenze 35 kn, aber nur 0.3 m Welle. Bestandsgeometrie beibehalten, Wellengrenze auf 0.3 m gesenkt.

Koordinaten: 36.9264, 24.6903 · Qualitäten: Schönheit 5/5, Restaurant 4/5, Badestrand 4/5

Warnungen: ⚠ Sehr starke Fallböen über die Kämme bei N/NE-Wind — das Schiff schwojt kurz heftig · ⚠ Meltemi-sicher: ja

### Faros (`sifnos-faros`, bucht)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 210°–110° (Wrap über Nord), bis 25 kn |
| Welle | geschützt aus 210°–110° (Wrap über Nord), bis 0.4 m |

Quelle: Quelle 2: Zielkatalog; Bucht öffnet nach S/SE. Lauf 2 gibt die Öffnung nach S und den weiteren Sektor 270–90 mit 30 kn an. Bestandsgeometrie beibehalten (sie schließt SE-Lagen aus, was zu Quelle 2 passt), Wellengrenze auf 0.4 m gesenkt.

Koordinaten: 36.9394, 24.7458 · Qualitäten: Schönheit 4/5, Restaurant 3/5, Badestrand 4/5

Warnungen: ⚠ Bei Südwind völlig offen · ⚠ Meltemi-sicher: ja · ⚠ Badezonen im Sommer mit Bojen markiert

---
Freigabe: in `seeding/data/islands/sifnos.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
