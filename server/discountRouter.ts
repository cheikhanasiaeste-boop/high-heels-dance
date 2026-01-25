import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { validateDiscountCode, calculateDiscountedPrice, formatDiscount } from "./discount-utils";

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const discountRouter = router({
  /**
   * Validate and get discount code details
   */
  validateCode: protectedProcedure
    .input(z.object({
      code: z.string().min(1),
      applicableTo: z.enum(['subscriptions', 'courses']),
    }))
    .query(async ({ input }) => {
      const discount = await db.getDiscountCodeByCode(input.code);
      const validation = validateDiscountCode(discount, input.applicableTo);

      if (!validation.valid) {
        return {
          valid: false,
          error: validation.error,
        };
      }

      return {
        valid: true,
        discount: {
          id: validation.discount!.id,
          code: validation.discount!.code,
          description: validation.discount!.description,
          discountType: validation.discount!.discountType,
          discountValue: Number(validation.discount!.discountValue),
          displayText: formatDiscount(validation.discount!),
        },
      };
    }),

  /**
   * Calculate price with discount
   */
  calculatePrice: protectedProcedure
    .input(z.object({
      originalPrice: z.number().positive(),
      discountCode: z.string().optional(),
      applicableTo: z.enum(['subscriptions', 'courses']),
    }))
    .query(async ({ input }) => {
      let discountAmount = 0;
      let finalPrice = input.originalPrice;
      let discount = null;

      if (input.discountCode) {
        const discountRecord = await db.getDiscountCodeByCode(input.discountCode);
        const validation = validateDiscountCode(discountRecord, input.applicableTo);

        if (validation.valid && validation.discount) {
          discount = validation.discount;
          const calculated = calculateDiscountedPrice(input.originalPrice, discount);
          discountAmount = calculated.discountAmount;
          finalPrice = calculated.finalPrice;
        }
      }

      return {
        originalPrice: input.originalPrice,
        discountAmount,
        finalPrice,
        discount: discount ? {
          id: discount.id,
          code: discount.code,
          displayText: formatDiscount(discount),
        } : null,
      };
    }),

  /**
   * Get all discount codes (admin only)
   */
  list: adminProcedure.query(async () => {
    const codes = await db.getAllDiscountCodes();
    return codes.map(code => ({
      id: code.id,
      code: code.code,
      description: code.description,
      discountType: code.discountType,
      discountValue: Number(code.discountValue),
      validFrom: code.validFrom,
      validTo: code.validTo,
      maxUses: code.maxUses,
      currentUses: code.currentUses,
      isActive: code.isActive,
      applicableTo: code.applicableTo,
      createdAt: code.createdAt,
    }));
  }),

  /**
   * Create discount code (admin only)
   */
  create: adminProcedure
    .input(z.object({
      code: z.string().min(2).max(50).toUpperCase(),
      description: z.string().optional(),
      discountType: z.enum(['percentage', 'fixed']),
      discountValue: z.number().positive(),
      validFrom: z.date(),
      validTo: z.date(),
      maxUses: z.number().int().positive().optional(),
      applicableTo: z.enum(['all', 'subscriptions', 'courses']),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.validFrom >= input.validTo) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Valid from date must be before valid to date',
        });
      }

      if (input.discountType === 'percentage' && input.discountValue > 100) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Percentage discount cannot exceed 100%',
        });
      }

      const created = await db.createDiscountCode({
        code: input.code,
        description: input.description,
        discountType: input.discountType,
        discountValue: input.discountValue,
        validFrom: input.validFrom,
        validTo: input.validTo,
        maxUses: input.maxUses,
        applicableTo: input.applicableTo,
        createdBy: ctx.user.id,
      });

      if (!created) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create discount code',
        });
      }

      return {
        id: created.id,
        code: created.code,
        description: created.description,
        discountType: created.discountType,
        discountValue: Number(created.discountValue),
        validFrom: created.validFrom,
        validTo: created.validTo,
        maxUses: created.maxUses,
        currentUses: created.currentUses,
        isActive: created.isActive,
        applicableTo: created.applicableTo,
      };
    }),

  /**
   * Update discount code (admin only)
   */
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      description: z.string().optional(),
      discountValue: z.number().positive().optional(),
      validFrom: z.date().optional(),
      validTo: z.date().optional(),
      maxUses: z.number().int().positive().optional(),
      isActive: z.boolean().optional(),
      applicableTo: z.enum(['all', 'subscriptions', 'courses']).optional(),
    }))
    .mutation(async ({ input }) => {
      const updated = await db.updateDiscountCode(input.id, {
        description: input.description,
        discountValue: input.discountValue,
        validFrom: input.validFrom,
        validTo: input.validTo,
        maxUses: input.maxUses,
        isActive: input.isActive,
        applicableTo: input.applicableTo,
      });

      if (!updated) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Discount code not found',
        });
      }

      return {
        id: updated.id,
        code: updated.code,
        description: updated.description,
        discountType: updated.discountType,
        discountValue: Number(updated.discountValue),
        validFrom: updated.validFrom,
        validTo: updated.validTo,
        maxUses: updated.maxUses,
        currentUses: updated.currentUses,
        isActive: updated.isActive,
        applicableTo: updated.applicableTo,
      };
    }),

  /**
   * Delete discount code (admin only)
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteDiscountCode(input.id);
      return { success: true };
    }),

  /**
   * Get discount usage statistics (admin only)
   */
  getStats: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const stats = await db.getDiscountUsageStats(input.id);
      return stats || { totalUses: 0, totalDiscounted: 0, totalRevenue: 0 };
    }),
});
