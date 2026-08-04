---
title: "Reconcile-Review: Addendum & Feldtest-Befunde ↔ Architecture Spine (Revision 2)"
status: final
created: 2026-08-02
reviewed:
  - _bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/addendum.md
  - _bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/review-update-feldtest.md (M1–M5, N1–N4)
  - _bmad-output/planning-artifacts/architecture/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md (Revision 2)
reviewer: reconcile-addendum-r2
---

# Reconcile-Review — Addendum-Abgleich & Befund-Abdeckung (Spine Revision 2)

**Gesamturteil:** Der Spine Revision 2 deckt das Addendum und die übergebenen
Review-Befunde nahezu vollständig ab — 8 von 9 Befunden sind per AD verankert,
die tragenden Addendum-Inhalte (Polar-Offset, Etappen-Pool, Seeding-Gate,
Rückfallkette als Datenobjekt) sind sauber adressiert. Es bleiben **drei echte
Lücken** (eine mittel, zwei niedrig): die vom Addendum explizit an die
Architektur-Phase delegierte **Motor-Einsatzregel** ist weder entschieden noch
deferred; die **konkrete Rückfallhäfen-Kette** (M5) ist als Architektur-Objekt
verankert, ihr Inhalt aber nirgends benannt und nicht als Kurations-Item im
Deferred-Block; das **Platz-Warnattribut** (Vlychada-Muster) fehlt in der
AD-4-Schemaliste. Kein Befund erzeugt in der aktuellen Form eine falsche
Implementierung — die Lücken erzeugen Divergenz durch Unterspezifikation, nicht
durch Widerspruch.

**Befund-Übersicht:** 0 Kritisch · 0 Hoch · 2 Mittel · 3 Niedrig

---

## Teil A — Addendum-Abgleich

Geprüft: Ist jeder tragende Addendum-Inhalt im Spine verankert oder bewusst
deferred? Nur Lücken gemeldet, die beim Bauen Divergenz erzeugen.

### Verankert (kein Mangel — Nachweis)

| Addendum-Inhalt | Spine-Verankerung |
| --- | --- |
| Firestore/GCP-Stack, kein Vercel | AD-1, AD-5, AD-8, Stack-Tabelle |
| Google Maps JS API inkl. Symbol-`repeat`-Workaround für gestrichelte Linien | Stack-Tabelle (@vis.gl/react-google-maps), AD-8 (Key-Restriktion) |
| Seeding-Pipeline: KI-Recherche → eine Abstimmungsrunde → validierter Import | AD-4 (strikte Validierung), AD-10 (`approved: true`-Gate, `seeding/review/`-Markdown je Insel) |
| 100–150 Plätze, insel-orientiert iterativ | AD-10 (Freigabe je Insel-Datei), Structural Seed (Staging-JSON je Insel) |
| **Polar-Offset-Semantik** (+0,5 kn additiv, konfigurierbar) | AD-8 (Config-Parameter, kein Redeploy), AD-10 (Offset **einzig** in `domain/polar.ts` — verhindert Doppel-/Nie-Anwendung) |
| **Motorfahrt separat** (~8 kn eigener Parameter) | AD-8 (`motorSpeedKn` = 8 als eigener Config-Parameter, getrennt vom Offset) — *aber siehe A-1* |
| Polare: Verifikation vor DB-Import (Screenshot-Transkript) | AD-10 („die Polare wird erst nach Verifikation gegen die Original-Exportdatei importiert") |
| Fallback Brief-Pauschalwerte ohne Polare | AD-8 („Fallback-Pauschalgeschwindigkeiten" im Config-Dokument) |
| **Rundrouten-Varianten als Etappen-Pool**, nicht starres Tagesraster | AD-4 (Varianten = geordnete Leg-ID-Sequenzen mit `escalationRank`, „Etappen-Pool, kein starres Tagesraster") |
| **Variante 2: 12 Einträge auf 11 Etappentage** (Tinos–Mykonos ein Tag) | Durch Pool-Semantik (AD-4) + Plan-Modell (AD-12: 12 Törntage = 11 Stages + 1 Hafentag) konsistent aufgelöst; Legs tragen Wegpunkte für Zwischenstopps |
| Saronische Alternative ersatzlos gestrichen | AD-4 („wird aus dem Seed entfernt") |
| Alimos-Rebasing der Distanzen | AD-10 (nur fertig normalisierte Distanzen in Firestore, `rebasedFrom?`) |
| **Y.CO-Design nur als UX-Input** | Korrekt **nicht** im Spine — Design-Patterns (Sticky-Split, Tageskarten, Palette) sind UX-Phase-Material; der Spine bindet nur das Styling-Substrat (Vanilla CSS + Custom Properties). Keine Lücke. |
| Feldtest-PDF / Meltemi-Logik als Verständnis-Referenz | `sources`-Frontmatter referenziert PRD-Familie; inhaltlich in AD-13 operationalisiert |

### A-1 — Motor-Einsatzregel: vom Addendum an die Architektur delegiert, aber weder entschieden noch deferred

- **Schweregrad: Mittel**
- **Fundstelle:** addendum.md Z. 85–87 („Zuschlag/Abschlag gegenan über die
  Polare bzw. Motor-Regel — **Detailentscheid in der Architektur-Phase**");
  Spine AD-3 (Breakdown „Segel- vs. Motorzeit"), AD-8 (`motorSpeedKn`),
  prd.md FR16 (Budget = „5 h Segeln + 1 h Motor oder 6 h reines Segeln",
  hartes Maximum „6 h Segeln + 2 h Motor").
- **Lücke:** Das Addendum delegiert die Entscheidung explizit an genau diese
  Phase — der Spine trifft sie nicht und listet sie auch nicht im
  Deferred-Block. `assessLeg` muss je Segment entscheiden, **wann Motor statt
  Polare gerechnet wird** (nur im Aufkreuz-Totbereich TWA < X°? sobald
  Polar-Speed < `motorSpeedKn`? bei Flaute < Y kn?). Das ist keine
  Solver-Interna: die Regel bestimmt jede Dauer (AD-3, ein Rechenpfad), die
  FR16-Budget-Aufteilung Segel-/Motorstunden und damit die Gültigkeit jedes
  Plans. Zwei Entwickler bauen hier heute nachweislich Verschiedenes.
- **Fix:** Einen Satz in AD-13 (oder AD-3) normativ ergänzen, z. B.: „Ein
  Segment wird motorisiert gerechnet (`motorSpeedKn`), wenn der Kurs im
  Totbereich liegt (TWA < `minSailTwa`, Config, Default 40° `[ANNAHME]`) oder
  die interpolierte Polar-Geschwindigkeit unter `motorThresholdKn` (Config,
  Default 4 kn `[ANNAHME]`) fällt; sonst gilt die Polare + Offset. Der
  Polar-Offset wird **nie** auf `motorSpeedKn` angewendet. Segel- und
  Motorstunden werden getrennt gegen die FR16-Budgets gezählt." Werte als
  kalibrierbare Config-Parameter (AD-8) führen.

### A-2 — Polar-Offset ↔ Motorfahrt: Abgrenzung nur implizit

- **Schweregrad: Niedrig** (Teilaspekt von A-1, separat prüfbar)
- **Fundstelle:** addendum.md Z. 82–84 („gilt **nicht** für die Motorfahrt");
  Spine AD-8 listet beide als getrennte Parameter, AD-10 bindet den Offset an
  `domain/polar.ts` — der explizite Ausschluss-Satz fehlt aber.
- **Lücke:** Die Struktur (Offset nur in `polar.ts`) macht die falsche
  Anwendung unwahrscheinlich, verbietet sie aber nicht wörtlich; ein Builder
  könnte den Offset als „Schiffs-Speed-Bonus" generalisieren.
- **Fix:** Im A-1-Satz mit erledigt („Der Polar-Offset wird nie auf
  `motorSpeedKn` angewendet"). Kein eigener AD nötig.

### A-3 — Platz-Warnattribut (Vlychada-Muster) nicht in der AD-4-Schemaliste

- **Schweregrad: Niedrig**
- **Fundstelle:** prd.md §9 (Vlychada: Warn-Attribut + telefonische
  Vorabklärung, Muster laut reconcile-brief-addendum auch für Naxos);
  Spine AD-4: Legs tragen `windWarnings`, das Platz-Schema fixiert aber nur
  `ShelterProfile` als Pflichtfeld — ein Warn-/Restriktions-Feld am **Platz**
  ist nirgends erwähnt (bereits in reconcile-prd.md L6 notiert, in Revision 2
  nicht nachgezogen).
- **Lücke:** Beim Schema-Schnitt kann das Feld verloren gehen; dann fehlt der
  App der Ort, an dem „grenzwertig für 50-ft-Kat / Versandung / Vorabklärung
  nötig" hängt — und Santorin erschiene warnungslos grün-fähig.
- **Fix:** In der AD-4-Aufzählung ein Feld nachtragen: Platz trägt optional
  `warnings: string[]` (kuratierte Warn-/Restriktionshinweise, z. B.
  Vlychada-Liegeplatz), analog zu `windWarnings` am Leg. Kein neuer AD,
  eine Zeile.

---

## Teil B — Befund-Abdeckung M1–M5, N1–N4

### M1 — FR16-Aufkreuz-Regel mehrdeutig

- **Status: adressiert** — AD-6 übernimmt den Review-Fix wörtlich-normativ:
  TWA-Prädikat „**TWA < 65° bei mittlerem Wind > 25 kn**" inklusive der
  expliziten Warnung vor der Fehl-Lesart („Seglersprache für *kleinere* TWA!"),
  Böen-Ausnahme als `[ASSUMPTION: kalibrieren]`, Freigabe aller TWA bei
  ≤ 25 kn. AD-2 verlangt zusätzlich Vitest-Referenzfälle für die
  AD-6-Sektorsemantik.
- **Schweregrad Rest: keiner.**

### M2 — Nachtetappen: Einfüge-Logik und Budget-Wirkung

- **Status: adressiert** — zweigeteilt und vollständig: AD-9 definiert das
  Zeitfenster normativ (Nachtetappe = Abfahrt nach 18:00 oder Ankunft vor
  09:00 Athens, halb-offene Grenzen — löst auch die FR8-Fenster-Kollision);
  AD-13 regelt Wind-Check < 10 kn über die **gesamte** Etappendauer, „zählt
  nicht gegen das Tagesbudget", Folgetag auf Ziel-Budget begrenzt
  `[ASSUMPTION]`, Vorschlag nur wenn ohne sie kein gültiger Plan existiert,
  max. 2, nur zweite Woche. Die Folgetag-Regel steht zudem korrekt als
  Kalibrier-Item im Deferred-Block.
- **Schweregrad Rest: keiner.**

### M3 — Variante 1 Kettenbruch (Milos → Polyaigos)

- **Status: adressiert** — AD-10 benennt den Befund namentlich: „Der
  M3-Kettenbruch der Westkykladen-Variante (Milos→Polyaigos) wird **beim
  Seeding aufgelöst**, nie im Core kaschiert." Owner-Zuordnung (Seeding, nicht
  Core) ist die architektonisch richtige Antwort; welche der beiden
  Auflösungs-Varianten (Zusatz-Leg vs. Zusammenfassung) gewählt wird, ist
  legitime Kurations-Entscheidung unter dem approved-Gate.
- **Schweregrad Rest: keiner.** (Das Addendum selbst trägt die vom Review
  empfohlene Fußnote noch nicht — PRD-seitige Restarbeit, nicht Spine.)

### M4 — Wunschbild Amorgos/Santorin verletzt vermutlich FR16

- **Status: adressiert (architektonisch)** — AD-13-Zielfunktion: „das
  Süd-Wunschbild (Santorin/Amorgos) … sind **weiche Präferenzen im Score, nie
  Constraints**", plus „Gültigkeit vor Präferenz". Damit kann das Wunschbild
  den Solver nie in FR16-Verletzungen zwingen — der Divergenz-Kern des
  Befunds ist entschärft. Die Nachtetappen-Regel (AD-13) deckt genau den vom
  Review benannten einzigen realistischen Weg (Nachtschlag bei Schwachwind).
- **Schweregrad Rest: Niedrig** — die vom Review geforderte
  Erwartungs-Klärung mit Philipp („und/oder", ggf. Datums-Korrektur auf
  Amorgos 13.8.) ist PRD-Arbeit und bleibt dort offen; sie ist bewusst
  nicht-architektonisch, weil der Spine das Wunschbild bereits als weich
  degradiert. **Fix:** im PRD §4 nachziehen, kein Spine-Change nötig.

### M5 — Rückfallhäfen-Kette nirgends definiert

- **Status: teilweise adressiert** — Architektonisch sauber gelöst: AD-10
  macht die Kette zum normativen Routen-Dokument mit fixer ID
  (`rueckfallkette-west`), `domain/ppr.ts` erhält sie über den Snapshot und
  „enthält keine Orts- oder Distanzkonstanten" (genau die vom Review
  geforderte Ein-Owner-Lösung); AD-4 führt die Rückfallkette in der
  Varianten-Aufzählung; AD-13 rechnet Rückkehrfenster und Meltemi-Check
  explizit „über `rueckfallkette-west`".
- **Schweregrad Rest: Mittel** — zwei Punkte bleiben offen:
  (a) Der **Inhalt** der Kette (welche Häfen, welche Distanzen) steht weiterhin
  in keinem Artefakt — der Review verlangte die konkrete Liste im Addendum
  oder einen präzisen Quellverweis; das Addendum wurde nicht ergänzt, und der
  Spine-Deferred-Block führt die Ketten-Kuration nicht als offenes Item
  (anders als z. B. die Fähren-Daten für FR31, die genau dieses Muster korrekt
  bekommen haben). (b) Die vom Review geforderte Markierung als
  **sicherheitsrelevanter Review-Inhalt** („mit Schutzprofilen zuerst", FR24)
  ist nur indirekt gedeckt: das approved-Gate gilt laut AD-10 „je
  Insel-Datei", die Review-Sichten sind „Markdown je Insel" — ob
  `legs`/`routes` (und damit die Kette) eine eigene Review-Sicht bekommen,
  bleibt unbestimmt.
- **Fix:** (1) Deferred-Eintrag ergänzen: „Rückfallhäfen-Kette
  (`rueckfallkette-west`): konkrete Hafenfolge (Kandidat: Serifos –
  Kythnos (Mericha/Loutra) – Kea – Sounion – Alimos) bei der Kuration gegen
  das Brief-Addendum festlegen; sicherheitsrelevant — Review-Priorität wie
  Schutzprofile." (2) In AD-10 einen Halbsatz: das approved-Gate und die
  FR24-Review-Sicht gelten auch für `legs`/`routes` (inkl. Rückfallkette),
  nicht nur für Insel-Dateien.

### N1 — GPS nur einmalig beim App-Start (Stale-Position)

- **Status: adressiert** — AD-11 übernimmt den Review-Fix wörtlich: GPS wird
  „zusätzlich **bei jedem Forecast-Refresh still aktualisiert**"; die
  `manual`-Präzedenz (nie von GPS überschrieben) bleibt gewahrt, kein
  Button — konsistent mit der Feldtest-Entscheidung.
- **Schweregrad Rest: keiner.**

### N2 — Addendum-Frontmatter veraltet

- **Status: offen, begründet nicht-architektonisch** — der Befund betrifft das
  Addendum selbst (`status: final, updated: 2026-07-30` trotz
  Feldtest-Inhalten vom 2.8.); der Spine kann das nicht heilen und muss es
  nicht. Stand heute (geprüft): das Frontmatter ist **weiterhin unkorrigiert**.
- **Schweregrad: Niedrig.** **Fix:** im Addendum `updated: 2026-08-02` setzen,
  `status` mit dem PRD synchronisieren — Ein-Zeilen-Änderung, gehört zur
  PRD-Familie, nicht in den Spine.

### N3 — Alternativen-Anzahl unquantifiziert

- **Status: adressiert** — AD-13 fixiert den Review-Default: „max. 2–3, davon
  mindestens eine konservativere Eskalationsstufe und — falls offen — eine
  ambitioniertere Süd-Option `[ASSUMPTION]`"; die Anzahl liegt zusätzlich als
  Config-Parameter in AD-8 (Feldkorrektur ohne Redeploy).
- **Schweregrad Rest: keiner.**

### N4 — 2/3-Faustregel vs. Fenster-Logik

- **Status: adressiert** — AD-13 stellt normativ klar: „Die 2/3-Faustregel ist
  Heuristik-Narrativ, keine Rechenregel — implementiert wird ausschließlich
  die Fenster-/Gültigkeitslogik." Exakt der Review-Fix, an der Stelle, wo der
  Dev-Agent ihn liest.
- **Schweregrad Rest: keiner.**

---

## Abdeckungs-Matrix (Kurzfassung)

| Befund | Status | Spine-Anker | Rest-Schweregrad |
| --- | --- | --- | --- |
| M1 Aufkreuz-Regel | adressiert | AD-6 (+ AD-2 Fixtures) | — |
| M2 Nachtetappen | adressiert | AD-9 + AD-13 + Deferred | — |
| M3 Kettenbruch V1 | adressiert | AD-10 (namentlich) | — |
| M4 Wunschbild | adressiert | AD-13 Zielfunktion | niedrig (PRD-Restarbeit) |
| M5 Rückfallkette | teilweise | AD-4, AD-10, AD-13 | **mittel** (Inhalt + Review-Sicht offen) |
| N1 GPS stale | adressiert | AD-11 | — |
| N2 Frontmatter | offen (nicht-architektonisch) | — | niedrig (Fix im Addendum) |
| N3 Alternativen-Anzahl | adressiert | AD-13 + AD-8 | — |
| N4 2/3-Faustregel | adressiert | AD-13 | — |

**Ergänzend geprüft, nicht Teil des Auftrags-Scopes, aber im Spine verankert:**
Die kritischen/hohen Feldtest-Befunde K1 (Relaxations-Reihenfolge → AD-13),
K2 (Worst-Case-Konstante → AD-8/AD-13), H2 (Hafentag → AD-12), H3 (eine
Deadline-Konstante `returnDeadline` → AD-8/AD-13), H4 (Horizont-Cut → AD-13),
H5 (deterministische FR2-Ampel → AD-3), H6 (Pickup hart → AD-13) sind
konsistent mitgezogen — keine Widersprüche zu den M/N-Auflösungen gefunden.

## Empfohlene Reihenfolge der Fixes

1. **A-1 (mittel):** Motor-Einsatzregel als normativen Satz in AD-13/AD-3
   entscheiden (inkl. A-2-Halbsatz) — einziger Punkt, an dem heute zwei
   Builder nachweislich divergieren.
2. **M5-Rest (mittel):** Deferred-Eintrag Rückfallketten-Kuration + Halbsatz
   in AD-10 (Gate/Review-Sicht auch für `legs`/`routes`).
3. **A-3 (niedrig):** `warnings`-Feld am Platz in der AD-4-Liste nachtragen.
4. **N2 (niedrig):** Addendum-Frontmatter aktualisieren (PRD-Familie).
5. **M4-Rest (niedrig):** „und/oder"-Klärung des Wunschbilds im PRD §4 mit
   Philipp — kein Spine-Change.
