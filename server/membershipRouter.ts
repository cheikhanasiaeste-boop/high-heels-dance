import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { MEMBERSHIP_PRODUCTS, IN_PERSON_CREDIT_PACKS, hasActiveMembership } from "./membership-products";
import Stripe from "stripe";
import * as db from "./db";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-12-15.clover' })
  : null;

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
      inPersonCredits: (ctx.user as any).inPersonCredits ?? 0,
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

      if (!stripe) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Payment system not configured' });

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

  /**
   * Get in-person credit pack pricing
   */
  getInPersonPricing: protectedProcedure.query(() => {
    return {
      pack5: {
        name: IN_PERSON_CREDIT_PACKS.PACK_5.name,
        description: IN_PERSON_CREDIT_PACKS.PACK_5.description,
        credits: IN_PERSON_CREDIT_PACKS.PACK_5.credits,
        price: (IN_PERSON_CREDIT_PACKS.PACK_5.priceInCents / 100).toFixed(2),
        pricePerSession: (IN_PERSON_CREDIT_PACKS.PACK_5.priceInCents / IN_PERSON_CREDIT_PACKS.PACK_5.credits / 100).toFixed(2),
      },
      pack10: {
        name: IN_PERSON_CREDIT_PACKS.PACK_10.name,
        description: IN_PERSON_CREDIT_PACKS.PACK_10.description,
        credits: IN_PERSON_CREDIT_PACKS.PACK_10.credits,
        price: (IN_PERSON_CREDIT_PACKS.PACK_10.priceInCents / 100).toFixed(2),
        pricePerSession: (IN_PERSON_CREDIT_PACKS.PACK_10.priceInCents / IN_PERSON_CREDIT_PACKS.PACK_10.credits / 100).toFixed(2),
      },
    };
  }),

  /**
   * Purchase in-person credit pack (one-time Stripe checkout)
   */
  purchaseInPersonCredits: protectedProcedure
    .input(z.object({
      pack: z.enum(['pack5', 'pack10']),
    }))
    .mutation(async ({ ctx, input }) => {
      const origin = ctx.req.headers.origin || `${ctx.req.protocol}://${ctx.req.get('host')}`;
      const packConfig = input.pack === 'pack5' ? IN_PERSON_CREDIT_PACKS.PACK_5 : IN_PERSON_CREDIT_PACKS.PACK_10;

      if (!stripe) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Payment system not configured' });

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: packConfig.name,
                description: packConfig.description,
              },
              unit_amount: packConfig.priceInCents,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${origin}/membership?credits_success=true`,
        cancel_url: `${origin}/membership?canceled=true`,
        customer_email: ctx.user.email || undefined,
        client_reference_id: ctx.user.id.toString(),
        metadata: {
          user_id: ctx.user.id.toString(),
          type: 'in_person_credits',
          credits: packConfig.credits.toString(),
          pack: input.pack,
        },
      });

      return { url: session.url };
    }),
});
