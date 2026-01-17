import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Lock, CheckCircle, Play } from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { useProgressiveAuth } from "@/hooks/useProgressiveAuth";
import { ProgressiveAuthModal } from "@/components/ProgressiveAuthModal";

export default function CourseDetail() {
  const params = useParams();
  const courseId = Number(params.id);
  const { user, isAuthenticated } = useAuth();
  const { isAuthModalOpen, authContext, authContextDetails, requireAuth, closeAuthModal } = useProgressiveAuth();
  
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

  const handlePurchase = () => {
    // Allow guests to click the button - auth happens at final step
    const contextDetails = course ? `${course.title}${course.isFree ? ' (Free)' : ` - €${course.price}`}` : 'Course';
    
    requireAuth('course', contextDetails, () => {
      if (course?.isFree) {
        // Free courses don't need checkout
        toast.success("You now have access to this free course!");
        window.location.reload();
        return;
      }
      
      // Create Stripe checkout session
      checkoutMutation.mutate({ courseId });
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <header className="border-b bg-card">
          <div className="container py-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Courses
              </Button>
            </Link>
          </div>
        </header>
        <div className="container py-16">
          <div className="animate-pulse">
            <div className="h-96 bg-muted rounded-lg mb-8"></div>
            <div className="h-8 bg-muted rounded w-1/2 mb-4"></div>
            <div className="h-4 bg-muted rounded w-3/4"></div>
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
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Courses
              </Button>
            </Link>
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

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="container py-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Courses
            </Button>
          </Link>
        </div>
      </header>

      <div className="container py-16">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <div className="aspect-video bg-gradient-to-br from-pink-100 to-purple-100 rounded-lg mb-8 flex items-center justify-center overflow-hidden relative">
              {course.imageUrl ? (
                <img 
                  src={course.imageUrl} 
                  alt={course.title} 
                  loading="lazy" 
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
                <span className="text-9xl">💃</span>
              )}
            </div>

            <div className="flex items-start justify-between mb-4">
              <h1 className="text-4xl font-bold">{course.title}</h1>
              {course.isFree && (
                <Badge variant="secondary" className="text-lg px-4 py-1">Free</Badge>
              )}
            </div>

            <p className="text-lg text-muted-foreground mb-8 whitespace-pre-wrap">
              {course.description}
            </p>

            {canAccess ? (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  You have access to this course! Content will be available here.
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

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-8">
              <CardHeader>
                <CardTitle>Course Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-3xl font-bold text-primary">
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

                {!canAccess && (
                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={handlePurchase}
                    disabled={checkoutMutation.isPending}
                  >
                    {checkoutMutation.isPending 
                      ? "Processing..." 
                      : course.isFree 
                        ? "Enroll for Free" 
                        : "Purchase Course"}
                  </Button>
                )}

                {canAccess && (
                  <Link href={`/course/${courseId}/learn`}>
                    <Button 
                      className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700" 
                      size="lg"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Start Learning
                    </Button>
                  </Link>
                )}

                <div className="pt-4 border-t space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Level</span>
                    <span className="font-medium">All Levels</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Language</span>
                    <span className="font-medium">English</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Access</span>
                    <span className="font-medium">Lifetime</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

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
