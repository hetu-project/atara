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

/**
 * 注册。
 *
 * 返回 needsEmailConfirm 让调用方区分两种 Supabase 配置：
 * - 开启邮箱验证（默认）：data.session 为 null，用户需先点邮件链接
 * - 关闭邮箱验证：data.session 已就绪，可直接进应用
 *
 * 两种配置都能正常工作，切换配置不需要改代码。
 */
export async function signUp(
  email: string,
  password: string,
): Promise<{ needsEmailConfirm: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { needsEmailConfirm: !data.session };
}

export async function signOut() {
  await supabase.auth.signOut();
}
