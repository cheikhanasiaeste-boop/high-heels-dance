import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

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
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("sessions.create", () => {
  it("creates a draft session without validation errors", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sessions.create({
      title: "Test Session",
      description: "Test description",
      startTime: new Date("2026-02-01T10:00:00Z"),
      endTime: new Date("2026-02-01T11:00:00Z"),
      eventType: "online",
      sessionLink: undefined, // Not required for draft
      isFree: true,
      sessionType: "private",
      capacity: 1,
      status: "draft",
    });

    expect(result).toHaveProperty("id");
    expect(result.title).toBe("Test Session");
    expect(result.status).toBe("draft");
  });

  it("rejects publishing online session without session link", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.sessions.create({
        title: "Online Session",
        startTime: new Date("2026-02-01T10:00:00Z"),
        endTime: new Date("2026-02-01T11:00:00Z"),
        eventType: "online",
        sessionLink: undefined, // Missing required field
        isFree: true,
        sessionType: "private",
        capacity: 1,
        status: "published", // Trying to publish
      })
    ).rejects.toThrow("Online sessions must have a session link before publishing");
  });

  it("rejects publishing in-person session without location", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.sessions.create({
        title: "In-Person Session",
        startTime: new Date("2026-02-01T10:00:00Z"),
        endTime: new Date("2026-02-01T11:00:00Z"),
        eventType: "in-person",
        location: undefined, // Missing required field
        isFree: true,
        sessionType: "private",
        capacity: 1,
        status: "published", // Trying to publish
      })
    ).rejects.toThrow("In-person sessions must have a location before publishing");
  });

  it("successfully creates published online session with link", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sessions.create({
      title: "Online Session",
      startTime: new Date("2026-02-01T10:00:00Z"),
      endTime: new Date("2026-02-01T11:00:00Z"),
      eventType: "online",
      sessionLink: "https://zoom.us/j/123456789",
      isFree: true,
      sessionType: "private",
      capacity: 1,
      status: "published",
    });

    expect(result.status).toBe("published");
    expect(result.sessionLink).toBe("https://zoom.us/j/123456789");
  });

  it("successfully creates published in-person session with location", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sessions.create({
      title: "In-Person Session",
      startTime: new Date("2026-02-01T10:00:00Z"),
      endTime: new Date("2026-02-01T11:00:00Z"),
      eventType: "in-person",
      location: "123 Dance Studio, New York",
      isFree: true,
      sessionType: "private",
      capacity: 1,
      status: "published",
    });

    expect(result.status).toBe("published");
    expect(result.location).toBe("123 Dance Studio, New York");
  });

  it("creates group session with capacity greater than 1", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sessions.create({
      title: "Group Session",
      startTime: new Date("2026-02-01T10:00:00Z"),
      endTime: new Date("2026-02-01T11:00:00Z"),
      eventType: "online",
      sessionLink: "https://zoom.us/j/123456789",
      isFree: false,
      price: "50",
      sessionType: "group",
      capacity: 10,
      status: "published",
    });

    expect(result.sessionType).toBe("group");
    expect(result.capacity).toBe(10);
    expect(result.currentBookings).toBe(0);
  });
});

describe("sessions.update", () => {
  it("updates session title successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create a session first
    const session = await caller.sessions.create({
      title: "Original Title",
      startTime: new Date("2026-02-01T10:00:00Z"),
      endTime: new Date("2026-02-01T11:00:00Z"),
      eventType: "online",
      sessionLink: "https://zoom.us/j/123",
      isFree: true,
      sessionType: "private",
      capacity: 1,
      status: "draft",
    });

    // Update the title
    const result = await caller.sessions.update({
      id: session.id,
      title: "Updated Title",
    });

    expect(result.success).toBe(true);

    // Verify the update
    const updated = await caller.sessions.getById({ id: session.id });
    expect(updated.title).toBe("Updated Title");
  });

  it("rejects publishing online session without link during update", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create draft online session without link
    const session = await caller.sessions.create({
      title: "Online Session",
      startTime: new Date("2026-02-01T10:00:00Z"),
      endTime: new Date("2026-02-01T11:00:00Z"),
      eventType: "online",
      isFree: true,
      sessionType: "private",
      capacity: 1,
      status: "draft",
    });

    // Try to publish without adding link
    await expect(
      caller.sessions.update({
        id: session.id,
        status: "published",
      })
    ).rejects.toThrow("Online sessions must have a session link before publishing");
  });

  it("allows publishing after adding required fields", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create draft online session
    const session = await caller.sessions.create({
      title: "Online Session",
      startTime: new Date("2026-02-01T10:00:00Z"),
      endTime: new Date("2026-02-01T11:00:00Z"),
      eventType: "online",
      isFree: true,
      sessionType: "private",
      capacity: 1,
      status: "draft",
    });

    // Add session link and publish
    const result = await caller.sessions.update({
      id: session.id,
      sessionLink: "https://zoom.us/j/123456789",
      status: "published",
    });

    expect(result.success).toBe(true);

    const updated = await caller.sessions.getById({ id: session.id });
    expect(updated.status).toBe("published");
    expect(updated.sessionLink).toBe("https://zoom.us/j/123456789");
  });
});

describe("sessions.updateStatus", () => {
  it("transitions session from draft to published when valid", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create published session
    const session = await caller.sessions.create({
      title: "Test Session",
      startTime: new Date("2026-02-01T10:00:00Z"),
      endTime: new Date("2026-02-01T11:00:00Z"),
      eventType: "online",
      sessionLink: "https://zoom.us/j/123",
      isFree: true,
      sessionType: "private",
      capacity: 1,
      status: "draft",
    });

    // Publish it
    const result = await caller.sessions.updateStatus({
      id: session.id,
      status: "published",
    });

    expect(result.success).toBe(true);

    const updated = await caller.sessions.getById({ id: session.id });
    expect(updated.status).toBe("published");
  });

  it("transitions session from published back to draft", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create published session
    const session = await caller.sessions.create({
      title: "Test Session",
      startTime: new Date("2026-02-01T10:00:00Z"),
      endTime: new Date("2026-02-01T11:00:00Z"),
      eventType: "online",
      sessionLink: "https://zoom.us/j/123",
      isFree: true,
      sessionType: "private",
      capacity: 1,
      status: "published",
    });

    // Unpublish it
    const result = await caller.sessions.updateStatus({
      id: session.id,
      status: "draft",
    });

    expect(result.success).toBe(true);

    const updated = await caller.sessions.getById({ id: session.id });
    expect(updated.status).toBe("draft");
  });

  it("rejects publishing session without required fields", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create draft session without link
    const session = await caller.sessions.create({
      title: "Online Session",
      startTime: new Date("2026-02-01T10:00:00Z"),
      endTime: new Date("2026-02-01T11:00:00Z"),
      eventType: "online",
      isFree: true,
      sessionType: "private",
      capacity: 1,
      status: "draft",
    });

    // Try to publish
    await expect(
      caller.sessions.updateStatus({
        id: session.id,
        status: "published",
      })
    ).rejects.toThrow("Online sessions must have a session link before publishing");
  });
});

describe("sessions.delete", () => {
  it("deletes session without enrollments", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create session
    const session = await caller.sessions.create({
      title: "Test Session",
      startTime: new Date("2026-02-01T10:00:00Z"),
      endTime: new Date("2026-02-01T11:00:00Z"),
      eventType: "online",
      sessionLink: "https://zoom.us/j/123",
      isFree: true,
      sessionType: "private",
      capacity: 1,
      status: "draft",
    });

    // Delete it
    const result = await caller.sessions.delete({ id: session.id });
    expect(result.success).toBe(true);

    // Verify it's deleted
    await expect(
      caller.sessions.getById({ id: session.id })
    ).rejects.toThrow("Session not found");
  });

  it("rejects deleting session with active enrollments", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create session
    const session = await caller.sessions.create({
      title: "Test Session",
      startTime: new Date("2026-02-01T10:00:00Z"),
      endTime: new Date("2026-02-01T11:00:00Z"),
      eventType: "online",
      sessionLink: "https://zoom.us/j/123",
      isFree: true,
      sessionType: "group",
      capacity: 10,
      status: "published",
    });

    // Add enrollment
    await caller.sessions.addUsers({
      sessionId: session.id,
      userIds: [1], // Admin user
    });

    // Try to delete
    await expect(
      caller.sessions.delete({ id: session.id })
    ).rejects.toThrow("Cannot delete session with");
  });
});

describe("sessions enrollment operations", () => {
  it("adds users to session successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create session
    const session = await caller.sessions.create({
      title: "Group Session",
      startTime: new Date("2026-02-01T10:00:00Z"),
      endTime: new Date("2026-02-01T11:00:00Z"),
      eventType: "online",
      sessionLink: "https://zoom.us/j/123",
      isFree: true,
      sessionType: "group",
      capacity: 10,
      status: "published",
    });

    // Add users
    const result = await caller.sessions.addUsers({
      sessionId: session.id,
      userIds: [1],
    });

    expect(result.success).toBe(true);

    // Verify enrollment
    const enrollments = await caller.sessions.getEnrollments({
      sessionId: session.id,
    });
    expect(enrollments.length).toBe(1);
    expect(enrollments[0]?.userId).toBe(1);
  });

  it("removes users from session successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create session
    const session = await caller.sessions.create({
      title: "Group Session",
      startTime: new Date("2026-02-01T10:00:00Z"),
      endTime: new Date("2026-02-01T11:00:00Z"),
      eventType: "online",
      sessionLink: "https://zoom.us/j/123",
      isFree: true,
      sessionType: "group",
      capacity: 10,
      status: "published",
    });

    // Add user
    await caller.sessions.addUsers({
      sessionId: session.id,
      userIds: [1],
    });

    // Remove user
    const result = await caller.sessions.removeUsers({
      sessionId: session.id,
      userIds: [1],
    });

    expect(result.success).toBe(true);

    // Verify removal
    const enrollments = await caller.sessions.getEnrollments({
      sessionId: session.id,
    });
    expect(enrollments.length).toBe(0);
  });

  it("handles bulk user enrollment", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create session with larger capacity
    const session = await caller.sessions.create({
      title: "Large Group Session",
      startTime: new Date("2026-02-01T10:00:00Z"),
      endTime: new Date("2026-02-01T11:00:00Z"),
      eventType: "online",
      sessionLink: "https://zoom.us/j/123",
      isFree: true,
      sessionType: "group",
      capacity: 50,
      status: "published",
    });

    // Add multiple users (assuming they exist)
    const result = await caller.sessions.addUsers({
      sessionId: session.id,
      userIds: [1], // Only testing with admin user
    });

    expect(result.success).toBe(true);
  });
});
