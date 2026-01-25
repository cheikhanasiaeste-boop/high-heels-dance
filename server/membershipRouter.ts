import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { MEMBERSHIP_PRODUCTS, hasActiveMembership } from "./membership-products";
import Stripe from "stripe";
import * as db from "./db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
});

export const membershipRouter = router({
  /**
   * Get current user's membership status
   */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    return {
      membershipStatus: ctx.user.membershipStatus,
      membershipStartDate: ctx.user.membershipStartDate,
      membershipEndDate: ctx.user.membershipEndDate,
      isActive: ctx.user.membershipEndDate ? hasActiveMembership(ctx.user.membershipStatus, ctx.user.membershipEndDate) : false,
    };
  }),

  /**
   * Get membership pricing information
   */
  getPricing: protectedProcedure.query(() => {
    return {
      monthly: {
        name: MEMBERSHIP_PRODUCTS.MONTHLY.name,
        description: MEMBERSHIP_PRODUCTS.MONTHLY.description,
        price: (MEMBERSHIP_PRODUCTS.MONTHLY.priceInCents / 100).toFixed(2),
        interval: "month",
      },
      annual: {
        name: MEMBERSHIP_PRODUCTS.ANNUAL.name,
        description: MEMBERSHIP_PRODUCTS.ANNUAL.description,
        price: (MEMBERSHIP_PRODUCTS.ANNUAL.priceInCents / 100).toFixed(2),
        interval: "month",
        billingCycles: MEMBERSHIP_PRODUCTS.ANNUAL.billingCycles,
        savingsPerYear: ((MEMBERSHIP_PRODUCTS.MONTHLY.priceInCents * 12) - (MEMBERSHIP_PRODUCTS.ANNUAL.priceInCents * 12)) / 100,
      },
    };
  }),

  /**
   * Create subscription checkout session
   */
  createSubscriptionCheckout: protectedProcedure
    .input(z.object({
      plan: z.enum(['monthly', 'annual']),
      discountCode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if user already has active membership
      if (ctx.user.membershipEndDate && hasActiveMembership(ctx.user.membershipStatus, ctx.user.membershipEndDate)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'User already has active membership' });
      }

      const origin = ctx.req.headers.origin || `${ctx.req.protocol}://${ctx.req.get('host')}`;
      const product = input.plan === 'monthly' ? MEMBERSHIP_PRODUCTS.MONTHLY : MEMBERSHIP_PRODUCTS.ANNUAL;

      // Create Stripe subscription checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: product.name,
                description: product.description,
              },
              unit_amount: product.priceInCents,
              recurring: {
                interval: product.interval,
                interval_count: product.intervalCount,
              },
            },
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${origin}/membership?success=true`,
        cancel_url: `${origin}/membership?canceled=true`,
        customer_email: ctx.user.email || undefined,
        client_reference_id: ctx.user.id.toString(),
        metadata: {
          user_id: ctx.user.id.toString(),
          plan: input.plan,
          discountCode: input.discountCode || '',
          customer_email: ctx.user.email || '',
          customer_name: ctx.user.name || '',
        },
        allow_promotion_codes: true,
      });

      return { url: session.url };
    }),
});
