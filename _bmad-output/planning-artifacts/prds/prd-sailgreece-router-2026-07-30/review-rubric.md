# PRD Quality Review — sailgreece-router

*Kalibrierung: Hobby-/Solo-PRD, einziger Nutzer = Entwickler = Product Owner, harter Termin (Törnstart 8. August, 9 Tage). Rigor-Erwartung entsprechend leicht; Substanz-Messlatte gilt trotzdem voll. Das PRD ist Chain-Top (Addendum liefert explizit Material für Architektur/UX), daher zählt Downstream-Verwendbarkeit mehr als bei einem Standalone-Dokument.*

## Overall verdict

Ein ungewöhnlich ehrliches und gut geformtes Solo-PRD: klare These („Das Heute muss auf einem sinnvollen Mittelfristplan liegen", §4), echte, als Entscheidungen ausgewiesene Entscheidungen (Google Maps *gegen* die Recherche-Empfehlung, mit benannten Kosten), Gegen-Metriken und ein Non-Goals-Abschnitt, der reale Arbeit leistet. Gefährdet ist die Done-ness des Kernalgorithmus: FR18/FR20 (Optionsraum, Entscheidungspunkte) — das eigentliche Alleinstellungsmerkmal — haben kein testbares Kriterium dafür, wann eine Option „offen", „schließt" oder „geschlossen" ist. Wer die Story dazu schreibt, muss den Algorithmus erfinden statt ihn umzusetzen — bei 9 Tagen Budget das größte Terminrisiko im Dokument.

## Decision-readiness — strong

Entscheidungen stehen als Entscheidungen da, nicht als „Considerations": Karten-Stack im Addendum („**Entscheidung: Google Maps JS API** — bewusst gegen die Recherche-Empfehlung") inklusive dessen, was es kostet (Billing-Setup, Symbol-Workaround für gestrichelte Linien). Die DB-Wahl ist ehrlich vertagt statt verschleiert (NFR4, §9), und das Addendum hält sogar fest, dass die überstimmte JSON-Empfehlung „als Risiko-Hinweis relevant" bleibt — das ist genau die Art von nicht-glattgebügeltem Trade-off, die das Rubric verlangt. Die Offenen Punkte (§9) sind wirklich offen; Vlychada/Santorin zeigt vorbildlich die Trennung „Entschieden — … Offen bleibt …".

### Findings
- **medium** Heikell-Beschaffung ohne Deadline (§9 „Heikell-Beschaffung") — Der *Greek Waters Pilot* ist „Primärquelle der Schutzprofile" (E3, FR7, FR23), das Seeding muss laut Meilensteinplan bis 7. August reviewt und importiert sein — aber die Kaufentscheidung hat kein Datum. Bei Lieferzeit eines £65-Buchs kippt eine späte Entscheidung E3 („nichts ist erfunden") oder den 7.-August-Meilenstein. *Fix:* Entscheidungsdatum (z. B. 31. Juli) an den offenen Punkt schreiben, plus Fallback benennen (CruisersWiki als Primärquelle, konservativere Ampeln).

## Substance over theater — strong

Kein Furniture-Verdacht. Kein Persona-Theater (ein Nutzer, namentlich, mit drei konkreten Nutzungsmomenten statt erfundener Journeys). Die NFRs sind produktspezifisch statt Boilerplate: NFR5 benennt „kein SLA — akzeptiertes Restrisiko" statt „hochverfügbar", NFR6 setzt eine konkrete, sicherheitsrelevante Regel („unkuratierte Plätze erscheinen nicht mit grüner Ampel"). Die Marktlücke (§1) ist mit spezifischen Comparables belegt (Navily „nur 72 h, kein Routing") statt behaupteter Novelty. Selbst der Design-Abschnitt NFR1, der bei einem Solo-Tool leicht zu Theater würde, ist als „persönlicher Qualitätsmaßstab des Nutzers" ehrlich begründet und mit einem übertragbaren Pattern-Extrakt im Addendum unterfüttert.

## Strategic coherence — strong

Das PRD hat eine These und sagt sie wörtlich: §4 „Das Heute muss auf einem sinnvollen Mittelfristplan liegen." Alle acht FR-Gruppen zahlen erkennbar darauf ein (Forecast → Scoring → Optionsraum/Point of Return → Tagesentscheidung); die Priorität bei Zeitnot (§8: „Etappen-Scoring und Point of Return vor Karten-Politur") folgt der These, nicht dem, was leicht ist. Gegen-Metriken sind vorhanden und substanziell („Die App trifft keine Entscheidungen"; „lieber weniger Plätze, aber jede Ampel quellenbasiert"). E1–E3 messen das, worauf die These wettet (tägliche reale Nutzung, Termintreue, Datenvertrauen) — für ein Hobby-PRD ist mehr Metrik-Apparat nicht nötig.

## Done-ness clarity — adequate

Geteiltes Bild. Stark, wo es zählt: FR8 verlangt explizit eine „**deterministische** Rot/Gelb/Grün-Ampel", FR16 verdrahtet harte, testbare Schwellen („kein Aufkreuzen gegenan bei >25 kn wahrem Wind; im Normalfall maximal 6 Stunden pro Tag"), FR19 skizziert die Rechenlogik des Point of Return konkret (Restdistanz vs. Resttage × Tagesbudget, Puffertag, ~103 sm ab Naxos). Aber ausgerechnet die F6-Gruppe — laut Comparables-Digest „die eigentliche Nische des MVP" — bleibt unter der Testbarkeitsschwelle: Was eine Routen-Option formal „offen" oder „geschlossen" macht, steht nirgends.

### Findings
- **high** Offen/geschlossen-Kriterium des Optionsraums undefiniert (FR18) — „leitet die App täglich ab, welche Routen-Optionen … noch offen sind — angezeigt als **offen / schließt am Tag X / geschlossen**". Welche Bedingung schließt eine Option? Point-of-Return-Verletzung? FR16-Schwellen an allen Resttagen gerissen? Forecast-Horizont überschritten? Ohne Definition ist FR18 nicht implementierbar-testbar, und FR20 erbt das Problem. *Fix:* Schließungsbedingung als Formel oder Regelsatz nachtragen (z. B. „geschlossen, wenn keine FR16-konforme Etappenfolge mehr existiert, die die Rückkehr per FR19 hält").
- **medium** Ableitungsregel der Entscheidungspunkte unklar (FR20) — „dynamisch berechnet, keine fest verdrahteten Kalender-Gates" sagt, was es *nicht* ist; das Beispiel „Doppel-Fenster für Hin- und Rückweg" bleibt Illustration ohne Erkennungsregel. Woran erkennt die App ein Doppel-Fenster? *Fix:* Ein durchgerechnetes Beispiel als Akzeptanzkriterium anhängen (Eingabe-Forecast → erwarteter Entscheidungspunkt-Tag).
- **medium** Zeitfenster unbestimmt (FR8 „Übernachtungszeitfenster", FR15 „geplantes Zeitfenster") — beide Scoring-Grundlagen hängen an Zeitfenstern, deren Stunden nirgends stehen (Nacht = 20–08 Uhr? Abfahrt = 09 Uhr?). Die Ampel ist nur so deterministisch wie ihr Eingabefenster. *Fix:* Default-Fenster festschreiben (eine Zeile je FR genügt).
- **medium** Gelb-Band der Etappen-Ampel undefiniert (FR16/FR17) — FR16 liefert die Rot-Grenzen, aber wo Grün endet und Gelb beginnt, ist offen (z. B. Aufkreuzen bei 18 kn?). Ohne Gelb-Definition ist FR17 nicht abnehmbar. *Fix:* Gelb-Schwellen analog FR16 benennen oder explizit an die Architektur-Phase delegieren.
- **low** Aggregation „schwächstes Glied sichtbar" (FR17) — vermutlich Minimum über die Etappen, aber nicht gesagt; ein Wort („Aggregat = schlechteste Etappen-Ampel") schließt die Lücke.

## Scope honesty — strong

§7 „Außerhalb des Scopes (bewusst)" leistet reale Arbeit: Es schließt genau die Dinge aus, die man sonst stillschweigend annehmen würde (Offline-Fähigkeit auf einem *Segeltörn*, Mobile, Editier-UI, freies Routen-Bauen) — und begründet teils den Weg zurück („Wind-Fetch-Heuristik … nur als späterer Fallback … vorgemerkt"). Vier `[ANNAHME]`-Tags markieren echte Inferenzen (E1 „aus dem Brief übernommen", FR6 Fotolizenz, FR14 Darstellungsform, §8 Priorisierung). Die Offene-Punkte-Dichte (4 in §9 + 4 Annahmen) ist für ein Solo-PRD mit 9-Tage-Deadline angemessen — nichts davon blockiert den Baustart, außer dem oben notierten Heikell-Timing. Kein Assumptions-Index am Ende — siehe Mechanical notes.

## Downstream usability — adequate

Das PRD ist Chain-Top und weiß es: Das Addendum bündelt Architektur-Input (DB-Abwägung, Polardiagramm-Datenmodell) und UX-Input (Pattern-Extrakt) sauber getrennt vom PRD-Kern — vorbildlich. FR-IDs FR1–FR27 sind lückenlos und eindeutig; die außerreihigen FR26/FR27 sind inline erklärt („ID nachgereicht — Nummerierung bleibt stabil"). Querverweise (FR15↔FR26, FR27↔FR1, NFR1↔addendum, `inputs/polar-fountaine-pajot-45.txt`) lösen alle auf — die Polar-Datei liegt tatsächlich im Workspace. Was fehlt, ist ein Glossar, und die Kernbegriffe driften bereits jetzt.

### Findings
- **medium** Kein Glossar, Kernbegriffe driften — „**Möglichkeitsraum**" (§4, FR9, FR18) vs. „**Optionsraum**" (F6-Überschrift, FR20) werden synonym verwendet, ohne dass das irgendwo gesagt wird; „Predicted Point of Return" (FR19) vs. „Point of Return" (UM-1, §8) vs. „Umkehrpunkt" (§1, FR19) ebenso. Für ein Chain-Top-PRD, aus dem Architektur und Stories extrahieren, ist das die eine fehlende Investition. *Fix:* Mini-Glossar (5–7 Begriffe: Platz, Etappe, Routen-Option, Möglichkeitsraum, Schutzprofil, Ampel, Point of Return) mit je einem Satz; Synonyme dort kanonisieren.
- **low** Polar-Transkript unverifiziert (Addendum „Polardiagramm") — „Transkript aus Phone-Screenshot rekonstruiert … ideal die Original-`.txt` direkt einchecken". Ehrlich geflaggt, aber die Datei ist Rechengrundlage *aller* Dauern (FR15, FR19); die Verifikation sollte als Vorbedingung des 3.–5.-August-Meilensteins gelten, nicht nur als „vor DB-Import nötig".

## Shape fit — strong

Die Form passt exakt: Capability-Spec mit drei „Nutzungsmomenten" (UM-1–3, alle mit Philipp als benanntem Protagonisten) statt aufgeblasener User-Journey-Apparatur — für ein Single-Operator-Tool genau richtig. Keine Persona-Galerie, keine Umsatz-Metriken, kein Compliance-Ballast. Die Meilensteintabelle (§8) ersetzt ein Release-Kapitel angemessen. Das Addendum verhindert, dass technische Tiefe (Polar-Interpolation, Karten-Stack-Abwägung) das PRD aufbläht. Weder über- noch unterformalisiert.

## Mechanical notes

- **Assumptions-Index fehlt:** Vier inline `[ANNAHME]`-Tags (E1, FR6, FR14, §8 „Priorität bei Zeitnot"), aber kein Index am Dokumentende — der Roundtrip ist damit nicht prüfbar. Bei vier Tags ist das eine Fünf-Minuten-Ergänzung.
- **Begriffsdrift** (Details oben unter Downstream): Möglichkeitsraum/Optionsraum, Point of Return/Umkehrpunkt; außerdem „Ziel-Ampel" (UM-1, FR21) vs. „Ampel je Platz" (FR8) — gemeint ist dasselbe.
- **ID-Kontinuität:** FR1–FR27 vollständig, keine Duplikate; FR26 (in F5) und FR27 (in F6) außerhalb der Lesereihenfolge, inline sauber begründet. E1–E3, UM-1–3, NFR1–NFR6, F1–F8 durchgängig.
- **Querverweise:** Alle geprüften Verweise lösen auf, inkl. `inputs/polar-fountaine-pajot-45.txt` (im Workspace vorhanden) und `addendum.md`. Der Verweis auf ein „Brief-Addendum" (Addendum, Seeding-Pipeline) zeigt auf ein Artefakt außerhalb dieses Workspaces — für die Startliste der ~25–35 Plätze sollte der Pfad benannt sein.
- **Pflichtabschnitte** für Stakes/Produkttyp vorhanden: Problem, Ziele+Gegen-Metriken, Nutzer, FRs, NFRs, Non-Goals, Meilensteine, Offene Punkte. Fehlend nur Glossar/Assumptions-Index (oben adressiert).
