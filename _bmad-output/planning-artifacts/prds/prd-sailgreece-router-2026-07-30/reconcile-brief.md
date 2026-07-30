---
title: "Quellen-Abgleich: Brief → PRD + Addendum (sailgreece-router)"
status: done
created: 2026-07-30
source: ../../briefs/brief-sailgreece-router-2026-07-30/brief.md
targets:
  - prd.md
  - addendum.md
---

# Quellen-Abgleich: Brief → PRD + Addendum

**Input:** `_bmad-output/planning-artifacts/briefs/brief-sailgreece-router-2026-07-30/brief.md`
**Abgeglichen gegen:** `prd.md` + `addendum.md` (dieser Workspace)
**Scope-Hinweis:** Das Brief-Addendum (Etappenpläne, Hafenkatalog, Distanzen) war nicht Teil dieses Abgleichs; das PRD referenziert es korrekt (Startliste ~25–35 Plätze, Normalisierung der Distanzangaben).

## Bewusste Abweichungen (bestätigt, NICHT als Lücke gewertet)

| # | Brief | PRD/Addendum | Status |
|---|---|---|---|
| a | „Planung existiert als exzellentes PDF" (Entscheidungstore, Wind-Szenarien, Eskalationsleiter) | Framing verworfen: „Einen fertigen Törnplan … gibt es aber nicht, und die App setzt auch keinen voraus" (§1); FR20 leitet Entscheidungspunkte dynamisch ab („keine fest verdrahteten Kalender-Gates") | ✅ bewusst |
| b | (implizit statische Daten) | NFR4 + Addendum: echte Datenbank (Vercel-Stack/Firestore), keine JSON-Handpflege | ✅ bewusst |
| c | „normales Kartenmaterial (z. B. Google Maps)" | FR1 + Addendum: Google Maps JS API entschieden (gegen Leaflet-Empfehlung, Kosten dokumentiert) | ✅ bewusst |
| d | Pauschalgeschwindigkeiten 6,0/7,5/6,5 kn | FR15/FR26 + Addendum: Polardiagramm FP45; Pauschalwerte nur Fallback | ✅ bewusst |
| e | (keine Positionsquelle genannt) | FR27: GPS/Browser-Geolocation, manuell übersteuerbar | ✅ bewusst |

## Vollständig und treu übernommen (Stichprobe der Kernaussagen)

- **Kernsatz** „Das Heute muss auf einem sinnvollen Mittelfristplan liegen" — wörtlich in §4.
- **Drei Planungsebenen** (langfristig/mittelfristig/täglich) inkl. Santorin-Zitat — §4.
- **„Plätze, keine Inseln"** und „geschützte Traumbucht schlägt bestimmte Insel" — §4.
- **Möglichkeitsraum** statt fest verdrahtetem Plan — §4, FR9, FR18.
- **„Karte als Besprechungsbild"** — Formulierung überlebt in §3 und als Überschrift F1; UM-1 trägt die Frage „Welche Optionen haben wir heute?".
- **„Der Skipper entscheidet, die App rechnet und vergleicht"** — §4, FR22, Gegen-Metrik in §2.
- **Abwägungsgrößen ausschließlich** Entfernung/Wind/Welle/Dauer/Pläne — §4 wörtlich.
- **Familien-Schwellen** (>25 kn kein Aufkreuzen; 6-h-Normalfall; 10–12-h-Schläge/Nachtetappen bei Leichtwind) — FR16 nahezu wörtlich (siehe aber Befund B4).
- **Lee/Luv-Regel, deterministische R/G/G-Ampel, Schutzprofile quellenbasiert** — FR7/FR8, NFR6.
- **Predicted Point of Return** inkl. ~103 sm ab Naxos, Vorabend-Rückkehr, Puffertag, „bevor sie sich schließen" — FR18/FR19.
- **Open-Meteo-Entscheidung** inkl. Windy-API-Absage-Begründung sinngemäß; Marine-API für Welle — FR11–FR13, `[ANNAHME]` Wellendaten aufgelöst.
- **Windy bleibt parallel, keine Seekarte, keine Navigation** — NFR3.
- **Out-of-Scope-Liste** vollständig übernommen und um 2 Punkte erweitert (Editier-UI, Wind-Fetch-Heuristik) — §7.
- **Erfolgskriterium** tägliche Nutzung, „ersetzt das Kopfrechnen — nicht das seemännische Urteil" — E1 + NFR3-Hinweis.
- **Zeitrisiko-Priorisierung** „Scoring vor Kartendarstellung" — §8, korrekt als `[ANNAHME]` markiert und sinnvoll verfeinert (Design-Reihenfolge).
- **2/3-Rückweg-Faustregel, Tag-6-Müdigkeit, Meltemi-Kontext** — §1.

## Befunde: Lücken & Verfälschungen

### B1 — Kinder-Fokus generalisiert zu „Familie" (qualitativ, mittel)

Brief: „ohne **den Kindern** den Törn durch brutales Aufkreuzen … zu verderben"; Rahmenbedingungen: „Familie **mit Kindern**". Im PRD kommt das Wort „Kinder" nirgends vor — §1 sagt „ohne der Familie … zuzumuten", FR16 heißt „Familien-Schwellen". Der emotionale Anker der Schwellenwerte (der Törn darf den *Kindern* nicht verdorben werden — das ist die Begründung für >25-kn-Grenze und 6-h-Deckel) ist abgeschwächt. Risiko: Downstream (UX-Ton, Priorisierung bei Grenzfällen) verliert das „Kinder an Bord"-Bild.
**Empfehlung:** In §1 und/oder FR16 „Familie mit Kindern" wiederherstellen.

### B2 — „vor allem schöne Buchten" eingeebnet (qualitativ, klein–mittel)

Brief: „schöne Häfen und **vor allem** schöne Buchten" — Buchten sind das eigentliche Sehnsuchtsziel, Häfen zweitrangig. PRD §1 nivelliert zu „Buchten und Häfen". Die Priorisierung überlebt nur indirekt (Addendum: Satellitenbilder „der Buchten" als Google-Maps-Argument; FR1 „Buchten-Optik"). Für Kuration (Platzauswahl) und UX (welche Fotos/Plätze prominent) ist die Rangfolge relevant.
**Empfehlung:** Ein Wort in §1 („vor allem Buchten") oder ein Kurationshinweis in FR6.

### B3 — „was das neue Heute ist": Neuableitung nur implizit (funktional, klein)

Brief-Kernversprechen: Kippt der Mittelfristplan, zeigt die App „welche Alternativen noch offen sind **und was das neue Heute ist**" — d. h. Mittelfrist- und Tagesplan werden **konsistent neu abgeleitet**. Das PRD deckt beide Hälften einzeln (FR18 Optionsraum, FR21 Tagesoptionen, UM-2 „kippt eine Option, sieht er es hier zuerst"), aber keine FR verlangt explizit, dass beim Kippen einer Option das abgeleitete neue Tagesbild direkt angeboten wird — der Konsistenz-Link zwischen den Ebenen ist die eigentliche Produktidee („Kaskade ersetzen").
**Empfehlung:** Einen Halbsatz in FR21 oder FR18: „kippt eine Option, zeigt die Ansicht das daraus abgeleitete neue Heute".

### B4 — „maximal 6 Stunden **Segeln** pro Tag" → „maximal 6 Stunden pro Tag" (semantisch, klein)

FR16 lässt „Segeln" weg. Lesbar als 6 h Gesamtfahrzeit inkl. Motor — der Brief begrenzt Segelstunden. Für die Scoring-Logik (zählt Motorstrecke gegen das Tagesbudget?) ist das ein echter Definitionsunterschied.
**Empfehlung:** Wort „Segeln" in FR16 ergänzen oder die Deutung bewusst festlegen.

### B5 — „Eskalationsleiter"/„Wind-Szenarien" als Denkfigur nur implizit (grenzwertig zur bewussten Abweichung a, klein)

Das PDF-Framing ist verworfen — korrekt. Aber die dahinterliegende Denkfigur (eine **geordnete Leiter** von Rückfallstufen je Windeskalation) überlebt im PRD nur als Aufzählung in FR9 (Süd-Route → gedeckelte Variante → Rückfallhäfen-Kette → Saronische Alternative). Nirgends steht, dass diese Varianten als **Eskalationsstufen zueinander** gedacht sind und die App bei verschärftem Forecast die nächstniedrigere Stufe als natürliche Alternative anbietet.
**Empfehlung (optional):** Ein Satz in F6 oder FR9, der die Routen-Varianten als Eskalationsstufen ordnet.

### B6 — Recherche-Risiko „Schutzprofile sind der aufwendigste Teil" abgeschwächt (Risiko-Nuance, klein)

Brief-Risiko: Aufwand der Quellen-Recherche unklar, „die Schutzprofile … sind dabei der **aufwendigste** Teil". PRD/Addendum behandeln Schutzprofile als *sicherheitskritisch zuerst* (FR24, Gegen-Metrik) und schätzen die Gesamtrecherche auf 1–2 Tage — die Warnung, dass gerade die Schutzprofile das Budget sprengen könnten, ist nicht mehr als Risiko markiert.
**Empfehlung:** In §9 (Offene Punkte) eine Zeile: Schutzprofil-Recherche ist der aufwandskritische Pfad der Seeding-Pipeline.

### B7 — Nutzungsmodus „Skipper allein" leicht verschoben (Ton, minimal)

Brief: Die Karte beantwortet die Optionsfrage „für den Skipper **allein** wie im Gespräch mit der Crew". PRD-UM-1 macht daraus primär eine Crew-Szene („Die Crew schaut mit; man entscheidet gemeinsam"); der Solo-Modus existiert nur implizit in UM-2. Kein Funktionsverlust, aber die Balance beider Modi war im Brief ausdrücklich.
**Kein Handlungsbedarf zwingend**; ggf. ein Halbsatz in UM-1.

## Nicht beanstandet (geprüft, bewusst kein Befund)

- „Ampel pro Platz und **Hauptwindrichtung**" (Brief) vs. Ampel aus konkretem Forecast (FR8): Das PRD rechnet feiner (Forecast statt Windrichtungs-Matrix) — Verallgemeinerung ohne Informationsverlust, deterministisch bleibt sie.
- PRD-Ergänzungen ohne Brief-Basis (Marktlücken-Absatz, Düsen-Warnattribute FR10, Y.CO-Design NFR1, Vlychada-Klärung, Meilenstein 3.–5. Aug): stammen erkennbar aus Recherche/Review nach dem Brief, widersprechen ihm nicht.
- Motorfahrt ~8 kn (FR15) statt 7,5 kn (Brief): Teil der bewussten Polar-Umstellung (d), Fallback behält 7,5 kn.

## Gesamturteil

Das PRD ist eine **treue, an den richtigen Stellen verschärfte Übersetzung** des Briefs; alle Kernmechaniken, der Kernsatz, die Ampellogik, der Point of Return und die Out-of-Scope-Grenzen sind vollständig und unverfälscht angekommen. Die Befunde sind durchweg qualitative Feinverluste (B1/B2: Ton und Priorisierung, B3/B4: je ein Halbsatz Präzision, B5/B6: Denkfigur bzw. Risiko-Nuance) — kein struktureller Verlust, keine stille Verfälschung einer Anforderung.
