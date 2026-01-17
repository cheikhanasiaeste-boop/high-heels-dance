import { eq, and, desc, isNull, gte, lte, or, like, inArray, sql, SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser,
  User,
  users, 
  courses, 
  Course,
  InsertCourse,
  purchases,
  Purchase,
  InsertPurchase,
  siteSettings,
  SiteSetting,
  InsertSiteSetting,
  chatMessages,
  ChatMessage,
  InsertChatMessage,
  availabilitySlots,
  AvailabilitySlot,
  InsertAvailabilitySlot,
  bookings,
  Booking,
  InsertBooking,
  testimonials,
  Testimonial,
  InsertTestimonial,
  userCourseEnrollments,
  UserCourseEnrollment,
  InsertUserCourseEnrollment,
  courseModules,
  CourseModule,
  InsertCourseModule,
  courseLessons,
  CourseLesson,
  InsertCourseLesson,
  userLessonProgress,
  UserLessonProgress,
  InsertUserLessonProgress,
  visualSettings,
  VisualSettings,
  InsertVisualSettings
} from "../drizzle/schema";
import { ENV } from './_core/env';

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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Course queries
export async function getAllPublishedCourses(): Promise<Course[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(courses)
    .where(eq(courses.isPublished, true))
    .orderBy(desc(courses.createdAt));
  
  return result;
}

export async function getAllCourses(): Promise<Course[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(courses)
    .orderBy(desc(courses.createdAt));
  
  return result;
}

export async function getCourseById(id: number): Promise<Course | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
  return result[0];
}

export async function createCourse(course: InsertCourse): Promise<Course> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(courses).values(course);
  const insertedId = Number(result[0].insertId);
  
  const newCourse = await getCourseById(insertedId);
  if (!newCourse) throw new Error("Failed to retrieve created course");
  
  return newCourse;
}

export async function updateCourse(id: number, course: Partial<InsertCourse>): Promise<Course | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(courses).set(course).where(eq(courses.id, id));
  return getCourseById(id);
}

export async function deleteCourse(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(courses).where(eq(courses.id, id));
}

// Purchase queries
export async function createPurchase(purchase: InsertPurchase): Promise<Purchase> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(purchases).values(purchase);
  const insertedId = Number(result[0].insertId);
  
  const newPurchase = await db.select().from(purchases).where(eq(purchases.id, insertedId)).limit(1);
  if (!newPurchase[0]) throw new Error("Failed to retrieve created purchase");
  
  return newPurchase[0];
}

export async function getUserPurchases(userId: number): Promise<Purchase[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(purchases)
    .where(eq(purchases.userId, userId))
    .orderBy(desc(purchases.purchasedAt));
  
  return result;
}

export async function hasUserPurchasedCourse(userId: number, courseId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const result = await db
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, userId),
        eq(purchases.courseId, courseId),
        eq(purchases.status, "completed")
      )
    )
    .limit(1);
  
  return result.length > 0;
}

export async function updatePurchaseStatus(id: number, status: "pending" | "completed" | "failed"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(purchases).set({ status }).where(eq(purchases.id, id));
}

// Site settings queries
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
  return result[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .insert(siteSettings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

// Chat message queries
export async function createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(chatMessages).values(message);
  const insertedId = Number(result[0].insertId);
  
  const newMessage = await db.select().from(chatMessages).where(eq(chatMessages.id, insertedId)).limit(1);
  if (!newMessage[0]) throw new Error("Failed to retrieve created message");
  
  return newMessage[0];
}

export async function getChatHistory(userId: number | null, limit: number = 50): Promise<ChatMessage[]> {
  const db = await getDb();
  if (!db) return [];
  
  const query = userId !== null
    ? db.select().from(chatMessages).where(eq(chatMessages.userId, userId))
    : db.select().from(chatMessages).where(isNull(chatMessages.userId));
  
  const result = await query.orderBy(desc(chatMessages.createdAt)).limit(limit);
  
  return result.reverse(); // Return in chronological order
}

// Availability slot queries
export async function createAvailabilitySlot(slot: InsertAvailabilitySlot): Promise<AvailabilitySlot> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(availabilitySlots).values(slot);
  const insertedId = Number(result[0].insertId);
  
  const newSlot = await db.select().from(availabilitySlots).where(eq(availabilitySlots.id, insertedId)).limit(1);
  if (!newSlot[0]) throw new Error("Failed to retrieve created slot");
  
  return newSlot[0];
}

export async function getAvailableSlots(startDate?: Date, endDate?: Date): Promise<AvailabilitySlot[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Get all slots (we'll filter by availability logic below)
  const allSlots = await db.select().from(availabilitySlots).orderBy(availabilitySlots.startTime);
  
  // Filter slots based on availability:
  // - Private sessions: not booked (isBooked = false)
  // - Group sessions: current bookings < capacity
  const availableSlots = allSlots.filter(slot => {
    if (slot.sessionType === 'group') {
      return slot.currentBookings < slot.capacity;
    } else {
      return !slot.isBooked;
    }
  });
  
  return availableSlots;
}

export async function getAllAvailabilitySlots(): Promise<AvailabilitySlot[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select().from(availabilitySlots).orderBy(availabilitySlots.startTime);
  return result;
}

export async function getAvailabilitySlotById(id: number): Promise<AvailabilitySlot | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(availabilitySlots).where(eq(availabilitySlots.id, id)).limit(1);
  return result[0];
}

export async function updateAvailabilitySlot(id: number, updates: Partial<InsertAvailabilitySlot>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(availabilitySlots).set(updates).where(eq(availabilitySlots.id, id));
}

export async function deleteAvailabilitySlot(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(availabilitySlots).where(eq(availabilitySlots.id, id));
}

// Booking queries
export async function createBooking(booking: InsertBooking): Promise<Booking> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(bookings).values(booking);
  const insertedId = Number(result[0].insertId);
  
  const newBooking = await db.select().from(bookings).where(eq(bookings.id, insertedId)).limit(1);
  if (!newBooking[0]) throw new Error("Failed to retrieve created booking");
  
  return newBooking[0];
}

export async function getUserBookings(userId: number): Promise<Booking[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(bookings)
    .where(eq(bookings.userId, userId))
    .orderBy(desc(bookings.bookedAt));
  
  return result;
}

export async function getAllBookings(): Promise<Booking[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select().from(bookings).orderBy(desc(bookings.bookedAt));
  return result;
}

export async function getBookingById(id: number): Promise<Booking | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  return result[0];
}

export async function updateBooking(id: number, updates: Partial<InsertBooking>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(bookings).set(updates).where(eq(bookings.id, id));
}

export async function cancelBooking(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, id));
}

// ==================== Testimonials ====================

export async function createTestimonial(testimonial: InsertTestimonial): Promise<Testimonial> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(testimonials).values(testimonial);
  const insertedId = Number(result[0].insertId);
  
  const newTestimonial = await db.select().from(testimonials).where(eq(testimonials.id, insertedId)).limit(1);
  if (!newTestimonial[0]) throw new Error("Failed to retrieve created testimonial");
  
  return newTestimonial[0];
}

export async function getApprovedTestimonials(): Promise<Testimonial[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(testimonials)
    .where(eq(testimonials.status, "approved"))
    .orderBy(desc(testimonials.isFeatured), desc(testimonials.createdAt));
  
  return result;
}

export async function getAllTestimonials(): Promise<(Testimonial & { courseName?: string })[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select({
      id: testimonials.id,
      userId: testimonials.userId,
      userName: testimonials.userName,
      userEmail: testimonials.userEmail,
      rating: testimonials.rating,
      review: testimonials.review,
      photoUrl: testimonials.photoUrl,
      videoUrl: testimonials.videoUrl,
      type: testimonials.type,
      relatedId: testimonials.relatedId,
      status: testimonials.status,
      isFeatured: testimonials.isFeatured,
      createdAt: testimonials.createdAt,
      updatedAt: testimonials.updatedAt,
      courseName: courses.title,
    })
    .from(testimonials)
    .leftJoin(courses, eq(testimonials.relatedId, courses.id))
    .orderBy(desc(testimonials.createdAt));
  
  return result as (Testimonial & { courseName?: string })[];
}

export async function getTestimonialById(id: number): Promise<Testimonial | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(testimonials).where(eq(testimonials.id, id)).limit(1);
  return result[0];
}

export async function updateTestimonial(id: number, updates: Partial<InsertTestimonial>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(testimonials).set(updates).where(eq(testimonials.id, id));
}

export async function deleteTestimonial(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(testimonials).where(eq(testimonials.id, id));
}

export async function getUserTestimonialForItem(userId: number, type: "session" | "course", relatedId: number): Promise<Testimonial | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db
    .select()
    .from(testimonials)
    .where(
      and(
        eq(testimonials.userId, userId),
        eq(testimonials.type, type),
        eq(testimonials.relatedId, relatedId)
      )
    )
    .limit(1);
  
  return result[0];
}

// User Management Functions
export async function getAllUsers(): Promise<typeof users.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt));
  
  return result;
}

export async function updateUserRole(userId: number, role: "admin" | "user"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function getUserById(userId: number): Promise<typeof users.$inferSelect | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}

// Dashboard Statistics
export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return null;

  // Get total users
  const allUsers = await db.select().from(users);
  const totalUsers = allUsers.length;

  // Get all courses
  const allCourses = await db.select().from(courses);
  const totalCourses = allCourses.length;
  const paidCourses = allCourses.filter(c => !c.isFree).length;
  const freeCourses = allCourses.filter(c => c.isFree).length;

  // Get all purchases
  const allPurchases = await db.select().from(purchases);
  const coursePurchases = allPurchases.length;
  const courseRevenue = allPurchases.reduce((sum, p) => sum + parseFloat(p.amount), 0);

  // Get all bookings
  const allBookings = await db.select().from(bookings);
  const totalBookings = allBookings.length;
  const confirmedBookings = allBookings.filter(b => b.status === 'confirmed').length;
  const paidBookings = allBookings.filter(b => b.amountPaid && parseFloat(b.amountPaid) > 0).length;
  const sessionRevenue = allBookings
    .filter(b => b.amountPaid)
    .reduce((sum, b) => sum + parseFloat(b.amountPaid!), 0);

  // Total revenue
  const totalRevenue = courseRevenue + sessionRevenue;

  // Popular courses (top 5 by purchase count)
  const courseSales = allPurchases.reduce((acc, p) => {
    acc[p.courseId] = (acc[p.courseId] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const popularCourses = allCourses
    .map(course => {
      const purchaseCount = courseSales[course.id] || 0;
      const revenue = allPurchases
        .filter(p => p.courseId === course.id)
        .reduce((sum, p) => sum + parseFloat(p.amount), 0);
      return {
        id: course.id,
        title: course.title,
        purchaseCount,
        revenue,
      };
    })
    .sort((a, b) => b.purchaseCount - a.purchaseCount)
    .slice(0, 5);

  return {
    totalUsers,
    totalCourses,
    paidCourses,
    freeCourses,
    totalRevenue,
    courseRevenue,
    sessionRevenue,
    coursePurchases,
    paidBookings,
    totalBookings,
    confirmedBookings,
    popularCourses,
  };
}

export async function getRevenueByPeriod() {
  const db = await getDb();
  if (!db) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 30);
  const lastMonthStart = new Date(monthStart);
  lastMonthStart.setDate(lastMonthStart.getDate() - 30);

  const allPurchases = await db.select().from(purchases);
  const allBookings = await db.select().from(bookings);

  // Calculate revenue for different periods
  const calculateRevenue = (startDate: Date, endDate: Date) => {
    const purchaseRevenue = allPurchases
      .filter(p => {
        const pDate = new Date(p.purchasedAt);
        return pDate >= startDate && pDate < endDate;
      })
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    const bookingRevenue = allBookings
      .filter(b => {
        const bDate = new Date(b.bookedAt);
        return b.amountPaid && bDate >= startDate && bDate < endDate;
      })
      .reduce((sum, b) => sum + parseFloat(b.amountPaid!), 0);

    return purchaseRevenue + bookingRevenue;
  };

  return {
    today: calculateRevenue(todayStart, now),
    yesterday: calculateRevenue(yesterdayStart, todayStart),
    week: calculateRevenue(weekStart, now),
    lastWeek: calculateRevenue(lastWeekStart, weekStart),
    month: calculateRevenue(monthStart, now),
    lastMonth: calculateRevenue(lastMonthStart, monthStart),
  };
}

// Time-series analytics for charts
export async function getRevenueTimeSeries(startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return [];

  const allPurchases = await db.select().from(purchases)
    .where(and(
      gte(purchases.purchasedAt, startDate),
      lte(purchases.purchasedAt, endDate)
    ));
  
  const allBookings = await db.select().from(bookings)
    .where(and(
      gte(bookings.bookedAt, startDate),
      lte(bookings.bookedAt, endDate)
    ));

  // Group by date
  const revenueByDate = new Map<string, number>();
  
  allPurchases.forEach(p => {
    const date = new Date(p.purchasedAt).toISOString().split('T')[0];
    revenueByDate.set(date, (revenueByDate.get(date) || 0) + parseFloat(p.amount));
  });
  
  allBookings.forEach(b => {
    const date = new Date(b.bookedAt).toISOString().split('T')[0];
    const amount = b.amountPaid ? parseFloat(b.amountPaid) : 0;
    revenueByDate.set(date, (revenueByDate.get(date) || 0) + amount);
  });

  // Convert to array and sort by date
  return Array.from(revenueByDate.entries())
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getUserGrowthTimeSeries(startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return [];

  const allUsers = await db.select().from(users)
    .where(and(
      gte(users.createdAt, startDate),
      lte(users.createdAt, endDate)
    ));

  // Group by date and calculate cumulative count
  const usersByDate = new Map<string, number>();
  
  allUsers.forEach(u => {
    const date = new Date(u.createdAt).toISOString().split('T')[0];
    usersByDate.set(date, (usersByDate.get(date) || 0) + 1);
  });

  // Convert to array, sort, and make cumulative
  const sorted = Array.from(usersByDate.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let cumulative = 0;
  return sorted.map(item => {
    cumulative += item.count;
    return { date: item.date, users: cumulative };
  });
}


// ============================================================================
// Popup Settings
// ============================================================================

export async function getPopupSettings() {
  const db = await getDb();
  if (!db) return null;
  
  const { popupSettings } = await import("../drizzle/schema");
  const [popup] = await db.select().from(popupSettings).limit(1);
  return popup || null;
}

export async function upsertPopupSettings(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { popupSettings } = await import("../drizzle/schema");
  const existing = await getPopupSettings();
  
  if (existing) {
    await db.update(popupSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(popupSettings.id, existing.id));
    return getPopupSettings();
  } else {
    await db.insert(popupSettings).values(data);
    return getPopupSettings();
  }
}

export async function recordPopupInteraction(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { popupInteractions } = await import("../drizzle/schema");
  await db.insert(popupInteractions).values(data);
}

export async function hasUserSeenPopup(userId: number | null, popupId: number) {
  if (!userId) return false;
  
  const db = await getDb();
  if (!db) return false;
  
  const { popupInteractions } = await import("../drizzle/schema");
  const [interaction] = await db.select()
    .from(popupInteractions)
    .where(and(
      eq(popupInteractions.userId, userId),
      eq(popupInteractions.popupId, popupId)
    ))
    .limit(1);
  
  return !!interaction;
}

// ============================================================================
// Section Headings
// ============================================================================

export async function getAllSectionHeadings() {
  const db = await getDb();
  if (!db) return [];
  
  const { sectionHeadings } = await import("../drizzle/schema");
  const { asc } = await import("drizzle-orm");
  return db.select()
    .from(sectionHeadings)
    .orderBy(asc(sectionHeadings.displayOrder));
}

export async function getSectionHeading(section: string) {
  const db = await getDb();
  if (!db) return null;
  
  const { sectionHeadings } = await import("../drizzle/schema");
  const [heading] = await db.select()
    .from(sectionHeadings)
    .where(eq(sectionHeadings.section, section))
    .limit(1);
  return heading || null;
}

export async function createSectionHeading(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { sectionHeadings } = await import("../drizzle/schema");
  await db.insert(sectionHeadings).values(data);
  return getSectionHeading(data.section);
}

export async function updateSectionHeading(section: string, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { sectionHeadings } = await import("../drizzle/schema");
  await db.update(sectionHeadings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(sectionHeadings.section, section));
  return getSectionHeading(section);
}

export async function deleteSectionHeading(section: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { sectionHeadings } = await import("../drizzle/schema");
  await db.delete(sectionHeadings)
    .where(eq(sectionHeadings.section, section));
}

// ============================================================================
// User Management (Extended)
// ============================================================================

export async function getUsersCount() {
  const db = await getDb();
  if (!db) return 0;
  
  const { sql } = await import("drizzle-orm");
  const [result] = await db.select({ count: sql<number>`count(*)` })
    .from(users);
  return result.count;
}

export async function searchUsers(query: string, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  
  const { sql, or } = await import("drizzle-orm");
  return db.select()
    .from(users)
    .where(or(
      sql`${users.name} LIKE ${`%${query}%`}`,
      sql`${users.email} LIKE ${`%${query}%`}`
    ))
    .limit(limit);
}

// ============================================================================
// Analytics Functions
// ============================================================================

export async function trackPageView(data: {
  sessionId: string;
  visitorId: string;
  pagePath: string;
  referrer?: string;
  userAgent?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  
  const { pageAnalytics } = await import("../drizzle/schema");
  const [result] = await db.insert(pageAnalytics).values({
    sessionId: data.sessionId,
    visitorId: data.visitorId,
    pagePath: data.pagePath,
    referrer: data.referrer || null,
    userAgent: data.userAgent || null,
    entryTime: new Date(),
  });
  
  return result;
}

export async function updatePageExit(sessionId: string, pagePath: string) {
  const db = await getDb();
  if (!db) return null;
  
  const { pageAnalytics } = await import("../drizzle/schema");
  
  // Find the most recent entry for this session and page
  const [entry] = await db
    .select()
    .from(pageAnalytics)
    .where(and(
      eq(pageAnalytics.sessionId, sessionId),
      eq(pageAnalytics.pagePath, pagePath),
      isNull(pageAnalytics.exitTime)
    ))
    .orderBy(desc(pageAnalytics.entryTime))
    .limit(1);
  
  if (!entry) return null;
  
  const exitTime = new Date();
  const duration = Math.floor((exitTime.getTime() - new Date(entry.entryTime).getTime()) / 1000);
  
  await db
    .update(pageAnalytics)
    .set({
      exitTime,
      duration,
    })
    .where(eq(pageAnalytics.id, entry.id));
  
  return { duration };
}

export async function markBounce(sessionId: string) {
  const db = await getDb();
  if (!db) return null;
  
  const { pageAnalytics } = await import("../drizzle/schema");
  await db
    .update(pageAnalytics)
    .set({ isBounce: true })
    .where(eq(pageAnalytics.sessionId, sessionId));
}

export async function getAnalytics(startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return null;
  
  const { pageAnalytics } = await import("../drizzle/schema");
  
  // Get all analytics data for the period
  const data = await db
    .select()
    .from(pageAnalytics)
    .where(and(
      gte(pageAnalytics.entryTime, startDate),
      lte(pageAnalytics.entryTime, endDate)
    ));
  
  // Calculate metrics
  const pageViews = data.length;
  const uniqueVisitors = new Set(data.map(d => d.visitorId)).size;
  const uniqueSessions = new Set(data.map(d => d.sessionId)).size;
  
  // Calculate average duration (only for entries with duration)
  const durationsWithValue = data.filter(d => d.duration !== null).map(d => d.duration!);
  const avgDuration = durationsWithValue.length > 0
    ? durationsWithValue.reduce((sum, d) => sum + d, 0) / durationsWithValue.length
    : 0;
  
  // Calculate bounce rate
  const bouncedSessions = new Set(
    data.filter(d => d.isBounce).map(d => d.sessionId)
  ).size;
  const bounceRate = uniqueSessions > 0 ? (bouncedSessions / uniqueSessions) * 100 : 0;
  
  return {
    pageViews,
    visits: uniqueSessions,
    visitors: uniqueVisitors,
    avgDuration: Math.round(avgDuration),
    bounceRate: Math.round(bounceRate * 10) / 10, // Round to 1 decimal
  };
}

// Mark user as having seen the welcome modal
export async function markUserWelcomeSeen(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set({ hasSeenWelcome: true }).where(eq(users.id, userId));
}

// Get upcoming available slots for homepage display
export async function getUpcomingAvailableSlots(limit: number = 6): Promise<AvailabilitySlot[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const now = new Date();
  
  const result = await db.select()
    .from(availabilitySlots)
    .where(
      and(
        gte(availabilitySlots.startTime, now),
        eq(availabilitySlots.isBooked, false)
      )
    )
    .orderBy(availabilitySlots.startTime)
    .limit(limit);
  
  // Calculate spots left for each slot
  return result.map(slot => ({
    ...slot,
    spotsLeft: slot.capacity - slot.currentBookings,
  })) as AvailabilitySlot[];
}

// ==================== User Management ====================

/**
 * List users with pagination, search, and filters
 */
export async function listUsers(params: {
  page: number;
  limit: number;
  search?: string;
  roleFilter?: 'all' | 'admin' | 'user';
  courseFilter?: number;
}): Promise<{ users: User[]; total: number; pages: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { page, limit, search, roleFilter, courseFilter } = params;
  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions: SQL[] = [];

  // Role filter
  if (roleFilter && roleFilter !== 'all') {
    conditions.push(eq(users.role, roleFilter));
  }

  // Search filter (name or email)
  if (search && search.trim()) {
    conditions.push(
      or(
        like(users.name, `%${search.trim()}%`),
        like(users.email, `%${search.trim()}%`)
      )!
    );
  }

  // Course filter (users enrolled in specific course)
  if (courseFilter) {
    const enrolledUserIds = await db
      .select({ userId: userCourseEnrollments.userId })
      .from(userCourseEnrollments)
      .where(eq(userCourseEnrollments.courseId, courseFilter));
    
    const userIds = enrolledUserIds.map(e => e.userId);
    if (userIds.length > 0) {
      conditions.push(inArray(users.id, userIds));
    } else {
      // No users enrolled in this course
      return { users: [], total: 0, pages: 0 };
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(whereClause);
  const total = Number(countResult[0]?.count || 0);

  // Get paginated users
  const result = await db
    .select()
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const pages = Math.ceil(total / limit);

  return { users: result, total, pages };
}

/**
 * Create a new user manually (admin action)
 */
export async function createUserManually(
  data: { name: string; email: string; role: 'user' | 'admin' },
  createdBy: number
): Promise<User> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if email already exists
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, data.email))
    .limit(1);

  if (existing.length > 0) {
    throw new Error("User with this email already exists");
  }

  // Generate unique openId for manual user creation
  const openId = `manual_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const result = await db.insert(users).values({
    openId,
    name: data.name,
    email: data.email,
    role: data.role,
    loginMethod: 'manual',
    hasSeenWelcome: true,
  });

  // Query the newly created user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return user;
}

/**
 * Delete a user and all their enrollments
 */
export async function deleteUser(userId: number): Promise<{ success: boolean; hadActiveCourses: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if user has active course enrollments
  const enrollments = await db
    .select()
    .from(userCourseEnrollments)
    .where(eq(userCourseEnrollments.userId, userId));

  const hadActiveCourses = enrollments.length > 0;

  // Delete all enrollments first (cascade)
  if (hadActiveCourses) {
    await db
      .delete(userCourseEnrollments)
      .where(eq(userCourseEnrollments.userId, userId));
  }

  // Delete user
  await db.delete(users).where(eq(users.id, userId));

  return { success: true, hadActiveCourses };
}

// ==================== Course Assignment Management ====================

/**
 * Get all courses enrolled by a specific user
 */
export async function getUserEnrolledCourses(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select({
      enrollment: userCourseEnrollments,
      course: courses,
    })
    .from(userCourseEnrollments)
    .innerJoin(courses, eq(userCourseEnrollments.courseId, courses.id))
    .where(eq(userCourseEnrollments.userId, userId))
    .orderBy(desc(userCourseEnrollments.enrolledAt));

  return result.map(r => ({
    ...r.enrollment,
    course: r.course,
  }));
}

/**
 * Assign a course to a user
 */
export async function assignCourseToUser(
  userId: number,
  courseId: number,
  enrolledBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if enrollment already exists
  const existing = await db
    .select()
    .from(userCourseEnrollments)
    .where(
      and(
        eq(userCourseEnrollments.userId, userId),
        eq(userCourseEnrollments.courseId, courseId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    throw new Error("User is already enrolled in this course");
  }

  const [enrollment] = await db.insert(userCourseEnrollments).values({
    userId,
    courseId,
    enrolledBy,
    status: 'active',
  });

  return enrollment;
}

/**
 * Remove a course from a user
 */
export async function removeCourseFromUser(userId: number, courseId: number): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(userCourseEnrollments)
    .where(
      and(
        eq(userCourseEnrollments.userId, userId),
        eq(userCourseEnrollments.courseId, courseId)
      )
    );

  return { success: true };
}

/**
 * Bulk assign courses to multiple users
 */
export async function bulkAssignCourses(
  userIds: number[],
  courseIds: number[],
  enrolledBy: number
): Promise<{ created: number; skipped: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let created = 0;
  let skipped = 0;

  // Generate all combinations of userIds and courseIds
  for (const userId of userIds) {
    for (const courseId of courseIds) {
      try {
        // Check if enrollment already exists
        const existing = await db
          .select()
          .from(userCourseEnrollments)
          .where(
            and(
              eq(userCourseEnrollments.userId, userId),
              eq(userCourseEnrollments.courseId, courseId)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        await db.insert(userCourseEnrollments).values({
          userId,
          courseId,
          enrolledBy,
          status: 'active',
        });

        created++;
      } catch (error) {
        // Skip on error (e.g., duplicate key)
        skipped++;
      }
    }
  }

  return { created, skipped };
}

/**
 * Bulk remove courses from multiple users
 */
export async function bulkRemoveCourses(
  userIds: number[],
  courseIds: number[]
): Promise<{ removed: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete all matching combinations
  const result = await db
    .delete(userCourseEnrollments)
    .where(
      and(
        inArray(userCourseEnrollments.userId, userIds),
        inArray(userCourseEnrollments.courseId, courseIds)
      )
    );

  // Return success (actual count not available from delete operation)
  return { removed: userIds.length * courseIds.length };
}

// ============================================================================
// Course Content Management (Modules & Lessons)
// ============================================================================

/**
 * Get all modules for a course, ordered by order field
 */
export async function getCourseModules(courseId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db
    .select()
    .from(courseModules)
    .where(eq(courseModules.courseId, courseId))
    .orderBy(courseModules.order);
}

/**
 * Get all lessons for a module, ordered by order field
 */
export async function getModuleLessons(moduleId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db
    .select()
    .from(courseLessons)
    .where(eq(courseLessons.moduleId, moduleId))
    .orderBy(courseLessons.order);
}

/**
 * Create a new course module
 */
export async function createCourseModule(data: {
  courseId: number;
  title: string;
  description?: string;
  order?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [module] = await db
    .insert(courseModules)
    .values({
      courseId: data.courseId,
      title: data.title,
      description: data.description || null,
      order: data.order || 0,
      isPublished: true,
    })
    .$returningId();
  
  return module;
}

/**
 * Update a course module
 */
export async function updateCourseModule(
  id: number,
  updates: {
    title?: string;
    description?: string;
    videoUrl?: string;
    videoKey?: string;
    order?: number;
    isPublished?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(courseModules)
    .set(updates)
    .where(eq(courseModules.id, id));
  
  return { success: true };
}

/**
 * Delete a course module and all its lessons
 */
export async function deleteCourseModule(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // First delete all lessons in this module
  await db
    .delete(courseLessons)
    .where(eq(courseLessons.moduleId, id));
  
  // Then delete the module
  await db
    .delete(courseModules)
    .where(eq(courseModules.id, id));
  
  return { success: true };
}

/**
 * Create a new course lesson
 */
export async function createCourseLesson(data: {
  moduleId: number;
  courseId: number;
  title: string;
  description?: string;
  videoUrl?: string;
  videoKey?: string;
  duration?: number;
  content?: string;
  order?: number;
  isFree?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [lesson] = await db
    .insert(courseLessons)
    .values({
      moduleId: data.moduleId,
      courseId: data.courseId,
      title: data.title,
      description: data.description || null,
      videoUrl: data.videoUrl || null,
      videoKey: data.videoKey || null,
      duration: data.duration || null,
      content: data.content || null,
      order: data.order || 0,
      isFree: data.isFree || false,
      isPublished: true,
    })
    .$returningId();
  
  return lesson;
}

/**
 * Update a course lesson
 */
export async function updateCourseLesson(
  id: number,
  updates: {
    title?: string;
    description?: string;
    videoUrl?: string;
    videoKey?: string;
    duration?: number;
    content?: string;
    order?: number;
    isPublished?: boolean;
    isFree?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(courseLessons)
    .set(updates)
    .where(eq(courseLessons.id, id));
  
  return { success: true };
}

/**
 * Delete a course lesson
 */
export async function deleteCourseLesson(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Delete user progress for this lesson
  await db
    .delete(userLessonProgress)
    .where(eq(userLessonProgress.lessonId, id));
  
  // Delete the lesson
  await db
    .delete(courseLessons)
    .where(eq(courseLessons.id, id));
  
  return { success: true };
}

/**
 * Reorder course modules
 */
export async function reorderCourseModules(courseId: number, moduleIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Update order for each module
  for (let i = 0; i < moduleIds.length; i++) {
    await db
      .update(courseModules)
      .set({ order: i })
      .where(
        and(
          eq(courseModules.id, moduleIds[i]),
          eq(courseModules.courseId, courseId)
        )
      );
  }
  
  return { success: true };
}

/**
 * Reorder module lessons
 */
export async function reorderModuleLessons(moduleId: number, lessonIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Update order for each lesson
  for (let i = 0; i < lessonIds.length; i++) {
    await db
      .update(courseLessons)
      .set({ order: i })
      .where(
        and(
          eq(courseLessons.id, lessonIds[i]),
          eq(courseLessons.moduleId, moduleId)
        )
      );
  }
  
  return { success: true };
}

/**
 * Get visual settings (returns first row or null)
 */
export async function getVisualSettings(): Promise<VisualSettings | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const settings = await db.select().from(visualSettings).limit(1);
  return settings[0] || null;
}

/**
 * Update or create visual settings
 */
export async function upsertVisualSettings(data: Partial<InsertVisualSettings> & { updatedBy: number }): Promise<VisualSettings> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await getVisualSettings();
  
  if (existing) {
    // Update existing
    await db
      .update(visualSettings)
      .set(data)
      .where(eq(visualSettings.id, existing.id));
    
    const updated = await getVisualSettings();
    if (!updated) throw new Error("Failed to retrieve updated settings");
    return updated;
  } else {
    // Insert new
    const [inserted] = await db
      .insert(visualSettings)
      .values(data as InsertVisualSettings)
      .$returningId();
    
    const created = await db
      .select()
      .from(visualSettings)
      .where(eq(visualSettings.id, inserted.id))
      .limit(1);
    
    if (!created[0]) throw new Error("Failed to retrieve created settings");
    return created[0];
  }
}

/**
 * Get course modules with their lessons for the course learning page
 */
export async function getCourseModulesWithLessons(courseId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const modules = await db
    .select()
    .from(courseModules)
    .where(and(
      eq(courseModules.courseId, courseId),
      eq(courseModules.isPublished, true)
    ))
    .orderBy(courseModules.order);
  
  const modulesWithLessons = await Promise.all(
    modules.map(async (module) => {
      const lessons = await db
        .select()
        .from(courseLessons)
        .where(and(
          eq(courseLessons.moduleId, module.id),
          eq(courseLessons.isPublished, true)
        ))
        .orderBy(courseLessons.order);
      
      return {
        ...module,
        lessons,
      };
    })
  );
  
  return modulesWithLessons;
}

/**
 * Get user's progress for a specific course
 */
export async function getUserCourseProgress(userId: number, courseId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db
    .select()
    .from(userLessonProgress)
    .where(and(
      eq(userLessonProgress.userId, userId),
      eq(userLessonProgress.courseId, courseId)
    ));
}

/**
 * Mark a lesson as completed for a user
 */
export async function markLessonComplete(userId: number, lessonId: number, courseId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await db
    .select()
    .from(userLessonProgress)
    .where(and(
      eq(userLessonProgress.userId, userId),
      eq(userLessonProgress.lessonId, lessonId)
    ))
    .limit(1);
  
  if (existing.length > 0) {
    // Update existing progress
    await db
      .update(userLessonProgress)
      .set({
        isCompleted: true,
        completedAt: new Date(),
        lastWatchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(userLessonProgress.id, existing[0].id));
    
    return existing[0];
  } else {
    // Create new progress entry
    const [inserted] = await db
      .insert(userLessonProgress)
      .values({
        userId,
        lessonId,
        courseId,
        isCompleted: true,
        completedAt: new Date(),
        lastWatchedAt: new Date(),
        watchedDuration: 0,
      })
      .$returningId();
    
    const created = await db
      .select()
      .from(userLessonProgress)
      .where(eq(userLessonProgress.id, inserted.id))
      .limit(1);
    
    return created[0];
  }
}

/**
 * Update lesson watch progress for a user
 */
export async function updateLessonProgress(
  userId: number,
  lessonId: number,
  courseId: number,
  watchedDuration: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await db
    .select()
    .from(userLessonProgress)
    .where(and(
      eq(userLessonProgress.userId, userId),
      eq(userLessonProgress.lessonId, lessonId)
    ))
    .limit(1);
  
  if (existing.length > 0) {
    // Update existing progress
    await db
      .update(userLessonProgress)
      .set({
        watchedDuration,
        lastWatchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(userLessonProgress.id, existing[0].id));
    
    return existing[0];
  } else {
    // Create new progress entry
    const [inserted] = await db
      .insert(userLessonProgress)
      .values({
        userId,
        lessonId,
        courseId,
        isCompleted: false,
        lastWatchedAt: new Date(),
        watchedDuration,
      })
      .$returningId();
    
    const created = await db
      .select()
      .from(userLessonProgress)
      .where(eq(userLessonProgress.id, inserted.id))
      .limit(1);
    
    return created[0];
  }
}
