---
title: 'Review: ARCHITECTURE-SPINE sailgreece-router — Good-Spine-Checkliste'
type: review-rubric
subject: _bmad-output/planning-artifacts/architecture/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md
sources-consulted:
  - _bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/prd.md
  - _bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/addendum.md
created: 2026-07-30
verdict: 'Freigabefähig nach Nachschärfung der zwei Hoch-Befunde'
findings: { hoch: 2, mittel: 4, niedrig: 4 }
---

# Review: Architecture Spine — sailgreece-router

**Kontext des Reviews:** Hobby-/Solo-Projekt, ein Entwickler = einziger Nutzer, 9 Tage
Deadline. Rigor entsprechend kalibriert — aber die Schutzampel-Logik ist real
sicherheitsrelevant (Familie, Meltemi, Ankern bei 6–8 Bft), dort gilt voller Ernst.
Severity misst die Auswirkung auf die **Konsistenz der Umsetzung**: Würden zwei
unabhängige Bauer (oder derselbe Bauer an Tag 2 und Tag 7) hier auseinanderlaufen?

**Gesamturteil:** Ein für die Projektgröße vorbildlich schlanker, größtenteils
durchsetzbarer Spine, der die gefährlichsten Divergenzpunkte (Richtungssemantik,
Engine-Vertrag, Ein-Schema-Prinzip, Ein-Schreiber-Prinzip) explizit fixiert und —
selten genug — den operativen Umschlag als eigene AD entscheidet; freigabefähig,
sobald die zwei Hoch-Befunde (Ampel-Zustand für Unbewertetes, räumliches
Forecast-Sampling) nachgezogen sind.

---

## Checklisten-Durchgang

### (1) Fixiert er die echten Divergenzpunkte für die Ebene darunter — und übersieht keinen?

**Weitgehend ja — die großen sind getroffen.** Die vier Punkte, an denen dieses System
still und gefährlich divergieren könnte, sind alle als Invariant fixiert:

- **AD-6 (Richtungs-/Einheitensemantik)** ist der beste Abschnitt des Dokuments. Die
  „kommend aus"-Konvention über Wind, Welle *und* Schutzsektoren hinweg adressiert
  exakt den vom Spine selbst benannten „gefährlichsten stillen Fehler" — invertierte
  Schutzlogik. Dass auch Zeit (UTC gespeichert, Europe/Athens angezeigt) und Einheiten
  fixiert sind, verhindert eine ganze Klasse von F2↔F4↔F5-Inkonsistenzen.
- **AD-3 (ein Snapshot rein, ein Assessment raus)** fixiert die Konsistenz der
  Bewertungen über Forecast-Läufe hinweg — das Kernrisiko von FR18 („gestern offen,
  heute geschlossen" muss erklärbar bleiben). Vollständige Neuberechnung +
  Zeitstempelpflicht ist die richtige, billige Antwort.
- **AD-4 (ein Schema, zwei Konsumenten)** trifft genau die Naht, an der Seeding-Skripte
  und App auseinanderlaufen würden.
- **AD-2/AD-5/AD-7** fixieren Schichtung, Datenhoheit und Async-State — je ein realer
  Divergenzpunkt, je eine klare Regel.

**Übersehen wurden aber zwei echte Divergenzpunkte** (→ H-1, H-2 unten) und zwei
verschwiegene Dimensionen (→ M-2, M-4). Details in den Befunden.

### (2) Ist jede AD-Rule durchsetzbar und verhindert sie wirklich die genannte Divergenz?

| AD | Durchsetzbar? | Verhindert die genannte Divergenz? |
| --- | --- | --- |
| AD-1 | Ja (Existenz von Server-Code ist binär prüfbar) | Ja |
| AD-2 | Ja — als Import-Verbotsliste formuliert (kein react/firebase/fetch/`Date.now()` in `domain/`), mechanisch prüfbar (Lint/Grep) | Ja |
| AD-3 | Ja („einziger Engine-Einstieg" ist prüfbar) — **aber** „je Ort × Stunde" lässt offen, was ein „Ort" ist (→ H-2) | Teilweise |
| AD-4 | Ja für „einzige Quelle" und „strikt vor Import" — **aber** der NFR6-Satz („unkuratierter oder invalider Platz erhält keine grüne Ampel") ist mit dem Rest der Regel und dem Ampel-Typ nicht widerspruchsfrei umsetzbar (→ H-1) | Teilweise |
| AD-5 | Ja — Security Rules `write: false` erzwingen es serverseitig, nicht nur per Konvention. Stark. | Ja (kleine Randspannung → N-3) |
| AD-6 | Ja als Konvention; ideal ergänzt um einen Test, der die Sektor-Semantik an einem bekannten Fall festnagelt (→ M-3) | Ja |
| AD-7 | Ja („jeder asynchrone Datenzugriff läuft als Query" ist reviewbar) | Ja |
| AD-8 | Ja (manuelles Deploy, ein Projekt — trivial prüfbar) | Ja |

Positiv hervorzuheben: Jede AD hat einen expliziten **Prevents**-Abschnitt — die Regeln
sind als Divergenz-Verhinderer *begründet*, nicht nur behauptet. Das ist die richtige
Form.

### (3) Kann nichts unter Deferred zwei unabhängige Bauer divergieren lassen?

Fünf von sechs Deferred-Einträgen sind sauber gekapselt:

- **Restplan-Suchalgorithmus:** hinter AD-3 verkapselt, ein Modul — safe. (Aber: das
  gleiche Machbarkeits-Konzept braucht auch `ppr.ts` → N-2.)
- **Gelb-Band-Reserve:** als Parameter im `config`-Dokument verortet — safe, sogar gut
  (der Deferral hat bereits eine Adresse).
- **Foto-Hosting:** Schema trägt vorerst `photoUrl` — der Deferral ist
  schnittstellen-stabil. Vorbildlich formuliert.
- **CI / Offline / Auth / Editier-UI:** out of scope bzw. bewusst manuell — safe.
- **UI-Komponentenstruktur & Y.CO-Umsetzung:** als UX-Phase-Deferral legitim — **aber
  darunter versteckt sich eine Stack-Entscheidung** (CSS-Technologie), die nicht in die
  UX-Phase gehört, sondern in den Spine (→ M-2).

### (4) Ist benannte Technik verifiziert-aktuell (Stand Juli 2026)?

Die verifizierte Liste (Vite 8, React 19, TS 5.9 bewusst gepinnt, Firebase SDK 12,
@vis.gl/react-google-maps 1.x, TanStack Query 5, Zod 4, Vitest 4) stimmt 1:1 mit dem
Stack-Block überein. Die TS-5.9-Pinnung ist mit Begründung dokumentiert (7.0 GA erst
Juli 2026, Tooling reift) — genau so soll eine bewusste Nicht-Aktualität aussehen.

Zwei Punkte lagen außerhalb der verifizierten Liste und wurden für dieses Review
web-geprüft (2026-07-30):

- **firebase-tools 15.x: bestätigt** (npm zeigt 15.x als aktuelle Linie).
- **„AdvancedMarker + Polyline nativ": halb falsch.** AdvancedMarker ja; eine
  Polyline-Komponente **exportiert die Bibliothek nicht** — sie existiert nur als
  Beispiel-Komponente im visgl-Repo zum Kopieren (offizieller empfohlener Weg), und
  gestrichelte Linien (FR2) brauchen zusätzlich den Symbol-Workaround, den das
  PRD-Addendum korrekt benennt. → M-1.

Quellen der Nachprüfung:
[visgl/react-google-maps README](https://github.com/visgl/react-google-maps/blob/main/README.md) ·
[Polyline-Beispielkomponente im Repo](https://github.com/visgl/react-google-maps/blob/main/examples/geometry/src/components/polyline.tsx) ·
[Discussion #636 (Geometrie-Komponenten nicht exportiert)](https://github.com/visgl/react-google-maps/discussions/636) ·
[firebase-tools auf npm](https://www.npmjs.com/package/firebase-tools?activeTab=versions) ·
[Firebase CLI Release Notes](https://firebase.google.com/support/release-notes/cli)

### (5) Deckt er die Capabilities des treibenden PRD ab (F1–F8)?

**Ja.** Die Capability→Architecture Map führt alle acht Capabilities mit FR-Nummern,
Ort und governierender AD. Stichproben gegen das PRD:

- F5/FR26 (Polare + 0,5-kn-Offset): `polar.ts` + Offset im Snapshot (AD-3) + Parameter
  im `config`-Dokument (AD-8) — konsistent abgedeckt.
- F6/FR27 (Geolocation mit manuellem Override): `adapters/geolocation.ts`, Position als
  Snapshot-Parameter — abgedeckt.
- F4/FR13 (Cache-TTL, Datenstand sichtbar): AD-7 `staleTime` ≈ 1 h liegt im
  PRD-Korridor (1–3 h); Zeitstempelpflicht in AD-3 und Logging-Konvention.
- Das gestrichene FR14 wird korrekt nicht gebunden.

Zwei Randlücken auf FR-Ebene: die FR24-Review-Sicht hat in `seeding/` keinen benannten
Ort (→ N-4), und der FR26-Fallback (Pauschalgeschwindigkeiten, solange keine Polare
geladen ist) hat keine benannte Adresse — vermutlich `config`, aber ungesagt (in N-4
mitgeführt).

### (6) Ist jede Dimension der Feature-Altitude entschieden / deferred / als offene Frage benannt — insbesondere der operative Umschlag?

**Der operative Umschlag ist die Stärke dieses Spines:** AD-8 entscheidet Provider
(ein GCP-/Firebase-Projekt), Environments (bewusst nur prod), Deploy-Weg (klassisches
Hosting, manuell, bewusst kein CI — mit dem App-Hosting-Fehlgriff als explizit
verhinderter Divergenz), Key-Handling (Referrer-Restriction, „öffentlich by design")
und Betriebs-Tuning (Feldkorrektur via `config`-Dokument ohne Redeploy). CI ist nicht
verschwiegen, sondern deferred mit Wiedervorlage-Trigger. Das erfüllt die Checkliste
in diesem Punkt vollständig.

**Verschwiegene Dimensionen gibt es dennoch vier** — keine davon ist deferred oder als
offene Frage benannt, also sind sie Befunde: Styling-Technologie (M-2),
Test-Verbindlichkeit für die Sicherheitslogik (M-3), Client-Navigation (M-4),
Persistenz des Törnkontexts (N-1).

---

## Befunde

### Hoch

#### H-1 — Die Ampel kennt keinen Zustand für „unbewertet/unkuratiert" — NFR6 ist so nicht widerspruchsfrei umsetzbar

- **Wo:** AD-4 (letzter Satz), Consistency Conventions („Ampel-Werte"), NFR6.
- **Befund:** Der Ampel-Typ ist auf `'gruen' | 'gelb' | 'rot'` fixiert („überall
  derselbe, keine lokalen Farb-Enums"). AD-4 verlangt zugleich: invalide Dokumente
  beim Lesen überspringen, und „ein unkuratierter oder invalider Platz erhält keine
  grüne Ampel" (NFR6). Damit sind mindestens drei divergente Umsetzungen regelkonform:
  (a) Platz erscheint gar nicht (übersprungen), (b) Platz erscheint mit Rot
  (konservativ, aber semantisch falsch — Rot heißt laut Konvention „fachliches
  Ergebnis", nicht „keine Daten"), (c) Bauer führt doch ein lokales viertes
  Ampel-Enum ein und verletzt die Konvention. Unklar ist auch die Vorstufe: Ist ein
  Platz *ohne* Schutzprofil schema-invalid (dann kann „unkuratiert" in der DB gar
  nicht existieren) oder valid-aber-unbewertbar (dann braucht die Anzeige einen
  Zustand dafür)?
- **Warum Hoch:** Direkt sicherheitsrelevant (die Ampel ist das Sicherheitsversprechen
  der App) und ein garantierter Divergenzpunkt — die drei Lesarten sehen in der UI
  fundamental verschieden aus.
- **Vorschlag:** Entscheiden und im Spine fixieren, z. B.: Schutzprofil ist im Schema
  Pflichtfeld (unkuratiert ⇒ kommt nicht durch den Import); der Anzeige-Typ wird um
  einen expliziten vierten Zustand `'unbewertet'` (grau) erweitert für den
  Laufzeitfall „Forecast fehlt/Parse-Fehler" — niemals Grün, niemals stummes
  Ausblenden eines kuratierten Platzes.

#### H-2 — Räumliches Forecast-Sampling ist unfixiert: Was ist ein „Ort", und gegen welchen Punkt wird eine Etappe bewertet?

- **Wo:** AD-3 („Forecast je Ort × Stunde"), Lücke zwischen F4 (adapter) und F5/F6
  (domain).
- **Befund:** Das Zeitfenster einer Etappe ist vorbildlich fixiert (Törntag N+k,
  künftiges Fenster, nie heutiger Wind — FR15). Die **räumliche** Dimension fehlt
  komplett: Besteht die Ortsmenge nur aus Plätzen oder auch aus Etappen-Wegpunkten
  (FR3 sagt „je Wegpunkt/Platz")? Wird eine Etappe Paros→Naxos gegen den Wind am
  Startplatz, am Zielplatz, am Mittelpunkt oder an mehreren Punkten entlang der Route
  bewertet? Gerade bei den Düsenzonen (FR10 existiert, *weil* Modelle Kanäle glätten)
  ändert die Antwort das Scoring-Ergebnis materiell. Der Punkt liegt genau auf der
  Naht adapter↔domain: Der Adapter-Bauer muss wissen, welche Koordinaten er abruft
  (bestimmt zugleich die API-Call-Zahl, NFR5), der Domain-Bauer, welche Werte eine
  Etappe konsumiert — zwei Bauer treffen hier heute zwei verschiedene Annahmen.
- **Warum Hoch:** Kern-Divergenzpunkt der sicherheitsrelevanten Bewertungskette
  (Scoring → Optionsraum → PPR hängen alle daran); nachträgliche Änderung verschiebt
  alle Ampeln.
- **Vorschlag:** Eine Zeile in AD-3 genügt, z. B.: „Ortsmenge = alle Plätze der
  Bibliothek plus je Etappe die in der Routenbibliothek hinterlegten Wegpunkte; eine
  Etappe wird gegen Start-, Ziel- und Wegpunkt-Werte ihres Zeitfensters bewertet,
  Ampel = schlechtester Punkt." (Konkrete Wahl ist frei — sie muss nur *getroffen*
  sein.)

### Mittel

#### M-1 — Stack-Faktenfehler: `@vis.gl/react-google-maps` 1.x exportiert keine Polyline-Komponente

- **Wo:** Stack-Tabelle („AdvancedMarker + Polyline nativ").
- **Befund:** Web-Check (2026-07-30): AdvancedMarker ist nativ; eine Polyline ist
  **nicht** Teil der Bibliotheks-API, sondern eine Beispiel-Komponente im visgl-Repo,
  die man in den eigenen Code kopiert (offiziell empfohlener Weg). Für die
  gestrichelten Routenlinien (FR2) kommt der `repeat`-Symbol-Workaround dazu — den
  kennt das PRD-Addendum, der Spine überschreibt ihn mit „nativ".
- **Warum Mittel:** Kein Showstopper (Lösung ist bekannt und klein), aber der Spine
  gibt dem Bauer eine falsche Zusicherung genau an der Stelle, an der das Addendum
  bereits die richtige Warnung enthielt; bei 9 Tagen kostet die Überraschung am
  falschen Tag Stunden.
- **Vorschlag:** Stack-Zeile korrigieren: „AdvancedMarker nativ; Polyline als kopierte
  visgl-Beispielkomponente, gestrichelt via Symbol-`repeat` (siehe PRD-Addendum)."

#### M-2 — Styling-/CSS-Technologie: weder entschieden noch deferred noch als offene Frage benannt

- **Wo:** Stack-Tabelle, Deferred — Fehlstelle.
- **Befund:** NFR1 formuliert einen expliziten, hohen Design-Anspruch (Y.CO-Ästhetik,
  persönlicher Qualitätsmaßstab), aber der Spine schweigt vollständig zur
  CSS-Technologie (Tailwind? CSS Modules? vanilla CSS + Custom Properties?). Der
  Deferred-Eintrag „UI-Komponentenstruktur & Y.CO-Umsetzung → UX-Phase" deckt Layout
  und Komponenten, nicht die Werkzeugwahl — die ist Stack-Altitude und gehört in
  dieselbe Tabelle wie Vite und React. Ein ganz verschwiegenes Thema ist der Befund.
- **Warum Mittel:** Jeder UI-Baustein ab Tag 1 trifft diese Entscheidung implizit;
  nachträgliche Vereinheitlichung ist reine Verschwendung im 9-Tage-Budget.
- **Vorschlag:** Eine Zeile im Stack (Empfehlung passend zum ruhigen
  Custom-Design: vanilla CSS mit Custom Properties oder Tailwind 4 — Hauptsache
  benannt) oder ein explizites Deferred mit Entscheidungstermin „vor erster
  UI-Komponente".

#### M-3 — Keine Test-Verbindlichkeit für die sicherheitsrelevante Domänenlogik

- **Wo:** Stack (Vitest 4.x), AD-2 — Fehlstelle.
- **Befund:** AD-2 macht den Core testbar (pur, deterministisch, injizierte Zeit) und
  Vitest steht im Stack — aber keine Regel *verlangt* Tests. Für 90 % der App ist das
  bei diesem Projektzuschnitt korrekt kalibriert. Für Schutzampel (AD-6-Semantik!),
  Scoring-Schwellen (25-kn-Regel, FR16-Budgets) und Polar-Interpolation ist es das
  nicht: Genau hier hat das PRD Sicherheitsrelevanz markiert, und genau die
  AD-6-Sektorlogik ist der selbstbenannte „gefährlichste stille Fehler" — dessen
  billigste Absicherung ein Fixture-Test mit bekannten Fällen ist (z. B. „Meltemi aus
  N, Bucht nach S offen ⇒ grün; nach N offen ⇒ rot").
- **Warum Mittel:** Konsistenz-/Sicherheitslücke mit sehr billiger Abhilfe; ohne Regel
  entscheidet Tagesform unter Termindruck — das PRD warnt selbst davor
  (Gegen-Metrik: „Termindruck darf nicht zu ungeprüften Schutzprofilen führen").
- **Vorschlag:** Ein Satz in AD-2: „`domain/ampel`, `domain/scoring` und
  `domain/polar` tragen Vitest-Fixtures mit bekannten Referenzfällen (insbesondere
  AD-6-Sektorsemantik); UI und Adapter bleiben testfrei."

#### M-4 — Client-Navigation unbenannt: Router ja/nein, URL-Struktur

- **Wo:** Paradigm (`ui/` mit „Views"), Structural Seed — Fehlstelle.
- **Befund:** Der Spine benennt mehrere Views (Tagesansicht, Karte, Platz-Detail),
  entscheidet aber nicht, wie zwischen ihnen navigiert wird: React-Router mit URLs
  oder state-basierter View-Switch im TripContext? Betrifft konkret die
  PC-und-Handy-Nutzung (NFR2): Reload/Teilen/Zurück-Geste am Handy verhalten sich je
  nach Wahl völlig anders. Weder Stack noch Deferred noch offene Frage.
- **Warum Mittel:** Echte, früh fällige Weichenstellung, die die `ui/`- und
  `app/`-Struktur prägt; für eine Solo-App aber ohne Sicherheitsbezug.
- **Vorschlag:** Entscheiden (bei drei Views ist auch „kein Router, View-State im
  TripContext" eine legitime, dann aber ausgesprochene Wahl).

### Niedrig

#### N-1 — Persistenz des Törnkontexts undefiniert

Der Törnkontext (Törntag, gewählte Option, manuell übersteuerte Position, ggf.
Abfahrtszeit-Override) lebt laut AD-7 im React-Context — also ephemer. Ob ein Reload
am Handy (täglicher Nutzungsmodus, UM-1/UM-2) alles vergisst oder localStorage
puffert, ist weder entschieden noch deferred. Da die App Firestore-seitig strikt
lesend ist (AD-5), ist localStorage der einzige Kandidat — ein Satz würde genügen.

#### N-2 — Restplan-Machbarkeit: gemeinsames Primitive für `options.ts` und `ppr.ts` unbenannt

FR18 (Option offen ⇔ zulässiger Restplan existiert) und FR19 (PPR über
Rückfallhäfen-Kette) beruhen auf demselben Machbarkeits-Begriff (Etappendauern aus
Polare + Offset gegen Schwellen und Deadline). Der Deferred-Eintrag verortet den
Suchalgorithmus nur in `options.ts`; dass `ppr.ts` dieselbe Dauer-/Schwellenrechnung
nutzt statt einer eigenen, sagt niemand. Bei einem Solo-Bauer verkraftbar, aber eine
Zeile („beide konsumieren dieselbe Etappen-Dauerfunktion aus `scoring.ts`/`polar.ts`")
schließt es.

#### N-3 — Randspannung: „einziger Schreiber Seeding-Skripte" (AD-5) vs. „Korrekturen im Feld via direkter DB-Änderung" (PRD §7)

Das PRD sieht Feldkorrekturen an Bibliotheksdaten per direkter DB-Änderung vor
(Konsole); AD-5 erklärt die Seeding-Skripte zum einzigen Schreiber, und AD-8 erlaubt
Feldkorrektur explizit nur für `config`. Vermutlich gemeint: „einziger *programmatischer*
Schreiber, Konsole ausgenommen" — aber ungesagt. Zweitfolge: Nach Konsolen-Edits
driftet das Staging-JSON in `seeding/` von der DB weg; ein erneuter Import überschriebe
Feldkorrekturen. Ein klärender Halbsatz in AD-5 reicht.

#### N-4 — Zwei FR-Details ohne architektonische Adresse: FR24-Review-Sicht und FR26-Fallback

Die „kompakte Abstimmungssicht" der Kuration (FR24 — sicherheitsrelevanter
Review-Schritt!) hat in `seeding/` keinen benannten Ort oder Form (generiertes
Markdown? HTML?); und die Fallback-Pauschalgeschwindigkeiten (FR26, solange keine
Polare geladen) haben keine benannte Heimat (vermutlich `config`-Dokument, aber
ungesagt). Beides je ein Halbsatz.

---

## Positivbefunde (bewahrenswert)

- **AD-6** ist ein Musterbeispiel: Der gefährlichste stille Fehler des Systems ist
  benannt, semantisch fixiert und über alle Schichten durchdekliniert.
- **AD-8** beantwortet den operativen Umschlag vollständig und begründet sogar den
  vermiedenen Fehlgriff (App Hosting) — die Checklisten-Frage 6 ist im Kern erfüllt.
- **Prevents-Abschnitte** an jeder AD: Die Regeln sind als Divergenz-Verhinderer
  hergeleitet, nicht dekretiert.
- **Rigor-Kalibrierung stimmt:** kein CI, keine Multi-Envs, `console`-Logging,
  manuelles Deploy — konsequent NFR0; die Schlankheit ist entschieden, nicht
  verschwiegen (mit Ausnahme der vier benannten Fehlstellen).
- **Deferred-Einträge tragen Adressen und Trigger** (Foto-URL-Feld als stabiler
  Schnittstellen-Platzhalter, Gelb-Band als config-Parameter, CI mit
  Wiedervorlage-Bedingung) — genau so bleibt Deferral divergenzfrei.

## Empfohlene Reihenfolge der Nacharbeit

1. H-1 und H-2 im Spine fixieren (je wenige Zeilen, vor Baubeginn der Domäne).
2. M-1 Stack-Zeile korrigieren, M-2 Styling-Zeile ergänzen, M-3 Test-Satz in AD-2,
   M-4 Navigations-Entscheid — zusammen < 30 Minuten Spine-Arbeit.
3. N-1 bis N-4 als je ein Halbsatz beim nächsten Touch mitnehmen.
