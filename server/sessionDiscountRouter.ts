import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { sessionDiscountCodes, availabilitySlots } from "../drizzle/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { randomBytes } from "crypto";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "HHD-";
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export const sessionDiscountRouter = router({
  /**
   * Validate a discount code for a specific session.
   * Code is valid only if: unused, active, not expired, AND session has allowDiscountCodes = true
   */
  validate: protectedProcedure
    .input(z.object({
      code: z.string().min(1).max(20),
      sessionId: z.number(),
    }))
    .query(async ({ input }) => {
      // Check session allows discount codes
      const sessions = await (await getDb())
        .select()
        .from(availabilitySlots)
        .where(eq(availabilitySlots.id, input.sessionId))
        .limit(1);

      if (sessions.length === 0) {
        return { valid: false, reason: "Session not found" };
      }

      const session = sessions[0];
      if (!(session as any).allowDiscountCodes) {
        return { valid: false, reason: "This session does not accept discount codes" };
      }

      if (session.eventType !== "in-person") {
        return { valid: false, reason: "Discount codes are only for in-person sessions" };
      }

      // Check code validity
      const result = await (await getDb())
        .select()
        .from(sessionDiscountCodes)
        .where(eq(sessionDiscountCodes.code, input.code.toUpperCase()))
        .limit(1);

      if (result.length === 0) {
        return { valid: false, reason: "Code not found" };
      }

      const discount = result[0];

      if (!discount.isActive) {
        return { valid: false, reason: "Code has been revoked" };
      }
      if (discount.usedByUserId !== null) {
        return { valid: false, reason: "Code has already been used" };
      }
      if (discount.expiresAt && new Date() > discount.expiresAt) {
        return { valid: false, reason: "Code has expired" };
      }

      return { valid: true, reason: "Code applied — session is free" };
    }),

  /**
   * Redeem a discount code during booking.
   * Marks the code as used. Called by the booking create mutation.
   */
  redeem: protectedProcedure
    .input(z.object({
      code: z.string().min(1).max(20),
      sessionId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const code = input.code.toUpperCase();

      // Verify session allows discount codes
      const sessions = await (await getDb())
        .select()
        .from(availabilitySlots)
        .where(eq(availabilitySlots.id, input.sessionId))
        .limit(1);

      if (sessions.length === 0 || !(sessions[0] as any).allowDiscountCodes) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This session does not accept discount codes" });
      }

      // Find unused code
      const result = await (await getDb())
        .select()
        .from(sessionDiscountCodes)
        .where(
          and(
            eq(sessionDiscountCodes.code, code),
            eq(sessionDiscountCodes.isActive, true),
            isNull(sessionDiscountCodes.usedByUserId),
          )
        )
        .limit(1);

      if (result.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid, expired, or already used code" });
      }

      const discount = result[0];
      if (discount.expiresAt && new Date() > discount.expiresAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Code has expired" });
      }

      // Atomic mark as used
      await (await getDb())
        .update(sessionDiscountCodes)
        .set({ usedByUserId: ctx.user.id, usedAt: new Date() })
        .where(
          and(
            eq(sessionDiscountCodes.id, discount.id),
            isNull(sessionDiscountCodes.usedByUserId),
          )
        );

      return { success: true };
    }),

  // ── Admin endpoints ──

  generate: adminProcedure
    .input(z.object({
      type: z.enum(["single", "package"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const count = input.type === "package" ? 4 : 1;
      const packageGroup = input.type === "package" ? `pkg-${Date.now()}` : null;
      const codes: string[] = [];

      for (let i = 0; i < count; i++) {
        const code = generateCode();
        await (await getDb()).insert(sessionDiscountCodes).values({
          code,
          type: input.type,
          packageGroup,
          createdByAdminId: ctx.user.id,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 3 months
        });
        codes.push(code);
      }

      return { codes, type: input.type };
    }),

  list: adminProcedure.query(async () => {
    return await (await getDb())
      .select()
      .from(sessionDiscountCodes)
      .orderBy(sql`${sessionDiscountCodes.createdAt} DESC`)
      .limit(100);
  }),

  revoke: adminProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ input }) => {
      await (await getDb())
        .update(sessionDiscountCodes)
        .set({ isActive: false })
        .where(eq(sessionDiscountCodes.code, input.code.toUpperCase()));
      return { success: true };
    }),
});
