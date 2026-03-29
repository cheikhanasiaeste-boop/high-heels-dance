# Supabase Migration Design Spec
**Date:** 2026-03-29
**Status:** Approved
**Approach:** Option A — Integer PKs + supabaseId UUID column

---

## 1. Goal

Migrate the project from:
- Custom session cookie auth (Manus SDK + scrypt password hashing + manual Google/Facebook OAuth routes)
- MySQL database with Drizzle ORM (mysql-core)

To:
- **Supabase Auth** for all identity (email/password, Google OAuth, Facebook OAuth)
- **Supabase Postgres** as the database
- **Drizzle ORM** with pg-core dialect
- tRPC context resolves internal user via Supabase JWT verification

All existing functionality must be preserved: membership, Stripe, Zoom, S3, admin dashboard, AI chat, bookings, testimonials, course access control.

---

## 2. Constraints

- **Fresh start** — no data migration. Schema is recreated in Supabase Postgres.
- **Integer PKs kept** — `users.id` stays as `serial` integer. All FK relationships (`userId int`) in other tables are unchanged.
- **`supabaseId uuid`** — new column added to `users` table; links to `auth.users(id)`.
- tRPC router logic (`ctx.user.id` integer) is **unchanged** across all routers.
- `useAuth` public interface (`user`, `isAuthenticated`, `loading`, `logout`, `refresh`) must remain compatible with existing component usage.

---

## 3. Architecture

```
BROWSER
├── @supabase/supabase-js client (singleton: client/src/lib/supabase.ts)
├── useAuth hook
│   ├── supabase.auth.onAuthStateChange → reactive session state
│   ├── on SIGNED_IN: calls trpc.auth.syncUser (provisions/links DB row)
│   └── exposes: { user, isAuthenticated, loading, logout, refresh,
│                  loginWithEmail, signUp, loginWithGoogle, loginWithFacebook }
└── tRPC httpBatchLink
    └── headers(): reads supabase.auth.getSession() → Authorization: Bearer <token>

EXPRESS SERVER
├── createContext(req)
│   ├── reads Authorization: Bearer <token> header
│   ├── supabaseAdmin.auth.getUser(token) → { supabase_uid: UUID }
│   ├── db.getUserBySupabaseId(uuid) → User (integer PK)
│   └── ctx.user = full User row (id, role, membership, stripeSubscriptionId, etc.)
└── tRPC routers — logic unchanged, all use ctx.user.id (integer)

SUPABASE
├── auth.users  — identity (UUID, email, hashed password, OAuth identities)
└── public.*    — all business tables (managed by Drizzle)
```

---

## 4. Database Schema Changes

### 4.1 Drizzle Config (`drizzle.config.ts`)
- `dialect: "mysql"` → `dialect: "postgresql"`
- `dbCredentials` uses `url` from `SUPABASE_DATABASE_URL` (direct connection string from Supabase dashboard)

### 4.2 Schema imports (`drizzle/schema.ts`)
- Replace `drizzle-orm/mysql-core` → `drizzle-orm/pg-core`
- Replace all `mysqlTable` → `pgTable`
- Replace all `mysqlEnum(col, [...])` → `text(col)` (enums enforced at app level via Zod)
- Replace `int().autoincrement()` → `serial()` on all PK columns
- Replace `decimal(col, {...})` → `numeric(col, {...})`
- Remove `.onUpdateNow()` — not available in pg-core; use `.$onUpdate(() => new Date())` on `updatedAt` columns
- `boolean`, `varchar`, `text`, `timestamp` — identical between dialects ✅

### 4.3 `users` table changes
Remove:
- `openId varchar(64)` — Supabase owns identity
- `passwordHash text` — Supabase handles passwords
- `loginMethod varchar(64)` — Supabase tracks in `auth.identities`

Add:
- `supabaseId uuid("supabaseId").unique().notNull()` — FK to `auth.users(id)`

All other columns unchanged: `id`, `name`, `email`, `role`, `hasSeenWelcome`, `lastViewedByAdmin`, `membershipStatus`, `membershipStartDate`, `membershipEndDate`, `stripeSubscriptionId`, `createdAt`, `updatedAt`, `lastSignedIn`.

### 4.4 All other tables
Only type-level changes (mysql-core → pg-core). No structural changes. All `userId int` FK columns stay as-is.

---

## 5. Auth Flow

### 5.1 Email + Password

**Sign up:**
```
client: supabase.auth.signUp({ email, password, options: { data: { name } } })
→ Supabase sends confirmation email
→ user clicks link → Supabase confirms → onAuthStateChange(SIGNED_IN)
→ client calls trpc.auth.syncUser({ name, email })
→ server upserts users row with supabaseId
```

**Sign in:**
```
client: supabase.auth.signInWithPassword({ email, password })
→ onAuthStateChange(SIGNED_IN)
→ client calls trpc.auth.syncUser({ name, email })
```

### 5.2 Google / Facebook OAuth

```
client: supabase.auth.signInWithOAuth({
  provider: 'google' | 'facebook',
  options: { redirectTo: window.location.origin + '/auth/callback' }
})
→ Supabase redirects to provider → provider redirects to /auth/callback
→ /auth/callback page: supabase.auth.exchangeCodeForSession(urlCode)
→ session established → onAuthStateChange(SIGNED_IN)
→ client calls trpc.auth.syncUser({ name, email })
```

### 5.3 Account Linking (email collision)

Two-layer approach:
1. **Supabase setting**: Enable "Link accounts with the same email" in Supabase Dashboard → Auth → Settings. Supabase merges `auth.identities` under one `auth.users` row automatically.
2. **`auth.syncUser` safety net** (server-side):
   - Look up `users` by `supabaseId` → found → return (normal path)
   - Not found → look up `users` by `email` → found → UPDATE `supabaseId = uuid` (links existing account)
   - Not found by email → INSERT new `users` row

### 5.4 `auth.syncUser` tRPC mutation

```ts
// Input: { name: string, email: string }
// Auth: public procedure (uses supabase_uid from context, not ctx.user)
// Context: createContext always resolves supabase_uid even if users row missing
// Returns: full User row
```

Context must be updated to carry `supabaseUid: string | null` in addition to `user: User | null`, so `syncUser` can provision the row before the user exists in the DB.

### 5.5 Sign out

```
client: supabase.auth.signOut()
→ onAuthStateChange(SIGNED_OUT)
→ useAuth clears local user state
→ tRPC cache invalidated
```
No server-side logout mutation needed — token is invalidated by Supabase.

---

## 6. tRPC Context

### 6.1 Updated `TrpcContext` type
```ts
type TrpcContext = {
  req: Request;
  res: Response;
  supabaseUid: string | null;   // UUID from verified JWT (always present if token valid)
  user: User | null;             // full users row (null if not yet synced)
};
```

### 6.2 `createContext` logic
```
1. Read Authorization: Bearer <token> from req.headers
2. If no token → { supabaseUid: null, user: null }
3. supabaseAdmin.auth.getUser(token) → { data: { user: { id: uuid } } }
4. db.getUserBySupabaseId(uuid) → User | null
5. return { supabaseUid: uuid, user }
```

### 6.3 Server-side Supabase client (`server/lib/supabase.ts`)
```ts
import { createClient } from '@supabase/supabase-js';
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
```
Service role key — never sent to the browser.

---

## 7. Frontend Auth Hook (`useAuth.ts`)

### 7.1 Supabase client singleton (`client/src/lib/supabase.ts`)
```ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

### 7.2 `useAuth` public interface (unchanged for consumers)
```ts
{
  user: User | null,          // full internal user from trpc.auth.me
  isAuthenticated: boolean,
  loading: boolean,
  error: Error | null,
  logout: () => Promise<void>,
  refresh: () => void,
  // New additions (previously only available via redirect):
  loginWithEmail: (email, password) => Promise<void>,
  signUp: (name, email, password) => Promise<void>,
  loginWithGoogle: () => Promise<void>,
  loginWithFacebook: () => Promise<void>,
}
```

### 7.3 Internal state sources
- `supabase.auth.getSession()` — initial session on mount
- `supabase.auth.onAuthStateChange()` — live updates (sign in, sign out, token refresh)
- `trpc.auth.me` — full internal user row (role, membership, etc.), keyed off `isAuthenticated`
- On `SIGNED_IN` event: call `trpc.auth.syncUser` then invalidate `auth.me`

### 7.4 tRPC `httpBatchLink` headers
```ts
headers: async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}
```

---

## 8. OAuth Callback Page (`/auth/callback`)

New route: `client/src/pages/AuthCallback.tsx`

```
On mount:
1. Extract `code` from URL search params
2. Call supabase.auth.exchangeCodeForSession(code)
3. On success → navigate to '/'
4. On error → navigate to '/login?error=oauth_failed'
```

React Router route added in `App.tsx` (or wherever routes are defined).

---

## 9. RLS Policies

Applied via a SQL file (`drizzle/rls.sql`) run once after schema creation.

RLS is defense-in-depth — all server access uses service role (bypasses RLS). Policies protect against accidental direct Supabase client calls.

**Pattern for user-scoped tables** (purchases, bookings, userLessonProgress, messages, chatMessages, userCourseEnrollments):
```sql
-- Enable RLS
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Users can access their own rows (join via supabaseId → integer userId)
CREATE POLICY "users_own_purchases" ON purchases
  FOR ALL USING (
    user_id = (SELECT id FROM users WHERE "supabaseId" = auth.uid())
  );
```

**Admin bypass** (for tables where admins need full read access):
```sql
CREATE POLICY "admin_full_access" ON purchases
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE "supabaseId" = auth.uid() AND role = 'admin'
    )
  );
```

Tables with RLS enabled: `purchases`, `bookings`, `user_lesson_progress`, `messages`, `chat_messages`, `user_course_enrollments`, `discount_usage`, `popup_interactions`.

Public read-only tables (no RLS needed): `courses`, `course_modules`, `course_lessons`, `testimonials` (approved), `site_settings`, `section_headings`, `visual_settings`, `availability_slots`.

---

## 10. Environment Variables

### Server (`.env`)
```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>          # server only, never in browser
SUPABASE_DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

### Client (`.env` with `VITE_` prefix)
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>                    # safe to expose
```

### Remove
```
VITE_OAUTH_PORTAL_URL   (Manus OAuth portal)
VITE_APP_ID             (Manus app ID)
GOOGLE_CLIENT_ID        (now configured in Supabase dashboard)
GOOGLE_CLIENT_SECRET    (now configured in Supabase dashboard)
FACEBOOK_APP_ID         (now configured in Supabase dashboard)
FACEBOOK_APP_SECRET     (now configured in Supabase dashboard)
```
Google/Facebook credentials are entered directly in Supabase Dashboard → Auth → Providers. They never touch your server code.

---

## 11. Files Changed

| File | Action |
|---|---|
| `drizzle.config.ts` | Change dialect: mysql → postgresql |
| `drizzle/schema.ts` | Full rewrite: mysql-core → pg-core; `users` table changes |
| `server/db.ts` | Change driver: mysql2 → postgres-js |
| `server/_core/context.ts` | Replace sdk auth with Supabase JWT verification; add `supabaseUid` to context |
| `server/_core/trpc.ts` | Add `supabaseUid` to context type for `syncUser` procedure |
| `server/lib/supabase.ts` | **New** — `supabaseAdmin` service role client |
| `server/routers.ts` | Remove register/login/logout/password handlers; add `auth.syncUser` |
| `server/_core/sdk.ts` | **Delete** |
| `server/_core/oauth.ts` | **Delete** |
| `server/_core/cookies.ts` | **Delete** |
| `client/src/lib/supabase.ts` | **New** — browser Supabase client singleton |
| `client/src/main.tsx` | Add `headers()` to `httpBatchLink` for Supabase JWT |
| `client/src/_core/hooks/useAuth.ts` | Full rewrite — Supabase client auth state |
| `client/src/const.ts` | Remove `getLoginUrl` |
| `client/src/pages/AuthCallback.tsx` | **New** — OAuth callback handler |
| `drizzle/rls.sql` | **New** — RLS policy definitions |
| `.env.example` | Update env vars |

---

## 12. Supabase Dashboard Setup Steps

1. Create new Supabase project
2. **Auth → Settings**:
   - Enable "Confirm email" for email/password
   - Enable "Link accounts with the same email" (automatic identity linking)
   - Set Site URL to your production domain
   - Add `http://localhost:5173/auth/callback` and `https://<domain>/auth/callback` to "Redirect URLs"
3. **Auth → Providers → Google**:
   - Enter Google Client ID + Secret (from Google Cloud Console)
   - Copy the Supabase callback URL → paste into Google OAuth app as Authorized redirect URI
4. **Auth → Providers → Facebook**:
   - Enter Facebook App ID + Secret (from Meta Developer Console)
   - Copy the Supabase callback URL → paste into Facebook app as Valid OAuth redirect URI
5. **Project Settings → Database**: copy "Connection string" (direct) → `SUPABASE_DATABASE_URL`
6. **Project Settings → API**: copy URL → `SUPABASE_URL` / `VITE_SUPABASE_URL`, copy `anon` key → `VITE_SUPABASE_ANON_KEY`, copy `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## 13. Migration Commands

```bash
# 1. Install new dependencies
npm install @supabase/supabase-js drizzle-orm/pg-core postgres

# 2. Remove old dependencies
npm uninstall mysql2

# 3. Generate Postgres migration from updated schema
npx drizzle-kit generate

# 4. Push schema to Supabase Postgres
npx drizzle-kit push

# 5. Apply RLS policies
psql $SUPABASE_DATABASE_URL -f drizzle/rls.sql
```

---

## 14. Testing Checklist

- [ ] Email signup → confirmation email received → link clicked → redirected to app → `syncUser` creates users row → `auth.me` returns user
- [ ] Email sign in (confirmed account) → session established → `auth.me` returns user with correct role/membership
- [ ] Google OAuth → `/auth/callback` processes code → session established → `syncUser` links/creates users row
- [ ] Facebook OAuth → same as Google
- [ ] Email + Google same email → Google login links to existing account → same `users.id` returned
- [ ] Logout → session cleared → `auth.me` returns null → protected routes redirect
- [ ] `protectedProcedure` rejects request with no/invalid JWT → 401
- [ ] `adminProcedure` rejects non-admin user → 403
- [ ] Admin user can access admin dashboard
- [ ] Free course accessible without login
- [ ] Paid course blocked for unauthenticated user
- [ ] Paid course accessible after purchase or active membership
- [ ] Stripe webhook updates membership → `auth.me` reflects new status
- [ ] Zoom, S3, AI chat still work (these don't touch auth layer)
