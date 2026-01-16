import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
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
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("Video Upload", () => {
  it("should upload video and return URL", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a small test video data (1x1 pixel black MP4 header)
    const testVideoBase64 = "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAu1tZGF0";

    const result = await caller.testimonials.uploadVideo({
      filename: "test-video.mp4",
      contentType: "video/mp4",
      data: testVideoBase64,
    });

    expect(result).toHaveProperty("url");
    expect(result).toHaveProperty("key");
    expect(result.url).toContain("testimonials/");
    expect(result.key).toContain("test-video.mp4");
  }, 10000);

  it("should handle video testimonial submission with video URL", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const videoUrl = "https://example.com/test-video.mp4";

    const result = await caller.testimonials.submit({
      type: "course",
      relatedId: 999,
      rating: 5,
      review: "Great course with video testimonial!",
      videoUrl,
    });

    expect(result).toHaveProperty("id");
    expect(result.videoUrl).toBe(videoUrl);
    expect(result.rating).toBe(5);
    expect(result.status).toBe("pending");
  });

  it("should list video testimonials only", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const videoTestimonials = await caller.testimonials.videoTestimonials();

    expect(Array.isArray(videoTestimonials)).toBe(true);
    // All returned testimonials should have videoUrl
    videoTestimonials.forEach((testimonial) => {
      expect(testimonial.videoUrl).toBeTruthy();
    });
  });
});
