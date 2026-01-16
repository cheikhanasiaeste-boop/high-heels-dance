import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { Context } from "./_core/context";

describe("Welcome Modal", () => {
  let testUserId: number;

  beforeAll(async () => {
    // Create a test user
    const testUser = {
      openId: `test-welcome-${Date.now()}`,
      name: "Welcome Test User",
      email: `welcome-test-${Date.now()}@example.com`,
      loginMethod: "google",
    };

    await db.upsertUser(testUser);
    const user = await db.getUserByOpenId(testUser.openId);
    if (!user) throw new Error("Failed to create test user");
    testUserId = user.id;
  });

  it("should mark user as having seen welcome modal", async () => {
    // Get user before marking
    const userBefore = await db.getUserById(testUserId);
    expect(userBefore).toBeDefined();
    expect(userBefore?.hasSeenWelcome).toBe(false);

    // Create mock context
    const mockContext: Context = {
      user: userBefore!,
      req: {} as any,
      res: {} as any,
    };

    // Call the markWelcomeSeen mutation
    const caller = appRouter.createCaller(mockContext);
    const result = await caller.auth.markWelcomeSeen();

    expect(result.success).toBe(true);

    // Verify user has been marked
    const userAfter = await db.getUserById(testUserId);
    expect(userAfter).toBeDefined();
    expect(userAfter?.hasSeenWelcome).toBe(true);
  });

  it("should not show welcome modal to users who have already seen it", async () => {
    // Get user who has already seen welcome
    const user = await db.getUserById(testUserId);
    expect(user).toBeDefined();
    expect(user?.hasSeenWelcome).toBe(true);

    // In the frontend, this would prevent the modal from showing
    // We verify the database state is correct
    const shouldShowWelcome = !user?.hasSeenWelcome;
    expect(shouldShowWelcome).toBe(false);
  });

  it("should require authentication to mark welcome as seen", async () => {
    // Create mock context without user (unauthenticated)
    const mockContext: Context = {
      user: null,
      req: {} as any,
      res: {} as any,
    };

    const caller = appRouter.createCaller(mockContext);

    // Should throw error for unauthenticated user
    await expect(caller.auth.markWelcomeSeen()).rejects.toThrow();
  });
});
