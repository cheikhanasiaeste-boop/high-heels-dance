# AI Coach Sub-project 2: Real-Time Analysis Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time pose comparison to the lesson player — students enable "Live Movement Coach", their webcam runs MediaPipe Pose, and a score wheel + color-coded skeleton shows how well they match the teacher's pre-extracted reference keypoints.

**Architecture:** When the toggle is enabled, the `useAiCoach` hook requests camera access, spawns the same pose-worker from SP1, loads reference keypoints in 30s chunks, and runs a 3fps comparison loop synced to video playback. Pure comparison math (joint angle similarity) runs on the main thread. Score and skeleton rendering are lightweight React components overlaid on the video container. Everything pauses when the video pauses.

**Tech Stack:** MediaPipe Tasks Vision (reused from SP1), Canvas API, React, CSS transitions

**Spec:** `docs/superpowers/specs/2026-04-05-ai-coach-subproject2-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `client/src/lib/pose-comparison.ts` | Pure functions: joint angle calc, scoring, color assignment |
| Create | `client/src/hooks/useAiCoach.ts` | Orchestrates camera, worker, keypoint loading, comparison loop |
| Create | `client/src/components/AiCoachToggle.tsx` | "Live Movement Coach" pill toggle |
| Create | `client/src/components/AiCoachScoreWheel.tsx` | SVG circular percentage gauge |
| Create | `client/src/components/AiCoachSkeleton.tsx` | Canvas-based skeleton visualization |
| Modify | `client/src/components/HlsPlayer.tsx` | Expose video element ref via forwardRef |
| Modify | `client/src/pages/CourseLearn.tsx` | Integrate toggle, overlays, hook into lesson player |

---

### Task 1: Pose Comparison Library

**Files:**
- Create: `client/src/lib/pose-comparison.ts`

- [ ] **Step 1: Create the pure comparison functions**

Create `client/src/lib/pose-comparison.ts`:

```typescript
/**
 * Pose comparison — joint angle similarity scoring for AI Coach.
 * All functions are pure (no side effects, no DOM, no network).
 */

// MediaPipe Pose landmark indices
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

export interface Point {
  x: number;
  y: number;
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
  v: number; // visibility
}

export interface JointScore {
  name: string;
  score: number; // 0-1
  color: string; // hex color
  indices: [number, number, number]; // landmark indices for skeleton drawing
}

// Joint triplets with weights — hips/knees/torso weighted 2x for dance
const JOINT_TRIPLETS: Array<{
  name: string;
  indices: [number, number, number];
  weight: number;
}> = [
  { name: "Left Arm", indices: [LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST], weight: 1.0 },
  { name: "Right Arm", indices: [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST], weight: 1.0 },
  { name: "Left Leg", indices: [LEFT_HIP, LEFT_KNEE, LEFT_ANKLE], weight: 2.0 },
  { name: "Right Leg", indices: [RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE], weight: 2.0 },
  { name: "Left Torso", indices: [LEFT_SHOULDER, LEFT_HIP, LEFT_KNEE], weight: 2.0 },
  { name: "Right Torso", indices: [RIGHT_SHOULDER, RIGHT_HIP, RIGHT_KNEE], weight: 2.0 },
  { name: "Left Upper", indices: [LEFT_ELBOW, LEFT_SHOULDER, LEFT_HIP], weight: 1.5 },
  { name: "Right Upper", indices: [RIGHT_ELBOW, RIGHT_SHOULDER, RIGHT_HIP], weight: 1.5 },
  { name: "Hip Align", indices: [LEFT_HIP, -1, RIGHT_HIP], weight: 2.0 }, // -1 = midpoint
  { name: "Shoulder Align", indices: [LEFT_SHOULDER, -1, RIGHT_SHOULDER], weight: 1.5 },
];

const TOTAL_WEIGHT = JOINT_TRIPLETS.reduce((sum, j) => sum + j.weight, 0); // 16.5

const COLOR_GREEN = "#22C55E";
const COLOR_AMBER = "#F59E0B";
const COLOR_RED = "#F43F5E";

/**
 * Calculate angle at point B in the triangle A-B-C.
 * Returns angle in degrees (0-360).
 */
function jointAngleDeg(a: Point, b: Point, c: Point): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const cross = ba.x * bc.x + ba.y * bc.y; // intentionally use dot for magnitude calc
  const angleRad = Math.atan2(
    ba.x * bc.y - ba.y * bc.x,
    ba.x * bc.x + ba.y * bc.y
  );
  return angleRad * (180 / Math.PI);
}

/**
 * Get the midpoint between two landmarks.
 */
function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    v: Math.min(a.v, b.v),
  };
}

/**
 * Compute the angular difference, handling wraparound.
 * Returns a value in [0, 180].
 */
function angleDiff(deg1: number, deg2: number): number {
  let diff = Math.abs(deg1 - deg2) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Score a single joint (0-1). 45° tolerance = 0 score.
 */
function scoreJoint(studentAngle: number, teacherAngle: number): number {
  const diff = angleDiff(studentAngle, teacherAngle);
  return Math.max(0, 1 - diff / 45);
}

/**
 * Get color for a joint score.
 */
export function jointColor(score: number): string {
  if (score >= 0.67) return COLOR_GREEN;
  if (score >= 0.33) return COLOR_AMBER;
  return COLOR_RED;
}

/**
 * Resolve a triplet's landmarks, handling midpoint indices (-1).
 */
function resolveTriplet(
  landmarks: Landmark[],
  indices: [number, number, number]
): [Point, Point, Point] {
  const [ai, bi, ci] = indices;
  const a = landmarks[ai];
  const c = landmarks[ci];
  const b = bi === -1 ? midpoint(landmarks[ai], landmarks[ci]) : landmarks[bi];
  return [a, b, c];
}

/**
 * Compare student pose against teacher reference.
 * Returns overall score (0-100) and per-joint scores.
 */
export function comparePoses(
  student: Landmark[],
  teacher: Landmark[]
): { score: number; jointScores: JointScore[] } {
  if (student.length < 33 || teacher.length < 33) {
    return { score: 0, jointScores: [] };
  }

  let weightedSum = 0;
  const jointScores: JointScore[] = [];

  for (const triplet of JOINT_TRIPLETS) {
    const [sa, sb, sc] = resolveTriplet(student, triplet.indices);
    const [ta, tb, tc] = resolveTriplet(teacher, triplet.indices);

    const studentAngle = jointAngleDeg(sa, sb, sc);
    const teacherAngle = jointAngleDeg(ta, tb, tc);
    const score = scoreJoint(studentAngle, teacherAngle);

    weightedSum += score * triplet.weight;
    jointScores.push({
      name: triplet.name,
      score,
      color: jointColor(score),
      indices: triplet.indices,
    });
  }

  const overallScore = Math.round((weightedSum / TOTAL_WEIGHT) * 100);
  return { score: overallScore, jointScores };
}

/**
 * Binary search for the closest reference keypoint to a given timestamp.
 */
export function findClosestKeypoint(
  keypoints: Array<{ timestampMs: number; landmarks: Landmark[] }>,
  targetMs: number,
  maxDistanceMs: number = 500
): Landmark[] | null {
  if (keypoints.length === 0) return null;

  let lo = 0;
  let hi = keypoints.length - 1;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (keypoints[mid].timestampMs < targetMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // Check lo and lo-1 for closest
  let closest = keypoints[lo];
  if (lo > 0) {
    const prev = keypoints[lo - 1];
    if (Math.abs(prev.timestampMs - targetMs) < Math.abs(closest.timestampMs - targetMs)) {
      closest = prev;
    }
  }

  if (Math.abs(closest.timestampMs - targetMs) > maxDistanceMs) return null;
  return closest.landmarks;
}

/**
 * Skeleton connection map — pairs of landmark indices to draw lines between.
 * Used by AiCoachSkeleton to render the stick figure.
 */
export const SKELETON_CONNECTIONS: [number, number][] = [
  // Torso
  [LEFT_SHOULDER, RIGHT_SHOULDER],
  [LEFT_SHOULDER, LEFT_HIP],
  [RIGHT_SHOULDER, RIGHT_HIP],
  [LEFT_HIP, RIGHT_HIP],
  // Left arm
  [LEFT_SHOULDER, LEFT_ELBOW],
  [LEFT_ELBOW, LEFT_WRIST],
  // Right arm
  [RIGHT_SHOULDER, RIGHT_ELBOW],
  [RIGHT_ELBOW, RIGHT_WRIST],
  // Left leg
  [LEFT_HIP, LEFT_KNEE],
  [LEFT_KNEE, LEFT_ANKLE],
  // Right leg
  [RIGHT_HIP, RIGHT_KNEE],
  [RIGHT_KNEE, RIGHT_ANKLE],
];

/**
 * Map a skeleton connection to its color based on the joint scores.
 * A connection inherits the worst score of its two endpoints' joints.
 */
export function connectionColor(
  a: number,
  b: number,
  jointScores: JointScore[]
): string {
  // Find any joint that involves these landmarks
  let worstScore = 1;
  for (const js of jointScores) {
    const [i, _m, k] = js.indices;
    if (i === a || i === b || k === a || k === b) {
      worstScore = Math.min(worstScore, js.score);
    }
  }
  return jointColor(worstScore);
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/lib/pose-comparison.ts
git commit -m "feat(ai-coach): add pose comparison library — joint angles, scoring, skeleton connections"
```

---

### Task 2: Expose Video Element Ref from HlsPlayer

**Files:**
- Modify: `client/src/components/HlsPlayer.tsx`

- [ ] **Step 1: Convert HlsPlayer to forwardRef**

The `useAiCoach` hook needs access to the underlying `<video>` element to listen for play/pause/seeked events and read `currentTime`.

Modify `client/src/components/HlsPlayer.tsx`:

1. Add `forwardRef` and `useImperativeHandle` to the React import
2. Add a ref type for the video element
3. Wrap the component in `forwardRef`
4. Expose the video element via the ref

Change the component signature from:
```typescript
export function HlsPlayer({
  src, type, poster, initialTime, onTimeUpdate, onEnded, className = "",
}: HlsPlayerProps) {
```

To:
```typescript
export const HlsPlayer = forwardRef<HTMLVideoElement, HlsPlayerProps>(function HlsPlayer({
  src, type, poster, initialTime, onTimeUpdate, onEnded, className = "",
}, ref) {
```

Add `useImperativeHandle` after the existing `videoRef`:
```typescript
  useImperativeHandle(ref, () => videoRef.current!, []);
```

Close with `});` instead of `}`.

This is a backward-compatible change — existing callers that don't pass a ref will work identically.

- [ ] **Step 2: Commit**

```bash
git add client/src/components/HlsPlayer.tsx
git commit -m "feat(ai-coach): expose video element ref from HlsPlayer via forwardRef"
```

---

### Task 3: useAiCoach Hook

**Files:**
- Create: `client/src/hooks/useAiCoach.ts`

- [ ] **Step 1: Create the orchestration hook**

Create `client/src/hooks/useAiCoach.ts`:

```typescript
import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { comparePoses, findClosestKeypoint, type Landmark, type JointScore } from "@/lib/pose-comparison";

const SAMPLE_INTERVAL_MS = 333; // 3fps
const CHUNK_DURATION_MS = 30000; // 30 seconds
const PREFETCH_THRESHOLD = 0.5; // prefetch next chunk at 50% through current

interface AiCoachInput {
  lessonId: number;
  videoElement: HTMLVideoElement | null;
  enabled: boolean;
}

interface AiCoachOutput {
  score: number;
  jointScores: JointScore[];
  studentLandmarks: Landmark[] | null;
  isReady: boolean;
  isActive: boolean;
  error: string | null;
}

export function useAiCoach({ lessonId, videoElement, enabled }: AiCoachInput): AiCoachOutput {
  const [score, setScore] = useState(0);
  const [jointScores, setJointScores] = useState<JointScore[]>([]);
  const [studentLandmarks, setStudentLandmarks] = useState<Landmark[] | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const keypointsRef = useRef<Array<{ timestampMs: number; landmarks: Landmark[] }>>([]);
  const chunkStartRef = useRef(0);
  const chunkEndRef = useRef(0);
  const fetchingChunkRef = useRef(false);

  const utils = trpc.useUtils();

  // Fetch a chunk of reference keypoints
  const fetchChunk = useCallback(async (fromMs: number, toMs: number) => {
    if (fetchingChunkRef.current) return;
    fetchingChunkRef.current = true;
    try {
      const data = await utils.keypoints.getChunk.fetch({ lessonId, fromMs, toMs });
      // Append to cache, keeping sorted
      const existing = keypointsRef.current.filter(
        (kp) => kp.timestampMs < fromMs || kp.timestampMs > toMs
      );
      const merged = [...existing, ...data].sort((a, b) => a.timestampMs - b.timestampMs);
      keypointsRef.current = merged;
      chunkEndRef.current = Math.max(chunkEndRef.current, toMs);
    } catch (e) {
      console.warn("[AI Coach] Failed to fetch keypoints chunk:", e);
    } finally {
      fetchingChunkRef.current = false;
    }
  }, [lessonId, utils]);

  // Initialize camera + worker when enabled
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function init() {
      try {
        // Request camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        cameraStreamRef.current = stream;

        // Create hidden video element for camera
        const camVideo = document.createElement("video");
        camVideo.srcObject = stream;
        camVideo.muted = true;
        camVideo.playsInline = true;
        await camVideo.play();
        cameraVideoRef.current = camVideo;

        // Create canvas for frame capture
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        canvasRef.current = canvas;

        // Create worker
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

        if (cancelled) { cleanup(); return; }

        // Fetch initial keypoint chunk
        await fetchChunk(0, CHUNK_DURATION_MS);
        chunkStartRef.current = 0;

        setIsReady(true);
        setError(null);
      } catch (e: any) {
        if (!cancelled) {
          const msg = e.name === "NotAllowedError"
            ? "Camera access required for Live Movement Coach"
            : e.message || "Failed to initialize AI Coach";
          setError(msg);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [enabled, fetchChunk]);

  // Analysis loop — runs when video is playing + enabled + ready
  useEffect(() => {
    if (!enabled || !isReady || !videoElement) return;

    const startLoop = () => {
      if (intervalRef.current) return;
      setIsActive(true);

      intervalRef.current = window.setInterval(() => {
        if (!cameraVideoRef.current || !canvasRef.current || !workerRef.current || !videoElement) return;
        if (videoElement.paused || videoElement.ended) return;

        const currentMs = videoElement.currentTime * 1000;

        // Prefetch next chunk if needed
        const chunkProgress = (currentMs - chunkStartRef.current) / CHUNK_DURATION_MS;
        if (chunkProgress > PREFETCH_THRESHOLD && chunkEndRef.current < currentMs + CHUNK_DURATION_MS) {
          const nextFrom = chunkEndRef.current;
          const nextTo = nextFrom + CHUNK_DURATION_MS;
          fetchChunk(nextFrom, nextTo);
        }

        // Prune old keypoints (more than 30s behind)
        keypointsRef.current = keypointsRef.current.filter(
          (kp) => kp.timestampMs > currentMs - CHUNK_DURATION_MS
        );

        // Capture webcam frame
        const ctx = canvasRef.current.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(cameraVideoRef.current, 0, 0, 640, 480);

        createImageBitmap(canvasRef.current).then((bitmap) => {
          if (!workerRef.current) { bitmap.close(); return; }

          workerRef.current.onmessage = (e) => {
            if (e.data.type === "result") {
              const studentPose: Landmark[] = e.data.landmarks;
              setStudentLandmarks(studentPose);

              // Find teacher reference
              const teacherPose = findClosestKeypoint(keypointsRef.current, currentMs);
              if (teacherPose) {
                const result = comparePoses(studentPose, teacherPose);
                setScore(result.score);
                setJointScores(result.jointScores);
              }
            } else if (e.data.type === "skip") {
              // No pose detected — clear student landmarks
              setStudentLandmarks(null);
            }
          };

          workerRef.current.postMessage(
            { type: "detect", bitmap, timestampMs: currentMs },
            [bitmap]
          );
        });
      }, SAMPLE_INTERVAL_MS);
    };

    const stopLoop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsActive(false);
    };

    // Listen to video play/pause
    const onPlay = () => startLoop();
    const onPause = () => stopLoop();
    const onSeeked = () => {
      const currentMs = videoElement.currentTime * 1000;
      // If seeked outside current chunk window, fetch new chunk
      if (currentMs < chunkStartRef.current || currentMs > chunkEndRef.current) {
        const from = Math.max(0, currentMs - 5000);
        const to = from + CHUNK_DURATION_MS;
        chunkStartRef.current = from;
        fetchChunk(from, to);
      }
    };

    videoElement.addEventListener("play", onPlay);
    videoElement.addEventListener("pause", onPause);
    videoElement.addEventListener("seeked", onSeeked);

    // If video is already playing, start immediately
    if (!videoElement.paused) startLoop();

    return () => {
      stopLoop();
      videoElement.removeEventListener("play", onPlay);
      videoElement.removeEventListener("pause", onPause);
      videoElement.removeEventListener("seeked", onSeeked);
    };
  }, [enabled, isReady, videoElement, fetchChunk]);

  // Cleanup when disabled
  useEffect(() => {
    if (!enabled) {
      cleanup();
      setIsReady(false);
      setIsActive(false);
      setScore(0);
      setJointScores([]);
      setStudentLandmarks(null);
      setError(null);
    }
  }, [enabled]);

  function cleanup() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
      cameraVideoRef.current = null;
    }
    canvasRef.current = null;
    keypointsRef.current = [];
    chunkStartRef.current = 0;
    chunkEndRef.current = 0;
  }

  return { score, jointScores, studentLandmarks, isReady, isActive, error };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useAiCoach.ts
git commit -m "feat(ai-coach): add useAiCoach hook — camera, worker, comparison loop, chunk loading"
```

---

### Task 4: UI Components — Toggle, Score Wheel, Skeleton

**Files:**
- Create: `client/src/components/AiCoachToggle.tsx`
- Create: `client/src/components/AiCoachScoreWheel.tsx`
- Create: `client/src/components/AiCoachSkeleton.tsx`

- [ ] **Step 1: Create AiCoachToggle.tsx**

```typescript
import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";

interface AiCoachToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  isReady: boolean;
  error: string | null;
}

export function AiCoachToggle({ enabled, onToggle, isReady, error }: AiCoachToggleProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  // First-time tooltip
  useEffect(() => {
    if (enabled && isReady && !localStorage.getItem("hh-coach-tooltip-seen")) {
      setShowTooltip(true);
      const timer = setTimeout(() => {
        setShowTooltip(false);
        localStorage.setItem("hh-coach-tooltip-seen", "1");
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [enabled, isReady]);

  return (
    <div className="relative flex items-center gap-3">
      <button
        onClick={() => onToggle(!enabled)}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300
          ${enabled
            ? "bg-gradient-to-r from-[#E879F9] to-[#A855F7] text-white shadow-[0_0_20px_rgba(232,121,249,0.3)]"
            : "border border-white/20 text-white/60 hover:border-white/40 hover:text-white/80"
          }
        `}
      >
        <Sparkles className="w-4 h-4" />
        {enabled ? (
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Coach Active
          </span>
        ) : (
          "Live Movement Coach"
        )}
      </button>

      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}

      {/* First-time tooltip */}
      {showTooltip && (
        <div className="absolute left-0 top-full mt-2 z-50 px-4 py-3 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 text-xs text-white/80 max-w-[260px] shadow-lg animate-in fade-in slide-in-from-top-1">
          <p className="font-medium text-white mb-1">Color Guide</p>
          <p><span className="inline-block w-2 h-2 rounded-full bg-[#22C55E] mr-1.5" />Green = good alignment</p>
          <p><span className="inline-block w-2 h-2 rounded-full bg-[#F59E0B] mr-1.5" />Amber = minor adjustment</p>
          <p><span className="inline-block w-2 h-2 rounded-full bg-[#F43F5E] mr-1.5" />Red = focus here</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create AiCoachScoreWheel.tsx**

```typescript
interface AiCoachScoreWheelProps {
  score: number; // 0-100
}

export function AiCoachScoreWheel({ score }: AiCoachScoreWheelProps) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;
  const isExcellent = score > 85;

  // Color based on score
  const strokeColor =
    score >= 70 ? "#E879F9" :
    score >= 40 ? "#F59E0B" :
    "#F43F5E";

  return (
    <div
      className={`
        absolute top-3 right-3 z-20
        w-16 h-16 rounded-full
        bg-black/40 backdrop-blur-md
        flex items-center justify-center
        transition-all duration-300
        ${isExcellent ? "shadow-[0_0_24px_rgba(232,121,249,0.4)]" : ""}
      `}
    >
      <svg width="64" height="64" className="absolute inset-0">
        {/* Background track */}
        <circle
          cx="32" cy="32" r={radius}
          fill="none" stroke="white" strokeOpacity="0.1"
          strokeWidth="3"
        />
        {/* Progress arc */}
        <circle
          cx="32" cy="32" r={radius}
          fill="none" stroke={strokeColor}
          strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 32 32)"
          style={{ transition: "stroke-dashoffset 300ms ease, stroke 300ms ease" }}
        />
      </svg>
      <span className="text-white font-bold text-base z-10">{score}</span>
    </div>
  );
}
```

- [ ] **Step 3: Create AiCoachSkeleton.tsx**

```typescript
import { useEffect, useRef } from "react";
import {
  SKELETON_CONNECTIONS,
  connectionColor,
  jointColor,
  type Landmark,
  type JointScore,
} from "@/lib/pose-comparison";

interface AiCoachSkeletonProps {
  landmarks: Landmark[] | null;
  jointScores: JointScore[];
  score: number;
}

export function AiCoachSkeleton({ landmarks, jointScores, score }: AiCoachSkeletonProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isExcellent = score > 85;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !landmarks || landmarks.length < 33) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Mirror horizontally: x = 1 - x (normalized coords)
    const toX = (x: number) => (1 - x) * w;
    const toY = (y: number) => y * h;

    // Draw connections
    for (const [a, b] of SKELETON_CONNECTIONS) {
      const la = landmarks[a];
      const lb = landmarks[b];
      if (la.v < 0.5 || lb.v < 0.5) continue; // skip low-visibility

      const color = connectionColor(a, b, jointScores);
      ctx.beginPath();
      ctx.moveTo(toX(la.x), toY(la.y));
      ctx.lineTo(toX(lb.x), toY(lb.y));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw joints
    for (let i = 0; i < 33; i++) {
      const lm = landmarks[i];
      if (lm.v < 0.5) continue;

      // Find best matching joint score for this landmark
      let bestScore = 0.5; // default neutral
      for (const js of jointScores) {
        const [a, _, c] = js.indices;
        if (a === i || c === i) {
          bestScore = js.score;
          break;
        }
      }

      ctx.beginPath();
      ctx.arc(toX(lm.x), toY(lm.y), 3, 0, 2 * Math.PI);
      ctx.fillStyle = jointColor(bestScore);
      ctx.fill();
    }
  }, [landmarks, jointScores]);

  if (!landmarks) return null;

  return (
    <div
      className={`
        absolute bottom-3 right-3 z-20
        w-[160px] h-[120px] rounded-xl overflow-hidden
        bg-black/60 backdrop-blur-sm border
        transition-all duration-300
        ${isExcellent
          ? "border-[#E879F9]/40 shadow-[0_0_16px_rgba(232,121,249,0.25)]"
          : "border-white/10"
        }
      `}
    >
      <canvas
        ref={canvasRef}
        width={160}
        height={120}
        className="w-full h-full"
      />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/AiCoachToggle.tsx client/src/components/AiCoachScoreWheel.tsx client/src/components/AiCoachSkeleton.tsx
git commit -m "feat(ai-coach): add Toggle, ScoreWheel, Skeleton UI components"
```

---

### Task 5: Integrate AI Coach into Lesson Player

**Files:**
- Modify: `client/src/pages/CourseLearn.tsx`

- [ ] **Step 1: Thread video ref through LessonVideoPlayer**

In `CourseLearn.tsx`, the `LessonVideoPlayer` component (lines 18-83) wraps `HlsPlayer`. We need to:

1. Add a `videoRef` prop to `LessonVideoPlayer`
2. Pass it through to `HlsPlayer` as a `ref`
3. In the parent `CourseLearn`, create a `useRef<HTMLVideoElement>(null)` and pass it down

Modify `LessonVideoPlayer` props to include `videoRef`:
```typescript
function LessonVideoPlayer({
  lesson, courseId, initialTime, onTimeUpdate, onEnded, videoRef,
}: {
  lesson: any;
  courseId: number;
  initialTime?: number;
  onTimeUpdate?: (time: number) => void;
  onEnded?: () => void;
  videoRef?: React.RefObject<HTMLVideoElement>;
}) {
```

In the return where `<HlsPlayer>` is rendered (line 73), add the ref:
```tsx
<HlsPlayer
  ref={videoRef}
  src={playback.url}
  type={playback.type}
  poster={playback.thumbnailUrl}
  initialTime={initialTime}
  onTimeUpdate={onTimeUpdate}
  onEnded={onEnded}
/>
```

- [ ] **Step 2: Add AI Coach imports and state**

At the top of `CourseLearn.tsx`, add imports:
```typescript
import { useAiCoach } from "@/hooks/useAiCoach";
import { AiCoachToggle } from "@/components/AiCoachToggle";
import { AiCoachScoreWheel } from "@/components/AiCoachScoreWheel";
import { AiCoachSkeleton } from "@/components/AiCoachSkeleton";
```

In the `CourseLearn` component, add state and refs after existing state declarations (around line 97):
```typescript
const [aiCoachEnabled, setAiCoachEnabled] = useState(false);
const videoRef = useRef<HTMLVideoElement>(null);
```

Add the hook after existing hooks (around line 231):
```typescript
// AI Coach — check if keypoints are available
const { data: keypointMeta } = trpc.keypoints.getMeta.useQuery(
  { lessonId: currentLessonId! },
  { enabled: !!currentLessonId }
);
const hasKeypoints = keypointMeta?.status === "complete";

const { score, jointScores, studentLandmarks, isReady, isActive, error: aiCoachError } = useAiCoach({
  lessonId: currentLessonId || 0,
  videoElement: videoRef.current,
  enabled: aiCoachEnabled && hasKeypoints,
});
```

- [ ] **Step 3: Modify the video container**

Find the video player section (around line 370-381). Wrap the `LessonVideoPlayer` in a `relative` container and add overlays:

Replace:
```tsx
{/* Video Player */}
<LessonVideoPlayer
  lesson={currentLesson}
  courseId={courseId}
  initialTime={lessonProgress?.watchedDuration ?? undefined}
  onTimeUpdate={handleTimeUpdate}
  onEnded={() => {
    if (currentLessonId && courseId && !isLessonCompleted(currentLessonId)) {
      handleMarkComplete();
    }
  }}
/>
```

With:
```tsx
{/* Video Player + AI Coach Overlays */}
<div className="relative">
  <LessonVideoPlayer
    lesson={currentLesson}
    courseId={courseId}
    initialTime={lessonProgress?.watchedDuration ?? undefined}
    onTimeUpdate={handleTimeUpdate}
    onEnded={() => {
      if (currentLessonId && courseId && !isLessonCompleted(currentLessonId)) {
        handleMarkComplete();
      }
    }}
    videoRef={videoRef}
  />
  {aiCoachEnabled && isReady && (
    <AiCoachScoreWheel score={score} />
  )}
  {aiCoachEnabled && isActive && (
    <AiCoachSkeleton landmarks={studentLandmarks} jointScores={jointScores} score={score} />
  )}
</div>
```

- [ ] **Step 4: Add the toggle**

Find the "Mark Complete" button area (around line 390-409). Add the AI Coach toggle in the same row. Replace:

```tsx
<div className="flex justify-end">
  <Button ...>
```

With:
```tsx
<div className="flex items-center justify-between">
  {hasKeypoints && (
    <AiCoachToggle
      enabled={aiCoachEnabled}
      onToggle={setAiCoachEnabled}
      isReady={isReady}
      error={aiCoachError}
    />
  )}
  <div className="flex-1" />
  <Button ...>
```

- [ ] **Step 5: Reset AI Coach when lesson changes**

Add an effect to disable AI Coach when switching lessons (after existing effects, around line 250):
```typescript
// Reset AI Coach when lesson changes
useEffect(() => {
  setAiCoachEnabled(false);
}, [currentLessonId]);
```

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/CourseLearn.tsx
git commit -m "feat(ai-coach): integrate Live Movement Coach into lesson player"
```

---

### Task 6: Verify + Deploy

- [ ] **Step 1: Check TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "AiCoach|useAiCoach|pose-comparison|HlsPlayer|CourseLearn" | head -20`

Fix any errors.

- [ ] **Step 2: Verify dev server**

Run: `npm run dev`

Navigate to a lesson in a course. Verify:
- If lesson has no keypoints → no toggle visible
- If lesson has keypoints → "Live Movement Coach" toggle appears
- Clicking toggle → camera permission prompt
- After permission → score wheel appears on video, skeleton panel in bottom-right
- Play video → skeleton updates, score changes
- Pause → skeleton hides, score freezes
- Toggle off → everything cleans up

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(ai-coach): Sub-project 2 compilation fixes"
```

- [ ] **Step 4: Deploy**

Run: `./deploy.sh`
