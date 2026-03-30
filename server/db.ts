import { eq, and, desc, asc, isNull, gte, lte, or, like, inArray, ne, sql, SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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
  InsertVisualSettings,
  messages,
  Message,
  InsertMessage
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _dbTested = false;

export async function getDb() {
  if (_dbTested) return _db;

  if (process.env.SUPABASE_DATABASE_URL) {
    try {
      const client = postgres(process.env.SUPABASE_DATABASE_URL, {
        connect_timeout: 10,
        idle_timeout: 20,
        max_lifetime: 60 * 30,
      });
      const testDb = drizzle(client);
      // Eagerly test the connection so we know if it works
      await testDb.execute(sql`SELECT 1`);
      _db = testDb;
      console.log("[Database] Direct PostgreSQL connection established");
    } catch (error) {
      console.warn("[Database] Direct PostgreSQL unavailable, using REST API fallback:", (error as Error).message);
      _db = null;
    }
  }
  _dbTested = true;
  return _db;
}

/**
 * Supabase REST API client for database operations.
 * Used as fallback when direct PostgreSQL is unreachable (e.g. IPv6-only on Render).
 */
import { supabaseAdmin } from "./lib/supabase";

export function restFrom(table: string) {
  return supabaseAdmin.from(table);
}

/**
 * Look up a user by their Supabase auth UUID.
 * Used in createContext on every tRPC request.
 * Falls back to Supabase REST API if direct PostgreSQL is unavailable.
 */
export async function getUserBySupabaseId(supabaseId: string): Promise<User | null> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.supabaseId, supabaseId))
        .limit(1);
      return result[0] ?? null;
    } catch (e) {
      console.warn("[Database] Direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }
  // REST API fallback
  try {
    const { supabaseAdmin } = await import("./lib/supabase");
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("supabaseId", supabaseId)
      .limit(1)
      .single();
    if (error || !data) return null;
    return data as User;
  } catch {
    return null;
  }
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return result.length > 0 ? result[0] : undefined;
    } catch (e) { console.warn("[DB Fallback] getUserByEmail:", (e as Error).message); }
  }
  const { data } = await restFrom("users").select("*").eq("email", email).limit(1).single();
  return (data ?? undefined) as User | undefined;
}

/**
 * Provision or link a user row after Supabase Auth sign-in.
 * Called by auth.syncUser tRPC mutation on every SIGNED_IN event.
 *
 * Logic:
 *   1. Row exists with matching supabaseId → update lastSignedIn, return (fast path).
 *   2. Row exists with matching email → link by setting supabaseId (account linking safety net).
 *   3. Neither → insert new users row.
 */
export async function syncUser(params: {
  supabaseId: string;
  name: string | null;
  email: string | null;
}): Promise<User> {
  const db = await getDb();

  if (db) {
    try {
      return await syncUserDrizzle(db, params);
    } catch (e) {
      console.warn("[Database] Direct syncUser failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  return syncUserRest(params);
}

async function syncUserDrizzle(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, params: {
  supabaseId: string;
  name: string | null;
  email: string | null;
}): Promise<User> {
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

  // 2. Email match: link existing account
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

async function syncUserRest(params: {
  supabaseId: string;
  name: string | null;
  email: string | null;
}): Promise<User> {
  const { supabaseAdmin } = await import("./lib/supabase");

  // 1. Check if user already exists by supabaseId
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("supabaseId", params.supabaseId)
    .limit(1)
    .single();

  if (existing) {
    await supabaseAdmin
      .from("users")
      .update({ lastSignedIn: new Date().toISOString() })
      .eq("supabaseId", params.supabaseId);
    return existing as User;
  }

  // 2. Check by email
  if (params.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("email", params.email)
      .limit(1)
      .single();

    if (byEmail) {
      await supabaseAdmin
        .from("users")
        .update({ supabaseId: params.supabaseId, lastSignedIn: new Date().toISOString() })
        .eq("id", byEmail.id);
      return { ...byEmail, supabaseId: params.supabaseId } as User;
    }
  }

  // 3. New user
  const adminEmail = process.env.ADMIN_EMAIL;
  const role = adminEmail && params.email === adminEmail ? "admin" : "user";

  const { data: inserted, error } = await supabaseAdmin
    .from("users")
    .insert({
      supabaseId: params.supabaseId,
      name: params.name,
      email: params.email,
      role,
      lastSignedIn: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !inserted) throw new Error(`Failed to create user: ${error?.message}`);
  return inserted as User;
}

// Course queries
export async function getAllPublishedCourses(): Promise<Course[]> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db
        .select()
        .from(courses)
        .where(eq(courses.isPublished, true))
        .orderBy(desc(courses.createdAt));
      return result;
    } catch (e) {
      console.warn("[Database] Direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }
  // REST API fallback
  try {
    const { supabaseAdmin } = await import("./lib/supabase");
    const { data, error } = await supabaseAdmin
      .from("courses")
      .select("*")
      .eq("isPublished", true)
      .order("createdAt", { ascending: false });
    if (error || !data) return [];
    return data as Course[];
  } catch {
    return [];
  }
}

export async function getAllCourses(): Promise<Course[]> {
  const db = await getDb();
  if (db) {
    try {
      return await db.select().from(courses).orderBy(desc(courses.createdAt));
    } catch (e) { console.warn("[DB Fallback] getAllCourses:", (e as Error).message); }
  }
  const { data } = await restFrom("courses").select("*").order("createdAt", { ascending: false });
  return (data ?? []) as Course[];
}

export async function getCourseById(id: number): Promise<Course | undefined> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
      return result[0];
    } catch (e) { console.warn("[DB Fallback] getCourseById:", (e as Error).message); }
  }
  const { data } = await restFrom("courses").select("*").eq("id", id).limit(1).single();
  return (data ?? undefined) as Course | undefined;
}

export async function createCourse(course: InsertCourse): Promise<Course> {
  const db = await getDb();
  if (db) {
    try { return (await db.insert(courses).values(course).returning())[0]; }
    catch (e) { console.warn("[DB Fallback] createCourse:", (e as Error).message); }
  }
  const { data, error } = await restFrom("courses").insert(course as any).select("*").single();
  if (error || !data) throw new Error(error?.message || "Insert failed");
  return data as Course;
}

export async function updateCourse(id: number, course: Partial<InsertCourse>): Promise<Course | undefined> {
  const db = await getDb();
  if (db) {
    try {
      await db.update(courses).set(course).where(eq(courses.id, id));
      return getCourseById(id);
    } catch (e) { console.warn("[DB Fallback] updateCourse:", (e as Error).message); }
  }
  const { data } = await restFrom("courses").update(course as any).eq("id", id).select("*").single();
  return (data ?? undefined) as Course | undefined;
}

export async function deleteCourse(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try { await db.delete(courses).where(eq(courses.id, id)); return; }
    catch (e) { console.warn("[DB Fallback] deleteCourse:", (e as Error).message); }
  }
  await restFrom("courses").delete().eq("id", id);
}

// Purchase queries
export async function createPurchase(purchase: InsertPurchase): Promise<Purchase> {
  const db = await getDb();
  if (db) {
    try { return (await db.insert(purchases).values(purchase).returning())[0]; }
    catch (e) { console.warn("[DB Fallback] createPurchase:", (e as Error).message); }
  }
  const { data, error } = await restFrom("purchases").insert(purchase as any).select("*").single();
  if (error || !data) throw new Error(error?.message || "Insert failed");
  return data as Purchase;
}

export async function getUserPurchases(userId: number): Promise<Purchase[]> {
  const db = await getDb();
  if (db) {
    try {
      return await db.select().from(purchases).where(eq(purchases.userId, userId)).orderBy(desc(purchases.purchasedAt));
    } catch (e) { console.warn("[DB Fallback] getUserPurchases:", (e as Error).message); }
  }
  const { data } = await restFrom("purchases").select("*").eq("userId", userId).order("purchasedAt", { ascending: false });
  return (data ?? []) as Purchase[];
}

export async function hasUserPurchasedCourse(userId: number, courseId: number): Promise<boolean> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(purchases).where(
        and(eq(purchases.userId, userId), eq(purchases.courseId, courseId), eq(purchases.status, "completed"))
      ).limit(1);
      return result.length > 0;
    } catch (e) { console.warn("[DB Fallback] hasUserPurchasedCourse:", (e as Error).message); }
  }
  const { data } = await restFrom("purchases").select("id").eq("userId", userId).eq("courseId", courseId).eq("status", "completed").limit(1);
  return (data ?? []).length > 0;
}

export async function updatePurchaseStatus(id: number, status: "pending" | "completed" | "failed"): Promise<void> {
  const db = await getDb();
  if (db) {
    try { await db.update(purchases).set({ status }).where(eq(purchases.id, id)); return; }
    catch (e) { console.warn("[DB Fallback] updatePurchaseStatus:", (e as Error).message); }
  }
  await restFrom("purchases").update({ status } as any).eq("id", id);
}

// Site settings queries
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
      return result[0]?.value ?? null;
    } catch (e) { console.warn("[DB Fallback] getSetting:", (e as Error).message); }
  }
  const { data } = await restFrom("siteSettings").select("value").eq("key", key).limit(1).single();
  return (data as any)?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.insert(siteSettings).values({ key, value }).onConflictDoUpdate({ target: siteSettings.key, set: { value } });
      return;
    } catch (e) { console.warn("[DB Fallback] setSetting:", (e as Error).message); }
  }
  const { data: existing } = await restFrom("siteSettings").select("id").eq("key", key).limit(1).single();
  if (existing) {
    await restFrom("siteSettings").update({ value } as any).eq("key", key);
  } else {
    await restFrom("siteSettings").insert({ key, value } as any);
  }
}

// Chat message queries
export async function createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
  const db = await getDb();
  if (db) {
    try { return (await db.insert(chatMessages).values(message).returning())[0]; }
    catch (e) { console.warn("[DB Fallback] createChatMessage:", (e as Error).message); }
  }
  const { data, error } = await restFrom("chatMessages").insert(message as any).select("*").single();
  if (error || !data) throw new Error(error?.message || "Insert failed");
  return data as ChatMessage;
}

export async function getChatHistory(userId: number | null, limit: number = 50): Promise<ChatMessage[]> {
  const db = await getDb();
  if (db) {
    try {
      const query = userId !== null
        ? db.select().from(chatMessages).where(eq(chatMessages.userId, userId))
        : db.select().from(chatMessages).where(isNull(chatMessages.userId));
      const result = await query.orderBy(desc(chatMessages.createdAt)).limit(limit);
      return result.reverse();
    } catch (e) { console.warn("[DB Fallback] getChatHistory:", (e as Error).message); }
  }
  let q = restFrom("chatMessages").select("*");
  if (userId !== null) {
    q = q.eq("userId", userId);
  } else {
    q = q.is("userId", null);
  }
  const { data } = await q.order("createdAt", { ascending: false }).limit(limit);
  return ((data ?? []) as ChatMessage[]).reverse();
}

// Availability slot queries
export async function createAvailabilitySlot(slot: InsertAvailabilitySlot): Promise<AvailabilitySlot> {
  const db = await getDb();
  if (db) {
    try { return (await db.insert(availabilitySlots).values(slot).returning())[0]; }
    catch (e) { console.warn("[DB Fallback] createAvailabilitySlot:", (e as Error).message); }
  }
  const { data, error } = await restFrom("availabilitySlots").insert(slot as any).select("*").single();
  if (error || !data) throw new Error(error?.message || "Insert failed");
  return data as AvailabilitySlot;
}

export async function getAvailableSlots(startDate?: Date, endDate?: Date): Promise<AvailabilitySlot[]> {
  const db = await getDb();
  let allSlots: AvailabilitySlot[] | null = null;
  if (db) {
    try {
      allSlots = await db.select().from(availabilitySlots).orderBy(availabilitySlots.startTime);
    } catch (e) { console.warn("[DB Fallback] getAvailableSlots:", (e as Error).message); }
  }
  if (!allSlots) {
    const { data } = await restFrom("availabilitySlots").select("*").order("startTime", { ascending: true });
    allSlots = (data ?? []) as AvailabilitySlot[];
  }
  return allSlots.filter(slot => {
    if (slot.sessionType === 'group') {
      return slot.currentBookings < slot.capacity;
    } else {
      return !slot.isBooked;
    }
  });
}

export async function getAllAvailabilitySlots(): Promise<AvailabilitySlot[]> {
  const db = await getDb();
  if (db) {
    try {
      return await db.select().from(availabilitySlots).orderBy(availabilitySlots.startTime);
    } catch (e) { console.warn("[DB Fallback] getAllAvailabilitySlots:", (e as Error).message); }
  }
  const { data } = await restFrom("availabilitySlots").select("*").order("startTime", { ascending: true });
  return (data ?? []) as AvailabilitySlot[];
}

export async function getAvailabilitySlotById(id: number): Promise<AvailabilitySlot | undefined> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(availabilitySlots).where(eq(availabilitySlots.id, id)).limit(1);
      return result[0];
    } catch (e) { console.warn("[DB Fallback] getAvailabilitySlotById:", (e as Error).message); }
  }
  const { data } = await restFrom("availabilitySlots").select("*").eq("id", id).limit(1).single();
  return (data ?? undefined) as AvailabilitySlot | undefined;
}

// Removed getAvailabilitySlotByZoomId - no longer needed with Google Meet

export async function updateAvailabilitySlot(id: number, updates: Partial<InsertAvailabilitySlot>): Promise<void> {
  const db = await getDb();
  if (db) {
    try { await db.update(availabilitySlots).set(updates).where(eq(availabilitySlots.id, id)); return; }
    catch (e) { console.warn("[DB Fallback] updateAvailabilitySlot:", (e as Error).message); }
  }
  await restFrom("availabilitySlots").update(updates as any).eq("id", id);
}

export async function deleteAvailabilitySlot(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try { await db.delete(availabilitySlots).where(eq(availabilitySlots.id, id)); return; }
    catch (e) { console.warn("[DB Fallback] deleteAvailabilitySlot:", (e as Error).message); }
  }
  await restFrom("availabilitySlots").delete().eq("id", id);
}

// Booking queries
export async function createBooking(booking: InsertBooking): Promise<Booking> {
  const db = await getDb();
  if (db) {
    try { return (await db.insert(bookings).values(booking).returning())[0]; }
    catch (e) { console.warn("[DB Fallback] createBooking:", (e as Error).message); }
  }
  const { data, error } = await restFrom("bookings").insert(booking as any).select("*").single();
  if (error || !data) throw new Error(error?.message || "Insert failed");
  return data as Booking;
}

export async function getUserBookings(userId: number): Promise<Booking[]> {
  const db = await getDb();
  if (db) {
    try {
      return await db.select().from(bookings).where(eq(bookings.userId, userId)).orderBy(desc(bookings.bookedAt));
    } catch (e) { console.warn("[DB Fallback] getUserBookings:", (e as Error).message); }
  }
  const { data } = await restFrom("bookings").select("*").eq("userId", userId).order("bookedAt", { ascending: false });
  return (data ?? []) as Booking[];
}

export async function getUserBookingsWithSlots(userId: number) {
  const db = await getDb();
  if (db) {
    try {
      const result = await db
        .select({
          id: bookings.id,
          userId: bookings.userId,
          slotId: bookings.slotId,
          sessionType: bookings.sessionType,
          meetLink: bookings.meetLink,
          status: bookings.status,
          notes: bookings.notes,
          paymentRequired: bookings.paymentRequired,
          paymentStatus: bookings.paymentStatus,
          bookedAt: bookings.bookedAt,
          slot: {
            id: availabilitySlots.id,
            startTime: availabilitySlots.startTime,
            endTime: availabilitySlots.endTime,
            eventType: availabilitySlots.eventType,
            location: availabilitySlots.location,
            title: availabilitySlots.title,
            description: availabilitySlots.description,
            meetLink: availabilitySlots.meetLink,
            zoomMeetingId: availabilitySlots.zoomMeetingId,
          },
        })
        .from(bookings)
        .leftJoin(availabilitySlots, eq(bookings.slotId, availabilitySlots.id))
        .where(eq(bookings.userId, userId))
        .orderBy(desc(bookings.bookedAt));
      return result;
    } catch (e) { console.warn("[DB Fallback] getUserBookingsWithSlots:", (e as Error).message); }
  }
  // REST fallback: fetch bookings then slots separately
  const { data: bookingsData } = await restFrom("bookings").select("*").eq("userId", userId).order("bookedAt", { ascending: false });
  const bookingsList = (bookingsData ?? []) as Booking[];
  const slotIds = Array.from(new Set(bookingsList.map(b => b.slotId)));
  let slotsMap: Record<number, any> = {};
  if (slotIds.length > 0) {
    const { data: slotsData } = await restFrom("availabilitySlots").select("*").in("id", slotIds);
    for (const s of (slotsData ?? []) as any[]) { slotsMap[s.id] = s; }
  }
  return bookingsList.map(b => ({
    id: b.id, userId: b.userId, slotId: b.slotId, sessionType: b.sessionType,
    meetLink: b.meetLink, status: b.status, notes: b.notes,
    paymentRequired: b.paymentRequired, paymentStatus: b.paymentStatus, bookedAt: b.bookedAt,
    slot: slotsMap[b.slotId] ? {
      id: slotsMap[b.slotId].id, startTime: slotsMap[b.slotId].startTime,
      endTime: slotsMap[b.slotId].endTime, eventType: slotsMap[b.slotId].eventType,
      location: slotsMap[b.slotId].location, title: slotsMap[b.slotId].title,
      description: slotsMap[b.slotId].description, meetLink: slotsMap[b.slotId].meetLink,
      zoomMeetingId: slotsMap[b.slotId].zoomMeetingId,
    } : null,
  }));
}

export async function getAllBookings(): Promise<Booking[]> {
  const db = await getDb();
  if (db) {
    try {
      return await db.select().from(bookings).orderBy(desc(bookings.bookedAt));
    } catch (e) { console.warn("[DB Fallback] getAllBookings:", (e as Error).message); }
  }
  const { data } = await restFrom("bookings").select("*").order("bookedAt", { ascending: false });
  return (data ?? []) as Booking[];
}

export async function getBookingById(id: number): Promise<Booking | undefined> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
      return result[0];
    } catch (e) { console.warn("[DB Fallback] getBookingById:", (e as Error).message); }
  }
  const { data } = await restFrom("bookings").select("*").eq("id", id).limit(1).single();
  return (data ?? undefined) as Booking | undefined;
}

export async function updateBooking(id: number, updates: Partial<InsertBooking>): Promise<void> {
  const db = await getDb();
  if (db) {
    try { await db.update(bookings).set(updates).where(eq(bookings.id, id)); return; }
    catch (e) { console.warn("[DB Fallback] updateBooking:", (e as Error).message); }
  }
  await restFrom("bookings").update(updates as any).eq("id", id);
}

export async function cancelBooking(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try { await db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, id)); return; }
    catch (e) { console.warn("[DB Fallback] cancelBooking:", (e as Error).message); }
  }
  await restFrom("bookings").update({ status: "cancelled" } as any).eq("id", id);
}

// ==================== Testimonials ====================

export async function createTestimonial(testimonial: InsertTestimonial): Promise<Testimonial> {
  const db = await getDb();
  if (db) {
    try { return (await db.insert(testimonials).values(testimonial).returning())[0]; }
    catch (e) { console.warn("[DB Fallback] createTestimonial:", (e as Error).message); }
  }
  const { data, error } = await restFrom("testimonials").insert(testimonial as any).select("*").single();
  if (error || !data) throw new Error(error?.message || "Insert failed");
  return data as Testimonial;
}

export async function getApprovedTestimonials(): Promise<Testimonial[]> {
  const db = await getDb();
  if (db) {
    try {
      return await db.select().from(testimonials).where(eq(testimonials.status, "approved"))
        .orderBy(desc(testimonials.isFeatured), desc(testimonials.createdAt));
    } catch (e) { console.warn("[DB Fallback] getApprovedTestimonials:", (e as Error).message); }
  }
  const { data } = await restFrom("testimonials").select("*").eq("status", "approved")
    .order("isFeatured", { ascending: false }).order("createdAt", { ascending: false });
  return (data ?? []) as Testimonial[];
}

export async function getAllTestimonials(): Promise<(Testimonial & { courseName?: string })[]> {
  const db = await getDb();
  if (db) {
    try {
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
    } catch (e) { console.warn("[DB Fallback] getAllTestimonials:", (e as Error).message); }
  }
  // REST fallback: get testimonials then enrich with course names
  const { data: testimonialsData } = await restFrom("testimonials").select("*").order("createdAt", { ascending: false });
  const list = (testimonialsData ?? []) as Testimonial[];
  const relatedIds = Array.from(new Set(list.filter(t => t.relatedId).map(t => t.relatedId!)));
  let courseMap: Record<number, string> = {};
  if (relatedIds.length > 0) {
    const { data: coursesData } = await restFrom("courses").select("id,title").in("id", relatedIds);
    for (const c of (coursesData ?? []) as any[]) { courseMap[c.id] = c.title; }
  }
  return list.map(t => ({ ...t, courseName: t.relatedId ? courseMap[t.relatedId] : undefined }));
}

export async function getTestimonialById(id: number): Promise<Testimonial | undefined> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(testimonials).where(eq(testimonials.id, id)).limit(1);
      return result[0];
    } catch (e) { console.warn("[DB Fallback] getTestimonialById:", (e as Error).message); }
  }
  const { data } = await restFrom("testimonials").select("*").eq("id", id).limit(1).single();
  return (data ?? undefined) as Testimonial | undefined;
}

export async function updateTestimonial(id: number, updates: Partial<InsertTestimonial>): Promise<void> {
  const db = await getDb();
  if (db) {
    try { await db.update(testimonials).set(updates).where(eq(testimonials.id, id)); return; }
    catch (e) { console.warn("[DB Fallback] updateTestimonial:", (e as Error).message); }
  }
  await restFrom("testimonials").update(updates as any).eq("id", id);
}

export async function deleteTestimonial(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try { await db.delete(testimonials).where(eq(testimonials.id, id)); return; }
    catch (e) { console.warn("[DB Fallback] deleteTestimonial:", (e as Error).message); }
  }
  await restFrom("testimonials").delete().eq("id", id);
}

export async function getUserTestimonialForItem(userId: number, type: "session" | "course", relatedId: number): Promise<Testimonial | undefined> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(testimonials).where(
        and(eq(testimonials.userId, userId), eq(testimonials.type, type), eq(testimonials.relatedId, relatedId))
      ).limit(1);
      return result[0];
    } catch (e) { console.warn("[DB Fallback] getUserTestimonialForItem:", (e as Error).message); }
  }
  const { data } = await restFrom("testimonials").select("*").eq("userId", userId).eq("type", type).eq("relatedId", relatedId).limit(1).single();
  return (data ?? undefined) as Testimonial | undefined;
}

// User Management Functions
export async function getAllUsers(): Promise<(typeof users.$inferSelect & { enrollmentCount: number })[]> {
  const db = await getDb();
  if (db) {
    try {
      const { sql } = await import("drizzle-orm");
      const result = await db
        .select({
          id: users.id,
          supabaseId: users.supabaseId,
          name: users.name,
          email: users.email,
          role: users.role,
          hasSeenWelcome: users.hasSeenWelcome,
          lastViewedByAdmin: users.lastViewedByAdmin,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          lastSignedIn: users.lastSignedIn,
          enrollmentCount: sql<number>`(
            SELECT COUNT(*)
            FROM ${userCourseEnrollments}
            WHERE ${userCourseEnrollments.userId} = ${users.id}
          )`,
        })
        .from(users)
        .orderBy(desc(users.createdAt));
      return result as (typeof users.$inferSelect & { enrollmentCount: number })[];
    } catch (e) { console.warn("[DB Fallback] getAllUsers:", (e as Error).message); }
  }
  const { data: usersData } = await restFrom("users").select("*").order("createdAt", { ascending: false });
  const allUsers = (usersData ?? []) as any[];
  // Get enrollment counts
  const { data: enrollments } = await restFrom("userCourseEnrollments").select("userId");
  const countMap: Record<number, number> = {};
  for (const e of (enrollments ?? []) as any[]) { countMap[e.userId] = (countMap[e.userId] || 0) + 1; }
  return allUsers.map(u => ({ ...u, enrollmentCount: countMap[u.id] || 0 }));
}

export async function updateUserRole(userId: number, role: "admin" | "user"): Promise<void> {
  const db = await getDb();
  if (db) {
    try { await db.update(users).set({ role }).where(eq(users.id, userId)); return; }
    catch (e) { console.warn("[DB Fallback] updateUserRole:", (e as Error).message); }
  }
  await restFrom("users").update({ role } as any).eq("id", userId);
}

export async function getUserById(userId: number): Promise<typeof users.$inferSelect | undefined> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      return result[0];
    } catch (e) { console.warn("[DB Fallback] getUserById:", (e as Error).message); }
  }
  const { data } = await restFrom("users").select("*").eq("id", userId).limit(1).single();
  return (data ?? undefined) as typeof users.$inferSelect | undefined;
}

// Dashboard Statistics
export async function getDashboardStats() {
  const db = await getDb();

  let allUsers: User[] | null = null;
  let allCourses: Course[] | null = null;
  let allPurchases: Purchase[] | null = null;
  let allBookings: Booking[] | null = null;

  if (db) {
    try {
      allUsers = await db.select().from(users);
      allCourses = await db.select().from(courses);
      allPurchases = await db.select().from(purchases);
      allBookings = await db.select().from(bookings);
    } catch (e) {
      console.warn("[DB Fallback] getDashboardStats:", (e as Error).message);
      allUsers = null;
    }
  }

  if (!allUsers) {
    const [u, c, p, b] = await Promise.all([
      restFrom("users").select("*"),
      restFrom("courses").select("*"),
      restFrom("purchases").select("*"),
      restFrom("bookings").select("*"),
    ]);
    allUsers = (u.data ?? []) as User[];
    allCourses = (c.data ?? []) as Course[];
    allPurchases = (p.data ?? []) as Purchase[];
    allBookings = (b.data ?? []) as Booking[];
  }

  const totalUsers = allUsers!.length;
  const totalCourses = allCourses!.length;
  const paidCourses = allCourses!.filter(c => !c.isFree).length;
  const freeCourses = allCourses!.filter(c => c.isFree).length;

  const coursePurchases = allPurchases!.length;
  const courseRevenue = allPurchases!.reduce((sum, p) => sum + parseFloat(p.amount), 0);

  const totalBookings = allBookings!.length;
  const confirmedBookings = allBookings!.filter(b => b.status === 'confirmed').length;
  const paidBookings = allBookings!.filter(b => b.amountPaid && parseFloat(b.amountPaid) > 0).length;
  const sessionRevenue = allBookings!
    .filter(b => b.amountPaid)
    .reduce((sum, b) => sum + parseFloat(b.amountPaid!), 0);

  const totalRevenue = courseRevenue + sessionRevenue;

  const courseSales = allPurchases!.reduce((acc, p) => {
    acc[p.courseId] = (acc[p.courseId] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const popularCourses = allCourses!
    .map(course => {
      const purchaseCount = courseSales[course.id] || 0;
      const revenue = allPurchases!
        .filter(p => p.courseId === course.id)
        .reduce((sum, p) => sum + parseFloat(p.amount), 0);
      return { id: course.id, title: course.title, purchaseCount, revenue };
    })
    .sort((a, b) => b.purchaseCount - a.purchaseCount)
    .slice(0, 5);

  return {
    totalUsers, totalCourses, paidCourses, freeCourses,
    totalRevenue, courseRevenue, sessionRevenue,
    coursePurchases, paidBookings, totalBookings, confirmedBookings,
    popularCourses,
  };
}

export async function getRevenueByPeriod() {
  const db = await getDb();

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

  let allPurchases: Purchase[] | null = null;
  let allBookings: Booking[] | null = null;

  if (db) {
    try {
      allPurchases = await db.select().from(purchases);
      allBookings = await db.select().from(bookings);
    } catch (e) { console.warn("[DB Fallback] getRevenueByPeriod:", (e as Error).message); }
  }
  if (!allPurchases) {
    const [p, b] = await Promise.all([
      restFrom("purchases").select("*"),
      restFrom("bookings").select("*"),
    ]);
    allPurchases = (p.data ?? []) as Purchase[];
    allBookings = (b.data ?? []) as Booking[];
  }

  const calculateRevenue = (startDate: Date, endDate: Date) => {
    const purchaseRevenue = allPurchases!
      .filter(p => { const pDate = new Date(p.purchasedAt); return pDate >= startDate && pDate < endDate; })
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const bookingRevenue = allBookings!
      .filter(b => { const bDate = new Date(b.bookedAt); return b.amountPaid && bDate >= startDate && bDate < endDate; })
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

  let allPurchases: Purchase[] | null = null;
  let allBookings: Booking[] | null = null;

  if (db) {
    try {
      allPurchases = await db.select().from(purchases).where(and(gte(purchases.purchasedAt, startDate), lte(purchases.purchasedAt, endDate)));
      allBookings = await db.select().from(bookings).where(and(gte(bookings.bookedAt, startDate), lte(bookings.bookedAt, endDate)));
    } catch (e) { console.warn("[DB Fallback] getRevenueTimeSeries:", (e as Error).message); }
  }
  if (!allPurchases) {
    const [p, b] = await Promise.all([
      restFrom("purchases").select("*").gte("purchasedAt", startDate.toISOString()).lte("purchasedAt", endDate.toISOString()),
      restFrom("bookings").select("*").gte("bookedAt", startDate.toISOString()).lte("bookedAt", endDate.toISOString()),
    ]);
    allPurchases = (p.data ?? []) as Purchase[];
    allBookings = (b.data ?? []) as Booking[];
  }

  const revenueByDate = new Map<string, number>();
  allPurchases!.forEach(p => {
    const date = new Date(p.purchasedAt).toISOString().split('T')[0];
    revenueByDate.set(date, (revenueByDate.get(date) || 0) + parseFloat(p.amount));
  });
  allBookings!.forEach(b => {
    const date = new Date(b.bookedAt).toISOString().split('T')[0];
    const amount = b.amountPaid ? parseFloat(b.amountPaid) : 0;
    revenueByDate.set(date, (revenueByDate.get(date) || 0) + amount);
  });

  return Array.from(revenueByDate.entries())
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getUserGrowthTimeSeries(startDate: Date, endDate: Date) {
  const db = await getDb();
  let allUsers: User[] | null = null;

  if (db) {
    try {
      allUsers = await db.select().from(users).where(and(gte(users.createdAt, startDate), lte(users.createdAt, endDate)));
    } catch (e) { console.warn("[DB Fallback] getUserGrowthTimeSeries:", (e as Error).message); }
  }
  if (!allUsers) {
    const { data } = await restFrom("users").select("*").gte("createdAt", startDate.toISOString()).lte("createdAt", endDate.toISOString());
    allUsers = (data ?? []) as User[];
  }

  const usersByDate = new Map<string, number>();
  allUsers.forEach(u => {
    const date = new Date(u.createdAt).toISOString().split('T')[0];
    usersByDate.set(date, (usersByDate.get(date) || 0) + 1);
  });

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
  if (db) {
    try {
      const { popupSettings } = await import("../drizzle/schema");
      const [popup] = await db.select().from(popupSettings).limit(1);
      return popup || null;
    } catch (e) { console.warn("[DB Fallback] getPopupSettings:", (e as Error).message); }
  }
  const { data } = await restFrom("popupSettings").select("*").limit(1).single();
  return (data as any) ?? null;
}

export async function upsertPopupSettings(data: any) {
  const db = await getDb();
  if (db) {
    try {
      const { popupSettings } = await import("../drizzle/schema");
      const existing = await getPopupSettings();
      if (existing) {
        await db.update(popupSettings).set({ ...data, updatedAt: new Date() }).where(eq(popupSettings.id, existing.id));
      } else {
        await db.insert(popupSettings).values(data);
      }
      return getPopupSettings();
    } catch (e) { console.warn("[DB Fallback] upsertPopupSettings:", (e as Error).message); }
  }
  const existing = await getPopupSettings();
  if (existing) {
    await restFrom("popupSettings").update({ ...data, updatedAt: new Date().toISOString() } as any).eq("id", existing.id);
  } else {
    await restFrom("popupSettings").insert(data as any);
  }
  return getPopupSettings();
}

export async function recordPopupInteraction(data: any) {
  const db = await getDb();
  if (db) {
    try {
      const { popupInteractions } = await import("../drizzle/schema");
      await db.insert(popupInteractions).values(data);
      return;
    } catch (e) { console.warn("[DB Fallback] recordPopupInteraction:", (e as Error).message); }
  }
  await restFrom("popupInteractions").insert(data as any);
}

export async function hasUserSeenPopup(userId: number | null, popupId: number) {
  if (!userId) return false;

  const db = await getDb();
  if (db) {
    try {
      const { popupInteractions } = await import("../drizzle/schema");
      const [interaction] = await db.select().from(popupInteractions)
        .where(and(eq(popupInteractions.userId, userId), eq(popupInteractions.popupId, popupId)))
        .limit(1);
      return !!interaction;
    } catch (e) { console.warn("[DB Fallback] hasUserSeenPopup:", (e as Error).message); }
  }
  const { data } = await restFrom("popupInteractions").select("id").eq("userId", userId).eq("popupId", popupId).limit(1);
  return (data ?? []).length > 0;
}

// ============================================================================
// Section Headings
// ============================================================================

export async function getAllSectionHeadings() {
  const db = await getDb();
  if (db) {
    try {
      const { sectionHeadings } = await import("../drizzle/schema");
      const { asc } = await import("drizzle-orm");
      return await db.select().from(sectionHeadings).orderBy(asc(sectionHeadings.displayOrder));
    } catch (e) { console.warn("[DB Fallback] getAllSectionHeadings:", (e as Error).message); }
  }
  const { data } = await restFrom("sectionHeadings").select("*").order("displayOrder", { ascending: true });
  return (data ?? []) as any[];
}

export async function getSectionHeading(section: string) {
  const db = await getDb();
  if (db) {
    try {
      const { sectionHeadings } = await import("../drizzle/schema");
      const [heading] = await db.select().from(sectionHeadings).where(eq(sectionHeadings.section, section)).limit(1);
      return heading || null;
    } catch (e) { console.warn("[DB Fallback] getSectionHeading:", (e as Error).message); }
  }
  const { data } = await restFrom("sectionHeadings").select("*").eq("section", section).limit(1).single();
  return (data as any) ?? null;
}

export async function createSectionHeading(data: any) {
  const db = await getDb();
  if (db) {
    try {
      const { sectionHeadings } = await import("../drizzle/schema");
      await db.insert(sectionHeadings).values(data);
      return getSectionHeading(data.section);
    } catch (e) { console.warn("[DB Fallback] createSectionHeading:", (e as Error).message); }
  }
  await restFrom("sectionHeadings").insert(data as any);
  return getSectionHeading(data.section);
}

export async function updateSectionHeading(section: string, data: any) {
  const db = await getDb();
  if (db) {
    try {
      const { sectionHeadings } = await import("../drizzle/schema");
      await db.update(sectionHeadings).set({ ...data, updatedAt: new Date() }).where(eq(sectionHeadings.section, section));
      return getSectionHeading(section);
    } catch (e) { console.warn("[DB Fallback] updateSectionHeading:", (e as Error).message); }
  }
  await restFrom("sectionHeadings").update({ ...data, updatedAt: new Date().toISOString() } as any).eq("section", section);
  return getSectionHeading(section);
}

export async function deleteSectionHeading(section: string) {
  const db = await getDb();
  if (db) {
    try {
      const { sectionHeadings } = await import("../drizzle/schema");
      await db.delete(sectionHeadings).where(eq(sectionHeadings.section, section));
      return;
    } catch (e) { console.warn("[DB Fallback] deleteSectionHeading:", (e as Error).message); }
  }
  await restFrom("sectionHeadings").delete().eq("section", section);
}

// ============================================================================
// User Management (Extended)
// ============================================================================

export async function getUsersCount() {
  const db = await getDb();
  if (db) {
    try {
      const { sql } = await import("drizzle-orm");
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(users);
      return result.count;
    } catch (e) { console.warn("[DB Fallback] getUsersCount:", (e as Error).message); }
  }
  const { count } = await restFrom("users").select("*", { count: "exact", head: true });
  return count ?? 0;
}

export async function searchUsers(query: string, limit: number = 50) {
  const db = await getDb();
  if (db) {
    try {
      const { sql, or } = await import("drizzle-orm");
      return await db.select().from(users).where(or(
        sql`${users.name} LIKE ${`%${query}%`}`,
        sql`${users.email} LIKE ${`%${query}%`}`
      )).limit(limit);
    } catch (e) { console.warn("[DB Fallback] searchUsers:", (e as Error).message); }
  }
  const { data } = await restFrom("users").select("*").or(`name.ilike.%${query}%,email.ilike.%${query}%`).limit(limit);
  return (data ?? []) as User[];
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
  const insertData = {
    sessionId: data.sessionId,
    visitorId: data.visitorId,
    pagePath: data.pagePath,
    referrer: data.referrer || null,
    userAgent: data.userAgent || null,
    entryTime: new Date(),
  };
  if (db) {
    try {
      const { pageAnalytics } = await import("../drizzle/schema");
      const [result] = await db.insert(pageAnalytics).values(insertData);
      return result;
    } catch (e) { console.warn("[DB Fallback] trackPageView:", (e as Error).message); }
  }
  const { data: result } = await restFrom("pageAnalytics").insert({ ...insertData, entryTime: insertData.entryTime.toISOString() } as any).select("*").single();
  return result;
}

export async function updatePageExit(sessionId: string, pagePath: string) {
  const db = await getDb();
  if (db) {
    try {
      const { pageAnalytics } = await import("../drizzle/schema");
      const [entry] = await db.select().from(pageAnalytics)
        .where(and(eq(pageAnalytics.sessionId, sessionId), eq(pageAnalytics.pagePath, pagePath), isNull(pageAnalytics.exitTime)))
        .orderBy(desc(pageAnalytics.entryTime)).limit(1);
      if (!entry) return null;
      const exitTime = new Date();
      const duration = Math.floor((exitTime.getTime() - new Date(entry.entryTime).getTime()) / 1000);
      await db.update(pageAnalytics).set({ exitTime, duration }).where(eq(pageAnalytics.id, entry.id));
      return { duration };
    } catch (e) { console.warn("[DB Fallback] updatePageExit:", (e as Error).message); }
  }
  // REST fallback
  const { data: entries } = await restFrom("pageAnalytics").select("*")
    .eq("sessionId", sessionId).eq("pagePath", pagePath).is("exitTime", null)
    .order("entryTime", { ascending: false }).limit(1);
  const entry = (entries ?? [])[0];
  if (!entry) return null;
  const exitTime = new Date();
  const duration = Math.floor((exitTime.getTime() - new Date(entry.entryTime).getTime()) / 1000);
  await restFrom("pageAnalytics").update({ exitTime: exitTime.toISOString(), duration } as any).eq("id", entry.id);
  return { duration };
}

export async function markBounce(sessionId: string) {
  const db = await getDb();
  if (db) {
    try {
      const { pageAnalytics } = await import("../drizzle/schema");
      await db.update(pageAnalytics).set({ isBounce: true }).where(eq(pageAnalytics.sessionId, sessionId));
      return;
    } catch (e) { console.warn("[DB Fallback] markBounce:", (e as Error).message); }
  }
  await restFrom("pageAnalytics").update({ isBounce: true } as any).eq("sessionId", sessionId);
}

export async function getAnalytics(startDate: Date, endDate: Date) {
  const db = await getDb();
  let analyticsData: any[] | null = null;

  if (db) {
    try {
      const { pageAnalytics } = await import("../drizzle/schema");
      analyticsData = await db.select().from(pageAnalytics).where(and(
        gte(pageAnalytics.entryTime, startDate), lte(pageAnalytics.entryTime, endDate)
      ));
    } catch (e) { console.warn("[DB Fallback] getAnalytics:", (e as Error).message); }
  }
  if (!analyticsData) {
    const { data: restData } = await restFrom("pageAnalytics").select("*")
      .gte("entryTime", startDate.toISOString()).lte("entryTime", endDate.toISOString());
    analyticsData = (restData ?? []) as any[];
  }

  const pageViews = analyticsData.length;
  const uniqueVisitors = new Set(analyticsData.map(d => d.visitorId)).size;
  const uniqueSessions = new Set(analyticsData.map(d => d.sessionId)).size;
  const durationsWithValue = analyticsData.filter(d => d.duration !== null).map(d => d.duration!);
  const avgDuration = durationsWithValue.length > 0
    ? durationsWithValue.reduce((sum: number, d: number) => sum + d, 0) / durationsWithValue.length : 0;
  const bouncedSessions = new Set(analyticsData.filter(d => d.isBounce).map(d => d.sessionId)).size;
  const bounceRate = uniqueSessions > 0 ? (bouncedSessions / uniqueSessions) * 100 : 0;

  return {
    pageViews,
    visits: uniqueSessions,
    visitors: uniqueVisitors,
    avgDuration: Math.round(avgDuration),
    bounceRate: Math.round(bounceRate * 10) / 10,
  };
}

// Mark user as having seen the welcome modal
export async function markUserWelcomeSeen(userId: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try { await db.update(users).set({ hasSeenWelcome: true }).where(eq(users.id, userId)); return; }
    catch (e) { console.warn("[DB Fallback] markUserWelcomeSeen:", (e as Error).message); }
  }
  await restFrom("users").update({ hasSeenWelcome: true } as any).eq("id", userId);
}

// Get upcoming available slots for homepage display
export async function getUpcomingAvailableSlots(limit: number = 6): Promise<AvailabilitySlot[]> {
  const db = await getDb();

  if (db) {
    try {
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

      return result.map(slot => ({
        ...slot,
        spotsLeft: slot.capacity - slot.currentBookings,
      })) as AvailabilitySlot[];
    } catch (e) {
      console.warn("[Database] Direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  try {
    const { supabaseAdmin } = await import("./lib/supabase");
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("availabilitySlots")
      .select("*")
      .gte("startTime", now)
      .eq("isBooked", false)
      .order("startTime", { ascending: true })
      .limit(limit);

    if (error || !data) return [];
    return (data as any[]).map(slot => ({
      ...slot,
      spotsLeft: slot.capacity - slot.currentBookings,
    })) as AvailabilitySlot[];
  } catch {
    return [];
  }
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
  const { page, limit, search, roleFilter, courseFilter } = params;
  const offset = (page - 1) * limit;

  if (db) {
    try {
      const conditions: SQL[] = [];
      if (roleFilter && roleFilter !== 'all') { conditions.push(eq(users.role, roleFilter)); }
      if (search && search.trim()) {
        conditions.push(or(like(users.name, `%${search.trim()}%`), like(users.email, `%${search.trim()}%`))!);
      }
      if (courseFilter) {
        const enrolledUserIds = await db.select({ userId: userCourseEnrollments.userId }).from(userCourseEnrollments).where(eq(userCourseEnrollments.courseId, courseFilter));
        const uIds = enrolledUserIds.map(e => e.userId);
        if (uIds.length > 0) { conditions.push(inArray(users.id, uIds)); }
        else { return { users: [], total: 0, pages: 0 }; }
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const countResult = await db.select({ count: sql<number>`count(*)` }).from(users).where(whereClause);
      const total = Number(countResult[0]?.count || 0);
      const result = await db.select().from(users).where(whereClause).orderBy(desc(users.createdAt)).limit(limit).offset(offset);
      const userIds = result.map(u => u.id);
      const courseCounts = userIds.length > 0 ? await db.select({ userId: userCourseEnrollments.userId, count: sql<number>`count(*)` }).from(userCourseEnrollments).where(inArray(userCourseEnrollments.userId, userIds)).groupBy(userCourseEnrollments.userId) : [];
      const courseCountMap = new Map(courseCounts.map(c => [c.userId, Number(c.count)]));
      const usersWithCounts = result.map(user => ({ ...user, courseCount: courseCountMap.get(user.id) || 0 }));
      return { users: usersWithCounts, total, pages: Math.ceil(total / limit) };
    } catch (e) { console.warn("[DB Fallback] listUsers:", (e as Error).message); }
  }

  // REST fallback
  let q = restFrom("users").select("*", { count: "exact" });
  if (roleFilter && roleFilter !== 'all') { q = q.eq("role", roleFilter); }
  if (search && search.trim()) { q = q.or(`name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`); }
  if (courseFilter) {
    const { data: enrolled } = await restFrom("userCourseEnrollments").select("userId").eq("courseId", courseFilter);
    const uIds = (enrolled ?? []).map((e: any) => e.userId);
    if (uIds.length === 0) return { users: [], total: 0, pages: 0 };
    q = q.in("id", uIds);
  }
  const { data, count } = await q.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const total = count ?? 0;
  const usersList = (data ?? []) as User[];
  // Get enrollment counts
  const uIds = usersList.map(u => u.id);
  let courseCountMap: Record<number, number> = {};
  if (uIds.length > 0) {
    const { data: enrollments } = await restFrom("userCourseEnrollments").select("userId").in("userId", uIds);
    for (const e of (enrollments ?? []) as any[]) { courseCountMap[e.userId] = (courseCountMap[e.userId] || 0) + 1; }
  }
  const usersWithCounts = usersList.map(u => ({ ...u, courseCount: courseCountMap[u.id] || 0 }));
  return { users: usersWithCounts, total, pages: Math.ceil(total / limit) };
}

/**
 * Create a new user manually (admin action)
 */
export async function createUserManually(
  data: { name: string; email: string; role: 'user' | 'admin' },
  createdBy: number
): Promise<User> {
  const { randomUUID } = await import("node:crypto");
  const placeholderSupabaseId = randomUUID();

  const db = await getDb();
  if (db) {
    try {
      const existing = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
      if (existing.length > 0) throw new Error("User with this email already exists");
      const result = await db.insert(users).values({
        supabaseId: placeholderSupabaseId, name: data.name, email: data.email, role: data.role, hasSeenWelcome: true,
      }).returning();
      return result[0];
    } catch (e) {
      if ((e as Error).message.includes("already exists")) throw e;
      console.warn("[DB Fallback] createUserManually:", (e as Error).message);
    }
  }
  // REST fallback
  const { data: existingData } = await restFrom("users").select("id").eq("email", data.email).limit(1);
  if ((existingData ?? []).length > 0) throw new Error("User with this email already exists");
  const { data: inserted, error } = await restFrom("users").insert({
    supabaseId: placeholderSupabaseId, name: data.name, email: data.email, role: data.role, hasSeenWelcome: true,
  } as any).select("*").single();
  if (error || !inserted) throw new Error(error?.message || "Insert failed");
  return inserted as User;
}

/**
 * Delete a user and all their enrollments
 */
export async function deleteUser(userId: number): Promise<{ success: boolean; hadActiveCourses: boolean }> {
  const db = await getDb();
  if (db) {
    try {
      const enrollments = await db.select().from(userCourseEnrollments).where(eq(userCourseEnrollments.userId, userId));
      const hadActiveCourses = enrollments.length > 0;
      if (hadActiveCourses) { await db.delete(userCourseEnrollments).where(eq(userCourseEnrollments.userId, userId)); }
      await db.delete(users).where(eq(users.id, userId));
      return { success: true, hadActiveCourses };
    } catch (e) { console.warn("[DB Fallback] deleteUser:", (e as Error).message); }
  }
  const { data: enrollments } = await restFrom("userCourseEnrollments").select("id").eq("userId", userId);
  const hadActiveCourses = (enrollments ?? []).length > 0;
  if (hadActiveCourses) { await restFrom("userCourseEnrollments").delete().eq("userId", userId); }
  await restFrom("users").delete().eq("id", userId);
  return { success: true, hadActiveCourses };
}

// ==================== Course Assignment Management ====================

/**
 * Get all courses enrolled by a specific user
 */
export async function getUserEnrolledCourses(userId: number) {
  const db = await getDb();
  if (db) {
    try {
      const result = await db
        .select({ enrollment: userCourseEnrollments, course: courses })
        .from(userCourseEnrollments)
        .innerJoin(courses, eq(userCourseEnrollments.courseId, courses.id))
        .where(eq(userCourseEnrollments.userId, userId))
        .orderBy(desc(userCourseEnrollments.enrolledAt));
      return result.map(r => ({ ...r.enrollment, course: r.course }));
    } catch (e) { console.warn("[DB Fallback] getUserEnrolledCourses:", (e as Error).message); }
  }
  const { data: enrollments } = await restFrom("userCourseEnrollments").select("*").eq("userId", userId).order("enrolledAt", { ascending: false });
  const enrollmentList = (enrollments ?? []) as any[];
  const courseIds = Array.from(new Set(enrollmentList.map(e => e.courseId)));
  let courseMap: Record<number, any> = {};
  if (courseIds.length > 0) {
    const { data: coursesData } = await restFrom("courses").select("*").in("id", courseIds);
    for (const c of (coursesData ?? []) as any[]) { courseMap[c.id] = c; }
  }
  return enrollmentList.map(e => ({ ...e, course: courseMap[e.courseId] || null }));
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
  if (db) {
    try {
      const existing = await db.select().from(userCourseEnrollments)
        .where(and(eq(userCourseEnrollments.userId, userId), eq(userCourseEnrollments.courseId, courseId))).limit(1);
      if (existing.length > 0) throw new Error("User is already enrolled in this course");
      const [enrollment] = await db.insert(userCourseEnrollments).values({ userId, courseId, enrolledBy, status: 'active' });
      return enrollment;
    } catch (e) {
      if ((e as Error).message.includes("already enrolled")) throw e;
      console.warn("[DB Fallback] assignCourseToUser:", (e as Error).message);
    }
  }
  const { data: existing } = await restFrom("userCourseEnrollments").select("id").eq("userId", userId).eq("courseId", courseId).limit(1);
  if ((existing ?? []).length > 0) throw new Error("User is already enrolled in this course");
  const { data, error } = await restFrom("userCourseEnrollments").insert({ userId, courseId, enrolledBy, status: 'active' } as any).select("*").single();
  if (error || !data) throw new Error(error?.message || "Insert failed");
  return data;
}

/**
 * Remove a course from a user
 */
export async function removeCourseFromUser(userId: number, courseId: number): Promise<{ success: boolean }> {
  const db = await getDb();
  if (db) {
    try {
      await db.delete(userCourseEnrollments).where(and(eq(userCourseEnrollments.userId, userId), eq(userCourseEnrollments.courseId, courseId)));
      return { success: true };
    } catch (e) { console.warn("[DB Fallback] removeCourseFromUser:", (e as Error).message); }
  }
  await restFrom("userCourseEnrollments").delete().eq("userId", userId).eq("courseId", courseId);
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
  let created = 0;
  let skipped = 0;

  if (db) {
    try {
      for (const userId of userIds) {
        for (const courseId of courseIds) {
          try {
            const existing = await db.select().from(userCourseEnrollments)
              .where(and(eq(userCourseEnrollments.userId, userId), eq(userCourseEnrollments.courseId, courseId))).limit(1);
            if (existing.length > 0) { skipped++; continue; }
            await db.insert(userCourseEnrollments).values({ userId, courseId, enrolledBy, status: 'active' });
            created++;
          } catch { skipped++; }
        }
      }
      return { created, skipped };
    } catch (e) { console.warn("[DB Fallback] bulkAssignCourses:", (e as Error).message); }
  }

  // REST fallback
  created = 0; skipped = 0;
  for (const userId of userIds) {
    for (const courseId of courseIds) {
      try {
        const { data: existing } = await restFrom("userCourseEnrollments").select("id").eq("userId", userId).eq("courseId", courseId).limit(1);
        if ((existing ?? []).length > 0) { skipped++; continue; }
        await restFrom("userCourseEnrollments").insert({ userId, courseId, enrolledBy, status: 'active' } as any);
        created++;
      } catch { skipped++; }
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
  if (db) {
    try {
      await db.delete(userCourseEnrollments).where(and(inArray(userCourseEnrollments.userId, userIds), inArray(userCourseEnrollments.courseId, courseIds)));
      return { removed: userIds.length * courseIds.length };
    } catch (e) { console.warn("[DB Fallback] bulkRemoveCourses:", (e as Error).message); }
  }
  // REST fallback: delete one by one
  let removed = 0;
  for (const userId of userIds) {
    for (const courseId of courseIds) {
      await restFrom("userCourseEnrollments").delete().eq("userId", userId).eq("courseId", courseId);
      removed++;
    }
  }
  return { removed };
}

// ============================================================================
// Course Content Management (Modules & Lessons)
// ============================================================================

/**
 * Get all modules for a course, ordered by order field
 */
export async function getCourseModules(courseId: number) {
  const db = await getDb();
  if (db) {
    try {
      return await db.select().from(courseModules).where(eq(courseModules.courseId, courseId)).orderBy(courseModules.order);
    } catch (e) { console.warn("[DB Fallback] getCourseModules:", (e as Error).message); }
  }
  const { data } = await restFrom("courseModules").select("*").eq("courseId", courseId).order("order", { ascending: true });
  return (data ?? []) as CourseModule[];
}

/**
 * Get all lessons for a module, ordered by order field
 */
export async function getModuleLessons(moduleId: number) {
  const db = await getDb();
  if (db) {
    try {
      return await db.select().from(courseLessons).where(eq(courseLessons.moduleId, moduleId)).orderBy(courseLessons.order);
    } catch (e) { console.warn("[DB Fallback] getModuleLessons:", (e as Error).message); }
  }
  const { data } = await restFrom("courseLessons").select("*").eq("moduleId", moduleId).order("order", { ascending: true });
  return (data ?? []) as CourseLesson[];
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
  const values = { courseId: data.courseId, title: data.title, description: data.description || null, order: data.order || 0, isPublished: true };
  const db = await getDb();
  if (db) {
    try {
      const [module] = await db.insert(courseModules).values(values).returning();
      return module;
    } catch (e) { console.warn("[DB Fallback] createCourseModule:", (e as Error).message); }
  }
  const { data: inserted, error } = await restFrom("courseModules").insert(values as any).select("*").single();
  if (error || !inserted) throw new Error(error?.message || "Insert failed");
  return inserted as CourseModule;
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
  if (db) {
    try { await db.update(courseModules).set(updates).where(eq(courseModules.id, id)); return { success: true }; }
    catch (e) { console.warn("[DB Fallback] updateCourseModule:", (e as Error).message); }
  }
  await restFrom("courseModules").update(updates as any).eq("id", id);
  return { success: true };
}

/**
 * Delete a course module and all its lessons
 */
export async function deleteCourseModule(id: number) {
  const db = await getDb();
  if (db) {
    try {
      await db.delete(courseLessons).where(eq(courseLessons.moduleId, id));
      await db.delete(courseModules).where(eq(courseModules.id, id));
      return { success: true };
    } catch (e) { console.warn("[DB Fallback] deleteCourseModule:", (e as Error).message); }
  }
  await restFrom("courseLessons").delete().eq("moduleId", id);
  await restFrom("courseModules").delete().eq("id", id);
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
  const values = {
    moduleId: data.moduleId, courseId: data.courseId, title: data.title,
    description: data.description || null, videoUrl: data.videoUrl || null, videoKey: data.videoKey || null,
    duration: data.duration || null, content: data.content || null, order: data.order || 0,
    isFree: data.isFree || false, isPublished: true,
  };
  const db = await getDb();
  if (db) {
    try {
      const [lesson] = await db.insert(courseLessons).values(values).returning();
      return lesson;
    } catch (e) { console.warn("[DB Fallback] createCourseLesson:", (e as Error).message); }
  }
  const { data: inserted, error } = await restFrom("courseLessons").insert(values as any).select("*").single();
  if (error || !inserted) throw new Error(error?.message || "Insert failed");
  return inserted as CourseLesson;
}

/**
 * Get a single course lesson by ID
 */
export async function getLessonById(id: number): Promise<CourseLesson | null> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(courseLessons).where(eq(courseLessons.id, id)).limit(1);
      return result[0] ?? null;
    } catch (e) { console.warn("[DB Fallback] getLessonById:", (e as Error).message); }
  }
  const { data } = await restFrom("courseLessons").select("*").eq("id", id).limit(1).single();
  return (data as CourseLesson) ?? null;
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
    bunnyVideoId?: string;
    bunnyThumbnailUrl?: string;
    videoStatus?: "pending" | "uploading" | "processing" | "encoding" | "ready" | "failed";
    durationSeconds?: number;
    duration?: number;
    content?: string;
    order?: number;
    isPublished?: boolean;
    isFree?: boolean;
  }
) {
  const db = await getDb();
  if (db) {
    try { await db.update(courseLessons).set(updates).where(eq(courseLessons.id, id)); return { success: true }; }
    catch (e) { console.warn("[DB Fallback] updateCourseLesson:", (e as Error).message); }
  }
  await restFrom("courseLessons").update(updates as any).eq("id", id);
  return { success: true };
}

/**
 * Delete a course lesson
 */
export async function deleteCourseLesson(id: number) {
  const db = await getDb();
  if (db) {
    try {
      await db.delete(userLessonProgress).where(eq(userLessonProgress.lessonId, id));
      await db.delete(courseLessons).where(eq(courseLessons.id, id));
      return { success: true };
    } catch (e) { console.warn("[DB Fallback] deleteCourseLesson:", (e as Error).message); }
  }
  await restFrom("userLessonProgress").delete().eq("lessonId", id);
  await restFrom("courseLessons").delete().eq("id", id);
  return { success: true };
}

/**
 * Reorder course modules
 */
export async function reorderCourseModules(courseId: number, moduleIds: number[]) {
  const db = await getDb();
  if (db) {
    try {
      for (let i = 0; i < moduleIds.length; i++) {
        await db.update(courseModules).set({ order: i }).where(and(eq(courseModules.id, moduleIds[i]), eq(courseModules.courseId, courseId)));
      }
      return { success: true };
    } catch (e) { console.warn("[DB Fallback] reorderCourseModules:", (e as Error).message); }
  }
  for (let i = 0; i < moduleIds.length; i++) {
    await restFrom("courseModules").update({ order: i } as any).eq("id", moduleIds[i]).eq("courseId", courseId);
  }
  return { success: true };
}

/**
 * Reorder module lessons
 */
export async function reorderModuleLessons(moduleId: number, lessonIds: number[]) {
  const db = await getDb();
  if (db) {
    try {
      for (let i = 0; i < lessonIds.length; i++) {
        await db.update(courseLessons).set({ order: i }).where(and(eq(courseLessons.id, lessonIds[i]), eq(courseLessons.moduleId, moduleId)));
      }
      return { success: true };
    } catch (e) { console.warn("[DB Fallback] reorderModuleLessons:", (e as Error).message); }
  }
  for (let i = 0; i < lessonIds.length; i++) {
    await restFrom("courseLessons").update({ order: i } as any).eq("id", lessonIds[i]).eq("moduleId", moduleId);
  }
  return { success: true };
}

/**
 * Get visual settings (returns first row or null)
 */
export async function getVisualSettings(): Promise<VisualSettings | null> {
  const db = await getDb();
  if (db) {
    try {
      const settings = await db.select().from(visualSettings).limit(1);
      return settings[0] || null;
    } catch (e) { console.warn("[DB Fallback] getVisualSettings:", (e as Error).message); }
  }
  const { data } = await restFrom("visualSettings").select("*").limit(1).single();
  return (data as VisualSettings) ?? null;
}

/**
 * Update or create visual settings
 */
export async function upsertVisualSettings(data: Partial<InsertVisualSettings> & { updatedBy: number }): Promise<VisualSettings> {
  const db = await getDb();
  if (db) {
    try {
      const existing = await getVisualSettings();
      if (existing) {
        await db.update(visualSettings).set(data).where(eq(visualSettings.id, existing.id));
        const updated = await getVisualSettings();
        if (!updated) throw new Error("Failed to retrieve updated settings");
        return updated;
      } else {
        const [inserted] = await db.insert(visualSettings).values(data as InsertVisualSettings).returning();
        if (!inserted) throw new Error("Failed to retrieve created settings");
        return inserted;
      }
    } catch (e) { console.warn("[DB Fallback] upsertVisualSettings:", (e as Error).message); }
  }
  const existing = await getVisualSettings();
  if (existing) {
    const { data: updated } = await restFrom("visualSettings").update(data as any).eq("id", existing.id).select("*").single();
    if (!updated) throw new Error("Failed to update visual settings");
    return updated as VisualSettings;
  } else {
    const { data: inserted, error } = await restFrom("visualSettings").insert(data as any).select("*").single();
    if (error || !inserted) throw new Error(error?.message || "Insert failed");
    return inserted as VisualSettings;
  }
}

/**
 * Get course modules with their lessons for the course learning page
 */
export async function getCourseModulesWithLessons(courseId: number) {
  const db = await getDb();
  if (db) {
    try {
      const modules = await db.select().from(courseModules)
        .where(and(eq(courseModules.courseId, courseId), eq(courseModules.isPublished, true)))
        .orderBy(courseModules.order);
      const modulesWithLessons = await Promise.all(
        modules.map(async (module) => {
          const lessons = await db.select().from(courseLessons)
            .where(and(eq(courseLessons.moduleId, module.id), eq(courseLessons.isPublished, true)))
            .orderBy(courseLessons.order);
          return { ...module, lessons };
        })
      );
      return modulesWithLessons;
    } catch (e) { console.warn("[DB Fallback] getCourseModulesWithLessons:", (e as Error).message); }
  }
  // REST fallback
  const { data: modulesData } = await restFrom("courseModules").select("*").eq("courseId", courseId).eq("isPublished", true).order("order", { ascending: true });
  const modules = (modulesData ?? []) as CourseModule[];
  const modulesWithLessons = await Promise.all(
    modules.map(async (module) => {
      const { data: lessonsData } = await restFrom("courseLessons").select("*").eq("moduleId", module.id).eq("isPublished", true).order("order", { ascending: true });
      return { ...module, lessons: (lessonsData ?? []) as CourseLesson[] };
    })
  );
  return modulesWithLessons;
}

/**
 * Get user's progress for a specific course
 */
export async function getUserCourseProgress(userId: number, courseId: number) {
  const db = await getDb();
  if (db) {
    try {
      return await db.select().from(userLessonProgress).where(and(eq(userLessonProgress.userId, userId), eq(userLessonProgress.courseId, courseId)));
    } catch (e) { console.warn("[DB Fallback] getUserCourseProgress:", (e as Error).message); }
  }
  const { data } = await restFrom("userLessonProgress").select("*").eq("userId", userId).eq("courseId", courseId);
  return (data ?? []) as UserLessonProgress[];
}

/**
 * Mark a lesson as completed for a user
 */
export async function markLessonComplete(userId: number, lessonId: number, courseId: number) {
  const db = await getDb();
  if (db) {
    try {
      const existing = await db.select().from(userLessonProgress)
        .where(and(eq(userLessonProgress.userId, userId), eq(userLessonProgress.lessonId, lessonId))).limit(1);
      if (existing.length > 0) {
        await db.update(userLessonProgress).set({ isCompleted: true, completedAt: new Date(), lastWatchedAt: new Date(), updatedAt: new Date() })
          .where(eq(userLessonProgress.id, existing[0].id));
        return existing[0];
      } else {
        const [inserted] = await db.insert(userLessonProgress).values({
          userId, lessonId, courseId, isCompleted: true, completedAt: new Date(), lastWatchedAt: new Date(), watchedDuration: 0,
        }).returning();
        return inserted;
      }
    } catch (e) { console.warn("[DB Fallback] markLessonComplete:", (e as Error).message); }
  }
  // REST fallback
  const now = new Date().toISOString();
  const { data: existingData } = await restFrom("userLessonProgress").select("*").eq("userId", userId).eq("lessonId", lessonId).limit(1);
  const existingList = (existingData ?? []) as any[];
  if (existingList.length > 0) {
    await restFrom("userLessonProgress").update({ isCompleted: true, completedAt: now, lastWatchedAt: now, updatedAt: now } as any).eq("id", existingList[0].id);
    return existingList[0];
  } else {
    const { data: inserted, error } = await restFrom("userLessonProgress").insert({
      userId, lessonId, courseId, isCompleted: true, completedAt: now, lastWatchedAt: now, watchedDuration: 0,
    } as any).select("*").single();
    if (error || !inserted) throw new Error(error?.message || "Insert failed");
    return inserted;
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
  if (db) {
    try {
      const existing = await db.select().from(userLessonProgress)
        .where(and(eq(userLessonProgress.userId, userId), eq(userLessonProgress.lessonId, lessonId))).limit(1);
      if (existing.length > 0) {
        await db.update(userLessonProgress).set({ watchedDuration, lastWatchedAt: new Date(), updatedAt: new Date() })
          .where(eq(userLessonProgress.id, existing[0].id));
        return existing[0];
      } else {
        const [inserted] = await db.insert(userLessonProgress).values({
          userId, lessonId, courseId, isCompleted: false, lastWatchedAt: new Date(), watchedDuration,
        }).returning();
        return inserted;
      }
    } catch (e) { console.warn("[DB Fallback] updateLessonProgress:", (e as Error).message); }
  }
  // REST fallback
  const now = new Date().toISOString();
  const { data: existingData } = await restFrom("userLessonProgress").select("*").eq("userId", userId).eq("lessonId", lessonId).limit(1);
  const existingList = (existingData ?? []) as any[];
  if (existingList.length > 0) {
    await restFrom("userLessonProgress").update({ watchedDuration, lastWatchedAt: now, updatedAt: now } as any).eq("id", existingList[0].id);
    return existingList[0];
  } else {
    const { data: inserted, error } = await restFrom("userLessonProgress").insert({
      userId, lessonId, courseId, isCompleted: false, lastWatchedAt: now, watchedDuration,
    } as any).select("*").single();
    if (error || !inserted) throw new Error(error?.message || "Insert failed");
    return inserted;
  }
}

export async function getNewUserCount(): Promise<number> {
  const db = await getDb();
  if (db) {
    try {
      const { sql } = await import("drizzle-orm");
      const result = await db.select({ count: sql<number>`count(*)` }).from(users).where(isNull(users.lastViewedByAdmin));
      return Number(result[0]?.count || 0);
    } catch (e) { console.warn("[DB Fallback] getNewUserCount:", (e as Error).message); }
  }
  const { count } = await restFrom("users").select("*", { count: "exact", head: true }).is("lastViewedByAdmin", null);
  return count ?? 0;
}

export async function markUserViewedByAdmin(userId: number) {
  const db = await getDb();
  if (db) {
    try { await db.update(users).set({ lastViewedByAdmin: new Date() }).where(eq(users.id, userId)); return; }
    catch (e) { console.warn("[DB Fallback] markUserViewedByAdmin:", (e as Error).message); }
  }
  await restFrom("users").update({ lastViewedByAdmin: new Date().toISOString() } as any).eq("id", userId);
}

export async function markAllUsersViewedByAdmin() {
  const db = await getDb();
  if (db) {
    try { await db.update(users).set({ lastViewedByAdmin: new Date() }).where(isNull(users.lastViewedByAdmin)); return; }
    catch (e) { console.warn("[DB Fallback] markAllUsersViewedByAdmin:", (e as Error).message); }
  }
  await restFrom("users").update({ lastViewedByAdmin: new Date().toISOString() } as any).is("lastViewedByAdmin", null);
}

export async function getUserEnrollmentCount(userId: number): Promise<number> {
  const db = await getDb();
  if (db) {
    try {
      const { sql } = await import("drizzle-orm");
      const result = await db.select({ count: sql<number>`count(*)` }).from(userCourseEnrollments).where(eq(userCourseEnrollments.userId, userId));
      return Number(result[0]?.count || 0);
    } catch (e) { console.warn("[DB Fallback] getUserEnrollmentCount:", (e as Error).message); }
  }
  const { count } = await restFrom("userCourseEnrollments").select("*", { count: "exact", head: true }).eq("userId", userId);
  return count ?? 0;
}

// ==================== Messages ====================

export async function getUserMessages(userId: number) {
  const db = await getDb();
  if (db) {
    try {
      return await db.select().from(messages).where(or(eq(messages.toUserId, userId), eq(messages.fromUserId, userId))).orderBy(desc(messages.createdAt));
    } catch (e) { console.warn("[DB Fallback] getUserMessages:", (e as Error).message); }
  }
  const { data } = await restFrom("messages").select("*").or(`toUserId.eq.${userId},fromUserId.eq.${userId}`).order("createdAt", { ascending: false });
  return (data ?? []) as Message[];
}

export async function getUnreadMessageCount(userId: number) {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select({ count: sql<number>`count(*)` }).from(messages)
        .where(and(eq(messages.toUserId, userId), eq(messages.isRead, false)));
      return result[0]?.count || 0;
    } catch (e) { console.warn("[DB Fallback] getUnreadMessageCount:", (e as Error).message); }
  }
  const { count } = await restFrom("messages").select("*", { count: "exact", head: true }).eq("toUserId", userId).eq("isRead", false);
  return count ?? 0;
}

export async function markMessageAsRead(messageId: number, userId: number) {
  const db = await getDb();
  if (db) {
    try {
      await db.update(messages).set({ isRead: true, readAt: new Date() }).where(and(eq(messages.id, messageId), eq(messages.toUserId, userId)));
      return { success: true };
    } catch (e) { console.warn("[DB Fallback] markMessageAsRead:", (e as Error).message); }
  }
  await restFrom("messages").update({ isRead: true, readAt: new Date().toISOString() } as any).eq("id", messageId).eq("toUserId", userId);
  return { success: true };
}

export async function createMessage(data: {
  fromUserId: number;
  toUserId: number;
  subject: string;
  body: string;
}) {
  let message: any;
  const db = await getDb();
  if (db) {
    try {
      [message] = await db.insert(messages).values(data).returning();
    } catch (e) {
      console.warn("[DB Fallback] createMessage:", (e as Error).message);
    }
  }
  if (!message) {
    const { data: inserted, error } = await restFrom("messages").insert(data as any).select("*").single();
    if (error || !inserted) throw new Error(error?.message || "Insert failed");
    message = inserted;
  }

  // Send email notification to recipient
  const { sendEmail, getMessageNotificationEmail } = await import("./_core/email");
  const recipient = await getUserById(data.toUserId);
  const sender = await getUserById(data.fromUserId);
  if (recipient && recipient.email && sender) {
    const messagePreview = data.body.length > 100 ? data.body.substring(0, 100) + "..." : data.body;
    const emailHtml = getMessageNotificationEmail({
      userName: recipient.name || "User",
      senderName: sender.name || "Someone",
      messagePreview,
      messagesUrl: `${process.env.VITE_APP_URL || "https://elizabethzolotova.manus.space"}/my-messages`,
    });
    await sendEmail({
      to: recipient.email,
      subject: `New message from ${sender.name || "High Heels Dance"}`,
      html: emailHtml,
    });
  }
  return message;
}

export async function getPurchasesWithDetails() {
  const db = await getDb();
  if (db) {
    try {
      return await db.select({
        id: purchases.id, userId: purchases.userId, courseId: purchases.courseId,
        amount: purchases.amount, status: purchases.status, createdAt: purchases.purchasedAt,
        userName: users.name, userEmail: users.email, courseName: courses.title,
      }).from(purchases).leftJoin(users, eq(purchases.userId, users.id)).leftJoin(courses, eq(purchases.courseId, courses.id))
        .orderBy(desc(purchases.purchasedAt));
    } catch (e) { console.warn("[DB Fallback] getPurchasesWithDetails:", (e as Error).message); }
  }
  // REST fallback: fetch separately and merge
  const { data: purchasesData } = await restFrom("purchases").select("*").order("purchasedAt", { ascending: false });
  const purchasesList = (purchasesData ?? []) as Purchase[];
  const userIds = Array.from(new Set(purchasesList.map(p => p.userId)));
  const courseIds = Array.from(new Set(purchasesList.map(p => p.courseId)));
  let usersMap: Record<number, any> = {};
  let coursesMap: Record<number, any> = {};
  if (userIds.length > 0) {
    const { data: usersData } = await restFrom("users").select("id,name,email").in("id", userIds);
    for (const u of (usersData ?? []) as any[]) { usersMap[u.id] = u; }
  }
  if (courseIds.length > 0) {
    const { data: coursesData } = await restFrom("courses").select("id,title").in("id", courseIds);
    for (const c of (coursesData ?? []) as any[]) { coursesMap[c.id] = c; }
  }
  return purchasesList.map(p => ({
    id: p.id, userId: p.userId, courseId: p.courseId, amount: p.amount, status: p.status,
    createdAt: p.purchasedAt, userName: usersMap[p.userId]?.name ?? null,
    userEmail: usersMap[p.userId]?.email ?? null, courseName: coursesMap[p.courseId]?.title ?? null,
  }));
}

export async function getBookingsWithDetails() {
  const db = await getDb();
  if (db) {
    try {
      return await db.select({
        id: bookings.id, userId: bookings.userId, slotId: bookings.slotId,
        sessionType: bookings.sessionType, status: bookings.status, notes: bookings.notes,
        createdAt: bookings.bookedAt, userName: users.name, userEmail: users.email,
        slotStartTime: availabilitySlots.startTime, slotEndTime: availabilitySlots.endTime, eventType: availabilitySlots.eventType,
      }).from(bookings).leftJoin(users, eq(bookings.userId, users.id)).leftJoin(availabilitySlots, eq(bookings.slotId, availabilitySlots.id))
        .orderBy(desc(bookings.bookedAt));
    } catch (e) { console.warn("[DB Fallback] getBookingsWithDetails:", (e as Error).message); }
  }
  // REST fallback
  const { data: bookingsData } = await restFrom("bookings").select("*").order("bookedAt", { ascending: false });
  const bookingsList = (bookingsData ?? []) as Booking[];
  const userIds = Array.from(new Set(bookingsList.map(b => b.userId)));
  const slotIds = Array.from(new Set(bookingsList.map(b => b.slotId)));
  let usersMap: Record<number, any> = {};
  let slotsMap: Record<number, any> = {};
  if (userIds.length > 0) {
    const { data: usersData } = await restFrom("users").select("id,name,email").in("id", userIds);
    for (const u of (usersData ?? []) as any[]) { usersMap[u.id] = u; }
  }
  if (slotIds.length > 0) {
    const { data: slotsData } = await restFrom("availabilitySlots").select("id,startTime,endTime,eventType").in("id", slotIds);
    for (const s of (slotsData ?? []) as any[]) { slotsMap[s.id] = s; }
  }
  return bookingsList.map(b => ({
    id: b.id, userId: b.userId, slotId: b.slotId, sessionType: b.sessionType,
    status: b.status, notes: b.notes, createdAt: b.bookedAt,
    userName: usersMap[b.userId]?.name ?? null, userEmail: usersMap[b.userId]?.email ?? null,
    slotStartTime: slotsMap[b.slotId]?.startTime ?? null, slotEndTime: slotsMap[b.slotId]?.endTime ?? null,
    eventType: slotsMap[b.slotId]?.eventType ?? null,
  }));
}


// Get conversations grouped by sender/recipient pair with latest message
export async function getConversations(userId: number) {
  const db = await getDb();
  let allMessages: Message[] | null = null;

  if (db) {
    try {
      allMessages = await db.select().from(messages)
        .where(or(eq(messages.toUserId, userId), eq(messages.fromUserId, userId)))
        .orderBy(desc(messages.createdAt));
    } catch (e) { console.warn("[DB Fallback] getConversations:", (e as Error).message); }
  }
  if (!allMessages) {
    const { data } = await restFrom("messages").select("*").or(`toUserId.eq.${userId},fromUserId.eq.${userId}`).order("createdAt", { ascending: false });
    allMessages = (data ?? []) as Message[];
  }

  const conversationMap = new Map<string, any>();
  for (const msg of allMessages) {
    const otherUserId = msg.fromUserId === userId ? msg.toUserId : msg.fromUserId;
    const key = `${Math.min(userId, otherUserId)}-${Math.max(userId, otherUserId)}`;
    if (!conversationMap.has(key)) {
      const otherUser = await getUserById(otherUserId);
      const displayName = otherUser?.role === 'admin' ? 'Elizabeth' : otherUser?.name || 'Unknown';
      conversationMap.set(key, {
        otherUserId, displayName, lastMessage: msg.body, lastMessageSubject: msg.subject,
        lastMessageDate: msg.createdAt, unreadCount: msg.toUserId === userId && !msg.isRead ? 1 : 0, messages: [msg],
      });
    } else {
      const conv = conversationMap.get(key)!;
      conv.messages.push(msg);
      if (msg.toUserId === userId && !msg.isRead) { conv.unreadCount += 1; }
    }
  }
  return Array.from(conversationMap.values()).sort(
    (a, b) => new Date(b.lastMessageDate).getTime() - new Date(a.lastMessageDate).getTime()
  );
}

// Get full conversation thread with another user
export async function getConversationThread(userId: number, otherUserId: number) {
  const db = await getDb();
  if (db) {
    try {
      return await db.select().from(messages).where(
        or(
          and(eq(messages.fromUserId, userId), eq(messages.toUserId, otherUserId)),
          and(eq(messages.fromUserId, otherUserId), eq(messages.toUserId, userId))
        )
      ).orderBy(asc(messages.createdAt));
    } catch (e) { console.warn("[DB Fallback] getConversationThread:", (e as Error).message); }
  }
  const { data } = await restFrom("messages").select("*")
    .or(`and(fromUserId.eq.${userId},toUserId.eq.${otherUserId}),and(fromUserId.eq.${otherUserId},toUserId.eq.${userId})`)
    .order("createdAt", { ascending: true });
  return (data ?? []) as Message[];
}

// ==================== Session Enrollment Management ====================

export async function getSessionEnrollments(slotId: number): Promise<(Booking & { user: User })[]> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select({ booking: bookings, user: users }).from(bookings)
        .innerJoin(users, eq(bookings.userId, users.id))
        .where(and(eq(bookings.slotId, slotId), ne(bookings.status, "cancelled")))
        .orderBy(bookings.bookedAt);
      return result.map(r => ({ ...r.booking, user: r.user }));
    } catch (e) { console.warn("[DB Fallback] getSessionEnrollments:", (e as Error).message); }
  }
  const { data: bookingsData } = await restFrom("bookings").select("*").eq("slotId", slotId).neq("status", "cancelled").order("bookedAt", { ascending: true });
  const bookingsList = (bookingsData ?? []) as Booking[];
  const userIds = Array.from(new Set(bookingsList.map(b => b.userId)));
  let usersMap: Record<number, User> = {};
  if (userIds.length > 0) {
    const { data: usersData } = await restFrom("users").select("*").in("id", userIds);
    for (const u of (usersData ?? []) as User[]) { usersMap[u.id] = u; }
  }
  return bookingsList.filter(b => usersMap[b.userId]).map(b => ({ ...b, user: usersMap[b.userId] }));
}

export async function addUsersToSession(slotId: number, userIds: number[]): Promise<void> {
  const slot = await getAvailabilitySlotById(slotId);
  if (!slot) throw new Error("Session not found");

  if (slot.sessionType === 'group') {
    const currentEnrollments = await getSessionEnrollments(slotId);
    const newTotal = currentEnrollments.length + userIds.length;
    if (newTotal > slot.capacity) {
      throw new Error(`Cannot add ${userIds.length} users. Session capacity is ${slot.capacity}, currently has ${currentEnrollments.length} enrollments.`);
    }
  }

  const bookingsToInsert = userIds.map(userId => ({
    userId, slotId, sessionType: slot.title, status: "confirmed" as const,
    paymentRequired: !slot.isFree, paymentStatus: slot.isFree ? ("not_required" as const) : ("pending" as const),
  }));

  const db = await getDb();
  if (db) {
    try {
      await db.insert(bookings).values(bookingsToInsert);
    } catch (e) {
      console.warn("[DB Fallback] addUsersToSession:", (e as Error).message);
      // Fall through to REST
      for (const b of bookingsToInsert) { await restFrom("bookings").insert(b as any); }
    }
  } else {
    for (const b of bookingsToInsert) { await restFrom("bookings").insert(b as any); }
  }

  if (slot.sessionType === 'group') {
    await updateAvailabilitySlot(slotId, { currentBookings: slot.currentBookings + userIds.length });
  } else {
    await updateAvailabilitySlot(slotId, { isBooked: true });
  }

  const { sendEmail, getSessionEnrollmentEmail } = await import("./_core/email");
  for (const userId of userIds) {
    const user = await getUserById(userId);
    if (user && user.email) {
      const emailHtml = getSessionEnrollmentEmail({
        userName: user.name || "Student", sessionTitle: slot.title, sessionDate: slot.startTime,
        sessionType: slot.eventType, location: slot.location || undefined, sessionLink: slot.sessionLink || undefined,
      });
      await sendEmail({ to: user.email, subject: `You're Enrolled: ${slot.title}`, html: emailHtml });
    }
  }
}

export async function removeUsersFromSession(slotId: number, userIds: number[]): Promise<void> {
  const slot = await getAvailabilitySlotById(slotId);
  if (!slot) throw new Error("Session not found");

  const db = await getDb();
  if (db) {
    try {
      await db.update(bookings).set({ status: "cancelled" }).where(and(
        eq(bookings.slotId, slotId), inArray(bookings.userId, userIds), ne(bookings.status, "cancelled")
      ));
    } catch (e) {
      console.warn("[DB Fallback] removeUsersFromSession:", (e as Error).message);
      for (const uid of userIds) {
        await restFrom("bookings").update({ status: "cancelled" } as any).eq("slotId", slotId).eq("userId", uid).neq("status", "cancelled");
      }
    }
  } else {
    for (const uid of userIds) {
      await restFrom("bookings").update({ status: "cancelled" } as any).eq("slotId", slotId).eq("userId", uid).neq("status", "cancelled");
    }
  }

  if (slot.sessionType === 'group') {
    const remainingEnrollments = await getSessionEnrollments(slotId);
    await updateAvailabilitySlot(slotId, { currentBookings: remainingEnrollments.length });
  } else {
    await updateAvailabilitySlot(slotId, { isBooked: false });
  }
}

export async function getAllSessionsWithEnrollmentCounts(): Promise<(AvailabilitySlot & { enrollmentCount: number })[]> {
  const db = await getDb();
  let slots: AvailabilitySlot[] | null = null;
  if (db) {
    try {
      slots = await db.select().from(availabilitySlots).orderBy(desc(availabilitySlots.startTime));
    } catch (e) { console.warn("[DB Fallback] getAllSessionsWithEnrollmentCounts:", (e as Error).message); }
  }
  if (!slots) {
    const { data } = await restFrom("availabilitySlots").select("*").order("startTime", { ascending: false });
    slots = (data ?? []) as AvailabilitySlot[];
  }
  const slotsWithCounts = await Promise.all(
    slots.map(async (slot) => {
      const enrollments = await getSessionEnrollments(slot.id);
      return { ...slot, enrollmentCount: enrollments.length };
    })
  );
  return slotsWithCounts;
}

export async function getPublishedAvailableSlots(startDate?: Date, endDate?: Date): Promise<AvailabilitySlot[]> {
  const db = await getDb();
  let allSlots: AvailabilitySlot[] | null = null;
  if (db) {
    try {
      allSlots = await db.select().from(availabilitySlots).where(eq(availabilitySlots.status, "published")).orderBy(availabilitySlots.startTime);
    } catch (e) { console.warn("[DB Fallback] getPublishedAvailableSlots:", (e as Error).message); }
  }
  if (!allSlots) {
    const { data } = await restFrom("availabilitySlots").select("*").eq("status", "published").order("startTime", { ascending: true });
    allSlots = (data ?? []) as AvailabilitySlot[];
  }
  return allSlots.filter(slot => {
    if (slot.sessionType === 'group') { return slot.currentBookings < slot.capacity; }
    else { return !slot.isBooked; }
  });
}


// ============================================================================
// Membership Management
// ============================================================================

/**
 * Set user membership with activation and end dates
 */
export async function setUserMembership(
  userId: number,
  membershipStatus: 'free' | 'monthly' | 'annual',
  stripeSubscriptionId?: string
) {
  const now = new Date();
  let endDate: Date | null = null;
  if (membershipStatus === 'monthly') { endDate = new Date(now); endDate.setMonth(endDate.getMonth() + 1); }
  else if (membershipStatus === 'annual') { endDate = new Date(now); endDate.setFullYear(endDate.getFullYear() + 1); }

  const updates = {
    membershipStatus, membershipStartDate: membershipStatus === 'free' ? null : now,
    membershipEndDate: endDate, stripeSubscriptionId: stripeSubscriptionId || null,
  };

  const db = await getDb();
  if (db) {
    try { await db.update(users).set(updates).where(eq(users.id, userId)); return getUserById(userId); }
    catch (e) { console.warn("[DB Fallback] setUserMembership:", (e as Error).message); }
  }
  const restUpdates = {
    membershipStatus, membershipStartDate: membershipStatus === 'free' ? null : now.toISOString(),
    membershipEndDate: endDate ? endDate.toISOString() : null, stripeSubscriptionId: stripeSubscriptionId || null,
  };
  await restFrom("users").update(restUpdates as any).eq("id", userId);
  return getUserById(userId);
}

/**
 * Cancel user membership
 */
export async function cancelUserMembership(userId: number) {
  const updates = { membershipStatus: 'free' as const, membershipStartDate: null, membershipEndDate: null, stripeSubscriptionId: null };
  const db = await getDb();
  if (db) {
    try { await db.update(users).set(updates).where(eq(users.id, userId)); return getUserById(userId); }
    catch (e) { console.warn("[DB Fallback] cancelUserMembership:", (e as Error).message); }
  }
  await restFrom("users").update(updates as any).eq("id", userId);
  return getUserById(userId);
}

/**
 * Get user by Stripe subscription ID
 */
export async function getUserByStripeSubscriptionId(subscriptionId: string) {
  const db = await getDb();
  if (db) {
    try {
      const [user] = await db.select().from(users).where(eq(users.stripeSubscriptionId, subscriptionId)).limit(1);
      return user || null;
    } catch (e) { console.warn("[DB Fallback] getUserByStripeSubscriptionId:", (e as Error).message); }
  }
  const { data } = await restFrom("users").select("*").eq("stripeSubscriptionId", subscriptionId).limit(1).single();
  return (data as any) ?? null;
}

/**
 * Update membership end date (for subscription renewals)
 */
export async function updateMembershipEndDate(userId: number, endDate: Date) {
  const db = await getDb();
  if (db) {
    try { await db.update(users).set({ membershipEndDate: endDate }).where(eq(users.id, userId)); return getUserById(userId); }
    catch (e) { console.warn("[DB Fallback] updateMembershipEndDate:", (e as Error).message); }
  }
  await restFrom("users").update({ membershipEndDate: endDate.toISOString() } as any).eq("id", userId);
  return getUserById(userId);
}


// ============================================================================
// Discount Code Management
// ============================================================================

/**
 * Get discount code by code string
 */
export async function getDiscountCodeByCode(code: string) {
  const db = await getDb();
  if (db) {
    try {
      const { discountCodes } = await import("../drizzle/schema");
      const [discount] = await db.select().from(discountCodes).where(eq(discountCodes.code, code.toUpperCase())).limit(1);
      return discount || null;
    } catch (e) { console.warn("[DB Fallback] getDiscountCodeByCode:", (e as Error).message); }
  }
  const { data } = await restFrom("discountCodes").select("*").eq("code", code.toUpperCase()).limit(1).single();
  return (data as any) ?? null;
}

/**
 * Get all discount codes (admin)
 */
export async function getAllDiscountCodes() {
  const db = await getDb();
  if (db) {
    try {
      const { discountCodes } = await import("../drizzle/schema");
      return await db.select().from(discountCodes).orderBy(desc(discountCodes.createdAt));
    } catch (e) { console.warn("[DB Fallback] getAllDiscountCodes:", (e as Error).message); }
  }
  const { data } = await restFrom("discountCodes").select("*").order("createdAt", { ascending: false });
  return (data ?? []) as any[];
}

/**
 * Create discount code (admin)
 */
export async function createDiscountCode(data: {
  code: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  validFrom: Date;
  validTo: Date;
  maxUses?: number;
  applicableTo: 'all' | 'subscriptions' | 'courses';
  createdBy: number;
}) {
  const values = {
    code: data.code.toUpperCase(), description: data.description || null,
    discountType: data.discountType, discountValue: data.discountValue.toString(),
    validFrom: data.validFrom, validTo: data.validTo,
    maxUses: data.maxUses || null, applicableTo: data.applicableTo, createdBy: data.createdBy,
  };
  const db = await getDb();
  if (db) {
    try {
      const { discountCodes } = await import("../drizzle/schema");
      await db.insert(discountCodes).values(values);
      return getDiscountCodeByCode(data.code);
    } catch (e) { console.warn("[DB Fallback] createDiscountCode:", (e as Error).message); }
  }
  await restFrom("discountCodes").insert({ ...values, validFrom: data.validFrom.toISOString(), validTo: data.validTo.toISOString() } as any);
  return getDiscountCodeByCode(data.code);
}

/**
 * Update discount code (admin)
 */
export async function updateDiscountCode(
  id: number,
  data: Partial<{
    description: string;
    discountValue: number;
    validFrom: Date;
    validTo: Date;
    maxUses: number;
    isActive: boolean;
    applicableTo: 'all' | 'subscriptions' | 'courses';
  }>
) {
  const updateData: any = { ...data, updatedAt: new Date() };
  if (data.discountValue !== undefined) { updateData.discountValue = data.discountValue.toString(); }

  const db = await getDb();
  if (db) {
    try {
      const { discountCodes } = await import("../drizzle/schema");
      await db.update(discountCodes).set(updateData).where(eq(discountCodes.id, id));
      const [updated] = await db.select().from(discountCodes).where(eq(discountCodes.id, id));
      return updated || null;
    } catch (e) { console.warn("[DB Fallback] updateDiscountCode:", (e as Error).message); }
  }
  const restData = { ...updateData, updatedAt: new Date().toISOString() };
  if (data.validFrom) restData.validFrom = data.validFrom.toISOString();
  if (data.validTo) restData.validTo = data.validTo.toISOString();
  const { data: updated } = await restFrom("discountCodes").update(restData as any).eq("id", id).select("*").single();
  return (updated as any) ?? null;
}

/**
 * Delete discount code (admin)
 */
export async function deleteDiscountCode(id: number) {
  const db = await getDb();
  if (db) {
    try {
      const { discountCodes } = await import("../drizzle/schema");
      await db.delete(discountCodes).where(eq(discountCodes.id, id));
      return true;
    } catch (e) { console.warn("[DB Fallback] deleteDiscountCode:", (e as Error).message); }
  }
  await restFrom("discountCodes").delete().eq("id", id);
  return true;
}

/**
 * Increment discount code usage
 */
export async function incrementDiscountUsage(discountCodeId: number) {
  const db = await getDb();
  if (db) {
    try {
      const { discountCodes } = await import("../drizzle/schema");
      const { sql } = await import("drizzle-orm");
      await db.update(discountCodes).set({ currentUses: sql`${discountCodes.currentUses} + 1` }).where(eq(discountCodes.id, discountCodeId));
      return;
    } catch (e) { console.warn("[DB Fallback] incrementDiscountUsage:", (e as Error).message); }
  }
  // REST fallback: fetch current, then update
  const { data: current } = await restFrom("discountCodes").select("currentUses").eq("id", discountCodeId).single();
  const currentUses = ((current as any)?.currentUses ?? 0) + 1;
  await restFrom("discountCodes").update({ currentUses } as any).eq("id", discountCodeId);
}

/**
 * Record discount usage
 */
export async function recordDiscountUsage(data: {
  discountCodeId: number;
  userId: number;
  discountAmount: number;
  originalAmount: number;
  finalAmount: number;
  transactionType: 'subscription' | 'course';
  transactionId?: string;
}) {
  const values: any = {
    discountCodeId: data.discountCodeId, userId: data.userId,
    discountAmount: data.discountAmount, originalAmount: data.originalAmount,
    finalAmount: data.finalAmount, transactionType: data.transactionType,
  };
  if (data.transactionId) { values.transactionId = data.transactionId; }

  const db = await getDb();
  if (db) {
    try {
      const { discountUsage } = await import("../drizzle/schema");
      await db.insert(discountUsage).values(values);
      return;
    } catch (e) { console.warn("[DB Fallback] recordDiscountUsage:", (e as Error).message); }
  }
  await restFrom("discountUsage").insert(values as any);
}

/**
 * Get discount usage statistics
 */
export async function getDiscountUsageStats(discountCodeId: number) {
  const db = await getDb();
  if (db) {
    try {
      const { discountUsage } = await import("../drizzle/schema");
      const { sql } = await import("drizzle-orm");
      const [stats] = await db.select({
        totalUses: sql<number>`COUNT(*)`,
        totalDiscounted: sql<number>`SUM(${discountUsage.discountAmount})`,
        totalRevenue: sql<number>`SUM(${discountUsage.finalAmount})`,
      }).from(discountUsage).where(eq(discountUsage.discountCodeId, discountCodeId));
      return stats;
    } catch (e) { console.warn("[DB Fallback] getDiscountUsageStats:", (e as Error).message); }
  }
  // REST fallback: fetch all usage rows and compute
  const { data } = await restFrom("discountUsage").select("*").eq("discountCodeId", discountCodeId);
  const rows = (data ?? []) as any[];
  return {
    totalUses: rows.length,
    totalDiscounted: rows.reduce((sum, r) => sum + parseFloat(r.discountAmount || 0), 0),
    totalRevenue: rows.reduce((sum, r) => sum + parseFloat(r.finalAmount || 0), 0),
  };
}
