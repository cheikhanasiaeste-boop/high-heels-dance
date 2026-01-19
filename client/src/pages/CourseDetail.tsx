import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Lock, CheckCircle, Play, X } from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { useProgressiveAuth } from "@/hooks/useProgressiveAuth";
import { ProgressiveAuthModal } from "@/components/ProgressiveAuthModal";
import { useState, useEffect, useRef } from "react";

export default function CourseDetail() {
  const params = useParams();
  const courseId = Number(params.id);
  const { user, isAuthenticated } = useAuth();
  const { isAuthModalOpen, authContext, authContextDetails, requireAuth, closeAuthModal } = useProgressiveAuth();
  
  const [showMobileCTA, setShowMobileCTA] = useState(false);
  const [isMobileCTADismissed, setIsMobileCTADismissed] = useState(false);
  const videoRef = useRef<HTMLDivElement>(null);
  const ctaContainerRef = useRef<HTMLDivElement>(null);
  const footerObserverRef = useRef<HTMLDivElement>(null);
  
  const { data: course, isLoading } = trpc.courses.getById.useQuery({ id: courseId });
  const { data: hasAccess } = trpc.courses.hasAccess.useQuery(
    { courseId },
    { enabled: isAuthenticated }
  );
  
  const checkoutMutation = trpc.purchases.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        toast.info("Redirecting to checkout...");
        window.open(data.url, '_blank');
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create checkout session");
    },
  });

  // Mobile sticky CTA behavior - show when video scrolls out of view
  useEffect(() => {
    if (typeof window === 'undefined' || !videoRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show mobile CTA when video is not visible and user hasn't dismissed it
        if (window.innerWidth < 1024) { // lg breakpoint
          setShowMobileCTA(!entry.isIntersecting && !isMobileCTADismissed);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(videoRef.current);
    return () => observer.disconnect();
  }, [isMobileCTADismissed]);

  // Desktop sticky CTA - stop before footer
  useEffect(() => {
    if (typeof window === 'undefined' || !footerObserverRef.current || !ctaContainerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (ctaContainerRef.current) {
          // When footer is visible, stop sticky behavior
          if (entry.isIntersecting) {
            ctaContainerRef.current.style.position = 'absolute';
            ctaContainerRef.current.style.bottom = '0';
          } else {
            ctaContainerRef.current.style.position = 'sticky';
            ctaContainerRef.current.style.bottom = 'auto';
          }
        }
      },
      { threshold: 0 }
    );

    observer.observe(footerObserverRef.current);
    return () => observer.disconnect();
  }, []);

  const handlePurchase = () => {
    const contextDetails = course ? `${course.title}${course.isFree ? ' (Free)' : ` - €${course.price}`}` : 'Course';
    
    requireAuth('course', contextDetails, () => {
      if (course?.isFree) {
        toast.success("You now have access to this free course!");
        window.location.reload();
        return;
      }
      
      checkoutMutation.mutate({ courseId });
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <header className="border-b bg-card">
          <div className="container py-4">
            <a href="/courses">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Courses
              </Button>
            </a>
          </div>
        </header>
        <div className="container py-16">
          <div className="animate-pulse grid lg:grid-cols-[1fr_400px] gap-8">
            <div>
              <div className="h-64 bg-muted rounded-lg mb-6"></div>
              <div className="h-8 bg-muted rounded w-1/2 mb-4"></div>
              <div className="h-4 bg-muted rounded w-3/4"></div>
            </div>
            <div className="h-96 bg-muted rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen">
        <header className="border-b bg-card">
          <div className="container py-4">
            <a href="/courses">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Courses
              </Button>
            </a>
          </div>
        </header>
        <div className="container py-16 text-center">
          <h2 className="text-2xl font-bold mb-4">Course Not Found</h2>
          <p className="text-muted-foreground mb-8">The course you're looking for doesn't exist.</p>
          <Link href="/">
            <Button>Browse Courses</Button>
          </Link>
        </div>
      </div>
    );
  }

  const canAccess = course.isFree || (isAuthenticated && hasAccess);

  const CTAButton = () => {
    if (canAccess) {
      return (
        <Button 
          asChild
          className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-lg py-6" 
          size="lg"
        >
          <Link href={`/course/${courseId}/learn`}>
            <Play className="w-5 h-5 mr-2" />
            Start Learning
          </Link>
        </Button>
      );
    }

    return (
      <Button 
        className="w-full text-lg py-6" 
        size="lg"
        onClick={handlePurchase}
        disabled={checkoutMutation.isPending}
      >
        {checkoutMutation.isPending 
          ? "Processing..." 
          : course.isFree 
            ? "Enroll for Free" 
            : `Purchase for €${course.price}`}
      </Button>
    );
  };

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="container py-4">
          <a href="/courses">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Courses
            </Button>
          </a>
        </div>
      </header>

      <div className="container py-8 lg:py-16">
        {/* Two-column grid: Left (content) + Right (CTA) */}
        <div className="grid lg:grid-cols-[1fr_400px] gap-8 lg:gap-12">
          
          {/* LEFT COLUMN: Thumbnail + Description */}
          <div className="space-y-6">
            {/* Course Thumbnail - Compact */}
            <div className="aspect-video bg-gradient-to-br from-pink-100 to-purple-100 rounded-lg overflow-hidden relative shadow-lg">
              {course.imageUrl ? (
                <img 
                  src={course.imageUrl} 
                  alt={course.title} 
                  loading="eager"
                  className="absolute"
                  style={{
                    top: '50%',
                    left: '50%',
                    width: 'auto',
                    height: 'auto',
                    maxWidth: 'none',
                    maxHeight: 'none',
                    minWidth: '100%',
                    minHeight: '100%',
                    transform: `translate(-50%, -50%) scale(${parseFloat(course.imageCropZoom || "1.00")}) translate(${parseFloat(course.imageCropOffsetX || "0")}px, ${parseFloat(course.imageCropOffsetY || "0")}px)`,
                    transformOrigin: 'center center',
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-8xl">💃</span>
                </div>
              )}
            </div>

            {/* Course Title + Badge */}
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-3xl lg:text-4xl font-bold leading-tight">{course.title}</h1>
              {course.isFree && (
                <Badge variant="secondary" className="text-base px-3 py-1 shrink-0">Free</Badge>
              )}
            </div>

            {/* Course Description - Optimized readability */}
            <div className="prose prose-lg max-w-none">
              <p className="text-lg text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {course.description}
              </p>
            </div>

            {/* Access Status Alert */}
            {canAccess ? (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  You have access to this course! Click "Start Learning" to begin.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  {isAuthenticated 
                    ? "Purchase this course to access all content."
                    : "Sign in and purchase this course to access all content."}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* RIGHT COLUMN: Preview Video + Sticky CTA Container */}
          <div className="relative">
            <div className="lg:sticky lg:top-8 space-y-6" ref={ctaContainerRef}>
              
              {/* Preview Video */}
              <div 
                ref={videoRef}
                className="aspect-video bg-gradient-to-br from-purple-900 to-pink-900 rounded-lg overflow-hidden shadow-xl relative"
              >
                {course.previewVideoUrl ? (
                  <video
                    src={course.previewVideoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                    poster={course.imageUrl || undefined}
                  >
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                    <Play className="w-16 h-16 mb-4 opacity-50" />
                    <p className="text-sm opacity-75">Preview video coming soon</p>
                  </div>
                )}
              </div>

              {/* CTA Container - Sticky on desktop */}
              <Card className="shadow-xl border-2">
                <CardContent className="p-6 space-y-6">
                  
                  {/* Price Display */}
                  <div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-4xl font-bold text-primary">
                        {course.isFree ? 'Free' : `€${course.price}`}
                      </span>
                      {course.originalPrice && Number(course.originalPrice) > Number(course.price) && (
                        <span className="text-xl text-muted-foreground line-through">
                          €{course.originalPrice}
                        </span>
                      )}
                    </div>
                    {course.originalPrice && Number(course.originalPrice) > Number(course.price) && (
                      <p className="text-sm text-green-600 font-medium">
                        Save €{(Number(course.originalPrice) - Number(course.price)).toFixed(2)}
                      </p>
                    )}
                  </div>

                  {/* Primary CTA Button */}
                  <CTAButton />

                  {/* Course Metadata - Visually grouped */}
                  <div className="pt-4 border-t space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Level</span>
                      <Badge variant="outline" className="font-medium">All Levels</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Language</span>
                      <Badge variant="outline" className="font-medium">English</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Access</span>
                      <Badge variant="outline" className="font-medium">
                        {course.isFree ? 'Free' : 'Lifetime'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Footer observer for sticky behavior */}
            <div ref={footerObserverRef} className="absolute bottom-0 left-0 w-full h-1"></div>
          </div>
        </div>
      </div>

      {/* Mobile Sticky CTA Bar - Appears when video scrolls out */}
      {showMobileCTA && !isMobileCTADismissed && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-2xl z-50 lg:hidden animate-in slide-in-from-bottom duration-300">
          <div className="container py-4 flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-bold text-primary">
                  {course.isFree ? 'Free' : `€${course.price}`}
                </span>
                {course.originalPrice && Number(course.originalPrice) > Number(course.price) && (
                  <span className="text-sm text-muted-foreground line-through">
                    €{course.originalPrice}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{course.title}</p>
            </div>
            <CTAButton />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => setIsMobileCTADismissed(true)}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Progressive Authentication Modal */}
      <ProgressiveAuthModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
        context={authContext || 'course'}
        contextDetails={authContextDetails}
      />
    </div>
  );
}
