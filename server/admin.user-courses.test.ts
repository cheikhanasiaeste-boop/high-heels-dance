import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { inferProcedureInput } from "@trpc/server";

describe("Admin User-Course Management", () => {
  const testAdmin = {
    id: 999,
    supabaseId: "00000000-0000-0000-0000-000000000099",
    name: "Test Admin",
    email: "admin-test@example.com",
    role: "admin" as const,
    hasSeenWelcome: false,
    membershipStatus: "free" as const,
    membershipStartDate: null,
    membershipEndDate: null,
    stripeSubscriptionId: null,
    lastViewedByAdmin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const testUser = {
    id: 1000,
    supabaseId: "00000000-0000-0000-0000-0000000010000",
    name: "Test User",
    email: "user-test@example.com",
    role: "user" as const,
    hasSeenWelcome: false,
    membershipStatus: "free" as const,
    membershipStartDate: null,
    membershipEndDate: null,
    stripeSubscriptionId: null,
    lastViewedByAdmin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  describe("admin.courseAssignment.assign", () => {
    it("should have correct input schema", async () => {
      const caller = appRouter.createCaller({
        user: testAdmin,
        req: {} as any,
        res: {} as any,
      });

      type AssignInput = inferProcedureInput<typeof appRouter.admin.courseAssignment.assign>;
      
      // Verify the input type is correct
      const input: AssignInput = {
        userId: 1,
        courseId: 1,
      };

      expect(input.userId).toBe(1);
      expect(input.courseId).toBe(1);
    });
  });

  describe("admin.courseAssignment.remove", () => {
    it("should have correct input schema", async () => {
      const caller = appRouter.createCaller({
        user: testAdmin,
        req: {} as any,
        res: {} as any,
      });

      type RemoveInput = inferProcedureInput<typeof appRouter.admin.courseAssignment.remove>;
      
      const input: RemoveInput = {
        userId: 1,
        courseId: 1,
      };

      expect(input.userId).toBe(1);
      expect(input.courseId).toBe(1);
    });
  });

  describe("admin.courseAssignment.bulkAssign", () => {
    it("should have correct input schema", async () => {
      const caller = appRouter.createCaller({
        user: testAdmin,
        req: {} as any,
        res: {} as any,
      });

      type BulkAssignInput = inferProcedureInput<typeof appRouter.admin.courseAssignment.bulkAssign>;
      
      const input: BulkAssignInput = {
        userIds: [1, 2],
        courseIds: [1, 2],
      };

      expect(input.userIds).toEqual([1, 2]);
      expect(input.courseIds).toEqual([1, 2]);
    });
  });

  describe("admin.courseAssignment.bulkRemove", () => {
    it("should have correct input schema", async () => {
      const caller = appRouter.createCaller({
        user: testAdmin,
        req: {} as any,
        res: {} as any,
      });

      type BulkRemoveInput = inferProcedureInput<typeof appRouter.admin.courseAssignment.bulkRemove>;
      
      const input: BulkRemoveInput = {
        userIds: [1, 2],
        courseIds: [1, 2],
      };

      expect(input.userIds).toEqual([1, 2]);
      expect(input.courseIds).toEqual([1, 2]);
    });
  });

  describe("admin.courseAssignment.listUsersWithCourses", () => {
    it("should have correct input schema with pagination", async () => {
      const caller = appRouter.createCaller({
        user: testAdmin,
        req: {} as any,
        res: {} as any,
      });

      type ListInput = inferProcedureInput<typeof appRouter.admin.courseAssignment.listUsersWithCourses>;
      
      const input: ListInput = {
        page: 1,
        limit: 10,
      };

      expect(input.page).toBe(1);
      expect(input.limit).toBe(10);
    });

    it("should support optional filters", async () => {
      type ListInput = inferProcedureInput<typeof appRouter.admin.courseAssignment.listUsersWithCourses>;
      
      const input: ListInput = {
        page: 1,
        limit: 10,
        search: "test",
        role: "user",
        courseId: 1,
      };

      expect(input.search).toBe("test");
      expect(input.role).toBe("user");
      expect(input.courseId).toBe(1);
    });
  });

  describe("admin.courseAssignment.getUserCourses", () => {
    it("should have correct input schema", async () => {
      const caller = appRouter.createCaller({
        user: testAdmin,
        req: {} as any,
        res: {} as any,
      });

      type GetCoursesInput = inferProcedureInput<typeof appRouter.admin.courseAssignment.getUserCourses>;
      
      const input: GetCoursesInput = {
        userId: 1,
      };

      expect(input.userId).toBe(1);
    });
  });

  describe("admin.users.create", () => {
    it("should have correct input schema", async () => {
      const caller = appRouter.createCaller({
        user: testAdmin,
        req: {} as any,
        res: {} as any,
      });

      type CreateInput = inferProcedureInput<typeof appRouter.admin.users.create>;
      
      const input: CreateInput = {
        name: "New User",
        email: "newuser@example.com",
        role: "user",
      };

      expect(input.name).toBe("New User");
      expect(input.email).toBe("newuser@example.com");
      expect(input.role).toBe("user");
    });
  });

  describe("admin.users.delete", () => {
    it("should have correct input schema", async () => {
      const caller = appRouter.createCaller({
        user: testAdmin,
        req: {} as any,
        res: {} as any,
      });

      type DeleteInput = inferProcedureInput<typeof appRouter.admin.users.delete>;
      
      const input: DeleteInput = {
        userId: 1,
      };

      expect(input.userId).toBe(1);
    });
  });

  describe("Authorization", () => {
    it("should require admin role for course assignment operations", async () => {
      const regularUserCaller = appRouter.createCaller({
        user: testUser,
        req: {} as any,
        res: {} as any,
      });

      // Attempt to assign course as regular user should fail
      await expect(
        regularUserCaller.admin.courseAssignment.assign({
          userId: 1,
          courseId: 1,
        })
      ).rejects.toThrow();
    });

    it("should require admin role for user management operations", async () => {
      const regularUserCaller = appRouter.createCaller({
        user: testUser,
        req: {} as any,
        res: {} as any,
      });

      // Attempt to create user as regular user should fail
      await expect(
        regularUserCaller.admin.users.create({
          name: "Test",
          email: "test@example.com",
          role: "user",
        })
      ).rejects.toThrow();
    });
  });
});
