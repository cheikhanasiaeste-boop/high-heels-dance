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
  // In-person session credits (separate from online membership)
  inPersonCredits: integer("inPersonCredits").default(0).notNull(),
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
  certificateId: varchar("certificateId", { length: 50 }),
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
  allowDiscountCodes: boolean("allowDiscountCodes").default(false).notNull(),
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
  // Bunny.net Stream fields
  bunnyVideoId: varchar("bunnyVideoId", { length: 100 }),
  bunnyThumbnailUrl: text("bunnyThumbnailUrl"),
  videoStatus: text("videoStatus").$type<"pending" | "uploading" | "processing" | "encoding" | "ready" | "failed">().default("pending"),
  durationSeconds: integer("durationSeconds"),
  // Legacy duration in minutes (kept for backwards compatibility)
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

/**
 * Session discount codes — single-use codes for specific in-person sessions
 * Generated by admin via Telegram bot. Makes in-person session price €0.
 */
export const sessionDiscountCodes = pgTable("sessionDiscountCodes", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  type: text("type").$type<"single" | "package">().notNull(),
  packageGroup: varchar("packageGroup", { length: 40 }), // groups codes from same /generate package call
  usedByUserId: integer("usedByUserId").references(() => users.id),
  usedAt: timestamp("usedAt"),
  createdByAdminId: integer("createdByAdminId").notNull().references(() => users.id),
  isActive: boolean("isActive").default(true).notNull(),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  codeIdx: index("sessionDiscountCodes_code_idx").on(table.code),
}));

export type SessionDiscountCode = typeof sessionDiscountCodes.$inferSelect;
export type InsertSessionDiscountCode = typeof sessionDiscountCodes.$inferInsert;

/**
 * Live sessions table - stores Zoom live group dance sessions
 */
export const liveSessions = pgTable("live_sessions", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime").notNull(),
  isFree: boolean("isFree").default(true).notNull(),
  price: varchar("price", { length: 20 }),
  capacity: integer("capacity").default(100).notNull(),
  zoomMeetingId: varchar("zoomMeetingId", { length: 50 }),
  zoomMeetingNumber: varchar("zoomMeetingNumber", { length: 50 }),
  zoomPassword: varchar("zoomPassword", { length: 50 }),
  status: text("status").$type<"scheduled" | "live" | "ended" | "cancelled">().default("scheduled").notNull(),
  recordingUrl: text("recordingUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LiveSession = typeof liveSessions.$inferSelect;
export type InsertLiveSession = typeof liveSessions.$inferInsert;

/**
 * Blog posts generated from YouTube videos
 */
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  youtubeVideoId: varchar("youtube_video_id", { length: 20 }).unique().notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).unique().notNull(),
  excerpt: text("excerpt").notNull(),
  content: text("content").notNull(),
  thumbnailUrl: text("thumbnail_url").notNull(),
  youtubeUrl: text("youtube_url").notNull(),
  publishedAt: timestamp("published_at"),
  isPublished: boolean("is_published").default(false).notNull(),
  isNewsletterSent: boolean("is_newsletter_sent").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("blog_posts_slug_idx").on(table.slug),
  index("blog_posts_published_idx").on(table.isPublished, table.publishedAt),
]);

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;

/**
 * Newsletter subscribers — single source of truth for email list
 */
export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  source: varchar("source", { length: 20 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
  unsubscribedAt: timestamp("unsubscribed_at"),
}, (table) => [
  index("newsletter_email_idx").on(table.email),
  index("newsletter_active_idx").on(table.isActive),
]);

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type InsertNewsletterSubscriber = typeof newsletterSubscribers.$inferInsert;
