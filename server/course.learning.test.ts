import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

describe("Course Learning Interface", () => {
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

  it("should get modules with lessons for a course", async () => {
    const result = await caller.courses.getModulesWithLessons({ courseId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should get user progress for a course", async () => {
    const result = await caller.courses.getUserProgress({ courseId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should check if user has access to a course", async () => {
    const result = await caller.courses.checkAccess({ courseId: 1 });
    expect(typeof result).toBe("boolean");
  });

  it("should mark lesson as complete", async () => {
    const result = await caller.courses.markLessonComplete({
      lessonId: 1,
      courseId: 1,
    });
    expect(result).toBeDefined();
  });

  it("should update lesson watch progress", async () => {
    const result = await caller.courses.updateLessonProgress({
      lessonId: 1,
      courseId: 1,
      watchedDuration: 120,
    });
    expect(result).toBeDefined();
  });

  it("should calculate progress correctly", async () => {
    // Mark first lesson as complete
    await caller.courses.markLessonComplete({
      lessonId: 1,
      courseId: 1,
    });

    const progress = await caller.courses.getUserProgress({ courseId: 1 });
    const completedCount = progress.filter((p) => p.isCompleted).length;
    expect(completedCount).toBeGreaterThanOrEqual(1);
  });

  it("should persist lesson completion in database", async () => {
    await caller.courses.markLessonComplete({
      lessonId: 1,
      courseId: 1,
    });

    const progress = await caller.courses.getUserProgress({ courseId: 1 });
    const lessonProgress = progress.find((p) => p.lessonId === 1);
    expect(lessonProgress?.isCompleted).toBe(true);
  });
});
