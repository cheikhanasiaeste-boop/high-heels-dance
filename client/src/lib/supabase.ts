import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set — auth will not work"
  );
}

/**
 * Browser-safe Supabase client.
 * Uses the public anon key — safe to expose.
 * Import this wherever you need auth state or Supabase queries on the client.
 */
export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");
