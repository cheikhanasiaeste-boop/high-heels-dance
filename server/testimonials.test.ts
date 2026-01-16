import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: "user" | "admin" = "user"): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: role === "admin" ? 1 : 2,
    openId: role === "admin" ? "admin-user" : "test-user",
    email: role === "admin" ? "admin@example.com" : "user@example.com",
    name: role === "admin" ? "Admin User" : "Test User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("testimonials", () => {
  it("should submit testimonial feedback", async () => {
    const { ctx } = createAuthContext("user");
    const caller = appRouter.createCaller(ctx);

    const testimonial = await caller.testimonials.submit({
      type: "course",
      relatedId: 101,
      rating: 5,
      review: "Amazing dance course! I learned so much and had a great time.",
    });

    expect(testimonial).toBeDefined();
    expect(testimonial.rating).toBe(5);
    expect(testimonial.status).toBe("pending");
    expect(testimonial.userName).toBe("Test User");
  });

  it("should prevent duplicate testimonials", async () => {
    const { ctx } = createAuthContext("user");
    const caller = appRouter.createCaller(ctx);

    // First submission
    await caller.testimonials.submit({
      type: "course",
      relatedId: 102,
      rating: 4,
      review: "Great course with excellent instruction and clear explanations.",
    });

    // Try to submit again for the same course
    await expect(
      caller.testimonials.submit({
        type: "course",
        relatedId: 102,
        rating: 5,
        review: "Trying to submit again.",
      })
    ).rejects.toThrow("already submitted feedback");
  });

  it("should check if user can submit feedback", async () => {
    const { ctx } = createAuthContext("user");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.testimonials.canSubmit({
      type: "session",
      relatedId: 9999, // Non-existent item
    });

    expect(result.canSubmit).toBe(true);
  });

  it("should list only approved testimonials for public", async () => {
    const { ctx } = createAuthContext("admin");
    const adminCaller = appRouter.createCaller(ctx);

    // Create and approve a testimonial
    const testimonial = await adminCaller.testimonials.submit({
      type: "course",
      relatedId: 103,
      rating: 5,
      review: "Excellent course! Highly recommend to anyone interested in dance.",
    });

    await adminCaller.admin.testimonials.approve({ id: testimonial.id });

    // Check public list
    const publicCtx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const publicCaller = appRouter.createCaller(publicCtx);
    const publicTestimonials = await publicCaller.testimonials.list();

    const approved = publicTestimonials.find((t) => t.id === testimonial.id);
    expect(approved).toBeDefined();
    expect(approved?.status).toBe("approved");
  });

  it("should allow admin to approve testimonial", async () => {
    const { ctx } = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const testimonial = await caller.testimonials.submit({
      type: "session",
      relatedId: 104,
      rating: 4,
      review: "Very helpful session with personalized feedback and guidance.",
    });

    const result = await caller.admin.testimonials.approve({ id: testimonial.id });
    expect(result.success).toBe(true);
  });

  it("should allow admin to reject testimonial", async () => {
    const { ctx } = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const testimonial = await caller.testimonials.submit({
      type: "course",
      relatedId: 105,
      rating: 2,
      review: "Not what I expected.",
    });

    const result = await caller.admin.testimonials.reject({ id: testimonial.id });
    expect(result.success).toBe(true);
  });

  it("should allow admin to toggle featured status", async () => {
    const { ctx } = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const testimonial = await caller.testimonials.submit({
      type: "course",
      relatedId: 106,
      rating: 5,
      review: "Outstanding course! The best dance instruction I've ever received.",
    });

    await caller.admin.testimonials.approve({ id: testimonial.id });

    const result = await caller.admin.testimonials.toggleFeatured({
      id: testimonial.id,
      isFeatured: true,
    });

    expect(result.success).toBe(true);
  });

  it("should allow admin to delete testimonial", async () => {
    const { ctx } = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const testimonial = await caller.testimonials.submit({
      type: "session",
      relatedId: 107,
      rating: 3,
      review: "It was okay.",
    });

    const result = await caller.admin.testimonials.delete({ id: testimonial.id });
    expect(result.success).toBe(true);
  });

  it("should prevent non-admin from approving testimonials", async () => {
    const { ctx } = createAuthContext("user");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.testimonials.approve({ id: 1 })
    ).rejects.toThrow("Admin access required");
  });
});
