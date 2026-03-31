import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useParams, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChevronDown, ChevronUp, Check, Home, Play, Lock, CheckCircle, Loader2, List, X, RefreshCw } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { CourseCompletionModal } from "@/components/CourseCompletionModal";
import { CourseBreadcrumb } from "@/components/CourseBreadcrumb";
import { useProgressiveAuth } from '@/hooks/useProgressiveAuth';
import { ProgressiveAuthModal } from '@/components/ProgressiveAuthModal';
import { HlsPlayer } from "@/components/HlsPlayer";

/** Fetches a signed playback URL and renders HLS or direct video */
function LessonVideoPlayer({
  lesson,
  courseId,
  initialTime,
  onTimeUpdate,
  onEnded,
}: {
  lesson: any;
  courseId: number;
  initialTime?: number;
  onTimeUpdate?: (time: number) => void;
  onEnded?: () => void;
}) {
  const hasBunnyVideo = lesson.bunnyVideoId && lesson.videoStatus === "ready";
  const hasDirectVideo = !!lesson.videoUrl;

  // Fetch signed URL from server (only for Bunny videos or direct videos that need access check)
  const { data: playback, isLoading, error } = trpc.courses.getVideoPlaybackUrl.useQuery(
    { lessonId: lesson.id, courseId },
    { enabled: hasBunnyVideo || hasDirectVideo, staleTime: 10 * 60 * 1000 /* 10 min cache */ }
  );

  if (!hasBunnyVideo && !hasDirectVideo) {
    return (
      <div className="aspect-video bg-stone-100 rounded-lg flex items-center justify-center mb-4">
        <p className="text-stone-400 text-sm">No video available for this lesson</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="aspect-video bg-black rounded-lg flex items-center justify-center mb-4">
        <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
      </div>
    );
  }

  if (error || !playback) {
    return (
      <div className="aspect-video bg-stone-100 rounded-lg flex flex-col items-center justify-center mb-4 gap-3">
        <p className="text-stone-500 text-sm text-center px-4">{error?.message || "Could not load video"}</p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 text-sm text-[#C026D3] hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4">
      <HlsPlayer
        src={playback.url}
        type={playback.type}
        poster={playback.thumbnailUrl}
        initialTime={initialTime}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
      />
    </div>
  );
}

export default function CourseLearn() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { isAuthModalOpen, authContext, authContextDetails, requireAuth, closeAuthModal } = useProgressiveAuth();
  
  const courseId = parseInt(id || "0");
  
  // State hooks MUST be called before any conditional returns
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());
  const [currentLessonId, setCurrentLessonId] = useState<number | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  
  // Prompt authentication if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      requireAuth('course', 'Course Content', () => {
        // After successful auth, page will reload and user will be authenticated
      });
    }
  }, [isAuthenticated, requireAuth]);
  
  // Fetch course data
  const { data: course, isLoading: courseLoading } = trpc.courses.getById.useQuery(
    { id: courseId },
    { enabled: !!courseId }
  );
  
  // Fetch modules with lessons
  const { data: modules, isLoading: modulesLoading } = trpc.courses.getModulesWithLessons.useQuery(
    { courseId },
    { enabled: isAuthenticated && !!courseId }
  );
  
  // Fetch user progress
  const { data: progress } = trpc.courses.getUserProgress.useQuery(
    { courseId },
    { enabled: isAuthenticated && !!courseId }
  );
  
  // Check if user has access
  const { data: hasAccess } = trpc.courses.checkAccess.useQuery(
    { courseId },
    { enabled: isAuthenticated && !!courseId }
  );
  
  // Auto-expand first module and select first lesson
  useEffect(() => {
    if (modules && modules.length > 0) {
      const firstModule = modules[0];
      setExpandedModules(new Set([firstModule.id]));
      
      if (firstModule.lessons && firstModule.lessons.length > 0) {
        setCurrentLessonId(firstModule.lessons[0].id);
      }
    }
  }, [modules]);
  
  const toggleModule = (moduleId: number) => {
    setExpandedModules(prev => {
      const newSet = new Set(prev);
      if (newSet.has(moduleId)) {
        newSet.delete(moduleId);
      } else {
        newSet.add(moduleId);
      }
      return newSet;
    });
  };
  
  // Calculate progress
  const calculateProgress = () => {
    if (!modules || !progress) return 0;
    
    const totalLessons = modules.reduce((acc, module) => 
      acc + (module.lessons?.length || 0), 0
    );
    
    if (totalLessons === 0) return 0;
    
    const completedLessons = progress.filter(p => p.isCompleted).length;
    return Math.round((completedLessons / totalLessons) * 100);
  };
  
  const isLessonCompleted = (lessonId: number) => {
    return progress?.some(p => p.lessonId === lessonId && p.isCompleted) || false;
  };
  
  const getModuleProgress = (module: any) => {
    if (!module.lessons || !progress) return { completed: 0, total: 0 };
    
    const total = module.lessons.length;
    const completed = module.lessons.filter((lesson: any) => 
      isLessonCompleted(lesson.id)
    ).length;
    
    return { completed, total };
  };
  
  const getCurrentLesson = () => {
    if (!modules || !currentLessonId) return null;
    
    for (const module of modules) {
      const lesson = module.lessons?.find((l: any) => l.id === currentLessonId);
      if (lesson) return { ...lesson, moduleName: module.title };
    }
    
    return null;
  };
  
  const currentLesson = getCurrentLesson();
  const progressPercentage = calculateProgress();
  
  // Mark lesson complete mutation
  const markCompleteMutation = trpc.courses.markLessonComplete.useMutation({
    onSuccess: () => {
      toast.success("Lesson marked as complete!");
      
      // Check if course is 100% complete
      const totalLessons = modules?.reduce((sum: number, module: any) => sum + module.lessons.length, 0) || 0;
      const completedLessons = progress?.filter((p: any) => p.isCompleted).length || 0;
      
      if (totalLessons > 0 && completedLessons + 1 >= totalLessons) {
        // Show completion modal after a short delay
        setTimeout(() => {
          setShowCompletionModal(true);
        }, 1000);
      }
    },
    onError: (error) => {
      toast.error("Failed to mark lesson as complete");
    },
  });
  
  const handleMarkComplete = () => {
    if (!currentLessonId || !courseId) return;
    markCompleteMutation.mutate({ lessonId: currentLessonId, courseId });
  };

  // ── Progress persistence: save every 10s, resume on load ──
  const { data: lessonProgress } = trpc.courses.getLessonProgress.useQuery(
    { lessonId: currentLessonId! },
    { enabled: isAuthenticated && !!currentLessonId }
  );

  const saveProgressMutation = trpc.courses.updateLessonProgress.useMutation();
  const lastSavedRef = useRef(0);

  const handleTimeUpdate = useCallback((currentTime: number) => {
    if (!currentLessonId || !courseId) return;
    const now = Date.now();
    // Save at most every 10 seconds
    if (now - lastSavedRef.current < 10_000) return;
    lastSavedRef.current = now;
    saveProgressMutation.mutate({
      lessonId: currentLessonId,
      courseId,
      watchedDuration: Math.round(currentTime),
    });
  }, [currentLessonId, courseId, saveProgressMutation]);

  // Reset debounce timer when lesson changes
  useEffect(() => {
    lastSavedRef.current = 0;
  }, [currentLessonId]);
  
  // Redirect to course detail page if not authenticated and modal is closed
  // MUST be before any conditional returns to maintain hooks order
  useEffect(() => {
    if (!isAuthenticated && !isAuthModalOpen) {
      // User closed the modal without authenticating - return them to course detail page
      setLocation(`/course/${courseId}`);
    }
  }, [isAuthenticated, isAuthModalOpen, courseId, setLocation]);
  
  // Redirect if no access
  if (!courseLoading && !hasAccess && isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-lavender-50 to-purple-50">
        <Card className="p-8 max-w-md text-center">
          <Lock className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-2xl font-bold mb-2">Course Access Required</h2>
          <p className="text-muted-foreground mb-6">
            You need to purchase this course to access the content.
          </p>
          <Link href={`/courses/${courseId}`}>
            <Button>View Course Details</Button>
          </Link>
        </Card>
      </div>
    );
  }
  
  if (courseLoading || modulesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading course...</p>
      </div>
    );
  }
  
  if (!course) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 max-w-md text-center">
          <h2 className="text-2xl font-bold mb-2">Course Not Found</h2>
          <Link href="/courses">
            <Button>Browse Courses</Button>
          </Link>
        </Card>
      </div>
    );
  }
  
  // Show modal if not authenticated
  if (!isAuthenticated) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
        
        {/* Progressive Authentication Modal */}
        <ProgressiveAuthModal
          isOpen={isAuthModalOpen}
          onClose={closeAuthModal}
          context={authContext || 'course'}
          contextDetails={authContextDetails}
        />
      </>
    );
  }
  
  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-lavender-50 to-purple-50">
      <div className="flex h-screen">
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-8">
            {/* Breadcrumb Navigation */}
            <CourseBreadcrumb 
              courseName={course.title} 
              courseId={courseId}
              lessonTitle={currentLesson?.title}
              className="mb-6"
            />
            {/* Course Thumbnail */}
            {course.imageUrl && (
              <img
                src={course.imageUrl}
                alt={course.title}
                className="w-full h-64 object-cover rounded-lg shadow-lg mb-6"
              />
            )}
            
            {/* Course Title */}
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              {course.title}
            </h1>
            
            {/* Welcome Message */}
            <p className="text-xl mb-4">Hi there!</p>
            
            {/* Course Description */}
            <div className="prose prose-lg max-w-none mb-8">
              <p>{course.description}</p>
            </div>
            
            {/* Current Lesson Content */}
            {currentLesson && (
              <Card className="p-6 mb-8">
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground mb-1">{currentLesson.moduleName}</p>
                  <h2 className="text-2xl font-bold">{currentLesson.title}</h2>
                  {(currentLesson.durationSeconds || currentLesson.duration) && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Duration: {currentLesson.durationSeconds
                        ? `${Math.floor(currentLesson.durationSeconds / 60)}:${String(currentLesson.durationSeconds % 60).padStart(2, '0')}`
                        : `${currentLesson.duration} min`}
                    </p>
                  )}
                </div>
                
                {/* Video Player */}
                <LessonVideoPlayer
                  lesson={currentLesson}
                  courseId={courseId}
                  initialTime={lessonProgress?.watchedDuration ?? undefined}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => {
                    if (currentLessonId && courseId && !isLessonCompleted(currentLessonId)) {
                      handleMarkComplete();
                    }
                  }}
                />
                
                {/* Lesson Content */}
                {currentLesson.content && (
                  <div className="prose max-w-none mb-6">
                    <div dangerouslySetInnerHTML={{ __html: currentLesson.content }} />
                  </div>
                )}
                
                {/* Mark Complete Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={handleMarkComplete}
                    disabled={!currentLessonId || isLessonCompleted(currentLessonId) || markCompleteMutation.isPending}
                    className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700"
                  >
                    {currentLessonId && isLessonCompleted(currentLessonId) ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Completed
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Mark as Complete
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
        
        {/* Mobile sidebar toggle */}
        <button
          onClick={() => setShowMobileSidebar(true)}
          className="fixed bottom-4 right-4 z-40 lg:hidden h-12 w-12 rounded-full bg-[#C026D3] text-white shadow-lg flex items-center justify-center hover:bg-[#A21CAF] transition-colors"
        >
          <List className="h-5 w-5" />
        </button>

        {/* Mobile sidebar overlay */}
        {showMobileSidebar && (
          <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setShowMobileSidebar(false)}>
            <div className="absolute inset-0 bg-black/50" />
          </div>
        )}

        {/* Right Sidebar — hidden on mobile, slide-in drawer */}
        <div className={`
          fixed inset-y-0 right-0 z-50 w-80 bg-white border-l border-gray-200 overflow-y-auto transform transition-transform duration-300
          lg:static lg:w-96 lg:transform-none lg:z-auto
          ${showMobileSidebar ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
        `}>
          <div className="p-6">
            {/* Mobile close button */}
            <button
              onClick={() => setShowMobileSidebar(false)}
              className="lg:hidden absolute top-3 right-3 h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80"
            >
              <X className="h-4 w-4" />
            </button>
            {/* Course Title in Sidebar */}
            <h2 className="text-xl font-bold mb-4">{course.title}</h2>
            
            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-purple-600">
                  {progressPercentage}% complete
                </span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
            
            {/* Course Home Button */}
            <Link href={`/courses/${courseId}`}>
              <Button variant="outline" className="w-full mb-6 flex items-center justify-center gap-2">
                <Home className="w-4 h-4" />
                Course Home
              </Button>
            </Link>
            
            {/* Modules and Lessons */}
            <div className="space-y-2">
              {modules?.map((module, moduleIndex) => {
                const { completed, total } = getModuleProgress(module);
                const isExpanded = expandedModules.has(module.id);
                
                return (
                  <div key={module.id} className="border rounded-lg overflow-hidden">
                    {/* Module Header */}
                    <button
                      onClick={() => toggleModule(module.id)}
                      className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          completed === total && total > 0
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {completed === total && total > 0 ? (
                            <Check className="w-5 h-5" />
                          ) : (
                            <Play className="w-5 h-5" />
                          )}
                        </div>
                        <div className="text-left">
                          <p className="text-xs text-muted-foreground">Module {moduleIndex + 1}</p>
                          <p className="font-semibold">{module.title}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{completed}/{total}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </div>
                    </button>
                    
                    {/* Lessons List */}
                    {isExpanded && module.lessons && (
                      <div className="bg-gray-50">
                        {module.lessons.map((lesson: any) => {
                          const completed = isLessonCompleted(lesson.id);
                          const isCurrent = currentLessonId === lesson.id;
                          
                          return (
                            <button
                              key={lesson.id}
                              onClick={() => setCurrentLessonId(lesson.id)}
                              className={`w-full p-4 pl-16 flex items-center justify-between hover:bg-gray-100 transition-colors border-t ${
                                isCurrent ? 'bg-purple-50 border-l-4 border-l-purple-600' : ''
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                  completed
                                    ? 'bg-purple-600 text-white'
                                    : 'border-2 border-gray-300'
                                }`}>
                                  {completed && <Check className="w-4 h-4" />}
                                </div>
                                <span className={`text-sm ${isCurrent ? 'font-semibold' : ''}`}>
                                  {lesson.title}
                                  {lesson.duration && ` (${lesson.duration}min)`}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
           </div>
        </div>
      </div>
      </div>
      
      {/* Course Completion Modal */}
      {course && (
        <CourseCompletionModal
          isOpen={showCompletionModal}
          onClose={() => setShowCompletionModal(false)}
          courseId={courseId}
          courseTitle={course.title}
        />
      )}
    </>
  );
}
