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

/**
 * EIN Windrichtungs-Sektor mit seinem Faktor.
 *
 * Der Faktor hängt am Sektor und nicht an der Zone, weil die Geometrie es tut:
 * der Schatten von Serifos liegt bei Nord anders als bei Nordost, und im
 * Kea-Kanal düst es nur, wenn der Wind längs des Kanals steht. Eine Zone mit
 * einem Faktor für alle Richtungen wäre eine Behauptung über Richtungen, die
 * nie verglichen wurden.
 */
export const WindTopoSectorSchema = z
  .object({
    fromDeg: z.number().min(0).max(360),
    toDeg: z.number().min(0).max(360),
    /**
     * Multiplikator auf die Modell-Windgeschwindigkeit. < 1 = Abdeckung,
     * > 1 = Beschleunigung; welches von beiden erlaubt ist, entscheidet
     * `kind` der Zone (siehe Modulkopf).
     */
    factor: z.number().positive(),
  })
  .refine(noPointSector, {
    message: 'Punkt-Sektor (fromDeg === toDeg) verboten — er würde zum Vollkreis',
  });
export type WindTopoSector = z.infer<typeof WindTopoSectorSchema>;

/**
 * Was die Zone tut — und damit, in welche Richtung sie wirken DARF.
 * 'lee' beraten nur, 'duese' bewerten (Modulkopf).
 */
export const WindTopoKindSchema = z.enum(['lee', 'duese']);
export type WindTopoKind = z.infer<typeof WindTopoKindSchema>;

export const WindTopoZoneSchema = z
  .object({
    /**
     * Kebab-case mit Pflicht-Präfix `topo-`. Wie bei den Kite-Spots kein
     * Schmuck: `serifos-sued` könnte ebensogut ein Liegeplatz sein, und in
     * einem Hinweistext oder einem Firestore-Dokument wäre dann nicht zu sehen,
     * welche Bibliothek gemeint ist.
     */
    id: z.string().regex(/^topo-[a-z0-9-]+$/),
    name: z.string().min(1),
    kind: WindTopoKindSchema,
    /** Mittelpunkt der Wirkfläche — NICHT der Gipfel der Insel. */
    center: CoordinatesSchema,
    /**
     * Radius der Wirkfläche in sm. Gedeckelt, weil eine Zone mit 30 sm Radius
     * keine Ortskenntnis mehr wäre, sondern eine Aussage über das halbe Revier:
     * ein Lee reicht wenige Meilen, ein Kanal ist wenige Meilen breit.
     */
    radiusNm: z.number().positive().max(12),
    sectors: z.array(WindTopoSectorSchema).min(1),
    /**
     * NUR bei 'lee': ab welchem Abstand zur Küste das Lee nutzbar ist. Näher
     * dran stehen die katabatischen Fallböen (Modulkopf) — und die stehen genau
     * dort, wo eine Schatten-Taktik hinführt. Fehlt der Wert, sagt der Hinweis
     * nichts dazu, statt eine Zahl zu erfinden.
     */
    fallboeenNm: z.number().min(0).max(5).optional(),
    /** Woher die Ortskenntnis stammt (Poseidon-Vergleich, Revierführer, Törn). */
    sourceNote: z.string().min(1),
    /**
     * WELCHE VERGLEICHE HINTER DEM FAKTOR STEHEN — Pflichtfeld, weil ein Faktor
     * ohne seine Kalibrierung eine erfundene Zahl ist. Hier steht die Lage
     * (Datum, Uhrzeit, Windrichtung, Stärke), aus der er abgelesen wurde.
     */
    kalibriertAus: z.string().min(1),
    confidence: ConfidenceSchema,
  })
  .check((ctx) => {
    const z0 = ctx.value;
    // DIE ASYMMETRIE ALS SCHEMA (Modulkopf). Ein 'lee' mit factor > 1 würde den
    // Wind erhöhen, ohne je bewertet zu werden — die Korrektur verschwände
    // spurlos; ein 'duese' mit factor < 1 würde den Wind senken und dabei die
    // Ampel anfassen. Genau die beiden Fälle, die es nicht geben darf.
    for (const s of z0.sectors) {
      if (z0.kind === 'lee' && s.factor >= 1) {
        ctx.issues.push({
          code: 'custom',
          message: `${z0.id}: eine Lee-Zone muss abdecken (factor < 1), hier steht ${s.factor}. Beschleunigung gehört in eine Zone mit kind: 'duese' — nur die wird bewertet.`,
          input: z0,
        });
      }
      if (z0.kind === 'duese' && s.factor <= 1) {
        ctx.issues.push({
          code: 'custom',
          message: `${z0.id}: eine Düsen-Zone muss beschleunigen (factor > 1), hier steht ${s.factor}. Abdeckung gehört in eine Zone mit kind: 'lee' — sie berät, statt zu bewerten.`,
          input: z0,
        });
      }
    }
    // Ein Deckel nach oben, damit ein verrutschtes Komma (13 statt 1.3) nicht
    // aus 20 kn einen Orkan macht, der den ganzen Törn rot färbt.
    for (const s of z0.sectors) {
      if (s.factor > 2) {
        ctx.issues.push({
          code: 'custom',
          message: `${z0.id}: factor ${s.factor} mehr als verdoppelt den Wind — Düsen im Revier liegen bei 1,2–1,5. Vermutlich ein verrutschtes Komma.`,
          input: z0,
        });
      }
    }
    if (z0.kind === 'duese' && z0.fallboeenNm !== undefined) {
      ctx.issues.push({
        code: 'custom',
        message: `${z0.id}: fallboeenNm gehört zu einer Lee-Zone — in einer Düse gibt es keinen Windschatten, unter dem man zu dicht heranfahren könnte.`,
        input: z0,
      });
    }
  });
export type WindTopoZone = z.infer<typeof WindTopoZoneSchema>;

/**
 * DER WINDSCHATTEN AN EINER ETAPPE — ein Hinweis, kein Urteil.
 *
 * Er steht in `StageAssessment.leeHinweise` neben der Ampel, nie in ihr. Kein
 * Feld dieses Typs wird von Ampel, Solver, Budget oder Gültigkeit gelesen; das
 * ist die Einlösung der Asymmetrie aus dem Modulkopf.
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
  /** Windrichtung der maßgeblichen Stunde (AD-6: woher). */
  windDirDeg: number;
  /** Stunden der Etappe, in denen der Schatten überhaupt steht. */
  stunden: number;
  /** Ruht der Hinweis auf Modellstunden oder auf der Persistenz-Annahme? */
  basis: DataBasis;
  /** Der Satz für die Anzeige — formuliert in der Domäne, nie in der View (AD-2). */
  text: string;
}
