# AI Coach Sub-project 1: Reference Keypoint Pipeline

## Overview

A browser-based tool that lets the admin extract and store the teacher's body pose keypoints from lesson videos. These keypoints serve as the "ground truth" reference that Sub-project 2 (Real-Time Analysis Engine) compares the student's live pose against.

The admin clicks "Extract Keypoints" on a lesson in the Course Content Manager. The browser streams the video, runs MediaPipe Pose in a Web Worker at 4fps, and uploads the results in batches to Postgres. No server-side ML infrastructure required.

**Key decisions:**
- Browser-based extraction — no server GPU, no Python, no infrastructure changes
- 4fps sampling (every 250ms) — sufficient for dance comparison, ~3,600 keypoints per 15min lesson
- Web Worker + OffscreenCanvas — extraction runs off main thread, UI stays responsive
- Audio transcription deferred to Sub-project 3 — keeps v1 simple
- Batch upload (500 at a time) — prevents memory issues, enables progress tracking

---

## Database Schema

### New table: `lesson_keypoints`

Stores the teacher's reference pose landmarks per timestamp for each lesson.

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| lesson_id | integer | FK → course_lessons, not null |
| version | integer | not null, default 1 |
| timestamp_ms | integer | not null (ms into video) |
| landmarks | jsonb | not null |
| created_at | timestamp | not null, default now() |

Index on `(lesson_id, version, timestamp_ms)`.

**Landmarks JSONB format:**
```json
[
  { "x": 0.523, "y": 0.312, "z": -0.045, "v": 0.99 },
  { "x": 0.498, "y": 0.287, "z": -0.031, "v": 0.97 },
  ...
]
```
33 elements (MediaPipe Pose landmarks), each with x/y/z normalized coordinates and visibility score. Compact — no landmark names stored (index position defines the body part per MediaPipe spec).

**Storage estimate:**
- Each row: ~300 bytes (33 landmarks × ~9 bytes each)
- 15min lesson @ 4fps: 3,600 rows × 300 bytes = ~1.1MB
- 50 lessons: ~55MB total

### Modified table: `course_lessons` (add columns)

| New Column | Type | Default |
|------------|------|---------|
| keypoint_status | varchar(20) | "none" |
| keypoint_count | integer | 0 |
| keypoint_version | integer | 0 |
| keypoint_extracted_at | timestamp | null |

**Status transitions:**
- `"none"` → admin has never extracted keypoints
- `"extracting"` → extraction in progress
- `"complete"` → keypoints ready for use
- `"failed"` → extraction failed (error stored in logs)

On cancel: status returns to `"none"` (cancellation is a transient UI state, not persisted).

---

## Extraction Pipeline

### Flow

```
Admin clicks "Extract Keypoints"
         │
         ▼
    Set status → "extracting"
    Set keypoint_version += 1
         │
         ▼
    Spawn Web Worker
    ├── Load MediaPipe Pose WASM (~3-5MB, cached after first load)
    ├── Create OffscreenCanvas
    ├── Stream video from Bunny CDN signed URL
    └── Loop: seek to next 250ms mark
              ├── Draw frame to OffscreenCanvas
              ├── Run MediaPipe Pose detection
              ├── Post landmarks + timestamp to main thread
              └── Main thread batches (500) → uploads to server
         │
         ▼
    All frames processed
         │
         ▼
    Set status → "complete"
    Set keypoint_count, keypoint_extracted_at
```

### Web Worker Architecture

**Main thread responsibilities:**
- Start/cancel the worker
- Receive keypoint messages from worker
- Batch keypoints (accumulate 500, then upload)
- Update progress UI (% complete, ETA)
- Call tRPC mutations to upload batches and update status

**Worker thread responsibilities:**
- Load MediaPipe Pose (WASM + model files)
- Create OffscreenCanvas, attach video frame rendering
- Seek video to each 250ms timestamp
- Run pose detection on each frame
- Post results back to main thread: `{ timestampMs, landmarks }` 
- Respond to cancel messages

**Worker communication:**
```typescript
// Main → Worker
{ type: "start", videoUrl: string, durationMs: number }
{ type: "cancel" }

// Worker → Main
{ type: "progress", timestampMs: number, totalMs: number, landmarks: Landmark[] }
{ type: "complete" }
{ type: "error", message: string }
```

### Video Frame Extraction

The worker cannot use `<video>` elements (no DOM in workers). Instead:

1. Main thread fetches the signed Bunny URL
2. Worker receives the URL
3. Worker uses `fetch()` to download video chunks
4. Worker decodes frames using `VideoDecoder` API (Web Codecs) or falls back to seeking a hidden `<video>` element on the main thread that posts frames via `OffscreenCanvas.transferToImageBitmap()`

**Practical approach for v1:** Keep a hidden `<video>` element on the main thread. Seek to each 250ms mark, capture the frame via a `<canvas>`, transfer the `ImageBitmap` to the worker for pose detection. This is simpler and has broad browser support.

```
Main thread:
  <video> (hidden) → seek to T → draw to <canvas> → transferToImageBitmap()
  
Worker thread:
  Receive ImageBitmap → MediaPipe Pose → post landmarks back
```

### Cancellation

- Admin clicks "Cancel" → main thread posts `{ type: "cancel" }` to worker
- Worker stops processing, posts `{ type: "complete" }` (partial)
- Main thread calls `extractKeypoints.fail({ lessonId, error: "Cancelled by admin" })`
- Status set to `"none"`, partial keypoints for current version are deleted
- Previous complete version's keypoints (if any) remain untouched

### Re-extraction

- Admin clicks "Re-extract" → increments `keypoint_version`
- New keypoints are uploaded with the new version number
- On completion, old version's keypoints are deleted
- If re-extraction fails/cancels, the old version is still intact

---

## tRPC Routes

### Admin routes (added to admin courses router)

```
adminCourses.keypoints.start({ lessonId }) → { version: number }
  - adminProcedure
  - Validates lesson exists and has a ready video
  - Sets keypoint_status → "extracting"
  - Increments keypoint_version, returns new version
  - Returns signed video URL for the worker to fetch

adminCourses.keypoints.uploadBatch({ lessonId, version, keypoints: Array<{ timestampMs, landmarks }> }) → { ok }
  - adminProcedure
  - Validates status is "extracting" and version matches
  - Inserts batch of keypoints (up to 500 per call)

adminCourses.keypoints.complete({ lessonId, version, keypointCount }) → { ok }
  - adminProcedure
  - Sets keypoint_status → "complete"
  - Sets keypoint_count, keypoint_extracted_at
  - Deletes keypoints from previous versions (cleanup)

adminCourses.keypoints.fail({ lessonId, version, error }) → { ok }
  - adminProcedure
  - Sets keypoint_status → "failed" (or "none" if cancelled)
  - Deletes keypoints for the failed version

adminCourses.keypoints.reset({ lessonId }) → { ok }
  - adminProcedure
  - Deletes ALL keypoints for this lesson
  - Resets status to "none", count to 0, version to 0
```

### Public routes (for Sub-project 2)

```
courses.getKeypointsChunk({ lessonId, fromMs, toMs }) → Keypoint[]
  - protectedProcedure
  - Returns keypoints in the given time range (for the latest complete version)
  - Used by the real-time comparison engine to load reference data in chunks

courses.getKeypointsMeta({ lessonId }) → { status, count, version, durationMs }
  - protectedProcedure
  - Returns metadata about available keypoints for a lesson
  - Used to check if AI Coach can be enabled for this lesson
```

---

## Admin UI

### Location

Inline on each lesson card in `client/src/pages/admin/CourseContentManager.tsx`.

### States

**No keypoints (status = "none"):**
```
[lesson title]  [video status badge]
                [Extract Keypoints]  ← fuchsia outline button, only visible if video is "ready"
```

**Extracting (status = "extracting"):**
```
[lesson title]  [video status badge]
                ⚡ Extracting keypoints...  42% · ~3 min remaining
                [████████░░░░░░░░░░░░]
                [Cancel]
                ⚠️ Keep this tab open during extraction
```

**Complete (status = "complete"):**
```
[lesson title]  [video status badge]  ✅ 3,612 keypoints
                [Re-extract]  ← ghost button
```

**Failed (status = "failed"):**
```
[lesson title]  [video status badge]  ❌ Extraction failed
                [Retry]  ← fuchsia outline button
```

### Progress calculation

- Total frames = `durationMs / 250` (known from `lesson.durationSeconds`)
- Current frame = latest `timestampMs / 250`
- Progress % = current / total
- ETA = elapsed time × (remaining / completed)

### MediaPipe loading indicator

On first extraction, MediaPipe WASM files (~3-5MB) must be downloaded. Show a "Loading AI model..." spinner before the progress bar begins. Files are cached by the browser for subsequent extractions.

---

## File Structure

```
drizzle/schema.ts                                — add lesson_keypoints table + course_lessons columns
server/db.ts                                     — add new schema imports
server/keypointDb.ts                             — keypoint DB functions (CRUD, batch insert, version management)
server/keypointRouter.ts                         — admin keypoint tRPC routes
server/routers.ts                                — mount keypoint routes
client/src/workers/keypoint-extractor.worker.ts  — Web Worker for MediaPipe pose detection
client/src/hooks/useKeypointExtraction.ts        — React hook wrapping worker lifecycle + batch upload
client/src/pages/admin/CourseContentManager.tsx   — add extraction UI per lesson
```

---

## Dependencies

**New npm packages:**
- `@mediapipe/tasks-vision` — browser-based pose detection (WASM, ~3-5MB lazy-loaded)

No other new dependencies. No server-side ML libraries.

---

## Browser Compatibility

- **Chrome 94+**: Full support (Web Workers, Canvas, MediaPipe WASM)
- **Safari 15.4+**: Full support
- **Firefox 100+**: Full support
- **Edge 94+**: Full support (Chromium-based)

Admin extraction is a one-time operation — only needs to work on the admin's browser.

---

## Cost

- **Compute**: Zero — runs in the admin's browser
- **Storage**: ~1.1MB per lesson in Postgres, ~55MB for 50 lessons
- **API calls**: Zero for v1 (no Gemini transcription)
- **CDN**: Normal Bunny bandwidth for streaming the video during extraction

---

## Out of Scope (Sub-project 1)

- Audio transcription (deferred to Sub-project 3)
- Student-side comparison (Sub-project 2)
- AI feedback generation (Sub-project 3)
- Batch extraction across all lessons (admin extracts one at a time for v1)
- Mobile admin support (extraction requires desktop browser)
