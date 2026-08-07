import { z } from 'zod';
import { CoordinatesSchema } from './common.ts';
import { ConfidenceSchema } from './berthing.ts';
import type { DataBasis } from './snapshot.ts';

/**
 * TOPOGRAFISCHE WINDKORREKTUR — Windschatten und Kanaldüsen als kuratierte
 * Daten (Skipper-Vergleich 2026-08-07: Poseidon/HCMR gegen ICON-EU).
 *
 * DAS PROBLEM. Geroutet wird mit ICON-EU (7 km, schema/models.ts). Poseidon,
 * das griechische Modell, rechnet 1/30° (~3,7 km) über echter Ägäis-Topografie
 * und zeigt zwei Dinge, die in ICON-EU schlicht nicht enthalten sind:
 *
 *   1. WINDSCHATTEN südlich jeder hohen Insel. Serifos ist 10 km breit und
 *      585 m hoch — bei 7 km Gitter anderthalb Zellen, und die Höhe wird beim
 *      Gitter-Mitteln zu einem flachen Buckel. Ein flacher Buckel wirft keinen
 *      Schatten. Ein Lee reicht 5–15 Hindernishöhen weit, bei 585 m also
 *      3–8 km: genau die Größenordnung, die unter das Gitter fällt.
 *   2. DÜSEN in den Kanälen (Kea-Kanal/Kafireas, Steno Kythnou, Paros–Naxos):
 *      lokal +30–50 %, in ICON-EU weggeglättet. Für sie trägt die Etappe
 *      bereits einen Warntext (`Leg.windWarnings`) — was fehlte, war die Zahl.
 *
 * WARUM DAS KURATIERBAR IST — der ganze Grund, warum diese Datei existiert:
 * Lee und Düse sind KEIN WETTER, sondern TOPOGRAFIE. Sie liegen bei gleicher
 * Windrichtung immer an derselben Stelle. Damit sind sie Ortskenntnis, und
 * Ortskenntnis ist in dieser App kuratiert, nicht gerechnet (AD-4) — genau wie
 * die Schutzsektoren eines Liegeplatzes, deren Sektor-Semantik (AD-6: "Wind
 * kommend aus", im Uhrzeigersinn, Wrap über Nord) hier übernommen wird.
 *
 * DIE ASYMMETRIE IST DIE ZENTRALE REGEL:
 *
 *              DÜSEN BEWERTEN. SCHATTEN BERATEN NUR.
 *
 * Eine Korrektur nach OBEN (`duese`, factor > 1) geht voll in die Bewertung
 * ein: liegt sie daneben, war die App zu vorsichtig — und zu vorsichtig ist der
 * Fehler, den ein Törnplaner machen darf.
 *
 * Eine Korrektur nach UNTEN (`lee`, factor < 1) geht in KEINE Ampel, keinen
 * Solver, kein Budget und keine Gültigkeit ein. Der Grund ist der eine Fehler,
 * den dieses Werkzeug nicht machen darf: steht der Schatten nicht dort, wo die
 * Kuration ihn behauptet, dann segelt die Crew bei 26 kn auf einer Etappe, die
 * die App grün genannt hat. Der Windschatten ist deshalb ein HINWEIS an der
 * Etappe (`LeeHinweis`, domain/windTopo.ts) — dieselbe Doktrin wie bei den
 * Kite-Spots und den Kurs-Abschnitten: anzeigen ja, bewerten nein.
 *
 * Die Asymmetrie steht nicht nur als Satz hier, sie ist SCHEMA: `kind: 'lee'`
 * verlangt factor < 1, `kind: 'duese'` verlangt factor > 1. Eine Lee-Zone, die
 * den Wind erhöht, ist damit kein Konfigurationsfehler, sondern unmöglich.
 *
 * WAS EIN LEE NICHT IST: gleichmäßig ruhig. Unter der Abfallkante einer
 * Steilküste stehen katabatische Fallböen — sie drehen und schlagen deutlich
 * über dem Gradientwind ein, und Poseidon zeigt dort trotzdem Blau, weil es den
 * MITTELWIND zeigt. Die Taktik "so dicht wie möglich unter Land aufkreuzen"
 * fährt genau dort hinein. `fallboeenNm` sagt, ab welchem Abstand von der
 * Küste das Lee nutzbar wird; der Hinweistext sagt es mit.
 *
 * WARUM ZONEN UND NICHT WEGPUNKTE: ein Lee ist ein ORT, kein Punkt. Eine Zone
 * gilt für jeden Forecast-Ort in ihrem Radius — Plätze und Etappen-Wegpunkte
 * gleichermaßen — und überlebt damit die Umnummerierung eines Wegpunktes, die
 * eine wegpunkt-gebundene Kuration stumm ins Leere laufen ließe.
 */

const norm = (d: number) => ((d % 360) + 360) % 360;

/**
 * Punkt-Sektoren würden in `sectorContains` still zum VOLLKREIS: ein Tippfehler
 * 350–350 hieße "wirkt aus jeder Richtung", und eine Düse stünde dann an jeder
 * Stunde des Törns. Dieselbe Sperre wie bei Schutz- und Kite-Sektoren.
 */
const noPointSector = (s: { fromDeg: number; toDeg: number }) =>
  norm(s.fromDeg) !== norm(s.toDeg);

/** Was die Zone tut — und damit, welche GESTALT sie hat (siehe unten). */
export const WindTopoKindSchema = z.enum(['lee', 'duese']);
export type WindTopoKind = z.infer<typeof WindTopoKindSchema>;

/** Felder, die beide Zonenarten tragen. */
const gemeinsam = {
  /**
   * Kebab-case mit Pflicht-Präfix `topo-`. Wie bei den Kite-Spots kein
   * Schmuck: `serifos-sued` könnte ebensogut ein Liegeplatz sein, und in
   * einem Hinweistext oder einem Firestore-Dokument wäre dann nicht zu sehen,
   * welche Bibliothek gemeint ist.
   */
  id: z.string().regex(/^topo-[a-z0-9-]+$/),
  name: z.string().min(1),
  /** Woher die Ortskenntnis stammt (Poseidon-Vergleich, Revierführer, Törn). */
  sourceNote: z.string().min(1),
  /**
   * WELCHE VERGLEICHE HINTER DEN ZAHLEN STEHEN — Pflichtfeld, weil ein Faktor
   * ohne seine Kalibrierung eine erfundene Zahl ist. Hier steht die Lage
   * (Datum, Uhrzeit, Windrichtung, Stärke), aus der er abgelesen wurde.
   */
  kalibriertAus: z.string().min(1),
  confidence: ConfidenceSchema,
};

/**
 * EIN WINDRICHTUNGS-SEKTOR MIT SEINEM FAKTOR — nur für Düsen.
 *
 * Eine Düse steht fest im Raum UND an einer Richtung: im Kea-Kanal beschleunigt
 * es nur, wenn der Wind längs des Kanals steht. Deshalb Sektoren.
 *
 * Lee-Zonen haben KEINE Sektoren mehr (bis 2026-08-07 hatten sie welche). Der
 * Grund steht bei `WindTopoLeeZoneSchema`: ein Schatten steht nicht in einer
 * Richtung, er steht HINTER der Insel und dreht mit dem Wind. Das ist Geometrie
 * und keine Sektorliste.
 */
export const WindTopoSectorSchema = z
  .object({
    fromDeg: z.number().min(0).max(360),
    toDeg: z.number().min(0).max(360),
    /** Multiplikator auf die Modell-Windgeschwindigkeit; für Düsen stets > 1. */
    factor: z.number().gt(1).max(2),
  })
  .refine(noPointSector, {
    message: 'Punkt-Sektor (fromDeg === toDeg) verboten — er würde zum Vollkreis',
  });
export type WindTopoSector = z.infer<typeof WindTopoSectorSchema>;

/**
 * DIE DÜSE: ein fester Kreis plus Richtungssektoren.
 *
 * Für eine Kanaldüse ist das die richtige Gestalt — der Kanal liegt, wo er
 * liegt, und er düst nur bei Wind längs seiner Achse.
 */
export const WindTopoDueseZoneSchema = z.object({
  ...gemeinsam,
  kind: z.literal('duese'),
  /** Mitte der Engstelle. */
  center: CoordinatesSchema,
  /**
   * Radius der Wirkfläche in sm. Gedeckelt, weil eine Düse mit 30 sm Radius
   * keine Engstelle mehr beschreibt, sondern das halbe Revier.
   */
  radiusNm: z.number().positive().max(12),
  sectors: z.array(WindTopoSectorSchema).min(1),
});
export type WindTopoDueseZone = z.infer<typeof WindTopoDueseZoneSchema>;

/**
 * DER WINDSCHATTEN: eine LEEWÄRTIGE KEULE hinter einem Hindernis — sie dreht
 * mit dem Wind.
 *
 * WARUM NICHT MEHR EIN KREIS MIT SEKTOREN (Stand bis 2026-08-07). Die
 * Poseidon-Bilder vom 10.08. zeigen es unmittelbar: bei Wind aus NNW liegt der
 * Schatten von Sikinos SSE der Insel, bei Wind aus NE liegt der Schatten von
 * Naxos SW davon. Ein fest im Süden platzierter Kreis trifft die erste Lage
 * halb und die zweite gar nicht — er würde die Absenkung dort ansetzen, wo gar
 * kein Schatten steht. Bei einer Zone, die BEWERTET, ist das kein Schönheits-
 * fehler, sondern genau der Fehlermodus, gegen den die Sicherungen gebaut sind.
 *
 * Ein Schatten ist keine Richtungseigenschaft eines Ortes, sondern eine
 * geometrische Folge: er liegt IMMER hinter dem Hindernis, und wo hinten ist,
 * sagt der Wind. Deshalb beschreibt eine Lee-Zone jetzt das HINDERNIS (Insel)
 * und wie weit sein Schatten reicht; wo er im Wasser liegt, rechnet
 * domain/windTopo.ts je Stunde aus.
 *
 * Das erledigt zwei alte Notbehelfe von selbst: die schwächeren NE-Sektoren
 * ("schräg angeströmt steht der Schatten schlechter") und die Frage, wie gross
 * man den Kreis macht, damit er beide Windlagen halbwegs trifft.
 */
export const WindTopoLeeZoneSchema = z.object({
  ...gemeinsam,
  kind: z.literal('lee'),
  /** Mittelpunkt der INSEL, die den Schatten wirft — nicht der Wirkfläche. */
  center: CoordinatesSchema,
  /**
   * Halbe Breite des Hindernisses quer zum Wind, in sm — sie bestimmt, wie
   * BREIT der Schatten ist, und ab wo er beginnt (an der Leeküste, nicht in der
   * Inselmitte).
   *
   * Eine Näherung: eine Insel ist kein Kreis. Bewusst so, denn die Alternative
   * wäre ein Polygon je Insel, und die Breite quer zum Wind schwankt darin um
   * weniger, als die Faktoren ohnehin unsicher sind.
   *
   * Seit 2026-08-07 GEMESSEN statt geschätzt: `seeding/tools/leeZones.ts`
   * projiziert die Landzellen der Insel auf die Achse quer zum Wind und mittelt
   * über das Meltemi-Band. Der Deckel steht deshalb bei 12 sm und nicht mehr
   * bei 8 — Andros misst 8,9 sm, und ein Deckel, den echte Geometrie reisst,
   * misst das Falsche. Was eine Halbinsel vom Hindernis trennt, ist ohnehin
   * nicht diese Zahl, sondern das Festland-Tor des Werkzeugs: reicht die
   * zusammenhängende Landfläche über ihr eigenes Suchfenster hinaus, bekommt
   * sie gar keine Zone (Methana, Salamina, Poros).
   */
  obstacleRadiusNm: z.number().positive().max(12),
  /**
   * Wie weit der Schatten AB DER LEEKÜSTE reicht, in sm. Am Anfang der Keule
   * gilt `factor`, am Ende wieder 1,0 — dazwischen linear (windTopo.ts).
   *
   * Der lineare Abfall ist die ehrlichste einfache Form: dass der Schatten mit
   * der Entfernung ausläuft, ist im Raster unmittelbar zu sehen; WIE er
   * ausläuft, ist es nicht. Eine Exponentialfunktion wäre eine Genauigkeit, die
   * nicht in den Daten steckt.
   */
  lobeNm: z.number().positive().max(25),
  /**
   * Der Faktor DIREKT hinter der Leeküste — das Maximum der Abdeckung. Nach
   * `lobeNm` ist er auf 1,0 ausgelaufen.
   */
  factor: z.number().gt(0).lt(1),
  /**
   * Ab welchem Abstand zur Küste das Lee nutzbar ist. Näher dran stehen die
   * katabatischen Fallböen (Modulkopf) — und die stehen genau dort, wo eine
   * Schatten-Taktik hinführt. Fehlt der Wert, sagt der Hinweis nichts dazu,
   * statt eine Zahl zu erfinden.
   */
  fallboeenNm: z.number().min(0).max(5).optional(),
});
export type WindTopoLeeZone = z.infer<typeof WindTopoLeeZoneSchema>;

/**
 * DIE ASYMMETRIE IST GESTALT GEWORDEN. Bis 2026-08-07 war sie eine Prüfung
 * ("kind 'lee' verlangt factor < 1"); jetzt sind es zwei verschiedene Typen mit
 * verschiedenen Feldern. Eine Lee-Zone, die den Wind erhöht, ist damit nicht
 * mehr bloss verboten — sie ist nicht mehr hinschreibbar: `factor` einer
 * Lee-Zone ist `gt(0).lt(1)`, der einer Düse `gt(1)`.
 */
export const WindTopoZoneSchema = z.discriminatedUnion('kind', [
  WindTopoLeeZoneSchema,
  WindTopoDueseZoneSchema,
]);
export type WindTopoZone = z.infer<typeof WindTopoZoneSchema>;

/**
 * DER WINDSCHATTEN AN EINER ETAPPE.
 *
 * Kein Feld dieses Typs wird von Ampel, Solver, Budget oder Gültigkeit gelesen
 * — der Hinweis ist die ANZEIGE. Ob der Schatten daneben auch BEWERTET wurde,
 * entscheidet das Confidence-Tor (domain/windTopo.ts, `scoringLeeZones`), und
 * `bewertet` sagt es. Der Unterschied muss im Text stehen: "die Ampel rechnet
 * mit dem vollen Wind" ist für eine bewertende Zone schlicht falsch, und eine
 * falsche Beruhigung ist schlimmer als keine.
 */
export interface LeeHinweis {
  zoneId: string;
  name: string;
  /** Etappe, an der der Schatten liegt. */
  legId: string;
  /** Der Modellwind der maßgeblichen Stunde — das, was die Bewertung sieht. */
  modellKn: number;
  /**
   * Der rechnerische Lee-Wind derselben Stunde (modellKn × factor). AUSDRÜCKLICH
   * KEINE VORHERSAGE: eine kuratierte Abschätzung, was hinter der Insel
   * ankommt. Nichts liest diesen Wert außer der Anzeige.
   */
  leeKn: number;
  /**
   * Hat diese Zone die Bewertung des Tages wirklich angefasst? True nur, wenn
   * sie das Confidence-Tor passiert UND `params.leeBewertungMaxAbzugKn > 0`
   * ist. Zonen mit `confidence: 'niedrig'` beraten weiterhin bloss.
   */
  bewertet: boolean;
  /**
   * Der Wind, mit dem die AMPEL gerechnet hat — bei `bewertet: false` der volle
   * Modellwind, sonst der GEKAPPTE Lee-Wert (`leeBewertungMaxAbzugKn`), der
   * über `leeKn` liegt, solange die Kappung greift. Die drei Zahlen
   * nebeneinander sind die ganze Aussage: was das Modell sagt, was die Kuration
   * erwartet, und was davon in die Bewertung durfte.
   */
  angesetztKn: number;
  /** Windrichtung der maßgeblichen Stunde (AD-6: woher). */
  windDirDeg: number;
  /** Stunden der Etappe, in denen der Schatten überhaupt steht. */
  stunden: number;
  /** Ruht der Hinweis auf Modellstunden oder auf der Persistenz-Annahme? */
  basis: DataBasis;
  /** Der Satz für die Anzeige — formuliert in der Domäne, nie in der View (AD-2). */
  text: string;
}
