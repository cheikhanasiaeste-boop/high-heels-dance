import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Upload,
  Film,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderUp,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────
type FileStatus = "pending" | "reading" | "uploading" | "done" | "error";

interface QueuedFile {
  id: string;
  file: File;
  title: string;
  order: number;
  isFree: boolean;
  status: FileStatus;
  progress: number;
  error?: string;
}

interface BulkVideoUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleId: number;
  courseId: number;
  /** Next available lesson order number */
  nextOrder: number;
  /** Called to create a lesson + upload its video. Returns the new lesson id. */
  onUploadLesson: (params: {
    moduleId: number;
    courseId: number;
    title: string;
    order: number;
    isFree: boolean;
    file: File;
    base64: string;
  }) => Promise<void>;
  /** Called when all uploads finish so parent can refresh. */
  onComplete: () => void;
}

// ── Helpers ────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function titleFromFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")          // strip extension
    .replace(/[-_]+/g, " ")           // dashes/underscores → spaces
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase → spaces
    .replace(/^\d+\s*[-.)]\s*/, "")   // strip leading numbers like "01 - "
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()); // title case
}

function readFileAsBase64(file: File, onProgress?: (loaded: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded);
    };
    reader.onload = () => {
      const result = reader.result?.toString().split(",")[1];
      if (!result) return reject(new Error("Failed to read file"));
      resolve(result);
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

// ── Component ──────────────────────────────────────────
export function BulkVideoUploadDialog({
  open,
  onOpenChange,
  moduleId,
  courseId,
  nextOrder,
  onUploadLesson,
  onComplete,
}: BulkVideoUploadDialogProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalFiles = queue.length;
  const doneFiles = queue.filter((f) => f.status === "done").length;
  const errorFiles = queue.filter((f) => f.status === "error").length;
  const allDone = totalFiles > 0 && doneFiles + errorFiles === totalFiles;
  const overallProgress = totalFiles > 0 ? Math.round((doneFiles / totalFiles) * 100) : 0;

  // ── Add files ────────────────────────────────────────
  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const videoFiles = Array.from(files).filter((f) => f.type.startsWith("video/"));
      if (videoFiles.length === 0) return;

      const startOrder = nextOrder + queue.length;

      const newItems: QueuedFile[] = videoFiles.map((file, i) => ({
        id: `${Date.now()}-${i}-${file.name}`,
        file,
        title: titleFromFilename(file.name),
        order: startOrder + i,
        isFree: false,
        status: "pending",
        progress: 0,
      }));

      setQueue((prev) => [...prev, ...newItems]);
    },
    [nextOrder, queue.length]
  );

  const removeFile = (id: string) => {
    setQueue((prev) => {
      const filtered = prev.filter((f) => f.id !== id);
      // Re-index orders
      return filtered.map((f, i) => ({ ...f, order: nextOrder + i }));
    });
  };

  const updateFile = (id: string, updates: Partial<QueuedFile>) => {
    setQueue((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  // ── Process queue sequentially ───────────────────────
  const startUpload = async () => {
    setIsProcessing(true);

    for (const item of queue) {
      if (item.status === "done" || item.status === "error") continue;

      // Read file
      updateFile(item.id, { status: "reading", progress: 10 });

      let base64: string;
      try {
        base64 = await readFileAsBase64(item.file, (loaded) => {
          const pct = Math.round((loaded / item.file.size) * 40) + 10;
          updateFile(item.id, { progress: pct });
        });
      } catch (err) {
        updateFile(item.id, { status: "error", error: "Failed to read file" });
        continue;
      }

      // Upload
      updateFile(item.id, { status: "uploading", progress: 55 });

      try {
        await onUploadLesson({
          moduleId,
          courseId,
          title: item.title,
          order: item.order,
          isFree: item.isFree,
          file: item.file,
          base64,
        });
        updateFile(item.id, { status: "done", progress: 100 });
      } catch (err) {
        updateFile(item.id, {
          status: "error",
          error: (err as Error).message || "Upload failed",
        });
      }
    }

    setIsProcessing(false);
    onComplete();
  };

  // ── Reset & close ────────────────────────────────────
  const handleClose = (openState: boolean) => {
    if (isProcessing) return; // prevent closing during upload
    if (!openState) {
      setQueue([]);
      setDragActive(false);
    }
    onOpenChange(openState);
  };

  // ── Drag & drop ──────────────────────────────────────
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (!isProcessing) addFiles(e.dataTransfer.files);
  };

  // ── Status icon per file ─────────────────────────────
  const StatusIcon = ({ item }: { item: QueuedFile }) => {
    switch (item.status) {
      case "done":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
      case "reading":
      case "uploading":
        return <Loader2 className="h-4 w-4 text-[#C026D3] animate-spin flex-shrink-0" />;
      default:
        return <Film className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderUp className="h-5 w-5 text-[#C026D3]" />
            Bulk Video Upload
          </DialogTitle>
          <DialogDescription>
            Select multiple video files. Each one creates a lesson with auto-extracted duration and thumbnail.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* ── Drop Zone (shown when queue empty or for adding more) ── */}
          {!isProcessing && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-all",
                  dragActive
                    ? "border-[#C026D3] bg-fuchsia-50 dark:bg-fuchsia-950/20"
                    : "border-muted-foreground/25 hover:border-[#C026D3]/50 hover:bg-muted/30"
                )}
              >
                <Upload className={cn("h-6 w-6", dragActive ? "text-[#C026D3]" : "text-muted-foreground")} />
                <p className="text-sm font-medium">
                  {queue.length === 0 ? "Drop video files here or click to browse" : "Add more videos"}
                </p>
                <p className="text-xs text-muted-foreground">MP4, MOV, WebM — up to 4 GB each</p>
              </div>
            </>
          )}

          {/* ── Overall Progress ── */}
          {isProcessing && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Uploading {doneFiles} of {totalFiles} videos...
                </span>
                <span className="font-medium text-[#C026D3] tabular-nums">{overallProgress}%</span>
              </div>
              <Progress value={overallProgress} className="h-2" indicatorClassName="bg-[#C026D3]" />
            </div>
          )}

          {/* ── Completed summary ── */}
          {allDone && !isProcessing && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  {doneFiles} video{doneFiles !== 1 ? "s" : ""} uploaded successfully
                  {errorFiles > 0 && `, ${errorFiles} failed`}
                </p>
              </div>
            </div>
          )}

          {/* ── File Queue ── */}
          {queue.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                {queue.length} video{queue.length !== 1 ? "s" : ""} queued
              </Label>

              {queue.map((item, idx) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-lg border p-3 space-y-2 transition-colors",
                    item.status === "done" && "bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-800",
                    item.status === "error" && "bg-red-50/50 dark:bg-red-950/10 border-red-200 dark:border-red-800"
                  )}
                >
                  {/* File header row */}
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium flex-shrink-0">
                      {idx + 1}
                    </span>
                    <StatusIcon item={item} />
                    <div className="flex-1 min-w-0">
                      <Input
                        value={item.title}
                        onChange={(e) => updateFile(item.id, { title: e.target.value })}
                        disabled={isProcessing || item.status === "done"}
                        className="h-8 text-sm"
                        placeholder="Lesson title"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0 hidden sm:block">
                      {formatBytes(item.file.size)}
                    </span>
                    {!isProcessing && item.status !== "done" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 flex-shrink-0"
                        onClick={() => removeFile(item.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Options row */}
                  {!isProcessing && item.status === "pending" && (
                    <div className="flex items-center gap-4 pl-9 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Checkbox
                          id={`free-${item.id}`}
                          checked={item.isFree}
                          onCheckedChange={(checked) =>
                            updateFile(item.id, { isFree: checked === true })
                          }
                          className="h-3.5 w-3.5"
                        />
                        <label htmlFor={`free-${item.id}`} className="text-muted-foreground cursor-pointer">
                          Free preview
                        </label>
                      </div>
                      <span className="text-muted-foreground">
                        Lesson #{item.order + 1}
                      </span>
                    </div>
                  )}

                  {/* Per-file progress */}
                  {(item.status === "reading" || item.status === "uploading") && (
                    <div className="pl-9 space-y-1">
                      <Progress value={item.progress} className="h-1.5" indicatorClassName="bg-[#C026D3]" />
                      <p className="text-xs text-muted-foreground">
                        {item.status === "reading" ? "Reading file..." : "Uploading & processing..."}
                      </p>
                    </div>
                  )}

                  {/* Error message */}
                  {item.status === "error" && item.error && (
                    <p className="pl-9 text-xs text-red-600">{item.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between border-t pt-4 mt-2">
          <div className="text-xs text-muted-foreground">
            {queue.length > 0 && !isProcessing && !allDone && (
              <>
                {queue.reduce((sum, f) => sum + f.file.size, 0) > 0 &&
                  `Total: ${formatBytes(queue.reduce((sum, f) => sum + f.file.size, 0))}`}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isProcessing}
            >
              {allDone ? "Close" : "Cancel"}
            </Button>
            {!allDone && (
              <Button
                onClick={startUpload}
                disabled={queue.length === 0 || isProcessing || queue.every((f) => f.status === "done")}
                className="bg-[#C026D3] hover:bg-[#A21CAF] text-white"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {queue.filter((f) => f.status === "pending").length} Video{queue.filter((f) => f.status === "pending").length !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
