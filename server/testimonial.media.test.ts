import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createMockContext(userId: number): TrpcContext {
  return {
    req: {} as any,
    res: {} as any,
    user: {
      id: userId,
      openId: `user${userId}`,
      name: `Test User ${userId}`,
      email: `user${userId}@test.com`,
      role: 'user',
      hasSeenWelcome: true,
    },
  };
}

describe("Testimonial Media Upload", () => {
  it("should accept testimonial with photo URL", async () => {
    const ctx = createMockContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.testimonials.submitCourseTestimonial({
      courseId: 120001,
      rating: 5,
      content: "Great course! Here's my progress photo.",
      photoUrl: "https://storage.example.com/testimonials/photo123.jpg",
    });

    expect(result).toBeDefined();
    expect(result.photoUrl).toBe("https://storage.example.com/testimonials/photo123.jpg");
    expect(result.videoUrl).toBeNull();
  });

  it("should accept testimonial with video URL", async () => {
    const ctx = createMockContext(2);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.testimonials.submitCourseTestimonial({
      courseId: 120002,
      rating: 5,
      content: "Amazing results! Check out my video testimonial.",
      videoUrl: "https://storage.example.com/testimonials/video456.mp4",
    });

    expect(result).toBeDefined();
    expect(result.videoUrl).toBe("https://storage.example.com/testimonials/video456.mp4");
    expect(result.photoUrl).toBeNull();
  });

  it("should accept testimonial with both photo and video", async () => {
    const ctx = createMockContext(3);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.testimonials.submitCourseTestimonial({
      courseId: 120003,
      rating: 5,
      content: "Incredible transformation! Here's my before/after photo and video.",
      photoUrl: "https://storage.example.com/testimonials/photo789.jpg",
      videoUrl: "https://storage.example.com/testimonials/video789.mp4",
    });

    expect(result).toBeDefined();
    expect(result.photoUrl).toBe("https://storage.example.com/testimonials/photo789.jpg");
    expect(result.videoUrl).toBe("https://storage.example.com/testimonials/video789.mp4");
  });

  it("should accept testimonial without media (optional)", async () => {
    const ctx = createMockContext(4);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.testimonials.submitCourseTestimonial({
      courseId: 120004,
      rating: 4,
      content: "Good course, learned a lot!",
    });

    expect(result).toBeDefined();
    expect(result.photoUrl).toBeNull();
    expect(result.videoUrl).toBeNull();
  });

  it("should store testimonial with pending status", async () => {
    const ctx = createMockContext(5);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.testimonials.submitCourseTestimonial({
      courseId: 120005,
      rating: 5,
      content: "Excellent course with great results!",
      photoUrl: "https://storage.example.com/testimonials/photo999.jpg",
    });

    expect(result.status).toBe("pending");
  });
});
