# Deep-Research-Prompt für Häfen-, Bucht- und Liegeplatzdaten

Für Gemini Deep Research (oder vergleichbar). **In drei Läufen ausführen** — pro Lauf
einen der Scope-Blöcke aus Abschnitt „Scope-Varianten" unten in `{{SCOPE}}` einsetzen.
Ein einziger Lauf über alle Inseln liefert erfahrungsgemäß flache, unbelegte Daten.

> **Vor Lauf 1 und 3 lesen: „Korrekturen nach Lauf 2" am Ende dieser Datei.**
> Lauf 2 (Westkykladen) lieferte brauchbare Places und Liegeplatzdaten, aber
> unbrauchbare Distanzen und erfundene Seitenzahlen. Die dort beschriebenen
> Änderungen sind in den Prompt unten schon eingearbeitet.

---

## Der Prompt

```
# Rolle

Du bist Recherche-Assistent für einen nautischen Törnplaner. Du lieferst
verifizierte, quellenbelegte Hafen- und Ankerplatzdaten für eine Datenbank, die
automatisiert Segeletappen bewertet. Deine Ausgabe wird maschinell weiterverarbeitet
— Präzision und Quellenangabe sind wichtiger als Vollständigkeit oder schöne Prosa.

# Einsatzkontext (bestimmt, welche Daten relevant sind)

- Segelyacht, ca. 12–15 m Länge, Tiefgang ca. 2,0 m, Mastkopfhöhe ca. 20 m.
- Basis: Marina Alimos, Athen (37.9107 N, 23.7003 E). Törn 12 Tage, Rundtörn zurück
  nach Alimos.
- Reisezeit: August — also Meltemi-Saison (N bis NNE, teils 25–35 kn, Böen mehr in
  Beschleunigungszonen).
- Etappenlänge im Zielkorridor: 20–45 sm pro Tag, Tagesstart ca. 09:00, Ankunft vor
  Dunkelheit. Keine Nachtfahrten.
- Crew mit Nichtseglern an Bord: Schutz des Liegeplatzes und Schwell im Hafen sind
  Entscheidungskriterien erster Ordnung, nicht Komfortdetails.

# Aufgabe

Recherchiere für den unten definierten Scope alle für einen Yachtcharter relevanten
Häfen, Marinas und Ankerbuchten und liefere die fünf Deliverables A–E.

## Scope

{{SCOPE}}

# Deliverable A — Places (Häfen, Marinas, Buchten)

Pro Insel ein JSON-Objekt in exakt dieser Form. Pro Insel 3–8 Places: alle
brauchbaren Häfen plus die wichtigsten Ankerbuchten, inklusive der Buchten, die
als Schlechtwetter-Ausweichplatz taugen.

{
  "island": {
    "id": "sifnos",
    "name": "Sifnos",
    "coordinates": { "lat": 36.97, "lon": 24.70 },
    "description": "Ein atmosphärischer Satz auf Deutsch, max. 15 Wörter."
  },
  "places": [
    {
      "id": "sifnos-kamares",
      "islandId": "sifnos",
      "name": "Kamares",
      "type": "hafen",
      "coordinates": { "lat": 36.9903, "lon": 24.6603 },
      "qualities": { "schoenheit": 4, "restaurant": 4, "badestrand": 4 },
      "shelter": {
        "openTowards": "W bis WSW",
        "windSectors": [{ "fromDeg": 330, "toDeg": 230, "maxKn": 30 }],
        "waveSectors": [{ "fromDeg": 330, "toDeg": 230, "maxM": 1.0 }],
        "sourceNote": "Quelle + Auflage/Datum, z. B. 'Heikell, Greek Waters Pilot 14. Aufl., S. 412; CruisersWiki Sifnos (abgerufen 2026-08)'"
      },
      "description": "Ein atmosphärischer Satz auf Deutsch, max. 20 Wörter.",
      "warnings": ["Statische Warnhinweise, z. B. Längenbeschränkung, Fährverkehr, Downdraft"],
      "confidence": "hoch | mittel | niedrig",
      "sources": ["URL oder Buchzitat je Aussage"]
    }
  ]
}

## Feldregeln — genau einhalten

- `id`: kebab-case, immer inselpräfixiert (`sifnos-vathy`). Nur a–z, 0–9, Bindestrich.
  Umlaute/Akzente transliterieren (ä→ae, ó→o).
- `type`: genau einer von `hafen` (Gemeinde-/Fischerhafen, Kai), `marina`
  (Betreiber, Muringleinen, Landstrom), `bucht` (Ankern am eigenen Anker/Boje).
- `coordinates`: Dezimalgrad, WGS84, 4 Dezimalstellen, Nord/Ost positiv. Der Punkt
  muss auf Wasser liegen, dort wo man tatsächlich festmacht bzw. ankert — nicht das
  Dorfzentrum.
- `qualities`: Ganzzahlen. `schoenheit` 1–5 (1 = rein funktional, 5 = herausragend).
  `restaurant` 0–5 (0 = nichts zu Fuß erreichbar). `badestrand` 0–5 (0 = kein
  Badestrand in Gehweite). Begründe jede Bewertung in einem Halbsatz.

## Shelter-Sektoren — die kritischste Angabe, bitte sorgfältig

Semantik: Ein Sektor beschreibt die Richtungen, gegen die der Platz GESCHÜTZT ist,
also die Richtungen, AUS denen der Wind kommt. Gradangaben rechtweisend 0–360.
Der Sektor läuft von `fromDeg` IM UHRZEIGERSINN bis `toDeg`, Überlauf über
360→0 ist erlaubt, Grenzen inklusive.

- Beispiel: Eine Bucht, die nach Westen offen ist, ist geschützt gegen Wind aus
  N über O bis S — also `{ "fromDeg": 330, "toDeg": 230 }` (330 → 0 → 90 → 180 → 230).
- `fromDeg === toDeg` ist verboten. Rundumschutz wird ausschließlich als
  `fromDeg: 0, toDeg: 360` geschrieben.
- `maxKn`: Windstärke in Knoten, bis zu der der Schutz innerhalb des Sektors trägt.
  Beaufort in Knoten umrechnen (Bft 6 = 27 kn, Bft 7 = 33 kn, Bft 8 = 40 kn).
- `waveSectors` separat: Schwell läuft oft aus anderer Richtung ein als der Wind
  (Restschwell, um Landspitzen herumlaufende Dünung). `maxM` = signifikante
  Wellenhöhe in Metern, bis zu der der Liegeplatz brauchbar bleibt.
- Zusätzlich immer `openTowards` als Klartext ausfüllen (z. B. „offen nach S bis SE").
  Das ist die Kontrollangabe: sie muss zum Grad-Sektor passen, sonst ist ein
  Rechenfehler drin. Prüfe beides gegeneinander, bevor du ausgibst.
- Mehrere Sektoren pro Platz sind erlaubt und oft richtiger als einer — etwa wenn
  ein Kai gegen N bis 35 kn hält, gegen O aber nur bis 15 kn.

# Deliverable B — Liegeplatz-Details (berthingDetails)

Pro Place ein zusätzlicher Block. Das sind die Daten, die aktuell fehlen. Felder,
die du nicht belegen kannst, auf `null` setzen — nicht schätzen, nicht weglassen.

"berthingDetails": {
  "mooringType": "laengsseits | roemisch-katholisch (Heck/Bug zum Kai) | murings | boje | anker-frei",
  "depthAtBerthM": { "min": 2.5, "max": 6.0 },
  "anchorHoldingGround": "sand | sand-seegras | schlamm | fels | kies",
  "holdingQuality": "gut | mittel | schlecht — mit Begründung",
  "seagrassNote": "Seegrasfelder relevant für Haltekraft und Ankerverbot?",
  "capacityYachts": 25,
  "reservationPossible": true,
  "reservationChannel": "Telefon / E-Mail / App (Navily, DockSkipper) / keine — Kontaktdaten falls öffentlich",
  "shorePower": true,
  "water": true,
  "fuelDock": false,
  "provisioningAshore": "Supermarkt / Minimarkt / nichts, Gehdistanz in Minuten",
  "showersToilets": true,
  "wasteDisposal": null,
  "priceIndicationEur": "Preisangabe pro Nacht für 12–15 m, mit Jahr und Quelle; Hafengeld vs. Marina unterscheiden",
  "portAuthorityFees": "Gebührenpflicht Hafenbehörde / Liegegeld Gemeinde, falls bekannt",
  "maxLoaM": 20,
  "swellExposureNote": "Schwell-/Schwojverhalten: Fährwellen, Nachtschwell, Katabatik/Downdraft von Bergen",
  "ferryTrafficNote": "Fährfrequenz und ob Fähranleger den Liegeplatz unbrauchbar macht",
  "dinghyLanding": "Nur für Buchten: Anlandemöglichkeit, Taverne per Dinghy erreichbar?",
  "restrictions": "Ankerverbotszonen, Naturschutz (z. B. Natura 2000), Nachtbeschränkungen, Charterverbote",
  "vhfChannel": null,
  "confidence": "hoch | mittel | niedrig",
  "sources": ["..."]
}

# Deliverable C — Wegpunkte und Gefahrenstellen zwischen den Places

**Keine Distanzangaben.** Distanzen messen wir selbst aus der Karte; frei
geschätzte Seemeilen sind für uns schlimmer als keine, weil sie direkt in die
Etappenzeit und damit in die Sicherheitsbewertung eingehen.

Als Tabelle: jede sinnvolle Etappe innerhalb des Scope UND vom/zum bestehenden Netz
(insbesondere von/nach Marina Alimos, Kea-Vourkari, Kythnos-Merichas, Serifos-Livadi,
Sifnos-Kamares, Paros-Parikia, Naxos-Stadt).

| von (placeId) | nach (placeId) | Wegpunkte (lat/lon) | Gefahrenstellen | Route-Anmerkung |

- 0–4 Wegpunkte pro Etappe, nur wo die Route nicht gerade läuft (Kap-Rundungen,
  Kanalpassagen). Als Dezimalgrad, 3 Dezimalstellen, jeder Punkt auf Wasser.
- Gefahrenstellen konkret: Untiefen, Riffe, Sperrgebiete, Verkehrstrennung, mit
  Position und Quelle.
- Route-Anmerkung: an welcher Seite eines Kaps oder einer Insel man passiert und
  warum (Windschatten, Untiefe, Fährverkehr).
- Wenn eine Publikation eine Distanz nennt, die du erwähnen willst: nur mit Quelle
  UND deren Bezugspunkt (viele Etappenpläne rechnen ab Lavrion statt Alimos) und
  ausdrücklich als Zitat gekennzeichnet — nicht als eigene Messung.

# Deliverable D — Beschleunigungs- und Düsenzonen

Liste aller Zonen im Scope, in denen der reale Wind die Modellwerte deutlich
übersteigt (Kanaleffekte, Kap-Düsen, Fallwinde). Pro Zone:

| Zone | Lage (lat/lon-Bereich) | Betroffene Etappen | Verstärkung (Faktor oder +kn) | Vorherrschende Richtung | Quelle |

Erwartete Kandidaten mindestens prüfen: Kea-Kanal (Lavrion–Makronisos), Kafireas
(Doro-Passage, Andros–Euböa), Paros–Antiparos-Kanal, Paros–Naxos-Kanal, Tinos–Mykonos,
Kap Sounion, Zea/Kap Kolonna, Mirtoisches Meer bei Kap Maleas.

# Deliverable E — Fähranbindung (Gästewechsel)

Pro Insel: ist sie im August per Fähre ab Piräus/Rafina an einem Tag erreichbar
(Direktverbindung oder ein Umstieg, Ankunft am selben Tag)? Format:

| islandId | ferryReachable (true/false) | Verbindung/Frequenz | Quelle + Abrufdatum |

Bei Zweifel `false`. Eine fehlende Verbindung wird planerisch als „nicht erreichbar"
behandelt — optimistische Annahmen sind schädlicher als Lücken.

# Quellen- und Wahrheitsregeln (verbindlich)

1. **Belege pro Aussage.** Jede Zeile in `sources`: Publikation mit Auflage, oder URL
   mit Abrufdatum. Ohne Quelle keine Angabe. **Seitenzahlen nur, wenn du die Seite
   tatsächlich eingesehen hast** — eine Seitenzahl, die du nicht am Text verifizieren
   konntest, lässt du weg und schreibst stattdessen „Auflage ohne Seitenangabe". Eine
   Reihe plausibel aufsteigender Seitenzahlen, die genau der Reihenfolge deines
   Berichts folgt, ist für uns ein Erfindungssignal und entwertet die ganze Quelle.
2. **Priorität der Quellen:** (a) Rod Heikell, Greek Waters Pilot / Imray-Pilots;
   (b) griechische Hafenbehörden und Marina-Betreiber (offizielle Seiten);
   (c) CruisersWiki, Navily, NoForeignLand — als Crowd-Quelle gekennzeichnet;
   (d) Charter- und Flottillenberichte; (e) alles andere.
   Widersprüche zwischen (a) und (c) explizit ausweisen, nicht mitteln.
3. **Konservativ bei Konflikt.** Weichen Quellen ab, nimm den vorsichtigeren Wert
   (kleineres `maxKn`, kleineres `maxM`, geringere Tiefe) und dokumentiere die
   Spannweite im `sourceNote`.
4. **Keine Erfindung.** Lieber `null` und `confidence: "niedrig"` als eine plausibel
   klingende Zahl. Koordinaten niemals interpolieren oder aus dem Ortsnamen ableiten.
5. **Aktualität kennzeichnen.** Preise, Landstrom, Ausbauzustand und Reservierungswege
   ändern sich; nenne immer das Jahr der Quelle. Marina-Neubauten und geänderte
   Fähranleger explizit erwähnen, wenn Quellen unterschiedlich alt sind.
6. **Unsicherheitsregister am Ende:** eine Liste aller Angaben mit
   `confidence: "niedrig"` plus dem konkreten Schritt, mit dem wir sie verifizieren
   könnten (welche Seite, welches Buch, welcher Anruf).
7. **Selbstprüfung vor der Ausgabe — Pflicht.** Für JEDEN Place müssen drei Angaben
   zueinander passen: der Grad-Sektor, `openTowards` und dein Meltemi-Urteil. Ein
   Platz, der gegen Wind aus 0° geschützt ist, kann nicht „Meltemi-sicher: nein"
   sein, und eine nach Westen offene Bucht kann keinen Westschutz haben. Findest du
   einen Widerspruch, löse ihn auf, statt beide Werte stehen zu lassen — und wenn du
   ihn nicht auflösen kannst, setze `confidence: "niedrig"` und beschreibe den
   Widerspruch im `sourceNote`.
8. **Bestehende Bezeichner nicht neu erfinden.** Für Plätze, die im Scope-Block als
   „bereits vorhanden" genannt sind, übernimm die dort angegebene `id` und Koordinate
   unverändert. Abweichende Schreibweisen (Merikhas/Merichas) brechen unsere
   Referenzen; abweichende Koordinaten haben in Lauf 2 Punkte außerhalb der jeweiligen
   Bucht erzeugt. Wenn du eine bestehende Koordinate für falsch hältst, sag es
   separat mit Begründung, statt sie stillschweigend zu ersetzen.
9. **Fährerreichbarkeit heißt täglich.** `ferryReachable: true` nur bei einer
   Verbindung, die an JEDEM Tag der Saison besteht. „3–6 Mal pro Woche" ist `false`
   mit Begründung — der Gästewechsel hat ein festes Datum.

# Ausgabeformat

1. Kurzer Überblick: welche Inseln und Places abgedeckt, wie viele mit hoher Konfidenz.
2. Deliverable A als ein JSON-Block **pro Insel** (kein Sammel-Array), gültiges JSON,
   keine Kommentare im JSON.
3. Deliverable B in den jeweiligen Place-Objekten aus A eingebettet.
4. Deliverables C, D, E als Markdown-Tabellen.
5. Unsicherheitsregister.
6. Quellenverzeichnis.

Freitext-Felder (`description`) auf Deutsch, nüchtern und konkret, ohne Reise-
katalogsprache. Feldnamen, Enum-Werte und Struktur exakt wie oben — die Ausgabe wird
gegen ein Schema validiert und bricht bei abweichenden Schlüsseln.

Was NICHT gebraucht wird: Wettervorhersagen, Hotels, Sehenswürdigkeiten,
Restaurantnamen, Anreise per Flugzeug, allgemeine Inselgeschichte.
```

---

## Scope-Varianten

### Lauf 1 — Saronischer Golf und Argolis (Schwachwind-/Meltemi-Ausweichgebiet)

```
Bereits vorhanden — id und Koordinate UNVERÄNDERT übernehmen, nur ergänzen:
  athen-alimos    Marina Alimos    37.9103 / 23.7008
  aegina-stadt    Ägina-Stadt      37.7469 / 23.4264
  poros-stadt     Poros-Stadt      37.4997 / 23.4547
  hydra-hafen     Hydra-Hafen      37.3494 / 23.4661

Für diese vier Inseln fehlen weitere Plätze und alle Liegeplatzdaten.

Neu zu recherchierende Inseln und Küstenorte im Umkreis von 45 sm um Alimos:
Spetses, Dokos, Ermioni, Porto Cheli, Palaia Epidauros, Korfos, Methana, Angistri,
Perdika (Ägina), Vathy/Russian Bay (Poros), Kap Sounion (Sounion-Bucht), Lavrion,
Zea/Piräus als Alternativbasis, Salamina.

Zusätzlich: für Ägina, Poros und Hydra jeweils die Ankerbuchten, die bei N-Wind
über 25 kn brauchbar bleiben.
```

### Lauf 2 — Westliche und zentrale Kykladen (Hauptrevier)

```
Bestehende Inseln, für die Places und Liegeplatzdaten ERGÄNZT und VERIFIZIERT werden
sollen: Kea (Vourkari, Korissia), Kythnos (Kolona/Fikiada, Merichas, Loutra),
Serifos (nur Livadi), Sifnos (Kamares, Vathy, Faros), Paros (Parikia, Naoussa,
Piso Livadi).

Neu zu recherchierende Inseln: Antiparos, Milos, Kimolos, Polyaigos, Folegandros,
Sikinos, Ios, Despotiko, Syros, Delos/Rinia.

Schwerpunkt: die Rückfallhafen-Kette nach Westen — welche Häfen dieser Inseln halten
Meltemi aus N/NNE mit 30–35 kn aus und sind bei diesen Bedingungen anfahrbar?
Kennzeichne pro Place explizit: „meltemi-sicher ja/nein/bedingt" mit Begründung.
```

### Lauf 3 — Östliche Kykladen und Nordgrenze

```
Bereits vorhanden — id und Koordinate UNVERÄNDERT übernehmen, nur ergänzen:
  naxos-stadt         Naxos-Stadt (Marina)  37.1075 / 25.3736
  amorgos-katapola    Katapola              36.8306 / 25.8583
  santorin-vlychada   Vlychada              36.3353 / 25.4353

Für diese drei Inseln fehlen weitere Plätze und alle Liegeplatzdaten; bei Vlychada
außerdem die bekannten Größen- und Tiefenbeschränkungen belegen.

Neu zu recherchierende Inseln: Mykonos, Tinos, Andros, Iraklia, Schinoussa,
Koufonisia, Keros, Donousa, Anafi, Thirasia.

Schwerpunkt: Rückwegfähigkeit gegen den Meltemi. Für jede Insel: welche Häfen taugen
als Ausgangspunkt für einen Schlag nach Westen/Nordwesten, und welche Buchten halten
eine Yacht mehrere Tage sicher, wenn der Meltemi den Rückweg sperrt?
```

---

## Nach dem Research

- Ergebnisse landen in `seeding/data/islands/<id>.json` mit `"approved": false` und
  einem `sourceNote`, bis sie gegen Heikell gegengeprüft sind (AD-4/NFR6: nicht
  kuratierte Places passen den Import nicht).
- `berthingDetails` existiert im Schema (`src/domain/schema/berthing.ts`, seit Lauf 2).
- `openTowards` ist ein reines Prüffeld und wandert beim Einpflegen in den
  `shelter.sourceNote` — es wird kein eigenes Feld.
- Distanzen mit `seeding/research/checkdist.py` gegen die Luftlinie prüfen, bevor
  irgendetwas nach `routes.json` geht.

---

## Korrekturen nach Lauf 2

Lauf 2 (Westkykladen, 2026-08-03) lieferte 33 Plätze mit vollständigen
Liegeplatzdaten — inhaltlich der wertvollste Teil. Was schiefging und was daraus
im Prompt oben geändert wurde:

| Problem in Lauf 2 | Änderung im Prompt |
|---|---|
| 8 von 17 Distanzen stark überhöht, 3 unter der Luftlinie und damit unmöglich | Deliverable C fordert **keine Distanzen** mehr, nur Wegpunkte und Gefahrenstellen |
| Heikell-Seitenzahlen stiegen exakt in der Reihenfolge des Berichts — Erfindungsmuster | Regel 1: Seitenzahl nur bei tatsächlich eingesehener Seite |
| Sektor, `openTowards` und Meltemi-Urteil widersprachen sich bei 3 Plätzen | Regel 7: Selbstprüfung der drei Angaben ist Pflicht |
| `kythnos-merikhas` statt `kythnos-merichas`, vier Koordinaten um bis zu 1,6 sm verschoben | Regel 8 + bestehende ids/Koordinaten stehen jetzt im Scope-Block |
| „3–6 Verbindungen pro Woche" wurde als `ferryReachable: true` geliefert | Regel 9: nur tägliche Verbindungen zählen |

Das vollständige Prüfprotokoll zu Lauf 2 mit allen offenen Konflikten liegt in
`seeding/research/lauf-2-pruefprotokoll.md`.
