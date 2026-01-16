import { eq, and, desc, isNull } from "drizzle-orm";
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
  InsertChatMessage
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
