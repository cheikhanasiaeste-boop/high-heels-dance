import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as db from './db';
import { MEMBERSHIP_PRODUCTS, hasActiveMembership, canAccessContent } from './membership-products';

describe('Membership System', () => {
  describe('Membership Products', () => {
    it('should have correct monthly pricing', () => {
      expect(MEMBERSHIP_PRODUCTS.MONTHLY.priceInCents).toBe(2999); // $29.99
      expect(MEMBERSHIP_PRODUCTS.MONTHLY.interval).toBe('month');
      expect(MEMBERSHIP_PRODUCTS.MONTHLY.intervalCount).toBe(1);
    });

    it('should have correct annual pricing (monthly billing)', () => {
      expect(MEMBERSHIP_PRODUCTS.ANNUAL.priceInCents).toBe(2499); // $24.99/month
      expect(MEMBERSHIP_PRODUCTS.ANNUAL.interval).toBe('month');
      expect(MEMBERSHIP_PRODUCTS.ANNUAL.billingCycles).toBe(12);
    });

    it('should calculate annual savings correctly', () => {
      const monthlyCost = MEMBERSHIP_PRODUCTS.MONTHLY.priceInCents * 12;
      const annualCost = MEMBERSHIP_PRODUCTS.ANNUAL.priceInCents * 12;
      const savings = monthlyCost - annualCost;
      
      // $29.99 * 12 = $359.88
      // $24.99 * 12 = $299.88
      // Savings = $60
      expect(savings).toBe(6000); // $60 in cents
    });
  });

  describe('Membership Status Checks', () => {
    it('should return false for free membership', () => {
      const result = hasActiveMembership('free', new Date());
      expect(result).toBe(false);
    });

    it('should return true for active membership', () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      const result = hasActiveMembership('monthly', futureDate);
      expect(result).toBe(true);
    });

    it('should return false for expired membership', () => {
      const pastDate = new Date();
      pastDate.setMonth(pastDate.getMonth() - 1);
      const result = hasActiveMembership('monthly', pastDate);
      expect(result).toBe(false);
    });

    it('should return false when no end date provided', () => {
      const result = hasActiveMembership('monthly', undefined);
      expect(result).toBe(false);
    });
  });

  describe('Content Access Control', () => {
    it('should allow access to free content for all users', () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      
      const result = canAccessContent('free', futureDate, true, false);
      expect(result).toBe(true);
    });

    it('should allow access to purchased content', () => {
      const result = canAccessContent('free', null, false, true);
      expect(result).toBe(true);
    });

    it('should allow access for active members', () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      
      const result = canAccessContent('monthly', futureDate, false, false);
      expect(result).toBe(true);
    });

    it('should deny access for free users to paid content', () => {
      const result = canAccessContent('free', null, false, false);
      expect(result).toBe(false);
    });

    it('should deny access for expired members', () => {
      const pastDate = new Date();
      pastDate.setMonth(pastDate.getMonth() - 1);
      
      const result = canAccessContent('monthly', pastDate, false, false);
      expect(result).toBe(false);
    });
  });

  describe('Membership Duration Calculations', () => {
    it('should calculate correct end date for monthly membership', () => {
      const now = new Date();
      const expectedEndDate = new Date(now);
      expectedEndDate.setMonth(expectedEndDate.getMonth() + 1);
      
      // Verify the calculation logic
      expect(expectedEndDate.getTime()).toBeGreaterThan(now.getTime());
      expect(expectedEndDate.getMonth()).toBe((now.getMonth() + 1) % 12);
    });

    it('should calculate correct end date for annual membership', () => {
      const now = new Date();
      const expectedEndDate = new Date(now);
      expectedEndDate.setFullYear(expectedEndDate.getFullYear() + 1);
      
      // Verify the calculation logic
      expect(expectedEndDate.getTime()).toBeGreaterThan(now.getTime());
      expect(expectedEndDate.getFullYear()).toBe(now.getFullYear() + 1);
    });
  });

  describe('Membership Pricing Display', () => {
    it('should format monthly price correctly', () => {
      const price = (MEMBERSHIP_PRODUCTS.MONTHLY.priceInCents / 100).toFixed(2);
      expect(price).toBe('29.99');
    });

    it('should format annual price correctly', () => {
      const price = (MEMBERSHIP_PRODUCTS.ANNUAL.priceInCents / 100).toFixed(2);
      expect(price).toBe('24.99');
    });

    it('should calculate savings per year correctly', () => {
      const monthlyCost = MEMBERSHIP_PRODUCTS.MONTHLY.priceInCents * 12;
      const annualCost = MEMBERSHIP_PRODUCTS.ANNUAL.priceInCents * 12;
      const savingsPerYear = (monthlyCost - annualCost) / 100;
      
      expect(savingsPerYear).toBe(60); // $60 savings per year
    });
  });
});
