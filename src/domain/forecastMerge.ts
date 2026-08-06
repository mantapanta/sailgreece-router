/**
 * NAHFELD/FERNFELD-VERSCHMELZUNG — das Gegenstück zu persistence.ts.
 *
 * Dieses Modul entscheidet, was ECHT ist; persistence.ts füllt, was fehlt.
 * Deshalb stehen sie nebeneinander.
 *
 * Problem: ECMWF IFS 0.25° (~25 km) trägt 10 Tage, glättet aber genau die
 * Kanaldüsen, an denen es in den Kykladen hängt (Kea-Kanal, Paros–Naxos).
 * DWD ICON-EU (~7 km) sieht sie, reicht aber nur 5 Tage. Also: die Stunden, die
 * das feine Modell abdeckt, kommen von ihm; danach übernimmt das grobe.
 *
 * DIE NAHTSTELLE IST EIN HARTER SCHNITT. Es wird NICHT geblendet, und das ist
 * eine Entscheidung, keine Auslassung:
 *
 *   1. AD-10 verbietet es. Ein geblendeter Wert ist eine Zahl, die KEIN Modell
 *      vorhergesagt hat — vom Adapter geliefert mit `windAssumed: false`, also
 *      ununterscheidbar von einem Modellwert. Genau der Fehlerfall, für den es
 *      die *Assumed-Flags überhaupt gibt. Jeder erfundene Wert in dieser
 *      Codebasis ist markiert; eine Rampe wäre der eine, der es nicht wäre.
 *   2. Der Sprung IST die Information. Sagt ICON-EU in der Kafireas-Strasse
 *      26 kn zur Stunde 119 und ECMWF 19 kn zur Stunde 120, dann ist der
 *      7-kn-Sprung die Aussage "hier sind sich zwei Modelle um 7 kn uneins".
 *      Glätten löscht das einzige Signal, dass diese Stunde unsicher ist.
 *   3. Rechnerisch ändert es nichts: die Bewertung liest Punktwerte
 *      (scoring.ts) und bildet Maxima über Fenster — ein Maximum ist blind
 *      dafür, ob der Anstieg eine Stufe oder eine Rampe war.
 *   4. Die Naht ist ausserdem ein Sprung in der ZEITLICHEN Auflösung: die
 *      ECMWF-Hälfte ist von Open-Meteo aus 3-stündigen Feldern interpoliert,
 *      die ICON-EU-Hälfte ist echt stündlich. Zwei verschiedene zeitliche
 *      Auflösungen zu verschmelzen wäre doppelt erfunden.
 *
 * Wollte jemand doch glätten, gehörte das NICHT hierher, sondern in einen
 * Domänenschritt, der geglättete Stunden markiert, wie persistence.ts die
 * angenommenen markiert. Die Tür bleibt sichtbar und geschlossen.
 *
 * DAS TOR (`MergeGroup.gate`) IST DIE ZENTRALE GARANTIE: Windgeschwindigkeit und
 * -richtung stammen für eine Stunde immer aus DEMSELBEN Modell. Nie Fahrt von
 * ICON-EU und Richtung von ECMWF — das wäre kein Wind, den irgendein Modell
 * vorhergesagt hat. Und die Torpaare sind exakt die Paare, die
 * windHorizonIndex/waveHorizonIndex (persistence.ts) als "echte Daten" lesen:
 * (windKn, windDirDeg) bzw. (waveM, waveDirDeg). GENAU DESHALB funktioniert die
 * Horizont-Logik unverändert weiter — sie sucht die Achse rückwärts nach echten
 * Werten ab und muss nicht wissen, aus welchem Modell einer stammt.
 *
 * Pur: kein fetch, keine Open-Meteo-Vokabeln. Die Serien-Namen kommen von
 * aussen, damit `'wind_speed_10m'` nirgends in domain/ auftaucht.
 */

/** Die Serien EINES Modells für EINEN Ort, auf dessen EIGENER Stundenachse. */
export interface TimedSeries {
  /** Die eigene UTC-Achse des Modells (ISO-Strings, aufsteigend). */
  times: string[];
  /** Serien passend zu `times`; was das Modell nicht trägt, ist null. */
  values: Record<string, (number | null)[]>;
}

/**
 * Welche Serien GEMEINSAM entschieden werden.
 * `gate` muss vollständig vorliegen, damit eine Stunde aus dem Nahfeld kommt;
 * `carry` folgt der Entscheidung des Tors, ohne sie zu beeinflussen.
 */
export interface MergeGroup {
  readonly gate: readonly string[];
  readonly carry: readonly string[];
}

export interface MergeResult {
  values: Record<string, (number | null)[]>;
  /**
   * 1 + der letzte Achsindex, der aus dem NAHFELD kam; 0 = es hat nichts
   * beigetragen. KEINE Anzahl von Stunden — ein Loch mitten drin verkürzt die
   * Reichweite nicht.
   */
  nearReachHours: number;
}

const isNum = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Leere Serien der Achslänge — für "dieses Modell hat gar nichts geliefert". */
function nullValues(
  names: readonly string[],
  length: number,
): Record<string, (number | null)[]> {
  const out: Record<string, (number | null)[]> = {};
  for (const n of names) out[n] = new Array<number | null>(length).fill(null);
  return out;
}

/**
 * Reiht die Serien EINES Modells PER ZEITSTEMPEL auf die normative Achse.
 * Stunden, die das Modell nicht trägt, werden null. Interpoliert nie,
 * verschiebt nie.
 *
 * Ersetzt die drei früheren Umreih-Stellen im Adapter (Wind-Achsprüfung,
 * Marine-Umreihung, und jetzt das Nahfeld). Der Schnellpfad für die
 * deckungsgleiche Achse bleibt drin — als Optimierung, nicht als zweite
 * Implementierung.
 */
export function alignToAxis(
  axis: string[],
  source: TimedSeries | null,
  names: readonly string[],
): Record<string, (number | null)[]> {
  if (!source || source.times.length === 0) return nullValues(names, axis.length);

  const own = source.times;
  const sameAxis =
    own.length === axis.length &&
    own[0] === axis[0] &&
    own[own.length - 1] === axis[axis.length - 1];

  if (sameAxis) {
    const out: Record<string, (number | null)[]> = {};
    for (const n of names) {
      const raw = source.values[n];
      const series = new Array<number | null>(axis.length).fill(null);
      if (raw) {
        for (let i = 0; i < axis.length; i++) {
          const v = raw[i];
          series[i] = isNum(v) ? v : null;
        }
      }
      out[n] = series;
    }
    return out;
  }

  // Der Index wird EINMAL je (Ort, Modell) gebaut, nicht je Serie — bei 233
  // Orten × 4 Modellen ist das der Unterschied zwischen spürbar und egal.
  const ownIndex = new Map<string, number>();
  for (let i = 0; i < own.length; i++) {
    const t = own[i];
    if (t !== undefined && !ownIndex.has(t)) ownIndex.set(t, i);
  }

  const out: Record<string, (number | null)[]> = {};
  for (const n of names) {
    const raw = source.values[n];
    const series = new Array<number | null>(axis.length).fill(null);
    if (raw) {
      for (let i = 0; i < axis.length; i++) {
        const t = axis[i];
        const j = t === undefined ? undefined : ownIndex.get(t);
        if (j === undefined) continue;
        const v = raw[j];
        series[i] = isNum(v) ? v : null;
      }
    }
    out[n] = series;
  }
  return out;
}

/**
 * Nahfeld bevorzugen, sonst Fernfeld — je Stunde und als GRUPPE.
 *
 * Invariante, die die Tests festnageln: trägt `near` nichts bei (null,
 * unbrauchbar, versetzte Achse ohne Überlappung, alles null), ist das Ergebnis
 * identisch mit "nur Fernfeld". Der Hybrid kann damit nie schlechter sein als
 * der Zustand vor seiner Einführung.
 */
export function mergeNearFar(
  axis: string[],
  near: TimedSeries | null,
  far: TimedSeries | null,
  group: MergeGroup,
): MergeResult {
  const names = [...group.gate, ...group.carry];
  if (axis.length === 0) return { values: nullValues(names, 0), nearReachHours: 0 };

  const nearAligned = alignToAxis(axis, near, names);
  const farAligned = alignToAxis(axis, far, names);

  // EIN Boolean je Stunde für die GANZE Gruppe — vor jedem Wertzugriff. Es gibt
  // in dieser Funktion keinen Pfad, der eine einzelne Serie einzeln zurückfallen
  // lässt; das ist die strukturelle Garantie, nicht bloss eine Konvention.
  const useNear = new Array<boolean>(axis.length).fill(false);
  let nearReachHours = 0;
  if (near) {
    for (let i = 0; i < axis.length; i++) {
      let complete = true;
      for (const n of group.gate) {
        if (!isNum(nearAligned[n]?.[i])) {
          complete = false;
          break;
        }
      }
      useNear[i] = complete;
      if (complete) nearReachHours = i + 1;
    }
  }

  const values: Record<string, (number | null)[]> = {};
  for (const n of names) {
    const nearSeries = nearAligned[n];
    const farSeries = farAligned[n];
    const series = new Array<number | null>(axis.length).fill(null);
    for (let i = 0; i < axis.length; i++) {
      series[i] = (useNear[i] ? nearSeries?.[i] : farSeries?.[i]) ?? null;
    }
    values[n] = series;
  }

  return { values, nearReachHours };
}
