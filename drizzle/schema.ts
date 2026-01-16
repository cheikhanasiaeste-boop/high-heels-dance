import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Courses table - stores all dance courses (free and paid)
 */
export const courses = mysqlTable("courses", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(), // 0 for free courses
  originalPrice: decimal("originalPrice", { precision: 10, scale: 2 }), // For showing discounts
  imageUrl: text("imageUrl"), // S3 URL for course image
  imageKey: text("imageKey"), // S3 key for course image
  isFree: boolean("isFree").default(false).notNull(),
  isPublished: boolean("isPublished").default(true).notNull(), // Admin can unpublish courses
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Course = typeof courses.$inferSelect;
export type InsertCourse = typeof courses.$inferInsert;

/**
 * Purchases table - tracks which users have purchased which courses
 */
export const purchases = mysqlTable("purchases", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  courseId: int("courseId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  stripePaymentId: varchar("stripePaymentId", { length: 255 }), // Stripe payment intent ID
  status: mysqlEnum("status", ["pending", "completed", "failed"]).default("pending").notNull(),
  purchasedAt: timestamp("purchasedAt").defaultNow().notNull(),
});

export type Purchase = typeof purchases.$inferSelect;
export type InsertPurchase = typeof purchases.$inferInsert;

/**
 * Site settings table - stores global site configuration
 */
export const siteSettings = mysqlTable("siteSettings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SiteSetting = typeof siteSettings.$inferSelect;
export type InsertSiteSetting = typeof siteSettings.$inferInsert;

/**
 * Chat messages table - stores AI chat support history
 */
export const chatMessages = mysqlTable("chatMessages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // Null for anonymous users
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

/**
 * Availability slots table - stores instructor's available time slots
 */
export const availabilitySlots = mysqlTable("availabilitySlots", {
  id: int("id").autoincrement().primaryKey(),
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime").notNull(),
  eventType: mysqlEnum("eventType", ["online", "in-person"]).default("online").notNull(),
  location: text("location"), // Physical address for in-person events
  isFree: boolean("isFree").default(true).notNull(),
  price: varchar("price", { length: 20 }), // Price in EUR (e.g., "50.00")
  title: varchar("title", { length: 200 }).default("One-on-One Dance Session").notNull(),
  description: text("description"),
  sessionType: mysqlEnum("sessionType", ["private", "group"]).default("private").notNull(),
  capacity: int("capacity").default(1).notNull(), // Max participants (1 for private, >1 for group)
  currentBookings: int("currentBookings").default(0).notNull(), // Number of current bookings
  isBooked: boolean("isBooked").default(false).notNull(), // For private sessions only
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AvailabilitySlot = typeof availabilitySlots.$inferSelect;
export type InsertAvailabilitySlot = typeof availabilitySlots.$inferInsert;

/**
 * Bookings table - stores user session bookings
 */
export const bookings = mysqlTable("bookings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  slotId: int("slotId").notNull(),
  sessionType: varchar("sessionType", { length: 100 }).notNull(), // e.g., "One-on-One Dance Session"
  zoomLink: text("zoomLink"),
  status: mysqlEnum("status", ["pending", "confirmed", "cancelled"]).default("confirmed").notNull(),
  notes: text("notes"), // User notes for the session
  paymentRequired: boolean("paymentRequired").default(false).notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "completed", "failed", "not_required"]).default("not_required").notNull(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  amountPaid: varchar("amountPaid", { length: 20 }), // Amount in EUR
  bookedAt: timestamp("bookedAt").defaultNow().notNull(),
});

export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;

/**
 * Testimonials table - stores user feedback and reviews
 */
export const testimonials = mysqlTable("testimonials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  userEmail: varchar("userEmail", { length: 320 }),
  rating: int("rating").notNull(), // 1-5 stars
  review: text("review").notNull(),
  photoUrl: text("photoUrl"),
  videoUrl: text("videoUrl"),
  type: mysqlEnum("type", ["session", "course"]).notNull(), // session or course feedback
  relatedId: int("relatedId"), // booking ID or course ID
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  isFeatured: boolean("isFeatured").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Testimonial = typeof testimonials.$inferSelect;
export type InsertTestimonial = typeof testimonials.$inferInsert;

/**
 * Website popup settings - for email collection or announcements
 */
export const popupSettings = mysqlTable("popup_settings", {
  id: int("id").autoincrement().primaryKey(),
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PopupSettings = typeof popupSettings.$inferSelect;
export type InsertPopupSettings = typeof popupSettings.$inferInsert;

/**
 * Popup interactions - track which users have seen/dismissed the popup
 */
export const popupInteractions = mysqlTable("popup_interactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  popupId: int("popupId").notNull(),
  email: varchar("email", { length: 320 }), // If user submitted email
  action: mysqlEnum("action", ["dismissed", "email_submitted"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PopupInteraction = typeof popupInteractions.$inferSelect;
export type InsertPopupInteraction = typeof popupInteractions.$inferInsert;

/**
 * Section headings - customizable headings for homepage sections
 */
export const sectionHeadings = mysqlTable("section_headings", {
  id: int("id").autoincrement().primaryKey(),
  section: varchar("section", { length: 100 }).notNull().unique(), // e.g., "courses", "testimonials", "about"
  heading: varchar("heading", { length: 255 }).notNull(),
  subheading: text("subheading"),
  displayOrder: int("displayOrder").default(0).notNull(),
  isVisible: boolean("isVisible").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SectionHeading = typeof sectionHeadings.$inferSelect;
export type InsertSectionHeading = typeof sectionHeadings.$inferInsert;

/**
 * Page analytics table - tracks page views and visitor sessions
 */
export const pageAnalytics = mysqlTable("page_analytics", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("session_id", { length: 255 }).notNull(), // Unique session identifier
  visitorId: varchar("visitor_id", { length: 255 }).notNull(), // Unique visitor identifier (persists across sessions)
  pagePath: varchar("page_path", { length: 500 }).notNull(), // URL path visited
  referrer: text("referrer"), // Where visitor came from
  userAgent: text("user_agent"), // Browser/device info
  entryTime: timestamp("entry_time").defaultNow().notNull(), // When visitor entered page
  exitTime: timestamp("exit_time"), // When visitor left page (null if still on page)
  duration: int("duration"), // Time spent on page in seconds
  isBounce: boolean("is_bounce").default(false), // True if visitor left without visiting another page
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PageAnalytics = typeof pageAnalytics.$inferSelect;
export type InsertPageAnalytics = typeof pageAnalytics.$inferInsert;
