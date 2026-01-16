import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockContext(user?: AuthenticatedUser): TrpcContext {
  const ctx: TrpcContext = {
    user: user || null,
    req: {
      protocol: "https",
      headers: { origin: "https://test.example.com" },
      get: (name: string) => name === "host" ? "test.example.com" : undefined,
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return ctx;
}

function createTestUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function createAdminUser(): AuthenticatedUser {
  return createTestUser({
    id: 2,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    role: "admin",
  });
}

describe("Course Management", () => {
  describe("courses.list", () => {
    it("returns published courses for public access", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const courses = await caller.courses.list();

      expect(Array.isArray(courses)).toBe(true);
      // All returned courses should be published
      courses.forEach(course => {
        expect(course.isPublished).toBe(true);
      });
    });
  });

  describe("courses.hasAccess", () => {
    it("allows access to free courses for authenticated users", async () => {
      const user = createTestUser();
      const ctx = createMockContext(user);
      const caller = appRouter.createCaller(ctx);

      // Create a free course
      const adminCtx = createMockContext(createAdminUser());
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const course = await adminCaller.admin.courses.create({
        title: "Free Test Course",
        description: "A free course for testing",
        price: "0",
        isFree: true,
        isPublished: true,
      });

      const hasAccess = await caller.courses.hasAccess({ courseId: course.id });

      expect(hasAccess).toBe(true);
    });

    it("denies access to paid courses without purchase", async () => {
      const user = createTestUser();
      const ctx = createMockContext(user);
      const caller = appRouter.createCaller(ctx);

      // Create a paid course
      const adminCtx = createMockContext(createAdminUser());
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const course = await adminCaller.admin.courses.create({
        title: "Paid Test Course",
        description: "A paid course for testing",
        price: "29.99",
        isFree: false,
        isPublished: true,
      });

      const hasAccess = await caller.courses.hasAccess({ courseId: course.id });

      expect(hasAccess).toBe(false);
    });
  });
});

describe("Admin Course Management", () => {
  describe("admin.courses.create", () => {
    it("allows admin to create a course", async () => {
      const admin = createAdminUser();
      const ctx = createMockContext(admin);
      const caller = appRouter.createCaller(ctx);

      const course = await caller.admin.courses.create({
        title: "Admin Test Course",
        description: "Course created by admin",
        price: "49.99",
        originalPrice: "79.99",
        isFree: false,
        isPublished: true,
      });

      expect(course).toBeDefined();
      expect(course.title).toBe("Admin Test Course");
      expect(course.price).toBe("49.99");
    });

    it("denies course creation for non-admin users", async () => {
      const user = createTestUser();
      const ctx = createMockContext(user);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.admin.courses.create({
          title: "Unauthorized Course",
          description: "This should fail",
          price: "29.99",
          isFree: false,
          isPublished: true,
        })
      ).rejects.toThrow("Admin access required");
    });
  });

  describe("admin.courses.update", () => {
    it("allows admin to update a course", async () => {
      const admin = createAdminUser();
      const ctx = createMockContext(admin);
      const caller = appRouter.createCaller(ctx);

      // Create a course first
      const course = await caller.admin.courses.create({
        title: "Original Title",
        description: "Original description",
        price: "29.99",
        isFree: false,
        isPublished: true,
      });

      // Update the course
      const updated = await caller.admin.courses.update({
        id: course.id,
        title: "Updated Title",
        price: "39.99",
      });

      expect(updated?.title).toBe("Updated Title");
      expect(updated?.price).toBe("39.99");
      expect(updated?.description).toBe("Original description"); // Unchanged
    });
  });

  describe("admin.courses.delete", () => {
    it("allows admin to delete a course", async () => {
      const admin = createAdminUser();
      const ctx = createMockContext(admin);
      const caller = appRouter.createCaller(ctx);

      // Create a course first
      const course = await caller.admin.courses.create({
        title: "Course to Delete",
        description: "This will be deleted",
        price: "29.99",
        isFree: false,
        isPublished: true,
      });

      // Delete the course
      const result = await caller.admin.courses.delete({ id: course.id });

      expect(result.success).toBe(true);

      // Verify it's deleted
      const deletedCourse = await db.getCourseById(course.id);
      expect(deletedCourse).toBeUndefined();
    });
  });
});

describe("Banner Management", () => {
  describe("admin.banner.update", () => {
    it("allows admin to update banner settings", async () => {
      const admin = createAdminUser();
      const ctx = createMockContext(admin);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.admin.banner.update({
        enabled: true,
        text: "Special discount: 50% off all courses!",
      });

      expect(result.success).toBe(true);

      // Verify the settings were saved
      const banner = await caller.admin.banner.get();
      expect(banner.enabled).toBe(true);
      expect(banner.text).toBe("Special discount: 50% off all courses!");
    });
  });

  describe("banner.get", () => {
    it("allows public access to banner settings", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const banner = await caller.banner.get();

      expect(banner).toBeDefined();
      expect(typeof banner.enabled).toBe("boolean");
      expect(typeof banner.text).toBe("string");
    });
  });
});

describe("Chat Support", () => {
  describe("chat.send", () => {
    it("allows public users to send chat messages", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const response = await caller.chat.send({
        message: "What courses do you offer?",
      });

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(typeof response.message).toBe("string");
      expect(response.message.length).toBeGreaterThan(0);
    });

    it("maintains conversation history", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const response = await caller.chat.send({
        message: "Tell me about beginner courses",
        history: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi! How can I help you?" },
        ],
      });

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
    }, 10000); // 10 second timeout for LLM call
  });
});
