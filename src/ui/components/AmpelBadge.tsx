import type { Ampel } from '../../domain/schema/common.ts';

const LABELS: Record<Ampel, string> = {
  gruen: 'Grün',
  gelb: 'Gelb',
  rot: 'Rot',
  unbewertet: 'Unbewertet',
};

export function AmpelBadge({ ampel, label }: { ampel: Ampel; label?: string }) {
  return (
    <span className={`ampel ampel-${ampel}`} title={LABELS[ampel]}>
      <span className="dot" />
      {label ?? LABELS[ampel]}
    </span>
  );
}
