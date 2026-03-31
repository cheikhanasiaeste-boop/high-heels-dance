import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Award, Share2, Loader2, Download, Instagram } from "lucide-react";
import { toast } from "sonner";

interface CertificateButtonProps {
  courseId: number;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
}

/**
 * Renders an achievement card to a canvas and returns a blob.
 * Produces a 1080x1920 image (Instagram Story dimensions).
 */
function renderAchievementCard(
  canvas: HTMLCanvasElement,
  data: { studentName: string; courseTitle: string; completionDate: string; certificateId: string },
): void {
  const W = 1080;
  const H = 1920;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ── Background gradient ──
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#581C87");   // purple-900
  grad.addColorStop(0.4, "#86198F"); // fuchsia-800
  grad.addColorStop(0.7, "#BE185D"); // pink-700
  grad.addColorStop(1, "#9D174D");   // pink-800
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ── Decorative circles ──
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath(); ctx.arc(180, 350, 300, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(900, 1500, 400, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // ── Top sparkle emoji ──
  ctx.font = "120px serif";
  ctx.textAlign = "center";
  ctx.fillText("✨", W / 2, 280);

  // ── "I COMPLETED" ──
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "bold 32px system-ui, -apple-system, sans-serif";
  ctx.letterSpacing = "8px";
  ctx.fillText("I COMPLETED", W / 2, 400);
  ctx.letterSpacing = "0px";

  // ── Course title (word-wrap) ──
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 64px system-ui, -apple-system, sans-serif";
  const titleLines = wrapText(ctx, data.courseTitle, W - 160);
  let titleY = 520;
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, titleY);
    titleY += 80;
  }

  // ── Divider line ──
  const divY = titleY + 40;
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 120, divY);
  ctx.lineTo(W / 2 + 120, divY);
  ctx.stroke();

  // ── Dance emoji row ──
  ctx.font = "80px serif";
  ctx.fillText("💃", W / 2 - 100, divY + 120);
  ctx.fillText("🩰", W / 2, divY + 120);
  ctx.fillText("👠", W / 2 + 100, divY + 120);

  // ── Student name ──
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 42px system-ui, -apple-system, sans-serif";
  ctx.fillText(data.studentName, W / 2, divY + 240);

  // ── Date ──
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "28px system-ui, -apple-system, sans-serif";
  ctx.fillText(data.completionDate, W / 2, divY + 300);

  // ── Bottom branding ──
  const bottomY = H - 200;
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "24px system-ui, -apple-system, sans-serif";
  ctx.letterSpacing = "6px";
  ctx.fillText("HIGH HEELS DANCE ACADEMY", W / 2, bottomY);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.font = "20px system-ui, -apple-system, sans-serif";
  ctx.fillText("elizabeth-zolotova.com", W / 2, bottomY + 40);

  // ── Certificate ID ──
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.font = "16px system-ui, -apple-system, sans-serif";
  ctx.fillText(data.certificateId, W / 2, bottomY + 80);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4); // max 4 lines
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });
}

export function CertificateButton({ courseId, variant = "outline", size = "sm", className }: CertificateButtonProps) {
  const [open, setOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { data: certData } = trpc.courses.getCertificateData.useQuery(
    { courseId },
    { staleTime: 60_000 }
  );

  if (!certData) return null;

  const generateImage = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !certData) return null;
    renderAchievementCard(canvas, certData);
    return canvasToBlob(canvas);
  }, [certData]);

  const handleShare = async () => {
    setIsGenerating(true);
    try {
      const blob = await generateImage();
      if (!blob) throw new Error("Failed to generate image");

      const file = new File([blob], "high-heels-achievement.png", { type: "image/png" });

      // Try native share (works on mobile — Instagram, WhatsApp, etc.)
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "My Achievement",
          text: certData.shareText,
        });
        return;
      }

      // Fallback: download the image
      downloadBlob(blob, "high-heels-achievement.png");
      toast.success("Image saved! Share it on your social media ✨");
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error("Failed to share. Try saving the image instead.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    setIsGenerating(true);
    try {
      const blob = await generateImage();
      if (!blob) throw new Error("Failed to generate image");
      downloadBlob(blob, "high-heels-achievement.png");
      toast.success("Image saved to your device!");
    } catch {
      toast.error("Failed to save image");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Award className="h-4 w-4 mr-2" />
        Share Achievement
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-[#C026D3]" />
              Your Achievement
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Preview (scaled down) */}
            <div className="relative bg-gradient-to-br from-purple-900 via-fuchsia-800 to-pink-700 rounded-xl overflow-hidden aspect-[9/16] max-h-[400px]">
              <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{ imageRendering: "auto" }}
              />
              {/* Render on mount */}
              <RenderOnMount canvasRef={canvasRef} data={certData} />
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={handleShare}
                disabled={isGenerating}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Share2 className="h-4 w-4 mr-2" />
                )}
                Share
              </Button>
              <Button variant="outline" onClick={handleSave} disabled={isGenerating}>
                <Download className="h-4 w-4 mr-2" />
                Save Image
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Share your achievement on Instagram, Facebook, or WhatsApp!
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Renders the achievement card once the canvas is mounted */
function RenderOnMount({ canvasRef, data }: { canvasRef: React.RefObject<HTMLCanvasElement | null>; data: any }) {
  // Use requestAnimationFrame to ensure canvas is rendered after mount
  if (typeof window !== "undefined" && canvasRef.current && data) {
    requestAnimationFrame(() => {
      if (canvasRef.current) {
        renderAchievementCard(canvasRef.current, data);
      }
    });
  }
  return null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
