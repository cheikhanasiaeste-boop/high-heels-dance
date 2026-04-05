import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as keypointDb from "./keypointDb";
import * as db from "./db";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const keypointRouter = router({
  // Public routes (for Sub-project 2)
  getChunk: protectedProcedure
    .input(z.object({
      lessonId: z.number(),
      fromMs: z.number().min(0),
      toMs: z.number().min(0),
    }))
    .query(({ input }) => keypointDb.getKeypointsChunk(input.lessonId, input.fromMs, input.toMs)),

  getMeta: protectedProcedure
    .input(z.object({ lessonId: z.number() }))
    .query(({ input }) => keypointDb.getKeypointsMeta(input.lessonId)),
});

export const adminKeypointRouter = router({
  start: adminProcedure
    .input(z.object({ lessonId: z.number() }))
    .mutation(async ({ input }) => {
      const lesson = await db.getLessonById(input.lessonId);
      if (!lesson) throw new TRPCError({ code: "NOT_FOUND", message: "Lesson not found" });
      if (lesson.videoStatus !== "ready" || !lesson.bunnyVideoId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lesson video is not ready" });
      }

      const newVersion = (lesson.keypointVersion ?? 0) + 1;
      await keypointDb.setKeypointStatus(input.lessonId, "extracting", {
        keypointVersion: newVersion,
      });

      // Return signed video URL for the browser to stream
      const bunny = await import("./lib/bunny");
      const videoUrl = await bunny.getSignedPlaybackUrl(lesson.bunnyVideoId);

      return {
        version: newVersion,
        videoUrl,
        durationMs: (lesson.durationSeconds ?? 0) * 1000,
      };
    }),

  uploadBatch: adminProcedure
    .input(z.object({
      lessonId: z.number(),
      version: z.number(),
      keypoints: z.array(z.object({
        timestampMs: z.number(),
        landmarks: z.any(),
      })).max(500),
    }))
    .mutation(async ({ input }) => {
      const lesson = await db.getLessonById(input.lessonId);
      if (!lesson || lesson.keypointStatus !== "extracting") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lesson is not in extracting state" });
      }
      if (lesson.keypointVersion !== input.version) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Version mismatch" });
      }

      await keypointDb.insertKeypointBatch(input.lessonId, input.version, input.keypoints);
      return { ok: true };
    }),

  complete: adminProcedure
    .input(z.object({
      lessonId: z.number(),
      version: z.number(),
      keypointCount: z.number(),
    }))
    .mutation(async ({ input }) => {
      // Set status to complete
      await keypointDb.setKeypointStatus(input.lessonId, "complete", {
        keypointCount: input.keypointCount,
        keypointExtractedAt: new Date(),
      });

      // Clean up old versions
      const oldVersion = input.version - 1;
      if (oldVersion > 0) {
        await keypointDb.deleteKeypointsByVersion(input.lessonId, oldVersion);
      }

      return { ok: true };
    }),

  fail: adminProcedure
    .input(z.object({
      lessonId: z.number(),
      version: z.number(),
      error: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.error(`[AI Coach] Keypoint extraction failed for lesson ${input.lessonId}: ${input.error}`);

      // Delete partial keypoints for this failed version
      await keypointDb.deleteKeypointsByVersion(input.lessonId, input.version);

      // Revert status: if a previous complete version exists, keep "complete", otherwise "none"
      const lesson = await db.getLessonById(input.lessonId);
      const previousVersion = input.version - 1;
      if (previousVersion > 0 && lesson?.keypointCount && lesson.keypointCount > 0) {
        // Previous version still has data — revert to complete with old version
        await keypointDb.setKeypointStatus(input.lessonId, "complete", {
          keypointVersion: previousVersion,
        });
      } else {
        await keypointDb.setKeypointStatus(input.lessonId, "none", {
          keypointCount: 0,
          keypointVersion: 0,
          keypointExtractedAt: null,
        });
      }

      return { ok: true };
    }),

  reset: adminProcedure
    .input(z.object({ lessonId: z.number() }))
    .mutation(async ({ input }) => {
      await keypointDb.deleteAllKeypointsForLesson(input.lessonId);
      await keypointDb.setKeypointStatus(input.lessonId, "none", {
        keypointCount: 0,
        keypointVersion: 0,
        keypointExtractedAt: null,
      });
      return { ok: true };
    }),
});
