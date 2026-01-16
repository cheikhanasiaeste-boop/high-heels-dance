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

describe("Booking System", () => {
  describe("bookings.availableSlots", () => {
    it("returns available slots for public access", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const slots = await caller.bookings.availableSlots();

      expect(Array.isArray(slots)).toBe(true);
      // All returned slots should not be booked
      slots.forEach(slot => {
        expect(slot.isBooked).toBe(false);
      });
    });
  });

  describe("bookings.create", () => {
    it("allows authenticated users to book available slots", async () => {
      const user = createTestUser();
      const ctx = createMockContext(user);
      const caller = appRouter.createCaller(ctx);

      // Create an available slot as admin
      const adminCtx = createMockContext(createAdminUser());
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
      });

      // Book the slot
      const booking = await caller.bookings.create({
        slotId: slot.id,
        notes: "Looking forward to the session!",
      });

      expect(booking).toBeDefined();
      expect(booking.userId).toBe(user.id);
      expect(booking.slotId).toBe(slot.id);
      expect(booking.status).toBe("confirmed");
      expect(booking.zoomLink).toBeDefined();
      expect(booking.notes).toBe("Looking forward to the session!");
    });

    it("prevents booking already booked slots", async () => {
      const user1 = createTestUser({ id: 3, openId: "user1" });
      const user2 = createTestUser({ id: 4, openId: "user2" });
      
      const ctx1 = createMockContext(user1);
      const caller1 = appRouter.createCaller(ctx1);
      
      const ctx2 = createMockContext(user2);
      const caller2 = appRouter.createCaller(ctx2);

      // Create an available slot
      const adminCtx = createMockContext(createAdminUser());
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);
      tomorrow.setHours(10, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(11, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
      });

      // First user books the slot
      await caller1.bookings.create({ slotId: slot.id });

      // Second user tries to book the same slot
      await expect(
        caller2.bookings.create({ slotId: slot.id })
      ).rejects.toThrow("already booked");
    });
  });

  describe("bookings.myBookings", () => {
    it("returns user's bookings", async () => {
      const user = createTestUser({ id: 5, openId: "user-bookings" });
      const ctx = createMockContext(user);
      const caller = appRouter.createCaller(ctx);

      // Create and book a slot
      const adminCtx = createMockContext(createAdminUser());
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 3);
      tomorrow.setHours(16, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(17, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
      });

      await caller.bookings.create({ slotId: slot.id });

      // Get user's bookings
      const bookings = await caller.bookings.myBookings();

      expect(Array.isArray(bookings)).toBe(true);
      expect(bookings.length).toBeGreaterThan(0);
      expect(bookings[0]?.userId).toBe(user.id);
    });
  });

  describe("bookings.cancel", () => {
    it("allows users to cancel their own bookings", async () => {
      const user = createTestUser({ id: 6, openId: "user-cancel" });
      const ctx = createMockContext(user);
      const caller = appRouter.createCaller(ctx);

      // Create and book a slot
      const adminCtx = createMockContext(createAdminUser());
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 4);
      tomorrow.setHours(9, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(10, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
      });

      const booking = await caller.bookings.create({ slotId: slot.id });

      // Cancel the booking
      const result = await caller.bookings.cancel({ id: booking.id });

      expect(result.success).toBe(true);

      // Verify booking is cancelled
      const cancelledBooking = await db.getBookingById(booking.id);
      expect(cancelledBooking?.status).toBe("cancelled");

      // Verify slot is available again
      const freedSlot = await db.getAvailabilitySlotById(slot.id);
      expect(freedSlot?.isBooked).toBe(false);
    });

    it("prevents users from cancelling others' bookings", async () => {
      const user1 = createTestUser({ id: 7, openId: "user-owner" });
      const user2 = createTestUser({ id: 8, openId: "user-other" });
      
      const ctx1 = createMockContext(user1);
      const caller1 = appRouter.createCaller(ctx1);
      
      const ctx2 = createMockContext(user2);
      const caller2 = appRouter.createCaller(ctx2);

      // User1 creates a booking
      const adminCtx = createMockContext(createAdminUser());
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 5);
      tomorrow.setHours(13, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(14, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
      });

      const booking = await caller1.bookings.create({ slotId: slot.id });

      // User2 tries to cancel user1's booking
      await expect(
        caller2.bookings.cancel({ id: booking.id })
      ).rejects.toThrow("Not your booking");
    });
  });
});

describe("Admin Availability Management", () => {
  describe("admin.availability.create", () => {
    it("allows admin to create availability slots", async () => {
      const admin = createAdminUser();
      const ctx = createMockContext(admin);
      const caller = appRouter.createCaller(ctx);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 6);
      tomorrow.setHours(15, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(16, 0, 0, 0);

      const slot = await caller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
      });

      expect(slot).toBeDefined();
      expect(slot.isBooked).toBe(false);
      expect(new Date(slot.startTime).getTime()).toBe(tomorrow.getTime());
    });

    it("denies non-admin users from creating slots", async () => {
      const user = createTestUser();
      const ctx = createMockContext(user);
      const caller = appRouter.createCaller(ctx);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 7);

      await expect(
        caller.admin.availability.create({
          startTime: tomorrow.toISOString(),
          endTime: new Date(tomorrow.getTime() + 3600000).toISOString(),
        })
      ).rejects.toThrow("Admin access required");
    });
  });

  describe("admin.availability.delete", () => {
    it("allows admin to delete unbooked slots", async () => {
      const admin = createAdminUser();
      const ctx = createMockContext(admin);
      const caller = appRouter.createCaller(ctx);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 8);
      tomorrow.setHours(11, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(12, 0, 0, 0);

      const slot = await caller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
      });

      const result = await caller.admin.availability.delete({ id: slot.id });

      expect(result.success).toBe(true);

      const deletedSlot = await db.getAvailabilitySlotById(slot.id);
      expect(deletedSlot).toBeUndefined();
    });
  });
});
