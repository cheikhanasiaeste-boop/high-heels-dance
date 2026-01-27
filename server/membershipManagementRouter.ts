import { z } from 'zod';
import * as db from './db';
import { TRPCError } from '@trpc/server';
import { publicProcedure, protectedProcedure } from './_core/trpc';

const adminProcedure = protectedProcedure.use(({ ctx, next }: any) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

const router = (routes: any) => routes;

export const membershipManagementRouter = {
  /**
   * Upgrade user membership (admin only)
   */
  upgradeMembership: adminProcedure
    .input(z.object({
      userId: z.number(),
      plan: z.enum(['monthly', 'annual']),
    }))
    .mutation(async ({ input }: any) => {
      try {
        // Set membership with current date as start date
        await db.setUserMembership(input.userId, input.plan);
        
        return {
          success: true,
          message: `User upgraded to ${input.plan} membership`,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to upgrade membership: ${error.message}`,
        });
      }
    }),

  /**
   * Downgrade user to free membership (admin only)
   */
  downgradeToFree: adminProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .mutation(async ({ input }: any) => {
      try {
        await db.setUserMembership(input.userId, 'free');
        
        return {
          success: true,
          message: 'User downgraded to free membership',
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to downgrade membership: ${error.message}`,
        });
      }
    }),

  /**
   * Extend membership end date (admin only)
   */
  extendMembership: adminProcedure
    .input(z.object({
      userId: z.number(),
      daysToAdd: z.number().min(1).max(365),
    }))
    .mutation(async ({ input }: any) => {
      try {
        // Get current user membership
        const user = await db.getUserById(input.userId);
        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        if (!user.membershipEndDate) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'User does not have an active membership to extend',
          });
        }

        // Calculate new end date
        const currentEndDate = new Date(user.membershipEndDate);
        const newEndDate = new Date(currentEndDate);
        newEndDate.setDate(newEndDate.getDate() + input.daysToAdd);

        // Update membership end date
        await db.updateMembershipEndDate(input.userId, newEndDate);

        return {
          success: true,
          message: `Membership extended by ${input.daysToAdd} days`,
          newEndDate: newEndDate.toISOString(),
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to extend membership: ${error.message}`,
        });
      }
    }),

  /**
   * Cancel user membership (admin only)
   */
  cancelMembership: adminProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .mutation(async ({ input }: any) => {
      try {
        await db.setUserMembership(input.userId, 'free');
        
        return {
          success: true,
          message: 'Membership canceled and user downgraded to free',
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to cancel membership: ${error.message}`,
        });
      }
    }),
};
