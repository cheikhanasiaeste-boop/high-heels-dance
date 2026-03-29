import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

describe("User Management Enhancements", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller({
      user: {
        id: 1,
        supabaseId: "00000000-0000-0000-0000-000000000001",
        role: "admin" as const,
        name: "Admin User",
        email: "admin@test.com",
        hasSeenWelcome: false,
        membershipStatus: "free" as const,
        membershipStartDate: null,
        membershipEndDate: null,
        stripeSubscriptionId: null,
        lastViewedByAdmin: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as any,
      res: {} as any,
    });
  });

  it("should get count of new/unviewed users", async () => {
    const count = await caller.admin.users.newUserCount();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("should mark user as viewed by admin", async () => {
    // Get all users first
    const users = await db.getAllUsers();
    expect(users.length).toBeGreaterThan(0);

    const testUser = users.find(u => !u.lastViewedByAdmin);
    if (testUser) {
      const result = await caller.admin.users.markUserViewed({ userId: testUser.id });
      expect(result.success).toBe(true);

      // Verify user is marked as viewed
      const updatedUser = await db.getUserById(testUser.id);
      expect(updatedUser?.lastViewedByAdmin).toBeTruthy();
    }
  });

  it("should include enrollment count in user list", async () => {
    const users = await db.getAllUsers();
    expect(users.length).toBeGreaterThan(0);

    // All users should have enrollmentCount field
    users.forEach(user => {
      expect(user).toHaveProperty("enrollmentCount");
      expect(typeof user.enrollmentCount).toBe("number");
      expect(user.enrollmentCount).toBeGreaterThanOrEqual(0);
    });
  });

  it("should get enrollment count for specific user", async () => {
    const users = await db.getAllUsers();
    expect(users.length).toBeGreaterThan(0);

    const testUser = users[0];
    const count = await db.getUserEnrollmentCount(testUser.id);
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("should decrease new user count after marking as viewed", async () => {
    const initialCount = await caller.admin.users.newUserCount();
    
    // Find an unviewed user
    const users = await db.getAllUsers();
    const unviewedUser = users.find(u => !u.lastViewedByAdmin);
    
    if (unviewedUser) {
      await caller.admin.users.markUserViewed({ userId: unviewedUser.id });
      
      const newCount = await caller.admin.users.newUserCount();
      expect(newCount).toBe(initialCount - 1);
    }
  });
});
