/**
 * Discount code utilities and validation functions
 */

import { DiscountCode } from '../drizzle/schema';

export type DiscountValidationResult = {
  valid: boolean;
  error?: string;
  discount?: DiscountCode;
};

/**
 * Validate a discount code
 */
export function validateDiscountCode(
  code: DiscountCode | null,
  applicableTo: 'subscriptions' | 'courses'
): DiscountValidationResult {
  if (!code) {
    return { valid: false, error: 'Discount code not found' };
  }

  if (!code.isActive) {
    return { valid: false, error: 'This discount code is no longer active' };
  }

  const now = new Date();
  if (code.validFrom > now) {
    return { valid: false, error: 'This discount code is not yet valid' };
  }

  if (code.validTo < now) {
    return { valid: false, error: 'This discount code has expired' };
  }

  if (code.maxUses && code.currentUses >= code.maxUses) {
    return { valid: false, error: 'This discount code has reached its maximum uses' };
  }

  // Check if applicable to this transaction type
  if (code.applicableTo !== 'all' && code.applicableTo !== applicableTo) {
    return {
      valid: false,
      error: `This discount code is only applicable to ${code.applicableTo}`,
    };
  }

  return { valid: true, discount: code };
}

/**
 * Calculate discounted price
 */
export function calculateDiscountedPrice(
  originalPrice: number,
  discount: DiscountCode
): { discountAmount: number; finalPrice: number } {
  let discountAmount = 0;

  if (discount.discountType === 'percentage') {
    const percentage = Math.min(100, Math.max(0, Number(discount.discountValue)));
    discountAmount = (originalPrice * percentage) / 100;
  } else if (discount.discountType === 'fixed') {
    discountAmount = Math.min(Number(discount.discountValue), originalPrice);
  }

  const finalPrice = Math.max(0, originalPrice - discountAmount);

  return {
    discountAmount: Math.round(discountAmount * 100) / 100, // Round to 2 decimals
    finalPrice: Math.round(finalPrice * 100) / 100,
  };
}

/**
 * Format discount for display
 */
export function formatDiscount(discount: DiscountCode): string {
  if (discount.discountType === 'percentage') {
    return `${discount.discountValue}% off`;
  } else {
    return `$${discount.discountValue} off`;
  }
}

/**
 * Calculate savings display
 */
export function calculateSavings(originalPrice: number, finalPrice: number): {
  amount: number;
  percentage: number;
} {
  const amount = originalPrice - finalPrice;
  const percentage = originalPrice > 0 ? (amount / originalPrice) * 100 : 0;

  return {
    amount: Math.round(amount * 100) / 100,
    percentage: Math.round(percentage * 10) / 10,
  };
}
