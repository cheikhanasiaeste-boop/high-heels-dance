import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Star,
  Sparkles,
  Trophy,
  Camera,
  Video,
  X,
  ChevronRight,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CertificateButton } from "@/components/CertificateButton";

interface CourseCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: number;
  courseTitle: string;
}

// Flow: congrats → share → feedback (rating + text + photo/video) → done
type Step = "congrats" | "share" | "feedback" | "done";

export function CourseCompletionModal({
  isOpen,
  onClose,
  courseId,
  courseTitle,
}: CourseCompletionModalProps) {
  const [step, setStep] = useState<Step>("congrats");
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const uploadMediaMutation = trpc.testimonials.uploadTestimonialMedia.useMutation();
  const submitTestimonialMutation = trpc.testimonials.submitCourseTestimonial.useMutation({
    onSuccess: () => {
      toast.success("Thank you for your feedback!");
      setStep("done");
    },
    onError: (err) => {
      if (err.message.includes("already submitted")) {
        setStep("done");
      } else {
        toast.error("Failed to submit. Please try again.");
      }
    },
  });

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { toast.error("File must be under 50MB"); return; }
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleRemoveMedia = () => {
    setMediaFile(null);
    if (mediaPreview) { URL.revokeObjectURL(mediaPreview); setMediaPreview(null); }
  };

  const handleSubmitFeedback = async () => {
    if (rating === 0) { toast.error("Please select a rating"); return; }
    if (!feedback.trim() || feedback.trim().length < 10) { toast.error("Please write a short review (10+ characters)"); return; }

    setIsSubmitting(true);
    let photoUrl: string | undefined;
    let videoUrl: string | undefined;

    if (mediaFile) {
      try {
        const base64 = await readFileAsBase64(mediaFile);
        const { url } = await uploadMediaMutation.mutateAsync({
          fileName: mediaFile.name,
          fileType: mediaFile.type,
          fileData: base64,
        });
        if (mediaFile.type.startsWith("image/")) photoUrl = url;
        else videoUrl = url;
      } catch {
        toast.error("Media upload failed, submitting feedback without it.");
      }
    }

    submitTestimonialMutation.mutate({ courseId, rating, content: feedback, photoUrl, videoUrl });
    setIsSubmitting(false);
  };

  const handleClose = () => {
    setStep("congrats");
    setRating(0);
    setFeedback("");
    setHoveredRating(0);
    handleRemoveMedia();
    setIsSubmitting(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">

        {/* ── Step 1: Congrats ── */}
        {step === "congrats" && (
          <>
            <DialogHeader>
              <div className="flex justify-center mb-2">
                <div className="relative">
                  <div className="text-7xl leading-none">🎉</div>
                  <Sparkles className="w-6 h-6 text-pink-500 absolute -top-1 -right-3 animate-pulse" />
                  <Sparkles className="w-4 h-4 text-purple-500 absolute bottom-2 -left-3 animate-pulse" />
                </div>
              </div>
              <DialogTitle className="text-2xl text-center">
                Congratulations!
              </DialogTitle>
              <DialogDescription className="text-center text-base mt-2">
                You've completed{" "}
                <span className="font-semibold text-foreground">{courseTitle}</span>!
                <br />
                <span className="text-sm">You should be proud of yourself 💃</span>
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 pt-4">
              <Button
                onClick={() => setStep("share")}
                className="w-full bg-[#C026D3] hover:bg-[#A21CAF] text-white"
                size="lg"
              >
                Share Your Achievement
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
              <Button variant="ghost" onClick={() => setStep("feedback")} className="text-muted-foreground text-sm">
                Skip to leaving feedback
              </Button>
            </div>
          </>
        )}

        {/* ── Step 2: Share Achievement ── */}
        {step === "share" && (
          <>
            <DialogHeader>
              <div className="flex justify-center mb-2">
                <Trophy className="w-14 h-14 text-amber-400" />
              </div>
              <DialogTitle className="text-xl text-center">
                Show the World!
              </DialogTitle>
              <DialogDescription className="text-center">
                Share your achievement on Instagram, WhatsApp, or save it to your photos.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 py-2">
              <CertificateButton
                courseId={courseId}
                variant="default"
                size="lg"
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="ghost" onClick={() => setStep("congrats")}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button
                onClick={() => setStep("feedback")}
                className="flex-1"
                variant="outline"
              >
                Next: Leave a Review
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </>
        )}

        {/* ── Step 3: Rating + Written Feedback + Photo/Video ── */}
        {step === "feedback" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-400" />
                Leave a Review
              </DialogTitle>
              <DialogDescription>
                Your feedback helps Elizabeth improve and helps other students decide.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Star Rating */}
              <div className="flex gap-2 justify-center">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(0)}
                    className="transition-transform hover:scale-125 active:scale-95"
                  >
                    <Star
                      className={`w-10 h-10 ${
                        star <= (hoveredRating || rating)
                          ? "fill-amber-400 text-amber-400"
                          : "text-gray-200 dark:text-gray-600"
                      }`}
                    />
                  </button>
                ))}
              </div>

              {/* Written Feedback */}
              <div className="space-y-1.5">
                <Label htmlFor="comp-feedback">What did you think?</Label>
                <Textarea
                  id="comp-feedback"
                  placeholder="What did you learn? What was your favourite part? How did it help you?"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* Photo / Video */}
              <div className="space-y-1.5">
                <Label className="text-sm">Add a photo or video (optional)</Label>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleMediaSelect} className="hidden" />
                <input ref={videoInputRef} type="file" accept="video/*" capture="environment" onChange={handleMediaSelect} className="hidden" />

                {!mediaFile ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 p-3 rounded-lg border border-dashed hover:border-[#C026D3]/50 hover:bg-fuchsia-50/50 dark:hover:bg-fuchsia-950/10 transition-colors text-sm"
                    >
                      <Camera className="h-5 w-5 text-pink-500 flex-shrink-0" />
                      <span>Photo</span>
                    </button>
                    <button
                      onClick={() => videoInputRef.current?.click()}
                      className="flex items-center gap-2 p-3 rounded-lg border border-dashed hover:border-[#C026D3]/50 hover:bg-fuchsia-50/50 dark:hover:bg-fuchsia-950/10 transition-colors text-sm"
                    >
                      <Video className="h-5 w-5 text-purple-500 flex-shrink-0" />
                      <span>Video</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
                    {mediaFile.type.startsWith("image/") && mediaPreview ? (
                      <img src={mediaPreview} alt="Preview" className="h-14 w-14 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                        <Video className="h-6 w-6 text-purple-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{mediaFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(mediaFile.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={handleRemoveMedia}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setStep("share")}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button
                onClick={handleSubmitFeedback}
                disabled={isSubmitting || submitTestimonialMutation.isPending}
                className="flex-1 bg-[#C026D3] hover:bg-[#A21CAF] text-white"
              >
                {isSubmitting || submitTestimonialMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</>
                ) : (
                  "Submit Review"
                )}
              </Button>
            </div>
          </>
        )}

        {/* ── Step 4: Done ── */}
        {step === "done" && (
          <>
            <DialogHeader>
              <div className="flex justify-center mb-2">
                <div className="text-5xl leading-none">✨</div>
              </div>
              <DialogTitle className="text-xl text-center">
                You're amazing — thank you!
              </DialogTitle>
              <DialogDescription className="text-center">
                Your review will help others discover this course. Keep dancing!
              </DialogDescription>
            </DialogHeader>

            <div className="pt-2">
              <Button onClick={handleClose} className="w-full" variant="outline">
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result?.toString().split(",")[1];
      result ? resolve(result) : reject(new Error("Failed to read"));
    };
    reader.onerror = () => reject(new Error("Failed to read"));
    reader.readAsDataURL(file);
  });
}
