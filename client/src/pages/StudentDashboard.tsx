import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Play,
  BookOpen,
  Video,
  Trophy,
  Clock,
  ArrowRight,
  Calendar,
  Sparkles,
  GraduationCap,
  Loader2,
} from "lucide-react";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "Starting now";
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `in ${days}d ${hours % 24}h`;
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

export default function StudentDashboard() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const { data, isLoading } = trpc.courses.getDashboardData.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#C026D3]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-8 pb-6 text-center">
            <GraduationCap className="h-12 w-12 mx-auto mb-4 text-[#C026D3]" />
            <h2 className="text-xl font-bold mb-2">Sign in to view your dashboard</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Track your progress, continue lessons, and join live sessions.
            </p>
            <Link href="/">
              <Button>Go to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const firstName = user?.name?.split(" ")[0] || "there";
  const cw = data?.continueWatching;
  const courses = data?.courses || [];
  const sessions = data?.upcomingSessions || [];
  const stats = data?.stats || { totalCompleted: 0, enrolledCourses: 0 };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-fuchsia-600 via-pink-500 to-purple-600 text-white">
        <div className="container max-w-6xl py-8 px-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-pink-100 text-sm mb-1">Welcome back</p>
              <h1 className="text-2xl sm:text-3xl font-bold">{firstName}</h1>
            </div>
            <Link href="/">
              <Button variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10">
                Home
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container max-w-6xl px-4 -mt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#C026D3]" />
          </div>
        ) : (
          <div className="space-y-8 pb-16">

            {/* ── Quick Stats ─────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                icon={<Trophy className="h-5 w-5 text-amber-500" />}
                label="Lessons Done"
                value={stats.totalCompleted}
              />
              <StatCard
                icon={<BookOpen className="h-5 w-5 text-violet-500" />}
                label="Courses"
                value={stats.enrolledCourses}
              />
              <StatCard
                icon={<Video className="h-5 w-5 text-pink-500" />}
                label="Live Sessions"
                value={sessions.length}
              />
              <StatCard
                icon={<Sparkles className="h-5 w-5 text-emerald-500" />}
                label="Streak"
                value={stats.totalCompleted > 0 ? "Active" : "Start!"}
              />
            </div>

            {/* ── Continue Watching ────────────────────── */}
            {cw && (
              <section>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Play className="h-5 w-5 text-[#C026D3]" />
                  Continue Watching
                </h2>
                <Card className="overflow-hidden">
                  <div className="flex flex-col sm:flex-row">
                    {/* Thumbnail */}
                    <div className="relative sm:w-72 flex-shrink-0">
                      <div className="aspect-video sm:aspect-auto sm:h-full bg-black">
                        {cw.thumbnailUrl ? (
                          <img
                            src={cw.thumbnailUrl}
                            alt={cw.lessonTitle}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-fuchsia-900 to-purple-900">
                            <Play className="h-12 w-12 text-white/40" />
                          </div>
                        )}
                      </div>
                      {/* Progress overlay */}
                      {cw.totalDuration > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                          <div
                            className="h-full bg-[#C026D3]"
                            style={{ width: `${Math.min(100, Math.round((cw.watchedDuration / cw.totalDuration) * 100))}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 p-5 flex flex-col justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                          {cw.courseTitle}
                        </p>
                        <h3 className="text-lg font-semibold mb-2">{cw.lessonTitle}</h3>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDuration(cw.watchedDuration)}
                            {cw.totalDuration > 0 && ` / ${formatDuration(cw.totalDuration)}`}
                          </span>
                          {cw.totalDuration > 0 && (
                            <span className="text-[#C026D3] font-medium">
                              {Math.round((cw.watchedDuration / cw.totalDuration) * 100)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-4">
                        <Link href={`/course/${cw.courseId}/learn`}>
                          <Button className="bg-[#C026D3] hover:bg-[#A21CAF] text-white">
                            <Play className="h-4 w-4 mr-2" />
                            Resume Lesson
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </Card>
              </section>
            )}

            {/* ── My Courses ──────────────────────────── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-[#C026D3]" />
                  My Courses
                </h2>
                <Link href="/courses">
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    Browse All <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>

              {courses.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <GraduationCap className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-muted-foreground mb-4">You haven't enrolled in any courses yet.</p>
                    <Link href="/courses">
                      <Button>Browse Courses</Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {courses.map((course: any) => (
                    <CourseCard key={course.id} course={course} />
                  ))}
                </div>
              )}
            </section>

            {/* ── Upcoming Live Sessions ───────────────── */}
            {sessions.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Video className="h-5 w-5 text-[#C026D3]" />
                  Upcoming Live Sessions
                </h2>
                <div className="grid gap-3">
                  {sessions.map((session: any) => (
                    <Card key={session.id} className="overflow-hidden">
                      <div className="flex items-center gap-4 p-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-100 to-purple-100 dark:from-fuchsia-900/30 dark:to-purple-900/30 flex-shrink-0">
                          <Video className="h-5 w-5 text-[#C026D3]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm truncate">{session.title}</h3>
                          <p className="text-xs text-muted-foreground">
                            {new Date(session.startTime).toLocaleDateString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-xs font-medium text-[#C026D3]">
                            {timeUntil(session.startTime)}
                          </span>
                          <Link href={`/live-session/${session.id}`}>
                            <Button size="sm" variant="outline" className="h-7 text-xs">
                              <Calendar className="h-3 w-3 mr-1" />
                              View
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted flex-shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-xl font-bold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CourseCard({ course }: { course: any }) {
  // We get totalLessons from the modules query per course, but we also have completedLessons from the dashboard
  const { data: modules } = trpc.courses.getModulesWithLessons.useQuery(
    { courseId: course.id },
    { staleTime: 120_000 }
  );

  const totalLessons = modules?.reduce((acc: number, m: any) => acc + (m.lessons?.length || 0), 0) || 0;
  const pct = totalLessons > 0 ? Math.round((course.completedLessons / totalLessons) * 100) : 0;
  const isComplete = pct >= 100;

  return (
    <Card className="overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <div className="relative h-36 bg-gradient-to-br from-pink-100 to-purple-100 overflow-hidden">
        {course.imageUrl ? (
          <img src={course.imageUrl} alt={course.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-5xl">💃</span>
          </div>
        )}
        {isComplete && (
          <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            COMPLETE
          </div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold text-sm mb-1 line-clamp-2">{course.title}</h3>
        {totalLessons > 0 && (
          <div className="mt-auto pt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{course.completedLessons} of {totalLessons} lessons</span>
              <span className="font-medium text-[#C026D3]">{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5" indicatorClassName="bg-[#C026D3]" />
          </div>
        )}
      </div>
      <div className="px-4 pb-4">
        <Link href={`/course/${course.id}/learn`} className="block">
          <Button size="sm" className="w-full" variant={isComplete ? "outline" : "default"}>
            {isComplete ? "Review" : "Continue"}
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
