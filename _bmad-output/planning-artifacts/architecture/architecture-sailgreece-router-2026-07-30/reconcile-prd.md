---
title: 'Quellen-Abgleich: PRD → Architecture Spine'
project: sailgreece-router
created: 2026-07-30
inputs:
  - _bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/prd.md (final, FR1–FR27 inkl. gestrichener FR14, NFR0–NFR6)
  - _bmad-output/planning-artifacts/architecture/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md (draft, AD-1–AD-8)
verdict: 'Spine trägt — 4 Lücken (1 sicherheitsrelevant, 3 leise Anforderungen), Rest gedeckt oder sauber deferred'
---

# Quellen-Abgleich: PRD (final) → Architecture Spine

**Frage:** Ist jede FR-Gruppe (F1–F8) und jede NFR durch ADs/Konventionen/Seed
**gedeckt**, **bewusst deferred** oder **fehlt** sie? Besonderes Augenmerk auf leise
Anforderungen, die die AD-Struktur verlieren könnte.

Legende: ✅ gedeckt · 🔷 bewusst deferred (Spine deklariert es) · 🟡 teilgedeckt /
leise Anforderung ohne Heimat · 🔴 fehlt (und ist nicht deferred)

---

## 1. Abgleich je FR-Gruppe

### F1 — Karte & Besprechungsbild (FR1–FR5) — ✅ / 🔷

| FR | Befund |
| --- | --- |
| FR1 Karte, Marker in Ampelfarbe, Satellit/Hybrid | ✅ Capability-Map F1 → `ui/` + Maps-Adapter; Stack `@vis.gl/react-google-maps` (AdvancedMarker + Polyline explizit genannt). Ampel-Typ als gemeinsamer Domain-Typ (Konvention). |
| FR2 2–3 Routen-Linien gleichzeitig | ✅ ui/ + Polyline; konkrete Umsetzung 🔷 Deferred „UI-Komponentenstruktur" — legitim. |
| FR3 Windpfeil-Overlay | ✅ Forecast via `adapters/openMeteo.ts` (AD-7), Darstellung ui/ — Umsetzungsdetail, kein Spine-Thema. |
| FR4 Itinerar ↔ Karte synchron | 🔷 Deferred „UI-Komponentenstruktur & Y.CO-Umsetzung (Sticky-Split, bidirektional)" — explizit deklariert, Pattern-Extrakt im Addendum. Unkritisch. |
| FR5 Platz-Detailansicht | ✅ Structural Seed nennt „Platz-Detail" als View; `photoUrl` im Schema (Deferred Foto-Hosting deklariert). |

### F2 — Platzbibliothek (FR6–FR8) — ✅

| FR | Befund |
| --- | --- |
| FR6 Bibliothek je Insel, Qualitäten, Foto | ✅ AD-4 (Zod-Schema einzige Quelle), AD-5 (`islands`, `places` mit `islandId`), ER-Diagramm. Foto-Hosting 🔷 sauber deferred mit Schema-Platzhalter. |
| FR7 Schutzprofil quellenbasiert | ✅ SHELTER_PROFILE im ER-Modell; AD-6 fixiert die gefährlichste Fehlerquelle (Sektor-Semantik „kommend aus") — starke Abdeckung genau der richtigen Stelle. |
| FR8 Deterministische Platz-Ampel übers Nachtfenster | ✅ `domain/ampel.ts` (AD-2 deterministisch); Übernachtungszeitfenster als Tuning-Parameter im `config`-Dokument (AD-8: „Zeitfenster"). |

### F3 — Routenbibliothek (FR9–FR10) — 🟡

| FR | Befund |
| --- | --- |
| FR9 Kuratierte Routen als Möglichkeitsraum | ✅ AD-4/AD-5 (`routes`), ER ROUTE‖LEG, IDs (`sued-route-naxos`). **Aber:** 🟡 Die **Eskalationsstufen-Ordnung** der Varianten („verschärft sich der Forecast, bietet die App die nächstkonservativere Stufe an") ist eine Datenmodell-Relation zwischen Routen-Optionen — weder im ER-Diagramm noch in AD-4/Schema-Aufzählung sichtbar. Leise Anforderung: ohne ein Ordnungs-/Verweisfeld im Routen-Schema kann `options.ts` die „natürliche Alternative" nicht anbieten. Gehört als Feld/Relation ins Schema (AD-4), nicht in den deferred Suchalgorithmus. |
| FR10 Statische Warn-Attribute an Etappen (Düsenzonen) | 🟡 „Etappe" ist in der AD-4-Schemaliste, das Warn-Attribut selbst aber nirgends erwähnt. Feld-Detail — vertretbar, sollte aber in der Schema-Definition nicht verloren gehen (gleiches gilt für das Vlychada-Warn-Attribut am Platz, PRD §9). Kein eigener AD nötig. |

### F4 — Forecast-Integration (FR11–FR13) — ✅ / 🟡

| FR | Befund |
| --- | --- |
| FR11 Ein Basis-Modell, **Modellwahl als Konfigurationsparameter** | 🟡 Ein Modell: ✅ (Architektur-Diagramm, kein Multi-Modell). Aber die **Modellwahl als Config-Parameter** taucht in AD-8s Parameterliste („Polar-Offset, Schwellen, Zeitfenster") nicht auf. Leise Anforderung: Gefahr, dass das Modell (ECMWF) im Adapter hartkodiert wird. Lösung trivial: Modell-ID ins `config`-Dokument aufnehmen. |
| FR12 Marine-API | ✅ Architektur-Diagramm „Forecast + Marine, keyless". |
| FR13 Caching + **Datenstand sichtbar** | ✅ **Dreifach verankert** — AD-3 (jedes Assessment trägt Modelllauf- + Abrufzeitstempel), AD-7 (staleTime ≈ 1 h = TTL), Logging-Konvention („jede Assessment-Anzeige trägt Modelllauf + Abrufzeit"). Die geprüfte leise Anforderung ist hier vorbildlich gedeckt. |
| FR14 gestrichen | ✅ n/a, ID reserviert. |

### F5 — Etappen-Scoring (FR15–FR17, FR26) — ✅ / 🟡

| FR | Befund |
| --- | --- |
| FR15 Bewertung im künftigen Zeitfenster, Polare, Motor-Parameter | ✅ AD-3 letzter Satz fixiert exakt das „Vorspulen" (nie heutiger Wind); `scoring.ts`/`polar.ts`; Abfahrtszeit als Config-Zeitfenster (AD-8). |
| FR16 Familien-Schwellen — **config vs. hartkodiert** | ✅ im Kern: AD-8 legt „Schwellen" explizit ins Firestore-`config`-Dokument („Feldkorrektur ohne Redeploy") — die geprüfte Frage ist zugunsten config beantwortet. 🟡 Randnotiz: Die Regel „Nachtetappen **maximal ~2× pro Törn**" ist eine törnweite Zählgröße, kein Etappen-Schwellwert — sie braucht Törn-Zustand (bisher gefahrene Nachtetappen) im PlanningSnapshot (AD-3). Nirgends erwähnt, auch nicht deferred; sollte beim Snapshot-Schema mitgedacht werden. |
| FR17 Ampel je Etappe, Aggregat = schwächste Etappe | ✅ `domain/` deterministisch (AD-2); Gelb-Band-Reserve 🔷 sauber deferred → Config-Parameter (AD-8). Konvention „Rot ist ein Ergebnis, kein Error" trifft den Geist. |
| FR26 Polare + 0,5-kn-Offset konfigurierbar; **Fallback-Pauschalgeschwindigkeiten** | ✅ `config`-Dokumente `polar` + `parameters` (AD-5), Offset in AD-8, `polar.ts`. 🟡 Der Fallback (6,0/7,5/6,5 kn solange keine Polare geladen) ist nicht erwähnt — kleines Verhaltensdetail von `polar.ts`, kein Spine-Bruch. |

### F6 — Optionsraum & Point of Return (FR18–FR20, FR27) — ✅ / 🔷

| FR | Befund |
| --- | --- |
| FR18 offen / schließt am Tag X / geschlossen; volle Neuberechnung je Lauf | ✅ AD-3 ist im Kern die Architektur-Übersetzung von FR18 (Snapshot rein, vollständige Neuberechnung, „gestern offen, heute geschlossen" nachvollziehbar). Restplan-Suchalgorithmus 🔷 deferred — ungefährlich, weil der Engine-Vertrag (Ein-/Ausgabe) fixiert bleibt. |
| FR19 Predicted Point of Return | ✅ `ppr.ts`; Rückgabe-Deadline als Snapshot-Bestandteil (AD-3). Der offene PRD-Punkt „Rückkehrzeit vertraglich bestätigen" landet damit korrekt als injizierter Parameter, nicht als Code-Konstante. |
| FR20 Entscheidungspunkte dynamisch | ✅ im Paradigma-Absatz explizit als Domain-Verantwortung genannt („…, Entscheidungspunkte"); 🟡 im Structural Seed und der Capability-Map ohne eigenes Modul/Erwähnung — vermutlich `options.ts`, tolerierbar, aber beim Zerlegen nicht vergessen. |
| FR27 GPS-Position + manuelles Übersteuern | ✅ `adapters/geolocation.ts`, Capability-Map F6. Manuelles Übersteuern = UI-Fallback, von der Deferred-UI-Position abgedeckt; Position als injizierter Parameter (AD-2) hält den Core davon frei. |

### F7 — Tagesentscheidung (FR21–FR22) — 🟡

| FR | Befund |
| --- | --- |
| FR21 Morgen-/Abendansicht, Optionen nebeneinander | ✅ ui/ Tagesansicht; AD-2 stellt sicher, dass die Ansicht nur Core-Ergebnisse zeigt. Layout 🔷 deferred. |
| FR22 **Keine Automatik-Empfehlung, nichts ausblenden** | 🔴 **Nirgends im Spine.** Die Capability-Map listet FR22 zwar, aber „governed by AD-2" deckt nur „UI rechnet nie selbst" — nicht das Produkt-Invariant „die App empfiehlt nicht und filtert nicht". Das ist genau die leise Anforderung, die die AD-Struktur verliert: Nichts hindert `assessPlanning` daran, eine `recommendedOption` zu liefern, oder die UI daran, rote Optionen auszublenden/zu sortieren-und-kappen. Gehört als Satz in den Engine-Vertrag (AD-3: „Das Assessment bewertet und vergleicht, es empfiehlt nicht und unterdrückt keine Option") oder als Consistency Convention. |

### F8 — Seeding & Kuration (FR23–FR25) — 🟡 / 🔴

| FR | Befund |
| --- | --- |
| FR23 KI-Recherche befüllt Bibliotheken; Lizenzgrenzen | ✅ `seeding/` (Staging-JSON je Insel + Import-Skripte, firebase-admin, einziger Schreiber AD-5). 🟡 Lizenzgrenzen (Heikell nur Fakten, CruisersWiki **mit CC-Attribution**) sind Kurations-/UI-Pflichten ohne Spine-Erwähnung — siehe NFR5 (Attribution gebündelt als eine Lücke). |
| FR24 **Eine Review-Runde** (Abstimmungssicht, Schutzprofile zuerst, Philipp bestätigt vor Import) | 🔴 **Nicht gedeckt und nicht deferred.** AD-4 validiert strikt gegen das Schema — das ist maschinelle Validierung, kein menschliches Review. Der Spine kennt nur „Staging-JSON + Import-Skripte"; das verpflichtende Human-Gate davor (PRD: sicherheitsrelevant, E3, Gegen-Metrik „keine ungeprüften Schutzprofile") hat keine Heimat. Risiko real: Unter Termindruck (9 Tage) ist „Skript direkt durchlaufen lassen" der Weg des geringsten Widerstands. Minimal-Fix: ein Satz in AD-4 oder am Seed („Import-Skripte importieren nur Staging-Dateien mit Review-Freigabe-Marker; Schutzprofile zuerst zur Review"). |
| FR25 Schema-Validierung + **Normalisierung** (Ortsschreibweisen, **Alimos-Rebasing** der Distanzen) | 🟡 Validierung ✅ (AD-4 „strikt vor jedem Import"). Die Normalisierung — insbesondere das Basis-Rebasing Lavrion→Alimos und die zu ergänzenden Rückweg-Distanzen — ist nicht erwähnt. Leise, sicherheitsnahe Anforderung (falsche Basis-Distanzen verfälschen PPR/FR19 systematisch). Gehört als Pflichtschritt der Seeding-Pipeline benannt. |

## 2. Abgleich je NFR

| NFR | Befund |
| --- | --- |
| NFR0 Reduce it to the max | ✅ AD-1 macht NFR0 sogar zur aktiven Prüfregel („jede Anforderung, die scheinbar einen Server braucht, wird gegen NFR0 geprüft"). |
| NFR1 Design-Anspruch (Y.CO) | ✅/🔷 Capability-Map verweist auf NFR1-Patterns (Addendum); Umsetzung sauber deferred in die UX-Phase. Legitim für einen Spine. |
| NFR2 Web-App PC + Handy, responsive | ✅ AD-8 bindet NFR2; Diagramm „Browser (PC + Handy)"; responsive Stapelung 🔷 im UI-Deferral. |
| NFR3 Abgrenzung Navigation + **sichtbarer Hinweis „ersetzt nicht das seemännische Urteil"** | 🔴 **Teil-Lücke.** „Keine Seekarte/Navigation" ist durch den Scope-Zuschnitt implizit gedeckt. Aber der **verpflichtende sichtbare Hinweis** — die geprüfte leise Anforderung — kommt im Spine nicht vor: kein AD, keine Konvention, kein Deferral, obwohl NFR3 in `binds` steht. Ein UI-Detail, aber ein normatives (Haftungs-/Sicherheitscharakter): gehört als Zeile in die Consistency Conventions (z. B. „Jede bewertende Ansicht trägt den statischen Hinweis …"), damit es nicht in der deferred UI-Struktur verdunstet. |
| NFR4 Firestore/GCP, Stack im Google-Universum | ✅ AD-5, AD-8, Stack-Tabelle; „voll funktionsfähig ohne manuelle Dateipflege" durch Firestore-Bibliotheken + Config-Dokument gedeckt. |
| NFR5 Verfügbarkeit & Transparenz | 🟡 Datenstand/Modelllauf sichtbar: ✅ (dreifach, s. FR13); Fehlerpfad: ✅ (Fehler-Konvention referenziert NFR5). **Aber:** die **CC-BY-4.0-Attribution von Open-Meteo in der App** ist eine Nutzungsbedingung und fehlt (zusammen mit der CruisersWiki-Attribution aus FR23). Eine Konventionszeile „Attributionen (Open-Meteo CC BY 4.0, CruisersWiki CC) statisch im Footer/Info" genügt. Der benannte DWD-/NOAA-Fallback ist im PRD „akzeptiertes Restrisiko" — kein Spine-Handlungsbedarf. |
| NFR6 Datenqualität, kein stiller Grün-Fallback | ✅ Wörtlich in AD-4: „Ein unkuratierter oder invalider Platz erhält keine grüne Ampel." Plus tolerantes Lesen mit Loggen statt Raten. Vorbildlich. |

## 3. Deferred-Prüfung (ist ein Deferral gefährlich?)

| Deferral | Bewertung |
| --- | --- |
| Restplan-Suchalgorithmus | ✅ ungefährlich — Engine-Vertrag (AD-3) fixiert Ein-/Ausgabe; nur das Wie ist offen. |
| Gelb-Band-Reserve | ✅ ungefährlich — deckungsgleich mit PRD-`[ANNAHME]` FR17, landet in config (AD-8). |
| UI-Struktur / Y.CO | ✅ ungefährlich für sich — **aber** zwei normative UI-Pflichten dürfen nicht darunter subsumiert werden: NFR3-Hinweis und FR22-Invariant (siehe Lücken). Deshalb dort separat verankern. |
| Foto-Hosting | ✅ ungefährlich — Schema-Platzhalter vorhanden. |
| CI/Deploy, Offline/PWA/Auth/Editier-UI | ✅ deckungsgleich mit PRD §7. |

## 4. Lückenliste (priorisiert)

| # | Schwere | Lücke | Minimal-Fix |
| --- | --- | --- | --- |
| L1 | Hoch (sicherheitsrelevant) | **FR24 Review-Runde fehlt:** Human-Freigabe-Gate vor dem Import (Schutzprofile zuerst) weder gedeckt noch deferred; AD-4-Schemavalidierung ersetzt kein Review. | Satz in AD-4/Seed: Import nur für Staging-Dateien mit Review-Freigabe; Abstimmungssicht als Seeding-Artefakt. |
| L2 | Hoch (normativ) | **FR22 nicht verankert:** „keine Automatik-Empfehlung, nichts ausblenden" hat keinen AD/keine Konvention — Assessment/UI könnten regelkonform empfehlen oder filtern. | Ein Satz im Engine-Vertrag (AD-3) oder als Convention. |
| L3 | Mittel (normativ) | **NFR3-Hinweis fehlt:** sichtbarer Disclaimer „ersetzt nicht das seemännische Urteil" nirgends verankert; droht im UI-Deferral zu verdunsten. | Convention-Zeile: statischer Hinweis auf jeder bewertenden Ansicht. |
| L4 | Mittel (Datenmodell) | **FR9 Eskalationsstufen-Ordnung** der Routen-Optionen fehlt in Schema/ER-Modell — ohne sie kann die App die „nächstkonservativere Stufe" nicht anbieten. | Ordnungs-/Verweisfeld im Routen-Schema (AD-4/ER). |
| L5 | Mittel (Korrektheit/Compliance) | **FR25-Normalisierung** (Alimos-Rebasing, Rückweg-Distanzen) und **Attributionen** (NFR5 Open-Meteo CC BY, FR23 CruisersWiki CC) unerwähnt. | Rebasing als Pflichtschritt der Seeding-Pipeline benennen; Attributions-Convention. |
| L6 | Niedrig | Kleinteile: FR11 Modellwahl nicht in der AD-8-Parameterliste; FR16 Nachtetappen-Zähler (~2×/Törn) braucht Törn-Zustand im Snapshot; FR26-Fallback-Geschwindigkeiten unerwähnt; FR10/Vlychada-Warn-Attribute als Schema-Felder sichern; FR20 ohne Modul-Heimat. | Beim Schema-/Config-Schnitt mit erledigen. |

## 5. Gesamturteil

Der Spine deckt das Rückgrat des PRDs stark: AD-3 ist die präzise Übersetzung des
schwierigsten Konzepts (FR15/FR18 Momentaufnahmen-Semantik), AD-6 fixiert den
gefährlichsten stillen Fehler (Sektor-Semantik), FR13/NFR6/NFR0 sind mehrfach und
wörtlich verankert, FR16-Schwellen liegen richtig als Config-Parameter (AD-8).
Die Lücken sind sämtlich leise Anforderungen ohne natürliche AD-Heimat — zwei davon
(L1 Review-Gate, L2 Empfehlungsverbot) sind Produkt-Invarianten mit Sicherheits- bzw.
Vertrauenscharakter und sollten vor dem Bauen mit je einem Satz in AD-3/AD-4 bzw. den
Conventions geschlossen werden. Kein deklariertes Deferral ist gefährlich, solange
NFR3-Hinweis und FR22 nicht stillschweigend unter das UI-Deferral fallen.
