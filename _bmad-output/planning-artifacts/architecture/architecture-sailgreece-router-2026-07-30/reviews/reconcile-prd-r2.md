# Reconcile-Review: PRD (Rev. 2026-08-02) → Architecture Spine (Revision 2)

- **Geprüft:** `_bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/prd.md` (FR1–FR32, NFR0–NFR6, §4 Begriffssystem, §9 Offene Punkte) gegen `ARCHITECTURE-SPINE.md` (AD-1–AD-13, Conventions, Capability Map, Deferred)
- **Datum:** 2026-08-02
- **Maßstab:** Gemeldet werden nur echte Lücken — Punkte, ohne die zwei unabhängig bauende Einheiten inkompatibel oder PRD-widrig bauen würden. Der Spine darf terse sein; PRD-Wiederholung wird nicht gefordert.

## Gesamturteil

Der Spine deckt das Tragende des PRD nahezu vollständig ab — die Kernverträge (FR2-Ampel-Definition, FR18-Gültigkeit + Relaxations-Reihenfolge, FR31 hart/weich, FR30-Breakdown, FR1-Marker-Beschränkung, §4-Begriffe, NFR5/NFR6) sind sauber gelandet. **Ein Befund ist hoch:** Die Horizont-Semantik von AD-13 widerspricht FR18 in einem Punkt, der die Gelb/Rot-Logik und die Süd-Optionen direkt verändert. Dazu drei mittlere und fünf niedrige Befunde.

---

## Befunde

### B1 — Horizont-Semantik: AD-13 bewertet Fern-Etappen gegen Worst-Case, FR18 verlangt „unbewertet / weder gültig noch ungültig" — **HOCH**

- **Fundstelle PRD:** prd.md Z. 287–291 (FR18): „**Etappen jenseits des Forecast-Horizonts** gelten als *unbewertet* — sie machen einen Round-Trip **weder gültig noch ungültig**; betroffene Optionen werden als ‚offen (Horizont)‘ mit Vorbehalt ausgewiesen, und **für den Rückkehr-Check** gilt ersatzweise das Meltemi-Worst-Case-Szenario (FR19)." Ebenso FR2, Z. 164–167: Gelb umfasst den Fall „hängt von **unbewertetem** Forecast-Horizont ab".
- **Fundstelle Spine:** AD-13, Absatz „Horizont" (Z. 310–315): Stages jenseits `reliableHorizonDays` werden **gegen das Meltemi-Worst-Case-Szenario bewertet** und gekennzeichnet; „`unbewertet` bleibt für fehlende Daten/Parse-Fehler reserviert."
- **Warum das eine echte Lücke ist:** Das PRD begrenzt die Worst-Case-Ersatzannahme ausdrücklich auf den **Rückkehr-Check** (FR19). Der Spine wendet sie auf **alle** Fern-Stages an. Folge: Eine ambitionierte Süd-Option, deren Hin-Etappen jenseits des Horizonts unter 30 kn N–NE durchfallen (was für Süd-Kurse fast nie der Fall ist, für Querschläge aber schon), wird im Spine-Modell **ungültig** → Rest-Trip **rot** statt „gelb / offen (Horizont)", und Optionen schließen sich Tage zu früh. Ein Solver-Bauer nach AD-13 und ein UI-/Options-Bauer nach FR2/FR18 bauen hier nachweislich Inkompatibles: Der FR2-Gelb-Zweig „hängt am Horizont" ist unter der AD-13-Lesart nicht erreichbar, weil es dort keine unbewerteten Fern-Stages mehr gibt.
- **Fix-Vorschlag:** AD-13 „Horizont" präzisieren: (a) Fern-Stages werden gegen das Worst-Case-Szenario **informativ** bewertet und als „Fernbereich — Worst-Case-Annahme" gekennzeichnet, zählen aber **nicht gegen die Gültigkeit (FR18(1))**; (b) verbindlich gegen Gültigkeit zählt das Worst-Case-Szenario **nur im Rückkehr-Check** (Fensterende → meltemi-sicherer Hafen → Kette nach Alimos, FR19) — genau wie im PRD; (c) eine Hauptroute mit Fern-Stages ist damit „am Horizont hängend" → FR2-Gelb-Zweig, Optionen „offen (Horizont)". Falls die konservativere Spine-Lesart (Worst-Case überall zählt) **bewusst** gewählt wurde, muss der Spine das als Abweichung vom PRD deklarieren und die FR2-/FR18-Konsequenz (Gelb-Zweig entfällt, Optionsschluss früher) benennen — stillschweigend darf diese Umdeutung nicht bleiben.

### B2 — Optionszustände „offen / schließt am Tag X / geschlossen" fehlen im Assessment-Vertrag — **MITTEL**

- **Fundstelle PRD:** prd.md Z. 285–289 (FR18): „Routen-Optionen werden weiter als **offen / schließt am Tag X / geschlossen** ausgewiesen, bevor sie sich schließen" plus „offen (Horizont)". FR20 (Z. 315–319) leitet die Entscheidungspunkte genau daraus ab („bevor die zugehörige Option verfällt"), „dynamisch berechnet, **keine fest verdrahteten Kalender-Gates**". FR17 (Z. 252–254): Options-Aggregat = Ampel der schwächsten Etappe.
- **Fundstelle Spine:** AD-3 Assessment-Inhalt (Z. 94–101) nennt Alternativen, Rückkehrfenster, PoR, Entscheidungspunkte — aber **keinen Optionszustand** und kein Options-Aggregat; AD-13 bindet FR20, enthält aber keine Regel dazu.
- **Warum echte Lücke:** Optionszustand und Entscheidungspunkte sind derselbe Fachwert aus zwei Blickwinkeln. Steht der Zustand nicht im Assessment-Vertrag, berechnet ihn die UI selbst (AD-2-Bruch) oder ein zweiter Bauer verdrahtet Kalender-Gates — genau das, was FR20 verbietet.
- **Fix-Vorschlag:** AD-3-Assessment um ein Feld je Routen-Option ergänzen: Zustand `offen | offen-horizont | schliesst-am-tag-N | geschlossen` plus Options-Aggregat-Ampel (schwächste Etappe, FR17); in AD-13 ein Satz: „Entscheidungspunkte werden ausschließlich aus Optionszuständen und PoR abgeleitet — keine Datums-/Kalenderkonstanten im Code."

### B3 — Sticky-Split-Layout (NFR1/NFR2/FR4) vs. AD-11 „Views wechseln über UI-State" — **MITTEL**

- **Fundstelle PRD:** prd.md Z. 388–391 (NFR1): „Sticky-Split-Layout (Tagesliste ↔ fixierte Karte, **bidirektional gekoppelt**)"; Z. 393–394 (NFR2): „Sticky-Split-Layout am PC, gestapelt am Handy"; Z. 173–175 (FR4): Itinerar ↔ Karte synchron.
- **Fundstelle Spine:** AD-11 (Z. 252–253): „Navigation: **kein Router** — Views wechseln über UI-State"; Structural Seed listet DayView, MapView, PlaceDetailView als getrennte Views.
- **Warum echte Lücke:** Das PRD verlangt am PC **Gleichzeitigkeit** (Liste und Karte simultan, gekoppelt), der Spine-Wortlaut suggeriert **Umschalten**. Ein UI-Bauer, der DayView und MapView als alternierende Vollbild-Views baut, erfüllt AD-11 wörtlich und verfehlt NFR1/FR4.
- **Fix-Vorschlag:** In AD-11 (oder Structural Seed) einen Satz fixieren: „Der Hauptscreen komponiert DayView + MapView als Sticky-Split (PC) bzw. gestapelt (Handy) — **gleichzeitig sichtbar, bidirektional gekoppelt (FR4)**; ‚Viewwechsel über UI-State' betrifft nur Sekundäransichten (z. B. PlaceDetail, Alternativen)."

### B4 — Puffertag-als-Reserve-Semantik der PoR-Rechnung nicht fixiert — **MITTEL**

- **Fundstelle PRD:** prd.md Z. 309–314 (FR19): PoR „gegen dieselbe Deadline wie FR18 …, **wobei der Puffer-/Hafentag (§4) die Reserve bildet**; Restdistanz über die Rückfallhäfen-Kette vs. **Resttage × Tagesbudget**".
- **Fundstelle Spine:** AD-13 fixiert für den PoR nur die gemeinsame Deadline-Konstante; AD-12 trägt den Hafentag als Plan-Entität (verschiebbar). **Wie der Hafentag in die PoR-Resttage-Zählung eingeht, steht nirgends.**
- **Warum echte Lücke:** Solver (plant den Hafentag als Tag ohne Etappe) und `ppr.ts` (zählt Resttage × Tagesbudget) sind zwei Baueinheiten. Zählt der PoR den Hafentag als Fahrtag mit, liegt der Umkehrpunkt einen Tag zu spät — eine stille, sicherheitsrelevante Differenz von genau der Sorte, die AD-3 („ein Machbarkeitsbegriff") verhindern will.
- **Fix-Vorschlag:** Ein normativer Satz in AD-13: „Die PoR-Rechnung zählt den (ggf. verschobenen) Hafentag **nicht** als Fahrtag — er ist die Reserve; ‚stressfrei' heißt: Rückkehr gelingt in Resttagen **ohne** den Hafentag zu opfern."

### B5 — Wettermodell-Wahl (FR11) fehlt im Config-Katalog von AD-8 — **NIEDRIG**

- **Fundstelle PRD:** prd.md Z. 220–224 (FR11): „Default ECMWF; **Modellwahl als Konfigurationsparameter**, z. B. ICON-EU".
- **Fundstelle Spine:** AD-8 (Z. 188–192) zählt die Config-Parameter enumerativ auf — das Wettermodell fehlt.
- **Warum Lücke:** AD-8 sagt „**Alle** Tuning-Parameter liegen im config-Dokument" und enumeriert; ein Adapter-Bauer, der die Liste als abschließend liest, hardcodet ECMWF — Feldkorrektur (ICON-EU in den Kanälen) bräuchte dann einen Redeploy, genau das von AD-8 Verhinderte.
- **Fix-Vorschlag:** `weatherModel` (Default `ecmwf`) in die AD-8-Aufzählung aufnehmen; Anwendung im Open-Meteo-Adapter.

### B6 — FR10-Warn-Attribute: Wirkung (Anzeige vs. Scoring) nicht festgelegt — **NIEDRIG**

- **Fundstelle PRD:** prd.md Z. 212–216 (FR10): Düsenzonen-Attribute sind „**reine Wind-Planungsinformation**, weil Wettermodelle diese Zonen glätten".
- **Fundstelle Spine:** `windWarnings` existiert am Leg (AD-4), aber weder AD-3 noch AD-10 sagt, ob es die Scoring-Arithmetik berühren darf.
- **Warum Lücke:** Ein Scoring-Bauer könnte „Modelle glätten" als Auftrag lesen, in Düsenzonen einen Wind-Aufschlag zu rechnen; der UI-Bauer zeigt parallel die Warnung. Dann weicht die gezeigte Rechnung (FR30-Breakdown) vom Forecast ab und der Skipper verliert das Vertrauen in den Ausweis.
- **Fix-Vorschlag:** Ein Satz in AD-3 oder AD-10: „`windWarnings` sind reine Anzeige-/Planungsinformation — sie verändern **nie** die gescorten Windwerte oder Dauern."

### B7 — Vlychada/Santorin-Gate (§9) ohne Träger im Spine — **NIEDRIG**

- **Fundstelle PRD:** prd.md Z. 477–483 (§9): Vlychada als einzige Liegestelle Thiras ist für den 50-ft-Kat grenzwertig — „die Kuration hinterlegt das als **Warn-Attribut am Platz**; telefonische Vorabklärung … sonst gilt die **Santorin-Option nur bei bestätigtem Liegeplatz als offen**".
- **Fundstelle Spine:** Das Platz-Schema (AD-4) kennt kein Warn-Attribut; die Bedingung „Option nur bei bestätigtem Liegeplatz offen" hat weder in AD-13 (Optionszustände) noch im Deferred-Block einen Eintrag.
- **Warum Lücke:** Schema-/Seeding-Bauer und Options-Bauer brauchen beide einen Haken dafür — fehlt er, ist Santorin im Solver bedingungslos offen, PRD-widrig.
- **Fix-Vorschlag:** (a) Platz-Schema um optionales `warnings: string[]`-Feld ergänzen (AD-4, deckt auch Vlychada-Maße); (b) Deferred-Eintrag: „Santorin-Freigabe: Options-/Varianten-Flag (`confirmed`/kuratiert) — vor dem Törn telefonisch klären; unbestätigt wird die Santorin-Verlängerung nicht als offen geführt."

### B8 — FR27-Abweichung: GPS „einmalig beim App-Start" vs. „bei jedem Forecast-Refresh still aktualisiert" — **NIEDRIG**

- **Fundstelle PRD:** prd.md Z. 320–324 (FR27): Position „**einmalig beim App-Start**".
- **Fundstelle Spine:** AD-11 (Z. 246–249): zusätzlich „bei jedem Forecast-Refresh still aktualisiert".
- **Bewertung:** Die Erweiterung ist fachlich sinnvoll (verhindert genau den in AD-11 genannten Fehler „Abendcheck rechnet mit der Morgen-Position") und die Manual-Präzedenz bleibt gewahrt — aber sie geht über den PRD-Wortlaut hinaus. Keine Bau-Inkompatibilität, nur ein undeklarierter Delta.
- **Fix-Vorschlag:** Im Spine als bewusste Abweichung markieren („erweitert FR27, Feldtest-Motivation") oder das PRD in der nächsten Revision nachziehen.

### B9 — FR5-Meta-Informationen (Einkauf, Tanken, Ankerplätze) ohne Schema-Träger — **NIEDRIG**

- **Fundstelle PRD:** prd.md Z. 176–180 (FR5): jeder Hafen in den Etappen-Cards „mit **allen verfügbaren Meta-Informationen** aus Recherche und Routing hinterlegt (geschützt für welche Windrichtungen, Ankerplätze, **Einkaufs- und Tankmöglichkeiten** etc.)".
- **Fundstelle Spine:** AD-4 fixiert normative Kern-Formen (ShelterProfile, Leg, Variante, Plan), aber die Platz-Qualitäten folgen nur der FR6-Feldliste (Schönheit, Restaurant, Badestrand, Foto) — Einkauf/Tank/Ankerplatz-Details haben kein benanntes Feld.
- **Warum (kleine) Lücke:** Seeding-Kuration und Schema sind zwar über AD-4 gekoppelt (dieselbe Zod-Quelle), aber ohne benannten Träger recherchiert die Kuration diese Infos womöglich gar nicht erst — und FR5 ist dann in der Detail-Card nicht erfüllbar.
- **Fix-Vorschlag:** Im Platz-Schema ein Feld für kuratierte Meta-Infos vorsehen (z. B. `amenities`/`notes`, Form bei der Kuration festlegen — analog zum bestehenden FR31-Platzhalter) und in AD-4 eine Zeile ergänzen.

---

## Explizit geprüft und als abgedeckt bestätigt (keine Befunde)

| PRD-Punkt | Spine-Stelle | Status |
| --- | --- | --- |
| FR2 Rest-Trip-Ampel: vollständige Grün/Gelb/Rot-Definition inkl. Alternativ-Existenz | AD-3 (Z. 94–98), AD-13 (Rot-Fall) | ✔ vollständig (Gelb-Horizont-Zweig: siehe B1) |
| FR2 Auslöser (Forecast, FR28-Edit, Trip-Verlauf) | AD-3 (voller Refresh), AD-12 (Edit → Neuberechnung, vergangene Tage fixiert) | ✔ |
| FR18: alle drei Gültigkeitsbedingungen | AD-13 (1)–(3), eine Deadline-Konstante `returnDeadline` | ✔ |
| FR18: Relaxations-Reihenfolge, 65°/25 kn nie relaxiert | AD-13 (ergänzt konsistent: Pickup nie relaxiert) | ✔ |
| FR19: Fenster-Erkennung, Fensterende → meltemi-sicherer Hafen, konservativer Modus, Worst-Case als Config-Objekt | AD-13, AD-8 | ✔ (Puffertag-Reserve: B4) |
| FR19/AD-10: Rückfallkette ein Owner (`rueckfallkette-west`), keine Konstanten in `ppr.ts` | AD-10 | ✔ |
| FR20: Entscheidungspunkte im Assessment | AD-3 | ✔ Existenz (Ableitungsregel: B2) |
| FR30: Breakdown-Tiefe (Segmente/Wegpunkte, Wind, TWA, Polar-Speed, Segel- vs. Motorzeit), ein Rechenpfad, UI rechnet nie nach | AD-3 „Berechnungsausweis" | ✔ vollständig |
| FR31: harte Fähre-Bedingung vs. weiche Santorin-Präferenz; Pickup nie relaxiert; Datenfeld + Deferred | AD-13, AD-4, Deferred | ✔ |
| FR1: Ampel-Marker nur aktuelle Insel + Ziel-Insel, `nachtN = heutiger Törntag` | AD-9 | ✔ |
| FR16 Nachtetappen (Definition, <10 kn ganze Dauer, max. 2, zweite Woche, nur wenn zwingend) | AD-9 + AD-13 | ✔ |
| FR15 „künftiges Zeitfenster, nie heutiger Wind"; Abfahrt 09:00 konfigurierbar | AD-3, AD-9, AD-11 | ✔ |
| FR26 Polar-Offset einzig in `domain/polar.ts`, Fallback-Pauschalen in Config | AD-8, AD-10 | ✔ |
| FR22 aktiver Vorschlag (Feldtest-Umkehr), UI blendet nichts aus | AD-3, AD-12 | ✔ |
| FR28/FR29 Pin-/Check-in-Semantik, Erststart-Adoption, keine Header-Auswahlbox (`trackedRouteId` entfällt) | AD-12 | ✔ |
| FR32 Törntag aus Datum, kein UI-Element | AD-9, AD-11 | ✔ |
| NFR1: Design-Anspruch | Frontmatter-Bind + Addendum als Quelle; strukturelle Kollision Split vs. Viewwechsel: B3 | (B3) |
| NFR5: Open-Meteo-Attribution (CC BY 4.0), CruisersWiki-Attribution, Datenstand/Modelllauf permanent, Fehler → sichtbarer Hinweis | Consistency Conventions „Pflicht-UI-Hinweise", „Fehler" | ✔ (DWD/NOAA-Fallback ist im PRD nur „benannt", kein Bau-Auftrag — keine Lücke) |
| NFR6 / FR8: unkuratiert nie grün, `unbewertet` grau, kein stilles Ausblenden; Schutzprofil Pflichtfeld; Übernachtungsfenster 18–09 Athens | AD-4, AD-9, Conventions „Ampel-Werte" | ✔ |
| §4 Begriffssystem (Tagesziel=Insel → Platz zweistufig, Hauptroute, Alternativ-Route, Möglichkeitsraum, Rückkehrfenster, PoR, Ampel auf drei Ebenen) | AD-3 (`bestPlace`), AD-12 (Stage mit `toIslandId`/`toPlaceId?`), Conventions | ✔ konsistent verwendet |
| §4 Wunschbild Santorin 15.8./Amorgos 14.8. als weiche Präferenz, 2/3-Regel nur Narrativ | AD-13 Zielfunktion | ✔ |
| FR9 Saronischer Golf gestrichen (auch aus Seed) | AD-4 | ✔ |
| FR25 Alimos-Rebasing einmalig im Seeding, `rebasedFrom?` | AD-10 | ✔ |
| NFR3-Hinweis permanent sichtbar | Conventions „Pflicht-UI-Hinweise" | ✔ |

## Fazit

Kein Befund blockiert den Baustart des Umbaus; **B1 sollte vor Implementierung von `solver.ts`/`options.ts` entschieden werden** (Horizont-Semantik ist Fundament von FR2-Gelb, Optionsschluss und Süd-Reichweite), B2–B4 vor den jeweiligen Modulen (Assessment-Vertrag, Hauptscreen-Layout, `ppr.ts`). B5–B9 sind Ein-Satz-Ergänzungen.
