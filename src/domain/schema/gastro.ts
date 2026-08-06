import { z } from 'zod';
import { ConfidenceSchema } from './berthing.ts';

/**
 * Gastronomie am Platz (Deep-Research Kykladen-Hafen-und-Gastro, 2026-08-06).
 *
 * Eine SUBEBENE des Platzes, kein eigenes Dokument: ein Restaurant existiert
 * in dieser Bibliothek nur als Eigenschaft des Liegeplatzes, von dem aus man
 * es erreicht. Es wird nie eigenständig gesucht, nie ohne seinen Platz
 * angezeigt und nie separat importiert.
 *
 * Abgrenzung zu `place.qualities.restaurant`: die Zahl dort ist die
 * VERDICHTUNG (0–5, ganzzahlig) und die einzige Grösse, die in die Sortierung
 * der Plätze eingeht (`ampel.ts`, Tie-Break). Dieser Block ist das DETAIL
 * dahinter — er bewertet nichts, er beantwortet „wo essen wir heute Abend,
 * und wie kommen wir dahin".
 *
 * Nichts hier ist sicherheitsrelevant: keine Ampel, kein Solver, kein Budget
 * hängt an einem dieser Felder. Deshalb steht hier auch keine Pflichtangabe
 * ausser Name, Bewertung und Quelle — eine Lücke bleibt eine Lücke (AD-4).
 */

/**
 * Gastro-Bewertung 1–5 mit einer Nachkommastelle.
 *
 * Bewusst NICHT die ganzzahlige 0–5-Skala von `qualities`: die Recherche
 * liefert verdichtete Community-Ratings (4.8, 4.7, 4.6), und ein Runden auf
 * ganze Sterne würde genau die Rangfolge zerstören, um derentwillen die
 * Empfehlung überhaupt kuratiert wurde. Untergrenze 1, weil ein kuratierter
 * Eintrag immer eine Empfehlung ist — „gibt es, taugt aber nichts" wird nicht
 * aufgenommen, sondern weggelassen.
 */
export const QualityRatingSchema = z
  .number()
  .min(1)
  .max(5)
  // Toleranz statt Number.isInteger(v * 10): 4.8 * 10 ist in IEEE-754
  // 48.000000000000004, eine exakte Prüfung verwürfe jeden zweiten gültigen Wert.
  .refine((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9, {
    message: 'qualityRating: höchstens eine Nachkommastelle',
  });

export const RestaurantSchema = z.object({
  /** Kebab-case slug, stabil und bibliotheksweit eindeutig, z. B. 'antiparos-lollos'. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  qualityRating: QualityRatingSchema,
  /** Küchenrichtung als Freitext, z. B. 'Authentische Fischtaverne'. */
  cuisineType: z.string().min(1).nullable().optional(),
  /** Spezialitäten, die man dort und nur dort isst. */
  signatureDishes: z.array(z.string().min(1)).default([]),
  /**
   * Anlandung und Weg vom Liegeplatz — die eigentliche nautische Information
   * dieses Blocks („Beiboot an den Holzsteg der Taverne" vs. „3 Min zu Fuss").
   */
  accessInfo: z.string().min(1).nullable().optional(),
  /** Reservierung: Kanal, Nummer, nötiger Vorlauf — als ein Freitext. */
  reservationInfo: z.string().min(1).nullable().optional(),
  /**
   * Wie gut der Eintrag belegt ist. Steuert nichts, sondern sagt der Anzeige,
   * ob sie den Reservierungskontakt als gesichert darstellen darf: Telefon-
   * nummern aus Crowd-Quellen veralten schnell, und eine falsch angezeigte
   * Nummer ist schlimmer als gar keine.
   */
  confidence: ConfidenceSchema,
  sources: z.array(z.string().min(1)).min(1),
});
export type Restaurant = z.infer<typeof RestaurantSchema>;
