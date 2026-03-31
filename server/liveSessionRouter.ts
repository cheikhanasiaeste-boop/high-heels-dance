import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { createZoomMeeting, generateZoomSDKSignature, canJoinMeeting } from "./_core/zoom";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next();
});

export const liveSessionRouter = router({
  // Public: get session by ID
  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const session = await db.getLiveSessionById(input.id);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      return session;
    }),

  // Public: list upcoming sessions
  upcoming: publicProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return await db.getUpcomingLiveSessions(input?.limit ?? 10);
    }),

  // Public: list all sessions
  list: publicProcedure.query(async () => {
    return await db.getAllLiveSessions();
  }),

  // Protected: join a live session (get Zoom SDK credentials)
  join: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const session = await db.getLiveSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      // Access control for paid sessions
      if (!session.isFree) {
        const isPremium = ctx.user.membershipStatus === "monthly" || ctx.user.membershipStatus === "annual";
        if (!isPremium) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This session requires purchase or premium membership" });
        }
      }

      if (!session.zoomMeetingId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Zoom meeting not configured" });
      }

      if (!canJoinMeeting(new Date(session.startTime))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Session has not started yet" });
      }

      if (new Date() > new Date(session.endTime)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Session has ended" });
      }

      const meetingNumber = parseInt(session.zoomMeetingId);
      const signature = generateZoomSDKSignature(meetingNumber, 0);

      return {
        meetingNumber,
        password: (session as any).zoomPassword || "",
        sdkKey: process.env.ZOOM_CLIENT_ID!,
        signature,
        userName: ctx.user.name || ctx.user.email || "Participant",
        userEmail: ctx.user.email || "",
      };
    }),

  // Admin: create session
  create: adminProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      startTime: z.string(),
      endTime: z.string(),
      isFree: z.boolean(),
      price: z.string().optional(),
      capacity: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.createLiveSession({
        title: input.title,
        description: input.description || null,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
        isFree: input.isFree,
        price: input.isFree ? null : (input.price || null),
        capacity: input.capacity || 100,
      });
    }),

  // Admin: auto-create Zoom meeting for a session
  createZoom: adminProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const session = await db.getLiveSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      const durationMinutes = Math.ceil(
        (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000
      );

      const zoom = await createZoomMeeting(session.title, new Date(session.startTime).toISOString(), durationMinutes);

      await db.updateLiveSession(session.id, {
        zoomMeetingId: zoom.meetingId,
        zoomMeetingNumber: zoom.meetingNumber.toString(),
        zoomPassword: zoom.password,
      });

      return { meetingId: zoom.meetingId, meetingNumber: zoom.meetingNumber, password: zoom.password };
    }),

  // Admin: update session
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      isFree: z.boolean().optional(),
      price: z.string().optional(),
      capacity: z.number().optional(),
      status: z.enum(["scheduled", "live", "ended", "cancelled"]).optional(),
      zoomMeetingId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, startTime, endTime, ...rest } = input;
      const updates: any = { ...rest };
      if (startTime) updates.startTime = new Date(startTime);
      if (endTime) updates.endTime = new Date(endTime);
      return await db.updateLiveSession(id, updates);
    }),

  // Admin: delete session
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteLiveSession(input.id);
    }),

  // Admin: list all sessions (including past)
  adminList: adminProcedure.query(async () => {
    return await db.getAllLiveSessions();
  }),
});
