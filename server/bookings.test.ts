import { describe, expect, it } from "vitest";
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
    id: Math.floor(Math.random() * 1000000) + 1000,
    openId: `test-user-${Date.now()}-${Math.random()}`,
    email: `test-${Date.now()}@example.com`,
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
    openId: `admin-user-${Date.now()}-${Math.random()}`,
    email: `admin-${Date.now()}@example.com`,
    name: "Admin User",
    role: "admin",
  });
}

describe("Enhanced Booking System with Group Sessions", () => {
  describe("Group session capacity management", () => {
    it("allows multiple users to book the same group session", async () => {
      const admin = createAdminUser();
      const adminCtx = createMockContext(admin);
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 20);
      tomorrow.setHours(14, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);
      
      // Create group session with capacity 3
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'online',
        isFree: true,
        title: 'Group Dance Class',
        sessionType: 'group',
        capacity: 3,
      });

      // First user books
      const user1 = createTestUser();
      const ctx1 = createMockContext(user1);
      const caller1 = appRouter.createCaller(ctx1);
      const booking1 = await caller1.bookings.create({ slotId: slot.id });
      expect(booking1).toBeDefined();

      // Second user books
      const user2 = createTestUser();
      const ctx2 = createMockContext(user2);
      const caller2 = appRouter.createCaller(ctx2);
      const booking2 = await caller2.bookings.create({ slotId: slot.id });
      expect(booking2).toBeDefined();

      // Check currentBookings
      const updatedSlot = await db.getAvailabilitySlotById(slot.id);
      expect(updatedSlot?.currentBookings).toBe(2);

      // Third user books (should fill capacity)
      const user3 = createTestUser();
      const ctx3 = createMockContext(user3);
      const caller3 = appRouter.createCaller(ctx3);
      const booking3 = await caller3.bookings.create({ slotId: slot.id });
      expect(booking3).toBeDefined();

      const fullSlot = await db.getAvailabilitySlotById(slot.id);
      expect(fullSlot?.currentBookings).toBe(3);

      // Fourth user should fail (capacity reached)
      const user4 = createTestUser();
      const ctx4 = createMockContext(user4);
      const caller4 = appRouter.createCaller(ctx4);
      await expect(caller4.bookings.create({ slotId: slot.id })).rejects.toThrow("fully booked");
    });

    it("prevents double booking for private sessions", async () => {
      const admin = createAdminUser();
      const adminCtx = createMockContext(admin);
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 21);
      tomorrow.setHours(10, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(11, 0, 0, 0);
      
      // Create private session
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'online',
        isFree: true,
        title: 'Private Session',
        sessionType: 'private',
        capacity: 1,
      });

      // First user books
      const user1 = createTestUser();
      const ctx1 = createMockContext(user1);
      const caller1 = appRouter.createCaller(ctx1);
      await caller1.bookings.create({ slotId: slot.id });

      // Second user should fail
      const user2 = createTestUser();
      const ctx2 = createMockContext(user2);
      const caller2 = appRouter.createCaller(ctx2);
      await expect(caller2.bookings.create({ slotId: slot.id })).rejects.toThrow("already booked");
    });

    it("decrements currentBookings when group session booking is cancelled", async () => {
      const admin = createAdminUser();
      const adminCtx = createMockContext(admin);
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 22);
      tomorrow.setHours(16, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(17, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'online',
        isFree: true,
        title: 'Group Session Cancel Test',
        sessionType: 'group',
        capacity: 5,
      });

      // Two users book
      const user1 = createTestUser();
      const ctx1 = createMockContext(user1);
      const caller1 = appRouter.createCaller(ctx1);
      const booking1 = await caller1.bookings.create({ slotId: slot.id });

      const user2 = createTestUser();
      const ctx2 = createMockContext(user2);
      const caller2 = appRouter.createCaller(ctx2);
      await caller2.bookings.create({ slotId: slot.id });

      // Check currentBookings is 2
      let updatedSlot = await db.getAvailabilitySlotById(slot.id);
      expect(updatedSlot?.currentBookings).toBe(2);

      // First user cancels
      await caller1.bookings.cancel({ id: booking1.id });

      // Check currentBookings is decremented to 1
      updatedSlot = await db.getAvailabilitySlotById(slot.id);
      expect(updatedSlot?.currentBookings).toBe(1);
    });
  });

  describe("Session type filtering", () => {
    it("filters by session type", async () => {
      const admin = createAdminUser();
      const adminCtx = createMockContext(admin);
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 23);
      
      // Create private session
      const privateTime = new Date(tomorrow);
      privateTime.setHours(10, 0, 0, 0);
      const privateEnd = new Date(privateTime);
      privateEnd.setHours(11, 0, 0, 0);
      
      await adminCaller.admin.availability.create({
        startTime: privateTime.toISOString(),
        endTime: privateEnd.toISOString(),
        eventType: 'online',
        isFree: true,
        title: 'Private Filter Test',
        sessionType: 'private',
        capacity: 1,
      });

      // Create group session
      const groupTime = new Date(tomorrow);
      groupTime.setHours(14, 0, 0, 0);
      const groupEnd = new Date(groupTime);
      groupEnd.setHours(15, 0, 0, 0);
      
      await adminCaller.admin.availability.create({
        startTime: groupTime.toISOString(),
        endTime: groupEnd.toISOString(),
        eventType: 'online',
        isFree: true,
        title: 'Group Filter Test',
        sessionType: 'group',
        capacity: 5,
      });

      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      // Test private filter
      const privateSlots = await caller.bookings.availableSlots({ sessionType: 'private' });
      expect(privateSlots.every((s: any) => s.sessionType === 'private')).toBe(true);

      // Test group filter
      const groupSlots = await caller.bookings.availableSlots({ sessionType: 'group' });
      expect(groupSlots.every((s: any) => s.sessionType === 'group')).toBe(true);
    });
  });
});

describe("Enhanced Booking System", () => {
  describe("bookings.availableSlots", () => {
    it("returns available slots for public access", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const slots = await caller.bookings.availableSlots();

      expect(Array.isArray(slots)).toBe(true);
      slots.forEach(slot => {
        expect(slot.isBooked).toBe(false);
      });
    });

    it("filters slots by event type", async () => {
      const adminCtx = createMockContext(createAdminUser());
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 10);
      tomorrow.setHours(14, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);
      
      // Create online slot
      await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'online',
        isFree: true,
        title: 'Online Filter Test',
      });
      
      // Create in-person slot
      const tomorrow2 = new Date(tomorrow);
      tomorrow2.setHours(16, 0, 0, 0);
      const endTime2 = new Date(tomorrow2);
      endTime2.setHours(17, 0, 0, 0);
      
      await adminCaller.admin.availability.create({
        startTime: tomorrow2.toISOString(),
        endTime: endTime2.toISOString(),
        eventType: 'in-person',
        location: 'Studio A',
        isFree: true,
        title: 'In-Person Filter Test',
      });

      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      // Test online filter
      const onlineSlots = await caller.bookings.availableSlots({ eventType: 'online' });
      expect(onlineSlots.every((s: any) => s.eventType === 'online')).toBe(true);
      
      // Test in-person filter
      const inPersonSlots = await caller.bookings.availableSlots({ eventType: 'in-person' });
      expect(inPersonSlots.every((s: any) => s.eventType === 'in-person')).toBe(true);
    });
  });

  describe("bookings.create (free sessions)", () => {
    it("allows authenticated users to book free sessions", async () => {
      const user = createTestUser();
      const ctx = createMockContext(user);
      const caller = appRouter.createCaller(ctx);

      const adminCtx = createMockContext(createAdminUser());
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 11);
      tomorrow.setHours(14, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'online',
        isFree: true,
        title: 'Free Booking Test',
      });

      const booking = await caller.bookings.create({
        slotId: slot.id,
        notes: "Looking forward to the session!",
      });

      expect(booking).toBeDefined();
      expect(booking.userId).toBe(user.id);
      expect(booking.slotId).toBe(slot.id);
      expect(booking.status).toBe("confirmed");
      expect(booking.paymentRequired).toBe(false);
      expect(booking.paymentStatus).toBe("not_required");
      expect(booking.zoomLink).toBeDefined();
    });

    it("prevents free booking flow for paid sessions", async () => {
      const user = createTestUser();
      const ctx = createMockContext(user);
      const caller = appRouter.createCaller(ctx);

      const adminCtx = createMockContext(createAdminUser());
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 12);
      tomorrow.setHours(14, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'online',
        isFree: false,
        price: '50.00',
        title: 'Paid Session Test',
      });

      await expect(
        caller.bookings.create({ slotId: slot.id })
      ).rejects.toThrow("requires payment");
    });

    it("prevents booking already booked slots", async () => {
      const user1 = createTestUser();
      const user2 = createTestUser();
      
      const ctx1 = createMockContext(user1);
      const caller1 = appRouter.createCaller(ctx1);
      
      const ctx2 = createMockContext(user2);
      const caller2 = appRouter.createCaller(ctx2);

      const adminCtx = createMockContext(createAdminUser());
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 13);
      tomorrow.setHours(10, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(11, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'online',
        isFree: true,
        title: 'Double Booking Test',
      });

      await caller1.bookings.create({ slotId: slot.id });

      await expect(
        caller2.bookings.create({ slotId: slot.id })
      ).rejects.toThrow("already booked");
    });
  });

  describe("bookings.createCheckout (paid sessions)", () => {
    it("creates checkout session for paid bookings", { timeout: 10000 }, async () => {
      const user = createTestUser();
      const ctx = createMockContext(user);
      const caller = appRouter.createCaller(ctx);

      const adminCtx = createMockContext(createAdminUser());
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 14);
      tomorrow.setHours(14, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'in-person',
        location: 'Dance Studio',
        isFree: false,
        price: '75.00',
        title: 'Paid Checkout Test',
      });

      const result = await caller.bookings.createCheckout({
        slotId: slot.id,
        notes: "Excited for this session!",
      });

      expect(result.checkoutUrl).toBeDefined();
      expect(typeof result.checkoutUrl).toBe('string');
      expect(result.checkoutUrl).toContain('checkout.stripe.com');
    });

    it("prevents checkout for free sessions", async () => {
      const user = createTestUser();
      const ctx = createMockContext(user);
      const caller = appRouter.createCaller(ctx);

      const adminCtx = createMockContext(createAdminUser());
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 15);
      tomorrow.setHours(14, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'online',
        isFree: true,
        title: 'Free Session Checkout Test',
      });

      await expect(
        caller.bookings.createCheckout({ slotId: slot.id })
      ).rejects.toThrow("free");
    });
  });

  describe("bookings.cancel", () => {
    it("allows users to cancel their own bookings", async () => {
      const user = createTestUser();
      const ctx = createMockContext(user);
      const caller = appRouter.createCaller(ctx);

      const adminCtx = createMockContext(createAdminUser());
      const adminCaller = appRouter.createCaller(adminCtx);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 16);
      tomorrow.setHours(9, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(10, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'online',
        isFree: true,
        title: 'Cancel Test Session',
      });

      const booking = await caller.bookings.create({ slotId: slot.id });

      const result = await caller.bookings.cancel({ id: booking.id });

      expect(result.success).toBe(true);

      const cancelledBooking = await db.getBookingById(booking.id);
      expect(cancelledBooking?.status).toBe("cancelled");

      const freedSlot = await db.getAvailabilitySlotById(slot.id);
      expect(freedSlot?.isBooked).toBe(false);
    });
  });
});

describe("Admin Availability Management (Enhanced)", () => {
  describe("admin.availability.create", () => {
    it("allows admin to create free online slots", async () => {
      const admin = createAdminUser();
      const ctx = createMockContext(admin);
      const caller = appRouter.createCaller(ctx);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 17);
      tomorrow.setHours(15, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(16, 0, 0, 0);

      const slot = await caller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'online',
        isFree: true,
        title: 'Admin Free Online Test',
      });

      expect(slot).toBeDefined();
      expect(slot.isBooked).toBe(false);
      expect(slot.eventType).toBe('online');
      expect(slot.isFree).toBe(true);
    });

    it("allows admin to create paid in-person slots with location", async () => {
      const admin = createAdminUser();
      const ctx = createMockContext(admin);
      const caller = appRouter.createCaller(ctx);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 18);
      tomorrow.setHours(15, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(16, 0, 0, 0);

      const slot = await caller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'in-person',
        location: 'Dance Studio, 123 Main St',
        isFree: false,
        price: '75.00',
        title: 'Private In-Person Session',
        description: 'Advanced choreography',
      });

      expect(slot).toBeDefined();
      expect(slot.eventType).toBe('in-person');
      expect(slot.location).toBe('Dance Studio, 123 Main St');
      expect(slot.isFree).toBe(false);
      expect(slot.price).toBe('75.00');
    });
  });

  describe("admin.availability.delete", () => {
    it("allows admin to delete unbooked slots", async () => {
      const admin = createAdminUser();
      const ctx = createMockContext(admin);
      const caller = appRouter.createCaller(ctx);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 19);
      tomorrow.setHours(11, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(12, 0, 0, 0);

      const slot = await caller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'online',
        isFree: true,
        title: 'Delete Test Session',
      });

      const result = await caller.admin.availability.delete({ id: slot.id });

      expect(result.success).toBe(true);

      const deletedSlot = await db.getAvailabilitySlotById(slot.id);
      expect(deletedSlot).toBeUndefined();
    });
  });
});
