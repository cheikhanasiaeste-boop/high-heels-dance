import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import type { AuthError, Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

/**
 * Map Supabase error codes to user-friendly messages.
 * See: https://supabase.com/docs/guides/auth/debugging/error-codes
 */
function friendlyAuthError(error: AuthError): string {
  const code = error.message?.toLowerCase() ?? "";
  const errorCode = (error as any).code ?? (error as any).error_code ?? "";

  // Supabase-specific error codes
  switch (errorCode) {
    case "unexpected_failure":
      return "The authentication service is temporarily unavailable. Please try again in a few minutes.";
    case "email_address_invalid":
      return "Please enter a valid email address.";
    case "invalid_credentials":
      return "Invalid email or password. Please check your credentials and try again.";
    case "user_already_exists":
      return "An account with this email already exists. Try signing in instead.";
    case "weak_password":
      return "Password is too weak. Please use at least 8 characters with a mix of letters and numbers.";
    case "email_not_confirmed":
      return "Please check your email and click the confirmation link before signing in.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a few minutes before trying again.";
    case "signup_disabled":
      return "New account registration is currently disabled.";
    case "user_not_found":
      return "No account found with this email. Please create an account first.";
    case "bad_json":
    case "validation_failed":
      return "Invalid request. Please check your input and try again.";
  }

  // Fallback: match on message text
  if (code.includes("invalid login")) return "Invalid email or password.";
  if (code.includes("email not confirmed")) return "Please confirm your email before signing in.";
  if (code.includes("rate limit") || code.includes("too many")) return "Too many attempts. Please wait a few minutes.";
  if (code.includes("already registered") || code.includes("already exists")) return "An account with this email already exists.";
  if (code.includes("network") || code.includes("fetch")) return "Network error. Please check your internet connection.";

  // Last resort: use the original message but clean it up
  return error.message || "An unexpected error occurred. Please try again.";
}

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
      if (error) {
        console.error("[Auth] signInWithPassword failed:", error.message, error);
        throw new Error(friendlyAuthError(error));
      }
    },
    []
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) {
        console.error("[Auth] signUp failed:", error.message, error);
        throw new Error(friendlyAuthError(error));
      }
      // Supabase returns a user with identities=[] when signup is disabled or user exists with unconfirmed email
      if (data.user && data.user.identities?.length === 0) {
        throw new Error("An account with this email already exists. Try signing in instead.");
      }
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
    if (error) {
      console.error("[Auth] Google OAuth failed:", error.message, error);
      throw new Error(friendlyAuthError(error));
    }
  }, []);

  const loginWithFacebook = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      console.error("[Auth] Facebook OAuth failed:", error.message, error);
      throw new Error(friendlyAuthError(error));
    }
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
