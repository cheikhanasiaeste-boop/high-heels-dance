import { AdminLayout } from "@/components/AdminLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Pencil,
  Trash2,
  Send,
  Eye,
  EyeOff,
  Users,
  FileText,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { marked } from "marked";
import DOMPurify from "dompurify";

type FilterTab = "all" | "drafts" | "published";

interface EditFormState {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
}

export default function AdminBlog() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
  });
  const [newsletterDialogPostId, setNewsletterDialogPostId] = useState<number | null>(null);
  const [previewPostId, setPreviewPostId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  // Auth redirect
  useEffect(() => {
    if (!loading && (!isAuthenticated || user?.role !== "admin")) {
      navigate("/");
    }
  }, [isAuthenticated, user, loading, navigate]);

  // Queries
  const { data: posts, isLoading: postsLoading } = trpc.adminBlog.list.useQuery(
    { filter },
    { enabled: isAuthenticated && user?.role === "admin" }
  );

  const { data: subscriberCount } = trpc.adminBlog.subscriberCount.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === "admin" }
  );

  // Mutations
  const updateMutation = trpc.adminBlog.update.useMutation({
    onSuccess: () => {
      toast.success("Post updated successfully");
      utils.adminBlog.list.invalidate();
      setEditingPostId(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update post");
    },
  });

  const publishMutation = trpc.adminBlog.publish.useMutation({
    onSuccess: () => {
      toast.success("Post published");
      utils.adminBlog.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to publish post");
    },
  });

  const unpublishMutation = trpc.adminBlog.unpublish.useMutation({
    onSuccess: () => {
      toast.success("Post unpublished");
      utils.adminBlog.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to unpublish post");
    },
  });

  const deleteMutation = trpc.adminBlog.delete.useMutation({
    onSuccess: () => {
      toast.success("Post deleted");
      utils.adminBlog.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete post");
    },
  });

  const sendNewsletterMutation = trpc.adminBlog.sendNewsletter.useMutation({
    onSuccess: (data) => {
      toast.success(`Newsletter sent to ${data.sentCount} subscriber(s)`);
      utils.adminBlog.list.invalidate();
      setNewsletterDialogPostId(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send newsletter");
      setNewsletterDialogPostId(null);
    },
  });

  // Handlers
  const openEditModal = (post: NonNullable<typeof posts>[number]) => {
    setEditForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt ?? "",
      content: post.content ?? "",
    });
    setEditingPostId(post.id);
  };

  const handleSave = () => {
    if (editingPostId === null) return;
    updateMutation.mutate({
      id: editingPostId,
      title: editForm.title,
      slug: editForm.slug,
      excerpt: editForm.excerpt,
      content: editForm.content,
    });
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Are you sure you want to delete this post? This action cannot be undone.")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleTogglePublish = (post: NonNullable<typeof posts>[number]) => {
    if (post.isPublished) {
      unpublishMutation.mutate({ id: post.id });
    } else {
      publishMutation.mutate({ id: post.id });
    }
  };

  // Loading state
  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </AdminLayout>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return null;
  }

  const filterTabs: { label: string; value: FilterTab }[] = [
    { label: "All", value: "all" },
    { label: "Drafts", value: "drafts" },
    { label: "Published", value: "published" },
  ];

  const newsletterDialogPost = newsletterDialogPostId !== null
    ? posts?.find((p) => p.id === newsletterDialogPostId)
    : null;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Manage Blog</h1>
            <p className="text-muted-foreground mt-1">
              Edit, publish, and send newsletters for blog posts
            </p>
          </div>
          {subscriberCount && (
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm">
              <Users className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                {subscriberCount.active} active subscriber{subscriberCount.active !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {filterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                filter === tab.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Posts Table */}
        {postsLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : posts && posts.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="pl-4">Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Newsletter</TableHead>
                  <TableHead className="text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => (
                  <TableRow key={post.id}>
                    {/* Title */}
                    <TableCell className="pl-4 max-w-xs">
                      <button
                        onClick={() => openEditModal(post)}
                        className="text-left hover:text-primary transition-colors"
                      >
                        <div className="font-medium truncate max-w-[300px]">
                          {post.title}
                        </div>
                        <div className="text-xs text-gray-400 truncate max-w-[300px]">
                          /{post.slug}
                        </div>
                      </button>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      {post.isPublished ? (
                        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100">
                          Draft
                        </Badge>
                      )}
                    </TableCell>

                    {/* Date */}
                    <TableCell className="text-gray-500 text-sm">
                      {post.publishedAt
                        ? new Date(post.publishedAt).toLocaleDateString()
                        : new Date(post.createdAt).toLocaleDateString()}
                    </TableCell>

                    {/* Newsletter */}
                    <TableCell>
                      {post.isNewsletterSent ? (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100">
                          Sent
                        </Badge>
                      ) : (
                        <span className="text-gray-300">&mdash;</span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right pr-4">
                      <div className="flex items-center justify-end gap-1">
                        {/* Preview */}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setPreviewPostId(post.id)}
                          title="Preview post"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>

                        {/* Edit */}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditModal(post)}
                          title="Edit post"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        {/* Publish / Unpublish */}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleTogglePublish(post)}
                          disabled={publishMutation.isPending || unpublishMutation.isPending}
                          title={post.isPublished ? "Unpublish" : "Publish"}
                        >
                          {post.isPublished ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>

                        {/* Send Newsletter */}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setNewsletterDialogPostId(post.id)}
                          disabled={!post.isPublished || post.isNewsletterSent}
                          title={
                            !post.isPublished
                              ? "Publish first to send newsletter"
                              : post.isNewsletterSent
                                ? "Newsletter already sent"
                                : "Send newsletter"
                          }
                        >
                          <Send className="h-4 w-4" />
                        </Button>

                        {/* Delete */}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(post.id)}
                          disabled={deleteMutation.isPending}
                          title="Delete post"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No posts found</p>
            <p className="text-gray-400 text-sm mt-1">
              {filter === "drafts"
                ? "No draft posts"
                : filter === "published"
                  ? "No published posts"
                  : "No blog posts yet"}
            </p>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Dialog
        open={editingPostId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingPostId(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Post</DialogTitle>
            <DialogDescription>
              Update the post details below. Changes are saved when you click Save.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Title</label>
              <Input
                value={editForm.title}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Post title"
              />
            </div>

            {/* Slug */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Slug</label>
              <Input
                value={editForm.slug}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, slug: e.target.value }))
                }
                placeholder="post-url-slug"
              />
            </div>

            {/* Excerpt */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Excerpt</label>
              <Textarea
                value={editForm.excerpt}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, excerpt: e.target.value }))
                }
                placeholder="Brief summary of the post..."
                rows={3}
              />
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                Content <span className="text-gray-400 font-normal">(Markdown)</span>
              </label>
              <Textarea
                value={editForm.content}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, content: e.target.value }))
                }
                placeholder="Full post content in Markdown..."
                rows={15}
                className="font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingPostId(null)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog
        open={previewPostId !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewPostId(null);
        }}
      >
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto p-0">
          {(() => {
            const previewPost = previewPostId !== null ? posts?.find((p) => p.id === previewPostId) : null;
            if (!previewPost) return null;
            const htmlContent = DOMPurify.sanitize(marked(previewPost.content ?? "") as string);
            return (
              <div className="bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] min-h-[60vh] rounded-lg overflow-hidden">
                {/* Hero */}
                <div className="relative w-full" style={{ maxHeight: "320px", overflow: "hidden" }}>
                  {previewPost.thumbnailUrl && (
                    <img src={previewPost.thumbnailUrl} alt={previewPost.title} className="w-full object-cover" style={{ maxHeight: "320px" }} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1a0525] via-[#1a0525]/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <h2 className="text-2xl font-bold text-white">{previewPost.title}</h2>
                    <p className="text-white/50 text-sm mt-1">{previewPost.excerpt}</p>
                  </div>
                </div>

                {/* Video embed */}
                {previewPost.youtubeVideoId && (
                  <div className="max-w-3xl mx-auto px-6 mt-6">
                    <div className="relative w-full rounded-xl overflow-hidden" style={{ paddingBottom: "56.25%", height: 0 }}>
                      <iframe
                        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(previewPost.youtubeVideoId)}?rel=0`}
                        title={previewPost.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="absolute inset-0 w-full h-full"
                      />
                    </div>
                  </div>
                )}

                {/* Content */}
                <div
                  className="max-w-3xl mx-auto px-6 py-8 prose prose-invert prose-lg max-w-none prose-headings:font-bold prose-headings:text-white prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-3 prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-2 prose-p:text-white/70 prose-p:leading-relaxed prose-li:text-white/70 prose-strong:text-white prose-a:text-[#E879F9] prose-img:rounded-xl prose-img:shadow-2xl prose-img:my-6 prose-img:w-full"
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                />

                {/* Close */}
                <div className="px-6 pb-6 text-center">
                  <Button variant="outline" onClick={() => setPreviewPostId(null)} className="bg-white/10 text-white border-white/20 hover:bg-white/20">
                    Close Preview
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Newsletter Confirmation Dialog */}
      <Dialog
        open={newsletterDialogPostId !== null}
        onOpenChange={(open) => {
          if (!open) setNewsletterDialogPostId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Newsletter</DialogTitle>
            <DialogDescription>
              {newsletterDialogPost
                ? `Send "${newsletterDialogPost.title}" to ${subscriberCount?.active ?? 0} active subscriber${(subscriberCount?.active ?? 0) !== 1 ? "s" : ""}?`
                : "Confirm newsletter send"}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            This will email the post to all active newsletter subscribers. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNewsletterDialogPostId(null)}
              disabled={sendNewsletterMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (newsletterDialogPostId !== null) {
                  sendNewsletterMutation.mutate({ id: newsletterDialogPostId });
                }
              }}
              disabled={sendNewsletterMutation.isPending}
            >
              {sendNewsletterMutation.isPending ? "Sending..." : "Send Newsletter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
