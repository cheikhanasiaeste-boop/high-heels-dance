import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Play,
  BookOpen,
  Video,
  Trophy,
  Clock,
  ArrowRight,
  Calendar,
  Flame,
  GraduationCap,
  Loader2,
  Timer,
  CalendarCheck,
  MapPin,
} from "lucide-react";
import { CertificateButton } from "@/components/CertificateButton";

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "Live now";
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
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
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="text-6xl mb-6">💃</div>
        <h2 className="text-2xl font-bold mb-2 text-center">Your dance journey awaits</h2>
        <p className="text-muted-foreground text-sm mb-8 text-center max-w-sm">
          Sign in to track your progress, resume lessons, and join live sessions with Elizabeth.
        </p>
        <Link href="/">
          <Button size="lg" className="bg-[#C026D3] hover:bg-[#A21CAF] text-white">
            Get Started
          </Button>
        </Link>
      </div>
    );
  }

  const firstName = user?.name?.split(" ")[0] || "there";
  const cw = data?.continueWatching;
  const courses = data?.courses || [];
  const sessions = data?.upcomingSessions || [];
  const bookings = data?.upcomingBookings || [];
  const stats = data?.stats || { totalCompleted: 0, enrolledCourses: 0, streakDays: 0, totalWatchMinutes: 0 };
  const hasAnyCourses = courses.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ──────────────────────────────── */}
      <div className="bg-gradient-to-r from-fuchsia-600 via-pink-500 to-purple-600 text-white">
        <div className="container max-w-6xl py-8 px-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-pink-200 text-sm mb-1">My Studio</p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {firstName} {stats.streakDays > 0 && <span className="inline-flex items-center align-middle ml-1 text-lg"><Flame className="h-5 w-5 text-amber-300 inline" /><span className="text-amber-200 text-base font-semibold">{stats.streakDays}</span></span>}
              </h1>
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
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-[#C026D3]" />
          </div>
        ) : (
          <div className="space-y-8 pb-16">

            {/* ── Quick Stats ──────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                icon={<Flame className="h-5 w-5 text-orange-500" />}
                label="Day Streak"
                value={stats.streakDays}
                accent={stats.streakDays > 0}
              />
              <StatCard
                icon={<Trophy className="h-5 w-5 text-amber-500" />}
                label="Lessons Done"
                value={stats.totalCompleted}
              />
              <StatCard
                icon={<Timer className="h-5 w-5 text-violet-500" />}
                label="Watch Time"
                value={stats.totalWatchMinutes > 60
                  ? `${Math.floor(stats.totalWatchMinutes / 60)}h ${stats.totalWatchMinutes % 60}m`
                  : `${stats.totalWatchMinutes}m`}
              />
              <StatCard
                icon={<BookOpen className="h-5 w-5 text-pink-500" />}
                label="Courses"
                value={stats.enrolledCourses}
              />
            </div>

            {/* ── Continue Watching ─────────────────── */}
            {cw ? (
              <section>
                <SectionHeading icon={<Play className="h-5 w-5" />} title="Continue Watching" />
                <Card className="overflow-hidden border-2 border-[#C026D3]/20 shadow-lg shadow-fuchsia-500/5">
                  <div className="flex flex-col sm:flex-row">
                    {/* Thumbnail with play overlay */}
                    <Link href={`/course/${cw.courseId}/learn`} className="relative sm:w-80 flex-shrink-0 group">
                      <div className="aspect-video sm:aspect-auto sm:h-full bg-black">
                        {cw.thumbnailUrl ? (
                          <img src={cw.thumbnailUrl} alt={cw.lessonTitle} className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-fuchsia-900 to-purple-900">
                            <Play className="h-12 w-12 text-white/30" />
                          </div>
                        )}
                        {/* Big play button overlay */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="h-14 w-14 rounded-full bg-[#C026D3] flex items-center justify-center shadow-xl">
                            <Play className="h-6 w-6 text-white ml-0.5" />
                          </div>
                        </div>
                      </div>
                      {/* Progress bar at bottom of thumbnail */}
                      {cw.totalDuration > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                          <div className="h-full bg-[#C026D3] transition-all" style={{ width: `${Math.min(100, Math.round((cw.watchedDuration / cw.totalDuration) * 100))}%` }} />
                        </div>
                      )}
                    </Link>

                    {/* Info + prominent resume button */}
                    <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between">
                      <div>
                        <p className="text-xs font-medium text-[#C026D3] uppercase tracking-wider mb-1.5">
                          {cw.courseTitle}
                        </p>
                        <h3 className="text-xl font-bold mb-3">{cw.lessonTitle}</h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4" />
                            {fmt(cw.watchedDuration)}
                            {cw.totalDuration > 0 && <span className="text-muted-foreground/60">/ {fmt(cw.totalDuration)}</span>}
                          </span>
                          {cw.totalDuration > 0 && (
                            <span className="font-semibold text-[#C026D3]">
                              {Math.round((cw.watchedDuration / cw.totalDuration) * 100)}%
                            </span>
                          )}
                        </div>
                        {cw.totalDuration > 0 && (
                          <Progress
                            value={Math.round((cw.watchedDuration / cw.totalDuration) * 100)}
                            className="h-2 mb-4"
                            indicatorClassName="bg-[#C026D3]"
                          />
                        )}
                      </div>
                      <Link href={`/course/${cw.courseId}/learn`}>
                        <Button size="lg" className="bg-[#C026D3] hover:bg-[#A21CAF] text-white shadow-md w-full sm:w-auto">
                          <Play className="h-5 w-5 mr-2" />
                          Resume Lesson
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              </section>
            ) : hasAnyCourses ? (
              /* User has courses but no in-progress lesson */
              <section>
                <SectionHeading icon={<Play className="h-5 w-5" />} title="Ready to start?" />
                <Card className="border-dashed border-2">
                  <CardContent className="py-8 text-center">
                    <div className="text-4xl mb-3">🩰</div>
                    <p className="font-medium mb-1">Pick a lesson and start dancing!</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Open any course below to begin your first lesson.
                    </p>
                  </CardContent>
                </Card>
              </section>
            ) : null}

            {/* ── My Courses ───────────────────────── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <SectionHeading icon={<BookOpen className="h-5 w-5" />} title="My Courses" />
                <Link href="/courses">
                  <Button variant="ghost" size="sm" className="text-[#C026D3] hover:text-[#A21CAF] hover:bg-fuchsia-50 gap-1">
                    Browse All <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>

              {courses.length === 0 ? (
                <Card className="border-dashed border-2">
                  <CardContent className="py-14 text-center">
                    <div className="text-5xl mb-4">💃</div>
                    <h3 className="text-lg font-semibold mb-2">Your collection is empty</h3>
                    <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
                      Explore Elizabeth's high heels dance courses and start your journey today.
                    </p>
                    <Link href="/courses">
                      <Button size="lg" className="bg-[#C026D3] hover:bg-[#A21CAF] text-white">
                        <BookOpen className="h-4 w-4 mr-2" />
                        Browse Courses
                      </Button>
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

            {/* ── My Booked Sessions ──────────────── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <SectionHeading icon={<CalendarCheck className="h-5 w-5" />} title="My Sessions" />
                <Link href="/my-bookings">
                  <Button variant="ghost" size="sm" className="text-[#C026D3] hover:text-[#A21CAF] hover:bg-fuchsia-50 gap-1">
                    View All <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>

              {bookings.length === 0 ? (
                <Card className="border-dashed border-2">
                  <CardContent className="py-10 text-center">
                    <CalendarCheck className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-muted-foreground text-sm mb-4">No upcoming sessions booked.</p>
                    <Link href="/book-session">
                      <Button size="sm" variant="outline">Book a Session</Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {bookings.map((booking: any) => (
                    <Link key={booking.id} href={`/session/${booking.id}`}>
                      <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer group">
                        <div className="flex items-center gap-4 p-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-pink-100 to-fuchsia-100 dark:from-pink-900/30 dark:to-fuchsia-900/30 flex-shrink-0">
                            <CalendarCheck className="h-5 w-5 text-[#C026D3]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm truncate group-hover:text-[#C026D3] transition-colors">
                              {booking.slotTitle || booking.sessionType || "Dance Session"}
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>
                                {booking.slotStartTime
                                  ? new Date(booking.slotStartTime).toLocaleDateString(undefined, {
                                      weekday: "short", month: "short", day: "numeric",
                                      hour: "2-digit", minute: "2-digit",
                                    })
                                  : "Date TBD"}
                              </span>
                              {booking.slotEventType === "in-person" && (
                                <span className="flex items-center gap-0.5">
                                  <MapPin className="h-3 w-3" /> In-person
                                </span>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-[#C026D3] transition-colors flex-shrink-0" />
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* ── Upcoming Live Sessions ────────────── */}
            <section>
              <SectionHeading icon={<Video className="h-5 w-5" />} title="Upcoming Live Sessions" />
              {sessions.length === 0 ? (
                <Card className="border-dashed border-2">
                  <CardContent className="py-10 text-center">
                    <Video className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-muted-foreground text-sm">
                      No upcoming live sessions right now. Check back soon!
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {sessions.map((session: any) => {
                    const isLive = new Date(session.startTime).getTime() <= Date.now();
                    return (
                      <Link key={session.id} href={`/live-session/${session.id}`}>
                        <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer group">
                          <div className="flex items-center gap-4 p-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-100 to-purple-100 dark:from-fuchsia-900/30 dark:to-purple-900/30 flex-shrink-0">
                              <Video className="h-5 w-5 text-[#C026D3]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-sm truncate group-hover:text-[#C026D3] transition-colors">{session.title}</h3>
                              <p className="text-xs text-muted-foreground">
                                {new Date(session.startTime).toLocaleDateString(undefined, {
                                  weekday: "short", month: "short", day: "numeric",
                                  hour: "2-digit", minute: "2-digit",
                                })}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isLive ? (
                                <span className="flex items-center gap-1 text-xs font-bold text-red-500 animate-pulse">
                                  <span className="h-2 w-2 rounded-full bg-red-500" />
                                  LIVE
                                </span>
                              ) : (
                                <span className="text-xs font-medium text-[#C026D3] tabular-nums">
                                  {timeUntil(session.startTime)}
                                </span>
                              )}
                              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-[#C026D3] transition-colors" />
                            </div>
                          </div>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-foreground">
      <span className="text-[#C026D3]">{icon}</span>
      {title}
    </h2>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent?: boolean }) {
  return (
    <Card className={`shadow-sm transition-shadow hover:shadow-md ${accent ? "ring-2 ring-orange-200 dark:ring-orange-800" : ""}`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0 ${accent ? "bg-orange-50 dark:bg-orange-950/30" : "bg-muted"}`}>
          {icon}
        </div>
        <div>
          <p className="text-xl font-bold leading-none tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CourseCard({ course }: { course: any }) {
  const { data: modules } = trpc.courses.getModulesWithLessons.useQuery(
    { courseId: course.id },
    { staleTime: 120_000 }
  );

  const totalLessons = modules?.reduce((acc: number, m: any) => acc + (m.lessons?.length || 0), 0) || 0;
  const pct = totalLessons > 0 ? Math.round((course.completedLessons / totalLessons) * 100) : 0;
  const isComplete = pct >= 100;

  return (
    <Card className="overflow-hidden flex flex-col hover:shadow-md transition-shadow group">
      <Link href={`/course/${course.id}/learn`} className="relative h-36 bg-gradient-to-br from-pink-100 to-purple-100 overflow-hidden">
        {course.imageUrl ? (
          <img src={course.imageUrl} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-5xl">💃</span>
          </div>
        )}
        {isComplete && (
          <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
            <Trophy className="h-3 w-3" />
            COMPLETE
          </div>
        )}
        {/* Hover play overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div className="h-10 w-10 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
            <Play className="h-4 w-4 text-[#C026D3] ml-0.5" />
          </div>
        </div>
      </Link>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold text-sm mb-1 line-clamp-2">{course.title}</h3>
        {totalLessons > 0 && (
          <div className="mt-auto pt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{course.completedLessons} of {totalLessons} lessons</span>
              <span className="font-semibold text-[#C026D3]">{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5" indicatorClassName={isComplete ? "bg-emerald-500" : "bg-[#C026D3]"} />
          </div>
        )}
      </div>
      <div className="px-4 pb-4 space-y-2">
        <Link href={`/course/${course.id}/learn`} className="block">
          <Button size="sm" className="w-full" variant={isComplete ? "outline" : "default"}>
            {isComplete ? "Review Course" : pct > 0 ? "Continue" : "Start Learning"}
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </Link>
        {isComplete && (
          <CertificateButton courseId={course.id} variant="ghost" size="sm" className="w-full text-[#C026D3]" />
        )}
      </div>
    </Card>
  );
}
