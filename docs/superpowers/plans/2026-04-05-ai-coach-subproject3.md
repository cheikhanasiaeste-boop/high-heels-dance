# AI Coach Sub-project 3: AI Feedback System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gemini 2.5 Flash-powered coaching feedback to the Live Movement Coach — periodic summaries every 90s, threshold alerts when a body part stays off for 5s+, speech bubble overlay in Elizabeth's warm coaching voice, and session summary persistence.

**Architecture:** The `useAiCoachFeedback` hook consumes score data from `useAiCoach` (SP2), detects non-dance segments via movement energy, manages feedback triggers with cooldowns, calls a server-side tRPC mutation that invokes Gemini, and displays responses in a speech bubble overlay. On session end, accumulated stats are sent to the server for a Gemini-generated summary, saved to `ai_coach_sessions`.

**Tech Stack:** Gemini 2.5 Flash (via existing `GEMINI_API_KEY`), Drizzle ORM, tRPC, React, Framer Motion

**Spec:** `docs/superpowers/specs/2026-04-05-ai-coach-subproject3-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `drizzle/schema.ts` | Add `ai_coach_sessions` table |
| Modify | `server/db.ts` | Import new schema types |
| Create | `server/aiCoachDb.ts` | Session CRUD functions |
| Create | `server/aiCoachRouter.ts` | tRPC routes: generateFeedback, saveSession |
| Modify | `server/routers.ts` | Mount aiCoach router |
| Modify | `client/src/hooks/useAiCoach.ts` | Add movementEnergy, isDancing, accumulatedStats |
| Create | `client/src/hooks/useAiCoachFeedback.ts` | Feedback trigger logic, cooldowns, Gemini calls |
| Create | `client/src/components/AiCoachFeedback.tsx` | Speech bubble overlay component |
| Modify | `client/src/pages/CourseLearn.tsx` | Integrate feedback bubble, non-dance dimming, session save |

---

### Task 1: Database Schema — ai_coach_sessions Table

**Files:**
- Modify: `drizzle/schema.ts` (append after line 693)
- Modify: `server/db.ts` (add imports)

- [ ] **Step 1: Add ai_coach_sessions table to schema**

Append to `drizzle/schema.ts` after the `InsertStoreOrderItem` type export (line 693):

```typescript
/**
 * AI Coach sessions — saved practice session summaries
 */
export const aiCoachSessions = pgTable("ai_coach_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  lessonId: integer("lessonId").notNull(),
  avgScore: integer("avgScore").notNull(),
  bestScore: integer("bestScore").notNull(),
  worstScore: integer("worstScore").notNull(),
  totalActiveSeconds: integer("totalActiveSeconds").notNull(),
  feedbackCount: integer("feedbackCount").notNull(),
  topStrengths: jsonb("topStrengths").notNull(),
  topImprovements: jsonb("topImprovements").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userLessonIdx: index("ai_coach_user_lesson_idx").on(table.userId, table.lessonId),
}));

export type AiCoachSession = typeof aiCoachSessions.$inferSelect;
export type InsertAiCoachSession = typeof aiCoachSessions.$inferInsert;
```

- [ ] **Step 2: Add imports to server/db.ts**

Add to the import block from `"../drizzle/schema"`:

```typescript
  aiCoachSessions,
  AiCoachSession,
  InsertAiCoachSession,
```

- [ ] **Step 3: Commit**

```bash
git add drizzle/schema.ts server/db.ts
git commit -m "feat(ai-coach): add ai_coach_sessions table for practice session summaries"
```

---

### Task 2: AI Coach DB Functions

**Files:**
- Create: `server/aiCoachDb.ts`

- [ ] **Step 1: Create server/aiCoachDb.ts**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add server/aiCoachDb.ts
git commit -m "feat(ai-coach): add AI Coach session DB functions"
```

---

### Task 3: AI Coach tRPC Router — Gemini Feedback + Session Save

**Files:**
- Create: `server/aiCoachRouter.ts`
- Modify: `server/routers.ts`

- [ ] **Step 1: Create server/aiCoachRouter.ts**

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as aiCoachDb from "./aiCoachDb";

const ELIZABETH_SYSTEM_PROMPT = `You are Elizabeth, a warm, encouraging, and technically excellent high heels dance instructor. You're watching a student practice along with your lesson video in real time.

Your feedback style:
- Warm and genuinely enthusiastic — celebrate what's working ("Love that!" "Yes!" "Beautiful!")
- Specific and actionable — name the exact body part and what to adjust
- Brief — 1-2 sentences max for in-session feedback, the student is actively dancing
- Never harsh or discouraging — always frame corrections as positive adjustments
- Use dance terminology naturally but keep it accessible
- Bring real energy and excitement when the student is doing well
- Focus on hips, knees, and torso — these are the foundation of high heels dance
- Make the student feel like they have a supportive expert right there with them
- Use Elizabeth's warm, slightly playful energy when the student is doing well

Never mention scores, percentages, numbers, AI, technology, or algorithms. Speak as if you're right there in the room watching them dance.`;

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI Coach not configured" });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: 200 },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[AI Coach] Gemini error ${response.status}:`, errorText.slice(0, 200));
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI feedback generation failed" });
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
}

export const aiCoachRouter = router({
  generateFeedback: protectedProcedure
    .input(z.object({
      lessonId: z.number(),
      type: z.enum(["periodic", "threshold"]),
      data: z.object({
        avgScore: z.number(),
        scoreHistory: z.array(z.number()).optional(),
        bestJoint: z.string().optional(),
        worstJoint: z.string().optional(),
        scoreTrend: z.enum(["improving", "declining", "stable"]).optional(),
        persistentIssue: z.string().optional(),
        issueDurationSeconds: z.number().optional(),
        lessonTitle: z.string(),
      }),
    }))
    .mutation(async ({ input }) => {
      let userPrompt: string;

      if (input.type === "periodic") {
        userPrompt = `Generate a brief coaching comment (1-2 sentences) for a student who just completed 90 seconds of practice.

Performance: ${input.data.avgScore}% average. Trend: ${input.data.scoreTrend || "stable"}.
Best: ${input.data.bestJoint || "overall form"}. Needs work: ${input.data.worstJoint || "keep going"}.
Lesson: "${input.data.lessonTitle}"

Be encouraging and give one specific tip about their weakest area.`;
      } else {
        userPrompt = `The student's ${input.data.persistentIssue} has been off for ${input.data.issueDurationSeconds} seconds during "${input.data.lessonTitle}".

Give a brief, encouraging correction (1 sentence) focused specifically on ${input.data.persistentIssue}. Be warm and specific about what to adjust.`;
      }

      const feedback = await callGemini(ELIZABETH_SYSTEM_PROMPT, userPrompt);
      return { feedback: feedback.trim() };
    }),

  saveSession: protectedProcedure
    .input(z.object({
      lessonId: z.number(),
      avgScore: z.number(),
      bestScore: z.number(),
      worstScore: z.number(),
      totalActiveSeconds: z.number(),
      feedbackCount: z.number(),
      topStrengths: z.array(z.string()),
      topImprovements: z.array(z.string()),
      lessonTitle: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Generate session summary via Gemini
      const summaryPrompt = `Summarize this practice session in 3-4 sentences.

Lesson: "${input.lessonTitle}"
Duration: ${input.totalActiveSeconds} seconds of active practice
Average score: ${input.avgScore}%
Best areas: ${input.topStrengths.join(", ") || "overall form"}
Areas to improve: ${input.topImprovements.join(", ") || "keep practicing"}
Feedback given: ${input.feedbackCount} coaching tips during the session

Start with what went well, then suggest what to focus on next time. Be warm, specific, and motivating — make them excited to practice again.`;

      const summary = await callGemini(ELIZABETH_SYSTEM_PROMPT, summaryPrompt);

      const session = await aiCoachDb.insertSession({
        userId: ctx.user.id,
        lessonId: input.lessonId,
        avgScore: input.avgScore,
        bestScore: input.bestScore,
        worstScore: input.worstScore,
        totalActiveSeconds: input.totalActiveSeconds,
        feedbackCount: input.feedbackCount,
        topStrengths: input.topStrengths,
        topImprovements: input.topImprovements,
        summary: summary.trim(),
      });

      return { ok: true, summary: session.summary };
    }),
});
```

- [ ] **Step 2: Mount in server/routers.ts**

Add import after the keypointRouter import:
```typescript
import { aiCoachRouter } from "./aiCoachRouter";
```

Add to `appRouter` before the closing `});`:
```typescript
  aiCoach: aiCoachRouter,
```

- [ ] **Step 3: Commit**

```bash
git add server/aiCoachRouter.ts server/routers.ts
git commit -m "feat(ai-coach): add Gemini feedback generation + session save tRPC routes"
```

---

### Task 4: Movement Energy Detection — Modify useAiCoach

**Files:**
- Modify: `client/src/hooks/useAiCoach.ts`

- [ ] **Step 1: Add movement energy, isDancing, and accumulatedStats to useAiCoach**

This task modifies the existing `useAiCoach` hook to:

1. **Compute movement energy** from teacher reference keypoints (average positional delta between current and ~1s-prior reference frames)
2. **Expose `isDancing`** boolean (true when energy >= 0.008 for recent frames)
3. **Expose `accumulatedStats`** for the feedback hook to consume

Add new state after existing state declarations (around line 30):

```typescript
  const [movementEnergy, setMovementEnergy] = useState(0);
  const [isDancing, setIsDancing] = useState(true);
  const nonDanceCountRef = useRef(0); // consecutive low-energy ticks
  const accumulatedStatsRef = useRef({
    activeSeconds: 0,
    scores: [] as number[],
    jointScoreHistory: new Map<string, number[]>(),
    bestScore: 0,
    worstScore: 100,
    feedbackCount: 0,
    lastScoreSampleTime: 0,
  });
```

Inside the analysis loop's `setInterval` callback (around line 142), BEFORE the webcam frame capture, add movement energy computation:

```typescript
        // Compute movement energy from teacher reference keypoints
        const currentRef = findClosestKeypoint(keypointsRef.current, currentMs);
        const prevRef = findClosestKeypoint(keypointsRef.current, currentMs - 1000);

        if (currentRef && prevRef) {
          let totalDelta = 0;
          for (let i = 0; i < Math.min(currentRef.length, prevRef.length); i++) {
            const dx = currentRef[i].x - prevRef[i].x;
            const dy = currentRef[i].y - prevRef[i].y;
            totalDelta += Math.sqrt(dx * dx + dy * dy);
          }
          const energy = totalDelta / 33;
          setMovementEnergy(energy);

          if (energy < 0.008) {
            nonDanceCountRef.current++;
          } else {
            nonDanceCountRef.current = 0;
          }

          const dancing = nonDanceCountRef.current < 9; // 3 seconds at 3fps
          setIsDancing(dancing);

          // Skip comparison if not dancing
          if (!dancing) return;
        }
```

After the comparison result (where `setScore` and `setJointScores` are called), add stats accumulation:

```typescript
              // Accumulate stats for feedback system
              const stats = accumulatedStatsRef.current;
              stats.activeSeconds += SAMPLE_INTERVAL_MS / 1000;
              stats.bestScore = Math.max(stats.bestScore, result.score);
              stats.worstScore = Math.min(stats.worstScore, result.score);

              // Sample score every 3 seconds
              if (stats.activeSeconds - stats.lastScoreSampleTime >= 3) {
                stats.scores.push(result.score);
                stats.lastScoreSampleTime = stats.activeSeconds;
              }

              // Track per-joint scores
              for (const js of result.jointScores) {
                const history = stats.jointScoreHistory.get(js.name) || [];
                history.push(js.score);
                stats.jointScoreHistory.set(js.name, history);
              }
```

Update the return to include new fields:

```typescript
  return {
    score, jointScores, studentLandmarks, isReady, isActive, error,
    movementEnergy, isDancing,
    accumulatedStats: accumulatedStatsRef.current,
    incrementFeedbackCount: () => { accumulatedStatsRef.current.feedbackCount++; },
  };
```

Update the `AiCoachOutput` interface to match:

```typescript
interface AiCoachOutput {
  score: number;
  jointScores: JointScore[];
  studentLandmarks: Landmark[] | null;
  isReady: boolean;
  isActive: boolean;
  error: string | null;
  movementEnergy: number;
  isDancing: boolean;
  accumulatedStats: {
    activeSeconds: number;
    scores: number[];
    jointScoreHistory: Map<string, number[]>;
    bestScore: number;
    worstScore: number;
    feedbackCount: number;
    lastScoreSampleTime: number;
  };
  incrementFeedbackCount: () => void;
}
```

Reset `accumulatedStatsRef` in the cleanup function and the disable effect.

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useAiCoach.ts
git commit -m "feat(ai-coach): add movement energy detection, isDancing, accumulatedStats to useAiCoach"
```

---

### Task 5: Feedback Trigger Hook — useAiCoachFeedback

**Files:**
- Create: `client/src/hooks/useAiCoachFeedback.ts`

- [ ] **Step 1: Create the feedback orchestration hook**

```typescript
import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import type { JointScore } from "@/lib/pose-comparison";

const PERIODIC_INTERVAL_S = 90; // seconds of active dance time
const THRESHOLD_RED_TICKS = 15; // 5 seconds at 3fps
const COOLDOWN_PERIODIC_S = 20;
const COOLDOWN_THRESHOLD_S = 30;
const AUTO_DISMISS_MS = 10000;

interface FeedbackInput {
  lessonId: number;
  lessonTitle: string;
  score: number;
  jointScores: JointScore[];
  isDancing: boolean;
  isActive: boolean;
  enabled: boolean;
  onFeedbackGenerated: () => void; // increment feedback count
}

interface FeedbackOutput {
  currentFeedback: string | null;
  dismissFeedback: () => void;
  isNonDance: boolean;
}

export function useAiCoachFeedback({
  lessonId, lessonTitle, score, jointScores, isDancing, isActive, enabled, onFeedbackGenerated,
}: FeedbackInput): FeedbackOutput {
  const [currentFeedback, setCurrentFeedback] = useState<string | null>(null);
  const [isNonDance, setIsNonDance] = useState(false);

  const activeTimerRef = useRef(0); // seconds of active dance since last periodic
  const cooldownRef = useRef(0); // seconds remaining in cooldown
  const redStreaksRef = useRef(new Map<string, number>()); // joint name → consecutive red ticks
  const dismissTimerRef = useRef<number | null>(null);
  const tickIntervalRef = useRef<number | null>(null);

  const generateFeedback = trpc.aiCoach.generateFeedback.useMutation();

  const dismissFeedback = useCallback(() => {
    setCurrentFeedback(null);
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const showFeedback = useCallback((text: string) => {
    setCurrentFeedback(text);
    // Auto-dismiss after 10 seconds
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = window.setTimeout(() => {
      setCurrentFeedback(null);
      dismissTimerRef.current = null;
    }, AUTO_DISMISS_MS);
  }, []);

  // Main tick — runs every 333ms (same as analysis loop) when active
  useEffect(() => {
    if (!enabled || !isActive) {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
      return;
    }

    tickIntervalRef.current = window.setInterval(() => {
      const tickSeconds = 0.333;

      // Update non-dance state
      setIsNonDance(!isDancing);

      // Don't accumulate during non-dance segments
      if (!isDancing) return;

      // Tick cooldown
      if (cooldownRef.current > 0) {
        cooldownRef.current = Math.max(0, cooldownRef.current - tickSeconds);
      }

      // Accumulate active time
      activeTimerRef.current += tickSeconds;

      // --- Threshold detection ---
      if (cooldownRef.current <= 0) {
        for (const js of jointScores) {
          const streak = redStreaksRef.current.get(js.name) || 0;
          if (js.score < 0.33) {
            const newStreak = streak + 1;
            redStreaksRef.current.set(js.name, newStreak);

            if (newStreak >= THRESHOLD_RED_TICKS) {
              // Fire threshold alert
              const durationSec = Math.round(newStreak / 3);
              generateFeedback.mutate(
                {
                  lessonId,
                  type: "threshold",
                  data: {
                    avgScore: score,
                    persistentIssue: js.name,
                    issueDurationSeconds: durationSec,
                    lessonTitle,
                  },
                },
                {
                  onSuccess: (result) => {
                    showFeedback(result.feedback);
                    onFeedbackGenerated();
                  },
                }
              );
              cooldownRef.current = COOLDOWN_THRESHOLD_S;
              redStreaksRef.current.set(js.name, 0); // reset streak
              return; // one alert at a time
            }
          } else {
            redStreaksRef.current.set(js.name, 0);
          }
        }
      }

      // --- Periodic summary ---
      if (activeTimerRef.current >= PERIODIC_INTERVAL_S && cooldownRef.current <= 0) {
        // Compute trend from recent scores
        // (scores are accumulated in useAiCoach's accumulatedStats — we derive trend from score)
        const trend = "stable"; // simplified for v1: could compare first/second half averages

        // Find best/worst joints from current jointScores
        let bestJoint = "overall form";
        let worstJoint = "keep going";
        let bestScore = 0;
        let worstScore = 1;
        for (const js of jointScores) {
          if (js.score > bestScore) { bestScore = js.score; bestJoint = js.name; }
          if (js.score < worstScore) { worstScore = js.score; worstJoint = js.name; }
        }

        generateFeedback.mutate(
          {
            lessonId,
            type: "periodic",
            data: {
              avgScore: score,
              bestJoint,
              worstJoint,
              scoreTrend: trend,
              lessonTitle,
            },
          },
          {
            onSuccess: (result) => {
              showFeedback(result.feedback);
              onFeedbackGenerated();
            },
          }
        );

        activeTimerRef.current = 0; // reset timer
        cooldownRef.current = COOLDOWN_PERIODIC_S;
      }
    }, 333);

    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    };
  }, [enabled, isActive, isDancing, score, jointScores, lessonId, lessonTitle, generateFeedback, showFeedback, onFeedbackGenerated]);

  // Reset on disable
  useEffect(() => {
    if (!enabled) {
      setCurrentFeedback(null);
      setIsNonDance(false);
      activeTimerRef.current = 0;
      cooldownRef.current = 0;
      redStreaksRef.current.clear();
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    }
  }, [enabled]);

  return { currentFeedback, dismissFeedback, isNonDance };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useAiCoachFeedback.ts
git commit -m "feat(ai-coach): add useAiCoachFeedback hook — triggers, cooldowns, Gemini calls"
```

---

### Task 6: Speech Bubble Component

**Files:**
- Create: `client/src/components/AiCoachFeedback.tsx`

- [ ] **Step 1: Create the speech bubble overlay**

```typescript
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";

interface AiCoachFeedbackProps {
  feedback: string | null;
  onDismiss: () => void;
  isNonDance: boolean;
}

export function AiCoachFeedback({ feedback, onDismiss, isNonDance }: AiCoachFeedbackProps) {
  return (
    <>
      {/* Non-dance indicator */}
      {isNonDance && !feedback && (
        <div className="absolute top-3 left-3 z-20 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm">
          <span className="text-[11px] text-white/40 italic">Listening...</span>
        </div>
      )}

      {/* Feedback speech bubble */}
      <AnimatePresence mode="wait">
        {feedback && (
          <motion.div
            key={feedback}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="absolute top-3 left-3 z-20 max-w-[280px] bg-black/60 backdrop-blur-md rounded-2xl border border-[#E879F9]/20 p-3 pr-8"
          >
            {/* Header */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3 h-3 text-[#E879F9]" />
              <span className="text-[10px] font-medium text-[#E879F9]">Elizabeth</span>
            </div>

            {/* Feedback text */}
            <p className="text-[13px] text-white/90 leading-relaxed">
              {feedback}
            </p>

            {/* Dismiss button */}
            <button
              onClick={onDismiss}
              className="absolute top-2 right-2 p-1 text-white/30 hover:text-white/60 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/AiCoachFeedback.tsx
git commit -m "feat(ai-coach): add speech bubble feedback overlay component"
```

---

### Task 7: Integration into CourseLearn.tsx

**Files:**
- Modify: `client/src/pages/CourseLearn.tsx`

- [ ] **Step 1: Add imports**

Add to the existing AI Coach imports at the top of `CourseLearn.tsx`:

```typescript
import { useAiCoachFeedback } from "@/hooks/useAiCoachFeedback";
import { AiCoachFeedback } from "@/components/AiCoachFeedback";
```

- [ ] **Step 2: Wire up the feedback hook**

After the existing `useAiCoach` destructure (around line 268), add:

```typescript
const { currentFeedback, dismissFeedback, isNonDance } = useAiCoachFeedback({
  lessonId: currentLessonId || 0,
  lessonTitle: currentLesson?.title || "",
  score,
  jointScores,
  isDancing,
  isActive,
  enabled: aiCoachEnabled && hasKeypoints,
  onFeedbackGenerated: incrementFeedbackCount,
});
```

Update the `useAiCoach` destructure to include the new fields:

```typescript
const { score, jointScores, studentLandmarks, isReady, isActive, error: aiCoachError, isDancing, movementEnergy, accumulatedStats, incrementFeedbackCount } = useAiCoach({
  lessonId: currentLessonId || 0,
  videoElement: videoRef.current,
  enabled: aiCoachEnabled && hasKeypoints,
});
```

- [ ] **Step 3: Add feedback bubble to video container**

In the video container's `<div className="relative">` (around line 398), add the feedback bubble alongside existing overlays:

```tsx
{aiCoachEnabled && isReady && (
  <AiCoachFeedback
    feedback={currentFeedback}
    onDismiss={dismissFeedback}
    isNonDance={isNonDance && isActive}
  />
)}
```

- [ ] **Step 4: Dim score wheel during non-dance**

Update the ScoreWheel rendering to pass non-dance state. Modify the AiCoachScoreWheel usage:

```tsx
{aiCoachEnabled && isReady && (
  <div className={`transition-opacity duration-500 ${isNonDance && isActive ? "opacity-40" : "opacity-100"}`}>
    <AiCoachScoreWheel score={isNonDance && isActive ? -1 : score} />
  </div>
)}
```

Then in `AiCoachScoreWheel.tsx`, handle -1 as "display dash":

Add to the component: if `score === -1`, show "—" instead of the number and use a neutral stroke color.

- [ ] **Step 5: Add session save on unmount/disable**

Add a `saveSession` mutation and trigger it when the coach is disabled:

```typescript
const saveSessionMutation = trpc.aiCoach.saveSession.useMutation({
  onSuccess: (data) => {
    toast.success("Practice session saved!");
  },
});

// Save session when coach is disabled (if enough active time)
const prevEnabledRef = useRef(false);
useEffect(() => {
  if (prevEnabledRef.current && !aiCoachEnabled && accumulatedStats.activeSeconds >= 90) {
    // Find top strengths/improvements from joint score history
    const strengths: string[] = [];
    const improvements: string[] = [];
    accumulatedStats.jointScoreHistory.forEach((scores, name) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg >= 0.67) strengths.push(name);
      else if (avg < 0.33) improvements.push(name);
    });

    saveSessionMutation.mutate({
      lessonId: currentLessonId || 0,
      avgScore: Math.round(accumulatedStats.scores.reduce((a, b) => a + b, 0) / Math.max(accumulatedStats.scores.length, 1)),
      bestScore: accumulatedStats.bestScore,
      worstScore: accumulatedStats.worstScore,
      totalActiveSeconds: Math.round(accumulatedStats.activeSeconds),
      feedbackCount: accumulatedStats.feedbackCount,
      topStrengths: strengths.slice(0, 3),
      topImprovements: improvements.slice(0, 3),
      lessonTitle: currentLesson?.title || "",
    });
  }
  prevEnabledRef.current = aiCoachEnabled;
}, [aiCoachEnabled]);
```

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/CourseLearn.tsx client/src/components/AiCoachScoreWheel.tsx
git commit -m "feat(ai-coach): integrate feedback bubble, non-dance dimming, session save into lesson player"
```

---

### Task 8: Push Schema + Verify + Deploy

- [ ] **Step 1: Push schema**

Run: `npx drizzle-kit push`

- [ ] **Step 2: Check TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep -E "aiCoach|AiCoachFeedback|useAiCoachFeedback|aiCoachRouter|aiCoachDb" | head -20`

Fix any errors.

- [ ] **Step 3: Verify dev server**

Run: `npm run dev`

Test the full flow:
1. Navigate to a lesson with extracted keypoints
2. Enable "Live Movement Coach" toggle
3. Play video → score wheel shows, skeleton renders
4. After ~90s of dancing → first periodic feedback appears in speech bubble
5. Speech bubble auto-dismisses after 10s, or click × to dismiss
6. If a joint stays red for 5+s → threshold alert appears
7. During non-dance segments → score wheel dims, shows "Listening..."
8. Toggle off → session saved toast appears (if >90s active)

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(ai-coach): Sub-project 3 compilation fixes"
```

- [ ] **Step 5: Deploy**

Run: `./deploy.sh`
