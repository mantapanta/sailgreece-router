/**
 * PROBLEMATISCHE ABSCHNITTE EINER ETAPPE — Kreuz und Halbwind mit Ampel.
 *
 * "Ich will bei den Etappenkarten erkennen, ob problematische Abschnitte mit
 * dabei sind: ca. 4 sm Kreuz (16 kn), ca. 10 sm Halbwind (9 kn)"
 * (Skipper 2026-08-06).
 *
 * WARUM DAS NICHT AUS DEN MITTELWERTEN FOLGT: eine Etappe, die vier Meilen
 * gegenan anfängt und danach raumschots läuft, hat einen mittleren TWA von weit
 * über 60° — die Kreuz-Meilen verschwinden darin restlos. Genau sie sind aber
 * die Stunde, über die an Bord geredet wird. Deshalb werden hier die ABSCHNITTE
 * gezählt, nicht der Tag gemittelt.
 *
 * WOHER DIE ZAHLEN KOMMEN: aus den Durchfahrten der Simulation
 * (`LegAssessment.pointPassages`) — denselben Zeilen, die die aufgeklappte
 * Rechnung zeigt. Die Meldung ist deren Zusammenfassung und keine zweite
 * Rechnung (AD-3); jede Zeile lässt sich in der Tabelle darunter nachschlagen.
 *
 * WAS SIE NICHT IST: ein Urteil über den Tag. Die Etappen-Ampel entscheiden die
 * FR16-Windregel und die Fahrtbudgets (scoring.ts); ein roter Kreuz-Abschnitt
 * meldet Unbequemlichkeit, nicht Ungültigkeit — die App rät ab, sie verbietet
 * nicht (dieselbe Doktrin wie `kreuzGelbAbStunden`).
 */

import type { Ampel } from './schema/common.ts';
import type { Params } from './schema/params.ts';
import type {
  KursAbschnitt,
  KursKategorie,
  PointPassage,
} from './schema/snapshot.ts';

/**
 * DIE EINTEILUNG DER KURSE ZUM WIND (Skipper 2026-08-07): "Kreuz ist alles,
 * was zwischen TWA 55 und 80 Grad ist, 80 bis 100 ist Halbwind und 100 bis 180
 * ist Downwind" — und darunter, zwischen 0 und 55, muss zickzack aufgekreuzt
 * werden.
 *
 * Daraus die drei Grenzen unten. Sie stehen hier und nicht in der Anzeige,
 * damit Label und Warnung nicht auseinanderlaufen können: eine Zeile, die
 * "Halbwind" heisst, muss in der Halbwind-Meldung auftauchen und nicht in der
 * Kreuz-Meldung.
 *
 * Ausdrücklich NICHT die Schwellen der Bewertung: ob eine Etappe als Aufkreuzer
 * gilt, entscheidet `params.upwindTwaDeg` (FR16), und ob wirklich gekreuzt
 * werden muss, `params.beatTwaDeg` (55°, konfigurierbar). Diese Zahlen hier
 * beschriften nur — `KURS_GEGENAN_BIS_DEG` bildet den Default ab, damit ein
 * Label auch ohne Params-Zugriff (ui/format.ts) stimmt.
 */
export const KURS_GEGENAN_BIS_DEG = 55;
export const KURS_AM_WIND_BIS_DEG = 80;
export const KURS_HALBWIND_BIS_DEG = 100;

/**
 * WARUM DIE KREUZ-ZEILE ZWEI ZAHLEN NENNT.
 *
 * Die Kategorie reicht bis 80° TWA, gekreuzt wird aber erst unter 55°: dazwischen
 * liegt der Kurs an, dort ist eine Meile auf der Karte eine Meile durchs Wasser.
 * Erst darunter wird der Zickzack gefahren, und aus einer Meile werden bei 40°
 * TWA rund 1,3 und bei 20° TWA rund 1,7 (polar.kreuzFactor).
 *
 * Die Zeile trug deshalb zwei völlig verschiedene Aussagen unter EINEM Wort:
 * "ca. 8 sm Kreuz" las sich wie acht aufzukreuzende Meilen — rund drei Stunden
 * —, während zwei davon gekreuzt wurden und der Rest anlag: gut eine Stunde
 * (Skipper-Rückfrage 2026-08-07). Seitdem zählt `KursAbschnitt.kreuzNm` die
 * Teilmenge mit, und die Anzeige nennt beide Zahlen getrennt.
 */

/** Reihenfolge der Meldung: der härtere Kurs zuerst. */
export const KURS_REIHENFOLGE: KursKategorie[] = ['kreuz', 'halbwind'];

/**
 * Kategorie eines Abschnitts, oder null für raumschots/vor dem Wind — dort
 * trägt der Wind, und es gibt nichts zu melden.
 *
 * `kreuzen` schlägt den Winkel: muss der Abschnitt gekreuzt werden, ist er ein
 * Kreuz-Abschnitt, auch wenn `beatTwaDeg` hoch konfiguriert über 60° läge.
 */
export function kursKategorie(
  twaDeg: number,
  kreuzen: boolean,
): KursKategorie | null {
  const t = Math.abs(twaDeg);
  if (kreuzen || t < KURS_AM_WIND_BIS_DEG) return 'kreuz';
  if (t < KURS_HALBWIND_BIS_DEG) return 'halbwind';
  return null;
}

/** Die beiden Windschwellen dieser Kategorie (AD-8: aus der Konfiguration). */
export function kursSchwellen(
  kategorie: KursKategorie,
  params: Params,
): { gelbAbKn: number; rotAbKn: number } {
  return kategorie === 'kreuz'
    ? { gelbAbKn: params.kreuzGelbAbKn, rotAbKn: params.kreuzRotAbKn }
    : { gelbAbKn: params.halbwindGelbAbKn, rotAbKn: params.halbwindRotAbKn };
}

/**
 * Ampel eines Abschnitts: über der Rot-Schwelle rot, ab der Gelb-Schwelle gelb,
 * darunter grün. Die Grenzwerte selbst zählen zum MILDEREN Band — "zwischen 10
 * und 20 kn gelb" heisst, dass 20 kn noch gelb sind und erst darüber rot
 * beginnt.
 */
export function kursAmpel(
  kategorie: KursKategorie,
  twsKn: number,
  params: Params,
): Ampel {
  const { gelbAbKn, rotAbKn } = kursSchwellen(kategorie, params);
  if (twsKn > rotAbKn) return 'rot';
  if (twsKn >= gelbAbKn) return 'gelb';
  return 'gruen';
}

/** Roh-Summe je Kategorie — Meilen addiert, der stärkste Wind gewinnt. */
type Summe = { distanceNm: number; kreuzNm: number; maxTwsKn: number };

function fasse(
  sums: Map<KursKategorie, Summe>,
  params: Params,
): KursAbschnitt[] {
  return KURS_REIHENFOLGE.flatMap((kategorie) => {
    const s = sums.get(kategorie);
    if (!s) return [];
    return [
      {
        kategorie,
        distanceNm: s.distanceNm,
        kreuzNm: s.kreuzNm,
        maxTwsKn: s.maxTwsKn,
        ampel: kursAmpel(kategorie, s.maxTwsKn, params),
      },
    ];
  });
}

function addiere(
  sums: Map<KursKategorie, Summe>,
  kategorie: KursKategorie,
  distanceNm: number,
  kreuzNm: number,
  twsKn: number,
): void {
  const cur = sums.get(kategorie);
  if (cur) {
    cur.distanceNm += distanceNm;
    cur.kreuzNm += kreuzNm;
    cur.maxTwsKn = Math.max(cur.maxTwsKn, twsKn);
  } else {
    sums.set(kategorie, { distanceNm, kreuzNm, maxTwsKn: twsKn });
  }
}

/**
 * Die Kreuz-/Halbwind-Abschnitte EINER Etappe aus ihren Durchfahrten.
 *
 * Der Startpunkt hat keinen Abschnitt (er wird verlassen, nicht angefahren) und
 * ein nicht erreichter Punkt auch nicht — beide tragen nichts bei. Motorstunden
 * bleiben drin: unter Motor gegen 25 kn und aufgestellte See zu stampfen ist
 * genau der Abschnitt, nach dem hier gefragt wird.
 */
export function kursAbschnitteOfPassages(
  passages: PointPassage[],
  params: Params,
): KursAbschnitt[] {
  const sums = new Map<KursKategorie, Summe>();
  for (const p of passages) {
    const s = p.segment;
    if (!s) continue;
    const kategorie = kursKategorie(s.twaDeg, s.kreuzen);
    if (!kategorie) continue;
    addiere(sums, kategorie, s.distanceNm, s.kreuzen ? s.distanceNm : 0, s.twsKn);
  }
  return fasse(sums, params);
}

/**
 * Die Abschnitte eines ganzen TAGES: die Listen seiner Etappen zusammengefasst.
 *
 * Nicht einfach aneinandergehängt — sonst stünde an einem Doppelschlag-Tag
 * zweimal "Kreuz" und der Skipper müsste die Meilen selbst addieren. Der
 * stärkste Wind gewinnt auch hier: die schlechteste Stunde trägt das Urteil.
 */
export function mergeKursAbschnitte(
  listen: KursAbschnitt[][],
  params: Params,
): KursAbschnitt[] {
  const sums = new Map<KursKategorie, Summe>();
  for (const liste of listen) {
    for (const a of liste) {
      addiere(sums, a.kategorie, a.distanceNm, a.kreuzNm, a.maxTwsKn);
    }
  }
  return fasse(sums, params);
}
