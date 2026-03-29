import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    supabaseId: "00000000-0000-0000-0000-000000000001",
    email: "admin@example.com",
    name: "Admin User",
    role: "admin",
    hasSeenWelcome: false,
    membershipStatus: "free",
    membershipStartDate: null,
    membershipEndDate: null,
    stripeSubscriptionId: null,
    lastViewedByAdmin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    supabaseId: "00000000-0000-0000-0000-000000000002",
    email: "user@example.com",
    name: "Regular User",
    role: "user",
    hasSeenWelcome: false,
    membershipStatus: "free",
    membershipStartDate: null,
    membershipEndDate: null,
    stripeSubscriptionId: null,
    lastViewedByAdmin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Admin Content Management", () => {
  it("should allow admin to update site content", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.admin.content.update({
      key: "test_content",
      value: "Test Value",
    });

    expect(result).toEqual({ success: true });

    const retrieved = await caller.admin.content.get({ key: "test_content" });
    expect(retrieved).toBe("Test Value");
  });

  it("should prevent non-admin from updating content", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.content.update({
        key: "test_content",
        value: "Unauthorized",
      })
    ).rejects.toThrow();
  });
});

describe("Admin User Management", () => {
  it("should allow admin to list all users", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const users = await caller.admin.users.list();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);
  });

  it("should allow admin to update user role", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.admin.users.updateRole({
      userId: 2,
      role: "admin",
    });

    expect(result).toEqual({ success: true });

    // Verify role was updated
    const user = await caller.admin.users.getById({ userId: 2 });
    expect(user.role).toBe("admin");

    // Clean up: revert to user role
    await caller.admin.users.updateRole({
      userId: 2,
      role: "user",
    });
  });

  it("should prevent non-admin from managing users", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.admin.users.list()).rejects.toThrow();

    await expect(
      caller.admin.users.updateRole({
        userId: 1,
        role: "user",
      })
    ).rejects.toThrow();
  });

  it("should allow admin to get user by ID", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const user = await caller.admin.users.getById({ userId: 1 });
    expect(user).toBeDefined();
    expect(user.id).toBe(1);
    expect(user.email).toBe("admin@example.com");
  });

  it("should throw error when getting non-existent user", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.users.getById({ userId: 99999 })
    ).rejects.toThrow("User not found");
  });
});
