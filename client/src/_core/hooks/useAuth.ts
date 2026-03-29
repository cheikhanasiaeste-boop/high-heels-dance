import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/" } =
    options ?? {};

  const utils = trpc.useUtils();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const syncUserMutation = trpc.auth.syncUser.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  // ── Session lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    // Hydrate initial session synchronously
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setSessionLoading(false);
    });

    // Subscribe to auth state changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s);
      setSessionLoading(false);

      if (event === "SIGNED_IN" && s) {
        // Provision or link the users DB row for this Supabase identity
        const name =
          s.user.user_metadata?.name ||
          s.user.user_metadata?.full_name ||
          "";
        const email = s.user.email ?? "";
        if (email) {
          syncUserMutation.mutate({ name, email });
        }
      }

      if (event === "SIGNED_OUT") {
        utils.auth.me.setData(undefined, null);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isAuthenticated = Boolean(session);

  // ── Internal user profile (role, membership, etc.) from our DB ──────────
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: isAuthenticated && !syncUserMutation.isPending,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // ── Auth actions ─────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    utils.auth.me.setData(undefined, null);
    await utils.auth.me.invalidate();
  }, [utils]);

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    },
    []
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw error;
    },
    []
  );

  const loginWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
  }, []);

  const loginWithFacebook = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
  }, []);

  /**
   * Refresh both the Supabase session token and the tRPC user cache.
   * Call this after membership/role changes that need to be reflected immediately.
   */
  const refresh = useCallback(async () => {
    await supabase.auth.refreshSession();
    await utils.auth.me.invalidate();
  }, [utils]);

  // ── Redirect if unauthenticated ──────────────────────────────────────────
  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (sessionLoading || syncUserMutation.isPending) return;
    if (session) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;
    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    sessionLoading,
    syncUserMutation.isPending,
    session,
  ]);

  const loading = useMemo(
    () =>
      sessionLoading ||
      syncUserMutation.isPending ||
      (isAuthenticated && meQuery.isLoading),
    [sessionLoading, syncUserMutation.isPending, isAuthenticated, meQuery.isLoading]
  );

  return {
    user: meQuery.data ?? null,
    isAuthenticated,
    loading,
    error: meQuery.error ?? syncUserMutation.error ?? null,
    logout,
    refresh,
    loginWithEmail,
    signUp,
    loginWithGoogle,
    loginWithFacebook,
  };
}
