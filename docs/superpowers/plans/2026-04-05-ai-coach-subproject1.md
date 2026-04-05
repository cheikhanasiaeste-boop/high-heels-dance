# AI Coach Sub-project 1: Reference Keypoint Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based tool that lets the admin extract and store the teacher's body pose keypoints from lesson videos at 3fps, creating the reference data needed for the AI Coach real-time comparison engine (Sub-project 2).

**Architecture:** Admin clicks "Extract Keypoints" on a lesson in the Course Content Manager. A hidden `<video>` element on the main thread seeks frame-by-frame. Each frame is drawn to a `<canvas>` and transferred as an `ImageBitmap` to a Web Worker running MediaPipe Pose. Extracted landmarks are batched (500 at a time) and uploaded to Postgres via tRPC. Status is tracked on the `course_lessons` table.

**Tech Stack:** MediaPipe Tasks Vision (WASM), Web Workers, Canvas API, Drizzle ORM, tRPC, React

**Spec:** `docs/superpowers/specs/2026-04-05-ai-coach-subproject1-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `drizzle/schema.ts` | Add `lesson_keypoints` table + keypoint columns to `course_lessons` |
| Modify | `server/db.ts` | Import new schema types |
| Create | `server/keypointDb.ts` | Keypoint DB functions (batch insert, delete by version, query by range) |
| Create | `server/keypointRouter.ts` | Admin + public tRPC routes for keypoint management |
| Modify | `server/routers.ts` | Mount keypoint router |
| Create | `client/src/workers/pose-worker.ts` | Web Worker: loads MediaPipe, runs pose detection on ImageBitmaps |
| Create | `client/src/hooks/useKeypointExtraction.ts` | React hook: orchestrates video seeking, frame capture, worker comms, batch upload |
| Modify | `client/src/pages/admin/CourseContentManager.tsx` | Add extraction UI per lesson (button, progress, status) |

---

### Task 1: Database Schema — lesson_keypoints Table + course_lessons Columns

**Files:**
- Modify: `drizzle/schema.ts` (append after line 334)
- Modify: `server/db.ts` (add imports)

- [ ] **Step 1: Add lesson_keypoints table to schema**

Append to `drizzle/schema.ts` after the `InsertCourseLesson` type export (line 334):

```typescript
/**
 * Lesson keypoints — teacher's reference pose landmarks per timestamp
 * Used by AI Coach to compare student movement in real time
 */
export const lessonKeypoints = pgTable("lesson_keypoints", {
  id: serial("id").primaryKey(),
  lessonId: integer("lessonId").notNull(),
  version: integer("version").notNull().default(1),
  timestampMs: integer("timestampMs").notNull(),
  landmarks: jsonb("landmarks").notNull(),
  processedAt: timestamp("processedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  lessonVersionTimestampIdx: index("keypoints_lesson_version_ts_idx").on(table.lessonId, table.version, table.timestampMs),
  lessonIdIdx: index("keypoints_lessonId_idx").on(table.lessonId),
}));

export type LessonKeypoint = typeof lessonKeypoints.$inferSelect;
export type InsertLessonKeypoint = typeof lessonKeypoints.$inferInsert;
```

- [ ] **Step 2: Add keypoint status columns to course_lessons**

In `drizzle/schema.ts`, find the `courseLessons` table (line 306). Add 4 new columns before the `createdAt` line (line 325):

```typescript
  // AI Coach keypoint extraction status
  keypointStatus: text("keypointStatus").$type<"none" | "extracting" | "complete" | "failed">().default("none").notNull(),
  keypointCount: integer("keypointCount").default(0).notNull(),
  keypointVersion: integer("keypointVersion").default(0).notNull(),
  keypointExtractedAt: timestamp("keypointExtractedAt"),
```

- [ ] **Step 3: Add imports to server/db.ts**

In `server/db.ts`, find the import block from `"../drizzle/schema"` and add:

```typescript
  lessonKeypoints,
  LessonKeypoint,
  InsertLessonKeypoint,
```

- [ ] **Step 4: Push schema to database**

Run: `npx drizzle-kit push`

- [ ] **Step 5: Commit**

```bash
git add drizzle/schema.ts server/db.ts
git commit -m "feat(ai-coach): add lesson_keypoints table and keypoint status columns"
```

---

### Task 2: Keypoint DB Functions

**Files:**
- Create: `server/keypointDb.ts`

- [ ] **Step 1: Create server/keypointDb.ts**

```typescript
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  lessonKeypoints,
  LessonKeypoint,
  InsertLessonKeypoint,
  courseLessons,
} from "../drizzle/schema";

// ---------------------------------------------------------------------------
// Batch insert keypoints
// ---------------------------------------------------------------------------

export async function insertKeypointBatch(
  lessonId: number,
  version: number,
  keypoints: Array<{ timestampMs: number; landmarks: any }>
): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      const rows = keypoints.map((kp) => ({
        lessonId,
        version,
        timestampMs: kp.timestampMs,
        landmarks: kp.landmarks,
      }));
      await db.insert(lessonKeypoints).values(rows);
      return;
    } catch (e) {
      console.warn("[Keypoints] insertKeypointBatch direct query failed, trying REST:", (e as Error).message);
    }
  }

  const { supabaseAdmin } = await import("./lib/supabase");
  const restRows = keypoints.map((kp) => ({
    lessonId,
    version,
    timestampMs: kp.timestampMs,
    landmarks: kp.landmarks,
  }));
  const { error } = await supabaseAdmin.from("lesson_keypoints").insert(restRows);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Delete keypoints by version
// ---------------------------------------------------------------------------

export async function deleteKeypointsByVersion(
  lessonId: number,
  version: number
): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db
        .delete(lessonKeypoints)
        .where(and(eq(lessonKeypoints.lessonId, lessonId), eq(lessonKeypoints.version, version)));
      return;
    } catch (e) {
      console.warn("[Keypoints] deleteKeypointsByVersion direct query failed, trying REST:", (e as Error).message);
    }
  }

  const { supabaseAdmin } = await import("./lib/supabase");
  await supabaseAdmin
    .from("lesson_keypoints")
    .delete()
    .eq("lessonId", lessonId)
    .eq("version", version);
}

// ---------------------------------------------------------------------------
// Delete ALL keypoints for a lesson
// ---------------------------------------------------------------------------

export async function deleteAllKeypointsForLesson(lessonId: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.delete(lessonKeypoints).where(eq(lessonKeypoints.lessonId, lessonId));
      return;
    } catch (e) {
      console.warn("[Keypoints] deleteAllKeypointsForLesson direct query failed, trying REST:", (e as Error).message);
    }
  }

  const { supabaseAdmin } = await import("./lib/supabase");
  await supabaseAdmin.from("lesson_keypoints").delete().eq("lessonId", lessonId);
}

// ---------------------------------------------------------------------------
// Update lesson keypoint status columns
// ---------------------------------------------------------------------------

export async function setKeypointStatus(
  lessonId: number,
  status: "none" | "extracting" | "complete" | "failed",
  updates?: { keypointCount?: number; keypointVersion?: number; keypointExtractedAt?: Date | null }
): Promise<void> {
  const data: Record<string, any> = { keypointStatus: status };
  if (updates?.keypointCount !== undefined) data.keypointCount = updates.keypointCount;
  if (updates?.keypointVersion !== undefined) data.keypointVersion = updates.keypointVersion;
  if (updates?.keypointExtractedAt !== undefined) data.keypointExtractedAt = updates.keypointExtractedAt;

  const db = await getDb();
  if (db) {
    try {
      await db.update(courseLessons).set(data).where(eq(courseLessons.id, lessonId));
      return;
    } catch (e) {
      console.warn("[Keypoints] setKeypointStatus direct query failed, trying REST:", (e as Error).message);
    }
  }

  const { supabaseAdmin } = await import("./lib/supabase");
  await supabaseAdmin.from("course_lessons").update(data).eq("id", lessonId);
}

// ---------------------------------------------------------------------------
// Get keypoints in a time range (for Sub-project 2)
// ---------------------------------------------------------------------------

export async function getKeypointsChunk(
  lessonId: number,
  fromMs: number,
  toMs: number
): Promise<Array<{ timestampMs: number; landmarks: any }>> {
  const db = await getDb();
  if (db) {
    try {
      // Get latest complete version
      const [lesson] = await db
        .select({ keypointVersion: courseLessons.keypointVersion, keypointStatus: courseLessons.keypointStatus })
        .from(courseLessons)
        .where(eq(courseLessons.id, lessonId))
        .limit(1);

      if (!lesson || lesson.keypointStatus !== "complete") return [];

      const rows = await db
        .select({ timestampMs: lessonKeypoints.timestampMs, landmarks: lessonKeypoints.landmarks })
        .from(lessonKeypoints)
        .where(
          and(
            eq(lessonKeypoints.lessonId, lessonId),
            eq(lessonKeypoints.version, lesson.keypointVersion),
            gte(lessonKeypoints.timestampMs, fromMs),
            lte(lessonKeypoints.timestampMs, toMs)
          )
        )
        .orderBy(lessonKeypoints.timestampMs);

      return rows;
    } catch (e) {
      console.warn("[Keypoints] getKeypointsChunk direct query failed, trying REST:", (e as Error).message);
    }
  }

  const { supabaseAdmin } = await import("./lib/supabase");

  const { data: lessonData } = await supabaseAdmin
    .from("course_lessons")
    .select("keypointVersion, keypointStatus")
    .eq("id", lessonId)
    .single();

  if (!lessonData || lessonData.keypointStatus !== "complete") return [];

  const { data, error } = await supabaseAdmin
    .from("lesson_keypoints")
    .select("timestampMs, landmarks")
    .eq("lessonId", lessonId)
    .eq("version", lessonData.keypointVersion)
    .gte("timestampMs", fromMs)
    .lte("timestampMs", toMs)
    .order("timestampMs", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Get keypoint metadata for a lesson (for Sub-project 2)
// ---------------------------------------------------------------------------

export async function getKeypointsMeta(
  lessonId: number
): Promise<{ status: string; count: number; version: number } | null> {
  const db = await getDb();
  if (db) {
    try {
      const [lesson] = await db
        .select({
          keypointStatus: courseLessons.keypointStatus,
          keypointCount: courseLessons.keypointCount,
          keypointVersion: courseLessons.keypointVersion,
        })
        .from(courseLessons)
        .where(eq(courseLessons.id, lessonId))
        .limit(1);

      if (!lesson) return null;
      return { status: lesson.keypointStatus, count: lesson.keypointCount, version: lesson.keypointVersion };
    } catch (e) {
      console.warn("[Keypoints] getKeypointsMeta direct query failed, trying REST:", (e as Error).message);
    }
  }

  const { supabaseAdmin } = await import("./lib/supabase");
  const { data } = await supabaseAdmin
    .from("course_lessons")
    .select("keypointStatus, keypointCount, keypointVersion")
    .eq("id", lessonId)
    .single();

  if (!data) return null;
  return { status: data.keypointStatus, count: data.keypointCount, version: data.keypointVersion };
}
```

- [ ] **Step 2: Commit**

```bash
git add server/keypointDb.ts
git commit -m "feat(ai-coach): add keypoint DB functions — batch insert, delete, query, status"
```

---

### Task 3: Keypoint tRPC Router

**Files:**
- Create: `server/keypointRouter.ts`
- Modify: `server/routers.ts` (mount router)

- [ ] **Step 1: Create server/keypointRouter.ts**

```typescript
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
```

- [ ] **Step 2: Mount router in server/routers.ts**

Add import after line 9:
```typescript
import { keypointRouter, adminKeypointRouter } from "./keypointRouter";
```

Add to `appRouter` before the closing `});` (around line 2442):
```typescript
  keypoints: keypointRouter,
  adminKeypoints: adminKeypointRouter,
```

- [ ] **Step 3: Commit**

```bash
git add server/keypointRouter.ts server/routers.ts
git commit -m "feat(ai-coach): add keypoint tRPC router — start, upload, complete, fail, reset"
```

---

### Task 4: Install MediaPipe + Create Pose Worker

**Files:**
- Create: `client/src/workers/pose-worker.ts`

- [ ] **Step 1: Install MediaPipe**

Run: `npm install @mediapipe/tasks-vision`

- [ ] **Step 2: Create the pose detection Web Worker**

Create `client/src/workers/pose-worker.ts`:

```typescript
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let poseLandmarker: PoseLandmarker | null = null;

// Compact landmark format: array of 33 {x, y, z, v}
type CompactLandmark = { x: number; y: number; z: number; v: number };

async function initPose() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "IMAGE",
    numPoses: 1,
  });
}

function processFrame(bitmap: ImageBitmap): CompactLandmark[] | null {
  if (!poseLandmarker) return null;

  const result = poseLandmarker.detect(bitmap);
  bitmap.close();

  if (!result.landmarks || result.landmarks.length === 0) return null;

  // Take first detected pose, compact to {x, y, z, v}
  const pose = result.landmarks[0];
  const worldLandmarks = result.worldLandmarks?.[0];

  return pose.map((lm, i) => ({
    x: Math.round(lm.x * 10000) / 10000,
    y: Math.round(lm.y * 10000) / 10000,
    z: Math.round((worldLandmarks?.[i]?.z ?? lm.z) * 10000) / 10000,
    v: Math.round(lm.visibility * 100) / 100,
  }));
}

// Message handler
self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data;

  if (type === "init") {
    try {
      await initPose();
      self.postMessage({ type: "ready" });
    } catch (err: any) {
      self.postMessage({ type: "error", message: `Failed to initialize MediaPipe: ${err.message}` });
    }
    return;
  }

  if (type === "detect") {
    const { bitmap, timestampMs } = e.data as { bitmap: ImageBitmap; timestampMs: number };
    const landmarks = processFrame(bitmap);
    if (landmarks) {
      self.postMessage({ type: "result", timestampMs, landmarks });
    } else {
      // No pose detected at this timestamp — skip
      self.postMessage({ type: "skip", timestampMs });
    }
    return;
  }
};
```

- [ ] **Step 3: Commit**

```bash
git add client/src/workers/pose-worker.ts package.json package-lock.json
git commit -m "feat(ai-coach): add MediaPipe pose detection Web Worker"
```

---

### Task 5: Keypoint Extraction React Hook

**Files:**
- Create: `client/src/hooks/useKeypointExtraction.ts`

- [ ] **Step 1: Create the extraction orchestration hook**

This hook manages the entire extraction lifecycle: spawns the worker, seeks the hidden video frame-by-frame, captures frames to canvas, sends ImageBitmaps to the worker, batches results, uploads via tRPC, and tracks progress.

Create `client/src/hooks/useKeypointExtraction.ts`:

```typescript
import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";

const SAMPLE_INTERVAL_MS = 333; // 3fps
const BATCH_SIZE = 500;
const MAX_RETRIES = 3;

export type ExtractionState = "idle" | "loading-model" | "extracting" | "uploading" | "complete" | "error" | "cancelled";

interface ExtractionProgress {
  state: ExtractionState;
  percent: number;
  processedFrames: number;
  totalFrames: number;
  etaSeconds: number | null;
  error: string | null;
}

export function useKeypointExtraction() {
  const [progress, setProgress] = useState<ExtractionProgress>({
    state: "idle",
    percent: 0,
    processedFrames: 0,
    totalFrames: 0,
    etaSeconds: null,
    error: null,
  });

  const workerRef = useRef<Worker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cancelledRef = useRef(false);
  const batchRef = useRef<Array<{ timestampMs: number; landmarks: any }>>([]);
  const uploadedCountRef = useRef(0);
  const startTimeRef = useRef(0);

  const startMutation = trpc.adminKeypoints.start.useMutation();
  const uploadBatchMutation = trpc.adminKeypoints.uploadBatch.useMutation();
  const completeMutation = trpc.adminKeypoints.complete.useMutation();
  const failMutation = trpc.adminKeypoints.fail.useMutation();

  const utils = trpc.useUtils();

  const uploadBatchWithRetry = useCallback(async (
    lessonId: number,
    version: number,
    keypoints: typeof batchRef.current
  ) => {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await uploadBatchMutation.mutateAsync({ lessonId, version, keypoints });
        return;
      } catch (e) {
        if (attempt === MAX_RETRIES - 1) throw e;
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt))); // 1s, 2s, 4s
      }
    }
  }, [uploadBatchMutation]);

  const flushBatch = useCallback(async (lessonId: number, version: number) => {
    if (batchRef.current.length === 0) return;
    const batch = [...batchRef.current];
    batchRef.current = [];
    await uploadBatchWithRetry(lessonId, version, batch);
    uploadedCountRef.current += batch.length;
  }, [uploadBatchWithRetry]);

  const start = useCallback(async (lessonId: number) => {
    cancelledRef.current = false;
    batchRef.current = [];
    uploadedCountRef.current = 0;
    startTimeRef.current = Date.now();

    setProgress({ state: "loading-model", percent: 0, processedFrames: 0, totalFrames: 0, etaSeconds: null, error: null });

    try {
      // 1. Call server to start extraction (get video URL + version)
      const { version, videoUrl, durationMs } = await startMutation.mutateAsync({ lessonId });
      const totalFrames = Math.floor(durationMs / SAMPLE_INTERVAL_MS);

      setProgress((p) => ({ ...p, totalFrames }));

      // 2. Create hidden video element
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      videoRef.current = video;

      // Create canvas for frame capture
      const canvas = document.createElement("canvas");
      canvasRef.current = canvas;

      // 3. Load video
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error("Failed to load video"));
        video.src = videoUrl;
      });

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;

      // 4. Create and init worker
      const worker = new Worker(
        new URL("../workers/pose-worker.ts", import.meta.url),
        { type: "module" }
      );
      workerRef.current = worker;

      await new Promise<void>((resolve, reject) => {
        worker.onmessage = (e) => {
          if (e.data.type === "ready") resolve();
          if (e.data.type === "error") reject(new Error(e.data.message));
        };
        worker.postMessage({ type: "init" });
      });

      setProgress((p) => ({ ...p, state: "extracting" }));

      // 5. Process frames
      let processedFrames = 0;

      for (let ms = 0; ms < durationMs; ms += SAMPLE_INTERVAL_MS) {
        if (cancelledRef.current) break;

        // Seek video to timestamp
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          video.currentTime = ms / 1000;
        });

        // Draw frame to canvas
        ctx.drawImage(video, 0, 0);
        const bitmap = await createImageBitmap(canvas);

        // Send to worker and wait for result
        const result = await new Promise<{ timestampMs: number; landmarks: any } | null>((resolve) => {
          worker.onmessage = (e) => {
            if (e.data.type === "result") {
              resolve({ timestampMs: e.data.timestampMs, landmarks: e.data.landmarks });
            } else if (e.data.type === "skip") {
              resolve(null);
            }
          };
          worker.postMessage({ type: "detect", bitmap, timestampMs: ms }, [bitmap]);
        });

        if (result) {
          batchRef.current.push(result);

          // Flush batch if full
          if (batchRef.current.length >= BATCH_SIZE) {
            setProgress((p) => ({ ...p, state: "uploading" }));
            await flushBatch(lessonId, version);
            setProgress((p) => ({ ...p, state: "extracting" }));
          }
        }

        processedFrames++;

        // Update progress
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const rate = processedFrames / elapsed;
        const remaining = totalFrames - processedFrames;
        const eta = rate > 0 ? Math.round(remaining / rate) : null;

        setProgress((p) => ({
          ...p,
          percent: Math.round((processedFrames / totalFrames) * 100),
          processedFrames,
          etaSeconds: eta,
        }));
      }

      // 6. Handle cancellation
      if (cancelledRef.current) {
        await failMutation.mutateAsync({ lessonId, version, error: "Cancelled by admin" });
        setProgress({ state: "cancelled", percent: 0, processedFrames: 0, totalFrames: 0, etaSeconds: null, error: null });
        cleanup();
        utils.admin.courseContent.list.invalidate();
        return;
      }

      // 7. Flush remaining batch
      if (batchRef.current.length > 0) {
        setProgress((p) => ({ ...p, state: "uploading" }));
        await flushBatch(lessonId, version);
      }

      // 8. Mark complete
      const totalKeypoints = uploadedCountRef.current;
      await completeMutation.mutateAsync({ lessonId, version, keypointCount: totalKeypoints });

      setProgress({ state: "complete", percent: 100, processedFrames: totalFrames, totalFrames, etaSeconds: 0, error: null });
      cleanup();
      utils.admin.courseContent.list.invalidate();
    } catch (e: any) {
      const errorMsg = e.message || "Unknown error";
      setProgress((p) => ({ ...p, state: "error", error: errorMsg }));

      try {
        const lesson = await startMutation.data;
        if (lesson?.version) {
          await failMutation.mutateAsync({ lessonId, version: lesson.version, error: errorMsg });
        }
      } catch {}

      cleanup();
      utils.admin.courseContent.list.invalidate();
    }
  }, [startMutation, uploadBatchMutation, completeMutation, failMutation, flushBatch, utils]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const cleanup = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.src = "";
      videoRef.current = null;
    }
    canvasRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setProgress({ state: "idle", percent: 0, processedFrames: 0, totalFrames: 0, etaSeconds: null, error: null });
  }, [cleanup]);

  return { progress, start, cancel, reset };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useKeypointExtraction.ts
git commit -m "feat(ai-coach): add useKeypointExtraction hook — video seeking, worker comms, batch upload"
```

---

### Task 6: Admin UI — Extraction Controls in Course Content Manager

**Files:**
- Modify: `client/src/pages/admin/CourseContentManager.tsx`

- [ ] **Step 1: Add extraction UI to each lesson row**

In `client/src/pages/admin/CourseContentManager.tsx`, find the lesson rendering section (around line 346-398). After the existing lesson row content (after the delete button, around line 396), add keypoint extraction UI.

Import the hook at the top:
```typescript
import { useKeypointExtraction } from "@/hooks/useKeypointExtraction";
```

Add `Brain` to the lucide-react import.

Create a small `KeypointExtractButton` component inside the file (or as a separate component):

```typescript
function KeypointExtractButton({ lesson }: { lesson: any }) {
  const { progress, start, cancel, reset } = useKeypointExtraction();
  const resetMutation = trpc.adminKeypoints.reset.useMutation({
    onSuccess: () => {
      utils.admin.courseContent.list.invalidate();
      toast.success("Keypoints cleared");
    },
  });
  const utils = trpc.useUtils();

  const isExtracting = progress.state === "extracting" || progress.state === "loading-model" || progress.state === "uploading";
  const estimatedMinutes = lesson.durationSeconds ? Math.ceil((lesson.durationSeconds / 60) * 0.7) : null;

  // Lesson already has keypoints from a previous session (stored in DB)
  if (lesson.keypointStatus === "complete" && progress.state === "idle") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
          ✅ {lesson.keypointCount} keypoints
        </span>
        <button
          onClick={() => {
            if (confirm("Re-extract keypoints? This will replace the existing data.")) {
              start(lesson.id);
            }
          }}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Re-extract
        </button>
      </div>
    );
  }

  // Failed from a previous session
  if (lesson.keypointStatus === "failed" && progress.state === "idle") {
    return (
      <button
        onClick={() => start(lesson.id)}
        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
      >
        ❌ Retry Extract
      </button>
    );
  }

  // Currently extracting
  if (isExtracting) {
    return (
      <div className="flex flex-col gap-1 min-w-[180px]">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="animate-pulse">⚡</span>
          <span>
            {progress.state === "loading-model" ? "Loading AI model..." :
             progress.state === "uploading" ? "Uploading batch..." :
             `Extracting... ${progress.percent}%`}
          </span>
          {progress.etaSeconds !== null && progress.etaSeconds > 0 && (
            <span>· ~{Math.ceil(progress.etaSeconds / 60)} min left</span>
          )}
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-300"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={cancel}
            className="text-[10px] text-red-500 hover:text-red-700 transition-colors"
          >
            Cancel
          </button>
          <span className="text-[10px] text-muted-foreground">⚠️ Keep tab open</span>
        </div>
      </div>
    );
  }

  // Complete (just finished in this session)
  if (progress.state === "complete") {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
        ✅ Extraction complete
      </span>
    );
  }

  // Error (just failed in this session)
  if (progress.state === "error") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
          ❌ {progress.error}
        </span>
        <button
          onClick={() => { reset(); start(lesson.id); }}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Idle — show extract button (only for ready videos)
  if (lesson.videoStatus !== "ready") return null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => {
          if (confirm(`Extract keypoints for "${lesson.title}"?\n\nThis takes about ${estimatedMinutes ?? "6–10"} minutes. Keep this tab open and use Chrome/Edge for best results.`)) {
            start(lesson.id);
          }
        }}
        className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border border-violet-300 text-violet-700 hover:bg-violet-50 transition-colors"
      >
        <Brain className="w-3 h-3" />
        Extract Keypoints
      </button>
      {estimatedMinutes && (
        <span className="text-[10px] text-muted-foreground">~{estimatedMinutes} min</span>
      )}
    </div>
  );
}
```

Then in the lesson row JSX (around line 388, after `{lesson.isFree && (...)}` and before `</div>` that closes the info section), add:

```tsx
<KeypointExtractButton lesson={lesson} />
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/admin/CourseContentManager.tsx
git commit -m "feat(ai-coach): add keypoint extraction UI to Course Content Manager"
```

---

### Task 7: Push Schema + Verify + Deploy

- [ ] **Step 1: Push schema to database**

Run: `npx drizzle-kit push`

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "keypoint|pose-worker|useKeypointExtraction|CourseContentManager" | head -20`

Fix any errors in the new files.

- [ ] **Step 3: Verify dev server starts**

Run: `npm run dev`

Navigate to the Course Content Manager in the admin panel. Verify:
- Lessons with ready videos show the "Extract Keypoints" button
- Lessons without ready videos don't show the button
- Clicking the button shows the confirmation dialog

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(ai-coach): Sub-project 1 compilation fixes"
```

- [ ] **Step 5: Deploy**

Run: `./deploy.sh`
