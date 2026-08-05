/**
 * Avatar → account menu (header line 1, right).
 *
 * A 34px gradient circle with the user's initial opens a Level-3-elevated menu
 * containing the full name (never truncated), the e-mail and "Abmelden". Esc
 * and a backdrop tap close it; focus moves into the menu on open, is trapped
 * while open and returns to the avatar button on close.
 */

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../app/authContext.tsx';

export function AvatarMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('button');
    items?.[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === 'Tab') {
        // Simple focus trap: cycle within the menu's buttons while open.
        const focusables = menuRef.current?.querySelectorAll<HTMLElement>('button');
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

  if (!user) return null;

  const initial =
    (user.displayName ?? user.email ?? 'S').trim().charAt(0).toUpperCase() || 'S';

  return (
    <div className="avatar-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="avatar"
        aria-label="Konto"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span aria-hidden="true">{initial}</span>
      </button>
      {open && (
        <>
          <div className="menu-backdrop" aria-hidden="true" onClick={close} />
          <div ref={menuRef} className="avatar-menu" role="menu" aria-label="Konto">
            <div className="avatar-menu-identity">
              <span className="avatar-menu-name">
                {user.displayName ?? 'Angemeldet'}
              </span>
              {user.email && <span className="avatar-menu-email">{user.email}</span>}
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                void signOut();
              }}
            >
              Abmelden
            </button>
          </div>
        </>
      )}
    </div>
  );
}
