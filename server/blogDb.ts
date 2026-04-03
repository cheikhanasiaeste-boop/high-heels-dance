import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  blogPosts,
  BlogPost,
  InsertBlogPost,
  newsletterSubscribers,
  NewsletterSubscriber,
  InsertNewsletterSubscriber,
} from "../drizzle/schema";

// ---------------------------------------------------------------------------
// Blog Post Functions
// ---------------------------------------------------------------------------

/**
 * Get all blog posts, optionally filtered by publish status.
 * Ordered by createdAt DESC.
 */
export async function getBlogPosts(filter: "all" | "drafts" | "published"): Promise<BlogPost[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const query = db.select().from(blogPosts);

  if (filter === "published") {
    return query.where(eq(blogPosts.isPublished, true)).orderBy(desc(blogPosts.createdAt));
  }

  if (filter === "drafts") {
    return query.where(eq(blogPosts.isPublished, false)).orderBy(desc(blogPosts.createdAt));
  }

  return query.orderBy(desc(blogPosts.createdAt));
}

/**
 * Get published blog posts for public listing, paginated.
 * Only returns a subset of columns for list views.
 */
export async function getPublishedBlogPosts(
  page: number,
  limit: number
): Promise<{
  posts: Pick<BlogPost, "id" | "title" | "slug" | "excerpt" | "thumbnailUrl" | "publishedAt">[];
  total: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const offset = (page - 1) * limit;

  const [posts, [countRow]] = await Promise.all([
    db
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
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(blogPosts)
      .where(eq(blogPosts.isPublished, true)),
  ]);

  return { posts, total: countRow?.count ?? 0 };
}

/**
 * Get a single published blog post by slug.
 * Returns null if not found or not published.
 */
export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [post] = await db
    .select()
    .from(blogPosts)
    .where(and(eq(blogPosts.slug, slug), eq(blogPosts.isPublished, true)))
    .limit(1);

  return post ?? null;
}

/**
 * Get a single blog post by id (admin use — no publish check).
 * Returns null if not found.
 */
export async function getBlogPostById(id: number): Promise<BlogPost | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);

  return post ?? null;
}

/**
 * Insert a new blog post.
 * Uses onConflictDoNothing to handle youtube_video_id uniqueness gracefully.
 * Returns the inserted row or null if skipped due to conflict.
 */
export async function insertBlogPost(post: InsertBlogPost): Promise<BlogPost | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [inserted] = await db.insert(blogPosts).values(post).onConflictDoNothing().returning();

  return inserted ?? null;
}

/**
 * Update editable fields on a blog post.
 * Returns the updated row.
 */
export async function updateBlogPost(
  id: number,
  data: Partial<Pick<BlogPost, "title" | "slug" | "excerpt" | "content">>
): Promise<BlogPost> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [updated] = await db.update(blogPosts).set(data).where(eq(blogPosts.id, id)).returning();

  return updated;
}

/**
 * Publish a blog post — sets isPublished=true and publishedAt to now.
 * Returns the updated row.
 */
export async function publishBlogPost(id: number): Promise<BlogPost> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [updated] = await db
    .update(blogPosts)
    .set({ isPublished: true, publishedAt: new Date() })
    .where(eq(blogPosts.id, id))
    .returning();

  return updated;
}

/**
 * Unpublish a blog post — sets isPublished=false and clears publishedAt.
 * Returns the updated row.
 */
export async function unpublishBlogPost(id: number): Promise<BlogPost> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [updated] = await db
    .update(blogPosts)
    .set({ isPublished: false, publishedAt: null })
    .where(eq(blogPosts.id, id))
    .returning();

  return updated;
}

/**
 * Hard-delete a blog post by id.
 */
export async function deleteBlogPost(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(blogPosts).where(eq(blogPosts.id, id));
}

/**
 * Mark a blog post as having had its newsletter sent.
 */
export async function markNewsletterSent(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(blogPosts).set({ isNewsletterSent: true }).where(eq(blogPosts.id, id));
}

// ---------------------------------------------------------------------------
// Newsletter Functions
// ---------------------------------------------------------------------------

/**
 * Subscribe an email address.
 * - If the email already exists and is inactive, reactivates it.
 * - If the email does not exist, inserts a new subscriber.
 * Email is always stored lowercased.
 */
export async function subscribeToNewsletter(email: string, source: string): Promise<NewsletterSubscriber> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalised = email.toLowerCase();

  const [existing] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.email, normalised))
    .limit(1);

  if (existing) {
    if (!existing.isActive) {
      // Reactivate
      const [updated] = await db
        .update(newsletterSubscribers)
        .set({ isActive: true, unsubscribedAt: null })
        .where(eq(newsletterSubscribers.id, existing.id))
        .returning();
      return updated;
    }
    // Already active — return as-is
    return existing;
  }

  const [inserted] = await db
    .insert(newsletterSubscribers)
    .values({ email: normalised, source, isActive: true })
    .returning();

  return inserted;
}

/**
 * Unsubscribe an email address — sets isActive=false and records the timestamp.
 */
export async function unsubscribeFromNewsletter(email: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(newsletterSubscribers)
    .set({ isActive: false, unsubscribedAt: new Date() })
    .where(eq(newsletterSubscribers.email, email.toLowerCase()));
}

/**
 * Returns true if the given email is an active subscriber.
 */
export async function getNewsletterStatus(email: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .select({ isActive: newsletterSubscribers.isActive })
    .from(newsletterSubscribers)
    .where(
      and(
        eq(newsletterSubscribers.email, email.toLowerCase()),
        eq(newsletterSubscribers.isActive, true)
      )
    )
    .limit(1);

  return !!row;
}

/**
 * Returns the email address for every active subscriber.
 */
export async function getActiveSubscribers(): Promise<{ email: string }[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select({ email: newsletterSubscribers.email })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.isActive, true));
}

/**
 * Returns the count of active and total subscribers.
 */
export async function getSubscriberCount(): Promise<{ active: number; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [activeRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.isActive, true));

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(newsletterSubscribers);

  return {
    active: activeRow?.count ?? 0,
    total: totalRow?.count ?? 0,
  };
}

/**
 * Returns a paginated list of all subscribers with a total count.
 */
export async function getSubscribers(
  page: number,
  limit: number
): Promise<{ subscribers: NewsletterSubscriber[]; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const offset = (page - 1) * limit;

  const [subscribers, [countRow]] = await Promise.all([
    db.select().from(newsletterSubscribers).orderBy(desc(newsletterSubscribers.subscribedAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(newsletterSubscribers),
  ]);

  return { subscribers, total: countRow?.count ?? 0 };
}
