import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { supabaseAdmin } from "../lib/supabase";
import { getUserBySupabaseId } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /** UUID from verified Supabase JWT. Populated even when no users row exists yet
   *  (new user, pre-syncUser). Null if no token or token is invalid/expired. */
  supabaseUid: string | null;
  /** Full users row from our database. Null if not yet synced via auth.syncUser. */
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const base = { req: opts.req, res: opts.res };
  const authHeader = opts.req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return { ...base, supabaseUid: null, user: null };
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const {
      data: { user: supabaseUser },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !supabaseUser) {
      if (error) {
        console.warn("[Auth context] Token verification failed:", error.message, `(code: ${(error as any).code || "unknown"})`);
      }
      return { ...base, supabaseUid: null, user: null };
    }

    const user = await getUserBySupabaseId(supabaseUser.id);

    return {
      ...base,
      supabaseUid: supabaseUser.id,
      user, // may be null on first login before syncUser runs
    };
  } catch (err) {
    // Never throw — auth failure = unauthenticated, not a 500
    console.error("[Auth context] Unexpected error during token verification:", err);
    return { ...base, supabaseUid: null, user: null };
  }
}
