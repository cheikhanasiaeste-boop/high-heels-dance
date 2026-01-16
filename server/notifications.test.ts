import { describe, it, expect } from 'vitest';
import { adminNotifications } from './events';

describe('Admin Notifications', () => {
  it('should emit booking notification', () => {
    return new Promise<void>((resolve) => {
      const booking = {
        id: 1,
        userId: 1,
        slotId: 1,
        sessionType: 'One-on-One Dance Session',
        status: 'confirmed',
      };

      adminNotifications.once('notification', (notification) => {
        expect(notification.type).toBe('booking');
        expect(notification.title).toBe('New Booking');
        expect(notification.message).toContain('One-on-One Dance Session');
        expect(notification.data).toEqual(booking);
        resolve();
      });

      adminNotifications.emitBooking(booking);
    });
  });

  it('should emit registration notification', () => {
    return new Promise<void>((resolve) => {
      const user = {
        id: 2,
        name: 'Test User',
        email: 'test@example.com',
        openId: 'test123',
        role: 'user' as const,
      };

      adminNotifications.once('notification', (notification) => {
        expect(notification.type).toBe('registration');
        expect(notification.title).toBe('New User Registration');
        expect(notification.message).toContain('Test User');
        expect(notification.data).toEqual(user);
        resolve();
      });

      adminNotifications.emitRegistration(user);
    });
  });

  it('should emit purchase notification', () => {
    return new Promise<void>((resolve) => {
      const purchase = {
        id: 1,
        userId: 1,
        courseId: 1,
        amount: '99.99',
      };

      adminNotifications.once('notification', (notification) => {
        expect(notification.type).toBe('purchase');
        expect(notification.title).toBe('New Course Purchase');
        expect(notification.message).toContain('Advanced Techniques');
        resolve();
      });

      adminNotifications.emitPurchase(purchase, 'Advanced Techniques');
    });
  });
});
