# Review: Paros (`paros`)

Status: **FREIGEGEBEN** (`approved: true`)

Quelle der Datei: Brief-Addendum 2026-07-30 (Quelle 2: 'Parikia bei Meltemi gut geschützt', Naoussa, Piso Livadi; Parikia ~27 Fähranläufe/Tag im Juli) + Deep-Research Lauf 2 vom 2026-08-03 (Liegeplatz-Details, Ansteuerungswarnungen). Koordinaten und Sektorgeometrie aus dem Bestand beibehalten (Lauf 2 setzte Piso Livadi 1,6 sm nördlich, also bei Molos statt Piso Livadi), Stärkegrenzen auf den kleineren Wert beider Quellen gesetzt. OFFENER KONFLIKT bei Naoussa — siehe seeding/research/lauf-2-pruefprotokoll.md.

> FR24: Sichere Liegeplätze zuerst prüfen — sie steuern die Nacht-Ampel. Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.

## Plätze (3)

### Parikia (`paros-parikia`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 355°–250° (Wrap über Nord), bis 30 kn |
| Welle | geschützt aus 355°–250° (Wrap über Nord), bis 0.8 m |

Quelle: Quelle 2: 'expliziter Meltemi-Schutzhafen'; Bucht öffnet nach W; Fährschwell beachten. Lauf 2 gibt Öffnung nach WNW, Sektor 340–220, gleiche Windgrenze 30 kn, Welle 0.8 m — bestätigt den Bestand weitgehend. Wellengrenze auf 0.8 m gesenkt.

Koordinaten: 37.0853, 25.1519 · Qualitäten: Schönheit 3/5, Restaurant 4/5, Badestrand 3/5

Warnungen: ⚠ Starker Fährverkehr (~27 Anläufe/Tag im Juli) — Schwell und Rangieren am Anleger · ⚠ Klippen und Untiefen in der Bucht-Zufahrt (Lauf 2 nennt ein 'Super-Manois-Riff' — Bezeichnung unverifiziert, Ansteuerung nach Karte fahren) · ⚠ Bei starkem Meltemi läuft Nordwestschwell um das Kap in die Bucht · ⚠ Meltemi-sicher: bedingt

### Naoussa (`paros-naoussa`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 60°–320°, bis 22 kn |
| Welle | geschützt aus 60°–320°, bis 0.3 m |

Quelle: Quelle 2: Zielkatalog; große Bucht öffnet nach N — bei Meltemi exponiert. KONFLIKT: Lauf 2 gibt den nahezu invertierten Sektor 270–60 mit 35 kn an und begründet das mit dem geschützten INNENBECKEN hinter der Wellenbrechermole, urteilt für die Ansteuerung aber 'Meltemi-sicher: bedingt'. Bestandsgeometrie beibehalten (bewertet die exponierte Ansteuerung, nicht das Innenbecken), Wellengrenze auf 0.3 m gesenkt.

Koordinaten: 37.1236, 25.2375 · Qualitäten: Schönheit 5/5, Restaurant 5/5, Badestrand 4/5

Warnungen: ⚠ Ansteuerung erfordert genaue Navigation wegen vorgelagerter Riffe — bei Meltemi und Welle heikel · ⚠ Innenbecken laut Lauf 2 bei Meltemi ruhig; der Sektor bewertet bewusst die Ansteuerung, nicht den Liegeplatz · ⚠ Geringe Wassertiefe im Altstadt-Fischerbecken, Yachten liegen am Ostkai · ⚠ Meltemi-sicher: bedingt

### Piso Livadi (`paros-piso-livadi`, hafen)

**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**

| Art | Sektor |
|---|---|
| Wind | geschützt aus 160°–70° (Wrap über Nord), bis 28 kn |
| Welle | geschützt aus 160°–70° (Wrap über Nord), bis 0.5 m |

Quelle: Quelle 2: Zielkatalog; kleiner Hafen an der Ostküste, öffnet nach SE. Lauf 2 bestätigt Öffnung nach S bis SE und Windgrenze 28 kn, gibt Sektor 270–120 und Welle 0.5 m. Bestandsgeometrie beibehalten, Wellengrenze auf 0.5 m gesenkt.

Koordinaten: 37.0106, 25.2617 · Qualitäten: Schönheit 3/5, Restaurant 3/5, Badestrand 4/5

Warnungen: ⚠ Platzangebot für Gastyachten stark limitiert (ca. 12 Boote) · ⚠ Grössenlimit laut Lauf 2 nur 16 m — für dieses Schiff knapp, vorab klären · ⚠ Geringe Wassertiefen im Innenbereich, Echolot beobachten · ⚠ Meltemi-sicher: ja

---
Freigabe: in `seeding/data/islands/paros.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.
