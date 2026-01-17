import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, Sparkles, Trophy } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface CourseCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: number;
  courseTitle: string;
}

export function CourseCompletionModal({
  isOpen,
  onClose,
  courseId,
  courseTitle,
}: CourseCompletionModalProps) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [hoveredRating, setHoveredRating] = useState(0);

  const submitTestimonialMutation = trpc.testimonials.submitCourseTestimonial.useMutation({
    onSuccess: () => {
      toast.success("Thank you for your feedback! It will be reviewed by our team.");
      setFeedback("");
      setRating(0);
      onClose();
    },
    onError: () => {
      toast.error("Failed to submit feedback. Please try again.");
    },
  });

  const handleSubmit = () => {
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }
    if (!feedback.trim()) {
      toast.error("Please write your feedback");
      return;
    }

    submitTestimonialMutation.mutate({
      courseId,
      rating,
      content: feedback,
    });
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="relative">
              <Trophy className="w-20 h-20 text-yellow-500" />
              <Sparkles className="w-6 h-6 text-pink-500 absolute -top-2 -right-2 animate-pulse" />
              <Sparkles className="w-4 h-4 text-purple-500 absolute -bottom-1 -left-1 animate-pulse delay-150" />
            </div>
          </div>
          <DialogTitle className="text-2xl text-center">
            Congratulations! 🎉
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            You've completed <span className="font-semibold text-foreground">{courseTitle}</span>!
            <br />
            Share your experience to help others discover this course.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Star Rating */}
          <div className="space-y-2">
            <Label>How would you rate this course?</Label>
            <div className="flex gap-2 justify-center">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-8 h-8 ${
                      star <= (hoveredRating || rating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Feedback Textarea */}
          <div className="space-y-2">
            <Label htmlFor="feedback">Your Feedback</Label>
            <Textarea
              id="feedback"
              placeholder="Share what you learned, what you enjoyed, and how this course helped you..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={5}
              className="resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleSkip}
            className="flex-1"
            disabled={submitTestimonialMutation.isPending}
          >
            Skip for Now
          </Button>
          <Button
            onClick={handleSubmit}
            className="flex-1 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700"
            disabled={submitTestimonialMutation.isPending}
          >
            {submitTestimonialMutation.isPending ? "Submitting..." : "Submit Feedback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
