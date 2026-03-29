import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createAdminContext(): TrpcContext {
  return {
    req: {} as any,
    res: {} as any,
    user: {
      id: 1,
      supabaseId: "00000000-0000-0000-0000-000000000001",
      name: "Admin User",
      email: "admin@test.com",
      role: 'admin' as const,
      hasSeenWelcome: true,
      membershipStatus: "free" as const,
      membershipStartDate: null,
      membershipEndDate: null,
      stripeSubscriptionId: null,
      lastViewedByAdmin: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
  };
}

function createUserContext(userId: number): TrpcContext {
  return {
    req: {} as any,
    res: {} as any,
    user: {
      id: userId,
      supabaseId: `00000000-0000-0000-0000-${userId.toString().padStart(12, "0")}`,
      name: `Test User ${userId}`,
      email: `user${userId}@test.com`,
      role: 'user' as const,
      hasSeenWelcome: true,
      membershipStatus: "free" as const,
      membershipStartDate: null,
      membershipEndDate: null,
      stripeSubscriptionId: null,
      lastViewedByAdmin: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
  };
}

describe("Testimonial Notification Badge", () => {
  it("should return pending testimonials count", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const count = await caller.admin.testimonials.pendingCount();
    
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("should increase pending count when new testimonial is submitted", async () => {
    const adminCtx = createAdminContext();
    const userCtx = createUserContext(100);
    const adminCaller = appRouter.createCaller(adminCtx);
    const userCaller = appRouter.createCaller(userCtx);

    // Get initial count
    const initialCount = await adminCaller.admin.testimonials.pendingCount();

    // Submit new testimonial
    await userCaller.testimonials.submitCourseTestimonial({
      courseId: 120010,
      rating: 5,
      content: "New testimonial for notification test",
    });

    // Check count increased
    const newCount = await adminCaller.admin.testimonials.pendingCount();
    expect(newCount).toBe(initialCount + 1);
  });

  it("should decrease pending count when testimonial is approved", async () => {
    const adminCtx = createAdminContext();
    const userCtx = createUserContext(101);
    const adminCaller = appRouter.createCaller(adminCtx);
    const userCaller = appRouter.createCaller(userCtx);

    // Submit testimonial
    const testimonial = await userCaller.testimonials.submitCourseTestimonial({
      courseId: 120011,
      rating: 5,
      content: "Testimonial to be approved",
    });

    // Get count before approval
    const countBefore = await adminCaller.admin.testimonials.pendingCount();

    // Approve testimonial
    await adminCaller.admin.testimonials.approve({ id: testimonial.id });

    // Check count decreased
    const countAfter = await adminCaller.admin.testimonials.pendingCount();
    expect(countAfter).toBe(countBefore - 1);
  });

  it("should decrease pending count when testimonial is rejected", async () => {
    const adminCtx = createAdminContext();
    const userCtx = createUserContext(102);
    const adminCaller = appRouter.createCaller(adminCtx);
    const userCaller = appRouter.createCaller(userCtx);

    // Submit testimonial
    const testimonial = await userCaller.testimonials.submitCourseTestimonial({
      courseId: 120012,
      rating: 5,
      content: "Testimonial to be rejected",
    });

    // Get count before rejection
    const countBefore = await adminCaller.admin.testimonials.pendingCount();

    // Reject testimonial
    await adminCaller.admin.testimonials.reject({ id: testimonial.id });

    // Check count decreased
    const countAfter = await adminCaller.admin.testimonials.pendingCount();
    expect(countAfter).toBe(countBefore - 1);
  });

  it("should only count pending testimonials, not approved or rejected", async () => {
    const adminCtx = createAdminContext();
    const adminCaller = appRouter.createCaller(adminCtx);

    const count = await adminCaller.admin.testimonials.pendingCount();
    const allTestimonials = await adminCaller.admin.testimonials.list();
    const manualPendingCount = allTestimonials.filter(t => t.status === 'pending').length;

    expect(count).toBe(manualPendingCount);
  });
});
