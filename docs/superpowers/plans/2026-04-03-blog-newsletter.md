# Blog + Newsletter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a blog system that generates posts from YouTube videos, with admin approval workflow, newsletter distribution via Resend, and subscriber management via account settings.

**Architecture:** New Drizzle tables for `blog_posts` and `newsletter_subscribers`. Separate router file (`server/blogRouter.ts`) and DB helper file (`server/blogDb.ts`) to avoid bloating the existing 2400+ line `routers.ts` and 2800+ line `db.ts`. Bulk import via standalone script using YouTube Data API + Claude API. Frontend uses same purple gradient theme as courses.

**Tech Stack:** Drizzle ORM, tRPC, Resend, YouTube Data API v3, Anthropic Claude API, React + wouter, react-markdown, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-03-blog-newsletter-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `drizzle/schema.ts` (append) | Add `blogPosts` + `newsletterSubscribers` table definitions |
| Create | `server/blogDb.ts` | All blog + newsletter DB query functions |
| Create | `server/blogRouter.ts` | tRPC routes for blog (public + admin) and newsletter |
| Modify | `server/routers.ts` | Import and mount `blogRouter` + `newsletterRouter` |
| Modify | `server/db.ts` | Import and re-export new schema types |
| Create | `server/scripts/import-blog.ts` | One-time bulk import script |
| Modify | `server/_core/email.ts` | Add newsletter email template + unsubscribe token helpers |
| Create | `client/src/pages/Blog.tsx` | `/blog` listing page |
| Create | `client/src/pages/BlogPost.tsx` | `/blog/:slug` single post page |
| Create | `client/src/pages/AccountSettings.tsx` | `/account` page with newsletter toggle |
| Create | `client/src/pages/admin/Blog.tsx` | Admin Manage Blog page |
| Create | `client/src/pages/Unsubscribe.tsx` | `/unsubscribe` landing page |
| Modify | `client/src/App.tsx` | Add routes for blog, account, unsubscribe, admin/blog |
| Modify | `client/src/components/AdminLayout.tsx` | Add "Manage Blog" to sidebar menu |
| Modify | `client/src/components/UserProfileDropdown.tsx` | Add "Account Settings" link |
| Modify | `client/src/pages/Home.tsx` | Wire popup email submit to newsletter.subscribe |

---

## Task 1: Database Schema

**Files:**
- Modify: `drizzle/schema.ts` (append after line 492)
- Modify: `server/db.ts` (add imports at line 4-51)

- [ ] **Step 1: Add blog_posts and newsletter_subscribers tables to schema**

Append to `drizzle/schema.ts` after the existing `liveSessions` table:

```typescript
/**
 * Blog posts generated from YouTube videos
 */
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  youtubeVideoId: varchar("youtube_video_id", { length: 20 }).unique().notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).unique().notNull(),
  excerpt: text("excerpt").notNull(),
  content: text("content").notNull(),
  thumbnailUrl: text("thumbnail_url").notNull(),
  youtubeUrl: text("youtube_url").notNull(),
  publishedAt: timestamp("published_at"),
  isPublished: boolean("is_published").default(false).notNull(),
  isNewsletterSent: boolean("is_newsletter_sent").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("blog_posts_slug_idx").on(table.slug),
  index("blog_posts_published_idx").on(table.isPublished, table.publishedAt),
]);

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;

/**
 * Newsletter subscribers — single source of truth for email list
 */
export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  source: varchar("source", { length: 20 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
  unsubscribedAt: timestamp("unsubscribed_at"),
}, (table) => [
  index("newsletter_email_idx").on(table.email),
  index("newsletter_active_idx").on(table.isActive),
]);

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type InsertNewsletterSubscriber = typeof newsletterSubscribers.$inferInsert;
```

- [ ] **Step 2: Add imports to server/db.ts**

Add to the import block in `server/db.ts` (inside the existing import from `"../drizzle/schema"`):

```typescript
  blogPosts,
  BlogPost,
  InsertBlogPost,
  newsletterSubscribers,
  NewsletterSubscriber,
  InsertNewsletterSubscriber,
```

- [ ] **Step 3: Push schema to database**

Run: `npx drizzle-kit push`

Expected: Tables `blog_posts` and `newsletter_subscribers` created in Supabase.

- [ ] **Step 4: Commit**

```bash
git add drizzle/schema.ts server/db.ts
git commit -m "feat(blog): add blog_posts and newsletter_subscribers tables"
```

---

## Task 2: Blog & Newsletter DB Functions

**Files:**
- Create: `server/blogDb.ts`

- [ ] **Step 1: Create server/blogDb.ts with all DB query functions**

```typescript
import { eq, and, desc, sql, like, isNull } from "drizzle-orm";
import { getDb } from "./db";
import {
  blogPosts,
  BlogPost,
  InsertBlogPost,
  newsletterSubscribers,
  NewsletterSubscriber,
  InsertNewsletterSubscriber,
} from "../drizzle/schema";

// ── Blog Posts ────────────────────────────────────────────────────────────

export async function getBlogPosts(filter: 'all' | 'drafts' | 'published' = 'all') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let query = db.select().from(blogPosts);
  if (filter === 'published') {
    query = query.where(eq(blogPosts.isPublished, true));
  } else if (filter === 'drafts') {
    query = query.where(eq(blogPosts.isPublished, false));
  }
  return await query.orderBy(desc(blogPosts.createdAt));
}

export async function getPublishedBlogPosts(page: number, limit: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const offset = (page - 1) * limit;
  const posts = await db
    .select({
      id: blogPosts.id,
      title: blogPosts.title,
      slug: blogPosts.slug,
      excerpt: blogPosts.excerpt,
      thumbnailUrl: blogPosts.thumbnailUrl,
      publishedAt: blogPosts.publishedAt,
    })
    .from(blogPosts)
    .where(eq(blogPosts.isPublished, true))
    .orderBy(desc(blogPosts.publishedAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(blogPosts)
    .where(eq(blogPosts.isPublished, true));

  return { posts, total: count };
}

export async function getBlogPostBySlug(slug: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(blogPosts)
    .where(and(eq(blogPosts.slug, slug), eq(blogPosts.isPublished, true)))
    .limit(1);
  return result[0] ?? null;
}

export async function getBlogPostById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
  return result[0] ?? null;
}

export async function insertBlogPost(post: InsertBlogPost) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(blogPosts).values(post).onConflictDoNothing().returning();
  return result[0] ?? null;
}

export async function updateBlogPost(id: number, data: Partial<Pick<BlogPost, 'title' | 'slug' | 'excerpt' | 'content'>>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.update(blogPosts).set(data).where(eq(blogPosts.id, id)).returning();
  return result[0] ?? null;
}

export async function publishBlogPost(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(blogPosts)
    .set({ isPublished: true, publishedAt: new Date() })
    .where(eq(blogPosts.id, id))
    .returning();
  return result[0] ?? null;
}

export async function unpublishBlogPost(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(blogPosts)
    .set({ isPublished: false, publishedAt: null })
    .where(eq(blogPosts.id, id))
    .returning();
  return result[0] ?? null;
}

export async function deleteBlogPost(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(blogPosts).where(eq(blogPosts.id, id));
}

export async function markNewsletterSent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(blogPosts).set({ isNewsletterSent: true }).where(eq(blogPosts.id, id));
}

// ── Newsletter Subscribers ────────────────────────────────────────────────

export async function subscribeToNewsletter(email: string, source: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Upsert: insert or reactivate
  const existing = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.email, email.toLowerCase()))
    .limit(1);

  if (existing[0]) {
    if (!existing[0].isActive) {
      await db
        .update(newsletterSubscribers)
        .set({ isActive: true, unsubscribedAt: null })
        .where(eq(newsletterSubscribers.id, existing[0].id));
    }
    return existing[0];
  }

  const result = await db
    .insert(newsletterSubscribers)
    .values({ email: email.toLowerCase(), source })
    .returning();
  return result[0];
}

export async function unsubscribeFromNewsletter(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(newsletterSubscribers)
    .set({ isActive: false, unsubscribedAt: new Date() })
    .where(eq(newsletterSubscribers.email, email.toLowerCase()));
}

export async function getNewsletterStatus(email: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select({ isActive: newsletterSubscribers.isActive })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.email, email.toLowerCase()))
    .limit(1);
  return result[0]?.isActive ?? false;
}

export async function getActiveSubscribers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select({ email: newsletterSubscribers.email })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.isActive, true));
}

export async function getSubscriberCount() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [active] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.isActive, true));

  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(newsletterSubscribers);

  return { active: active.count, total: total.count };
}

export async function getSubscribers(page: number, limit: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const offset = (page - 1) * limit;
  const subscribers = await db
    .select()
    .from(newsletterSubscribers)
    .orderBy(desc(newsletterSubscribers.subscribedAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(newsletterSubscribers);

  return { subscribers, total: count };
}
```

- [ ] **Step 2: Commit**

```bash
git add server/blogDb.ts
git commit -m "feat(blog): add blog and newsletter DB query functions"
```

---

## Task 3: Newsletter Email Template + Unsubscribe Token

**Files:**
- Modify: `server/_core/email.ts` (append new functions)

- [ ] **Step 1: Add newsletter email template and HMAC token helpers**

Append to `server/_core/email.ts`:

```typescript
import crypto from "crypto";

const NEWSLETTER_SECRET = process.env.NEWSLETTER_SECRET || "default-newsletter-secret";
const SITE_URL = process.env.VITE_SITE_URL || "https://www.elizabeth-zolotova.com";

export function generateUnsubscribeToken(email: string): string {
  return crypto.createHmac("sha256", NEWSLETTER_SECRET).update(email.toLowerCase()).digest("hex");
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = generateUnsubscribeToken(email);
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function getNewsletterEmailHtml(params: {
  title: string;
  excerpt: string;
  thumbnailUrl: string;
  slug: string;
  recipientEmail: string;
}): string {
  const postUrl = `${SITE_URL}/blog/${params.slug}`;
  const unsubToken = generateUnsubscribeToken(params.recipientEmail);
  const unsubUrl = `${SITE_URL}/unsubscribe?email=${encodeURIComponent(params.recipientEmail)}&token=${unsubToken}`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f0f7;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
    <tr>
      <td style="padding:0;">
        <img src="${params.thumbnailUrl}" alt="" style="width:100%;height:auto;display:block;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px 24px;">
        <h1 style="margin:0 0 16px;font-size:24px;color:#1a0525;line-height:1.3;">${params.title}</h1>
        <p style="margin:0 0 24px;font-size:16px;color:#555;line-height:1.6;">${params.excerpt}</p>
        <a href="${postUrl}" style="display:inline-block;padding:14px 28px;background:#C026D3;color:#fff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:bold;letter-spacing:0.5px;">
          Read Full Post
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;border-top:1px solid #eee;text-align:center;">
        <p style="margin:0;font-size:12px;color:#999;">
          You received this because you subscribed to the High Heels Dance newsletter.<br/>
          <a href="${unsubUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/_core/email.ts
git commit -m "feat(blog): add newsletter email template and unsubscribe tokens"
```

---

## Task 4: Blog & Newsletter tRPC Routers

**Files:**
- Create: `server/blogRouter.ts`
- Modify: `server/routers.ts` (import and mount at lines 1-8 and ~2434)

- [ ] **Step 1: Create server/blogRouter.ts**

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { sendEmail, getNewsletterEmailHtml } from "./_core/email";
import * as blogDb from "./blogDb";

// Admin-only procedure (same pattern as routers.ts)
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const blogRouter = router({
  list: publicProcedure
    .input(z.object({ page: z.number().min(1).default(1), limit: z.number().min(1).max(50).default(12) }))
    .query(async ({ input }) => {
      return await blogDb.getPublishedBlogPosts(input.page, input.limit);
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const post = await blogDb.getBlogPostBySlug(input.slug);
      if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      return post;
    }),
});

export const newsletterRouter = router({
  subscribe: protectedProcedure
    .input(z.object({ email: z.string().email().optional(), source: z.string().default('registration') }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email || ctx.user.email;
      if (!email) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email required' });
      await blogDb.subscribeToNewsletter(email, input.source);
      return { ok: true };
    }),

  unsubscribe: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user.email) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No email on account' });
    await blogDb.unsubscribeFromNewsletter(ctx.user.email);
    return { ok: true };
  }),

  status: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.email) return { subscribed: false };
    const subscribed = await blogDb.getNewsletterStatus(ctx.user.email);
    return { subscribed };
  }),
});

export const adminBlogRouter = router({
  list: adminProcedure
    .input(z.object({ filter: z.enum(['all', 'drafts', 'published']).default('all') }).optional())
    .query(async ({ input }) => {
      return await blogDb.getBlogPosts(input?.filter ?? 'all');
    }),

  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const post = await blogDb.getBlogPostById(input.id);
      if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      return post;
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      slug: z.string().min(1).max(255).optional(),
      excerpt: z.string().optional(),
      content: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const post = await blogDb.updateBlogPost(id, data);
      if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      return post;
    }),

  publish: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const post = await blogDb.publishBlogPost(input.id);
      if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      return post;
    }),

  unpublish: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const post = await blogDb.unpublishBlogPost(input.id);
      if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      return post;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await blogDb.deleteBlogPost(input.id);
      return { ok: true };
    }),

  sendNewsletter: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const post = await blogDb.getBlogPostById(input.id);
      if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      if (!post.isPublished) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Post must be published first' });

      const subscribers = await blogDb.getActiveSubscribers();
      let sentCount = 0;

      for (const sub of subscribers) {
        const html = getNewsletterEmailHtml({
          title: post.title,
          excerpt: post.excerpt,
          thumbnailUrl: post.thumbnailUrl,
          slug: post.slug,
          recipientEmail: sub.email,
        });
        const result = await sendEmail({ to: sub.email, subject: post.title, html });
        if (result.success) sentCount++;
      }

      await blogDb.markNewsletterSent(input.id);
      return { sentCount };
    }),

  subscriberCount: adminProcedure.query(async () => {
    return await blogDb.getSubscriberCount();
  }),

  subscribers: adminProcedure
    .input(z.object({ page: z.number().min(1).default(1), limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      return await blogDb.getSubscribers(input.page, input.limit);
    }),
});
```

- [ ] **Step 2: Mount routers in server/routers.ts**

Add import at the top of `server/routers.ts` (after line 7):

```typescript
import { blogRouter, newsletterRouter, adminBlogRouter } from "./blogRouter";
```

Add to the `appRouter` object, before the closing `});` at line 2435:

```typescript
  blog: blogRouter,
  newsletter: newsletterRouter,
  adminBlog: adminBlogRouter,
```

Note: `adminBlog` is a top-level router (not nested inside `admin`) because the existing `admin` router in `routers.ts` is not a modular router — it's inline. Adding a separate top-level `adminBlog` router is cleaner.

- [ ] **Step 3: Commit**

```bash
git add server/blogRouter.ts server/routers.ts
git commit -m "feat(blog): add blog, newsletter, and admin blog tRPC routers"
```

---

## Task 5: Bulk Import Script

**Files:**
- Create: `server/scripts/import-blog.ts`

- [ ] **Step 1: Install Anthropic SDK**

Run: `npm install @anthropic-ai/sdk`

- [ ] **Step 2: Create the import script**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

// Load env
import "dotenv/config";

// DB setup — reuse project's DB connection
import { getDb } from "../db";
import { blogPosts } from "../../drizzle/schema";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CHANNEL_HANDLE = "highheelstutorials";
const MAX_VIDEOS = 15;

if (!YOUTUBE_API_KEY) { console.error("YOUTUBE_API_KEY required"); process.exit(1); }
if (!ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY required"); process.exit(1); }

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Read the BLOG.md skill file
const blogSkill = fs.readFileSync(path.resolve(__dirname, "../../BLOG.md"), "utf-8");

interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);
}

async function fetchChannelVideos(): Promise<YouTubeVideo[]> {
  // Step 1: Get channel ID from handle
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?forHandle=${CHANNEL_HANDLE}&part=contentDetails&key=${YOUTUBE_API_KEY}`
  );
  const channelData = await channelRes.json();
  if (!channelData.items?.length) {
    throw new Error(`Channel @${CHANNEL_HANDLE} not found`);
  }
  const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
  console.log(`Found uploads playlist: ${uploadsPlaylistId}`);

  // Step 2: Fetch videos from uploads playlist
  const videos: YouTubeVideo[] = [];
  let pageToken = "";

  while (videos.length < MAX_VIDEOS) {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${uploadsPlaylistId}&part=snippet&maxResults=50&key=${YOUTUBE_API_KEY}${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url);
    const data = await res.json();

    for (const item of data.items || []) {
      if (videos.length >= MAX_VIDEOS) break;
      const snippet = item.snippet;
      videos.push({
        videoId: snippet.resourceId.videoId,
        title: snippet.title,
        description: snippet.description || "",
        publishedAt: snippet.publishedAt,
        thumbnailUrl: `https://img.youtube.com/vi/${snippet.resourceId.videoId}/maxresdefault.jpg`,
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
    await new Promise(r => setTimeout(r, 1000)); // Rate limit
  }

  console.log(`Fetched ${videos.length} videos`);
  return videos;
}

async function generateBlogPost(video: YouTubeVideo): Promise<{ content: string; excerpt: string }> {
  const userPrompt = `Generate a blog post for this YouTube video:

Title: ${video.title}
Description: ${video.description}

Use these screenshot image URLs in the blog post (replace the screenshot-placeholder markers):
- ![Screenshot 1](https://img.youtube.com/vi/${video.videoId}/0.jpg)
- ![Screenshot 2](https://img.youtube.com/vi/${video.videoId}/1.jpg)
- ![Screenshot 3](https://img.youtube.com/vi/${video.videoId}/2.jpg)
- ![Screenshot 4](https://img.youtube.com/vi/${video.videoId}/3.jpg)

Use the main thumbnail as the first image:
- ![Featured](https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg)

Respond ONLY with the full blog post in clean Markdown. Include a 1-2 sentence excerpt at the very top on a line starting with "EXCERPT:" — then the rest of the blog post.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: blogSkill,
    messages: [{ role: "user", content: userPrompt }],
  });

  const fullText = response.content[0].type === "text" ? response.content[0].text : "";

  // Extract excerpt
  let excerpt = "";
  let content = fullText;
  const excerptMatch = fullText.match(/^EXCERPT:\s*(.+?)(?:\n|$)/i);
  if (excerptMatch) {
    excerpt = excerptMatch[1].trim();
    content = fullText.replace(excerptMatch[0], "").trim();
  } else {
    // Fallback: first sentence
    excerpt = fullText.split(/[.!?]/)[0].trim() + ".";
  }

  return { content, excerpt };
}

async function main() {
  console.log("=== Blog Import Script ===");
  console.log(`Fetching up to ${MAX_VIDEOS} videos from @${CHANNEL_HANDLE}...`);

  const videos = await fetchChannelVideos();
  const db = await getDb();
  if (!db) { console.error("Database not available"); process.exit(1); }

  let imported = 0;
  let skipped = 0;

  for (const video of videos) {
    const slug = slugify(video.title);
    console.log(`\n[${imported + skipped + 1}/${videos.length}] ${video.title}`);

    // Check if already exists
    const existing = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(require("drizzle-orm").eq(blogPosts.youtubeVideoId, video.videoId))
      .limit(1);

    if (existing.length > 0) {
      console.log("  → Skipped (already exists)");
      skipped++;
      continue;
    }

    // Generate blog content
    console.log("  → Generating blog post with Claude...");
    const { content, excerpt } = await generateBlogPost(video);

    // Insert as draft
    await db.insert(blogPosts).values({
      youtubeVideoId: video.videoId,
      title: video.title,
      slug,
      excerpt,
      content,
      thumbnailUrl: video.thumbnailUrl,
      youtubeUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
      isPublished: false,
      isNewsletterSent: false,
    });

    console.log(`  → Saved as draft (slug: ${slug})`);
    imported++;

    // Rate limit Claude API
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n=== Done! Imported: ${imported}, Skipped: ${skipped} ===`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Commit**

```bash
git add server/scripts/import-blog.ts package.json package-lock.json
git commit -m "feat(blog): add bulk import script for YouTube videos"
```

---

## Task 6: Frontend Routes & Dependencies

**Files:**
- Modify: `client/src/App.tsx` (add imports + routes)

- [ ] **Step 1: Install react-markdown**

Run: `npm install react-markdown`

- [ ] **Step 2: Add imports and routes to App.tsx**

Add imports after existing page imports (after line 43):

```typescript
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import AccountSettings from "./pages/AccountSettings";
import AdminBlog from "./pages/admin/Blog";
import Unsubscribe from "./pages/Unsubscribe";
```

Add routes inside `<Switch>` — public routes before admin routes (after line 68):

```tsx
<Route path="/blog" component={Blog} />
<Route path="/blog/:slug" component={BlogPost} />
<Route path="/account" component={AccountSettings} />
<Route path="/unsubscribe" component={Unsubscribe} />
```

Add admin route (after line 81):

```tsx
<Route path="/admin/blog">{() => <AdminGuard><AdminBlog /></AdminGuard>}</Route>
```

- [ ] **Step 3: Add "Manage Blog" to AdminLayout sidebar**

In `client/src/components/AdminLayout.tsx`, add to the `menuItems` array (after line 30, before Settings):

```typescript
import { FileText } from "lucide-react";
```

Add `FileText` to the lucide import at line 2. Then add the menu item:

```typescript
{ path: "/admin/blog", icon: FileText, label: "Manage Blog" },
```

- [ ] **Step 4: Add "Account Settings" to UserProfileDropdown**

In `client/src/components/UserProfileDropdown.tsx`, add a link between "Membership" and "Help & Support". Find the Membership link and add after it:

```tsx
<Link href="/account" onClick={closeDropdown}>
  <button role="menuitem" className={itemClasses}>
    <Settings className="h-4 w-4" />
    Account Settings
  </button>
</Link>
```

Add `Settings` to the lucide-react import if not already present.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/components/AdminLayout.tsx client/src/components/UserProfileDropdown.tsx package.json package-lock.json
git commit -m "feat(blog): add routes, admin menu item, and account settings link"
```

---

## Task 7: Blog Listing Page (`/blog`)

**Files:**
- Create: `client/src/pages/Blog.tsx`

- [ ] **Step 1: Create Blog.tsx**

```tsx
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";

export default function Blog() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = trpc.blog.list.useQuery({ page, limit: 12 });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-fuchsia-500 rounded-full blur-[150px] opacity-[0.08]" />
        <div className="absolute bottom-40 right-10 w-[400px] h-[400px] bg-purple-400 rounded-full blur-[150px] opacity-[0.08]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600 rounded-full blur-[200px] opacity-[0.05]" />
      </div>

      {/* Header */}
      <div className="border-b border-[#E879F9]/10 bg-white/[0.03] backdrop-blur-sm relative z-10">
        <div className="container py-6">
          <Link href="/">
            <button className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-4">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          </Link>
          <h1 className="text-4xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>Blog</h1>
          <p className="text-white/50 mt-2">Tips, tutorials, and inspiration for your dance journey</p>
        </div>
      </div>

      {/* Content */}
      <div className="container py-8 relative z-10">
        {isLoading ? (
          <div className="flex justify-center py-24">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#E879F9]" />
          </div>
        ) : !data?.posts.length ? (
          <p className="text-center text-white/40 py-24 text-lg">No blog posts yet. Check back soon!</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {data.posts.map((post) => (
                <Link key={post.id} href={`/blog/${post.slug}`}>
                  <div className="group cursor-pointer bg-white/[0.04] backdrop-blur-sm rounded-2xl p-3 border border-[#E879F9]/10 hover:border-[#E879F9]/25 hover:shadow-[0_0_30px_rgba(232,121,249,0.08)] transition-all duration-500">
                    <div className="relative overflow-hidden rounded-xl mb-4">
                      <img
                        src={post.thumbnailUrl}
                        alt={post.title}
                        className="w-full h-48 object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                      />
                    </div>
                    <h2 className="text-lg font-semibold text-white group-hover:text-[#E879F9] transition-colors mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                      {post.title}
                    </h2>
                    <p className="text-sm text-white/40 line-clamp-2 mb-3">{post.excerpt}</p>
                    <p className="text-xs text-white/30">
                      {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                    </p>
                    <div className="mt-4 h-px bg-gradient-to-r from-[#E879F9]/30 via-[#C026D3]/20 to-transparent" />
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {data.total > 12 && (
              <div className="flex justify-center gap-3 mt-12">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-6 py-2 text-sm text-white/60 border border-white/15 hover:border-white/30 rounded-full transition-all disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * 12 >= data.total}
                  className="px-6 py-2 text-sm text-white/60 border border-white/15 hover:border-white/30 rounded-full transition-all disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Blog.tsx
git commit -m "feat(blog): add /blog listing page"
```

---

## Task 8: Single Blog Post Page (`/blog/:slug`)

**Files:**
- Create: `client/src/pages/BlogPost.tsx`

- [ ] **Step 1: Create BlogPost.tsx**

```tsx
import { trpc } from "@/lib/trpc";
import { Link, useParams } from "wouter";
import { ArrowLeft, Share2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useEffect } from "react";

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const { data: post, isLoading, error } = trpc.blog.getBySlug.useQuery({ slug: slug || "" }, { enabled: !!slug });

  // Set page title and meta
  useEffect(() => {
    if (post) {
      document.title = `${post.title} | High Heels Dance Blog`;
    }
    return () => { document.title = "High Heels Dance Classes & Courses | Elizabeth Zolotova"; };
  }, [post]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    alert("Link copied to clipboard!");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#E879F9]" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/60 text-lg mb-4">Post not found</p>
          <Link href="/blog">
            <button className="px-6 py-2 text-sm text-white/60 border border-white/15 hover:border-white/30 rounded-full transition-all">
              Back to Blog
            </button>
          </Link>
        </div>
      </div>
    );
  }

  // Extract YouTube video ID for embed
  const videoId = post.youtubeVideoId;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] relative overflow-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-fuchsia-500 rounded-full blur-[150px] opacity-[0.08]" />
        <div className="absolute bottom-40 right-10 w-[400px] h-[400px] bg-purple-400 rounded-full blur-[150px] opacity-[0.08]" />
      </div>

      <div className="relative z-10">
        {/* Nav */}
        <div className="container py-6 flex items-center justify-between">
          <Link href="/blog">
            <button className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" /> Back to Blog
            </button>
          </Link>
          <button onClick={handleShare} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors">
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>

        {/* Hero */}
        <div className="relative">
          <img src={post.thumbnailUrl} alt={post.title} className="w-full h-64 md:h-96 object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a0525] via-[#1a0525]/50 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12">
            <div className="container">
              <p className="text-white/50 text-sm mb-2">
                {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
              </p>
              <h1 className="text-3xl md:text-5xl font-bold text-white max-w-3xl" style={{ fontFamily: 'var(--font-display)' }}>
                {post.title}
              </h1>
            </div>
          </div>
        </div>

        {/* Video Embed */}
        <div className="container max-w-4xl py-8">
          <div className="relative w-full rounded-xl overflow-hidden" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube.com/embed/${videoId}`}
              title={post.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>

        {/* Content */}
        <article className="container max-w-3xl pb-16">
          <div className="prose prose-invert prose-lg max-w-none
            prose-headings:font-bold prose-headings:text-white
            prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
            prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
            prose-p:text-white/70 prose-p:leading-relaxed
            prose-li:text-white/70
            prose-strong:text-white
            prose-a:text-[#E879F9] prose-a:no-underline hover:prose-a:underline
            prose-img:rounded-xl prose-img:shadow-lg prose-img:my-6
          ">
            <ReactMarkdown>{post.content}</ReactMarkdown>
          </div>

          {/* CTA Section */}
          <div className="mt-16 p-8 rounded-2xl bg-white/[0.04] backdrop-blur-sm border border-[#E879F9]/10 text-center">
            <h3 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: 'var(--font-display)' }}>
              Ready to start dancing?
            </h3>
            <p className="text-white/50 mb-6">Take the next step in your dance journey with Elizabeth</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/courses">
                <button className="px-8 py-3 text-sm font-semibold text-[#1a0a1e] bg-white hover:bg-white/90 rounded-full transition-all uppercase tracking-wider">
                  Explore Our Courses
                </button>
              </Link>
              <Link href="/book-session">
                <button className="px-8 py-3 text-sm font-semibold text-white border border-[#E879F9]/30 hover:border-[#E879F9]/60 rounded-full transition-all uppercase tracking-wider">
                  Book a Session
                </button>
              </Link>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/BlogPost.tsx
git commit -m "feat(blog): add /blog/:slug single post page with video embed and CTA"
```

---

## Task 9: Account Settings Page

**Files:**
- Create: `client/src/pages/AccountSettings.tsx`

- [ ] **Step 1: Create AccountSettings.tsx**

```tsx
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AccountSettings() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: newsletterStatus, isLoading: statusLoading } = trpc.newsletter.status.useQuery(undefined, { enabled: isAuthenticated });
  const subscribeMutation = trpc.newsletter.subscribe.useMutation({
    onSuccess: () => { utils.newsletter.status.invalidate(); toast.success("Subscribed to newsletter"); },
  });
  const unsubscribeMutation = trpc.newsletter.unsubscribe.useMutation({
    onSuccess: () => { utils.newsletter.status.invalidate(); toast.success("Unsubscribed from newsletter"); },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#E879F9]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    navigate("/");
    return null;
  }

  const isSubscribed = newsletterStatus?.subscribed ?? false;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] relative overflow-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-fuchsia-500 rounded-full blur-[150px] opacity-[0.08]" />
        <div className="absolute bottom-40 right-10 w-[400px] h-[400px] bg-purple-400 rounded-full blur-[150px] opacity-[0.08]" />
      </div>

      <div className="border-b border-[#E879F9]/10 bg-white/[0.03] backdrop-blur-sm relative z-10">
        <div className="container py-6">
          <Link href="/dashboard">
            <button className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-4">
              <ArrowLeft className="h-4 w-4" /> Back to Studio
            </button>
          </Link>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>Account Settings</h1>
        </div>
      </div>

      <div className="container max-w-2xl py-8 relative z-10">
        {/* Profile Info */}
        <div className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-6 border border-[#E879F9]/10 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Profile</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-white/40">Name</label>
              <p className="text-white">{user?.name || "Not set"}</p>
            </div>
            <div>
              <label className="text-sm text-white/40">Email</label>
              <p className="text-white">{user?.email || "Not set"}</p>
            </div>
          </div>
        </div>

        {/* Newsletter */}
        <div className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-6 border border-[#E879F9]/10">
          <h2 className="text-lg font-semibold text-white mb-4">Newsletter</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white">Subscribe to our newsletter</p>
              <p className="text-sm text-white/40">Receive dance tips, blog posts, and exclusive offers</p>
            </div>
            {statusLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-white/40" />
            ) : (
              <button
                onClick={() => isSubscribed ? unsubscribeMutation.mutate() : subscribeMutation.mutate({ source: 'registration' })}
                disabled={subscribeMutation.isPending || unsubscribeMutation.isPending}
                className={`relative w-12 h-6 rounded-full transition-colors ${isSubscribed ? 'bg-[#C026D3]' : 'bg-white/20'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${isSubscribed ? 'translate-x-6' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/AccountSettings.tsx
git commit -m "feat(blog): add /account settings page with newsletter toggle"
```

---

## Task 10: Unsubscribe Page

**Files:**
- Create: `client/src/pages/Unsubscribe.tsx`

- [ ] **Step 1: Create Unsubscribe.tsx**

```tsx
import { useEffect, useState } from "react";
import { Link } from "wouter";

export default function Unsubscribe() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const email = params.get("email");
    const token = params.get("token");

    if (!email || !token) {
      setStatus('error');
      return;
    }

    fetch("/api/newsletter/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token }),
    })
      .then(res => { setStatus(res.ok ? 'success' : 'error'); })
      .catch(() => setStatus('error'));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] flex items-center justify-center">
      <div className="text-center max-w-md">
        {status === 'loading' && (
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#E879F9] mx-auto" />
        )}
        {status === 'success' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-3">Unsubscribed</h1>
            <p className="text-white/50 mb-6">You have been removed from our newsletter. You can re-subscribe anytime from your account settings.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-3">Something went wrong</h1>
            <p className="text-white/50 mb-6">The unsubscribe link may be invalid or expired.</p>
          </>
        )}
        <Link href="/">
          <button className="px-6 py-2.5 text-sm font-semibold text-[#1a0a1e] bg-white hover:bg-white/90 rounded-full transition-all">
            Go Home
          </button>
        </Link>
      </div>
    </div>
  );
}
```

Note: This calls a REST endpoint `/api/newsletter/unsubscribe` instead of tRPC because the user may not be authenticated. Add this endpoint in `server/blogRouter.ts` as an Express route, or add it to the server setup. The simplest approach: add a `publicUnsubscribe` procedure to the newsletter router that takes email + token:

Add to `server/blogRouter.ts` in the `newsletterRouter`:

```typescript
  publicUnsubscribe: publicProcedure
    .input(z.object({ email: z.string().email(), token: z.string() }))
    .mutation(async ({ input }) => {
      const { verifyUnsubscribeToken } = await import("./_core/email");
      if (!verifyUnsubscribeToken(input.email, input.token)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid unsubscribe token' });
      }
      await blogDb.unsubscribeFromNewsletter(input.email);
      return { ok: true };
    }),
```

Then update `Unsubscribe.tsx` to use tRPC instead of fetch:

```tsx
const unsubMutation = trpc.newsletter.publicUnsubscribe.useMutation({
  onSuccess: () => setStatus('success'),
  onError: () => setStatus('error'),
});

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const email = params.get("email");
  const token = params.get("token");
  if (!email || !token) { setStatus('error'); return; }
  unsubMutation.mutate({ email, token });
}, []);
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Unsubscribe.tsx server/blogRouter.ts
git commit -m "feat(blog): add /unsubscribe page with token verification"
```

---

## Task 11: Admin Manage Blog Page

**Files:**
- Create: `client/src/pages/admin/Blog.tsx`

- [ ] **Step 1: Create the admin Blog management page**

This is the largest frontend file. It includes: post list with filters, inline edit modal, publish/unpublish, send newsletter, and delete. Full code in `client/src/pages/admin/Blog.tsx`. Key features:

- `AdminLayout` wrapper
- Filter tabs: All / Drafts / Published
- Table of posts with status badges
- Edit modal with title, slug, excerpt, content (textarea), and live markdown preview
- Publish/Unpublish toggle button
- "Send as Newsletter" button with confirmation dialog showing subscriber count
- Delete with confirmation
- Subscriber count displayed at top

The component uses these tRPC calls:
- `trpc.adminBlog.list.useQuery`
- `trpc.adminBlog.update.useMutation`
- `trpc.adminBlog.publish.useMutation`
- `trpc.adminBlog.unpublish.useMutation`
- `trpc.adminBlog.delete.useMutation`
- `trpc.adminBlog.sendNewsletter.useMutation`
- `trpc.adminBlog.subscriberCount.useQuery`

Implementation should follow the pattern of existing admin pages like `Discounts.tsx` — wrap in `AdminLayout`, check auth, loading state, then render content.

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/admin/Blog.tsx
git commit -m "feat(blog): add admin Manage Blog page with edit, publish, and newsletter"
```

---

## Task 12: Wire Popup Email to Newsletter

**Files:**
- Modify: `client/src/pages/Home.tsx` (popup onEmailSubmit handler)

- [ ] **Step 1: Add newsletter subscribe call to popup email handler**

In `Home.tsx`, find the `onEmailSubmit` callback of `WebsitePopup` (around line 245). After the existing `recordInteractionMutation.mutate()` call, add:

```typescript
// Also subscribe to newsletter
subscribeNewsletterMutation.mutate({ email, source: 'popup' });
```

Add the mutation near the other hooks:

```typescript
const subscribseNewsletterMutation = trpc.newsletter.subscribe.useMutation();
```

Note: This mutation call should be best-effort (ignore errors). The `newsletter.subscribe` route requires auth, so for unauthenticated popup users, we need to make it a public procedure. Update `server/blogRouter.ts`:

Change `newsletter.subscribe` from `protectedProcedure` to `publicProcedure` and make email required (not optional from ctx):

```typescript
subscribe: publicProcedure
  .input(z.object({ email: z.string().email(), source: z.string().default('popup') }))
  .mutation(async ({ input }) => {
    await blogDb.subscribeToNewsletter(input.email, input.source);
    return { ok: true };
  }),
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Home.tsx server/blogRouter.ts
git commit -m "feat(blog): wire popup email submission to newsletter subscribe"
```

---

## Task 13: Add Blog Link to Homepage Nav

**Files:**
- Modify: `client/src/pages/Home.tsx` (desktop nav links, around line 260)

- [ ] **Step 1: Add Blog to the navigation**

In the desktop nav `<nav>` element, add after the "Membership" link:

```tsx
<Link href="/blog">
  <span className="text-sm font-medium text-white/70 uppercase tracking-[0.15em] hover:text-white transition-colors cursor-pointer">Blog</span>
</Link>
```

Also add to `MobileNav.tsx` if a Blog link is desired in the mobile menu.

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Home.tsx
git commit -m "feat(blog): add Blog link to homepage navigation"
```

---

## Task 14: Run Bulk Import

- [ ] **Step 1: Set environment variables**

Ensure `.env` has:
```
YOUTUBE_API_KEY=<your_key>
ANTHROPIC_API_KEY=<your_key>
```

- [ ] **Step 2: Run the import script**

Run: `npx tsx server/scripts/import-blog.ts`

Expected: Imports up to 15 videos as draft blog posts. Console output shows progress per video.

- [ ] **Step 3: Verify in database**

Check the blog_posts table has drafts:
```sql
SELECT id, title, slug, is_published FROM blog_posts ORDER BY id;
```

---

## Task 15: Final Integration Test

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test public blog pages**

1. Navigate to `/blog` — should show empty (all posts are drafts)
2. Navigate to `/admin/blog` — should show all draft posts
3. Publish one post from admin
4. Navigate to `/blog` — should show the published post
5. Click into the post — should show full content, video embed, CTA

- [ ] **Step 3: Test newsletter flow**

1. Navigate to `/account` — should show newsletter toggle
2. Toggle on — should subscribe
3. In admin, click "Send Newsletter" on a published post
4. Verify email sent (check Resend dashboard)

- [ ] **Step 4: Test unsubscribe**

1. Click unsubscribe link from email
2. Should land on `/unsubscribe` and confirm unsubscription

- [ ] **Step 5: Commit any fixes and push**

```bash
git push origin main
```
