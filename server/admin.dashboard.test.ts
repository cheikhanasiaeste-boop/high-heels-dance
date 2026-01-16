import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

describe("Admin Dashboard Analytics", () => {
  let adminContext: any;
  let userContext: any;

  beforeAll(async () => {
    // Mock admin user context
    adminContext = {
      user: {
        id: 1,
        openId: "admin-test",
        name: "Admin User",
        email: "admin@test.com",
        role: "admin",
      },
      req: {} as any,
      res: {} as any,
    };

    // Mock regular user context
    userContext = {
      user: {
        id: 2,
        openId: "user-test",
        name: "Regular User",
        email: "user@test.com",
        role: "user",
      },
      req: {} as any,
      res: {} as any,
    };
  });

  describe("Dashboard Stats", () => {
    it("should return dashboard statistics for admin", async () => {
      const caller = appRouter.createCaller(adminContext);
      const stats = await caller.admin.dashboard.stats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty("totalUsers");
      expect(stats).toHaveProperty("totalCourses");
      expect(stats).toHaveProperty("totalRevenue");
      expect(stats).toHaveProperty("courseRevenue");
      expect(stats).toHaveProperty("sessionRevenue");
      expect(stats).toHaveProperty("coursePurchases");
      expect(stats).toHaveProperty("totalBookings");
      expect(stats).toHaveProperty("confirmedBookings");
      expect(stats).toHaveProperty("popularCourses");

      expect(typeof stats.totalUsers).toBe("number");
      expect(typeof stats.totalCourses).toBe("number");
      expect(typeof stats.totalRevenue).toBe("number");
      expect(Array.isArray(stats.popularCourses)).toBe(true);
    });

    it("should throw FORBIDDEN error for non-admin users", async () => {
      const caller = appRouter.createCaller(userContext);
      
      await expect(caller.admin.dashboard.stats()).rejects.toThrow("Admin access required");
    });

    it("should calculate revenue correctly", async () => {
      const caller = appRouter.createCaller(adminContext);
      const stats = await caller.admin.dashboard.stats();

      // Total revenue should equal course revenue + session revenue
      expect(stats.totalRevenue).toBe(stats.courseRevenue + stats.sessionRevenue);
    });

    it("should return popular courses sorted by purchase count", async () => {
      const caller = appRouter.createCaller(adminContext);
      const stats = await caller.admin.dashboard.stats();

      if (stats.popularCourses.length > 1) {
        // Verify courses are sorted by purchase count (descending)
        for (let i = 0; i < stats.popularCourses.length - 1; i++) {
          expect(stats.popularCourses[i].purchaseCount).toBeGreaterThanOrEqual(
            stats.popularCourses[i + 1].purchaseCount
          );
        }
      }

      // Should return at most 5 courses
      expect(stats.popularCourses.length).toBeLessThanOrEqual(5);
    });
  });

  describe("Revenue by Period", () => {
    it("should return revenue breakdown by time periods", async () => {
      const caller = appRouter.createCaller(adminContext);
      const revenue = await caller.admin.dashboard.revenue();

      expect(revenue).toBeDefined();
      expect(revenue).toHaveProperty("today");
      expect(revenue).toHaveProperty("yesterday");
      expect(revenue).toHaveProperty("week");
      expect(revenue).toHaveProperty("lastWeek");
      expect(revenue).toHaveProperty("month");
      expect(revenue).toHaveProperty("lastMonth");

      expect(typeof revenue.today).toBe("number");
      expect(typeof revenue.yesterday).toBe("number");
      expect(typeof revenue.week).toBe("number");
      expect(typeof revenue.lastWeek).toBe("number");
      expect(typeof revenue.month).toBe("number");
      expect(typeof revenue.lastMonth).toBe("number");
    });

    it("should throw FORBIDDEN error for non-admin users", async () => {
      const caller = appRouter.createCaller(userContext);
      
      await expect(caller.admin.dashboard.revenue()).rejects.toThrow("Admin access required");
    });

    it("should return non-negative revenue values", async () => {
      const caller = appRouter.createCaller(adminContext);
      const revenue = await caller.admin.dashboard.revenue();

      expect(revenue.today).toBeGreaterThanOrEqual(0);
      expect(revenue.yesterday).toBeGreaterThanOrEqual(0);
      expect(revenue.week).toBeGreaterThanOrEqual(0);
      expect(revenue.lastWeek).toBeGreaterThanOrEqual(0);
      expect(revenue.month).toBeGreaterThanOrEqual(0);
      expect(revenue.lastMonth).toBeGreaterThanOrEqual(0);
    });

    it("should have week revenue >= today revenue", async () => {
      const caller = appRouter.createCaller(adminContext);
      const revenue = await caller.admin.dashboard.revenue();

      // Week includes today, so week revenue should be >= today revenue
      expect(revenue.week).toBeGreaterThanOrEqual(revenue.today);
    });

    it("should have month revenue >= week revenue", async () => {
      const caller = appRouter.createCaller(adminContext);
      const revenue = await caller.admin.dashboard.revenue();

      // Month includes week, so month revenue should be >= week revenue
      expect(revenue.month).toBeGreaterThanOrEqual(revenue.week);
    });
  });

  describe("Dashboard Integration", () => {
    it("should handle empty database gracefully", async () => {
      const caller = appRouter.createCaller(adminContext);
      
      // Even with no data, should return valid structure with zeros
      const stats = await caller.admin.dashboard.stats();
      const revenue = await caller.admin.dashboard.revenue();

      expect(stats).toBeDefined();
      expect(revenue).toBeDefined();
      expect(typeof stats.totalUsers).toBe("number");
      expect(typeof revenue.today).toBe("number");
    });
  });
});
