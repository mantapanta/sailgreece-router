# Lauf 2 (West-/Zentralkykladen) — Prüfprotokoll und Restarbeit

Quelle: Gemini Deep Research, Lauf 2, geliefert am 2026-08-03.
Eingepflegt am 2026-08-03. Alle betroffenen Staging-Dateien stehen weiterhin auf
`approved: false`.

## Was eingepflegt wurde

| Deliverable | Status |
|---|---|
| A — Places | eingepflegt in `seeding/data/islands/` |
| B — berthingDetails | eingepflegt, Schema dafür neu: `src/domain/schema/berthing.ts` |
| C — Distanzen/Wegpunkte | **NICHT eingepflegt** — Nachrechnung fehlgeschlagen, siehe unten |
| D — Düsenzonen | **NICHT eingepflegt** — Kandidatenliste unten |
| E — Fähranbindung | eingepflegt als `island.guestPickup` (15 Inseln) |

Bestand vorher 19 Plätze auf 12 Inseln, jetzt 38 Plätze auf 22 Inseln. Neu:
antiparos, despotiko, milos, kimolos, polyaigos, folegandros, sikinos, ios, syros,
delos-rinia. Ergänzt: kea, kythnos, serifos, sifnos, paros.

## Einpflege-Regeln, die angewandt wurden

1. **Bestehende IDs gewinnen.** Der Bericht lieferte `kythnos-merikhas`; die
   Bibliothek und `routes.json` führen `kythnos-merichas`. ID unverändert
   beibehalten, sonst hätte der Import-Cross-Check die Etappen-Referenzen verloren.
2. **Bestehende Koordinaten gewinnen bei relevanter Abweichung.** Der Bericht setzte
   vier Punkte um mehr als 0,3 sm um; bei Serifos-Livadi (1,14 sm) und Piso Livadi
   (1,57 sm) lag der neue Punkt außerhalb der jeweiligen Bucht.
3. **Bei Sektor-Konflikt: Bestandsgeometrie behalten, Stärkegrenzen auf das
   Minimum beider Quellen senken**, Konflikt im `shelter.sourceNote` protokollieren.
4. **Bei quellinternem Widerspruch: Grenzen kappen.** Wo der Grad-Sektor der
   Öffnungsrichtung oder dem eigenen Meltemi-Urteil widersprach, wurde `maxKn`
   so weit gesenkt, dass der Platz bei Meltemi nicht als brauchbar gilt.
5. **Qualities nicht überschrieben.** Der Bericht wich bei sechs Plätzen ab;
   `schoenheit`/`restaurant`/`badestrand` sind kuratierte Urteile, für die eine
   Recherche keine höhere Autorität hat.
6. **`openTowards` nicht als Feld übernommen.** Es war das Kontrollfeld des
   Prompts; sein Inhalt steckt jetzt im jeweiligen `shelter.sourceNote`.

## Deliverable C — Distanzen: nachgerechnet, nicht übernommen

Großkreisdistanz aus den Koordinaten des Berichts selbst; sie ist die **untere
Schranke** jeder Seestrecke. Eine gemeldete Distanz unter diesem Wert ist
geometrisch unmöglich.

| von | nach | Bericht sm | Luftlinie sm | Faktor | Befund |
|---|---|---|---|---|---|
| athen-alimos | kea-vourkari | 38.5 | 32.4 | 1.19 | plausibel |
| kea-vourkari | kythnos-loutra | 21.8 | 14.6 | 1.50 | stark überhöht |
| kea-vourkari | kythnos-merichas | 24.5 | 16.8 | 1.46 | stark überhöht |
| kythnos-merichas | serifos-livadi | 27.2 | 17.2 | 1.58 | stark überhöht |
| serifos-livadi | sifnos-kamares | 13.4 | 10.8 | 1.24 | plausibel |
| sifnos-kamares | milos-adamas | 23.6 | 19.3 | 1.23 | plausibel |
| milos-adamas | kimolos-psathi | 13.5 | 7.2 | 1.87 | stark überhöht |
| kimolos-psathi | polyaigos-manolis | 8.2 | 1.8 | 4.44 | grob falsch |
| polyaigos-manolis | folegandros-karavostasi | 18.4 | 18.8 | 0.98 | **unmöglich** |
| folegandros-karavostasi | sikinos-alopronia | 11.5 | 10.0 | 1.15 | plausibel |
| sikinos-alopronia | ios-ormos | 13.8 | 6.9 | 2.01 | stark überhöht |
| ios-ormos | paros-parikia | 35.8 | 22.6 | 1.58 | stark überhöht |
| paros-parikia | syros-finikas | 22.4 | 22.4 | 1.00 | **unmöglich** |
| syros-finikas | kea-vourkari | 36.2 | 31.8 | 1.14 | plausibel |
| sifnos-vathy | paros-parikia | 26.5 | 24.2 | 1.10 | plausibel |
| paros-parikia | naxos-stadt | 11.2 | 10.8 | 1.04 | plausibel |
| paros-naoussa | delos-rinia-miskanti | 14.3 | 17.1 | 0.84 | **unmöglich** |

8 von 17 Werten sind stark überhöht, 3 sind unter der Luftlinie und damit
definitiv falsch. Distanzen gehen direkt in die Etappenzeit und damit in die
Ampelbewertung ein — die Tabelle ist als Ganzes nicht vertrauenswürdig und wurde
nicht in `routes.json` übernommen. Die Nachrechnung liegt in
`seeding/research/checkdist.py`.

**Nächster Schritt:** Distanzen für die gewünschten neuen Etappen aus einer
Kartenquelle selbst messen (OpenSeaMap/Navionics, Route um die Landspitzen legen),
nicht neu erfragen.

## Deliverable D — Düsenzonen: Kandidaten für `leg.windWarnings`

Übernahmefähig sobald die zugehörigen Etappen existieren. Die Verstärkungsfaktoren
sind ungeprüft; die Zonen selbst deckten sich mit den bereits in `routes.json`
gepflegten Warnungen.

| Zone | Lage | betroffene Etappen | Verstärkung laut Quelle | Richtung |
|---|---|---|---|---|
| Kea-Kanal (Lavrion–Makronisos) | 37.60–37.75 N / 24.10–24.30 E | athen ↔ kea | +8…+12 kn | NNE |
| Kafireas / Doro-Passage | 37.85–38.10 N / 24.45–24.70 E | nördliche Zufahrten aus Ost-Attika | +15…+20 kn | NE |
| Paros–Antiparos-Kanal | 36.98–37.06 N / 25.04–25.09 E | parikia ↔ antiparos | +5…+10 kn | N |
| Paros–Naxos-Kanal | 37.00–37.12 N / 25.20–25.32 E | paros ↔ naxos | +10…+15 kn | NNE |
| Tinos–Mykonos-Kanal | 37.48–37.56 N / 25.20–25.35 E | Etappen nördlich Delos/Rinia | +12…+18 kn | NNE |
| Kap Sounion | 37.63–37.67 N / 24.00–24.05 E | athen ↔ kea | +8…+10 kn | NNE/NE |
| Kap Kolonna (Kythnos NW) | 37.40–37.45 N / 24.33–24.38 E | kea ↔ kythnos | +6…+10 kn Fallwind | NNE |
| Sifnos-Kanal | 36.95–37.05 N / 24.55–24.68 E | serifos ↔ sifnos | +8…+12 kn | NE |

Die Quelle betitelt Zone 7 als „Zea / Kap Kolonna (Kythnos NW)". Zea ist eine
Marina in Piräus; die genannten Koordinaten liegen bei Kythnos. Titel entsprechend
bereinigt, Koordinaten unverändert.

## Offene Konflikte — vor `approved: true` zu klären

Nach Dringlichkeit:

1. **kythnos-loutra (schwer).** Der Bericht gibt Sektor 270–120 mit 35 kn und
   urteilt „Meltemi-sicher: ja", behauptet also Nordschutz für eine nach NE offene
   Bucht. Der Bestand nennt Schwell im Vorhafen bei starkem Meltemi. Wenn der
   Bericht recht hat, gewinnt die Route einen sicheren Nachtplatz; wenn nicht, ist
   es eine Falle. Gegen Heikell prüfen. Bis dahin `confidence: niedrig`, Grenzen
   auf den Bestand gekappt.
2. **antiparos-town.** Sektor behauptet Nordschutz, Urteil der gleichen Quelle
   lautet „Meltemi-sicher: nein", und der Hafen liegt im nach N offenen Kanal.
   `maxKn` auf 15 gekappt. Zusätzlich: Grössenlimit 15 m und Fahrwassertiefe
   1,8 m — vermutlich ohnehin kein Ziel für dieses Schiff.
3. **kythnos-fikiada.** Öffnungsrichtung im Bericht in sich widersprüchlich (N im
   Shelter-Block, NW im Warnhinweis). Fikiada liegt als Südbucht der Kolona-Nehrung,
   was eine Öffnung nach S/SW nahelegt — das würde den Sektor umkehren. `maxKn`
   auf 16 gekappt.
4. **paros-naoussa.** Bericht liefert den nahezu invertierten Sektor gegenüber dem
   Bestand und begründet ihn mit dem geschützten Innenbecken hinter der Mole,
   urteilt für die Ansteuerung aber „bedingt". Bestandsgeometrie beibehalten, weil
   sie die Ansteuerung bewertet. Sauber wären zwei getrennte Plätze: Bucht und
   Innenbecken.
5. **kea-vourkari / kea-korissia / serifos-livadi / sifnos-faros.** Öffnungsrichtung
   oder Sektorweite weichen ab, ohne dass eine Quelle klar überlegen ist. Grenzen
   auf das Minimum gesenkt, Konflikt in den jeweiligen `sourceNote` notiert.
6. **Heikell-Seitenzahlen.** Der Bericht zitiert durchgehend die 14. Auflage mit
   Seitenzahlen, die exakt der Reihenfolge seines eigenen Berichts folgen
   (Syros 216/218, Kea 225/226, Kythnos 231/233, Serifos 238, Sifnos 241–244,
   Delos 248, Paros 250–255, Antiparos 256/258, Milos 262–266, Ios 270/272). Das
   ist ein typisches Halluzinationsmuster. Alle Seitenangaben sind in den Daten als
   „Seitenangabe unverifiziert" markiert. Beim Gegenlesen zuerst prüfen, ob die
   Seiten überhaupt zum Inhalt passen.
7. **delos-rinia-miskanti.** Buchtbezeichnung „Ormos Miskanti" ließ sich nicht
   gegen eine zweite Quelle bestätigen. Position bei der Ansteuerung gegen die
   Seekarte prüfen.
8. **sikinos-alopronia.** Zufahrtstiefe 2,0–2,8 m bei 2,0 m Tiefgang, Grössenlimit
   14 m, Haltegrund Fels/Kies. Vor der Freigabe entscheiden, ob der Platz überhaupt
   in die Bibliothek gehört — als Ziel ist er für dieses Schiff kaum brauchbar.
9. **syros-grammata.** Haltegrund nur im Ostteil (Americanou) verlässlich, Westteil
   verkrautet. Als ein Platz geführt; ggf. auf den Ostteil einengen.

## Nebenwirkung auf FR31 (Gästewechsel) — beachten

Vor Lauf 2 trug KEINE der von den Routen erreichbaren Inseln ein `guestPickup`-Feld;
`validatePlan` behandelte die Pickup-Regel deshalb als noch nicht kuratiert und
setzte nur `horizonDependent`. Mit Lauf 2 tragen kea, kythnos, serifos, sifnos und
paros das Feld — **die Regel bindet ab jetzt scharf**, und ein fehlendes Feld gilt
gemäß AD-4 als „nicht erreichbar".

Deshalb wurde `athen` mit `ferryReachable: true` nachgetragen: Alimos liegt im
Stadtgebiet, sonst hätte die Basis selbst als nicht erreichbar gegolten.

Noch ohne Feld und damit als Pickup-Ziel ausgeschlossen, bis Lauf 1 und 3 vorliegen:
**aegina, poros, hydra, naxos, amorgos, santorin.** Das ist die konservative Seite
des Fehlers, verengt aber den Suchraum. Wenn der Gästewechsel auf einer dieser
Inseln geplant ist, muss das Feld vorher gefüllt werden.

## Größenlimits, die dieses Schiff betreffen

Bei 12–15 m Länge sind laut Lauf 2 knapp oder ausgeschlossen:
sikinos-alopronia (14 m), antiparos-town (15 m), milos-pollonia (15 m),
paros-piso-livadi (16 m), folegandros-karavostasi (18 m), kimolos-psathi (18 m).
`maxLoaM` und `depthAtBerthM.min` liegen als Zahlen im Schema, damit der Solver
sie später als hartes Ausschlusskriterium prüfen kann — er tut es noch nicht.
