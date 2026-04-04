import { useEffect, useMemo } from "react";
import { Link, useParams } from "wouter";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Share2, Loader2, Calendar, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function BlogPost() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";

  const { data: post, isLoading, error } = trpc.blog.getBySlug.useQuery(
    { slug },
    { enabled: !!slug }
  );

  // Set document title
  useEffect(() => {
    const prev = document.title;
    if (post?.title) {
      document.title = post.title;
    }
    return () => {
      document.title = prev;
    };
  }, [post?.title]);

  function handleShare() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Link copied to clipboard!");
    }).catch(() => {
      toast.error("Could not copy link.");
    });
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-[#E879F9]" />
      </div>
    );
  }

  // ── Error / Not Found ─────────────────────────────────────────────────────
  if (error || !post) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <AlertCircle className="h-12 w-12 text-[#E879F9]/60 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Post not found</h1>
          <p className="text-white/50 mb-6 text-sm">
            This article may have been moved or is no longer available.
          </p>
          <Link href="/blog">
            <span className="inline-flex items-center gap-2 text-[#E879F9] hover:text-[#E879F9]/80 transition-colors text-sm font-medium cursor-pointer">
              <ArrowLeft className="h-4 w-4" />
              Back to Blog
            </span>
          </Link>
        </div>
      </div>
    );
  }

  const publishedDate = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-fuchsia-500 rounded-full blur-[150px] opacity-[0.08]" />
        <div className="absolute bottom-40 right-10 w-[400px] h-[400px] bg-purple-400 rounded-full blur-[150px] opacity-[0.08]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600 rounded-full blur-[200px] opacity-[0.05]" />
      </div>

      {/* Top Nav */}
      <div className="border-b border-[#E879F9]/10 bg-white/[0.03] backdrop-blur-sm relative z-20">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/blog">
            <span className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm font-medium cursor-pointer">
              <ArrowLeft className="h-4 w-4" />
              Back to Blog
            </span>
          </Link>

          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/[0.05] hover:bg-white/10 text-white/70 hover:text-white transition-all text-sm font-medium"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
        </div>
      </div>

      {/* Hero — full-width thumbnail with gradient overlay + title */}
      <div className="relative z-10 w-full" style={{ maxHeight: "480px", overflow: "hidden" }}>
        {post.thumbnailUrl ? (
          <img
            src={post.thumbnailUrl}
            alt={post.title}
            className="w-full object-cover"
            style={{ maxHeight: "480px", objectPosition: "center" }}
          />
        ) : (
          <div className="w-full h-72 bg-gradient-to-br from-fuchsia-900/60 via-purple-900/40 to-[#1a0525]" />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1a0525] via-[#1a0525]/60 to-transparent" />

        {/* Title overlaid at bottom */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-16">
          <div className="container mx-auto max-w-4xl">
            {publishedDate && (
              <div className="flex items-center gap-2 text-[#E879F9]/70 text-xs font-medium mb-3 uppercase tracking-widest">
                <Calendar className="h-3.5 w-3.5" />
                {publishedDate}
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight">
              {post.title}
            </h1>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="relative z-10 pb-24">
        <div className="container mx-auto px-4">

          {/* YouTube video embed */}
          {post.youtubeVideoId && /^[\w-]{1,20}$/.test(post.youtubeVideoId) && (
            <div className="max-w-4xl mx-auto mt-10">
              <div
                className="relative w-full rounded-2xl overflow-hidden shadow-2xl shadow-black/40 border border-white/[0.06]"
                style={{ paddingBottom: "56.25%", height: 0 }}
              >
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(post.youtubeVideoId)}?rel=0&origin=${encodeURIComponent(window.location.origin)}`}
                  title={post.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            </div>
          )}

          {/* Markdown content */}
          {post.content && (
            <div
              className="max-w-4xl mx-auto mt-12 prose prose-invert prose-lg max-w-none prose-headings:font-bold prose-headings:text-white prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3 prose-p:text-white/70 prose-p:leading-relaxed prose-li:text-white/70 prose-strong:text-white prose-a:text-[#E879F9] prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl prose-img:shadow-2xl prose-img:my-8 prose-img:w-full"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked(post.content) as string) }}
            />
          )}

          {/* CTA Section */}
          <div className="max-w-4xl mx-auto mt-16">
            <div
              className="relative rounded-2xl overflow-hidden p-8 md:p-12 text-center border border-white/10"
              style={{
                background:
                  "linear-gradient(135deg, rgba(192,38,211,0.12) 0%, rgba(139,92,246,0.10) 50%, rgba(232,121,249,0.08) 100%)",
                backdropFilter: "blur(16px)",
              }}
            >
              {/* Subtle inner glow */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-32 bg-fuchsia-500/20 rounded-full blur-3xl" />
              </div>

              <p className="text-[11px] uppercase tracking-[0.25em] text-[#E879F9]/60 mb-3 relative">
                Start Your Journey
              </p>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 relative">
                Ready to start dancing?
              </h2>
              <p className="text-white/50 mb-8 max-w-md mx-auto text-sm leading-relaxed relative">
                Join our community and transform your movement — from your very first step
                to the stage.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center relative">
                <Link href="/courses">
                  <span className="inline-flex items-center justify-center px-7 py-3 rounded-full bg-gradient-to-r from-[#C026D3] to-[#9333EA] text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-fuchsia-900/30 cursor-pointer">
                    Explore Our Courses
                  </span>
                </Link>
                <Link href="/book-session">
                  <span className="inline-flex items-center justify-center px-7 py-3 rounded-full border border-white/20 bg-white/[0.05] hover:bg-white/10 text-white text-sm font-semibold transition-colors cursor-pointer">
                    Book a Session
                  </span>
                </Link>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
