import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

/**
 * Handles the OAuth redirect after Google/Facebook login.
 *
 * With implicit flow, Supabase redirects here with tokens in the URL hash.
 * The Supabase client (detectSessionInUrl: true) automatically picks them up
 * and fires onAuthStateChange → syncUser runs automatically.
 *
 * With PKCE flow, a `code` query param is present and must be exchanged.
 */
export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for error in URL params
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get("error");
    const urlErrorDesc = params.get("error_description");
    if (urlError) {
      console.error("[AuthCallback] OAuth error:", urlError, urlErrorDesc);
      setError(urlErrorDesc || urlError);
      return;
    }

    // Check for PKCE code (fallback)
    const code = params.get("code");
    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error: exchangeError }) => {
          if (exchangeError) {
            console.error("[AuthCallback] Code exchange failed:", exchangeError.message);
            setError(exchangeError.message);
          } else {
            setTimeout(() => setLocation("/"), 100);
          }
        });
      return;
    }

    // Implicit flow: tokens are in the hash fragment.
    // detectSessionInUrl handles them automatically.
    // Wait for the session to appear, then redirect home.
    const checkSession = () => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setLocation("/");
        } else {
          // Give Supabase a moment to process the hash tokens
          setTimeout(checkSession, 200);
        }
      });
    };

    // Start checking after a brief delay for hash processing
    setTimeout(checkSession, 300);

    // Safety timeout — don't spin forever
    const timeout = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setLocation("/");
        } else {
          setError("Sign-in timed out. Please try again.");
        }
      });
    }, 8000);

    return () => clearTimeout(timeout);
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
