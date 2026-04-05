# AI Coach Sub-project 2: Real-Time Analysis Engine

## Overview

When a student enables the "Live Coach" toggle in the lesson player, the browser activates their webcam, runs MediaPipe Pose at 3fps in a Web Worker, compares the student's pose against the pre-computed teacher reference keypoints (from Sub-project 1) at the current video timestamp, and displays a real-time similarity score as an elegant floating percentage wheel above the video. A small color-coded skeleton visualization replaces the raw camera feed — showing the student's detected pose with limbs colored by accuracy.

Analysis runs only while the video is playing. When paused, everything pauses.

**Key decisions:**
- Score displayed as a subtle percentage wheel above the lesson video — luxurious, minimal, fuchsia accents on high scores
- No raw camera feed shown — student sees a small color-coded skeleton (green = matching, amber = drifting, red = off)
- Comparison uses joint angle similarity — rotation/scale invariant, works at any distance
- Hips, knees, and torso weighted 2x heavier than arms (core to high heels dance technique)
- Reference keypoints loaded in 30-second chunks with pre-fetching
- Fully ephemeral — no student data persisted (deferred to Sub-project 3)
- All processing client-side — camera feed never leaves the browser

---

## UI Components

### "Enable Live Coach" Toggle

Placed between the video player and the lesson content inside the lesson `<Card>`, on the same row as the "Mark as Complete" button area.

**Off state:**
- Subtle pill-shaped toggle: ghost outline, "Enable Live Coach" label + small sparkle/brain icon
- Does not draw attention — blends with the lesson UI

**On state:**
- Fuchsia gradient fill on the toggle pill, soft glow
- "Live Coach Active" label
- First activation triggers browser camera permission prompt
- On subsequent activations, camera resumes immediately (permission cached)

**Availability:** Only shown if the lesson has reference keypoints (`keypointStatus === "complete"`). Hidden otherwise — no confusing disabled state.

### Score Wheel

Positioned **above the video player**, right-aligned, floating over the top-right corner of the video container.

- Circular percentage gauge, ~64px diameter
- Thin arc stroke (3-4px) with gradient fill based on score:
  - 0-40%: muted rose/red (`#F43F5E`)
  - 40-70%: warm amber (`#F59E0B`)
  - 70-100%: fuchsia-to-purple gradient (`#E879F9` → `#A855F7`)
- Score number centered inside the circle (bold, white, ~18px)
- Glassmorphic background: `bg-black/40 backdrop-blur-md rounded-full`
- Smooth CSS transition on arc fill (300ms ease)
- When score > 85%: subtle fuchsia pulse glow animation
- Hidden when AI Coach is off

### Skeleton Overlay (PiP)

Positioned in the **bottom-right corner** of the video container.

- ~160×120px panel, rounded-xl corners
- Dark semi-transparent background: `bg-black/60 backdrop-blur-sm border border-white/10`
- Renders the student's detected pose as a stick-figure skeleton drawn on a `<canvas>`
- Limbs color-coded by accuracy:
  - Green (`#22C55E`): joint angle within 15° of reference
  - Amber (`#F59E0B`): within 15-30° of reference
  - Red (`#F43F5E`): more than 30° off
- Joints drawn as small circles (4px radius), connections as lines (2px stroke)
- Mirrored horizontally so the skeleton feels natural (student's left = screen left)
- Hidden when AI Coach is off or video is paused

### Loading State

When "Enable Live Coach" is first toggled on:
1. Score wheel area shows a small spinner + "Initializing..."
2. Browser camera permission prompt appears (native)
3. If denied: toast error "Camera access required for Live Coach", toggle reverts to off
4. MediaPipe model loads (~3-5MB WASM, cached after first load)
5. Once ready: skeleton panel appears, score wheel activates

---

## Comparison Algorithm

### Joint Angle Similarity

Rather than comparing raw x/y positions (which vary by camera angle, distance, body proportions), compute angles between key joint triplets.

**Joint triplets (10 comparisons):**

| # | Joint Triplet | Body Part | Weight |
|---|---------------|-----------|--------|
| 1 | Left Shoulder → Left Elbow → Left Wrist | Left arm | 1.0 |
| 2 | Right Shoulder → Right Elbow → Right Wrist | Right arm | 1.0 |
| 3 | Left Hip → Left Knee → Left Ankle | Left leg | 2.0 |
| 4 | Right Hip → Right Knee → Right Ankle | Right leg | 2.0 |
| 5 | Left Shoulder → Left Hip → Left Knee | Left torso-leg | 2.0 |
| 6 | Right Shoulder → Right Hip → Right Knee | Right torso-leg | 2.0 |
| 7 | Left Elbow → Left Shoulder → Left Hip | Left upper body | 1.5 |
| 8 | Right Elbow → Right Shoulder → Right Hip | Right upper body | 1.5 |
| 9 | Left Hip → midpoint(hips) → Right Hip | Hip alignment | 2.0 |
| 10 | Left Shoulder → midpoint(shoulders) → Right Shoulder | Shoulder alignment | 1.5 |

**Per-joint scoring:**
```
angle = atan2 of the two vectors formed by the triplet
angleDiff = abs(studentAngle - teacherAngle)
jointScore = clamp(1 - angleDiff / 45, 0, 1)
```

45° is full tolerance — beyond that, the joint scores 0.

**Overall score:**
```
weightedSum = sum(jointScore[i] * weight[i])
totalWeight = sum(weight[i])
overallScore = round(weightedSum / totalWeight * 100)
```

Total weight: 1+1+2+2+2+2+1.5+1.5+2+1.5 = 16.5. Hips/knees/torso contribute ~73% of the score.

**Per-limb color assignment** (for skeleton visualization):
- Compute each joint's individual score
- Green: score ≥ 0.67 (within ~15°)
- Amber: score ≥ 0.33 (within ~30°)
- Red: score < 0.33 (more than 30° off)

### Angle Calculation

```typescript
function jointAngle(a: Point, b: Point, c: Point): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const cross = ba.x * bc.y - ba.y * bc.x;
  return Math.atan2(cross, dot); // radians
}
```

Convert to degrees for the diff: `angleDiffDeg = abs(studentAngle - teacherAngle) * (180 / Math.PI)`.

Handle angle wraparound: use the minimum of `angleDiff` and `360 - angleDiff`.

---

## Reference Keypoint Loading

Pre-fetch reference keypoints in chunks as the video plays:

1. **On AI Coach enable:** fetch keypoints for `0 - 30000ms` via `trpc.keypoints.getChunk({ lessonId, fromMs: 0, toMs: 30000 })`
2. **Pre-fetch trigger:** when video playback reaches the 50% mark of the current chunk (e.g. 15s into a 30s chunk), fetch the next 30s chunk
3. **Sliding window:** keep ~60s of keypoints in memory (current chunk + next chunk). Discard chunks that are more than 30s behind current playback position.
4. **Binary search:** to find the closest reference keypoint to the current video time, binary search the in-memory array by `timestampMs`. Return the keypoint with the smallest `abs(timestampMs - currentMs)`.

If no reference keypoints are within 500ms of the current time, skip comparison for that frame (teacher may be transitioning between positions).

---

## Hook: useAiCoach

Main orchestration hook used by `CourseLearn.tsx`.

**Input:**
```typescript
useAiCoach({
  lessonId: number;
  videoElement: HTMLVideoElement | null;  // ref to the lesson video
  enabled: boolean;  // toggle state
})
```

**Output:**
```typescript
{
  score: number;              // 0-100, current comparison score
  jointScores: JointScore[];  // per-joint scores for skeleton coloring
  studentLandmarks: Landmark[] | null;  // for skeleton rendering
  isReady: boolean;           // model loaded, camera active
  isActive: boolean;          // currently analyzing (video playing + enabled)
  error: string | null;       // camera denied, model failed, etc.
}
```

**Internal lifecycle:**

1. When `enabled` becomes true:
   - Request camera via `navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })`
   - Create hidden `<video>` element attached to the camera stream
   - Spawn pose-worker (same `client/src/workers/pose-worker.ts` from Sub-project 1)
   - Initialize MediaPipe in worker
   - Fetch first keypoint chunk
   - Set `isReady = true`

2. When video is playing + enabled + ready:
   - Start a `setInterval` at 333ms (3fps)
   - Each tick: capture webcam frame via `<canvas>` → `createImageBitmap` → post to worker
   - On worker result: find closest reference keypoint, compute comparison, update score + jointScores

3. When video pauses:
   - Clear the interval, freeze score display

4. When `enabled` becomes false or component unmounts:
   - Stop camera stream (all tracks)
   - Terminate worker
   - Clear keypoint cache
   - Reset all state

**Video event listeners:**
- `play` → start analysis loop
- `pause` → stop analysis loop
- `seeked` → check if new keypoint chunk needed
- `timeupdate` → pre-fetch next chunk if approaching boundary

---

## Integration into CourseLearn.tsx

### Changes to the lesson player layout

Inside the `currentLesson` Card (around line 357 of `CourseLearn.tsx`):

1. **Score Wheel:** Render `<AiCoachScoreWheel>` as an absolutely positioned element inside the video container div (the `aspect-video` wrapper). Top-right corner. Only visible when AI Coach is active.

2. **Skeleton Overlay:** Render `<AiCoachSkeleton>` as an absolutely positioned element inside the video container div. Bottom-right corner. Only visible when AI Coach is active and video is playing.

3. **Toggle:** Render `<AiCoachToggle>` between the video player and the lesson content, in a flex row with the "Mark Complete" button.

The video container div needs to become `relative` for absolute positioning of overlays:
```tsx
<div className="aspect-video bg-black rounded-lg overflow-hidden mb-4 relative">
  <HlsPlayer ... />
  {aiCoachActive && <AiCoachScoreWheel score={score} />}
  {aiCoachActive && isPlaying && <AiCoachSkeleton landmarks={studentLandmarks} jointScores={jointScores} />}
</div>
```

### Getting video element ref

The `HlsPlayer` component needs a small modification: expose a `ref` that provides access to the underlying `<video>` element. The `useAiCoach` hook needs this ref to:
- Listen for play/pause/seeked events
- Read `currentTime` for keypoint lookup

Add a `videoRef` forwarded ref prop to `HlsPlayer` or use `useImperativeHandle` to expose the video element.

---

## File Structure

```
client/src/components/AiCoachToggle.tsx      — "Enable Live Coach" pill toggle
client/src/components/AiCoachScoreWheel.tsx  — circular percentage gauge
client/src/components/AiCoachSkeleton.tsx    — canvas-based skeleton visualization
client/src/hooks/useAiCoach.ts               — orchestrates camera, worker, comparison, keypoint loading
client/src/lib/pose-comparison.ts            — pure functions: angle calc, scoring, color assignment
client/src/components/HlsPlayer.tsx          — modify to expose video element ref
client/src/pages/CourseLearn.tsx              — integrate toggle, score wheel, skeleton, hook
```

No new backend code needed — uses existing `keypoints.getChunk` and `keypoints.getMeta` from Sub-project 1.

---

## Performance

- MediaPipe Pose inference: ~50-100ms per frame (in Web Worker, off main thread)
- Comparison calculation: <1ms (10 angle comparisons)
- At 3fps: ~10-15% CPU on modern laptop
- Camera feed: native `<video>` element, hardware-accelerated
- Skeleton canvas: ~1ms render per frame (simple line drawing)
- Score wheel: pure CSS transitions, zero JS cost
- Keypoint chunks: ~10-30KB per 30s chunk, trivial bandwidth
- Memory: ~200KB for 60s keypoint window + MediaPipe WASM (~5MB cached)

---

## Privacy & Permissions

- Camera feed never leaves the browser — all processing is local
- No student pose data sent to server or stored
- Camera permission requested only when toggle is enabled — explicit opt-in
- Camera fully released (all MediaStream tracks stopped) when toggle is off or page unmounts
- No facial recognition or identification — only body pose landmarks

---

## Browser Compatibility

- Chrome 94+ / Edge 94+: Full support (getUserMedia, Web Workers, MediaPipe WASM)
- Safari 15.4+: Full support
- Firefox 100+: Full support
- Mobile: Works but not optimized (CPU-intensive). Toggle hidden on mobile for v1 if needed.

---

## Dependencies

No new npm packages — reuses `@mediapipe/tasks-vision` installed in Sub-project 1.

---

## Out of Scope (Sub-project 2)

- Persisting analysis data or session summaries (Sub-project 3)
- AI-generated natural language feedback (Sub-project 3)
- Audio transcription integration (Sub-project 3)
- Mobile-optimized camera experience
- Multiple camera angles
- Teacher skeleton overlay (showing the target pose on the video)
