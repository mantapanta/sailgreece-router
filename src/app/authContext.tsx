/**
 * AuthContext — the app's single source of truth for "who is signed in".
 *
 * Three named states, no ambiguity: `checking` while the SDK restores a
 * persisted session, `signedOut` (user === null) and `signedIn`. The shell
 * renders the login gate off these states — an unconfigured project is its own
 * state too, so a missing `.env` can never look like a valid session.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  observeAuthState,
  signInWithGoogle,
  signOutUser,
  type AppUser,
} from '../adapters/auth.ts';
import { isFirebaseConfigured } from '../adapters/firebase.ts';

export interface AuthContextValue {
  user: AppUser | null;
  /** True until the SDK has reported the restored session for the first time. */
  checking: boolean;
  /** False when the Firebase env vars are missing — the app cannot sign anyone in. */
  configured: boolean;
  /** Last sign-in/sign-out error, in German. Cleared on the next attempt. */
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<AppUser | null>(null);
  const [checking, setChecking] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!configured) return;
    const unsubscribe = observeAuthState(
      (next) => {
        setUser(next);
        setChecking(false);
      },
      (e) => {
        setError(e.message);
        setChecking(false);
      },
    );
    return unsubscribe;
  }, [configured]);

  const signIn = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await signOutUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const value = useMemo(
    () => ({ user, checking, configured, error, signIn, signOut }),
    [user, checking, configured, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
