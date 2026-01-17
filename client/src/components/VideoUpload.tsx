import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Video } from "lucide-react";
import { toast } from "sonner";

interface VideoUploadProps {
  onUpload: (file: File) => Promise<void>;
  currentVideoUrl?: string | null;
  onRemove?: () => Promise<void>;
  label?: string;
}

export function VideoUpload({ onUpload, currentVideoUrl, onRemove, label = "Upload Video" }: VideoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("video/")) {
      toast.error("Please select a video file");
      return;
    }

    // Validate file size (max 100MB)
    if (file.size > 100 * 1024 * 1024) {
      toast.error("Video file must be less than 100MB");
      return;
    }

    setUploading(true);
    try {
      await onUpload(file);
      toast.success("Video uploaded successfully");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload video");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;
    
    try {
      await onRemove();
      toast.success("Video removed successfully");
    } catch (error) {
      console.error("Remove error:", error);
      toast.error("Failed to remove video");
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelect}
        disabled={uploading}
      />

      {currentVideoUrl ? (
        <div className="space-y-2">
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            <video
              src={currentVideoUrl}
              controls
              className="w-full h-full"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="w-4 h-4 mr-2" />
              Replace Video
            </Button>
            {onRemove && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRemove}
              >
                <X className="w-4 h-4 mr-2" />
                Remove
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full h-32 border-dashed"
        >
          {uploading ? (
            <span>Uploading...</span>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Video className="w-8 h-8 text-muted-foreground" />
              <span>{label}</span>
              <span className="text-xs text-muted-foreground">Max 100MB</span>
            </div>
          )}
        </Button>
      )}
    </div>
  );
}
