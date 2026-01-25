/**
 * Membership subscription products for Stripe
 * These products define the monthly and annual membership tiers
 */

export const MEMBERSHIP_PRODUCTS = {
  MONTHLY: {
    name: 'Monthly Membership',
    description: 'Full access to all courses and classes for 1 month',
    priceInCents: 2999, // $29.99/month
    interval: 'month' as const,
    intervalCount: 1,
  },
  ANNUAL: {
    name: 'Annual Membership',
    description: 'Full access to all courses and classes for 1 year (billed monthly)',
    priceInCents: 2499, // $24.99/month, billed monthly for 12 months
    interval: 'month' as const,
    intervalCount: 1,
    billingCycles: 12, // 12 months = 1 year commitment
  },
};

/**
 * Membership access levels
 */
export type MembershipStatus = 'free' | 'monthly' | 'annual';

/**
 * Check if user has active membership
 */
export function hasActiveMembership(membershipStatus: MembershipStatus, membershipEndDate?: Date): boolean {
  if (membershipStatus === 'free') {
    return false;
  }
  
  if (!membershipEndDate) {
    return false;
  }
  
  return new Date() < membershipEndDate;
}

/**
 * Check if user can access content based on membership
 * - Free users: can only access free content (unless they purchased it)
 * - Monthly/Annual members: can access all content
 */
export function canAccessContent(
  membershipStatus: MembershipStatus,
  membershipEndDate: Date | null | undefined,
  isFreeContent: boolean,
  userPurchasedContent: boolean
): boolean {
  // Free content is always accessible
  if (isFreeContent) {
    return true;
  }
  
  // User purchased this content
  if (userPurchasedContent) {
    return true;
  }
  
  // Check if user has active membership
  if (membershipEndDate && hasActiveMembership(membershipStatus, membershipEndDate)) {
    return true;
  }
  
  return false;
}
