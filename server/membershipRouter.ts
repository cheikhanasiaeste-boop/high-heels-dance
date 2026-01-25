import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { MEMBERSHIP_PRODUCTS, hasActiveMembership } from "./membership-products";

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
        interval: "year",
      },
    };
  }),
});
