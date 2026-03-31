import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Lock,
  CheckCircle,
  Play,
  X,
  Crown,
  Clock,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Eye,
  Users,
  Star,
  Sparkles,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { useProgressiveAuth } from "@/hooks/useProgressiveAuth";
import { ProgressiveAuthModal } from "@/components/ProgressiveAuthModal";
import { useState, useRef, useEffect } from "react";

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function CourseDetail() {
  const params = useParams();
  const courseId = Number(params.id);
  const { user, isAuthenticated } = useAuth();
  const { isAuthModalOpen, authContext, authContextDetails, requireAuth, closeAuthModal } = useProgressiveAuth();

  const [showMobileCTA, setShowMobileCTA] = useState(false);
  const [isMobileCTADismissed, setIsMobileCTADismissed] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());
  const heroRef = useRef<HTMLDivElement>(null);

  const { data: course, isLoading } = trpc.courses.getById.useQuery({ id: courseId });
  const { data: hasAccess } = trpc.courses.hasAccess.useQuery(
    { courseId },
    { enabled: isAuthenticated }
  );
  const { data: membershipStatus } = trpc.membership.getStatus.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const { data: curriculum } = trpc.courses.getPublicCurriculum.useQuery(
    { courseId },
    { enabled: !!courseId }
  );

  const checkoutMutation = trpc.purchases.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        toast.info("Redirecting to checkout...");
        window.open(data.url, "_blank");
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create checkout session");
    },
  });

  // Mobile sticky CTA
  useEffect(() => {
    if (!heroRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (window.innerWidth < 1024) {
          setShowMobileCTA(!entry.isIntersecting && !isMobileCTADismissed);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, [isMobileCTADismissed]);

  // Auto-expand first module
  useEffect(() => {
    if (curriculum && curriculum.length > 0 && expandedModules.size === 0) {
      setExpandedModules(new Set([curriculum[0].id]));
    }
  }, [curriculum]);

  const handlePurchase = () => {
    const contextDetails = course ? `${course.title}${course.isFree ? " (Free)" : ` - €${course.price}`}` : "Course";
    requireAuth("course", contextDetails, () => {
      if (course?.isFree) {
        toast.success("You now have access to this free course!");
        window.location.reload();
        return;
      }
      checkoutMutation.mutate({ courseId });
    });
  };

  // Derived
  const canAccess = course?.isFree || (isAuthenticated && hasAccess);
  const totalLessons = curriculum?.reduce((sum, m) => sum + m.lessons.length, 0) || 0;
  const totalDuration = curriculum?.reduce(
    (sum, m) => sum + m.lessons.reduce((s: number, l: any) => s + (l.durationSeconds || 0), 0),
    0
  ) || 0;
  const freeLessons = curriculum?.reduce(
    (sum, m) => sum + m.lessons.filter((l: any) => l.isFree).length, 0
  ) || 0;

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="min-h-screen">
        <div className="bg-gradient-to-br from-fuchsia-950 via-purple-950 to-black h-[50vh] animate-pulse" />
        <div className="container max-w-5xl -mt-16 px-4">
          <div className="bg-card rounded-2xl p-8 shadow-xl animate-pulse">
            <div className="h-8 bg-muted rounded w-2/3 mb-4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="text-5xl mb-4">🩰</div>
        <h2 className="text-2xl font-bold mb-2">Course Not Found</h2>
        <p className="text-muted-foreground mb-6">This course doesn't exist or has been removed.</p>
        <Link href="/courses"><Button>Browse Courses</Button></Link>
      </div>
    );
  }

  // ── CTA Button ──
  const CTAButton = ({ size = "lg", fullWidth = true }: { size?: "lg" | "default" | "sm"; fullWidth?: boolean }) => {
    const cls = fullWidth ? "w-full" : "";
    if (canAccess) {
      return (
        <Button asChild size={size} className={`${cls} bg-[#C026D3] hover:bg-[#A21CAF] text-white shadow-lg`}>
          <Link href={`/course/${courseId}/learn`}>
            <Play className="h-5 w-5 mr-2" />
            Access the Course
          </Link>
        </Button>
      );
    }
    if (course.isFree) {
      return (
        <Button size={size} className={`${cls} bg-[#C026D3] hover:bg-[#A21CAF] text-white shadow-lg`} onClick={handlePurchase}>
          <Sparkles className="h-5 w-5 mr-2" />
          Start Free Course
        </Button>
      );
    }
    return (
      <Button
        size={size}
        className={`${cls} bg-[#C026D3] hover:bg-[#A21CAF] text-white shadow-lg`}
        onClick={handlePurchase}
        disabled={checkoutMutation.isPending}
      >
        {checkoutMutation.isPending ? "Processing..." : `Purchase for €${course.price}`}
      </Button>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero Section ────────────────────────── */}
      <div ref={heroRef} className="relative bg-gradient-to-br from-fuchsia-950 via-purple-950 to-black overflow-hidden">
        {/* Back button */}
        <div className="absolute top-0 left-0 right-0 z-20">
          <div className="container max-w-5xl px-4 py-4">
            <Link href="/courses">
              <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10">
                <ArrowLeft className="h-4 w-4 mr-2" />
                All Courses
              </Button>
            </Link>
          </div>
        </div>

        {/* Background image with overlay */}
        {course.imageUrl && (
          <div className="absolute inset-0 opacity-20">
            <img src={course.imageUrl} alt="" className="w-full h-full object-cover blur-2xl scale-110" />
          </div>
        )}

        <div className="container max-w-5xl px-4 pt-20 pb-32 relative z-10">
          <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-center">
            {/* Left: text */}
            <div className="text-white">
              <div className="flex items-center gap-3 mb-4">
                {course.isFree ? (
                  <Badge className="bg-emerald-500/90 text-white border-0 text-sm px-3 py-1">Free Course</Badge>
                ) : (
                  <Badge className="bg-white/15 text-white border-0 backdrop-blur-sm text-sm px-3 py-1">
                    Premium Course
                  </Badge>
                )}
                {canAccess && (
                  <Badge className="bg-emerald-500/90 text-white border-0 text-sm px-3 py-1">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Enrolled
                  </Badge>
                )}
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-4 tracking-tight">
                {course.title}
              </h1>

              <p className="text-lg text-white/70 leading-relaxed mb-6 max-w-xl line-clamp-3">
                {course.description}
              </p>

              {/* Meta pills */}
              <div className="flex flex-wrap items-center gap-3 mb-8">
                {totalLessons > 0 && (
                  <span className="flex items-center gap-1.5 text-sm text-white/60 bg-white/10 rounded-full px-3 py-1.5">
                    <BookOpen className="h-4 w-4" />
                    {totalLessons} lessons
                  </span>
                )}
                {totalDuration > 0 && (
                  <span className="flex items-center gap-1.5 text-sm text-white/60 bg-white/10 rounded-full px-3 py-1.5">
                    <Clock className="h-4 w-4" />
                    {Math.round(totalDuration / 60)} min
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-sm text-white/60 bg-white/10 rounded-full px-3 py-1.5">
                  <Star className="h-4 w-4" />
                  All Levels
                </span>
              </div>

              {/* CTA — prominent on desktop */}
              <div className="hidden lg:flex items-center gap-4">
                <CTAButton fullWidth={false} />
                {!canAccess && !course.isFree && !membershipStatus?.isActive && (
                  <Link href="/membership">
                    <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10">
                      <Crown className="h-4 w-4 mr-2" />
                      Membership
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            {/* Right: preview video or image */}
            <div className="relative group">
              <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                {course.previewVideoUrl ? (
                  <video
                    src={course.previewVideoUrl}
                    poster={course.imageUrl || undefined}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : course.imageUrl ? (
                  <img src={course.imageUrl} alt={course.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-fuchsia-800 to-purple-800 flex items-center justify-center">
                    <span className="text-7xl">💃</span>
                  </div>
                )}
              </div>
              {freeLessons > 0 && !canAccess && (
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-white text-[#C026D3] shadow-lg border-0 text-xs px-3 py-1">
                    <Eye className="h-3 w-3 mr-1" />
                    {freeLessons} free preview{freeLessons > 1 ? "s" : ""}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content Area ───────────────────────── */}
      <div className="container max-w-5xl px-4 -mt-16 relative z-10 pb-24">
        <div className="grid lg:grid-cols-[1fr_340px] gap-8">

          {/* ── Left Column ──────────────────────── */}
          <div className="space-y-8">

            {/* Mobile CTA card */}
            <Card className="lg:hidden shadow-xl border-2 border-[#C026D3]/20">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{course.isFree ? "Free" : `€${course.price}`}</span>
                  {course.originalPrice && Number(course.originalPrice) > Number(course.price) && (
                    <span className="text-lg text-muted-foreground line-through">€{course.originalPrice}</span>
                  )}
                </div>
                <CTAButton />
                {!canAccess && !course.isFree && !membershipStatus?.isActive && (
                  <p className="text-center text-xs text-muted-foreground">
                    or <Link href="/membership" className="text-[#C026D3] font-semibold hover:underline">get Membership</Link> for unlimited access
                  </p>
                )}
              </CardContent>
            </Card>

            {/* What you'll learn */}
            {course.description && (
              <Card className="shadow-lg">
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-[#C026D3]" />
                    About This Course
                  </h2>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {course.description}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Curriculum */}
            {curriculum && curriculum.length > 0 && (
              <Card className="shadow-lg">
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-[#C026D3]" />
                    Course Curriculum
                  </h2>
                  <p className="text-sm text-muted-foreground mb-5">
                    {totalLessons} lessons
                    {totalDuration > 0 && ` \u00b7 ${Math.round(totalDuration / 60)} min total`}
                  </p>

                  <div className="space-y-3">
                    {curriculum.map((module) => {
                      const isExpanded = expandedModules.has(module.id);
                      const moduleDuration = module.lessons.reduce((s: number, l: any) => s + (l.durationSeconds || 0), 0);
                      return (
                        <div key={module.id} className="rounded-xl border overflow-hidden">
                          <button
                            onClick={() => {
                              setExpandedModules((prev) => {
                                const next = new Set(prev);
                                next.has(module.id) ? next.delete(module.id) : next.add(module.id);
                                return next;
                              });
                            }}
                            className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
                          >
                            <div>
                              <h3 className="font-semibold text-sm">{module.title}</h3>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {module.lessons.length} lesson{module.lessons.length !== 1 ? "s" : ""}
                                {moduleDuration > 0 && ` \u00b7 ${Math.round(moduleDuration / 60)} min`}
                              </p>
                            </div>
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </button>
                          {isExpanded && (
                            <div className="border-t">
                              {module.lessons.map((lesson: any, idx: number) => (
                                <div
                                  key={lesson.id}
                                  className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/30 transition-colors border-b last:border-b-0"
                                >
                                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium flex-shrink-0">
                                    {idx + 1}
                                  </span>
                                  <span className="flex-1 truncate">{lesson.title}</span>
                                  {lesson.isFree && (
                                    <Badge variant="outline" className="text-[10px] border-[#C026D3]/40 text-[#C026D3] flex-shrink-0">
                                      <Eye className="h-2.5 w-2.5 mr-0.5" />
                                      Preview
                                    </Badge>
                                  )}
                                  {lesson.durationSeconds > 0 && (
                                    <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                                      {fmt(lesson.durationSeconds)}
                                    </span>
                                  )}
                                  {!canAccess && !lesson.isFree && (
                                    <Lock className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Instructor */}
            <Card className="shadow-lg">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#C026D3]" />
                  Your Instructor
                </h2>
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-fuchsia-400 to-purple-500 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-lg">
                    EZ
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Elizabeth Zolotova</h3>
                    <p className="text-sm text-[#C026D3] font-medium mb-2">Professional High Heels Dance Instructor</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      With years of experience in high heels dance, Elizabeth brings passion, expertise, and an infectious energy to every class. Her teaching style focuses on building confidence through movement, proper technique, and self-expression.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Right Column (Desktop sticky CTA) ── */}
          <div className="hidden lg:block">
            <div className="sticky top-8 space-y-4">
              <Card className="shadow-xl border-2 border-[#C026D3]/15">
                <CardContent className="p-6 space-y-5">
                  {/* Price */}
                  <div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-4xl font-bold">{course.isFree ? "Free" : `€${course.price}`}</span>
                      {course.originalPrice && Number(course.originalPrice) > Number(course.price) && (
                        <span className="text-xl text-muted-foreground line-through">€{course.originalPrice}</span>
                      )}
                    </div>
                    {course.originalPrice && Number(course.originalPrice) > Number(course.price) && (
                      <p className="text-sm text-emerald-600 font-medium">
                        Save €{(Number(course.originalPrice) - Number(course.price)).toFixed(2)}
                      </p>
                    )}
                  </div>

                  {/* CTA */}
                  <CTAButton />

                  {/* Membership upsell */}
                  {!canAccess && !course.isFree && !membershipStatus?.isActive && (
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-2">Or get unlimited access</p>
                      <Link href="/membership">
                        <Button variant="outline" className="w-full" size="sm">
                          <Crown className="h-4 w-4 mr-2" />
                          View Membership
                        </Button>
                      </Link>
                    </div>
                  )}

                  {/* Access confirmation */}
                  {canAccess && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3">
                      <CheckCircle className="h-4 w-4 flex-shrink-0" />
                      <span>You have full access to this course</span>
                    </div>
                  )}

                  {/* Course stats */}
                  <div className="border-t pt-4 space-y-3 text-sm">
                    {totalLessons > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Lessons</span>
                        <span className="font-medium">{totalLessons}</span>
                      </div>
                    )}
                    {totalDuration > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duration</span>
                        <span className="font-medium">{Math.round(totalDuration / 60)} min</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Level</span>
                      <span className="font-medium">All Levels</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Access</span>
                      <span className="font-medium">{course.isFree ? "Free" : "Lifetime"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile Sticky CTA ──────────────────── */}
      {showMobileCTA && !isMobileCTADismissed && (
        <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t shadow-2xl z-50 lg:hidden animate-in slide-in-from-bottom duration-300">
          <div className="container py-3 flex items-center gap-3 px-4">
            <div className="flex-1 min-w-0">
              <span className="text-lg font-bold">{course.isFree ? "Free" : `€${course.price}`}</span>
              <p className="text-xs text-muted-foreground truncate">{course.title}</p>
            </div>
            <CTAButton size="default" fullWidth={false} />
            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => setIsMobileCTADismissed(true)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Progressive Auth Modal */}
      <ProgressiveAuthModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
        context={authContext || "course"}
        contextDetails={authContextDetails}
      />
    </div>
  );
}
