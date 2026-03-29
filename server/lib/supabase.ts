import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — auth will not work"
  );
}

/**
 * Service-role Supabase client for server use only.
 * Bypasses Row Level Security — NEVER send to the browser.
 */
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
