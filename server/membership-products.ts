/**
 * Membership subscription products for Stripe
 * These products define the monthly and annual membership tiers
 */

export const MEMBERSHIP_PRODUCTS = {
  MONTHLY: {
    name: 'Monthly Membership',
    description: 'Full access to all online courses and classes for 1 month',
    priceInCents: 2999, // $29.99/month
    interval: 'month' as const,
    intervalCount: 1,
  },
  ANNUAL: {
    name: 'Annual Membership',
    description: 'Full access to all online courses and classes for 1 year (billed monthly)',
    priceInCents: 2499, // $24.99/month, billed monthly for 12 months
    interval: 'month' as const,
    intervalCount: 1,
    billingCycles: 12, // 12 months = 1 year commitment
  },
};

// In-Person credit packs (one-time purchases, not subscriptions)
export const IN_PERSON_CREDIT_PACKS = {
  PACK_5: {
    name: '5 In-Person Sessions',
    description: '5 in-person dance session credits',
    credits: 5,
    priceInCents: 12500, // $125 ($25/session)
  },
  PACK_10: {
    name: '10 In-Person Sessions',
    description: '10 in-person dance session credits — best value',
    credits: 10,
    priceInCents: 20000, // $200 ($20/session — save $50)
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
