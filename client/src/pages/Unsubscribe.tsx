import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Loader2, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";

export default function Unsubscribe() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get("email") ?? "";
  const token = params.get("token") ?? "";

  const hasMissingParams = !email || !token;

  const mutation = trpc.newsletter.publicUnsubscribe.useMutation();
  const calledRef = useRef(false);

  useEffect(() => {
    if (hasMissingParams || calledRef.current) return;
    calledRef.current = true;
    mutation.mutate({ email, token });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] relative overflow-hidden flex items-center justify-center px-4">
      {/* Ambient glows */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-fuchsia-500 rounded-full blur-[150px] opacity-[0.08]" />
        <div className="absolute bottom-40 right-10 w-[400px] h-[400px] bg-purple-400 rounded-full blur-[150px] opacity-[0.08]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm p-8 text-center">
          {/* Missing params */}
          {hasMissingParams && (
            <>
              <div className="flex justify-center mb-4">
                <XCircle className="h-12 w-12 text-red-400/80" />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Invalid Link</h1>
              <p className="text-white/40 text-sm mb-6">
                This unsubscribe link is missing required information. Please use the link from your email.
              </p>
              <Link href="/">
                <button className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-full bg-[#C026D3] hover:bg-[#A21CAF] text-white text-sm font-medium transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                  Go Home
                </button>
              </Link>
            </>
          )}

          {/* Loading */}
          {!hasMissingParams && mutation.isPending && (
            <>
              <div className="flex justify-center mb-4">
                <Loader2 className="h-12 w-12 animate-spin text-[#C026D3]" />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Unsubscribing…</h1>
              <p className="text-white/40 text-sm">Please wait a moment.</p>
            </>
          )}

          {/* Success */}
          {!hasMissingParams && mutation.isSuccess && (
            <>
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="h-12 w-12 text-emerald-400" />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Unsubscribed</h1>
              <p className="text-white/40 text-sm mb-6">
                You have been removed from our mailing list. You won't receive any more newsletters.
              </p>
              <Link href="/">
                <button className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-full bg-[#C026D3] hover:bg-[#A21CAF] text-white text-sm font-medium transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                  Go Home
                </button>
              </Link>
            </>
          )}

          {/* Error */}
          {!hasMissingParams && mutation.isError && (
            <>
              <div className="flex justify-center mb-4">
                <XCircle className="h-12 w-12 text-red-400/80" />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Something went wrong</h1>
              <p className="text-white/40 text-sm mb-6">
                {mutation.error?.message || "We couldn't process your request. Please try again or contact support."}
              </p>
              <Link href="/">
                <button className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-full bg-[#C026D3] hover:bg-[#A21CAF] text-white text-sm font-medium transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                  Go Home
                </button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
