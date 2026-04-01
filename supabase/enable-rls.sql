-- ============================================================================
-- CRITICAL SECURITY FIX: Enable Row Level Security on ALL tables
-- ============================================================================
-- Without RLS, anyone with the Supabase anon key (exposed in frontend JS)
-- can directly read/write ALL data via the PostgREST API.
--
-- Our app accesses the DB exclusively through the server using the
-- service_role key (which bypasses RLS). So we:
-- 1. Enable RLS on every table (blocks all access by default)
-- 2. Add a permissive policy for service_role (server keeps working)
-- 3. No anon/authenticated policies (blocks direct client-side access)
-- ============================================================================

-- Helper: create a "service_role can do everything" policy on a table
-- We use a function to avoid repeating the same policy 22 times

-- ── Enable RLS on all application tables ──

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "siteSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chatMessages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "availabilitySlots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "testimonials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "popup_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "popup_interactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "section_headings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "page_analytics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_course_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course_modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course_lessons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_lesson_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visual_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discountCodes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discountUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessionDiscountCodes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "live_sessions" ENABLE ROW LEVEL SECURITY;

-- ── Create permissive policies for service_role ──
-- The service_role key (used by our server) bypasses RLS automatically,
-- so these policies are technically redundant but added as defense-in-depth.

-- Drop existing policies first (in case this script is run multiple times)
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'users', 'courses', 'purchases', 'siteSettings', 'chatMessages',
    'availabilitySlots', 'bookings', 'testimonials', 'popup_settings',
    'popup_interactions', 'section_headings', 'page_analytics',
    'user_course_enrollments', 'course_modules', 'course_lessons',
    'user_lesson_progress', 'visual_settings', 'messages',
    'discountCodes', 'discountUsage', 'sessionDiscountCodes', 'live_sessions'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Drop old policy if it exists
    EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON %I', tbl);
    -- Create new policy: service_role can do everything
    EXECUTE format(
      'CREATE POLICY "service_role_all" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;

-- ============================================================================
-- VERIFICATION: After running this, test that:
-- 1. The app still works (server uses service_role, bypasses RLS)
-- 2. Direct Supabase REST API calls with anon key return empty/forbidden
--
-- Test command (should return empty array, not data):
-- curl "https://<project>.supabase.co/rest/v1/users?select=*" \
--   -H "apikey: <anon_key>" \
--   -H "Authorization: Bearer <anon_key>"
-- ============================================================================
