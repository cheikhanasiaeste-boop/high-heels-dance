import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

describe("Availability Bulk Operations and Search", () => {
  let adminContext: any;
  let testSlotIds: number[] = [];

  beforeAll(async () => {
    // Create admin context for testing
    const adminUser = {
      id: 1,
      supabaseId: "00000000-0000-0000-0000-000000000001",
      name: "Test Admin",
      email: "admin@test.com",
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

    adminContext = {
      user: adminUser,
      req: {} as any,
      res: {} as any,
    };

    // Create test availability slots with different dates
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const slot1 = await db.createAvailabilitySlot({
      startTime: new Date(today.setHours(10, 0, 0, 0)),
      endTime: new Date(today.setHours(11, 0, 0, 0)),
      eventType: "online",
      isFree: true,
      title: "Test Slot 1",
      sessionType: "private",
      capacity: 1,
      currentBookings: 0,
      isBooked: false,
    });

    const slot2 = await db.createAvailabilitySlot({
      startTime: new Date(tomorrow.setHours(14, 0, 0, 0)),
      endTime: new Date(tomorrow.setHours(15, 0, 0, 0)),
      eventType: "in-person",
      location: "Studio A",
      isFree: false,
      price: "50.00",
      title: "Test Slot 2",
      sessionType: "group",
      capacity: 5,
      currentBookings: 0,
      isBooked: false,
    });

    const slot3 = await db.createAvailabilitySlot({
      startTime: new Date(nextWeek.setHours(16, 0, 0, 0)),
      endTime: new Date(nextWeek.setHours(17, 0, 0, 0)),
      eventType: "online",
      isFree: true,
      title: "Test Slot 3",
      sessionType: "private",
      capacity: 1,
      currentBookings: 0,
      isBooked: false,
    });

    testSlotIds = [slot1.id, slot2.id, slot3.id];
  });

  it("should search all slots without date filter", async () => {
    const caller = appRouter.createCaller(adminContext);
    const result = await caller.admin.availability.search({});
    
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.some(slot => testSlotIds.includes(slot.id))).toBe(true);
  });

  it("should filter slots by start date", async () => {
    const caller = appRouter.createCaller(adminContext);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const result = await caller.admin.availability.search({
      startDate: tomorrow.toISOString().split('T')[0],
    });
    
    // Should not include today's slot
    expect(result.some(slot => slot.title === "Test Slot 1")).toBe(false);
    // Should include tomorrow's and next week's slots
    expect(result.some(slot => slot.title === "Test Slot 2" || slot.title === "Test Slot 3")).toBe(true);
  });

  it("should filter slots by date range", async () => {
    const caller = appRouter.createCaller(adminContext);
    const today = new Date();
    const twoDaysLater = new Date(today);
    twoDaysLater.setDate(twoDaysLater.getDate() + 2);
    
    const result = await caller.admin.availability.search({
      startDate: today.toISOString().split('T')[0],
      endDate: twoDaysLater.toISOString().split('T')[0],
    });
    
    // Should include today's and tomorrow's slots
    expect(result.some(slot => slot.title === "Test Slot 1")).toBe(true);
    expect(result.some(slot => slot.title === "Test Slot 2")).toBe(true);
    // Should not include next week's slot
    expect(result.some(slot => slot.title === "Test Slot 3")).toBe(false);
  });

  it("should bulk delete multiple slots", async () => {
    const caller = appRouter.createCaller(adminContext);
    
    // Delete first two test slots
    const deleteIds = testSlotIds.slice(0, 2);
    const result = await caller.admin.availability.bulkDelete({ ids: deleteIds });
    
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    
    // Verify slots are deleted
    const remainingSlots = await caller.admin.availability.search({});
    expect(remainingSlots.some(slot => slot.id === deleteIds[0])).toBe(false);
    expect(remainingSlots.some(slot => slot.id === deleteIds[1])).toBe(false);
  });

  it("should handle empty bulk delete gracefully", async () => {
    const caller = appRouter.createCaller(adminContext);
    
    const result = await caller.admin.availability.bulkDelete({ ids: [] });
    
    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
  });
});
