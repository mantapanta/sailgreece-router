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

export const AMPEL_CSS_COLOR: Record<Ampel, string> = {
  gruen: '#3a7d44',
  gelb: '#d9a441',
  rot: '#b0413e',
  unbewertet: '#9aa5b1',
};
