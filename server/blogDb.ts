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
// Helpers — map Supabase REST snake_case rows to camelCase TypeScript types
// ---------------------------------------------------------------------------

function mapBlogPost(row: any): BlogPost {
  return {
    id: row.id,
    youtubeVideoId: row.youtube_video_id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: row.content,
    thumbnailUrl: row.thumbnail_url,
    youtubeUrl: row.youtube_url,
    publishedAt: row.published_at ? new Date(row.published_at) : null,
    isPublished: row.is_published,
    isNewsletterSent: row.is_newsletter_sent,
    createdAt: new Date(row.created_at),
  };
}

function mapSubscriber(row: any): NewsletterSubscriber {
  return {
    id: row.id,
    email: row.email,
    source: row.source,
    isActive: row.is_active,
    subscribedAt: new Date(row.subscribed_at),
    unsubscribedAt: row.unsubscribed_at ? new Date(row.unsubscribed_at) : null,
  };
}

// ---------------------------------------------------------------------------
// Blog Post Functions
// ---------------------------------------------------------------------------

/**
 * Get all blog posts, optionally filtered by publish status.
 * Ordered by createdAt DESC.
 */
export async function getBlogPosts(filter: "all" | "drafts" | "published"): Promise<BlogPost[]> {
  const db = await getDb();
  if (db) {
    try {
      const query = db.select().from(blogPosts);

      if (filter === "published") {
        return query.where(eq(blogPosts.isPublished, true)).orderBy(desc(blogPosts.createdAt));
      }

      if (filter === "drafts") {
        return query.where(eq(blogPosts.isPublished, false)).orderBy(desc(blogPosts.createdAt));
      }

      return query.orderBy(desc(blogPosts.createdAt));
    } catch (e) {
      console.warn("[Database] getBlogPosts direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  let query = supabaseAdmin.from("blog_posts").select("*");

  if (filter === "published") {
    query = query.eq("is_published", true);
  } else if (filter === "drafts") {
    query = query.eq("is_published", false);
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapBlogPost);
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
  if (db) {
    try {
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
    } catch (e) {
      console.warn("[Database] getPublishedBlogPosts direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const offset = (page - 1) * limit;

  const [postsRes, countRes] = await Promise.all([
    supabaseAdmin
      .from("blog_posts")
      .select("id, title, slug, excerpt, thumbnail_url, published_at")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabaseAdmin
      .from("blog_posts")
      .select("*", { count: "exact", head: true })
      .eq("is_published", true),
  ]);

  if (postsRes.error) throw postsRes.error;

  const posts = (postsRes.data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    thumbnailUrl: row.thumbnail_url,
    publishedAt: row.published_at ? new Date(row.published_at) : null,
  }));

  return { posts, total: countRes.count ?? 0 };
}

/**
 * Get a single published blog post by slug.
 * Returns null if not found or not published.
 */
export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  const db = await getDb();
  if (db) {
    try {
      const [post] = await db
        .select()
        .from(blogPosts)
        .where(and(eq(blogPosts.slug, slug), eq(blogPosts.isPublished, true)))
        .limit(1);

      return post ?? null;
    } catch (e) {
      console.warn("[Database] getBlogPostBySlug direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .limit(1)
    .single();

  if (error || !data) return null;
  return mapBlogPost(data);
}

/**
 * Get a single blog post by id (admin use — no publish check).
 * Returns null if not found.
 */
export async function getBlogPostById(id: number): Promise<BlogPost | null> {
  const db = await getDb();
  if (db) {
    try {
      const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
      return post ?? null;
    } catch (e) {
      console.warn("[Database] getBlogPostById direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .select("*")
    .eq("id", id)
    .limit(1)
    .single();

  if (error || !data) return null;
  return mapBlogPost(data);
}

/**
 * Insert a new blog post.
 * Uses onConflictDoNothing to handle youtube_video_id uniqueness gracefully.
 * Returns the inserted row or null if skipped due to conflict.
 */
export async function insertBlogPost(post: InsertBlogPost): Promise<BlogPost | null> {
  const db = await getDb();
  if (db) {
    try {
      const [inserted] = await db.insert(blogPosts).values(post).onConflictDoNothing().returning();
      return inserted ?? null;
    } catch (e) {
      console.warn("[Database] insertBlogPost direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .upsert(
      {
        youtube_video_id: post.youtubeVideoId,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: post.content,
        thumbnail_url: post.thumbnailUrl,
        youtube_url: post.youtubeUrl,
        published_at: post.publishedAt ? new Date(post.publishedAt).toISOString() : null,
        is_published: post.isPublished ?? false,
        is_newsletter_sent: post.isNewsletterSent ?? false,
      },
      { onConflict: "youtube_video_id", ignoreDuplicates: true }
    )
    .select("*")
    .single();

  if (error || !data) return null;
  return mapBlogPost(data);
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
  if (db) {
    try {
      const [updated] = await db.update(blogPosts).set(data).where(eq(blogPosts.id, id)).returning();
      return updated;
    } catch (e) {
      console.warn("[Database] updateBlogPost direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data: updated, error } = await supabaseAdmin
    .from("blog_posts")
    .update(data)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapBlogPost(updated);
}

/**
 * Publish a blog post — sets isPublished=true and publishedAt to now.
 * Returns the updated row.
 */
export async function publishBlogPost(id: number): Promise<BlogPost> {
  const db = await getDb();
  if (db) {
    try {
      const [updated] = await db
        .update(blogPosts)
        .set({ isPublished: true, publishedAt: new Date() })
        .where(eq(blogPosts.id, id))
        .returning();
      return updated;
    } catch (e) {
      console.warn("[Database] publishBlogPost direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .update({ is_published: true, published_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapBlogPost(data);
}

/**
 * Unpublish a blog post — sets isPublished=false and clears publishedAt.
 * Returns the updated row.
 */
export async function unpublishBlogPost(id: number): Promise<BlogPost> {
  const db = await getDb();
  if (db) {
    try {
      const [updated] = await db
        .update(blogPosts)
        .set({ isPublished: false, publishedAt: null })
        .where(eq(blogPosts.id, id))
        .returning();
      return updated;
    } catch (e) {
      console.warn("[Database] unpublishBlogPost direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .update({ is_published: false, published_at: null })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapBlogPost(data);
}

/**
 * Hard-delete a blog post by id.
 */
export async function deleteBlogPost(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.delete(blogPosts).where(eq(blogPosts.id, id));
      return;
    } catch (e) {
      console.warn("[Database] deleteBlogPost direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { error } = await supabaseAdmin
    .from("blog_posts")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

/**
 * Mark a blog post as having had its newsletter sent.
 */
export async function markNewsletterSent(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.update(blogPosts).set({ isNewsletterSent: true }).where(eq(blogPosts.id, id));
      return;
    } catch (e) {
      console.warn("[Database] markNewsletterSent direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { error } = await supabaseAdmin
    .from("blog_posts")
    .update({ is_newsletter_sent: true })
    .eq("id", id);

  if (error) throw error;
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
  if (db) {
    try {
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
    } catch (e) {
      console.warn("[Database] subscribeToNewsletter direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const normalised = email.toLowerCase();

  // Check if subscriber already exists
  const { data: existing } = await supabaseAdmin
    .from("newsletter_subscribers")
    .select("*")
    .eq("email", normalised)
    .limit(1)
    .single();

  if (existing) {
    if (!existing.is_active) {
      // Reactivate
      const { data: updated, error } = await supabaseAdmin
        .from("newsletter_subscribers")
        .update({ is_active: true, unsubscribed_at: null })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) throw error;
      return mapSubscriber(updated);
    }
    // Already active
    return mapSubscriber(existing);
  }

  // Insert new subscriber
  const { data: inserted, error } = await supabaseAdmin
    .from("newsletter_subscribers")
    .insert({ email: normalised, source, is_active: true })
    .select("*")
    .single();

  if (error) throw error;
  return mapSubscriber(inserted);
}

/**
 * Unsubscribe an email address — sets isActive=false and records the timestamp.
 */
export async function unsubscribeFromNewsletter(email: string): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db
        .update(newsletterSubscribers)
        .set({ isActive: false, unsubscribedAt: new Date() })
        .where(eq(newsletterSubscribers.email, email.toLowerCase()));
      return;
    } catch (e) {
      console.warn("[Database] unsubscribeFromNewsletter direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { error } = await supabaseAdmin
    .from("newsletter_subscribers")
    .update({ is_active: false, unsubscribed_at: new Date().toISOString() })
    .eq("email", email.toLowerCase());

  if (error) throw error;
}

/**
 * Returns true if the given email is an active subscriber.
 */
export async function getNewsletterStatus(email: string): Promise<boolean> {
  const db = await getDb();
  if (db) {
    try {
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
    } catch (e) {
      console.warn("[Database] getNewsletterStatus direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("newsletter_subscribers")
    .select("is_active")
    .eq("email", email.toLowerCase())
    .eq("is_active", true)
    .limit(1)
    .single();

  if (error || !data) return false;
  return true;
}

/**
 * Returns the email address for every active subscriber.
 */
export async function getActiveSubscribers(): Promise<{ email: string }[]> {
  const db = await getDb();
  if (db) {
    try {
      return db
        .select({ email: newsletterSubscribers.email })
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.isActive, true));
    } catch (e) {
      console.warn("[Database] getActiveSubscribers direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("newsletter_subscribers")
    .select("email")
    .eq("is_active", true);

  if (error) throw error;
  return (data ?? []).map((row: any) => ({ email: row.email }));
}

/**
 * Returns the count of active and total subscribers.
 */
export async function getSubscriberCount(): Promise<{ active: number; total: number }> {
  const db = await getDb();
  if (db) {
    try {
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
    } catch (e) {
      console.warn("[Database] getSubscriberCount direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");

  const [activeRes, totalRes] = await Promise.all([
    supabaseAdmin
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabaseAdmin
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true }),
  ]);

  return {
    active: activeRes.count ?? 0,
    total: totalRes.count ?? 0,
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
  if (db) {
    try {
      const offset = (page - 1) * limit;

      const [subscribers, [countRow]] = await Promise.all([
        db.select().from(newsletterSubscribers).orderBy(desc(newsletterSubscribers.subscribedAt)).limit(limit).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(newsletterSubscribers),
      ]);

      return { subscribers, total: countRow?.count ?? 0 };
    } catch (e) {
      console.warn("[Database] getSubscribers direct query failed, trying REST API fallback:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const offset = (page - 1) * limit;

  const [subsRes, countRes] = await Promise.all([
    supabaseAdmin
      .from("newsletter_subscribers")
      .select("*")
      .order("subscribed_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabaseAdmin
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true }),
  ]);

  if (subsRes.error) throw subsRes.error;

  return {
    subscribers: (subsRes.data ?? []).map(mapSubscriber),
    total: countRes.count ?? 0,
  };
}
