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

export function useAiCoach({ lessonId, videoElement, enabled }: AiCoachInput): AiCoachOutput {
  const [score, setScore] = useState(0);
  const [jointScores, setJointScores] = useState<JointScore[]>([]);
  const [studentLandmarks, setStudentLandmarks] = useState<Landmark[] | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movementEnergy, setMovementEnergy] = useState(0);
  const [isDancing, setIsDancing] = useState(true);
  const nonDanceCountRef = useRef(0);
  const accumulatedStatsRef = useRef({
    activeSeconds: 0,
    scores: [] as number[],
    jointScoreHistory: new Map<string, number[]>(),
    bestScore: 0,
    worstScore: 100,
    feedbackCount: 0,
    lastScoreSampleTime: 0,
  });

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

          if (!dancing) return; // Skip comparison during non-dance
        }

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

                // Accumulate stats for feedback system
                const stats = accumulatedStatsRef.current;
                stats.activeSeconds += SAMPLE_INTERVAL_MS / 1000;
                stats.bestScore = Math.max(stats.bestScore, result.score);
                stats.worstScore = Math.min(stats.worstScore, result.score);

                if (stats.activeSeconds - stats.lastScoreSampleTime >= 3) {
                  stats.scores.push(result.score);
                  stats.lastScoreSampleTime = stats.activeSeconds;
                }

                for (const js of result.jointScores) {
                  const history = stats.jointScoreHistory.get(js.name) || [];
                  history.push(js.score);
                  stats.jointScoreHistory.set(js.name, history);
                }
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
      setMovementEnergy(0);
      setIsDancing(true);
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
    accumulatedStatsRef.current = {
      activeSeconds: 0, scores: [], jointScoreHistory: new Map(),
      bestScore: 0, worstScore: 100, feedbackCount: 0, lastScoreSampleTime: 0,
    };
    nonDanceCountRef.current = 0;
  }

  return {
    score, jointScores, studentLandmarks, isReady, isActive, error,
    movementEnergy, isDancing,
    accumulatedStats: accumulatedStatsRef.current,
    incrementFeedbackCount: () => { accumulatedStatsRef.current.feedbackCount++; },
  };
}
