# Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the project from MySQL + custom session cookie auth to Supabase Postgres + Supabase Auth, keeping integer PKs and all existing tRPC router logic intact.

**Architecture:** Supabase Auth owns identity (email/password, Google, Facebook OAuth). A `supabaseId uuid` column links `auth.users` to the existing `users` table (integer PK). The tRPC server verifies Supabase JWTs via service role key, resolves the internal `User` row, and injects it into `ctx.user` — all existing routers remain unchanged.

**Tech Stack:** `@supabase/supabase-js`, `postgres` (postgres-js Drizzle driver), `drizzle-orm` pg-core, tRPC v11, React + wouter

**Spec:** `docs/superpowers/specs/2026-03-29-supabase-migration-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Modify | Add `@supabase/supabase-js`, `postgres`; remove `mysql2` |
| `.env.example` | Modify | Supabase env vars; remove Manus/MySQL vars |
| `server/_core/env.ts` | Modify | Replace Manus vars with Supabase vars |
| `drizzle.config.ts` | Modify | MySQL → PostgreSQL dialect |
| `drizzle/schema.ts` | Rewrite | mysql-core → pg-core; `users` table drops openId/passwordHash/loginMethod, adds `supabaseId uuid` |
| `server/lib/supabase.ts` | Create | `supabaseAdmin` service-role client (server only) |
| `server/db.ts` | Modify | postgres-js driver; add `getUserBySupabaseId`, `syncUser`; remove `getUserByOpenId`, `upsertUser` |
| `server/_core/context.ts` | Rewrite | JWT verification via supabaseAdmin; expose `supabaseUid` + `user` |
| `server/routers.ts` | Modify | Remove `register`, `emailSignIn`, `logout`; add `auth.syncUser` |
| `server/_core/sdk.ts` | Delete | Entire Manus SDK — replaced by Supabase |
| `server/_core/oauth.ts` | Delete | Custom OAuth Express routes — replaced by Supabase |
| `server/_core/cookies.ts` | Delete | Session cookie helpers — no longer needed |
| `client/src/lib/supabase.ts` | Create | Browser Supabase client singleton |
| `client/src/main.tsx` | Modify | Add `Authorization: Bearer` header to tRPC `httpBatchLink` |
| `client/src/_core/hooks/useAuth.ts` | Rewrite | Supabase `onAuthStateChange` + tRPC `auth.me` |
| `client/src/pages/AuthCallback.tsx` | Create | Handles OAuth redirect, calls `exchangeCodeForSession` |
| `client/src/App.tsx` | Modify | Add `/auth/callback` route |
| `client/src/components/AuthModal.tsx` | Rewrite | Use `useAuth` methods instead of tRPC `emailSignIn`/`register` |
| `client/src/const.ts` | Modify | Remove `getLoginUrl` |
| `client/src/components/DashboardLayout.tsx` | Modify | Replace `getLoginUrl()` nav with `useAuth` state check |
| `client/src/pages/MyCourses.tsx` | Modify | Replace `getLoginUrl()` redirect |
| `client/src/pages/Feedback.tsx` | Modify | Replace `getLoginUrl()` redirect |
| `client/src/pages/MyMessages.tsx` | Modify | Replace `getLoginUrl()` redirect |
| `client/src/pages/Admin.tsx` | Modify | Remove unused `getLoginUrl` import |
| `server/welcome.test.ts` | Modify | Update test to use `syncUser` instead of `upsertUser`/`getUserByOpenId` |
| `drizzle/rls.sql` | Create | Row Level Security policies |

---

## Task 1: Install and Remove Dependencies

**Files:**
- Modify: `package.json` (via npm commands)

- [ ] **Step 1: Install Supabase client and postgres-js driver**

```bash
cd "/Users/anas/Desktop/High Heels Platform/high-heels-dance"
npm install @supabase/supabase-js postgres
```

Expected: Both packages appear in `package.json` dependencies.

- [ ] **Step 2: Remove mysql2**

```bash
npm uninstall mysql2
```

Expected: `mysql2` removed from `package.json`. `node_modules/mysql2` gone.

- [ ] **Step 3: Verify no TypeScript errors from the removal**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: Errors about `drizzle-orm/mysql2` and mysql schema imports — these are expected and will be fixed in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: swap mysql2 for postgres + add @supabase/supabase-js"
```

---

## Task 2: Update Environment Variables

**Files:**
- Modify: `server/_core/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Rewrite `server/_core/env.ts`**

Replace the entire file with:

```ts
export const ENV = {
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  supabaseDatabaseUrl: process.env.SUPABASE_DATABASE_URL ?? "",
  adminEmail: process.env.ADMIN_EMAIL ?? "", // email address that gets admin role on first sync
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
```

- [ ] **Step 2: Update `.env.example`**

Replace the entire file with:

```
# ── Supabase ─────────────────────────────────────────────────────────────────
# Get these from: Supabase Dashboard → Project Settings → API
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>    # Server only — never expose to browser
SUPABASE_DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres

# ── Supabase (browser — VITE_ prefix required) ────────────────────────────────
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>               # Safe to expose — this is the public key

# ── Admin ────────────────────────────────────────────────────────────────────
ADMIN_EMAIL=your-admin-email@example.com        # Gets role=admin on first syncUser call

# ── Stripe ───────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# ── AWS S3 ───────────────────────────────────────────────────────────────────
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_BUCKET_NAME=

# ── Zoom ─────────────────────────────────────────────────────────────────────
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=

# ── AI / LLM ─────────────────────────────────────────────────────────────────
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=

# ── Email (Resend) ────────────────────────────────────────────────────────────
RESEND_API_KEY=
```

- [ ] **Step 3: Commit**

```bash
git add server/_core/env.ts .env.example
git commit -m "chore: update env vars for Supabase (remove Manus/MySQL vars)"
```

---

## Task 3: Rewrite Drizzle Schema (mysql-core → pg-core)

**Files:**
- Rewrite: `drizzle/schema.ts`

- [ ] **Step 1: Replace the entire `drizzle/schema.ts`**

```ts
import {
  pgTable,
  serial,
  text,
  varchar,
  boolean,
  timestamp,
  numeric,
  integer,
  uuid,
  unique,
  index,
} from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * supabaseId links to auth.users(id) in Supabase — UUID assigned by Supabase Auth.
 * All other tables reference users.id (integer serial PK) — unchanged.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  supabaseId: uuid("supabaseId").unique().notNull(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  role: text("role").$type<"user" | "admin">().default("user").notNull(),
  hasSeenWelcome: boolean("hasSeenWelcome").default(false).notNull(),
  lastViewedByAdmin: timestamp("lastViewedByAdmin"),
  // Membership fields
  membershipStatus: text("membershipStatus").$type<"free" | "monthly" | "annual">().default("free").notNull(),
  membershipStartDate: timestamp("membershipStartDate"),
  membershipEndDate: timestamp("membershipEndDate"),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Courses table - stores all dance courses (free and paid)
 */
export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: numeric("originalPrice", { precision: 10, scale: 2 }),
  imageUrl: text("imageUrl"),
  imageKey: text("imageKey"),
  imageCropZoom: numeric("imageCropZoom", { precision: 5, scale: 2 }).default("1.00"),
  imageCropOffsetX: numeric("imageCropOffsetX", { precision: 5, scale: 2 }).default("0.00"),
  imageCropOffsetY: numeric("imageCropOffsetY", { precision: 5, scale: 2 }).default("0.00"),
  previewVideoUrl: text("previewVideoUrl"),
  previewVideoKey: text("previewVideoKey"),
  isFree: boolean("isFree").default(false).notNull(),
  isPublished: boolean("isPublished").default(true).notNull(),
  isTopPick: boolean("isTopPick").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Course = typeof courses.$inferSelect;
export type InsertCourse = typeof courses.$inferInsert;

/**
 * Purchases table - tracks which users have purchased which courses
 */
export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  courseId: integer("courseId").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  stripePaymentId: varchar("stripePaymentId", { length: 255 }),
  status: text("status").$type<"pending" | "completed" | "failed">().default("pending").notNull(),
  purchasedAt: timestamp("purchasedAt").defaultNow().notNull(),
  isCompleted: boolean("isCompleted").default(false).notNull(),
  completedAt: timestamp("completedAt"),
});

export type Purchase = typeof purchases.$inferSelect;
export type InsertPurchase = typeof purchases.$inferInsert;

/**
 * Site settings table - stores global site configuration
 */
export const siteSettings = pgTable("siteSettings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type SiteSetting = typeof siteSettings.$inferSelect;
export type InsertSiteSetting = typeof siteSettings.$inferInsert;

/**
 * Chat messages table - stores AI chat support history
 */
export const chatMessages = pgTable("chatMessages", {
  id: serial("id").primaryKey(),
  userId: integer("userId"),
  role: text("role").$type<"user" | "assistant">().notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

/**
 * Availability slots table - stores instructor's available time slots
 */
export const availabilitySlots = pgTable("availabilitySlots", {
  id: serial("id").primaryKey(),
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime").notNull(),
  eventType: text("eventType").$type<"online" | "in-person">().default("online").notNull(),
  location: text("location"),
  sessionLink: text("sessionLink"),
  meetLink: text("meetLink"),
  zoomMeetingId: varchar("zoomMeetingId", { length: 50 }),
  isFree: boolean("isFree").default(true).notNull(),
  price: varchar("price", { length: 20 }),
  title: varchar("title", { length: 200 }).default("One-on-One Dance Session").notNull(),
  description: text("description"),
  sessionType: text("sessionType").$type<"private" | "group">().default("private").notNull(),
  capacity: integer("capacity").default(1).notNull(),
  currentBookings: integer("currentBookings").default(0).notNull(),
  isBooked: boolean("isBooked").default(false).notNull(),
  status: text("status").$type<"draft" | "published">().default("published").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AvailabilitySlot = typeof availabilitySlots.$inferSelect;
export type InsertAvailabilitySlot = typeof availabilitySlots.$inferInsert;

/**
 * Bookings table - stores user session bookings
 */
export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  slotId: integer("slotId").notNull(),
  sessionType: varchar("sessionType", { length: 100 }).notNull(),
  meetLink: text("meetLink"),
  status: text("status").$type<"pending" | "confirmed" | "cancelled">().default("confirmed").notNull(),
  notes: text("notes"),
  paymentRequired: boolean("paymentRequired").default(false).notNull(),
  paymentStatus: text("paymentStatus").$type<"pending" | "completed" | "failed" | "not_required">().default("not_required").notNull(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  amountPaid: varchar("amountPaid", { length: 20 }),
  bookedAt: timestamp("bookedAt").defaultNow().notNull(),
});

export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;

/**
 * Testimonials table - stores user feedback and reviews
 */
export const testimonials = pgTable("testimonials", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  userEmail: varchar("userEmail", { length: 320 }),
  rating: integer("rating").notNull(),
  review: text("review").notNull(),
  photoUrl: text("photoUrl"),
  videoUrl: text("videoUrl"),
  type: text("type").$type<"session" | "course">().notNull(),
  relatedId: integer("relatedId"),
  status: text("status").$type<"pending" | "approved" | "rejected">().default("pending").notNull(),
  isFeatured: boolean("isFeatured").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Testimonial = typeof testimonials.$inferSelect;
export type InsertTestimonial = typeof testimonials.$inferInsert;

/**
 * Website popup settings
 */
export const popupSettings = pgTable("popup_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").default(false).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  imageUrl: varchar("imageUrl", { length: 500 }),
  buttonText: varchar("buttonText", { length: 100 }).default("Got it").notNull(),
  showEmailInput: boolean("showEmailInput").default(false).notNull(),
  emailPlaceholder: varchar("emailPlaceholder", { length: 255 }).default("Enter your email"),
  backgroundColor: varchar("backgroundColor", { length: 50 }).default("#ffffff"),
  textColor: varchar("textColor", { length: 50 }).default("#000000"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type PopupSettings = typeof popupSettings.$inferSelect;
export type InsertPopupSettings = typeof popupSettings.$inferInsert;

/**
 * Popup interactions - track which users have seen/dismissed the popup
 */
export const popupInteractions = pgTable("popup_interactions", {
  id: serial("id").primaryKey(),
  userId: integer("userId"),
  popupId: integer("popupId").notNull(),
  email: varchar("email", { length: 320 }),
  action: text("action").$type<"dismissed" | "email_submitted">().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PopupInteraction = typeof popupInteractions.$inferSelect;
export type InsertPopupInteraction = typeof popupInteractions.$inferInsert;

/**
 * Section headings - customizable headings for homepage sections
 */
export const sectionHeadings = pgTable("section_headings", {
  id: serial("id").primaryKey(),
  section: varchar("section", { length: 100 }).notNull().unique(),
  heading: varchar("heading", { length: 255 }).notNull(),
  subheading: text("subheading"),
  displayOrder: integer("displayOrder").default(0).notNull(),
  isVisible: boolean("isVisible").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type SectionHeading = typeof sectionHeadings.$inferSelect;
export type InsertSectionHeading = typeof sectionHeadings.$inferInsert;

/**
 * Page analytics table - tracks page views and visitor sessions
 */
export const pageAnalytics = pgTable("page_analytics", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 255 }).notNull(),
  visitorId: varchar("visitor_id", { length: 255 }).notNull(),
  pagePath: varchar("page_path", { length: 500 }).notNull(),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  entryTime: timestamp("entry_time").defaultNow().notNull(),
  exitTime: timestamp("exit_time"),
  duration: integer("duration"),
  isBounce: boolean("is_bounce").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PageAnalytics = typeof pageAnalytics.$inferSelect;
export type InsertPageAnalytics = typeof pageAnalytics.$inferInsert;

/**
 * User course enrollments
 */
export const userCourseEnrollments = pgTable("user_course_enrollments", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  courseId: integer("courseId").notNull(),
  enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
  enrolledBy: integer("enrolledBy"),
  status: text("status").$type<"active" | "completed" | "cancelled">().default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  uniqueEnrollment: unique().on(table.userId, table.courseId),
  userIdIdx: index("userId_idx").on(table.userId),
  courseIdIdx: index("courseId_idx").on(table.courseId),
}));

export type UserCourseEnrollment = typeof userCourseEnrollments.$inferSelect;
export type InsertUserCourseEnrollment = typeof userCourseEnrollments.$inferInsert;

/**
 * Course modules - organize lessons into modules/sections
 */
export const courseModules = pgTable("course_modules", {
  id: serial("id").primaryKey(),
  courseId: integer("courseId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  videoUrl: text("videoUrl"),
  videoKey: text("videoKey"),
  order: integer("order").notNull().default(0),
  isPublished: boolean("isPublished").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  courseIdIdx: index("module_courseId_idx").on(table.courseId),
  orderIdx: index("module_order_idx").on(table.courseId, table.order),
}));

export type CourseModule = typeof courseModules.$inferSelect;
export type InsertCourseModule = typeof courseModules.$inferInsert;

/**
 * Course lessons - individual lessons within modules
 */
export const courseLessons = pgTable("course_lessons", {
  id: serial("id").primaryKey(),
  moduleId: integer("moduleId").notNull(),
  courseId: integer("courseId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  videoUrl: text("videoUrl"),
  videoKey: text("videoKey"),
  duration: integer("duration"),
  content: text("content"),
  order: integer("order").notNull().default(0),
  isPublished: boolean("isPublished").default(true).notNull(),
  isFree: boolean("isFree").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  moduleIdIdx: index("lesson_moduleId_idx").on(table.moduleId),
  courseIdIdx: index("lesson_courseId_idx").on(table.courseId),
  orderIdx: index("lesson_order_idx").on(table.moduleId, table.order),
}));

export type CourseLesson = typeof courseLessons.$inferSelect;
export type InsertCourseLesson = typeof courseLessons.$inferInsert;

/**
 * User lesson progress - tracks which lessons users have completed
 */
export const userLessonProgress = pgTable("user_lesson_progress", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  lessonId: integer("lessonId").notNull(),
  courseId: integer("courseId").notNull(),
  isCompleted: boolean("isCompleted").default(false).notNull(),
  lastWatchedAt: timestamp("lastWatchedAt"),
  watchedDuration: integer("watchedDuration").default(0),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  uniqueProgress: unique().on(table.userId, table.lessonId),
  userIdIdx: index("progress_userId_idx").on(table.userId),
  lessonIdIdx: index("progress_lessonId_idx").on(table.lessonId),
  courseIdIdx: index("progress_courseId_idx").on(table.userId, table.courseId),
}));

export type UserLessonProgress = typeof userLessonProgress.$inferSelect;
export type InsertUserLessonProgress = typeof userLessonProgress.$inferInsert;

/**
 * Visual settings - stores visual customizations for the website
 */
export const visualSettings = pgTable("visual_settings", {
  id: serial("id").primaryKey(),
  heroBackgroundUrl: text("heroBackgroundUrl"),
  heroBackgroundKey: text("heroBackgroundKey"),
  heroBackgroundZoom: numeric("heroBackgroundZoom", { precision: 5, scale: 2 }).default("1.00"),
  heroBackgroundOffsetX: numeric("heroBackgroundOffsetX", { precision: 10, scale: 2 }).default("0.00"),
  heroBackgroundOffsetY: numeric("heroBackgroundOffsetY", { precision: 10, scale: 2 }).default("0.00"),
  logoUrl: text("logoUrl"),
  logoKey: text("logoKey"),
  logoZoom: numeric("logoZoom", { precision: 5, scale: 2 }).default("1.00"),
  logoOffsetX: numeric("logoOffsetX", { precision: 10, scale: 2 }).default("0.00"),
  logoOffsetY: numeric("logoOffsetY", { precision: 10, scale: 2 }).default("0.00"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  updatedBy: integer("updatedBy"),
});

export type VisualSettings = typeof visualSettings.$inferSelect;
export type InsertVisualSettings = typeof visualSettings.$inferInsert;

/**
 * Messages table - stores internal platform messages from admin to users
 */
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  fromUserId: integer("fromUserId").notNull(),
  toUserId: integer("toUserId").notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  toUserIdIdx: index("messages_toUserId_idx").on(table.toUserId),
  fromUserIdIdx: index("messages_fromUserId_idx").on(table.fromUserId),
}));

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * Discount codes table
 */
export const discountCodes = pgTable("discountCodes", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  description: text("description"),
  discountType: text("discountType").$type<"percentage" | "fixed">().notNull(),
  discountValue: numeric("discountValue", { precision: 10, scale: 2 }).notNull(),
  validFrom: timestamp("validFrom").notNull(),
  validTo: timestamp("validTo").notNull(),
  maxUses: integer("maxUses"),
  currentUses: integer("currentUses").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  applicableTo: text("applicableTo").$type<"all" | "subscriptions" | "courses">().default("all").notNull(),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  codeIdx: index("discountCodes_code_idx").on(table.code),
  createdByIdx: index("discountCodes_createdBy_idx").on(table.createdBy),
}));

export type DiscountCode = typeof discountCodes.$inferSelect;
export type InsertDiscountCode = typeof discountCodes.$inferInsert;

/**
 * Discount usage tracking
 */
export const discountUsage = pgTable("discountUsage", {
  id: serial("id").primaryKey(),
  discountCodeId: integer("discountCodeId").notNull().references(() => discountCodes.id),
  userId: integer("userId").notNull().references(() => users.id),
  usedAt: timestamp("usedAt").defaultNow().notNull(),
  discountAmount: numeric("discountAmount", { precision: 10, scale: 2 }).notNull(),
  originalAmount: numeric("originalAmount", { precision: 10, scale: 2 }).notNull(),
  finalAmount: numeric("finalAmount", { precision: 10, scale: 2 }).notNull(),
  transactionType: text("transactionType").$type<"subscription" | "course">().notNull(),
  transactionId: varchar("transactionId", { length: 255 }),
}, (table) => ({
  discountCodeIdIdx: index("discountUsage_discountCodeId_idx").on(table.discountCodeId),
  userIdIdx: index("discountUsage_userId_idx").on(table.userId),
}));

export type DiscountUsage = typeof discountUsage.$inferSelect;
export type InsertDiscountUsage = typeof discountUsage.$inferInsert;
```

- [ ] **Step 2: Update `drizzle.config.ts`**

Replace the entire file with:

```ts
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) {
  throw new Error("SUPABASE_DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add drizzle/schema.ts drizzle.config.ts
git commit -m "feat: migrate Drizzle schema from mysql-core to pg-core, add supabaseId to users"
```

---

## Task 4: Create Server Supabase Admin Client

**Files:**
- Create: `server/lib/supabase.ts`

- [ ] **Step 1: Create the directory and file**

Create `server/lib/supabase.ts`:

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add server/lib/supabase.ts
git commit -m "feat: add supabaseAdmin service-role client (server only)"
```

---

## Task 5: Update `server/db.ts` — Driver + Auth Functions

**Files:**
- Modify: `server/db.ts`

This task makes three precise changes to `server/db.ts`:
1. Swap the import from `drizzle-orm/mysql2` → `drizzle-orm/postgres-js`
2. Replace `getUserByOpenId` and `upsertUser` with `getUserBySupabaseId` and `syncUser`
3. Fix `onDuplicateKeyUpdate` → `onConflictDoUpdate` in any remaining upserts

- [ ] **Step 1: Update the driver import and `getDb()` at the top of `server/db.ts`**

Find and replace the import block at the top of `server/db.ts` (lines 1-3):

```ts
// OLD:
import { eq, and, desc, asc, isNull, gte, lte, or, like, inArray, ne, sql, SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// NEW — replace with:
import { eq, and, desc, asc, isNull, gte, lte, or, like, inArray, ne, sql, SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
```

Find and replace the `getDb()` function body:

```ts
// OLD:
let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// NEW:
let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.SUPABASE_DATABASE_URL) {
    try {
      const client = postgres(process.env.SUPABASE_DATABASE_URL);
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
```

- [ ] **Step 2: Replace `upsertUser` with `syncUser`, and replace `getUserByOpenId` with `getUserBySupabaseId`**

Find the `upsertUser` function (starts around line 63) and replace it entirely, and find `getUserByOpenId` and replace it:

```ts
// REMOVE the entire upsertUser function (it used openId + onDuplicateKeyUpdate)

// REMOVE getUserByOpenId function

// ADD these two functions in their place:

/**
 * Look up a user by their Supabase auth UUID.
 * Used in createContext on every tRPC request.
 */
export async function getUserBySupabaseId(supabaseId: string): Promise<User | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.supabaseId, supabaseId))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Provision or link a user row after Supabase Auth sign-in.
 * Called by auth.syncUser tRPC mutation on every SIGNED_IN event.
 *
 * Logic:
 *   1. User row exists with matching supabaseId → update lastSignedIn, return.
 *   2. User row exists with matching email but no supabaseId → link by setting supabaseId.
 *   3. Neither → insert new user row.
 *
 * This is the account-linking safety net on top of Supabase's own identity merging.
 */
export async function syncUser(params: {
  supabaseId: string;
  name: string | null;
  email: string | null;
}): Promise<User> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. Fast path: row already linked
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.supabaseId, params.supabaseId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(users)
      .set({ lastSignedIn: new Date() })
      .where(eq(users.supabaseId, params.supabaseId));
    return existing[0];
  }

  // 2. Email match: link existing account (account linking safety net)
  if (params.email) {
    const byEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, params.email))
      .limit(1);

    if (byEmail.length > 0) {
      await db
        .update(users)
        .set({ supabaseId: params.supabaseId, lastSignedIn: new Date() })
        .where(eq(users.id, byEmail[0].id));
      return { ...byEmail[0], supabaseId: params.supabaseId };
    }
  }

  // 3. New user: insert
  const adminEmail = process.env.ADMIN_EMAIL;
  const role: "user" | "admin" =
    adminEmail && params.email === adminEmail ? "admin" : "user";

  const inserted = await db
    .insert(users)
    .values({
      supabaseId: params.supabaseId,
      name: params.name,
      email: params.email,
      role,
      lastSignedIn: new Date(),
    })
    .returning();

  return inserted[0];
}
```

- [ ] **Step 3: Fix any remaining `onDuplicateKeyUpdate` calls in `db.ts`**

Search for `onDuplicateKeyUpdate` in `server/db.ts`:

```bash
grep -n "onDuplicateKeyUpdate" "/Users/anas/Desktop/High Heels Platform/high-heels-dance/server/db.ts"
```

For each occurrence, replace the pattern:
```ts
// OLD (MySQL):
.onDuplicateKeyUpdate({ set: { fieldName: value } })

// NEW (PostgreSQL) — use the relevant unique column as target:
.onConflictDoUpdate({ target: tableName.uniqueColumn, set: { fieldName: value } })
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd "/Users/anas/Desktop/High Heels Platform/high-heels-dance"
npx tsc --noEmit 2>&1 | grep "db.ts"
```

Expected: No errors from `db.ts` (errors from other files being fixed in later tasks are OK).

- [ ] **Step 5: Commit**

```bash
git add server/db.ts
git commit -m "feat: swap mysql2 for postgres-js in db.ts, add getUserBySupabaseId + syncUser"
```

---

## Task 6: Rewrite tRPC Context (Supabase JWT Verification)

**Files:**
- Rewrite: `server/_core/context.ts`

- [ ] **Step 1: Replace the entire file**

```ts
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
      return { ...base, supabaseUid: null, user: null };
    }

    const user = await getUserBySupabaseId(supabaseUser.id);

    return {
      ...base,
      supabaseUid: supabaseUser.id,
      user, // may be null on first login before syncUser runs
    };
  } catch {
    // Never throw — auth failure = unauthenticated, not a 500
    return { ...base, supabaseUid: null, user: null };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/_core/context.ts
git commit -m "feat: replace Manus SDK auth with Supabase JWT verification in tRPC context"
```

---

## Task 7: Update `server/routers.ts` — Remove Old Auth, Add `syncUser`

**Files:**
- Modify: `server/routers.ts`

- [ ] **Step 1: Remove old auth imports at the top of `server/routers.ts`**

Find and remove these lines:

```ts
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { sdk } from "./_core/sdk";
import { getSessionCookieOptions } from "./_core/cookies";
```

- [ ] **Step 2: Replace the entire `auth` sub-router**

Find the `auth: router({...})` block (lines ~40–99 in the original) and replace it with:

```ts
auth: router({
  /** Returns the full internal user row, or null if not authenticated. */
  me: publicProcedure.query((opts) => opts.ctx.user),

  /** Mark that the user has seen the welcome modal. */
  markWelcomeSeen: protectedProcedure.mutation(async ({ ctx }) => {
    await db.markUserWelcomeSeen(ctx.user.id);
    return { success: true };
  }),

  /**
   * Called by the frontend on every SIGNED_IN event.
   * Provisions or links the users row for this Supabase identity.
   * Runs as a publicProcedure because ctx.user is null on first call.
   */
  syncUser: publicProcedure
    .input(
      z.object({
        name: z.string(),
        email: z.string().email(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.supabaseUid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "No active Supabase session",
        });
      }
      return db.syncUser({
        supabaseId: ctx.supabaseUid,
        name: input.name || null,
        email: input.email,
      });
    }),
}),
```

- [ ] **Step 3: Verify TypeScript compiles cleanly for routers.ts**

```bash
npx tsc --noEmit 2>&1 | grep "routers.ts"
```

Expected: No errors from `routers.ts`.

- [ ] **Step 4: Commit**

```bash
git add server/routers.ts
git commit -m "feat: replace custom auth handlers with auth.syncUser in tRPC router"
```

---

## Task 8: Delete Old Auth Files

**Files:**
- Delete: `server/_core/sdk.ts`
- Delete: `server/_core/oauth.ts`
- Delete: `server/_core/cookies.ts`

- [ ] **Step 1: Delete the three files**

```bash
rm "/Users/anas/Desktop/High Heels Platform/high-heels-dance/server/_core/sdk.ts"
rm "/Users/anas/Desktop/High Heels Platform/high-heels-dance/server/_core/oauth.ts"
rm "/Users/anas/Desktop/High Heels Platform/high-heels-dance/server/_core/cookies.ts"
```

- [ ] **Step 2: Check if sdk / oauth / cookies are imported anywhere else**

```bash
grep -r "from.*sdk\|from.*oauth\|from.*cookies" "/Users/anas/Desktop/High Heels Platform/high-heels-dance/server" --include="*.ts"
```

Expected: No output (all references were in routers.ts/context.ts, already updated).

- [ ] **Step 3: Check if `registerOAuthRoutes` is called in the server entry point**

```bash
grep -r "registerOAuthRoutes\|oauth" "/Users/anas/Desktop/High Heels Platform/high-heels-dance/server/_core/index.ts"
```

If `registerOAuthRoutes` is found, remove that call and its import from `server/_core/index.ts`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete Manus SDK, custom OAuth routes, and session cookie helpers"
```

---

## Task 9: Create Browser Supabase Client

**Files:**
- Create: `client/src/lib/supabase.ts`

- [ ] **Step 1: Create the file**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add client/src/lib/supabase.ts
git commit -m "feat: add browser Supabase client singleton"
```

---

## Task 10: Update tRPC Client — Add JWT Authorization Header

**Files:**
- Modify: `client/src/main.tsx`

- [ ] **Step 1: Update `client/src/main.tsx`**

Add the supabase import and replace the `trpcClient` creation:

```ts
// Add this import near the top (after existing imports):
import { supabase } from "./lib/supabase";

// Replace the trpcClient block:
// OLD:
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// NEW:
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async headers() {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return {};
        return { Authorization: `Bearer ${session.access_token}` };
      },
    }),
  ],
});
```

Also remove the import of `getLoginUrl` from `main.tsx` if present.

- [ ] **Step 2: Commit**

```bash
git add client/src/main.tsx
git commit -m "feat: inject Supabase JWT as Authorization header on every tRPC request"
```

---

## Task 11: Rewrite `useAuth` Hook

**Files:**
- Rewrite: `client/src/_core/hooks/useAuth.ts`

- [ ] **Step 1: Replace the entire file**

```ts
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/" } =
    options ?? {};

  const utils = trpc.useUtils();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const syncUserMutation = trpc.auth.syncUser.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  // ── Session lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    // Hydrate initial session synchronously
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setSessionLoading(false);
    });

    // Subscribe to auth state changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s);
      setSessionLoading(false);

      if (event === "SIGNED_IN" && s) {
        // Provision or link the users DB row for this Supabase identity
        const name =
          s.user.user_metadata?.name ||
          s.user.user_metadata?.full_name ||
          "";
        const email = s.user.email ?? "";
        syncUserMutation.mutate({ name, email });
      }

      if (event === "SIGNED_OUT") {
        utils.auth.me.setData(undefined, null);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isAuthenticated = Boolean(session);

  // ── Internal user profile (role, membership, etc.) from our DB ──────────
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: isAuthenticated && !syncUserMutation.isPending,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // ── Auth actions ─────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    utils.auth.me.setData(undefined, null);
    await utils.auth.me.invalidate();
  }, [utils]);

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    },
    []
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw error;
    },
    []
  );

  const loginWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }, []);

  const loginWithFacebook = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }, []);

  /**
   * Refresh both the Supabase session token and the tRPC user cache.
   * Call this after membership/role changes that need to be reflected immediately.
   */
  const refresh = useCallback(async () => {
    await supabase.auth.refreshSession();
    await utils.auth.me.invalidate();
  }, [utils]);

  // ── Redirect if unauthenticated ──────────────────────────────────────────
  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (sessionLoading || syncUserMutation.isPending) return;
    if (session) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;
    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    sessionLoading,
    syncUserMutation.isPending,
    session,
  ]);

  const loading = useMemo(
    () =>
      sessionLoading ||
      syncUserMutation.isPending ||
      (isAuthenticated && meQuery.isLoading),
    [sessionLoading, syncUserMutation.isPending, isAuthenticated, meQuery.isLoading]
  );

  return {
    user: meQuery.data ?? null,
    isAuthenticated,
    loading,
    error: meQuery.error ?? syncUserMutation.error ?? null,
    logout,
    refresh,
    loginWithEmail,
    signUp,
    loginWithGoogle,
    loginWithFacebook,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/_core/hooks/useAuth.ts
git commit -m "feat: rewrite useAuth hook to use Supabase onAuthStateChange + tRPC auth.me"
```

---

## Task 12: Create OAuth Callback Page

**Files:**
- Create: `client/src/pages/AuthCallback.tsx`

- [ ] **Step 1: Create the file**

```tsx
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
```

- [ ] **Step 2: Add the route in `client/src/App.tsx`**

In the `Router` function, add before the `<Route component={NotFound} />` catch-all:

```tsx
// Add this import at the top of App.tsx:
import AuthCallback from "./pages/AuthCallback";

// Add this route inside the <Switch> block, before the final catch-all:
<Route path="/auth/callback" component={AuthCallback} />
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/AuthCallback.tsx client/src/App.tsx
git commit -m "feat: add /auth/callback page for OAuth redirect handling"
```

---

## Task 13: Rewrite `AuthModal.tsx` — Use New `useAuth` Methods

**Files:**
- Rewrite: `client/src/components/AuthModal.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional message shown above the form (e.g. "Sign in to book a session") */
  prompt?: string;
}

export function AuthModal({ isOpen, onClose, prompt }: AuthModalProps) {
  const { loginWithEmail, signUp, loginWithGoogle, loginWithFacebook } =
    useAuth();
  const [tab, setTab] = useState<"signin" | "register">("signin");
  const [loading, setLoading] = useState(false);

  // ── Sign-in form state ───────────────────────────────────────────────────
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  // ── Register form state ──────────────────────────────────────────────────
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordConfirm, setRegPasswordConfirm] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginWithEmail(signInEmail, signInPassword);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword !== regPasswordConfirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await signUp(regName, regEmail, regPassword);
      toast.success(
        "Account created! Check your email to confirm your address."
      );
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      await loginWithGoogle();
      // Page redirects to Supabase → provider → /auth/callback; no onClose needed
    } catch (err: unknown) {
      toast.error("Google sign-in failed. Please try again.");
    }
  };

  const handleFacebook = async () => {
    try {
      await loginWithFacebook();
    } catch (err: unknown) {
      toast.error("Facebook sign-in failed. Please try again.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            {tab === "signin" ? "Welcome back" : "Create your account"}
          </DialogTitle>
          {prompt && (
            <p className="text-center text-sm text-muted-foreground pt-1">
              {prompt}
            </p>
          )}
        </DialogHeader>

        {/* ── Social buttons ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 mt-2">
          <Button
            type="button"
            variant="outline"
            className="w-full flex items-center gap-3 h-11"
            onClick={handleGoogle}
            disabled={loading}
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              <path fill="none" d="M0 0h48v48H0z"/>
            </svg>
            Continue with Google
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full flex items-center gap-3 h-11"
            onClick={handleFacebook}
            disabled={loading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Continue with Facebook
          </Button>
        </div>

        <div className="flex items-center gap-3 my-1">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

        {/* ── Email / password tabs ────────────────────────────────────────── */}
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "signin" | "register")}
        >
          <TabsList className="w-full">
            <TabsTrigger value="signin" className="flex-1">
              Sign In
            </TabsTrigger>
            <TabsTrigger value="register" className="flex-1">
              Create Account
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="flex flex-col gap-4 mt-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="si-email">Email</Label>
                <Input
                  id="si-email"
                  type="email"
                  placeholder="you@example.com"
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="si-password">Password</Label>
                <Input
                  id="si-password"
                  type="password"
                  placeholder="••••••••"
                  value={signInPassword}
                  onChange={(e) => setSignInPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11"
                disabled={loading}
              >
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register">
            <form
              onSubmit={handleRegister}
              className="flex flex-col gap-4 mt-3"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reg-name">Full Name</Label>
                <Input
                  id="reg-name"
                  type="text"
                  placeholder="Jane Smith"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reg-email">Email</Label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="you@example.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reg-password">Password</Label>
                <Input
                  id="reg-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reg-confirm">Confirm Password</Label>
                <Input
                  id="reg-confirm"
                  type="password"
                  placeholder="••••••••"
                  value={regPasswordConfirm}
                  onChange={(e) => setRegPasswordConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11"
                disabled={loading}
              >
                {loading ? "Creating account…" : "Create Account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/AuthModal.tsx
git commit -m "feat: rewrite AuthModal to use Supabase auth via useAuth hook"
```

---

## Task 14: Remove `getLoginUrl` — Update All Callers

**Files:**
- Modify: `client/src/const.ts`
- Modify: `client/src/components/DashboardLayout.tsx`
- Modify: `client/src/pages/MyCourses.tsx`
- Modify: `client/src/pages/Feedback.tsx`
- Modify: `client/src/pages/MyMessages.tsx`
- Modify: `client/src/pages/Admin.tsx`

`getLoginUrl()` was used to redirect unauthenticated users to the Manus OAuth portal. It no longer has a destination. All callers either need to open the `AuthModal` or rely on `useAuth({ redirectOnUnauthenticated: true, redirectPath: '/' })`.

- [ ] **Step 1: Update `client/src/const.ts`**

Replace the entire file — `getLoginUrl` is gone; keep any remaining re-exports:

```ts
export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
```

If `COOKIE_NAME` and `ONE_YEAR_MS` are no longer used anywhere on the client, this file can be emptied. Verify:

```bash
grep -r "COOKIE_NAME\|ONE_YEAR_MS" "/Users/anas/Desktop/High Heels Platform/high-heels-dance/client/src" --include="*.ts" --include="*.tsx"
```

If no results, replace the file with an empty export:
```ts
// Auth constants moved to Supabase — this file kept for future shared constants
export {};
```

- [ ] **Step 2: Update `client/src/components/DashboardLayout.tsx`**

Find:
```ts
import { getLoginUrl } from "@/const";
// ...
window.location.href = getLoginUrl();
```

Replace with opening the AuthModal or using `useAuth`'s redirect. The simplest fix — since DashboardLayout already has access to `useAuth`, change the unauthenticated branch to redirect to `/`:
```ts
// Remove the import of getLoginUrl
// Replace:  window.location.href = getLoginUrl();
// With:     window.location.href = "/";
```

- [ ] **Step 3: Update `client/src/pages/MyCourses.tsx`**

Find:
```ts
import { getLoginUrl } from "@/const";
// ...
window.location.href = getLoginUrl();
```

Replace:
```ts
// Remove the import
// Replace:  window.location.href = getLoginUrl();
// With:     window.location.href = "/";
```

- [ ] **Step 4: Update `client/src/pages/Feedback.tsx`**

Same pattern — remove `getLoginUrl` import, replace `window.location.href = getLoginUrl()` with `window.location.href = "/"`.

- [ ] **Step 5: Update `client/src/pages/MyMessages.tsx`**

The file has an inline button:
```tsx
<Button onClick={() => window.location.href = getLoginUrl()} className="w-full">
```

Replace with:
```tsx
<Button onClick={() => window.location.href = "/"} className="w-full">
```

Remove the `getLoginUrl` import.

- [ ] **Step 6: Update `client/src/pages/Admin.tsx`**

Remove the unused import:
```ts
// Remove: import { getLoginUrl } from "@/const";
```

- [ ] **Step 7: Commit**

```bash
git add client/src/const.ts client/src/components/DashboardLayout.tsx \
  client/src/pages/MyCourses.tsx client/src/pages/Feedback.tsx \
  client/src/pages/MyMessages.tsx client/src/pages/Admin.tsx
git commit -m "chore: remove getLoginUrl — redirect to / for unauthenticated users"
```

---

## Task 15: Update `welcome.test.ts` — Fix Broken Test

**Files:**
- Modify: `server/welcome.test.ts`

- [ ] **Step 1: Read the full test file**

```bash
cat "/Users/anas/Desktop/High Heels Platform/high-heels-dance/server/welcome.test.ts"
```

- [ ] **Step 2: Replace `upsertUser`/`getUserByOpenId` references**

Find the `beforeAll` block that creates a test user using `upsertUser` + `getUserByOpenId`. Replace with `syncUser`:

```ts
// OLD:
const testUser = {
  openId: `test-welcome-${Date.now()}`,
  name: "Welcome Test User",
  email: `welcome-test-${Date.now()}@example.com`,
  loginMethod: "google",
};
await db.upsertUser(testUser);
const user = await db.getUserByOpenId(testUser.openId);

// NEW (use a deterministic test UUID — crypto.randomUUID() is available in Node 18+):
import { randomUUID } from "node:crypto";
// ...
const testSupabaseId = randomUUID();
const user = await db.syncUser({
  supabaseId: testSupabaseId,
  name: "Welcome Test User",
  email: `welcome-test-${Date.now()}@example.com`,
});
```

Also update the mock context to use `supabaseUid`:
```ts
// OLD:
const ctx: Context = {
  req: {} as any,
  res: {} as any,
  user: testUser,
};

// NEW:
const ctx = {
  req: {} as any,
  res: {} as any,
  supabaseUid: testSupabaseId,
  user: user,
};
```

- [ ] **Step 3: Commit**

```bash
git add server/welcome.test.ts
git commit -m "fix: update welcome.test.ts to use syncUser instead of upsertUser/getUserByOpenId"
```

---

## Task 16: Create RLS Policies

**Files:**
- Create: `drizzle/rls.sql`

- [ ] **Step 1: Create the file**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add drizzle/rls.sql
git commit -m "feat: add RLS policies for user-scoped tables (defense-in-depth)"
```

---

## Task 17: Supabase Dashboard Setup

This task is manual — no code changes.

- [ ] **Step 1: Create Supabase project**
  - Go to [supabase.com](https://supabase.com), create a new project
  - Note the project `ref` (e.g. `abcdefghijklmnop`)

- [ ] **Step 2: Configure Auth providers**
  - **Auth → Settings (General)**:
    - Enable "Confirm email" ✓
    - Enable "Link accounts with the same email" ✓
    - Set "Site URL" to your production domain (e.g. `https://yourdomain.com`)
  - **Auth → URL Configuration → Redirect URLs**: add all of:
    - `http://localhost:5173/auth/callback`
    - `http://localhost:3000/auth/callback`
    - `https://<your-production-domain>/auth/callback`
  - **Auth → Providers → Google**:
    - Enable Google provider
    - Enter Google Client ID + Secret (from Google Cloud Console → OAuth 2.0)
    - Copy the "Callback URL (for OAuth)" shown by Supabase → paste into Google OAuth app → Authorized redirect URIs
  - **Auth → Providers → Facebook**:
    - Enable Facebook provider
    - Enter Facebook App ID + Secret (from Meta Developer Console)
    - Copy the Supabase callback URL → paste into Facebook app → Valid OAuth Redirect URIs

- [ ] **Step 3: Collect credentials from Supabase Dashboard**
  - **Project Settings → API**:
    - `Project URL` → `SUPABASE_URL` and `VITE_SUPABASE_URL`
    - `anon public` key → `VITE_SUPABASE_ANON_KEY`
    - `service_role secret` key → `SUPABASE_SERVICE_ROLE_KEY`
  - **Project Settings → Database → Connection string (Direct)**:
    - Copy the URI → `SUPABASE_DATABASE_URL`
    - Replace `[YOUR-PASSWORD]` placeholder with your database password

- [ ] **Step 4: Fill in your local `.env`**

```
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_DATABASE_URL=postgresql://postgres:yourpassword@db.abcdefghijklmnop.supabase.co:5432/postgres

VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

ADMIN_EMAIL=your-email@example.com
```

---

## Task 18: Push Schema to Supabase

- [ ] **Step 1: Generate migration files from updated schema**

```bash
cd "/Users/anas/Desktop/High Heels Platform/high-heels-dance"
npx drizzle-kit generate
```

Expected: New SQL migration file created in `drizzle/` directory.

- [ ] **Step 2: Push schema to Supabase Postgres**

```bash
npx drizzle-kit push
```

Expected: All tables created in Supabase. Output shows each table created successfully.

If you see an error about `SUPABASE_DATABASE_URL`, make sure `.env` is loaded:
```bash
# dotenv-cli if needed:
npx dotenv -e .env -- npx drizzle-kit push
```

- [ ] **Step 3: Apply RLS policies**

```bash
psql $SUPABASE_DATABASE_URL -f drizzle/rls.sql
```

Expected: Each `ALTER TABLE` and `CREATE POLICY` statement completes without error.

- [ ] **Step 4: Verify tables exist in Supabase**

In the Supabase Dashboard → Table Editor, confirm you can see: `users`, `courses`, `purchases`, `bookings`, `chatMessages`, etc.

---

## Task 19: TypeScript Compile Check + Fix Remaining Errors

- [ ] **Step 1: Run full TypeScript check**

```bash
cd "/Users/anas/Desktop/High Heels Platform/high-heels-dance"
npx tsc --noEmit 2>&1
```

- [ ] **Step 2: Fix any remaining errors**

Common remaining issues and fixes:

**`Cannot find module 'drizzle-orm/mysql2'`** in any test or utility file:
- Update the import to `drizzle-orm/postgres-js` and the driver call

**`Property 'openId' does not exist on type 'User'`** in test files or legacy helpers:
- Replace `openId` references with `supabaseId`

**`Property 'emailSignIn' does not exist on type ...`** in component files:
- Any component still calling `trpc.auth.emailSignIn` or `trpc.auth.register` needs updating — use `useAuth()` methods instead

**`Cannot find name 'getLoginUrl'`** in any remaining file:
- Remove the import and replace the call with `window.location.href = "/"`

- [ ] **Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors from Supabase migration"
```

---

## Task 20: End-to-End Testing

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Expected: Server starts on port 5173 (or configured port). No startup crashes.

- [ ] **Step 2: Test email signup flow**
  1. Open `http://localhost:5173`
  2. Click any "Sign In" button → `AuthModal` opens
  3. Switch to "Create Account" tab
  4. Fill in name, email, password → click "Create Account"
  5. Expected: Toast "Account created! Check your email to confirm your address."
  6. Check email → click confirmation link
  7. Expected: Redirected back to app, user is logged in, `auth.me` returns user with correct name

- [ ] **Step 3: Test email sign-in flow**
  1. Sign out (if logged in)
  2. Open `AuthModal` → "Sign In" tab
  3. Enter confirmed email + password → click "Sign In"
  4. Expected: Modal closes, `useAuth().user` has the correct `name`, `email`, `role: 'user'`

- [ ] **Step 4: Test Google OAuth flow**
  1. Sign out
  2. Open `AuthModal` → click "Continue with Google"
  3. Expected: Redirected to Google → select account → redirected to `/auth/callback` → spinner shown → redirected to `/`
  4. Expected: `useAuth().user` populated

- [ ] **Step 5: Test Facebook OAuth flow**
  1. Sign out
  2. Open `AuthModal` → click "Continue with Facebook"
  3. Same flow as Google

- [ ] **Step 6: Test account linking**
  1. Sign in with email+password using `test@example.com`
  2. Note the `users.id` from browser devtools (tRPC `auth.me` response)
  3. Sign out
  4. Sign in with Google using the same `test@example.com`
  5. Expected: Same `users.id` returned — same account linked

- [ ] **Step 7: Test protected procedures**
  1. Sign out
  2. Open devtools → Network tab → trigger a `protectedProcedure` call (e.g. navigate to `/my-courses`)
  3. Expected: tRPC returns `UNAUTHORIZED` error, component shows auth prompt

- [ ] **Step 8: Test admin access**
  1. The email set in `ADMIN_EMAIL` gets `role: 'admin'` on first `syncUser`
  2. Sign in with that email
  3. Navigate to `/admin`
  4. Expected: Admin dashboard loads correctly

- [ ] **Step 9: Test free course access (unauthenticated)**
  1. Sign out
  2. Navigate to a free course
  3. Expected: Course accessible without login

- [ ] **Step 10: Test paid course access control**
  1. Sign in as a non-admin, non-member user
  2. Navigate to a paid course
  3. Expected: Access blocked, upgrade prompt shown

- [ ] **Step 11: Run existing test suite**

```bash
npm run test
```

Fix any remaining failures due to `openId`/`upsertUser`/`getUserByOpenId` references.

---

## Self-Review

**Spec coverage check:**
- ✅ §5.1 Email signup/signin — Task 11 (useAuth) + Task 13 (AuthModal)
- ✅ §5.2 Google/Facebook OAuth — Task 11 (useAuth) + Task 12 (AuthCallback)
- ✅ §5.3 Account linking — Task 5 (syncUser in db.ts) + Supabase dashboard (Task 17)
- ✅ §5.4 `auth.syncUser` mutation — Task 7 (routers.ts)
- ✅ §5.5 Sign out — Task 11 (useAuth.logout)
- ✅ §6 tRPC Context — Task 6 (context.ts)
- ✅ §7 useAuth hook — Task 11
- ✅ §8 OAuth callback page — Task 12
- ✅ §9 RLS policies — Task 16 (rls.sql) + Task 18 (push)
- ✅ §10 Env vars — Task 2
- ✅ §11 File deletions (sdk, oauth, cookies) — Task 8
- ✅ §12 Supabase dashboard setup — Task 17
- ✅ §13 Migration commands — Task 18
- ✅ §14 Testing checklist — Task 20

**Type consistency check:**
- `syncUser` in db.ts returns `Promise<User>` → used in `auth.syncUser` router which also returns `User` ✅
- `getUserBySupabaseId` returns `Promise<User | null>` → used in `createContext` with null safety ✅
- `TrpcContext.supabaseUid: string | null` → checked before use in `auth.syncUser` ✅
- `useAuth()` returns `{ user: User | null, isAuthenticated: boolean, loading: boolean, ... }` — matches existing consumer usage in `App.tsx` ✅
