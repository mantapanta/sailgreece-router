import type { Ampel } from '../../domain/schema/common.ts';

/** Die vier deutschen Ampel-Wörter — EINE Quelle, auch für Listen-Zeilen. */
export const AMPEL_LABEL: Record<Ampel, string> = {
  gruen: 'Grün',
  gelb: 'Gelb',
  rot: 'Rot',
  unbewertet: 'Unbewertet',
};

export function AmpelBadge({ ampel, label }: { ampel: Ampel; label?: string }) {
  return (
    <span className={`ampel ampel-${ampel}`} title={AMPEL_LABEL[ampel]}>
      <span className="dot" />
      {label ?? AMPEL_LABEL[ampel]}
    </span>
  );
}
