import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

/**
 * Handles the OAuth redirect after Google/Facebook login.
 * Supabase sends the user here with a `code` param; we exchange it for a session.
 * After exchange, onAuthStateChange fires SIGNED_IN → syncUser runs automatically.
 */
export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    // Check for error in URL (Supabase may redirect with error params)
    const urlError = params.get("error");
    const urlErrorDesc = params.get("error_description");
    if (urlError) {
      console.error("[AuthCallback] OAuth error:", urlError, urlErrorDesc);
      setError(urlErrorDesc || urlError);
      return;
    }

    if (!code) {
      // No code — check if Supabase already picked up the session from URL hash
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setLocation("/");
        } else {
          // No code and no session — just go home
          setLocation("/");
        }
      });
      return;
    }

    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ data, error: exchangeError }) => {
        if (exchangeError) {
          console.error("[AuthCallback] Failed to exchange code:", exchangeError.message, exchangeError);
          setError(exchangeError.message);
        } else if (data.session) {
          // Session established — wait briefly for localStorage to persist
          setTimeout(() => setLocation("/"), 100);
        } else {
          setLocation("/");
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md px-6">
          <p className="text-destructive font-medium mb-2">Sign-in failed</p>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          <button
            onClick={() => setLocation("/")}
            className="text-sm text-primary underline hover:no-underline"
          >
            Return to home page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground text-sm">Signing you in...</p>
      </div>
    </div>
  );
}
