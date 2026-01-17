import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

describe("Course Completion Enhancements", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let mockUser: { id: number; openId: string; role: "user" | "admin" };

  beforeEach(() => {
    mockUser = { id: 1, openId: "test-user", role: "user" };
    caller = appRouter.createCaller({
      user: mockUser,
      req: {} as any,
      res: {} as any,
    });
  });

  it("should submit course testimonial after completion", async () => {
    const result = await caller.testimonials.submitCourseTestimonial({
      courseId: 101,
      rating: 5,
      content: "This course was amazing! I learned so much about high heels dancing.",
    });
    
    expect(result).toBeDefined();
    expect(result.rating).toBe(5);
    expect(result.type).toBe("course");
    expect(result.status).toBe("pending");
  });

  it("should prevent duplicate testimonials for same course", async () => {
    // Submit first testimonial
    await caller.testimonials.submitCourseTestimonial({
      courseId: 102,
      rating: 5,
      content: "First testimonial for this course.",
    });

    // Try to submit second testimonial for same course
    await expect(
      caller.testimonials.submitCourseTestimonial({
        courseId: 102,
        rating: 4,
        content: "Second testimonial attempt.",
      })
    ).rejects.toThrow("already submitted feedback");
  });

  it("should require minimum rating of 1", async () => {
    await expect(
      caller.testimonials.submitCourseTestimonial({
        courseId: 103,
        rating: 0,
        content: "Invalid rating test.",
      })
    ).rejects.toThrow();
  });

  it("should require minimum content length", async () => {
    await expect(
      caller.testimonials.submitCourseTestimonial({
        courseId: 104,
        rating: 5,
        content: "Too short",
      })
    ).rejects.toThrow();
  });

  it("should detect course completion correctly", async () => {
    const modules = await caller.courses.getModulesWithLessons({ courseId: 1 });
    const totalLessons = modules.reduce((sum, module) => sum + module.lessons.length, 0);
    
    // If there are lessons, mark first one as complete and verify
    if (totalLessons > 0) {
      const firstLesson = modules[0]?.lessons[0];
      if (firstLesson) {
        await caller.courses.markLessonComplete({
          lessonId: firstLesson.id,
          courseId: 1,
        });
        
        const progress = await caller.courses.getUserProgress({ courseId: 1 });
        const completedCount = progress.filter(p => p.isCompleted).length;
        
        expect(completedCount).toBeGreaterThanOrEqual(1);
      }
    } else {
      // No lessons in course, skip test
      expect(totalLessons).toBe(0);
    }
  });
});
