/**
 * Course completion tracking functions
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { purchases, courses, users } from "../drizzle/schema";
import { sendEmail, getCourseCompletionEmail } from "./_core/email";
import { nanoid } from "nanoid";

/**
 * Mark a course as completed for a user
 * Sends congratulations email
 */
export async function markCourseComplete(userId: number, courseId: number): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Find the purchase record
  const [purchase] = await db
    .select()
    .from(purchases)
    .where(and(
      eq(purchases.userId, userId),
      eq(purchases.courseId, courseId)
    ))
    .limit(1);

  if (!purchase) {
    throw new Error("Purchase not found. User must purchase the course first.");
  }

  if (purchase.isCompleted) {
    return { success: true }; // Already completed
  }

  // Mark as completed with unique certificate ID
  const certId = `HHD-${nanoid(10).toUpperCase()}`;
  await db
    .update(purchases)
    .set({
      isCompleted: true,
      completedAt: new Date(),
      certificateId: certId,
    } as any)
    .where(eq(purchases.id, purchase.id));

  // Get user and course details for email
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);

  if (user && user.email && course) {
    const emailHtml = getCourseCompletionEmail({
      userName: user.name || "Student",
      courseTitle: course.title,
      completionDate: new Date(),
    });

    await sendEmail({
      to: user.email,
      subject: `Congratulations! You completed ${course.title}`,
      html: emailHtml,
    });
  }

  return { success: true };
}

/**
 * Check if a user has completed a course
 */
export async function isCourseCompleted(userId: number, courseId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [purchase] = await db
    .select()
    .from(purchases)
    .where(and(
      eq(purchases.userId, userId),
      eq(purchases.courseId, courseId),
      eq(purchases.isCompleted, true)
    ))
    .limit(1);

  return !!purchase;
}
