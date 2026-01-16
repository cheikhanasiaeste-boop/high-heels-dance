import { eq, and, desc, isNull, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
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
  InsertTestimonial
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

export async function getAllTestimonials(): Promise<Testimonial[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(testimonials)
    .orderBy(desc(testimonials.createdAt));
  
  return result;
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
