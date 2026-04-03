import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Loader2, Mail, User } from "lucide-react";

export default function AccountSettings() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: statusData, isLoading: statusLoading } = trpc.newsletter.status.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const subscribeMutation = trpc.newsletter.subscribe.useMutation({
    onSuccess: () => {
      utils.newsletter.status.invalidate();
      toast.success("Subscribed to newsletter!");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to subscribe");
    },
  });

  const unsubscribeMutation = trpc.newsletter.unsubscribe.useMutation({
    onSuccess: () => {
      utils.newsletter.status.invalidate();
      toast.success("Unsubscribed from newsletter");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to unsubscribe");
    },
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  if (authLoading || statusLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#C026D3]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const isSubscribed = statusData?.subscribed ?? false;
  const isPending = subscribeMutation.isPending || unsubscribeMutation.isPending;

  const handleToggle = () => {
    if (isPending) return;
    if (isSubscribed) {
      unsubscribeMutation.mutate();
    } else {
      subscribeMutation.mutate({
        email: user?.email ?? "",
        source: "registration",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-fuchsia-500 rounded-full blur-[150px] opacity-[0.08]" />
        <div className="absolute bottom-40 right-10 w-[400px] h-[400px] bg-purple-400 rounded-full blur-[150px] opacity-[0.08]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600 rounded-full blur-[200px] opacity-[0.05]" />
      </div>

      {/* Glassmorphic header */}
      <div className="bg-gradient-to-r from-[#1a0a20] via-[#2e0033] to-[#1a0a20] border-b border-[#E879F9]/10 text-white relative z-10">
        <div className="container max-w-2xl mx-auto px-4 py-8">
          <div className="mb-4">
            <Link href="/dashboard">
              <button className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white text-sm font-medium transition-all border border-white/10 hover:border-white/20">
                <ArrowLeft className="h-4 w-4" />
                Back to Studio
              </button>
            </Link>
          </div>
          <p className="text-[#E879F9]/60 text-[11px] uppercase tracking-[0.25em] mb-1.5">
            Settings
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Account Settings
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="container max-w-2xl mx-auto px-4 py-10 relative z-10 space-y-6">
        {/* Profile card */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm p-6">
          <h2 className="text-sm font-semibold text-[#E879F9]/80 uppercase tracking-wider mb-5">
            Profile
          </h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
                <User className="h-4 w-4 text-white/50" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white/40 uppercase tracking-wider mb-0.5">Name</p>
                <p className="text-white text-sm font-medium truncate">
                  {user?.name || "—"}
                </p>
              </div>
            </div>
            <div className="border-t border-white/[0.06]" />
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
                <Mail className="h-4 w-4 text-white/50" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white/40 uppercase tracking-wider mb-0.5">Email</p>
                <p className="text-white text-sm font-medium truncate">
                  {user?.email || "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Newsletter card */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm p-6">
          <h2 className="text-sm font-semibold text-[#E879F9]/80 uppercase tracking-wider mb-5">
            Newsletter
          </h2>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium mb-1">
                Subscribe to our newsletter
              </p>
              <p className="text-white/40 text-xs leading-relaxed">
                Receive dance tips, blog posts, and exclusive offers
              </p>
            </div>

            {/* Toggle switch */}
            <button
              role="switch"
              aria-checked={isSubscribed}
              onClick={handleToggle}
              disabled={isPending}
              className="relative flex shrink-0 items-center w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C026D3] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: isSubscribed ? "#C026D3" : "rgba(255,255,255,0.20)" }}
            >
              <span
                className="absolute left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
                style={{ transform: isSubscribed ? "translateX(24px)" : "translateX(0px)" }}
              />
            </button>
          </div>

          {isPending && (
            <p className="text-[11px] text-white/30 mt-3 flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
