import { describe, it, expect, beforeAll } from 'vitest';
import * as discountUtils from './discount-utils';
import { DiscountCode } from '../drizzle/schema';

describe('Discount Utils', () => {
  describe('validateDiscountCode', () => {
    it('should reject null discount code', () => {
      const result = discountUtils.validateDiscountCode(null, 'subscriptions');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Discount code not found');
    });

    it('should reject inactive discount code', () => {
      const discount = {
        id: 1,
        code: 'TEST',
        isActive: false,
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2025-12-31'),
        maxUses: null,
        currentUses: 0,
        applicableTo: 'all',
      } as DiscountCode;

      const result = discountUtils.validateDiscountCode(discount, 'subscriptions');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('This discount code is no longer active');
    });

    it('should reject expired discount code', () => {
      const discount = {
        id: 1,
        code: 'TEST',
        isActive: true,
        validFrom: new Date('2024-01-01'),
        validTo: new Date('2024-12-31'),
        maxUses: null,
        currentUses: 0,
        applicableTo: 'all',
      } as DiscountCode;

      const result = discountUtils.validateDiscountCode(discount, 'subscriptions');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('This discount code has expired');
    });

    it('should reject discount code not yet valid', () => {
      const discount = {
        id: 1,
        code: 'TEST',
        isActive: true,
        validFrom: new Date(Date.now() + 86400000), // Tomorrow
        validTo: new Date(Date.now() + 172800000), // Day after tomorrow
        maxUses: null,
        currentUses: 0,
        applicableTo: 'all',
      } as DiscountCode;

      const result = discountUtils.validateDiscountCode(discount, 'subscriptions');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('This discount code is not yet valid');
    });

    it('should reject discount code that exceeded max uses', () => {
      const discount = {
        id: 1,
        code: 'TEST',
        isActive: true,
        validFrom: new Date('2024-01-01'),
        validTo: new Date('2026-12-31'),
        maxUses: 5,
        currentUses: 5,
        applicableTo: 'all',
      } as DiscountCode;

      const result = discountUtils.validateDiscountCode(discount, 'subscriptions');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('This discount code has reached its maximum uses');
    });

    it('should reject discount not applicable to transaction type', () => {
      const discount = {
        id: 1,
        code: 'TEST',
        isActive: true,
        validFrom: new Date('2024-01-01'),
        validTo: new Date('2026-12-31'),
        maxUses: null,
        currentUses: 0,
        applicableTo: 'courses',
      } as DiscountCode;

      const result = discountUtils.validateDiscountCode(discount, 'subscriptions');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('This discount code is only applicable to courses');
    });

    it('should accept valid discount code', () => {
      const discount = {
        id: 1,
        code: 'TEST',
        isActive: true,
        validFrom: new Date('2024-01-01'),
        validTo: new Date('2026-12-31'),
        maxUses: null,
        currentUses: 0,
        applicableTo: 'all',
      } as DiscountCode;

      const result = discountUtils.validateDiscountCode(discount, 'subscriptions');
      expect(result.valid).toBe(true);
      expect(result.discount).toEqual(discount);
    });
  });

  describe('calculateDiscountedPrice', () => {
    it('should calculate percentage discount', () => {
      const discount = {
        discountType: 'percentage',
        discountValue: 20,
      } as DiscountCode;

      const result = discountUtils.calculateDiscountedPrice(100, discount);
      expect(result.discountAmount).toBe(20);
      expect(result.finalPrice).toBe(80);
    });

    it('should calculate fixed discount', () => {
      const discount = {
        discountType: 'fixed',
        discountValue: 15,
      } as DiscountCode;

      const result = discountUtils.calculateDiscountedPrice(100, discount);
      expect(result.discountAmount).toBe(15);
      expect(result.finalPrice).toBe(85);
    });

    it('should cap percentage discount at 100%', () => {
      const discount = {
        discountType: 'percentage',
        discountValue: 150,
      } as DiscountCode;

      const result = discountUtils.calculateDiscountedPrice(100, discount);
      expect(result.discountAmount).toBe(100);
      expect(result.finalPrice).toBe(0);
    });

    it('should not allow discount to exceed original price', () => {
      const discount = {
        discountType: 'fixed',
        discountValue: 150,
      } as DiscountCode;

      const result = discountUtils.calculateDiscountedPrice(100, discount);
      expect(result.discountAmount).toBe(100);
      expect(result.finalPrice).toBe(0);
    });
  });

  describe('formatDiscount', () => {
    it('should format percentage discount', () => {
      const discount = {
        discountType: 'percentage',
        discountValue: 20,
      } as DiscountCode;

      const result = discountUtils.formatDiscount(discount);
      expect(result).toBe('20% off');
    });

    it('should format fixed discount', () => {
      const discount = {
        discountType: 'fixed',
        discountValue: 15,
      } as DiscountCode;

      const result = discountUtils.formatDiscount(discount);
      expect(result).toBe('$15 off');
    });
  });

  describe('calculateSavings', () => {
    it('should calculate savings amount and percentage', () => {
      const result = discountUtils.calculateSavings(100, 80);
      expect(result.amount).toBe(20);
      expect(result.percentage).toBe(20);
    });

    it('should handle zero original price', () => {
      const result = discountUtils.calculateSavings(0, 0);
      expect(result.amount).toBe(0);
      expect(result.percentage).toBe(0);
    });

    it('should round to 2 decimals', () => {
      const result = discountUtils.calculateSavings(99.99, 66.66);
      expect(result.amount).toBe(33.33);
      expect(result.percentage).toBeCloseTo(33.3, 1);
    });
  });
});
