import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as blogDb from "./blogDb";
import { sendEmail, getNewsletterEmailHtml, verifyUnsubscribeToken } from "./_core/email";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ---------------------------------------------------------------------------
// Public blog router
// ---------------------------------------------------------------------------

export const blogRouter = router({
  list: publicProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(12),
      })
    )
    .query(async ({ input }) => {
      return blogDb.getPublishedBlogPosts(input.page, input.limit);
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const post = await blogDb.getBlogPostBySlug(input.slug);
      if (!post) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Blog post not found" });
      }
      return post;
    }),
});

// ---------------------------------------------------------------------------
// Newsletter router (mixed public / protected)
// ---------------------------------------------------------------------------

export const newsletterRouter = router({
  subscribe: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        source: z.string().max(20).default("popup"),
      })
    )
    .mutation(async ({ input }) => {
      await blogDb.subscribeToNewsletter(input.email, input.source);
      // Return only a success flag — never leak subscriber details to public callers
      return { ok: true as const };
    }),

  unsubscribe: protectedProcedure.mutation(async ({ ctx }) => {
    await blogDb.unsubscribeFromNewsletter(ctx.user.email);
  }),

  status: protectedProcedure.query(async ({ ctx }) => {
    const subscribed = await blogDb.getNewsletterStatus(ctx.user.email);
    return { subscribed };
  }),

  publicUnsubscribe: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        token: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const valid = verifyUnsubscribeToken(input.email, input.token);
      if (!valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid unsubscribe token" });
      }
      await blogDb.unsubscribeFromNewsletter(input.email);
    }),
});

// ---------------------------------------------------------------------------
// Admin blog router
// ---------------------------------------------------------------------------

export const adminBlogRouter = router({
  list: adminProcedure
    .input(
      z.object({
        filter: z.enum(["all", "drafts", "published"]).default("all"),
      }).default({})
    )
    .query(async ({ input }) => {
      return blogDb.getBlogPosts(input.filter);
    }),

  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const post = await blogDb.getBlogPostById(input.id);
      if (!post) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Blog post not found" });
      }
      return post;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        slug: z.string().optional(),
        excerpt: z.string().optional(),
        content: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return blogDb.updateBlogPost(id, data);
    }),

  publish: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return blogDb.publishBlogPost(input.id);
    }),

  unpublish: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return blogDb.unpublishBlogPost(input.id);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await blogDb.deleteBlogPost(input.id);
      return { ok: true as const };
    }),

  sendNewsletter: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const post = await blogDb.getBlogPostById(input.id);
      if (!post) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Blog post not found" });
      }
      if (!post.isPublished) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot send newsletter for an unpublished post" });
      }

      const subscribers = await blogDb.getActiveSubscribers();
      let sentCount = 0;

      for (const subscriber of subscribers) {
        const html = getNewsletterEmailHtml({
          title: post.title,
          excerpt: post.excerpt ?? "",
          thumbnailUrl: post.thumbnailUrl ?? "",
          slug: post.slug,
          recipientEmail: subscriber.email,
        });

        const result = await sendEmail({
          to: subscriber.email,
          subject: post.title,
          html,
        });

        if (result.success) {
          sentCount++;
        }
      }

      await blogDb.markNewsletterSent(input.id);

      return { sentCount };
    }),

  subscriberCount: adminProcedure.query(async () => {
    return blogDb.getSubscriberCount();
  }),

  subscribers: adminProcedure
    .input(z.object({ page: z.number().min(1), limit: z.number().min(1).max(100) }))
    .query(async ({ input }) => {
      return blogDb.getSubscribers(input.page, input.limit);
    }),
});
