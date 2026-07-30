---
title: 'Adversarial Review — Architecture Spine sailgreece-router'
type: review-adversarial
target: ../ARCHITECTURE-SPINE.md
created: '2026-07-30'
method: >
  Angriff als Adversar: Paare von Build-Einheiten eine Ebene unter dem Spine
  (Epics/Stories), die JEDE AD buchstabengetreu befolgen und trotzdem
  inkompatibel bauen. Jedes gefundene Paar = Loch; je Loch ein konkreter
  AD-/Regel-Vorschlag.
verdict: NICHT BUILD-SICHER ohne Nachschärfung — 8 Löcher, davon 4 kritisch (H1, H2, H3, H5)
---

# Adversarial Review — Architecture Spine `sailgreece-router`

**Angriffsmodell:** Zwei Stories werden parallel und ohne Absprache implementiert.
Beide Entwickler lesen nur den Spine + PRD, halten jede AD wörtlich ein — und
liefern trotzdem Artefakte, die beim Zusammenstecken falsch rechnen oder sich
gegenseitig überschreiben. Jedes konstruierbare Paar ist ein Loch im Spine.

**Gesamturteil:** Der Spine ist in Schichtung (AD-1/2), Ownership auf
Persistenz-Ebene (AD-5) und Einheiten-Semantik (AD-6) stark. Er ist aber an
genau den Stellen unterspezifiziert, an denen zwei Einheiten eine **gemeinsame
Zahl** produzieren müssen: Datenformen sind nur als *Quelle* verankert, nicht
als *Form* (AD-4); der Engine-Vertrag fixiert Input-Existenz, aber nicht
Input-**Menge**, Output-Form oder Verantwortung für Vorverarbeitung (AD-3);
Zeitfenster-, Offset- und Distanz-Semantik haben je zwei plausible Leser.
**8 Löcher, 4 davon führen zu still falschen sicherheitsrelevanten Zahlen**
(Ampel, PPR) — der laut Spine „gefährlichste stille Fehler des Systems" ist
mit AD-6 nur zur Hälfte geschlossen.

---

## H1 — Schutzsektor-Form: AD-4 fixiert die Quelle, nicht die Gestalt `[KRITISCH]`

**Paar:** Story „Seeding-Pipeline: Schutzprofile aus Heikell/CruisersWiki"
(F8) vs. Story „Ampel-Engine `domain/ampel.ts`" (F2/FR8).

**Beide AD-treu:** AD-4 verlangt nur, dass die Datenform als Zod-Schema in
`src/domain/schema/` liegt. Es sagt nicht, **wie** ein Schutzprofil aussieht
und **wer** das Schema zuerst schreibt. Beide Stories berühren
`domain/schema/` legitim (Capability-Map: F2 „lives in `domain/schema` +
Firestore" **und** F8 „lives in `seeding/`, governed by AD-4").

**Kollision (jede Variante ist AD-4- und AD-6-konform):**

- Seeding modelliert `sectors: [{ from: 330, to: 60, maxBft: 7 }]` —
  Quellensprache Heikell ist Beaufort; die Ampel-Story erwartet
  `maxWindKn` (AD-6 sagt „Geschwindigkeiten in kn", verbietet aber kein
  `maxBft`-Feld, denn Bft ist keine Geschwindigkeit, sondern eine Skala).
- Sektor-Wrap über Nord: Seeding schreibt `from: 330, to: 60` (im
  Uhrzeigersinn, wrappend); die Ampel-Story prüft `from <= dir && dir <= to`
  → **jeder Nord-Sektor — im Meltemi-Revier der wichtigste — bewertet
  invertiert.** AD-6 fixiert „kommend aus" und 0–360, aber nicht die
  Intervall-Semantik.
- Wellen-Schutz: Seeding legt **einen** Sektorsatz für Wind+Welle an
  (FR7 liest sich so), die Engine erwartet getrennte `windSectors` /
  `waveSectors` (FR12 Swell ≠ Windsee) — Parse schlägt fehl, App „parst
  tolerant, überspringt Dokument" (AD-4) → **alle Plätze still grau, keine
  einzige Ampel**, und niemand hat eine Regel verletzt.

**Loch:** AD-4 ist notwendig, aber nicht hinreichend: „ein Schema" schützt
nicht, wenn das Schema selbst umkämpftes Terrain zweier Stories ist.

**Vorschlag — AD-4 schärfen + neue Regel „Schema-Freeze":**
> Die Kern-Datenformen (mindestens `ShelterProfile`) werden **im Spine selbst
> normativ fixiert**: `ShelterProfile = { windSectors: Sector[], waveSectors:
> Sector[] }`, `Sector = { fromDeg: number, toDeg: number, maxKn: number }`
> (Wellen: `maxM`) mit Semantik: *geschützt gegen Richtungen von `fromDeg` im
> Uhrzeigersinn bis `toDeg`, Wrap über 360→0 erlaubt; Grenzen inklusiv;
> Stärkegrenzen in kn bzw. m (Bft wird beim Seeding konvertiert, nie
> gespeichert)*. Zusatzregel: Schemas in `domain/schema/` werden von genau
> **einer** Story angelegt (Schema-First-Story vor Seeding und Engine);
> danach sind Änderungen breaking und brauchen ein gemeinsames Review.

---

## H2 — Polar-Offset: zwei legitime Anwender, doppelt oder gar nicht `[KRITISCH]`

**Paar:** Story „Firestore-/Config-Adapter" (liefert `config/polar` +
`parameters` in den Snapshot) vs. Story „Engine `domain/polar.ts`" (FR26).

**Beide AD-treu:** AD-3 sagt, der Snapshot enthält „Polare **+ Offset**" —
grammatisch doppeldeutig: (a) „Polare, bereits um Offset erhöht" oder
(b) „Polare und, als getrenntes Feld, der Offset". AD-8 legt den Offset als
Tuning-Parameter ins `config`-Dokument, sagt aber nicht, wer ihn konsumiert.

**Kollision:**

- Adapter-Story liest (a): addiert beim Laden 0,5 kn auf jede Polar-Zelle
  („Adapter kennen domain-Typen", AD-2 verbietet Adaptern nur Domänen-
  **Bewertungen**, eine Additionsvorverarbeitung liest sich als Mapping).
  Engine-Story liest (b): `boatSpeed(twa, tws, polar, offsetKn)` addiert
  erneut → **+1,0 kn auf jede Etappe**, jede Dauer ~15 % zu kurz, das
  6-h-Budget (FR16) und der PPR (FR19) sind systematisch optimistisch —
  genau der Fehler, den die App verhindern soll, und im Feld unsichtbar.
- Spiegelbild: beide lesen die jeweils andere Variante → Offset wird nie
  angewendet, Fallback-Speeds (FR26) und Polare divergieren still.

**Loch:** AD-3/AD-8 benennen den Offset, verankern aber keinen einzigen
Anwendungsort.

**Vorschlag — neue AD „Single Application Point für Tuning-Parameter":**
> Alle in `config` gespeicherten Tuning-Parameter (Polar-Offset, Schwellen,
> Zeitfenster) werden **roh und unverändert** in den `PlanningSnapshot`
> gereicht (`snapshot.polar` = kuratierte Polare wie gespeichert,
> `snapshot.params.polarOffsetKn` = Rohwert). **Einziger Anwendungsort ist
> der Core:** Offset ausschließlich in `domain/polar.ts` innerhalb der
> Geschwindigkeitsfunktion. Adapter transformieren Werte nie fachlich
> (Format-Mapping ja, Arithmetik nein) — als explizite Ergänzung zu AD-2.

---

## H3 — Zeitsemantik: Übernachtungsfenster vs. Etappenfenster, lokal vs. UTC `[KRITISCH]`

**Paar:** Story „Platz-Ampel `domain/ampel.ts`" (FR8: Fenster 18:00–09:00
**Ortszeit**) vs. Story „Etappen-Scoring `domain/scoring.ts`" (FR15: Abfahrt
09:00 **Ortszeit**, Bewertung im künftigen Zeitfenster) — plus als dritter
Angreifer die „Karten-UI" (FR1: Marker „in ihrer aktuellen Ampelfarbe").

**Beide AD-treu:** AD-6 sagt „UTC speichern, Europe/Athens anzeigen" — das
regelt Persistenz und Anzeige, aber **nicht die Rechenebene**: Der Snapshot
trägt Forecast „je Ort × Stunde" (AD-3) — in UTC-Stunden? Athens-Stunden?
AD-2 verbietet dem Core die Uhr, also muss jemand Fensterindizes liefern —
wer konvertiert?

**Kollision:**

1. Ampel-Story rechnet das Nachtfenster in UTC-Indizes des Snapshots
   (18–09 UTC = 21:00–12:00 Ortszeit, **3 h verschoben** — der Meltemi flaut
   nachts oft ab, die Verschiebung macht Ampeln systematisch zu grün oder zu
   rot); Scoring-Story konvertiert korrekt nach Athens. Beide „speichern UTC,
   zeigen Athens an" — AD-6 buchstabengetreu erfüllt.
2. **Welche Nacht?** Die Karten-UI färbt Marker mit der Ampel für „die
   kommende Nacht" (heute 18:00). Die Tagesansicht (FR21) zeigt für das
   Tagesziel Sifnos die Ziel-Ampel — meint aber die Nacht **nach Ankunft**
   (Tag N → Nacht N). Für Etappen an Tag N+2 (Optionsraum) braucht die
   Options-Story die Ampel der Nacht N+2. Ohne Nacht-Parameter im Vertrag
   liefern zwei Views für denselben Platz verschiedene Farben — der Nutzer
   sieht auf Karte grün, in der Tagesansicht rot, beide „richtig".
3. Fenstergrenzen: 09:00 inklusiv oder exklusiv? Überlappt das Nachtfenster
   (bis 09:00) das Etappenfenster (ab 09:00)?

**Loch:** AD-6 regelt Speicherung/Anzeige, nicht Berechnungszeitbasis und
Fensterdefinition; AD-3 kennt keine Nacht-/Fenster-Parameter.

**Vorschlag — neue AD „Zeitfenster sind Domänenobjekte":**
> Alle fachlichen Zeitfenster werden in **Europe/Athens definiert** und von
> genau einer puren Funktion `domain/time.ts` in UTC-Stundenindizes des
> Snapshots übersetzt (Snapshot-Stundenachse ist normativ UTC).
> Normativ: `nightWindow(törntagN) = [Tag N 18:00, Tag N+1 09:00)` Athens;
> `legWindow(törntagN) = [Tag N departureTime, Ankunft)` Athens, Grenzen
> halb-offen. **Jede Platz-Ampel ist eine Funktion `(platz, nachtN,
> snapshot)`** — es gibt keine „aktuelle" Ampel ohne Nacht-Parameter; die
> Karten-UI zeigt per Definition `nachtN = heutiger Törntag`.

---

## H4 — Distanz-Bezugspunkt: Lavrion→Alimos-Rebasing hat keinen verankerten Ort

**Paar:** Story „Seeding-Pipeline: Routen-Import mit Normalisierung" (FR25)
vs. Story „PPR-Engine `domain/ppr.ts`" (FR19).

**Beide AD-treu:** FR25 verlangt Rebasing auf Alimos beim Import; FR19
rechnet „Restdistanz über die Rückfallhäfen-Kette". Der Spine sagt zu
Distanz-Provenienz nichts — AD-6 fixiert nur die Einheit (sm).

**Kollision:**

- Seeding-Story rebased **nur die erste Etappe** jeder Route (Alimos statt
  Lavrion als Start) und speichert Alimos-basierte Werte. PPR-Story weiß aus
  dem PRD („viele Seed-Distanzen sind Lavrion-basiert") und addiert
  defensiv eine Lavrion→Alimos-Korrekturkonstante auf die Restdistanz →
  **Doppelkorrektur ~20+ sm**, der Point of Return kippt einen Tag zu früh
  (konservativ, aber falsch — kostet real Amorgos/Santorin).
- Spiegelbild: Seeding lässt Rohwerte drin („die Engine normalisiert ja"),
  PPR vertraut der DB → PPR einen Tag zu spät = Rückgabe-Deadline-Risiko.
- Dazu: **Wo lebt die Rückfallhäfen-Kette?** FR9 nennt sie als Route; nichts
  zwingt sie in `routes`. Die PPR-Story kann sie als Konstante in
  `domain/ppr.ts` hartkodieren (AD-2-konform: pur!), die Seeding-Story
  kuratiert sie parallel in Firestore — **zwei Owner derselben Entität**,
  exakt das, was AD-5 verhindern will, nur eine Ebene über der DB.

**Vorschlag — neue Regel „Distanz-Provenienz + benannte Kettenroute":**
> In Firestore stehen ausschließlich **fertig normalisierte, Alimos-referen-
> zierte** Distanzen (Rebasing passiert nur in `seeding/`, vor der strikten
> Validierung; ein Schema-Feld `rebasedFrom?: 'lavrion'` dokumentiert die
> Herkunft). Der Core adjustiert Distanzen **nie**. Die Rückfallhäfen-Kette
> ist ein normatives Routen-Dokument mit fixer ID (`rueckfallkette-west`)
> in `routes`; `domain/ppr.ts` erhält sie über den Snapshot und enthält
> keine Orts- oder Distanzkonstanten.

---

## H5 — Forecast-Snapshot-Granularität: „je Ort × Stunde" — welche Orte, welcher Horizont? `[KRITISCH]`

**Paar:** Story „Forecast-Adapter `adapters/openMeteo.ts`" (F4) vs. Story
„Karten-UI" (FR1) — und als zweites Paar Adapter vs. „Options-Engine" (FR18).

**Beide AD-treu:** AD-3 sagt „vollständiger Forecast (je Ort × Stunde, über
den ganzen Resthorizont)". Weder „Ort" noch „Resthorizont" ist definiert.

**Kollision:**

- Adapter-Story liest NFR5 („ein Wind- und ein Wellen-Abruf **je Wegpunkt**")
  und fetcht nur die Wegpunkte der offenen Routen (~15 Orte). Karten-UI
  braucht Ampelfarben für **alle 100–150 Plätze** (FR1). AD-2 verbietet der
  UI eigene Berechnung, AD-7 verbietet ihr keine **eigene Query** — also
  baut die UI-Story eine zweite TanStack-Query je sichtbarem Platz
  (AD-7-konform!) und ruft die Engine pro Platz einzeln auf → zwei
  Fetch-Regimes, unterschiedliche Modellläufe auf derselben Karte —
  **exakt der Mischzustand, den AD-3 verhindern soll**, durch AD-7 legal
  wieder eingeschleppt. Nebenbei: „Ort"-Schlüssel divergiert
  (Platz-ID vs. gerundete Lat/Lon) → Cache-Misses, Limit-Druck.
- „Ganzer Resthorizont": Am Törntag 1 sind es 12 Resttage; Open-Meteo
  liefert ~16 Tage Wetter, aber die **Marine-API deutlich weniger** — der
  vollständige Snapshot ist früh im Törn **physisch unmöglich**. Die
  Options-Story muss entscheiden, was eine Etappe jenseits des Horizonts
  ist: Scoring-Story sagt „keine Daten = rot" (konservativ), Options-Story
  sagt „= offen" (sonst ist Santorin ab Tag 1 tot, absurd). Beide vertretbar,
  beide AD-3-konform → dieselbe Route ist gleichzeitig „geschlossen"
  (Aggregat der schwächsten Etappe, FR17) und „offen" (FR18).

**Vorschlag — AD-3 schärfen: Snapshot-Kontrakt mit Ortsmenge und Horizont-Zustand:**
> Die Snapshot-Ortsmenge ist normativ: **alle kuratierten Plätze** (Schlüssel
> = Platz-ID) **plus die Etappen-Mittelpunkte aller Routen der Bibliothek**
> (Schlüssel = Etappen-ID) — ein Abruf-Regime, eine Query-Familie; UI-Views
> lesen ausschließlich aus diesem einen Snapshot-Cache-Eintrag. Stunden
> jenseits des verfügbaren Modell-Horizonts sind im Snapshot als `null`
> präsent; der Core kennt dafür den vierten Bewertungszustand
> **`'unbewertet'`** (nie grün, nie rot): Etappen-Ampel `unbewertet`,
> Options-Zustand „offen (Horizont)" mit sichtbarem Vorbehalt. Damit ist
> auch die Ampel-Typkonvention zu erweitern: `'gruen' | 'gelb' | 'rot' |
> 'unbewertet'`.

---

## H6 — Törnkontext: zwei Mutationspfade für Position und „gewählte Option"

**Paar:** Story „Geolocation-Integration" (FR27) vs. Story „Tagesansicht /
Karten-Interaktion" (FR4, FR21).

**Beide AD-treu:** AD-7 sagt nur, der Törnkontext „lebt in einem
React-Context in `app/`" — nichts über Schreibrechte oder Präzedenz.

**Kollision:**

- Geolocation-Story schreibt die Position bei jedem Fix in den Context
  (watchPosition, „Teil des Produkts"). Tagesansicht-Story implementiert
  das manuelle Übersteuern (FR27: Platz aus Bibliothek wählen) — ebenfalls
  direkt in den Context. Ohne Präzedenzregel **überschreibt der nächste
  GPS-Fix die manuelle Wahl** Sekunden später; PPR und Optionsraum springen
  während der Crew-Besprechung hin und her. Beide Stories AD-7-konform.
- „Gewählte Optionen": Die Karten-Story interpretiert Hover/Auswahl (FR4)
  als Context-State („selektierte Route"), die Tagesansicht-Story
  interpretiert denselben Context-Slot als **committete Tagesentscheidung**
  → ein Hover auf der Karte ändert scheinbar den Mittelfristplan.

**Vorschlag — neue Regel „TripContext: ein Reducer, enumerierte Aktionen, Präzedenz":**
> Der Törnkontext wird ausschließlich über einen Reducer mit enumerierten
> Aktionen mutiert. Position trägt `source: 'gps' | 'manual'`; eine
> `manual`-Position wird von GPS-Updates **nie** überschrieben, bis der
> Nutzer sie explizit löst. Transiente View-Zustände (Hover, Karten-
> Highlight) sind lokaler UI-State und **dürfen nicht** im TripContext
> liegen; der Context hält nur entscheidungsrelevanten Zustand (Törntag,
> Position, verfolgte Routen-Option).

---

## H7 — „Bester Platz je Insel" ist ein Domänenwert ohne Domänen-Heimat

**Paar:** Story „Tagesansicht" (FR21: Ziel-Insel „je mit ihrem besten Platz")
vs. Story „Platz-Detail/Karte" (FR1/FR5).

**Beide AD-treu:** AD-2 sagt „UI berechnet nie Domänenwerte" — aber der
Structural Seed kennt kein Modul für die Platz-**Rangfolge** (nur `scoring`,
`ampel`, `options`, `ppr`, `polar`). Eine Sortierung „grün vor gelb, dann
Schönheit" kann jede UI-Story guten Gewissens als „bloße Anzeige-Sortierung"
deklarieren — Sortieren ist schließlich kein „Berechnen".

**Kollision:** Tagesansicht rankt `ampel desc, schoenheit desc`, Karten-
Story rankt `schoenheit desc, ampel desc` (Traumbucht zuerst) → dieselbe
Insel zeigt in zwei Views verschiedene „beste Plätze"; die Crew bespricht
auf der Karte einen anderen Platz, als die Tagesansicht empfiehlt.

**Vorschlag — AD-2 schärfen:**
> Auch **Auswahl, Rangfolge und Aggregation** über Domänenwerte sind
> Domänenlogik: `bestPlace(insel, nachtN, snapshot)` ist Teil des
> Assessments (AD-3-Output), nicht der UI. Faustregel in AD-2 ergänzen:
> *„Wenn zwei Views das Ergebnis anzeigen könnten, muss es aus dem Core
> kommen — Sortieren nach Fachkriterien ist Berechnen."*

---

## H8 — „Lee ist immer geschützt": Regel ohne Anwendungsort — Seeding oder Engine?

**Paar:** Story „Seeding-Pipeline: Schutzprofile" (FR7 nennt die Regel als
„Ergänzung" der kuratierten Sektoren) vs. Story „Ampel-Engine" (FR8).

**Beide AD-treu:** FR7 formuliert die universelle Regel „Lee ist immer
geschützt, Luv nie" als Teil des Schutzprofils — die Seeding-Story kann
versuchen, sie **in die gespeicherten Sektoren einzubacken** (Inselseite
geometrisch ableiten und Sektoren erweitern); die Engine-Story implementiert
sie **dynamisch zur Laufzeit** (Windrichtung vs. Platzlage). Bauen beide,
werden Sektoren doppelt großzügig (eingebackene + dynamische Lee-Gutschrift)
→ **zu grüne Ampeln, sicherheitsrelevant**; baut keiner (jeder hält den
anderen für zuständig), fehlt die Regel ganz und NFR6-konforme Plätze
werden grundlos rot.

**Vorschlag — Regel in AD-4/AD-6-Umfeld verankern:**
> Gespeicherte Schutzprofile enthalten **ausschließlich quellenbasierte,
> statische Sektoren** (NFR6); die Seeding-Pipeline leitet niemals Sektoren
> geometrisch ab. Die Lee/Luv-Regel ist eine **Laufzeitregel des Core**
> (`domain/ampel.ts`), parametrisiert über die kuratierte Exposition des
> Platzes — nicht über zur Seed-Zeit erweiterte Sektoren.

---

## Zusammenfassung der Löcher

| # | Loch | Paar | Schwere | Fix |
|---|---|---|---|---|
| H1 | Schutzprofil-Form nicht fixiert (Wrap, Bft/kn, Wind-vs-Welle) | Seeding ↔ Ampel-Engine | **Kritisch** | AD-4 schärfen: normative Shape + Schema-Freeze |
| H2 | Polar-Offset: Anwendungsort unbestimmt (doppelt/nie) | Config-Adapter ↔ Engine | **Kritisch** | Neue AD: Single Application Point im Core |
| H3 | Zeitfenster: UTC-vs-Athens auf Rechenebene, Nacht-Parameter fehlt | Ampel ↔ Scoring ↔ Karten-UI | **Kritisch** | Neue AD: Fenster als Domänenobjekte, Ampel(platz, nachtN) |
| H4 | Distanz-Rebasing ohne Ort; Rückfallkette mit zwei Ownern | Seeding ↔ PPR-Engine | Hoch | Regel: nur normalisierte Werte in DB; benannte Kettenroute |
| H5 | Snapshot: Ortsmenge + Horizont undefiniert; AD-7 unterläuft AD-3 | Forecast-Adapter ↔ Karten-UI/Options | **Kritisch** | AD-3 schärfen: normative Ortsmenge + Zustand `unbewertet` |
| H6 | TripContext: GPS vs. manuell, Hover vs. Entscheidung | Geolocation ↔ Tagesansicht/Karte | Hoch | Regel: Reducer, Präzedenz `manual`, kein View-State im Context |
| H7 | „Bester Platz" = Domänenwert ohne Modul | Tagesansicht ↔ Karte/Detail | Mittel | AD-2 schärfen: Rangfolge ist Domäne |
| H8 | Lee/Luv-Regel: Seed-Zeit vs. Laufzeit, doppelt oder nie | Seeding ↔ Ampel-Engine | Hoch | Regel: statische Sektoren only, Lee-Regel im Core |

**Querschnittsbefund:** Drei der acht Löcher (H1, H4, H8) haben dieselbe
Wurzel — die Grenze zwischen Seeding-Pipeline und Engine ist nur auf
DB-Schreibrecht-Ebene (AD-5) gezogen, nicht auf **Bedeutungs-Ebene**: Wer
normalisiert, wer leitet ab, wer wendet Regeln an. Eine übergreifende
Leitregel würde alle drei mit abdecken:
> **„Die Pipeline liefert Fakten, der Core liefert Urteile":** `seeding/`
> normalisiert Einheiten, Schreibweisen und Bezugspunkte, erfindet oder
> transformiert aber nie fachliche Bedeutung; jede Regel, die Forecast oder
> Geometrie interpretiert, lebt ausschließlich in `domain/`.
