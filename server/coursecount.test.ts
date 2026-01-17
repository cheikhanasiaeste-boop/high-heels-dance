import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";

describe("User Course Count", () => {
  let testUserId: number;
  let testCourseId: number;

  beforeAll(async () => {
    // Create a test user
    const timestamp = Date.now();
    const user = await db.createUserManually(
      { name: "Course Count Test User", email: `coursecount-${timestamp}@example.com`, role: "user" },
      1
    );
    testUserId = user.id;

    // Create a test course
    const course = await db.createCourse({
      title: "Test Course for Count",
      description: "Test course description",
      price: 99.99,
      isFree: false,
      imageUrl: null,
      previewVideoUrl: null,
      createdBy: 1,
    });
    testCourseId = course.id;
  });

  it("should return 0 course count for user with no enrollments", async () => {
    const result = await db.listUsers({
      page: 1,
      limit: 20,
      roleFilter: "all",
    });

    const testUser = result.users.find(u => u.id === testUserId);
    expect(testUser).toBeDefined();
    expect(testUser?.courseCount).toBe(0);
  });

  it("should return correct course count after enrolling user in a course", async () => {
    // Enroll user in course
    await db.assignCourseToUser(testUserId, testCourseId, 1);

    const result = await db.listUsers({
      page: 1,
      limit: 20,
      roleFilter: "all",
    });

    const testUser = result.users.find(u => u.id === testUserId);
    expect(testUser).toBeDefined();
    expect(testUser?.courseCount).toBe(1);
  });

  it("should update course count after removing enrollment", async () => {
    // Remove enrollment
    await db.removeCourseFromUser(testUserId, testCourseId);

    const result = await db.listUsers({
      page: 1,
      limit: 20,
      roleFilter: "all",
    });

    const testUser = result.users.find(u => u.id === testUserId);
    expect(testUser).toBeDefined();
    expect(testUser?.courseCount).toBe(0);
  });
});
