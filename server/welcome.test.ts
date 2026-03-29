import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

describe("Welcome Modal", () => {
  let testUserId: number;
  let testSupabaseId: string;

  beforeAll(async () => {
    testSupabaseId = randomUUID();
    const user = await db.syncUser({
      supabaseId: testSupabaseId,
      name: "Welcome Test User",
      email: `welcome-test-${Date.now()}@example.com`,
    });
    if (!user) throw new Error("Failed to create test user");
    testUserId = user.id;
  });

  it("should mark user as having seen welcome modal", async () => {
    // Get user before marking
    const userBefore = await db.getUserById(testUserId);
    expect(userBefore).toBeDefined();
    expect(userBefore?.hasSeenWelcome).toBe(false);

    // Create mock context
    const mockContext: TrpcContext = {
      user: userBefore!,
      supabaseUid: testSupabaseId,
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
    const mockContext: TrpcContext = {
      user: null,
      supabaseUid: null,
      req: {} as any,
      res: {} as any,
    };

    const caller = appRouter.createCaller(mockContext);

    // Should throw error for unauthenticated user
    await expect(caller.auth.markWelcomeSeen()).rejects.toThrow();
  });
});
