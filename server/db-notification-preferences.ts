/**
 * User notification preferences management
 */

import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "../drizzle/schema";

interface NotificationPreferences {
  emailSessionEnrollment?: boolean;
  emailSessionReminders?: boolean;
  emailMessages?: boolean;
  emailCourseCompletion?: boolean;
}

/**
 * Update user's email notification preferences
 */
export async function updateUserNotificationPreferences(
  userId: number,
  preferences: NotificationPreferences
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updates: Partial<typeof users.$inferInsert> = {};
  
  if (preferences.emailSessionEnrollment !== undefined) {
    updates.emailSessionEnrollment = preferences.emailSessionEnrollment;
  }
  if (preferences.emailSessionReminders !== undefined) {
    updates.emailSessionReminders = preferences.emailSessionReminders;
  }
  if (preferences.emailMessages !== undefined) {
    updates.emailMessages = preferences.emailMessages;
  }
  if (preferences.emailCourseCompletion !== undefined) {
    updates.emailCourseCompletion = preferences.emailCourseCompletion;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(users).set(updates).where(eq(users.id, userId));
  }
}
