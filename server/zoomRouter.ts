import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { availabilitySlots } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { generateZoomSDKSignature, canJoinMeeting } from "./_core/zoom";

/**
 * Zoom Web SDK Router
 * 
 * Handles secure Zoom meeting access via Web Meeting SDK
 */
export const zoomRouter = router({
  /**
   * Join a Zoom meeting
   * 
   * This endpoint generates a short-lived SDK signature for the Zoom Web Meeting SDK.
   * 
   * Security checks:
   * 1. User must be authenticated
   * 2. User must have a confirmed booking for this session
   * 3. Current time must be within 15 minutes of session start
   * 4. Session must have a Zoom meeting ID
   * 
   * Returns:
   * - meetingNumber: Numeric meeting ID for SDK
   * - sdkKey: Zoom SDK key (client ID)
   * - signature: Short-lived JWT signature (expires in 60 seconds)
   * - userName: User's display name for the meeting
   * - userEmail: User's email
   * 
   * NEVER returns join_url - meetings can only be joined via SDK
   */
  join: protectedProcedure
    .input(z.object({
      bookingId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // 1. Get booking details
      const booking = await db.getBookingById(input.bookingId);
      
      if (!booking) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking not found",
        });
      }

      // 2. Verify user owns this booking
      if (booking.userId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this session",
        });
      }

      // 3. Verify booking is confirmed (not cancelled)
      if (booking.status === "cancelled") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This booking has been cancelled",
        });
      }

      // 4. Get session details
      // Query availabilitySlots table directly using booking.slotId
      const dbConn = await db.getDb();
      if (!dbConn) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }
      
      const slots = await dbConn
        .select()
        .from(availabilitySlots)
        .where(eq(availabilitySlots.id, booking.slotId))
        .limit(1);
      
      const slot = slots[0];
      
      if (!slot) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      // 5. Verify session has a Zoom meeting ID
      if (!slot.zoomMeetingId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This session does not have a Zoom meeting configured",
        });
      }

      // 6. Verify time window (15 minutes before session start)
      const startTime = new Date(slot.startTime);
      
      if (!canJoinMeeting(startTime)) {
        const joinTime = new Date(startTime.getTime() - 15 * 60 * 1000);
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You can join this session starting at ${joinTime.toLocaleString()}`,
        });
      }

      // 7. Generate SDK signature (expires in 60 seconds)
      const meetingNumber = parseInt(slot.zoomMeetingId);
      const signature = generateZoomSDKSignature(meetingNumber, 0); // 0 = participant

      // 8. Return SDK credentials (NO join_url)
      return {
        meetingNumber: meetingNumber,
        sdkKey: process.env.ZOOM_CLIENT_ID!,
        signature: signature,
        userName: ctx.user.name || ctx.user.email,
        userEmail: ctx.user.email,
        // NEVER return join_url - it must not be exposed
      };
    }),
});
