import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Video, Users, Lock, ArrowLeft, Loader2, AlertCircle, CalendarClock, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

// ─── Types ─────────────────────────────────────────────────────────────────

type PageState = "loading" | "countdown" | "live" | "ended" | "no-access";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTimeLeft(target: Date): TimeLeft {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── LiveZoomEmbed ───────────────────────────────────────────────────────────

function LiveZoomEmbed({ sessionId }: { sessionId: number }) {
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "connected" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const joinMutation = trpc.liveSessions.join.useMutation({
    onSuccess: async (creds) => {
      try {
        // Dynamic import to avoid SSR / bundle issues
        const ZoomMtgEmbedded = (await import("@zoom/meetingsdk/embedded")).default;
        const client = ZoomMtgEmbedded.createClient();
        clientRef.current = client;

        const container = zoomContainerRef.current;
        if (!container) {
          throw new Error("Zoom container not found");
        }

        client.init({
          debug: false,
          zoomAppRoot: container,
          language: "en-US",
          customize: {
            meetingInfo: ["topic", "host", "mn", "pwd", "telPwd", "invite", "participant", "dc", "enctype"],
            toolbar: {
              buttons: [
                {
                  text: "Custom Button",
                  className: "CustomButton",
                  onClick: () => {},
                },
              ],
            },
          },
        });

        await client.join({
          sdkKey: creds.sdkKey,
          signature: creds.signature,
          meetingNumber: String(creds.meetingNumber),
          password: "",
          userName: creds.userName,
          userEmail: creds.userEmail,
        });

        setStatus("connected");
      } catch (err: any) {
        console.error("[LiveZoomEmbed] join error:", err);
        setErrorMessage(err?.message || "Failed to connect to Zoom meeting.");
        setStatus("error");
      }
    },
    onError: (err) => {
      setErrorMessage(err.message || "Failed to get Zoom credentials.");
      setStatus("error");
    },
  });

  useEffect(() => {
    joinMutation.mutate({ sessionId });

    return () => {
      // Cleanup: leave the meeting on unmount
      if (clientRef.current) {
        try {
          clientRef.current.leaveMeeting();
        } catch {
          // best-effort
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="font-semibold text-red-700">Could not connect to Zoom</p>
        <p className="text-sm text-red-500">{errorMessage}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-1 border-red-300 text-red-600 hover:bg-red-100"
          onClick={() => {
            setStatus("loading");
            setErrorMessage("");
            joinMutation.mutate({ sessionId });
          }}
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black">
      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 text-white">
          <Loader2 className="h-10 w-10 animate-spin text-fuchsia-400" />
          <p className="text-sm font-medium">Connecting to Zoom meeting&hellip;</p>
        </div>
      )}
      {/* Zoom SDK mounts here */}
      <div
        ref={zoomContainerRef}
        id="zoom-meeting-container"
        className="w-full"
        style={{ minHeight: 480 }}
      />
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LiveSessionPage() {
  const params = useParams<{ id: string }>();
  const sessionId = Number(params.id);
  const { user, isAuthenticated } = useAuth();

  const { data: session, isLoading, error } = trpc.liveSessions.getById.useQuery(
    { id: sessionId },
    { enabled: !isNaN(sessionId) }
  );

  const [now, setNow] = useState(() => new Date());

  // Tick every second to drive countdown + time-based state
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(timer);
  }, []);

  // ── Derive page state ──────────────────────────────────────────────────────

  const pageState: PageState = (() => {
    if (isLoading || !session) return "loading";

    const start = new Date(session.startTime);
    const end = new Date(session.endTime);
    const fiveMinBefore = new Date(start.getTime() - 5 * 60_000);

    if (now < fiveMinBefore) return "countdown";
    if (now <= end) {
      // Within the live window — check access for paid sessions
      if (!session.isFree && !isAuthenticated) return "no-access";
      if (!session.isFree && isAuthenticated) {
        const isPremium =
          user?.membershipStatus === "monthly" || user?.membershipStatus === "annual";
        if (!isPremium) return "no-access";
      }
      return "live";
    }
    return "ended";
  })();

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-50 via-fuchsia-50 to-rose-100">
        <Loader2 className="h-10 w-10 animate-spin text-fuchsia-500" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-pink-50 via-fuchsia-50 to-rose-100 p-6">
        <AlertCircle className="h-14 w-14 text-fuchsia-400" />
        <p className="text-xl font-semibold text-fuchsia-900">Session not found</p>
        <Link href="/">
          <Button variant="outline" className="gap-2 border-fuchsia-300 text-fuchsia-700 hover:bg-fuchsia-50">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Button>
        </Link>
      </div>
    );
  }

  const start = new Date(session.startTime);
  const end = new Date(session.endTime);
  const timeLeft = getTimeLeft(start);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-fuchsia-50 to-rose-100 px-4 py-10">
      {/* Back link */}
      <div className="mx-auto mb-6 max-w-3xl">
        <Link href="/">
          <button className="inline-flex items-center gap-1.5 text-sm font-medium text-fuchsia-600 hover:text-fuchsia-800 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </button>
        </Link>
      </div>

      <div className="mx-auto max-w-3xl space-y-6">
        {/* ── Session info card ── */}
        <Card className="border-fuchsia-100 bg-white/80 shadow-lg backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle className="text-2xl font-bold text-fuchsia-900 leading-tight">
                {session.title}
              </CardTitle>
              <Badge
                className={
                  session.isFree
                    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                    : "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200"
                }
                variant="outline"
              >
                {session.isFree ? "Free" : session.price ? `$${session.price}` : "Paid"}
              </Badge>
            </div>
            {session.description && (
              <p className="mt-1 text-sm leading-relaxed text-gray-600">{session.description}</p>
            )}
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-fuchsia-400" />
                <span className="font-medium text-gray-700">{formatDateTime(start)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4 text-fuchsia-400" />
                Capacity: {session.capacity}
              </span>
            </div>

            {/* Status badge */}
            <div>
              {pageState === "countdown" && (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                  <CalendarClock className="mr-1 h-3.5 w-3.5" /> Upcoming
                </Badge>
              )}
              {pageState === "live" && (
                <Badge className="animate-pulse border-0 bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-white" />
                  Live Now
                </Badge>
              )}
              {pageState === "ended" && (
                <Badge variant="outline" className="border-gray-300 bg-gray-50 text-gray-500">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Session Ended
                </Badge>
              )}
              {pageState === "no-access" && (
                <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-600">
                  <Lock className="mr-1 h-3.5 w-3.5" /> Premium Required
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Main content area ── */}

        {/* COUNTDOWN */}
        {pageState === "countdown" && (
          <Card className="border-fuchsia-100 bg-white/80 shadow-md backdrop-blur-sm">
            <CardContent className="py-10 text-center">
              <div className="mb-4 inline-flex items-center justify-center rounded-full bg-fuchsia-100 p-4">
                <CalendarClock className="h-8 w-8 text-fuchsia-500" />
              </div>
              <h2 className="mb-6 text-xl font-bold text-fuchsia-900">Session Starts Soon</h2>
              <div className="flex justify-center gap-3">
                {[
                  { value: timeLeft.days, label: "Days" },
                  { value: timeLeft.hours, label: "Hours" },
                  { value: timeLeft.minutes, label: "Min" },
                  { value: timeLeft.seconds, label: "Sec" },
                ].map(({ value, label }) => (
                  <div
                    key={label}
                    className="flex min-w-[68px] flex-col items-center rounded-xl border border-fuchsia-100 bg-gradient-to-b from-fuchsia-50 to-pink-50 px-4 py-3 shadow-sm"
                  >
                    <span className="text-3xl font-extrabold tabular-nums text-fuchsia-700">
                      {pad(value)}
                    </span>
                    <span className="mt-0.5 text-xs font-medium uppercase tracking-widest text-fuchsia-400">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm text-gray-500">
                The Zoom meeting will appear here automatically when the session is ready.
              </p>
            </CardContent>
          </Card>
        )}

        {/* LIVE — Zoom embed */}
        {pageState === "live" && (
          <Card className="border-fuchsia-100 bg-white/80 shadow-md backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-fuchsia-800">
                <Video className="h-5 w-5 text-fuchsia-500" />
                Live Session
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LiveZoomEmbed sessionId={sessionId} />
            </CardContent>
          </Card>
        )}

        {/* ENDED */}
        {pageState === "ended" && (
          <Card className="border-gray-200 bg-white/80 shadow-md backdrop-blur-sm">
            <CardContent className="py-12 text-center">
              <div className="mb-4 inline-flex items-center justify-center rounded-full bg-gray-100 p-4">
                <CheckCircle2 className="h-8 w-8 text-gray-400" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-gray-700">Session Has Ended</h2>
              <p className="mb-6 text-sm text-gray-500">
                This live session finished on {formatDateTime(end)}. Check back for an upcoming
                session or explore our on-demand courses.
              </p>
              <Link href="/courses">
                <Button className="bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow hover:from-fuchsia-600 hover:to-pink-600">
                  Browse Courses
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* NO ACCESS — two sub-states */}
        {pageState === "no-access" && (
          <Card className="border-rose-100 bg-white/80 shadow-md backdrop-blur-sm">
            <CardContent className="py-12 text-center">
              <div className="mb-4 inline-flex items-center justify-center rounded-full bg-rose-100 p-4">
                <Lock className="h-8 w-8 text-rose-400" />
              </div>

              {!isAuthenticated ? (
                <>
                  <h2 className="mb-2 text-xl font-bold text-rose-800">Members Only</h2>
                  <p className="mb-6 text-sm text-gray-500">
                    Sign in or create an account to purchase access to this session.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link href="/">
                      <Button className="bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow hover:from-fuchsia-600 hover:to-pink-600">
                        Sign In
                      </Button>
                    </Link>
                    <Link href="/">
                      <Button variant="outline" className="border-fuchsia-300 text-fuchsia-700 hover:bg-fuchsia-50">
                        Create Account
                      </Button>
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="mb-2 text-xl font-bold text-rose-800">Premium Access Required</h2>
                  <p className="mb-6 text-sm text-gray-500">
                    This session requires purchase or premium membership.
                  </p>
                  <Link href="/membership">
                    <Button className="bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow hover:from-fuchsia-600 hover:to-pink-600">
                      View Membership Plans
                    </Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
