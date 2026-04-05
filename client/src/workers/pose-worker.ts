import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let poseLandmarker: PoseLandmarker | null = null;

type CompactLandmark = { x: number; y: number; z: number; v: number };

async function initPose() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "IMAGE",
    numPoses: 1,
  });
}

function processFrame(bitmap: ImageBitmap): CompactLandmark[] | null {
  if (!poseLandmarker) return null;

  const result = poseLandmarker.detect(bitmap);
  bitmap.close();

  if (!result.landmarks || result.landmarks.length === 0) return null;

  const pose = result.landmarks[0];
  const worldLandmarks = result.worldLandmarks?.[0];

  return pose.map((lm, i) => ({
    x: Math.round(lm.x * 10000) / 10000,
    y: Math.round(lm.y * 10000) / 10000,
    z: Math.round((worldLandmarks?.[i]?.z ?? lm.z) * 10000) / 10000,
    v: Math.round(lm.visibility * 100) / 100,
  }));
}

self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data;

  if (type === "init") {
    try {
      await initPose();
      self.postMessage({ type: "ready" });
    } catch (err: any) {
      self.postMessage({ type: "error", message: `Failed to initialize MediaPipe: ${err.message}` });
    }
    return;
  }

  if (type === "detect") {
    const { bitmap, timestampMs } = e.data as { bitmap: ImageBitmap; timestampMs: number };
    const landmarks = processFrame(bitmap);
    if (landmarks) {
      self.postMessage({ type: "result", timestampMs, landmarks });
    } else {
      self.postMessage({ type: "skip", timestampMs });
    }
    return;
  }
};
