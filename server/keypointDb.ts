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
