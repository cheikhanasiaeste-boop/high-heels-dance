import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

const LIMIT = 12;

export default function Blog() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.blog.list.useQuery({ page, limit: LIMIT });

  const posts = data?.posts ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#E879F9] mx-auto mb-4" />
          <p className="text-white/50">Loading posts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] relative overflow-hidden">
      {/* Ambient glow orbs */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-fuchsia-500 rounded-full blur-[150px] opacity-[0.08]" />
        <div className="absolute bottom-40 right-10 w-[400px] h-[400px] bg-purple-400 rounded-full blur-[150px] opacity-[0.08]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600 rounded-full blur-[200px] opacity-[0.05]" />
      </div>

      {/* Header */}
      <div className="border-b border-[#E879F9]/10 bg-white/[0.03] backdrop-blur-sm relative z-10">
        <div className="container py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
          </div>
          <h1
            className="text-4xl font-bold mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Blog
          </h1>
          <p className="text-white/50">
            Tips, inspiration, and stories from the dance floor
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="container py-8 relative z-10">
        {posts.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-white/40 text-lg">No posts published yet.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {posts.map((post) => (
                <Link key={post.id} href={`/blog/${post.slug}`}>
                  <div className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-3 border border-[#E879F9]/10 hover:border-[#E879F9]/25 hover:shadow-[0_0_30px_rgba(232,121,249,0.08)] transition-all duration-500 cursor-pointer h-full flex flex-col">
                    {/* Thumbnail */}
                    {post.thumbnailUrl ? (
                      <img
                        src={post.thumbnailUrl}
                        alt={post.title}
                        className="w-full h-44 object-cover rounded-xl mb-3"
                      />
                    ) : (
                      <div className="w-full h-44 rounded-xl mb-3 bg-gradient-to-br from-fuchsia-900/40 to-purple-900/40 flex items-center justify-center">
                        <span className="text-5xl opacity-40">✍</span>
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex flex-col flex-1 px-1 pb-1">
                      <h2
                        className="text-lg font-semibold text-white hover:text-[#E879F9] transition-colors duration-200 mb-2 line-clamp-2"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {post.title}
                      </h2>

                      {post.excerpt && (
                        <p className="text-white/50 text-sm line-clamp-2 mb-3 flex-1">
                          {post.excerpt}
                        </p>
                      )}

                      <div className="border-t border-[#E879F9]/10 pt-2 mt-auto">
                        <time className="text-xs text-white/30">
                          {post.publishedAt
                            ? new Date(post.publishedAt).toLocaleDateString(
                                "en-US",
                                {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                }
                              )
                            : "Unpublished"}
                        </time>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {total > LIMIT && (
              <div className="flex items-center justify-center gap-4 mt-12">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="border-[#E879F9]/20 text-white/70 hover:border-[#E879F9]/50 hover:text-white disabled:opacity-30"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                <span className="text-white/40 text-sm">
                  Page {page} of {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="border-[#E879F9]/20 text-white/70 hover:border-[#E879F9]/50 hover:text-white disabled:opacity-30"
                >
                  Next
                  <ArrowLeft className="h-4 w-4 ml-1 rotate-180" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
