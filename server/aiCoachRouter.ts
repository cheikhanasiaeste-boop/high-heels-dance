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
