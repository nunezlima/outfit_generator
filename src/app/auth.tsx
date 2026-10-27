// Sesión: SOLO inicio de sesión (no hay registro). Si no hay internet pero
// este dispositivo ya tenía una sesión, se entra en modo sin conexión con los
// datos locales; al volver la red, Supabase renueva el token solo.

import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { closeAndDeleteLocalDB, openLocalDB } from '../data/db';
import { startSync, stopSync } from '../data/sync';
import { supabase } from '../lib/supabase';
import { forgetGeneratorFilters } from './generatorState';
import { forgetWardrobeView } from './wardrobeView';

const LAST_USER = 'guardarropa:last-user';

interface LastUser {
  id: string;
  email: string;
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'ready'; userId: string; email: string; offline: boolean };

interface AuthApi {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);

function readLastUser(): LastUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER);
    return raw ? (JSON.parse(raw) as LastUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    if (!supabase) return;
    const enter = (session: Session) => {
      const user = { id: session.user.id, email: session.user.email ?? '' };
      try {
        localStorage.setItem(LAST_USER, JSON.stringify(user));
      } catch {
        /* ignorar */
      }
      openLocalDB(user.id);
      setState((prev) =>
        prev.status === 'ready' && prev.userId === user.id && !prev.offline ? prev : { status: 'ready', userId: user.id, email: user.email, offline: false },
      );
      startSync();
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) return enter(data.session);
      const last = readLastUser();
      if (last && !navigator.onLine) {
        openLocalDB(last.id);
        setState({ status: 'ready', userId: last.id, email: last.email, offline: true });
      } else {
        setState({ status: 'signedOut' });
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
        // Diferido para no llamar a Supabase dentro del propio callback.
        setTimeout(() => enter(session), 0);
      } else if (event === 'SIGNED_OUT') {
        stopSync();
        setState({ status: 'signedOut' });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const api: AuthApi = {
    state,
    async signIn(email, password) {
      if (!supabase) return 'La app no está configurada.';
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (!error) return null;
      if (/invalid login credentials/i.test(error.message)) return 'Correo o contraseña incorrectos.';
      if (/email not confirmed/i.test(error.message)) return 'Tu correo no está confirmado. Márcalo como confirmado en Supabase.';
      if (/fetch|network/i.test(error.message)) return 'Sin conexión. Revisa tu internet.';
      return error.message;
    },
    async signOut() {
      stopSync();
      try {
        localStorage.removeItem(LAST_USER);
      } catch {
        /* ignorar */
      }
      forgetGeneratorFilters();
      forgetWardrobeView();
      await closeAndDeleteLocalDB();
      await supabase?.auth.signOut({ scope: 'local' });
      setState({ status: 'signedOut' });
    },
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider falta');
  return v;
}

export function useSession(): { userId: string; email: string; offline: boolean } {
  const { state } = useAuth();
  if (state.status !== 'ready') throw new Error('Sin sesión');
  return state;
}
