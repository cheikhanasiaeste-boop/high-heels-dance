# Blog + Newsletter System Design

## Overview

Transform Elizabeth Zolotova's YouTube channel (@highheelstutorials) videos into SEO-friendly blog posts with an admin approval workflow and newsletter distribution via Resend.

## Database Schema

### `newsletter_subscribers`

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| email | varchar(255) | unique, not null |
| source | varchar(20) | not null, 'popup' or 'registration' |
| is_active | boolean | not null, default true |
| subscribed_at | timestamp | not null, default now() |
| unsubscribed_at | timestamp | nullable |

Index on `email`. Index on `is_active` for newsletter send queries.

### `blog_posts`

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| youtube_video_id | varchar(20) | unique, not null |
| title | varchar(255) | not null |
| slug | varchar(255) | unique, not null |
| excerpt | text | not null |
| content | text | not null (markdown) |
| thumbnail_url | text | not null |
| youtube_url | text | not null |
| published_at | timestamp | nullable, set on publish |
| is_published | boolean | not null, default false |
| is_newsletter_sent | boolean | not null, default false |
| created_at | timestamp | not null, default now() |

Index on `slug`. Index on `is_published` + `published_at` for listing queries.

## Newsletter Subscriber Flow

### Source 1: Popup Email Submission

When `popupInteractions` records an `email_submitted` action (existing code in `Home.tsx`), also call `newsletter.subscribe` mutation with source='popup'. This is an upsert — if the email already exists, do nothing.

### Source 2: Account Settings Page

New page at `/account` accessible from `UserProfileDropdown`. Contains:

- "Subscribe to our newsletter" checkbox (checked by default)
- Reads current status via `newsletter.status` query
- Toggle off: calls `newsletter.unsubscribe` (sets `is_active=false`, `unsubscribed_at=now()`)
- Toggle on: calls `newsletter.subscribe` (sets `is_active=true`, clears `unsubscribed_at`)

This is the primary opt-in mechanism for registered users. No checkbox on the signup form — users manage newsletter preference in Account Settings only.

Add "Account Settings" link in `UserProfileDropdown` menu between "Membership" and "Help & Support".

## Bulk Import Pipeline

### Script Location

`server/scripts/import-blog.ts` — run once manually with `npx tsx server/scripts/import-blog.ts`.

### Step 1: Fetch Videos from YouTube

Use YouTube Data API v3:
1. Resolve channel `@highheelstutorials` to a channel ID via `channels.list?forHandle=highheelstutorials`
2. Get the uploads playlist ID from `contentDetails.relatedPlaylists.uploads`
3. Paginate through `playlistItems.list` to get all video IDs, titles, descriptions, published dates, thumbnails

Environment variable: `YOUTUBE_API_KEY`

### Step 2: Generate Blog Content

For each video, call the Claude API (Anthropic SDK) with:
- System prompt: full contents of `BLOG.md` (the skill file defines tone, structure, SEO rules, and CTA requirements)
- User prompt: video title + description + instruction to generate a blog post

All generated posts must strictly follow the BLOG.md style and structure: benefit-driven title, hook intro, 5-8 actionable tips, practical tips & common mistakes section, encouraging conclusion with CTA.

Claude returns the full markdown blog post.

Environment variable: `ANTHROPIC_API_KEY`

### Step 3: Screenshots

For each video, use high-quality thumbnails from YouTube:
- `https://img.youtube.com/vi/{videoId}/maxresdefault.jpg` — main high-res thumbnail (used as post thumbnail)
- `https://img.youtube.com/vi/{videoId}/0.jpg` through `/3.jpg` — auto-generated frames at different timestamps

Replace `![Screenshot: ...](<screenshot-placeholder>)` markers in the generated content with these URLs. Each screenshot must clearly illustrate the specific movement or tip being described. The admin can replace these with manually curated screenshots during review.

### Step 4: Save as Drafts

For each video:
1. Generate slug from title (lowercase, hyphens, no special chars)
2. Insert into `blog_posts` with `is_published=false`
3. Skip videos that already exist (check `youtube_video_id` unique constraint)

### Import Limits

- First bulk import: **10-15 videos maximum** to keep it manageable
- Additional imports can be run later as needed
- YouTube API: 1 request per second
- Claude API: sequential calls with 1s delay between
- Estimated time for 15 videos: ~5 minutes

## tRPC Routes

### Public Routes

```
blog.list(page, limit) → { posts: BlogPost[], total: number }
  - Returns published posts ordered by published_at DESC
  - Fields: id, title, slug, excerpt, thumbnail_url, published_at

blog.getBySlug(slug) → BlogPost | null
  - Returns full post content for a published post
  - All fields including content and youtube_url
```

### User Routes (authenticated)

```
newsletter.subscribe(email?, source) → { ok: true }
  - Upsert: if email exists and is_active=false, reactivate
  - If no email param, use current user's email

newsletter.unsubscribe() → { ok: true }
  - Sets is_active=false, unsubscribed_at=now() for current user's email

newsletter.status() → { subscribed: boolean }
  - Checks if current user's email has is_active=true in newsletter_subscribers
```

### Admin Routes

```
admin.blog.list(filter?: 'all'|'drafts'|'published') → BlogPost[]
  - All posts with all fields

admin.blog.getById(id) → BlogPost
  - Single post for editing

admin.blog.update(id, { title?, excerpt?, content?, slug? }) → BlogPost
  - Update post fields

admin.blog.publish(id) → BlogPost
  - Sets is_published=true, published_at=now()

admin.blog.unpublish(id) → BlogPost
  - Sets is_published=false, published_at=null

admin.blog.delete(id) → { ok: true }
  - Hard delete

admin.blog.sendNewsletter(id) → { sentCount: number }
  - Fetches all active subscribers
  - Sends email via Resend with post title, excerpt, thumbnail, and link
  - Sets is_newsletter_sent=true
  - Returns count of emails sent

admin.newsletter.subscriberCount() → { active: number, total: number }
  - Dashboard stat

admin.newsletter.subscribers(page, limit) → { subscribers: Subscriber[], total: number }
  - Paginated list for admin view
```

## Admin Panel: "Manage Blog"

### Route

`/admin/blog` — new entry in admin navigation, uses `AdminGuard` + `AdminLayout`.

### List View

- Table with columns: Title, Status (Draft/Published), Date, Newsletter Sent, Actions
- Filter tabs: All / Drafts / Published
- Search by title
- Actions: Edit, Publish/Unpublish, Send Newsletter, Delete
- Subscriber count shown at top

### Edit View

- Inline on the same page or modal
- Editable fields: Title, Slug, Excerpt, Content (markdown textarea)
- Live markdown preview panel
- Save button

### Send Newsletter Flow

1. Admin clicks "Send as Newsletter" on a published post
2. Confirmation dialog: "Send this post to X active subscribers?"
3. On confirm: call `admin.blog.sendNewsletter`
4. Show success toast with sent count
5. Button changes to "Newsletter Sent" (disabled)

## Frontend Blog Pages

### `/blog` — Blog Listing

- Same purple gradient background as courses page
- Header: "Blog" title with decorative separators (matching courses section style)
- Grid: 1 col mobile, 2 cols tablet, 3 cols desktop
- Each card: thumbnail image, title, excerpt (2-line clamp), published date
- Cards use glassmorphic style (matching courses cards)
- Link to `/blog/{slug}`
- Pagination or "Load More" button

### `/blog/[slug]` — Single Post

- Purple gradient background
- Back to Blog link at top
- Hero: full-width thumbnail with title overlay
- Embedded YouTube video player (iframe, responsive)
- Rendered markdown content with:
  - Proper heading styles (H2, H3)
  - Screenshot images with captions
  - Internal links to /courses and /book-session
- CTA section at bottom:
  - "Explore Our Courses" button → /courses
  - "Book a Session with Elizabeth" button → /book-session
- Share button (copy link)

### SEO

- `<title>` and `<meta description>` set per post
- Open Graph tags for social sharing (og:title, og:description, og:image)
- Structured data (BlogPosting schema.org)

## Newsletter Email Template

HTML email sent via Resend:

- From: configured `EMAIL_FROM` address
- Subject: blog post title
- Body:
  - Thumbnail image
  - Post title (H1)
  - Excerpt paragraph
  - "Read Full Post" CTA button linking to `/blog/{slug}`
  - Footer with unsubscribe link
- Unsubscribe link: `{SITE_URL}/unsubscribe?email={email}&token={hash}`
  - Simple HMAC-based token for email verification
  - Landing page sets `is_active=false`

## File Structure (New Files)

```
drizzle/schema.ts                          — add newsletter_subscribers + blog_posts tables
server/routers.ts                          — add blog + newsletter routes
server/scripts/import-blog.ts              — one-time bulk import script
server/_core/email.ts                      — add newsletter email template
client/src/pages/Blog.tsx                  — /blog listing page
client/src/pages/BlogPost.tsx              — /blog/[slug] single post page
client/src/pages/AccountSettings.tsx       — /account settings page
client/src/pages/admin/Blog.tsx            — admin Manage Blog page
client/src/pages/Unsubscribe.tsx           — /unsubscribe landing page
client/src/App.tsx                         — add new routes
client/src/components/UserProfileDropdown.tsx — add Account Settings link
```

## Environment Variables Required

```
YOUTUBE_API_KEY=...          # YouTube Data API v3 key (for bulk import only)
ANTHROPIC_API_KEY=...        # Claude API key (for blog generation only)
RESEND_API_KEY=...           # Already configured
EMAIL_FROM=...               # Already configured
NEWSLETTER_SECRET=...        # HMAC secret for unsubscribe token generation
```

## Out of Scope

- Automated import of new videos (future phase)
- Blog comments
- Blog categories/tags
- RSS feed
- Blog search
