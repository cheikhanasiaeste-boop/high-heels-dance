import { useState, useRef, useCallback } from "react";
import { Upload, Video, CheckCircle2, AlertCircle, Loader2, Film, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type UploadStage = "idle" | "reading" | "uploading" | "processing" | "done" | "error";

interface BunnyVideoUploaderProps {
  /** Called when a file is selected. Receives the File and a base64 string (no data: prefix). */
  onUpload: (file: File, base64: string) => Promise<void>;
  /** Whether an upload is in progress (controlled by parent mutation state). */
  isUploading?: boolean;
  /** Disable the uploader. */
  disabled?: boolean;
  /** Max file size in bytes. Default 4GB. */
  maxSize?: number;
  /** Accepted file types. Default "video/*" */
  accept?: string;
  /** Thumbnail URL to show after upload completes. */
  thumbnailUrl?: string | null;
  /** Duration in seconds after upload completes. */
  durationSeconds?: number;
  /** Current Bunny video status from parent. */
  videoStatus?: string;
  /** Error message from parent. */
  errorMessage?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function BunnyVideoUploader({
  onUpload,
  isUploading = false,
  disabled = false,
  maxSize = 4 * 1024 * 1024 * 1024,
  accept = "video/*",
  thumbnailUrl,
  durationSeconds,
  videoStatus,
  errorMessage,
}: BunnyVideoUploaderProps) {
  const [stage, setStage] = useState<UploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [bytesRead, setBytesRead] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDisabled = disabled || isUploading || stage === "reading" || stage === "uploading";

  const resetState = useCallback(() => {
    setStage("idle");
    setProgress(0);
    setSelectedFile(null);
    setBytesRead(0);
    setLocalError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const processFile = useCallback(async (file: File) => {
    setLocalError(null);

    // Validate type
    if (!file.type.startsWith("video/")) {
      setLocalError("Please select a video file (MP4, MOV, WebM, etc.)");
      return;
    }

    // Validate size
    if (file.size > maxSize) {
      setLocalError(`File too large. Maximum ${formatBytes(maxSize)}.`);
      return;
    }

    setSelectedFile(file);
    setStage("reading");
    setProgress(0);
    setBytesRead(0);

    const reader = new FileReader();

    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 45); // 0-45% for reading
        setProgress(pct);
        setBytesRead(e.loaded);
      }
    };

    reader.onload = async () => {
      try {
        const base64 = reader.result?.toString().split(",")[1];
        if (!base64) throw new Error("Failed to read file data");

        setStage("uploading");
        setProgress(50);

        await onUpload(file, base64);

        setStage("done");
        setProgress(100);
      } catch (err) {
        setStage("error");
        setLocalError((err as Error).message || "Upload failed");
      }
    };

    reader.onerror = () => {
      setStage("error");
      setLocalError("Failed to read file. Please try again.");
    };

    reader.readAsDataURL(file);
  }, [maxSize, onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file && !isDisabled) processFile(file);
  }, [isDisabled, processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!isDisabled) setDragActive(true);
  }, [isDisabled]);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }, [processFile]);

  // Derive display state
  const showError = localError || errorMessage;
  const showSuccess = stage === "done" || videoStatus === "ready";
  const showProcessing = !showSuccess && (
    stage === "reading" || stage === "uploading" ||
    videoStatus === "processing" || videoStatus === "encoding" || videoStatus === "uploading"
  );

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
        disabled={isDisabled}
      />

      {/* ── Drop Zone ─────────────────────────────────── */}
      {!showProcessing && !showSuccess && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !isDisabled && fileInputRef.current?.click()}
          className={cn(
            "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all",
            dragActive
              ? "border-[#C026D3] bg-fuchsia-50 dark:bg-fuchsia-950/20 scale-[1.01]"
              : "border-muted-foreground/25 hover:border-[#C026D3]/50 hover:bg-muted/30",
            isDisabled && "opacity-50 cursor-not-allowed",
            showError && "border-red-300 bg-red-50/50 dark:bg-red-950/10"
          )}
        >
          <div className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full transition-colors",
            dragActive ? "bg-fuchsia-100 dark:bg-fuchsia-900/30" : "bg-muted"
          )}>
            <Upload className={cn("h-6 w-6", dragActive ? "text-[#C026D3]" : "text-muted-foreground")} />
          </div>

          <div className="text-center">
            <p className="font-medium text-sm">
              {dragActive ? "Drop your video here" : "Drag & drop a video file"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              or <span className="text-[#C026D3] font-medium">click to browse</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="px-2 py-0.5 rounded-full bg-muted">MP4</span>
            <span className="px-2 py-0.5 rounded-full bg-muted">MOV</span>
            <span className="px-2 py-0.5 rounded-full bg-muted">WebM</span>
            <span className="px-2 py-0.5 rounded-full bg-muted">AVI</span>
            <span className="text-muted-foreground/60">up to {formatBytes(maxSize)}</span>
          </div>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────── */}
      {showError && !showProcessing && !showSuccess && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">{showError}</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-7 text-xs text-red-600 hover:text-red-700 px-0"
              onClick={resetState}
            >
              Try again
            </Button>
          </div>
        </div>
      )}

      {/* ── Progress (Reading + Uploading) ────────────── */}
      {showProcessing && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          {/* File info */}
          {selectedFile && (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-fuchsia-100 dark:bg-fuchsia-900/30">
                <Film className="h-5 w-5 text-[#C026D3]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
              </div>
              {stage !== "uploading" && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetState}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          {/* Progress bar */}
          <div className="space-y-1.5">
            <Progress
              value={progress}
              className="h-2.5 bg-fuchsia-100 dark:bg-fuchsia-900/20"
              indicatorClassName="bg-[#C026D3]"
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                {stage === "reading" && selectedFile
                  ? `Reading file... ${formatBytes(bytesRead)} of ${formatBytes(selectedFile.size)}`
                  : stage === "uploading"
                    ? "Uploading to Bunny.net & processing..."
                    : videoStatus === "encoding"
                      ? "Bunny.net is encoding your video..."
                      : "Processing..."}
              </span>
              <span className="font-medium text-[#C026D3] tabular-nums">{progress}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Success ───────────────────────────────────── */}
      {showSuccess && (
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Thumbnail */}
          {thumbnailUrl && (
            <div className="relative aspect-video bg-black">
              <img
                src={thumbnailUrl}
                alt="Video thumbnail"
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/70 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm">
                <Video className="h-3 w-3" />
                {durationSeconds ? formatDuration(durationSeconds) : "Ready"}
              </div>
            </div>
          )}

          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Video uploaded successfully
                </p>
                {selectedFile && (
                  <p className="text-xs text-muted-foreground">{selectedFile.name}</p>
                )}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetState();
                fileInputRef.current?.click();
              }}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              Replace Video
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
