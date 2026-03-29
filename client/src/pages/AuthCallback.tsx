import { useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

/**
 * Handles the OAuth redirect after Google/Facebook login.
 * Supabase sends the user here with a `code` param; we exchange it for a session.
 * After exchange, onAuthStateChange fires SIGNED_IN → syncUser runs automatically.
 */
export default function AuthCallback() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");

    if (!code) {
      // No code — redirect to home (may already be authenticated via PKCE)
      setLocation("/");
      return;
    }

    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          console.error("[AuthCallback] Failed to exchange code:", error.message);
          setLocation("/?error=oauth_failed");
        } else {
          setLocation("/");
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground text-sm">Signing you in…</p>
      </div>
    </div>
  );
}
