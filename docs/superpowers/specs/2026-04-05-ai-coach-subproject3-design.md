# AI Coach Sub-project 3: AI Feedback System

## Overview

While the student practices with Live Movement Coach enabled (Sub-project 2), the system collects comparison data and periodically sends it to Gemini 2.5 Flash to generate natural language coaching feedback in Elizabeth's voice — warm, encouraging, specific, and energetic. Feedback appears as elegant speech bubbles overlaid on the video. A session summary is saved to the DB when the student finishes.

**Key decisions:**
- Two feedback triggers: periodic summaries (every 90s of active dancing) + threshold alerts (when a body part stays red for 5s+)
- 20-second cooldown after periodic feedback, 30-second cooldown after threshold alerts — prevents overwhelming the student
- Non-dance detection via movement energy — suppresses scoring during talking-to-camera segments
- Speech bubble overlay with dismiss button, auto-dismiss after 10 seconds
- Session summary persisted to DB if at least 90 seconds of active coaching
- "Live Movement Coach" naming used consistently
- All feedback generation server-side (API key secure, rate-limited)

---

## Feedback Triggers

### Periodic Summary (every 90 seconds of active playback)

Accumulates comparison data over 90 seconds of **active dance time** (non-dance segments don't count toward the timer). When 90 seconds of active data is collected:

1. Compute: average score, score trend (improving/declining/stable), worst joint, best joint
2. Send to server: `aiCoach.generateFeedback({ type: "periodic", data: {...} })`
3. Server calls Gemini, returns 1-2 sentence feedback
4. Display in speech bubble

**Example Gemini input:**
```
The student just completed 90 seconds of practice.
Average score: 72%. Trend: improving.
Best joint: Hip Alignment (score 0.88).
Worst joint: Right Arm (score 0.41).
Lesson: "Beginner Heels Choreography — Section 2"
```

**Example output:**
"Love the progress — your hips are moving beautifully! Try relaxing your right arm and letting it flow with the movement. You'll feel the difference!"

### Threshold Alert (immediate, when a joint stays red for 5+ seconds)

Triggered when any single joint's score stays below 0.33 for 15+ consecutive comparison ticks (5 seconds at 3fps). Sends the specific joint name and duration to the server.

**Example Gemini input:**
```
The student's right knee has been significantly off for 7 seconds.
Current overall score: 58%.
Lesson: "Beginner Heels Choreography — Section 2"
```

**Example output:**
"Focus on that right knee — try bending it just a bit deeper, like you're settling into the heel. You've got this!"

### Cooldown

- **20-second cooldown** after periodic feedback, **30-second cooldown** after threshold alerts
- During cooldown, no new feedback is generated even if triggers fire
- Cooldown timer only counts active playback time (pausing doesn't tick the cooldown)
- The longer threshold cooldown prevents repetitive corrections about the same body part

### Rate Limiting

- Server-side: max 1 `generateFeedback` call per 15 seconds per user (tRPC middleware)
- Client-side: cooldown enforced before even making the API call
- Double protection prevents abuse and controls costs

---

## Non-Dance Detection

### Movement Energy Metric

Computed client-side from the teacher's reference keypoints. For each comparison tick:

1. Find the current reference keypoint and the one 1 second prior (~3 ticks back)
2. Compute average positional delta across all 33 landmarks:
   ```
   energy = avg(sqrt((x2-x1)² + (y2-y1)²)) for all landmarks
   ```
3. If `energy < 0.008` for 3+ consecutive seconds → segment is "non-dance" (teacher talking/standing still)
4. Threshold is forgiving — slow dance transitions (~0.01-0.02 energy) still count as dance. Only truly static poses (talking to camera, <0.008) suppress scoring.

**When non-dance is detected:**
- Score wheel fades to a dimmed state (opacity 40%) with "—" instead of a number
- Skeleton overlay hides
- Feedback accumulation pauses (timer doesn't tick)
- Score history is not recorded

**When dance resumes:**
- Score wheel returns to full opacity with live score
- Skeleton overlay reappears
- Feedback accumulation resumes

---

## Gemini Integration

### Server-side tRPC route

Feedback generation runs on the server to keep the API key secure.

**Route: `aiCoach.generateFeedback`**

```typescript
Input: {
  lessonId: number;
  type: "periodic" | "threshold" | "session_summary";
  data: {
    avgScore: number;
    scoreHistory?: number[];        // sampled scores (one per 3s for periodic)
    bestJoint?: string;
    worstJoint?: string;
    scoreTrend?: "improving" | "declining" | "stable";
    persistentIssue?: string;       // joint name for threshold alerts
    issueDurationSeconds?: number;
    lessonTitle: string;
    totalActiveSeconds?: number;    // for session summary
    feedbackCount?: number;         // for session summary
    topStrengths?: string[];        // for session summary
    topImprovements?: string[];     // for session summary
  };
}

Output: { feedback: string }
```

### System Prompt

Sent with every Gemini request:

```
You are Elizabeth, a warm, encouraging, and technically excellent high heels dance instructor. You're watching a student practice along with your lesson video in real time.

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

Never mention scores, percentages, numbers, AI, technology, or algorithms. Speak as if you're right there in the room watching them dance.
```

### User Prompt Templates

**Periodic:**
```
Generate a brief coaching comment (1-2 sentences) for a student who just completed {duration} seconds of practice.

Performance: {avgScore}% average. Trend: {scoreTrend}.
Best: {bestJoint}. Needs work: {worstJoint}.
Lesson: "{lessonTitle}"

Be encouraging and give one specific tip about their weakest area.
```

**Threshold:**
```
The student's {persistentIssue} has been off for {issueDurationSeconds} seconds during "{lessonTitle}".

Give a brief, encouraging correction (1 sentence) focused specifically on {persistentIssue}. Be warm and specific about what to adjust.
```

**Session summary:**
```
Summarize this practice session in 3-4 sentences.

Lesson: "{lessonTitle}"
Duration: {totalActiveSeconds} seconds of active practice
Average score: {avgScore}%
Best areas: {topStrengths}
Areas to improve: {topImprovements}
Feedback given: {feedbackCount} coaching tips during the session

Start with what went well, then suggest what to focus on next time. Be warm, specific, and motivating — make them excited to practice again.
```

---

## Speech Bubble UI

### Component: `AiCoachFeedback`

Positioned inside the video container, **top-left corner** (opposite from the score wheel).

**Layout:**
- Max width ~280px
- Glassmorphic: `bg-black/60 backdrop-blur-md rounded-2xl border border-[#E879F9]/20`
- Small header: "Elizabeth" label with sparkle icon, ~10px, `text-[#E879F9]`
- Feedback text: white, ~13px, leading-relaxed
- Dismiss button: small "×" in top-right corner, `text-white/40 hover:text-white/70`
- Positioned: `absolute top-3 left-3 z-20`

**Animation:**
- Entrance: fade-in + slide-down from top (Framer Motion, 300ms)
- Exit: fade-out (200ms)
- Auto-dismiss after 10 seconds
- Clicking "×" dismisses immediately

**Behavior:**
- Only one bubble visible at a time
- New feedback replaces the previous bubble (with exit → entrance animation)
- Hidden when Live Movement Coach is off
- Hidden during non-dance segments

### Non-dance indicator

When non-dance is detected (teacher talking), optionally show a subtle dimmed text in the score wheel area: "Listening..." in small white/40 text. This tells the student the system is aware and not broken.

---

## Session Summary

### Database: `ai_coach_sessions` (new table)

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| user_id | integer | FK → users, not null |
| lesson_id | integer | FK → course_lessons, not null |
| avg_score | integer | not null (0-100) |
| best_score | integer | not null (0-100) |
| worst_score | integer | not null (0-100) |
| total_active_seconds | integer | not null |
| feedback_count | integer | not null |
| top_strengths | jsonb | not null (array of joint names) |
| top_improvements | jsonb | not null (array of joint names) |
| summary | text | not null (Gemini-generated) |
| created_at | timestamp | not null, default now() |

Index on `(user_id, lesson_id)`.

### Save trigger

When the student toggles off Live Movement Coach, or navigates away from the lesson (component unmount with cleanup), **if they had at least 90 seconds of active coaching time**:

1. Client sends accumulated stats to server: `aiCoach.saveSession({ ... })`
2. Server calls Gemini for a session summary (richer prompt, 3-4 sentences)
3. Server saves the session row to DB
4. Client shows a brief toast: "Practice session saved!"

If under 90 seconds: no save, no API call, data discarded silently.

### tRPC route: `aiCoach.saveSession`

```typescript
Input: {
  lessonId: number;
  avgScore: number;
  bestScore: number;
  worstScore: number;
  totalActiveSeconds: number;
  feedbackCount: number;
  topStrengths: string[];
  topImprovements: string[];
  lessonTitle: string;
}

Output: { ok: boolean; summary: string }
```

Server generates the summary via Gemini, then inserts the row.

---

## Integration with useAiCoach (SP2 modifications)

### New exports from useAiCoach

The existing `useAiCoach` hook needs to expose additional data for the feedback system:

```typescript
// Added to AiCoachOutput:
{
  ...existing fields,
  movementEnergy: number;         // current movement energy (0-1)
  isDancing: boolean;             // true if movement energy above threshold
  accumulatedStats: {             // running stats for feedback triggers
    activeSeconds: number;
    scores: number[];             // one per 3 seconds
    jointScoreHistory: Map<string, number[]>;
    bestScore: number;
    worstScore: number;
    feedbackCount: number;
  } | null;
}
```

### New hook: useAiCoachFeedback

Separate hook that consumes `useAiCoach` output and manages feedback triggers:

```typescript
useAiCoachFeedback({
  lessonId: number;
  lessonTitle: string;
  score: number;
  jointScores: JointScore[];
  isDancing: boolean;
  isActive: boolean;
  enabled: boolean;
}) → {
  currentFeedback: string | null;
  dismissFeedback: () => void;
  isNonDance: boolean;
}
```

Internal logic:
- Maintains a 90-second active timer (pauses during non-dance, video pause)
- Tracks per-joint "red streak" counters for threshold detection
- Enforces 20-second cooldown between feedback calls
- Calls `trpc.aiCoach.generateFeedback` mutation when triggers fire
- Manages speech bubble state (current feedback text, auto-dismiss timer)

---

## File Structure

```
drizzle/schema.ts                            — add ai_coach_sessions table
server/db.ts                                 — add new imports
server/aiCoachDb.ts                          — DB functions for session CRUD
server/aiCoachRouter.ts                      — tRPC routes: generateFeedback, saveSession
server/routers.ts                            — mount aiCoach router
client/src/components/AiCoachFeedback.tsx     — speech bubble overlay
client/src/hooks/useAiCoachFeedback.ts        — feedback trigger logic, cooldown, accumulation
client/src/hooks/useAiCoach.ts                — add movementEnergy, isDancing, accumulatedStats
client/src/pages/CourseLearn.tsx               — integrate feedback bubble, session save on unmount
```

---

## Cost Estimate

- Gemini 2.5 Flash pricing: ~$0.15/M input tokens, ~$0.60/M output tokens
- Per feedback call: ~400 input tokens + ~60 output tokens = ~$0.0001
- Per 15min lesson (~8 periodic + ~4 threshold = ~12 calls): ~$0.0012
- Per session summary: ~600 tokens total = ~$0.0002
- **Per lesson session total: ~$0.0014**
- 100 students × 2 lessons/day: ~$0.28/day → **~$8.50/month**

---

## Privacy

- Only comparison scores and joint names sent to Gemini — no video, no camera data, no PII
- Session summaries tied to user_id, contain only coaching text and scores
- No student video or pose data persisted or transmitted
- Feedback text is ephemeral in-session; only the final summary is saved

---

## Dependencies

No new npm packages. Uses existing:
- Gemini 2.5 Flash via `GEMINI_API_KEY` (already configured)
- Framer Motion (for speech bubble animation)
- Sonner (for session saved toast)

---

## Out of Scope (Sub-project 3)

- Audio transcription of teacher speech (could enhance feedback context in future)
- Student progress dashboard showing coaching history over time
- Lesson-specific coaching presets or custom prompts per lesson
- Real-time voice feedback (text-to-speech of Elizabeth's coaching)
- Multiplayer/group coaching sessions
