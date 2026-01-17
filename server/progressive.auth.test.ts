import { describe, it, expect, beforeEach } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';
import { createCourse } from './db';

type AuthenticatedUser = NonNullable<TrpcContext['user']>;

function createTestContext(options: { role: 'admin' | 'user' | null }): TrpcContext {
  if (options.role === null) {
    // Guest context
    return {
      req: {
        protocol: 'https',
        headers: { origin: 'https://test.example.com' },
        get: (name: string) => (name === 'host' ? 'test.example.com' : undefined),
      } as any,
      res: {
        clearCookie: () => {},
      } as any,
      user: null,
    };
  }

  const user: AuthenticatedUser = {
    id: options.role === 'admin' ? 1 : 2,
    openId: `test-${options.role}-${Date.now()}`,
    email: `${options.role}@test.com`,
    name: `Test ${options.role}`,
    loginMethod: 'manus',
    role: options.role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    req: {
      protocol: 'https',
      headers: { origin: 'https://test.example.com' },
      get: (name: string) => (name === 'host' ? 'test.example.com' : undefined),
    } as any,
    res: {
      clearCookie: () => {},
    } as any,
    user,
  };
}

function createCaller(ctx: TrpcContext) {
  return appRouter.createCaller(ctx);
}

describe('Progressive Authentication Flow', () => {
  let adminCtx: TrpcContext;
  let guestCtx: TrpcContext;
  let userCtx: TrpcContext;
  let adminCaller: any;
  let guestCaller: any;
  let userCaller: any;

  beforeEach(() => {
    // Create admin context
    adminCtx = createTestContext({ role: 'admin' });
    adminCaller = createCaller(adminCtx);

    // Create guest context (no user)
    guestCtx = createTestContext({ role: null });
    guestCaller = createCaller(guestCtx);

    // Create regular user context
    userCtx = createTestContext({ role: 'user' });
    userCaller = createCaller(userCtx);
  });

  describe('Course Purchase Flow - Guest Access', () => {
    it('should allow guests to view course details without authentication', async () => {
      // Admin creates a course
      const course = await createCourse({
        title: 'Test Course',
        description: 'Test Description',
        price: '49.99',
        isFree: false,
      });

      // Guest can view course details (no auth required)
      const result = await guestCaller.courses.getById({ id: course.id });
      
      expect(result).toBeDefined();
      expect(result.title).toBe('Test Course');
      expect(result.price).toBe('49.99');
      expect(result.description).toBe('Test Description');
    });

    it('should allow guests to view course pricing information', async () => {
      const course = await createCourse({
        title: 'Premium Course',
        description: 'Premium Description',
        price: '99.99',
        originalPrice: '149.99',
        isFree: false,
      });

      // Guest can see pricing (no auth required)
      const result = await guestCaller.courses.getById({ id: course.id });
      
      expect(result.price).toBe('99.99');
      expect(result.originalPrice).toBe('149.99');
    });

    it('should allow guests to view free courses', async () => {
      const course = await createCourse({
        title: 'Free Course',
        description: 'Free Description',
        price: '0.00',
        isFree: true,
      });

      // Guest can view free course details
      const result = await guestCaller.courses.getById({ id: course.id });
      
      expect(result.isFree).toBe(true);
      expect(result.price).toBe('0.00');
    });

    it('should allow guests to browse all courses', async () => {
      // Create multiple courses
      await createCourse({
        title: 'Course 1',
        description: 'Description 1',
        price: '49.99',
        isFree: false,
      });
      
      await createCourse({
        title: 'Course 2',
        description: 'Description 2',
        price: '0.00',
        isFree: true,
      });

      // Guest can browse courses (no auth required)
      const result = await guestCaller.courses.list();
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Course Purchase Flow - Auth Required at Final Step', () => {
    it('should require authentication when creating checkout session', async () => {
      const course = await createCourse({
        title: 'Paid Course',
        description: 'Paid Description',
        price: '49.99',
        isFree: false,
      });

      // Guest CANNOT create checkout session (auth required at final step)
      await expect(
        guestCaller.purchases.createCheckoutSession({ courseId: course.id })
      ).rejects.toThrow();
    });

    it('should allow authenticated users to create checkout session', async () => {
      const course = await createCourse({
        title: 'Paid Course',
        description: 'Paid Description',
        price: '49.99',
        isFree: false,
      });

      // Authenticated user CAN create checkout session
      const result = await userCaller.purchases.createCheckoutSession({ courseId: course.id });
      
      expect(result).toBeDefined();
      expect(result.url).toBeDefined();
      expect(result.url).toContain('checkout.stripe.com');
    });
  });

  describe('Session Booking Flow - Guest Access', () => {
    it('should allow guests to view available slots without authentication', async () => {
      // Create a slot
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);
      
      await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'online',
        sessionType: 'private',
        isFree: false,
        title: 'Test Session',
        price: '50.00',
      });

      // Guest can view available slots (no auth required)
      const result = await guestCaller.bookings.availableSlots({
        eventType: 'all',
        sessionType: 'all',
      });
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should allow guests to view slot details and pricing', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(16, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(17, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'in-person',
        sessionType: 'group',
        isFree: false,
        title: 'Premium Session',
        description: 'Premium Description',
        price: '75.00',
        location: 'Studio A',
        capacity: 10,
      });

      // Guest can view slot details (no auth required)
      const result = await guestCaller.bookings.availableSlots({
        eventType: 'all',
        sessionType: 'all',
      });
      
      const foundSlot = result.find((s: any) => s.id === slot.id);
      expect(foundSlot).toBeDefined();
      expect(foundSlot.title).toBe('Premium Session');
      expect(foundSlot.price).toBe('75.00');
      expect(foundSlot.location).toBe('Studio A');
    });
  });

  describe('Session Booking Flow - Auth Required at Final Step', () => {
    it('should require authentication when creating booking', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'online',
        sessionType: 'private',
        isFree: false,
        title: 'Test Session',
        price: '50.00',
      });

      // Guest CANNOT create booking (auth required at final step)
      await expect(
        guestCaller.bookings.create({
          slotId: slot.id,
          notes: 'Test booking',
        })
      ).rejects.toThrow();
    });

    it('should allow authenticated users to book free sessions', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'online',
        sessionType: 'group',
        isFree: true,
        title: 'Free Session',
        capacity: 10,
      });

      // Authenticated user CAN create booking for free session
      const result = await userCaller.bookings.create({
        slotId: slot.id,
        notes: 'Looking forward to it!',
      });
      
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.userId).toBe(userCtx.user?.id);
    });

    it('should require authentication when creating checkout for paid sessions', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'in-person',
        sessionType: 'private',
        isFree: false,
        title: 'Paid Session',
        price: '100.00',
      });

      // Guest CANNOT create checkout (auth required at final step)
      await expect(
        guestCaller.bookings.createCheckout({
          slotId: slot.id,
          notes: 'Test booking',
        })
      ).rejects.toThrow();
    });

    it('should allow authenticated users to create checkout for paid sessions', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'in-person',
        sessionType: 'private',
        isFree: false,
        title: 'Paid Session',
        price: '100.00',
      });

      // Authenticated user CAN create checkout
      const result = await userCaller.bookings.createCheckout({
        slotId: slot.id,
        notes: 'Test booking',
      });
      
      expect(result).toBeDefined();
      expect(result.checkoutUrl).toBeDefined();
      expect(result.checkoutUrl).toContain('checkout.stripe.com');
    });
  });

  describe('Guest Flow Continuity', () => {
    it('should preserve course selection data across contexts', async () => {
      const course = await createCourse({
        title: 'Selected Course',
        description: 'Selected Description',
        price: '49.99',
        isFree: false,
      });

      // Guest views course
      const guestView = await guestCaller.courses.getById({ id: course.id });
      expect(guestView.id).toBe(course.id);
      expect(guestView.title).toBe('Selected Course');

      // After auth, user can access the same course with same data
      const userView = await userCaller.courses.getById({ id: course.id });
      expect(userView.id).toBe(course.id);
      expect(userView.title).toBe(guestView.title);
      expect(userView.price).toBe(guestView.price);
    });

    it('should preserve slot selection data across contexts', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);
      
      const slot = await adminCaller.admin.availability.create({
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        eventType: 'online',
        sessionType: 'private',
        isFree: false,
        title: 'Selected Session',
        price: '50.00',
      });

      // Guest views slots
      const guestSlots = await guestCaller.bookings.availableSlots({
        eventType: 'all',
        sessionType: 'all',
      });
      const guestSlot = guestSlots.find((s: any) => s.id === slot.id);
      expect(guestSlot).toBeDefined();
      expect(guestSlot.title).toBe('Selected Session');

      // After auth, user can see the same slot with same data
      const userSlots = await userCaller.bookings.availableSlots({
        eventType: 'all',
        sessionType: 'all',
      });
      const userSlot = userSlots.find((s: any) => s.id === slot.id);
      expect(userSlot).toBeDefined();
      expect(userSlot.id).toBe(guestSlot.id);
      expect(userSlot.title).toBe(guestSlot.title);
      expect(userSlot.price).toBe(guestSlot.price);
    });
  });
});
