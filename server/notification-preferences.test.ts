import { describe, expect, it, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { updateUserNotificationPreferences } from "./db-notification-preferences";

describe("Notification Preferences", () => {
  let testUserId: number;

  beforeAll(async () => {
    // Create a test user
    const db = await getDb();
    const [user] = await db
      .insert(users)
      .values({
        openId: `test-prefs-${Date.now()}`,
        name: "Test User",
        email: "test-prefs@example.com",
        role: "user",
      })
      .$returningId();
    testUserId = user.id;
  });

  it("should have all preferences enabled by default", async () => {
    const db = await getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(user.emailSessionEnrollment).toBe(true);
    expect(user.emailSessionReminders).toBe(true);
    expect(user.emailMessages).toBe(true);
    expect(user.emailCourseCompletion).toBe(true);
  });

  it("should update individual preferences", async () => {
    await updateUserNotificationPreferences(testUserId, {
      emailSessionEnrollment: false,
    });

    const db = await getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(user.emailSessionEnrollment).toBe(false);
    // Other preferences should remain unchanged
    expect(user.emailSessionReminders).toBe(true);
    expect(user.emailMessages).toBe(true);
    expect(user.emailCourseCompletion).toBe(true);
  });

  it("should update multiple preferences at once", async () => {
    await updateUserNotificationPreferences(testUserId, {
      emailSessionReminders: false,
      emailMessages: false,
    });

    const db = await getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(user.emailSessionReminders).toBe(false);
    expect(user.emailMessages).toBe(false);
    // Previously disabled preference should remain disabled
    expect(user.emailSessionEnrollment).toBe(false);
    // Untouched preference should remain enabled
    expect(user.emailCourseCompletion).toBe(true);
  });

  it("should re-enable disabled preferences", async () => {
    await updateUserNotificationPreferences(testUserId, {
      emailSessionEnrollment: true,
      emailSessionReminders: true,
    });

    const db = await getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(user.emailSessionEnrollment).toBe(true);
    expect(user.emailSessionReminders).toBe(true);
  });

  it("should handle empty update gracefully", async () => {
    const db = await getDb();
    const [beforeUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    await updateUserNotificationPreferences(testUserId, {});

    const [afterUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    // All preferences should remain unchanged
    expect(afterUser.emailSessionEnrollment).toBe(beforeUser.emailSessionEnrollment);
    expect(afterUser.emailSessionReminders).toBe(beforeUser.emailSessionReminders);
    expect(afterUser.emailMessages).toBe(beforeUser.emailMessages);
    expect(afterUser.emailCourseCompletion).toBe(beforeUser.emailCourseCompletion);
  });
});
