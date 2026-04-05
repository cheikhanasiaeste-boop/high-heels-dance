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
