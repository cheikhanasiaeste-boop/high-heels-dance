import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db as drizzleDb } from "./db";
import { sessionDiscountCodes } from "../drizzle/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { randomBytes } from "crypto";

function generateCode(): string {
  // Format: HHD-XXXXXX (uppercase alphanumeric)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 to avoid confusion
  let code = "HHD-";
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export const sessionDiscountRouter = router({
  /**
   * Validate a session discount code at booking time
   * Returns whether the code is valid for the given session
   */
  validate: protectedProcedure
    .input(z.object({
      code: z.string().min(1).max(20),
      sessionId: z.number(),
    }))
    .query(async ({ input }) => {
      const { db } = await import("./db");
      const result = await drizzleDb
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

      // Check session match: null sessionId = any in-person session; specific = must match
      if (discount.sessionId !== null && discount.sessionId !== input.sessionId) {
        return { valid: false, reason: "Code is not valid for this session" };
      }

      return { valid: true, reason: "Code applied — session is free" };
    }),

  /**
   * Redeem a session discount code (called during booking)
   * Marks the code as used by the current user
   */
  redeem: protectedProcedure
    .input(z.object({
      code: z.string().min(1).max(20),
      sessionId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const code = input.code.toUpperCase();

      const result = await drizzleDb
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

      if (discount.sessionId !== null && discount.sessionId !== input.sessionId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Code is not valid for this session" });
      }

      // Mark as used
      await drizzleDb
        .update(sessionDiscountCodes)
        .set({
          usedByUserId: ctx.user.id,
          usedAt: new Date(),
        })
        .where(
          and(
            eq(sessionDiscountCodes.id, discount.id),
            isNull(sessionDiscountCodes.usedByUserId), // race condition guard
          )
        );

      return { success: true, message: "Code redeemed — session is free" };
    }),

  // ── Admin endpoints ──────────────────────────────────────

  /**
   * Generate discount codes (admin only)
   */
  generate: adminProcedure
    .input(z.object({
      type: z.enum(["single", "package"]),
      sessionId: z.number().nullable(), // null = any in-person session
      expiresAt: z.string().datetime().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const count = input.type === "package" ? 4 : 1;
      const packageGroup = input.type === "package" ? `pkg-${Date.now()}` : null;
      const codes: string[] = [];

      for (let i = 0; i < count; i++) {
        const code = generateCode();
        await drizzleDb.insert(sessionDiscountCodes).values({
          code,
          type: input.type,
          packageGroup,
          sessionId: input.sessionId,
          createdByAdminId: ctx.user.id,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        });
        codes.push(code);
      }

      return { codes, type: input.type, sessionId: input.sessionId };
    }),

  /**
   * List all session discount codes (admin only)
   */
  list: adminProcedure.query(async () => {
    return await drizzleDb
      .select()
      .from(sessionDiscountCodes)
      .orderBy(sql`${sessionDiscountCodes.createdAt} DESC`)
      .limit(100);
  }),

  /**
   * Revoke a code (admin only)
   */
  revoke: adminProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ input }) => {
      const result = await drizzleDb
        .update(sessionDiscountCodes)
        .set({ isActive: false })
        .where(eq(sessionDiscountCodes.code, input.code.toUpperCase()));

      return { success: true };
    }),
});
