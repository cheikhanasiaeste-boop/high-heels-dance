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
        utils.admin.courseContent.getLessons.invalidate();
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
      utils.admin.courseContent.getLessons.invalidate();
    } catch (e: any) {
      const errorMsg = e.message || "Unknown error";
      setProgress((p) => ({ ...p, state: "error", error: errorMsg }));

      try {
        const lesson = startMutation.data;
        if (lesson?.version) {
          await failMutation.mutateAsync({ lessonId, version: lesson.version, error: errorMsg });
        }
      } catch {}

      cleanup();
      utils.admin.courseContent.getLessons.invalidate();
    }
  }, [startMutation, uploadBatchMutation, completeMutation, failMutation, flushBatch, cleanup, utils]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setProgress({ state: "idle", percent: 0, processedFrames: 0, totalFrames: 0, etaSeconds: null, error: null });
  }, [cleanup]);

  return { progress, start, cancel, reset };
}
