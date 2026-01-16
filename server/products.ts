/**
 * Stripe product and price definitions
 * This file centralizes product configuration for the dance course platform
 */

export const PRODUCTS = {
  // Products will be created dynamically based on courses in the database
  // No need for static product definitions since courses are managed via admin panel
} as const;

/**
 * Get Stripe price data for a course
 */
export function getCourseStripePrice(coursePrice: string, courseName: string) {
  const priceInCents = Math.round(parseFloat(coursePrice) * 100);
  
  return {
    currency: 'eur',
    unit_amount: priceInCents,
    product_data: {
      name: courseName,
      description: `Access to ${courseName} dance course`,
    },
  };
}
