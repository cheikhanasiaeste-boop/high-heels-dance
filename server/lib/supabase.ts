import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    "[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — auth will not work"
  );
}

/**
 * Service-role Supabase client for server use only.
 * Bypasses Row Level Security — NEVER send to the browser.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Verify Supabase auth is reachable on startup.
 * Logs a clear message so you know immediately if auth will work.
 */
export async function checkSupabaseHealth(): Promise<void> {
  if (!supabaseUrl || !serviceRoleKey) return;

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: serviceRoleKey },
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`[Supabase] Auth service connected (GoTrue ${data.version})`);
    } else {
      console.error(`[Supabase] Auth health check failed: HTTP ${res.status}`);
    }
  } catch (err) {
    console.error("[Supabase] Cannot reach auth service:", err);
  }
}

/**
 * Ensure the ADMIN_EMAIL has a Supabase Auth account.
 * Creates one with a temporary password if it doesn't exist.
 * Runs once at server startup — safe to call multiple times.
 */
export async function ensureAdminUser(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || !supabaseUrl || !serviceRoleKey) return;

  try {
    // Check if this email already exists in Supabase Auth
    const { data: listData, error: listError } =
      await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });

    if (listError) {
      console.error("[Supabase] Failed to list auth users:", listError.message);
      return;
    }

    const existingUser = listData.users.find(
      (u) => u.email === adminEmail
    );

    if (existingUser) {
      console.log(`[Supabase] Admin auth account already exists for ${adminEmail}`);
      return;
    }

    // Generate a temporary password
    const { randomBytes } = await import("node:crypto");
    const tempPassword = randomBytes(16).toString("base64url");

    // Create the admin user with email auto-confirmed
    const { data: createData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name: "Admin" },
      });

    if (createError) {
      console.error("[Supabase] Failed to create admin user:", createError.message);
      return;
    }

    console.log(`[Supabase] ✓ Admin user created for ${adminEmail}`);
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Supabase]   Temporary password: ${tempPassword}`);
    } else {
      console.log(`[Supabase]   Temporary password set (hidden in production logs). Use 'Forgot Password' to reset.`);
    }
    console.log(`[Supabase]   Supabase Auth ID: ${createData.user.id}`);

    // Clean up orphan test users created during debugging
    const orphans = listData.users.filter(
      (u) => u.email !== adminEmail && u.email?.includes("testuser12345")
    );
    for (const orphan of orphans) {
      await supabaseAdmin.auth.admin.deleteUser(orphan.id);
      console.log(`[Supabase] Cleaned up test user: ${orphan.email}`);
    }
  } catch (err) {
    console.error("[Supabase] Error in ensureAdminUser:", err);
  }
}
