-- ============================================================
-- Row Level Security (RLS) Policies
-- Defense-in-depth: protects against accidental direct client
-- calls. All server access uses service_role (bypasses RLS).
-- Apply with: psql $SUPABASE_DATABASE_URL -f drizzle/rls.sql
-- ============================================================

-- ── purchases ────────────────────────────────────────────────
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Users access only their own rows
-- supabaseId UNIQUE index makes this subquery O(1)
CREATE POLICY "users_own_purchases" ON purchases
  FOR ALL
  USING (
    "userId" = (
      SELECT id FROM users WHERE "supabaseId" = auth.uid()
    )
  );

-- Admins can read all rows (coexists with above via OR logic)
CREATE POLICY "admin_read_purchases" ON purchases
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE "supabaseId" = auth.uid() AND role = 'admin'
    )
  );

-- ── bookings ─────────────────────────────────────────────────
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_bookings" ON bookings
  FOR ALL
  USING (
    "userId" = (
      SELECT id FROM users WHERE "supabaseId" = auth.uid()
    )
  );

CREATE POLICY "admin_read_bookings" ON bookings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE "supabaseId" = auth.uid() AND role = 'admin'
    )
  );

-- ── user_lesson_progress ─────────────────────────────────────
ALTER TABLE user_lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_progress" ON user_lesson_progress
  FOR ALL
  USING (
    "userId" = (
      SELECT id FROM users WHERE "supabaseId" = auth.uid()
    )
  );

CREATE POLICY "admin_read_progress" ON user_lesson_progress
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE "supabaseId" = auth.uid() AND role = 'admin'
    )
  );

-- ── messages ─────────────────────────────────────────────────
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages sent to them
CREATE POLICY "users_receive_messages" ON messages
  FOR SELECT
  USING (
    "toUserId" = (
      SELECT id FROM users WHERE "supabaseId" = auth.uid()
    )
  );

-- Admins can read and write all messages
CREATE POLICY "admin_all_messages" ON messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE "supabaseId" = auth.uid() AND role = 'admin'
    )
  );

-- ── chatMessages ─────────────────────────────────────────────
ALTER TABLE "chatMessages" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_chat" ON "chatMessages"
  FOR ALL
  USING (
    "userId" IS NULL OR
    "userId" = (
      SELECT id FROM users WHERE "supabaseId" = auth.uid()
    )
  );

CREATE POLICY "admin_read_chat" ON "chatMessages"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE "supabaseId" = auth.uid() AND role = 'admin'
    )
  );

-- ── user_course_enrollments ──────────────────────────────────
ALTER TABLE user_course_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_enrollments" ON user_course_enrollments
  FOR ALL
  USING (
    "userId" = (
      SELECT id FROM users WHERE "supabaseId" = auth.uid()
    )
  );

CREATE POLICY "admin_read_enrollments" ON user_course_enrollments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE "supabaseId" = auth.uid() AND role = 'admin'
    )
  );

-- ── discountUsage ────────────────────────────────────────────
ALTER TABLE "discountUsage" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_discount_usage" ON "discountUsage"
  FOR ALL
  USING (
    "userId" = (
      SELECT id FROM users WHERE "supabaseId" = auth.uid()
    )
  );

CREATE POLICY "admin_read_discount_usage" ON "discountUsage"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE "supabaseId" = auth.uid() AND role = 'admin'
    )
  );

-- ── popup_interactions ───────────────────────────────────────
ALTER TABLE popup_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_popup_interactions" ON popup_interactions
  FOR ALL
  USING (
    "userId" IS NULL OR
    "userId" = (
      SELECT id FROM users WHERE "supabaseId" = auth.uid()
    )
  );
