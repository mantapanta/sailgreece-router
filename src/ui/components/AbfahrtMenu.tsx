/**
 * ABFAHRT PER KLICK — das Menü, mit dem ein Etappentag seine Abfahrtsstunde
 * bekommt (Skipper 2026-08-06).
 *
 * Der Default der Abfahrt ist die Empfehlung des Tages (domain/abfahrt.ts,
 * aufgelöst in scoring.departureHourForDay) — dieses Menü ist der Weg, davon
 * abzuweichen UND zurückzukommen: die erste Zeile gibt den Tag an seinen
 * Default zurück, danach folgen die Stunden, die dieser Törntag zur Wahl
 * stellt (scoring.departureHourChoices; Tag 1 trägt das Übernahme-Fenster
 * 14–17 Uhr zusätzlich).
 *
 * EIN Menü für jede Stelle, an der die Abfahrt gesetzt wird: die Etappenkarte
 * hängt es an ihre Abfahrt-Kachel (`variant="tile"`), die kompakte Chip-Form
 * bleibt für Wirte ohne Kachel. Zwei Bedienelemente für dieselbe Entscheidung
 * wären zwei Gelegenheiten, sie verschieden zu beantworten. (Die Etappenliste
 * der Kartenansicht, für die die Chip-Form gebaut wurde, ist mit dem Feedback
 * vom 2026-08-06 entfallen — die Karte trägt keine Etappenzeilen mehr.)
 *
 * Popover-Kontrakt wie AltRouteMenu/AvatarMenu (Interaction Primitives): eines
 * zur Zeit, Esc/Backdrop/Auslöser schliessen, Fokus geht hinein und zurück zum
 * Auslöser. Der Auslöser ist kein Umschalter — er öffnet ein Menü; welche
 * Stunde gilt, sagt sein Text.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function AbfahrtMenu({
  day,
  hours,
  value,
  vomSkipper,
  empfehlung,
  standard,
  onPick,
  variant = 'chip',
}: {
  /** Törntag, dessen Abfahrt hier gesetzt wird — steht im aria-label. */
  day: number;
  /** Wählbare Stunden dieses Tages (scoring.departureHourChoices). */
  hours: number[];
  /** Die WIRKSAME Abfahrt (StageAssessment.abfahrtHourAthens). */
  value: number;
  /** True = `value` ist die Wahl des Skippers, nicht der Default. */
  vomSkipper: boolean;
  /** Empfohlene Stunde dieses Tages; null, wenn es keine gibt. */
  empfehlung: number | null;
  /** `params.departureHourAthens` — der Default ohne Empfehlung. */
  standard: number;
  /** `null` = zurück auf den Default (Empfehlung, sonst Standard). */
  onPick: (hour: number | null) => void;
  /** 'tile' sitzt in der Abfahrt-Kachel, 'chip' in der Etappenliste. */
  variant?: 'tile' | 'chip';
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** Bildschirmkoordinaten des offenen Menüs; null = noch nicht vermessen. */
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const close = () => {
    setOpen(false);
    setPos(null);
    triggerRef.current?.focus();
  };

  /**
   * Das Menü hängt an `position: fixed` statt am Auslöser — der Wirt
   * beschneidet sonst: die Kachelreihe der Etappenkarte rundet ihre Ecken über
   * die Kachelflächen, und ein Wirt kann in einem eigenen Container scrollen.
   * Ein Menü, das man erst scrollen muss, um es zu lesen, ist kein Menü.
   * Reicht der Platz darunter nicht, klappt es nach oben.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      const menu = menuRef.current?.getBoundingClientRect();
      if (!anchor || !menu) return;
      const gap = 6;
      const platzDarunter = window.innerHeight - anchor.bottom;
      const nachOben = platzDarunter < menu.height + gap && anchor.top > menu.height + gap;
      setPos({
        left: Math.max(
          8,
          Math.min(anchor.left, window.innerWidth - menu.width - 8),
        ),
        top: nachOben ? anchor.top - menu.height - gap : anchor.bottom + gap,
      });
    };
    place();
    window.addEventListener('resize', place);
    // Capture: scrollt der Wirt in einem eigenen Container statt im Fenster,
    // käme sein scroll-Event ohne capture hier nie an.
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const items = () => menuRef.current?.querySelectorAll<HTMLElement>('button');
    items()?.[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === 'Tab') {
        // Einfache Fokusfalle: im Menü zirkulieren, solange es offen ist.
        const focusables = items();
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const defaultHour = empfehlung ?? standard;
  const defaultLabel =
    empfehlung !== null ? `Empfehlung (${empfehlung}:00)` : `Standard (${standard}:00)`;

  return (
    <span className="popover-wrap">
      <button
        ref={triggerRef}
        type="button"
        className={variant === 'tile' ? 'abfahrt-trigger' : 'abfahrt-chip'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Abfahrt Tag ${day}: ${value}:00${
          vomSkipper ? '' : ` (${empfehlung !== null ? 'Empfehlung' : 'Standard'})`
        } — ändern`}
        onClick={(e) => {
          // Sitzt der Auslöser in einem anklickbaren Wirt (Zeile, Kachel),
          // würde ohne das hier jeder Klick aufs Menü auch den Wirt schalten.
          e.stopPropagation();
          if (open) close();
          else setOpen(true);
        }}
      >
        <span aria-hidden="true">
          {variant === 'tile' ? `${value}:00` : `ab ${value}:00`}
        </span>
        <span className="caret" aria-hidden="true" />
      </button>
      {open && (
        <>
          <div
            className="menu-backdrop"
            aria-hidden="true"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
          />
          <div
            ref={menuRef}
            className="alt-menu abfahrt-menu"
            role="menu"
            aria-label={`Abfahrt Tag ${day}`}
            // Vor der Vermessung unsichtbar, aber im Layout — sonst hätte es
            // keine Höhe, an der sich das Ausklappen ausrichten könnte.
            style={{
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              visibility: pos ? 'visible' : 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!vomSkipper}
              onClick={() => {
                onPick(null);
                close();
              }}
            >
              <span className="am-label">{defaultLabel}</span>
              {!vomSkipper && <span className="am-meta">gilt</span>}
            </button>
            {hours.map((h) => (
              <button
                key={h}
                type="button"
                role="menuitemradio"
                aria-checked={vomSkipper && h === value}
                onClick={() => {
                  onPick(h);
                  close();
                }}
              >
                <span className="am-label">{h}:00</span>
                {/* Die empfohlene Stunde bleibt in der Liste erkennbar —
                    sonst wüsste der Skipper nach dem Umstellen nicht mehr,
                    wovon er gerade abweicht. */}
                {h === defaultHour && (
                  <span className="am-meta">
                    {empfehlung !== null ? 'empfohlen' : 'Standard'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
