import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';

interface SessionState {
  session: Session | null;
  loading: boolean;
}

const SessionContext = createContext<SessionState>({ session: null, loading: true });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: true });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, loading: false });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setState({ session: next, loading: false });
      if (event === 'SIGNED_OUT') queryClient.clear();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return createElement(SessionContext.Provider, { value: state }, children);
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}
