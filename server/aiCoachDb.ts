import { eq, and, desc } from "drizzle-orm";
import { getDb } from "./db";
import { aiCoachSessions, InsertAiCoachSession, AiCoachSession } from "../drizzle/schema";

/**
 * Insert a new AI Coach session summary.
 */
export async function insertSession(session: InsertAiCoachSession): Promise<AiCoachSession> {
  const db = await getDb();
  if (db) {
    try {
      const [inserted] = await db.insert(aiCoachSessions).values(session).returning();
      return inserted;
    } catch (e) {
      console.warn("[AI Coach] insertSession direct query failed, trying REST:", (e as Error).message);
    }
  }

  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("ai_coach_sessions")
    .insert({
      userId: session.userId,
      lessonId: session.lessonId,
      avgScore: session.avgScore,
      bestScore: session.bestScore,
      worstScore: session.worstScore,
      totalActiveSeconds: session.totalActiveSeconds,
      feedbackCount: session.feedbackCount,
      topStrengths: session.topStrengths,
      topImprovements: session.topImprovements,
      summary: session.summary,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as AiCoachSession;
}

/**
 * Get recent sessions for a user + lesson (for future progress tracking).
 */
export async function getSessionsForLesson(
  userId: number,
  lessonId: number,
  limit: number = 10
): Promise<AiCoachSession[]> {
  const db = await getDb();
  if (db) {
    try {
      return await db
        .select()
        .from(aiCoachSessions)
        .where(and(eq(aiCoachSessions.userId, userId), eq(aiCoachSessions.lessonId, lessonId)))
        .orderBy(desc(aiCoachSessions.createdAt))
        .limit(limit);
    } catch (e) {
      console.warn("[AI Coach] getSessionsForLesson direct query failed, trying REST:", (e as Error).message);
    }
  }

  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("ai_coach_sessions")
    .select("*")
    .eq("userId", userId)
    .eq("lessonId", lessonId)
    .order("createdAt", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as AiCoachSession[];
}
