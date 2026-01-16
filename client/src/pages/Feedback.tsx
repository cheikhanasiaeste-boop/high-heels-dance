import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Star } from "lucide-react";
import { Link, useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Upload, Video } from "lucide-react";

export default function Feedback() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  
  // Get query parameters
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type') as 'session' | 'course' | null;
  const relatedId = params.get('id') ? parseInt(params.get('id')!) : null;
  
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const { data: canSubmitData } = trpc.testimonials.canSubmit.useQuery(
    { type: type!, relatedId: relatedId! },
    { enabled: isAuthenticated && !!type && !!relatedId }
  );

  const submitMutation = trpc.testimonials.submit.useMutation({
    onSuccess: () => {
      toast.success("Thank you for your feedback! It will be reviewed by our team.");
      navigate("/");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to submit feedback");
    },
  });

  const uploadVideoMutation = trpc.testimonials.uploadVideo.useMutation();

  const handleSubmit = async () => {
    if (!type || !relatedId) {
      toast.error("Invalid feedback request");
      return;
    }

    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    if (review.trim().length < 10) {
      toast.error("Please write at least 10 characters in your review");
      return;
    }

    let videoUrl: string | undefined;

    // Upload video if provided
    if (videoFile) {
      setUploading(true);
      try {
        toast.info("Uploading video...");
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const base64 = reader.result as string;
            resolve(base64.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(videoFile);
        });

        const base64Data = await base64Promise;
        const uploadResult = await uploadVideoMutation.mutateAsync({
          filename: videoFile.name,
          contentType: videoFile.type,
          data: base64Data,
        });

        videoUrl = uploadResult.url;
        toast.success("Video uploaded successfully!");
      } catch (error) {
        toast.error("Failed to upload video. Please try again.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    submitMutation.mutate({
      type,
      relatedId,
      rating,
      review: review.trim(),
      videoUrl,
    });
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Video file must be less than 50MB");
      return;
    }

    // Check file type
    if (!file.type.startsWith('video/')) {
      toast.error("Please select a valid video file");
      return;
    }

    setVideoFile(file);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  if (!type || !relatedId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-lavender-50 to-purple-50 flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Invalid Request</CardTitle>
            <CardDescription>Missing required parameters for feedback submission.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (canSubmitData && !canSubmitData.canSubmit) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-lavender-50 to-purple-50 flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Already Submitted</CardTitle>
            <CardDescription>You have already submitted feedback for this {type}.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-lavender-50 to-purple-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-pink-100">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              Share Your Feedback
            </h1>
          </div>
          <span className="text-sm text-muted-foreground">{user?.name || user?.email}</span>
        </div>
      </header>

      <div className="container py-12 flex justify-center">
        <Card className="max-w-2xl w-full">
          <CardHeader>
            <CardTitle>How was your experience?</CardTitle>
            <CardDescription>
              Your feedback helps us improve and helps other students make informed decisions.
              {type === 'session' ? ' Tell us about your dance session.' : ' Tell us about the course.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Rating */}
            <div className="space-y-2">
              <Label>Rating *</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-10 w-10 ${
                        star <= (hoverRating || rating)
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <p className="text-sm text-muted-foreground">
                  {rating === 1 && "Poor"}
                  {rating === 2 && "Fair"}
                  {rating === 3 && "Good"}
                  {rating === 4 && "Very Good"}
                  {rating === 5 && "Excellent"}
                </p>
              )}
            </div>

            {/* Review */}
            <div className="space-y-2">
              <Label htmlFor="review">Your Review *</Label>
              <Textarea
                id="review"
                placeholder="Share your experience... What did you like? What could be improved?"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                rows={6}
                className="resize-none"
              />
              <p className="text-sm text-muted-foreground">
                {review.length} / 10 characters minimum
              </p>
            </div>

            {/* Video Upload (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="video">Video Testimonial (Optional)</Label>
              <div className="border-2 border-dashed border-pink-200 rounded-lg p-6 text-center">
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleVideoSelect}
                  className="hidden"
                />
                {videoFile ? (
                  <div className="space-y-2">
                    <Video className="h-12 w-12 mx-auto text-pink-500" />
                    <p className="text-sm font-medium">{videoFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVideoFile(null)}
                    >
                      Remove Video
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                    <p className="text-sm font-medium">Upload a video testimonial</p>
                    <p className="text-xs text-muted-foreground">MP4, WebM (max 50MB)</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => videoInputRef.current?.click()}
                    >
                      Select Video
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Privacy Notice */}
            <div className="bg-pink-50/50 border border-pink-100 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                <strong>Privacy Notice:</strong> Your feedback will be reviewed by our team. 
                Approved testimonials may be featured on our homepage to help other students. 
                Your name will be displayed with your review.
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex gap-3">
              <Link href="/">
                <Button variant="outline" className="flex-1">
                  Cancel
                </Button>
              </Link>
              <Button
                onClick={handleSubmit}
                disabled={submitMutation.isPending || uploading || rating === 0 || review.trim().length < 10}
                className="flex-1"
              >
                {submitMutation.isPending ? "Submitting..." : "Submit Feedback"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
