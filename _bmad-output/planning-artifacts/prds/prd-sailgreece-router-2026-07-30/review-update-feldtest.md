---
title: "Adversarial Review: PRD sailgreece-router — Update nach Feldtest"
status: final
created: 2026-08-02
reviewed: prd.md (updated 2026-08-02), addendum.md
reviewer: adversarial-prd-review
---

# Adversarial Review — PRD-Update nach Feldtest (2026-08-02)

**Gesamturteil:** Das PRD ist nach dem Umbau strukturell sauber (keine Verweise auf
gestrichene Konzepte, FR-Nummerierung lückenlos, Ampel-Ebenen begrifflich getrennt),
aber die neue Round-Trip-Kernlogik hat zwei nicht implementierbare Stellen
(Kein-Plan-Fallback, „voller Meltemi" als Rechengröße) und eine Reihe von
Arithmetik- und Deadline-Widersprüchen (Wochentag 19.8., 11 Etappen vs. 12 Tage,
zwei Rückkehr-Deadlines), die vor der Architektur-Phase entschieden werden müssen.

**Befund-Übersicht:** 2 Kritisch · 6 Hoch · 5 Mittel · 4 Niedrig

Geprüfte Fragen: (1) innere Konsistenz und Quer-Referenzen, (2) Vollständigkeit der
Rückkehrfenster-Logik inkl. Fall „kein gültiger Round-Trip", (3) Architektur-/Dev-Blocker,
(4) Trennung der drei Ampel-Semantiken (FR8 Platz, FR17 Etappe/Option, FR2 Rest-Trip).

**Positivbefund vorab (geprüft, kein Mangel):** Keine Referenzen mehr auf
„Mittelfristplan", Saronische Alternative, „2–3 Tagesoptionen" oder
„2–3 Routen-Optionen als Linien". Saronischer Golf konsistent an allen drei Stellen
gestrichen (prd.md Z. 31–32, Z. 202–203, Z. 399–400). FR-Nummern FR1–FR32 lückenlos
(FR14 sauber als reserviert markiert, FR26/FR30 mit Nachreichungs-Hinweis).
Quer-Referenzen FR9→addendum, FR15→FR26, FR18→FR9/FR13/FR16/FR32,
FR19→FR15/FR16/FR26, FR21→FR28/FR29/FR30, FR31→FR16/FR19, §4-Begriffe→FR2/FR8/FR16/FR17/FR29:
alle korrekt. §4 und FR19 formulieren die Fenster-Logik doppelt, aber widerspruchsfrei.
FR22 („schlägt aktiv vor") und FR28/FR29 greifen sauber ineinander.

---

## Kritisch

### K1 — Fall „kein gültiger Round-Trip existiert" ist nicht definiert

- **Fundstelle:** prd.md Z. 268–279 (FR18, Gültigkeitsdefinition), Z. 155–162 (FR2,
  rote Linie), Z. 314–317 (FR22, aktiver Vorschlag).
- **Problem:** FR18 definiert präzise, wann ein Round-Trip *gültig* ist (jede Etappe
  in FR16-Schwellen + Ankunft Alimos 19.8.). FR2 definiert nur die Anzeige (Linie
  färbt rot). Nirgends ist definiert, **was die App vorschlägt, wenn der Solver
  keinen gültigen Round-Trip findet** — der zentrale Failure-Mode des Kernfeatures.
  FR22 verlangt „schlägt den Round-Trip aktiv vor": Vorschlag von was, wenn keiner
  gültig ist? Zeigt sie den am wenigsten verletzenden Plan? Welche Constraints
  dürfen in welcher Reihenfolge relaxiert werden (Ziel-Budget → hartes Maximum →
  Nachtetappe → Motor-Anteil)? Bleibt die letzte gültige Hauptroute stehen? Ohne
  Antwort ist der Solver nicht spezifizierbar und die App im wichtigsten Moment
  (Meltemi-Kachexie des Plans) stumm oder undefiniert.
- **Fix:** Neuen Absatz in FR18 (oder FR18b): „Findet die Neuberechnung keinen
  gültigen Round-Trip, zeigt die App (a) den Rest-Trip mit der geringsten
  Schwellenverletzung als Vorschlag, (b) markiert die verletzenden Etappen rot mit
  Begründung (welche FR16-Schwelle, um wie viel), (c) definierte
  Relaxations-Reihenfolge: Ziel-Budget 6 h → hartes Maximum 8 h → Nachtetappe
  (nur unter FR16-Nachtbedingungen) — niemals relaxiert wird die
  Aufkreuz-Schwelle (>65°/25 kn). Die Rest-Trip-Linie ist dann rot (FR2)."

### K2 — „Voller/durchgehender Meltemi" ist keine berechenbare Größe

- **Fundstelle:** prd.md Z. 109–115 (§4, „auch bei vollem Meltemi erreichbar",
  „Rückkehr auch bei durchgehendem Meltemi über alle Resttage"), Z. 280–291 (FR19,
  identische Formulierung).
- **Problem:** Die gesamte Rückkehrfenster-Strategie hängt an einem Worst-Case-Check:
  „Hafen, von dem aus Alimos **auch bei vollem Meltemi** erreichbar ist." Der
  Forecast reicht dafür nicht (die Resttage liegen z. T. jenseits des Horizonts,
  siehe H4) — der Check braucht also ein **synthetisches Worst-Case-Windszenario**
  (Richtung, Stärke, ggf. Böen/Welle), gegen das die Rückfallhäfen-Kette gerechnet
  wird. Dieses Szenario ist nirgends definiert: Ist „voller Meltemi" 30 kn N? 35 kn
  NNE? Mit welcher Welle? Ohne diese Konstante ist FR19 nicht implementierbar, und
  §1 (Z. 27–29) sagt selbst: bei 35 kn ist gegenan gar nichts erkreuzbar — dann wäre
  *kein* Hafen außer Alimos-nahen je „meltemi-sicher". Die Definition entscheidet
  also direkt, wie weit die App je nach Süden plant.
- **Fix:** In FR19 das Worst-Case-Szenario als konfigurierbare Konstante definieren,
  z. B.: „Meltemi-Worst-Case = 30 kn (Böen 38) aus 000°–030°, Welle 2,0 m aus N;
  ein Hafen gilt als meltemi-sicher, wenn die Kette Hafen → … → Alimos über die
  Rückfallhäfen westwärts in den Resttagen fahrbar ist, wobei jede Etappe unter
  diesem Szenario die FR16-Schwellen einhält (Kurse ≥65° zum Wind oder
  Motor-Etappen in Landabdeckung)." Werte mit Philipp kalibrieren, als
  `[ANNAHME]` markieren.

---

## Hoch

### H1 — Wochentag falsch: 19.8.2026 ist ein Mittwoch, kein Freitag

- **Fundstelle:** prd.md Z. 21 („Rückkehr am Freitagnachmittag, 19. August"),
  Z. 98–99 (§4 „Rückkehr Alimos Freitagnachmittag 19.8."), Z. 273 (FR18
  „Freitagnachmittag 19.8."), Z. 418 (Meilenstein „8. Aug Törnstart — Samstagnachmittag").
- **Problem:** 8.8.2026 ist tatsächlich ein Samstag, aber der 19.8.2026 ist ein
  **Mittwoch**. Entweder stimmt das Datum (dann ist „Freitag" 3× falsch) oder der
  Wochentag (dann wäre Rückkehr Freitag 21.8. — und der ganze Törn 14 Tage, FR32,
  Etappenzahl und alle Deadline-Rechnungen kippen). Da FR32 Start-/Endtag als
  Konstanten verdrahtet und §9 die Rückgabezeit vertraglich fixieren will, muss das
  vor der Architektur-Phase eindeutig sein.
- **Fix:** Mit dem Chartervertrag abgleichen und eine Quelle zur Wahrheit erklären
  (empfohlen: Datum). Alle drei „Freitag"-Nennungen korrigieren (vermutlich
  „Mittwochnachmittag, 19.8.") oder — falls der Törn wirklich bis Freitag geht —
  Enddatum, Etappenzahl und FR32 konsistent umstellen.

### H2 — 11 Etappen vs. 12 Törntage: Etappen↔Tag-Mapping und Hafentage undefiniert

- **Fundstelle:** prd.md Z. 10 & 22 („11 Etappen"), Z. 42 („über zwölf Tage exakt
  geplant"), Z. 242 (FR16 „maximal 2× in **11 Tagen**"), Z. 157–159 (FR2,
  Etappen-Nummern 1–11 je Tagesziel), Z. 268–271 (FR18 „11 Etappen minus die
  bereits gefahrenen"), Z. 302–304 (FR32 Törntag aus Datum).
- **Problem:** 8.8.–19.8. sind 12 Kalendertage; bei Abfahrts-Etappe am 8.8. und
  Ankunfts-Etappe am 19.8. bleiben 11 Etappen auf 12 Tage — es gibt also **genau
  einen Tag ohne Etappe (Hafentag)**, den das PRD nirgends erwähnt. Ungeklärt:
  Darf/muss der Solver Hafentage planen (z. B. Abwettern bei Rot)? Wo liegt er
  standardmäßig? Was zeigt die Morgenansicht (FR21) an einem Hafentag? Kann FR28
  einen Hafentag setzen („heute bleiben wir")? Zusätzlich widerspricht sich die
  Tageszählung selbst: „zwölf Tage" (Z. 42) vs. „in 11 Tagen" (FR16) vs. „11
  Etappen". Ohne definiertes Mapping Törntag→Etappe ist FR32/FR18/FR2-Nummerierung
  nicht implementierbar.
- **Fix:** In §4 festlegen: „12 Törntage, 11 Etappen — genau ein geplanter
  Hafentag, den der Solver frei platziert (Default: dort, wo das Rückkehrfenster
  ihn erlaubt; bei rotem Tages-Forecast bevorzugt als Abwettertag). ‚Heute
  bleiben' ist gültiger FR28-Edit." FR16 auf „maximal 2× pro Törn" umformulieren,
  Z. 42 auf „über zwölf Törntage (11 Etappen)" präzisieren.

### H3 — Zwei verschiedene Rückkehr-Deadlines (FR18 vs. FR19) nicht abgeglichen

- **Fundstelle:** prd.md Z. 272–273 (FR18: gültig = „Rückkehr nach Alimos am
  Freitagnachmittag 19.8."), Z. 287–289 (FR19: Point of Return = „Rückkehr am
  **Vorabend der Ausschiffung, mit Puffertag**"), Z. 439–441 (§9: „Rückgabe am
  Vorabend der Ausschiffung (Annahme 18:00, Alimos)").
- **Problem:** FR18 validiert den Round-Trip gegen Ankunft 19.8. nachmittags.
  FR19 rechnet den Point of Return gegen „Vorabend der Ausschiffung **mit
  Puffertag**" — das ist ein Tag früher (18.8.?). Welche Deadline gilt wofür?
  Ist der Puffertag Teil der Gültigkeit (dann ist FR18 falsch) oder nur der
  PoR-Konservativität (dann können Hauptroute „gültig" und PoR „überschritten"
  gleichzeitig sein — welche Ampel gewinnt auf der Karte)? Zudem ist unklar, ob
  „19.8. nachmittags" selbst schon der Vorabend der Ausschiffung (20.8.?) ist.
- **Fix:** Deadline-Kaskade explizit definieren: „Vertragliche Rückgabe: 19.8.
  18:00 Alimos (= Vorabend der Ausschiffung am 20.8., vertraglich bestätigen, §9).
  FR18-Gültigkeit: Ankunft ≤ 19.8. 16:00. FR19-PoR rechnet zusätzlich mit einem
  Puffertag (Ziel-Ankunft 18.8.); Überschreiten des PoR färbt den Rest-Trip gelb
  (FR2), Verfehlen der FR18-Deadline rot."

### H4 — Forecast-Horizont deckt den Rest-Trip nicht ab; Bewertung dahinter undefiniert

- **Fundstelle:** prd.md Z. 227–233 (FR15: Bewertung „für genau diesen künftigen
  Tag und diese Uhrzeit"), Z. 268–275 (FR18: *jede* Etappe muss in FR16-Schwellen
  liegen), Z. 212–218 (FR11/FR12: Open-Meteo Forecast & Marine).
- **Problem:** Am Törntag 1 liegen die Etappen 9–11 bis zu 11 Tage in der Zukunft.
  ECMWF via Open-Meteo liefert zwar bis ~15 Tage, wird aber jenseits ~7 Tagen
  unbrauchbar granular; die Marine-API (Welle) reicht je nach Modell deutlich
  kürzer. FR18 verlangt trotzdem eine binäre Gültigkeitsaussage über *alle*
  Etappen. Wie werden Etappen jenseits des (verlässlichen) Horizonts bewertet —
  Klimatologie? „Unbewertet = gelb"? Meltemi-Worst-Case (K2)? Ohne Regel liefert
  der Solver an Tag 1–4 Scheingenauigkeit oder gar keine Aussage.
- **Fix:** In FR15/FR18 einen Horizont-Cut definieren: „Etappen innerhalb des
  verlässlichen Horizonts (Konfig, Default 7 Tage) werden gegen den Forecast
  bewertet; Etappen dahinter gegen das Meltemi-Worst-Case-Szenario (K2-Konstante)
  als konservative Platzhalter-Bewertung und in UI als ‚Fernbereich —
  Worst-Case-Annahme' gekennzeichnet. Wellen-Etappen jenseits des
  Marine-Horizonts: nur Wind-Bewertung + Kennzeichnung."

### H5 — Rest-Trip-Ampel (FR2): „eventuell"/„sicher" nicht deterministisch, Bezugsgröße unklar

- **Fundstelle:** prd.md Z. 155–162 (FR2: gelb = „**eventuell** nicht mehr …
  machbar", rot = „**sicher** nicht mehr kriterienkonform möglich"), Z. 143–144
  (§4-Begriffe: „Ampel = **deterministische** Rot/Gelb/Grün-Bewertung … je
  Rest-Trip (FR2)"), Z. 244–249 (FR17: Options-Ampel = schwächste Etappe).
- **Problem:** Zweifach unterbestimmt. (a) „Eventuell" und „sicher" sind keine
  deterministischen Prädikate — der Begriffsblock verspricht aber Determinismus.
  (b) Bezugsgröße: Färbt die Linie nach der **Hauptroute** (eine rote Etappe in
  der Hauptroute ⇒ rot?) oder nach der **Existenz irgendeines gültigen
  Round-Trips** (Hauptroute kaputt, aber Alternative offen ⇒ gelb)? Beispiel:
  Skipper editiert per FR28 eine Etappe, die die Hauptroute ungültig macht,
  während zwei Alternativ-Routen (FR29) gültig bleiben — gelb oder rot? Ohne
  Festlegung kollidieren FR2 und FR17 (Frage 4 des Reviews): FR17 misst
  Komfort/Budget je Option, FR2 soll Rückkehr-*Machbarkeit* messen — das sind
  verschiedene Semantiken und brauchen verschiedene Definitionen.
- **Fix:** FR2 deterministisch definieren: „**Grün/neutral gestrichelt** = Hauptroute
  gültig (FR18) und PoR nicht überschritten. **Gelb** = Hauptroute verletzt das
  Ziel-Budget oder den Puffertag (H3), aber mindestens ein gültiger Round-Trip
  existiert im Möglichkeitsraum (ggf. als Alternative, FR29). **Rot** = kein
  gültiger Round-Trip im Möglichkeitsraum (K1-Fall)." Damit ist FR2 eine
  Machbarkeits-Ampel und bleibt sauber getrennt von FR17 (Etappen-/Options-Qualität)
  und FR8 (Nacht-Schutz je Platz).

### H6 — FR31 Gäste-Pickup: harte Gültigkeitsbedingung oder weiche Präferenz?

- **Fundstelle:** prd.md Z. 328–335 (FR31 „bedingtes zentrales Planungsziel"),
  Z. 268–275 (FR18-Gültigkeit erwähnt FR31 nicht).
- **Problem:** FR18 zählt zwei Gültigkeitsbedingungen auf (FR16-Schwellen,
  Ankunft 19.8.) — der Pickup am 15.8. gehört nicht dazu. Ist ein Round-Trip, der
  am 15.8. **keine** fähre-erreichbare Insel anläuft, ungültig (dann muss FR18 um
  Bedingung (3) erweitert werden) oder nur schlechter gescored (dann fehlt die
  Score-Regel)? Zudem offen: Muss das Boot am 15.8. **abends im Hafen** liegen
  (Zustieg „am Abend des 15.8.", d. h. Tagesziel = Pickup-Insel), oder genügt
  Ankunft am 16.8. früh? Und was schlägt die App vor, wenn *kein* Plan einen
  fähre-erreichbaren Hafen am 15.8. erreicht (Teilmenge von K1)?
- **Fix:** FR18 um Bedingung (3) ergänzen: „Tagesziel des 15.8. ist eine Insel
  mit Fährverbindung ab Santorin am 15.8. (Daten aus §9-Recherche); Ankunft des
  Boots vor der Fähren-Ankunft." FR31 präzisieren, dass dies eine harte
  Gültigkeitsbedingung ist, und den Konfliktfall an die K1-Fallback-Regel
  delegieren (Pickup-Bedingung wird als letzte relaxiert / nie relaxiert —
  entscheiden und hinschreiben).

---

## Mittel

### M1 — FR16-Aufkreuz-Regel sprachlich mehrdeutig, nicht formalisiert

- **Fundstelle:** prd.md Z. 234–236 („keine Schläge höher als 65° gegen den wahren
  Wind bei über 25 kn").
- **Problem:** „Höher als 65° gegen den Wind" ist Seglersprache für „höher am Wind
  als 65°", also **TWA < 65°** — ein Entwickler ohne Segelhintergrund liest
  naheliegend das Gegenteil (Winkel > 65°). Außerdem implizit offen: Unterhalb
  25 kn ist jeder Kurswinkel erlaubt (nur Zeitbudget begrenzt)? Und gilt die
  Schwelle für den Durchschnitts- oder den Böenwert?
- **Fix:** Formalisieren: „Ungültig ist jedes Etappen-Segment mit wahrem
  Windwinkel (TWA) < 65° bei mittlerem Wind > 25 kn (Böen zählen nicht gegen
  diese Schwelle, `[ANNAHME]` kalibrieren). Bei ≤ 25 kn sind alle TWA zulässig;
  es begrenzt nur das Tagesbudget."

### M2 — Nachtetappen: Einfüge-Logik und Budget-Wirkung unspezifiziert

- **Fundstelle:** prd.md Z. 238–243 (FR16 Nachtetappen-Bedingungen), Z. 280–291
  (FR19 nutzt sie nicht explizit).
- **Problem:** FR16 definiert, *wann* eine Nachtetappe zulässig ist (<10 kn, 2.
  Woche, max. 2×, strategisch für Nord-Rückkehr oder Santorin/Amorgos) — aber
  nicht, **wann der Solver eine vorschlägt** (nur im K1-Relax-Fall? auch um das
  Wunschbild Santorin zu ermöglichen?), ob sie gegen das 6–7-h-Tagesbudget zählt
  (offensichtlich nicht — steht aber nirgends) und ob der Folgetag ein reduziertes
  Budget bekommt. Auch das Zeitfenster „Nacht" ist undefiniert (kollidiert mit dem
  FR8-Übernachtungsfenster 18:00–09:00: Boot unterwegs = keine Platz-Ampel nötig,
  aber welches Intervall bewertet der Wind-Check <10 kn?).
- **Fix:** FR16 ergänzen: „Nachtetappe = Abfahrt nach 18:00 oder Ankunft vor
  09:00; Wind-Check <10 kn gilt für die gesamte Etappendauer. Zählt nicht gegen
  das Tagesbudget; der Folgetag wird auf Ziel-Budget begrenzt (kein hartes
  Maximum). Der Solver schlägt Nachtetappen nur vor, wenn ohne sie kein gültiger
  Round-Trip mit Santorin/Amorgos- bzw. Rückkehr-Ziel existiert."

### M3 — Addendum Variante 1: Etappenkette unterbrochen (Milos → Polyaigos)

- **Fundstelle:** addendum.md Z. 138–139 (Etappe 6 endet „Milos", Etappe 7
  startet „Polyaigos").
- **Problem:** Startpunkt von Etappe 7 ≠ Endpunkt von Etappe 6 — entweder fehlt
  eine Etappe Milos→Polyaigos (~10 sm) oder Etappe 6 endet real bei Polyaigos.
  Als Seed-Datum übernommen bricht das den Routing-Graphen der Variante 1
  (11 Etappen wären dann 12) und die Distanzsumme.
- **Fix:** Beim Seeding-Abgleich (FR25) korrigieren: entweder Etappe 6 als
  „Kamares/Sifnos – Adamas/Milos (24 sm)" + Zusatzschlag „Milos – Polyaigos"
  ausweisen (dann Etappen-Pool-Hinweis wie bei Variante 2), oder Etappe 6/7 als
  „Sifnos – Milos/Polyaigos-Revier" zusammenfassen. Hinweis analog Variante-2-Fußnote
  ins Addendum.

### M4 — Wunschbild „Amorgos 14.8. + Santorin 15.8." verletzt vermutlich FR16

- **Fundstelle:** prd.md Z. 106–107 (§4: „Wunschbild: Santorin am 15.8., Amorgos
  am 14.8."), Z. 236–239 (FR16 Tagesbudget), Z. 328–330 (FR31: Gäste landen
  **mittags** am 15.8. auf Santorin).
- **Problem:** Amorgos → Santorin sind ~50–60 sm; bei Polare+Offset (~6–8 kn) sind
  das 7–9 h — über dem Ziel-Budget, nahe/über dem harten Maximum, und eine
  Mittags-Ankunft am 15.8. erzwingt Abfahrt in der Nacht (Nachtetappe nur bei
  <10 kn zulässig). Das im Kernkonzept verankerte Wunschbild ist also unter den
  eigenen Schwellen fast nie erreichbar — es wird Erwartungen an den Solver
  erzeugen, die er (korrekt) nicht erfüllt. Zudem bleibt „und/oder" (Z. 106)
  offen: sind *beide* Inseln im selben Trip gemeint oder alternativ?
- **Fix:** Wunschbild als explizit nachrangig markieren („nur falls
  FR16-konform erreichbar — realistisch nur via Nachtetappe bei Schwachwind;
  sonst gilt Santorin *oder* Amorgos") oder auf „Amorgos 13.8., Santorin 15.8.
  mit Zwischenstopp Ios 14.8." korrigieren — mit Philipp klären.

### M5 — Rückfallhäfen-Kette ist tragendes Rechenobjekt, aber nirgends definiert

- **Fundstelle:** prd.md Z. 199–201 (FR9 erwähnt „Rückfallhäfen-Kette westwärts"),
  Z. 288–290 (FR19: PoR = „Restdistanz **über die Rückfallhäfen-Kette**");
  addendum.md enthält keine Kette.
- **Problem:** Der Point of Return und der Meltemi-Sicher-Check (K2) rechnen
  beide über diese Kette — sie ist damit sicherheitsrelevanter Seed-Inhalt wie
  die Schutzprofile. Weder PRD noch Addendum benennen die konkreten Häfen oder
  verweisen auf die Stelle im Brief-Addendum, wo sie stehen (falls dort).
- **Fix:** Kette im Addendum konkret listen (z. B. Serifos – Kythnos (Mericha/
  Loutra) – Kea – Sounion – Alimos, mit Distanzen ab Alimos-Rebasing) oder
  präzise auf die Quelle im Brief-Addendum verweisen; in FR24 als Teil des
  sicherheitsrelevanten Review-Pakets (mit Schutzprofilen zuerst) markieren.

---

## Niedrig

### N1 — FR27: GPS nur einmalig beim App-Start — Stale-Position bei lang offener Session

- **Fundstelle:** prd.md Z. 297–301 (FR27), Z. 91–94 (UM-2 Abendcheck).
- **Problem:** Bleibt die App vom Morgen bis zum Abendcheck offen (kein
  Neustart), rechnet der Abend-Rest-Trip mit der Morgen-Position. Der manuelle
  Fallback existiert, aber niemand denkt abends daran.
- **Fix:** Ein Satz genügt: „Position wird zusätzlich bei jedem
  Forecast-Refresh (FR13) still aktualisiert" — weiterhin ohne Button, kein
  Widerspruch zur Feldtest-Entscheidung.

### N2 — Addendum-Frontmatter veraltet (status: final, updated: 2026-07-30)

- **Fundstelle:** addendum.md Z. 3–5 vs. Z. 124–172 (Inhalte vom 2026-08-02).
- **Problem:** Das Addendum enthält Feldtest-Material vom 2.8., ist aber als
  „final, updated 2026-07-30" ausgewiesen — nachgelagerte Phasen könnten den
  Stand falsch einschätzen.
- **Fix:** `updated: 2026-08-02` setzen; `status` mit dem PRD synchronisieren
  (PRD ist `draft`).

### N3 — FR29: „kleine, sinnvolle Zahl" Alternativ-Routen unquantifiziert

- **Fundstelle:** prd.md Z. 323–327.
- **Problem:** Kein Blocker (UX kann entscheiden), aber der Solver braucht ein
  Abbruchkriterium: wie viele Alternativen werden berechnet, wonach diversifiziert
  (konservativer/ambitionierter, West/Ost)?
- **Fix:** Default festschreiben: „max. 2–3 Alternativen, mindestens eine
  konservativere Eskalationsstufe (FR9) und — falls offen — eine ambitioniertere
  Süd-Option."

### N4 — 2/3-Faustregel vs. Fenster-Logik: Erzählung und Algorithmus nicht verzahnt

- **Fundstelle:** prd.md Z. 29–30 (§1 Faustregel), Z. 331–332 (FR31 argumentiert
  mit der Faustregel), Z. 280–291 (FR19 rechnet stattdessen mit Fenstern).
- **Problem:** Die Faustregel ist als Revier-Heuristik eingeführt und in FR31
  als Begründung verwendet — der Algorithmus (FR19) nutzt sie aber nicht. Rein
  narrativ unschädlich, kann aber in der Dev-Phase als versteckte Anforderung
  missverstanden werden („muss die 2/3-Regel implementiert werden?").
- **Fix:** In §4 oder FR19 einen klarstellenden Satz: „Die 2/3-Faustregel ist
  die Heuristik hinter der Fenster-Logik, keine eigene Rechenregel — implementiert
  wird ausschließlich FR19."

---

## Antworten auf die vier Prüffragen (Kurzfassung)

1. **Innere Konsistenz:** Keine Geister-Referenzen auf gestrichene Konzepte;
   FR-Nummern und §-Verweise stimmen. Aber: Wochentag-Fehler 19.8. (H1),
   Tageszählung 11/12 inkonsistent (H2), Addendum-Kettenbruch (M3),
   Frontmatter veraltet (N2).
2. **Rückkehrfenster-Logik:** §4 und FR19 sind untereinander und zu FR16/FR18
   widerspruchsfrei formuliert — aber nicht implementierbar, solange
   „voller Meltemi" keine Rechengröße ist (K2), und der Fall „kein gültiger
   Round-Trip" ist nicht definiert (K1). Deadline-Kaskade FR18/FR19 offen (H3).
3. **Architektur-/Dev-Blocker:** K1, K2, H2, H3, H4, H6 (Solver-Spezifikation);
   M1, M2, M5 sollten vor Dev-Start entschieden sein.
4. **Ampel-Semantik:** FR8 (Platz/Nacht) und FR17 (Etappe/Option) sind sauber
   getrennt und konsistent referenziert. FR2 (Rest-Trip) ist als dritte Ebene
   richtig angelegt, aber nicht deterministisch definiert und in der Bezugsgröße
   (Hauptroute vs. Möglichkeitsraum) unklar (H5).
