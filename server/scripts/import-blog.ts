import "dotenv/config";
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { blogPosts } from "../../drizzle/schema";
import { getDb } from "../db";

// ── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_HANDLE = "highheelstutorials";
const MAX_VIDEOS = 15;
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const CLAUDE_MAX_TOKENS = 4096;
const BETWEEN_CALLS_MS = 1500;

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── YouTube helpers ───────────────────────────────────────────────────────────

interface VideoItem {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
}

async function resolveChannelId(apiKey: string): Promise<string> {
  const url =
    `https://www.googleapis.com/youtube/v3/channels` +
    `?forHandle=${CHANNEL_HANDLE}&part=contentDetails&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube channels.list failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const channel = data.items?.[0];
  if (!channel) {
    throw new Error(`Channel @${CHANNEL_HANDLE} not found`);
  }
  const uploadsPlaylistId: string = channel.contentDetails.relatedPlaylists.uploads;
  return uploadsPlaylistId;
}

async function fetchVideos(apiKey: string, uploadsPlaylistId: string): Promise<VideoItem[]> {
  const videos: VideoItem[] = [];
  let pageToken: string | undefined;

  while (videos.length < MAX_VIDEOS) {
    const remaining = MAX_VIDEOS - videos.length;
    const maxResults = Math.min(remaining, 50);

    let url =
      `https://www.googleapis.com/youtube/v3/playlistItems` +
      `?playlistId=${uploadsPlaylistId}&part=snippet&maxResults=${maxResults}&key=${apiKey}`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`YouTube playlistItems.list failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();

    for (const item of data.items ?? []) {
      const snippet = item.snippet;
      const videoId: string = snippet.resourceId.videoId;
      // Pick the highest-resolution thumbnail available
      const thumbs = snippet.thumbnails;
      const thumbnailUrl: string =
        thumbs?.maxres?.url ??
        thumbs?.high?.url ??
        thumbs?.medium?.url ??
        thumbs?.default?.url ??
        `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      videos.push({
        videoId,
        title: snippet.title as string,
        description: (snippet.description as string) ?? "",
        publishedAt: snippet.publishedAt as string,
        thumbnailUrl,
      });

      if (videos.length >= MAX_VIDEOS) break;
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return videos;
}

// ── Claude helper ─────────────────────────────────────────────────────────────

async function generateBlogPost(
  anthropic: Anthropic,
  systemPrompt: string,
  video: VideoItem
): Promise<{ excerpt: string; content: string }> {
  const screenshotUrls = [
    `https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${video.videoId}/0.jpg`,
    `https://img.youtube.com/vi/${video.videoId}/1.jpg`,
    `https://img.youtube.com/vi/${video.videoId}/2.jpg`,
    `https://img.youtube.com/vi/${video.videoId}/3.jpg`,
  ];

  const userMessage = `Video Title: ${video.title}

Video Description:
${video.description}

Available screenshot URLs for embedding in the blog post:
${screenshotUrls.map((u, i) => `${i + 1}. ${u}`).join("\n")}

Please write the full blog post. On the very first line output:
EXCERPT: <a 1–2 sentence summary for the post excerpt>

Then output the full blog post in Markdown on the following lines.`;

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText =
    response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("") ?? "";

  // Parse EXCERPT from first line
  const lines = rawText.split("\n");
  let excerpt = "";
  let contentStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("EXCERPT:")) {
      excerpt = line.replace(/^EXCERPT:\s*/i, "").trim();
      contentStartIndex = i + 1;
      break;
    }
  }

  // Skip any blank lines after the EXCERPT line
  while (contentStartIndex < lines.length && lines[contentStartIndex].trim() === "") {
    contentStartIndex++;
  }

  const content = lines.slice(contentStartIndex).join("\n").trim();

  if (!excerpt) {
    // Fallback: use first 200 chars of content
    excerpt = content.replace(/[#*_]/g, "").slice(0, 200).trim();
  }

  return { excerpt, content };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Check env vars
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!YOUTUBE_API_KEY) {
    console.error("ERROR: YOUTUBE_API_KEY is not set in environment.");
    process.exit(1);
  }
  if (!ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set in environment.");
    process.exit(1);
  }

  // 2. Read BLOG.md system prompt
  const blogMdPath = path.resolve(process.cwd(), "BLOG.md");
  if (!fs.existsSync(blogMdPath)) {
    console.error(`ERROR: BLOG.md not found at ${blogMdPath}`);
    process.exit(1);
  }
  const systemPrompt = fs.readFileSync(blogMdPath, "utf-8");
  console.log("Loaded BLOG.md system prompt.");

  // 3. Init clients
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const db = await getDb();

  // 4. Fetch YouTube videos
  console.log(`Resolving uploads playlist for @${CHANNEL_HANDLE}...`);
  const uploadsPlaylistId = await resolveChannelId(YOUTUBE_API_KEY);
  console.log(`Uploads playlist ID: ${uploadsPlaylistId}`);

  console.log(`Fetching up to ${MAX_VIDEOS} videos...`);
  const videos = await fetchVideos(YOUTUBE_API_KEY, uploadsPlaylistId);
  console.log(`Fetched ${videos.length} video(s).`);

  // 5. Process each video
  let importedCount = 0;
  let skippedCount = 0;

  for (const video of videos) {
    console.log(`\nProcessing: "${video.title}" (${video.videoId})`);

    // Check if already in DB
    const existing = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(eq(blogPosts.youtubeVideoId, video.videoId))
      .limit(1);

    if (existing.length > 0) {
      console.log(`  → Skipped (already exists in DB)`);
      skippedCount++;
      continue;
    }

    // Generate blog post via Claude
    console.log(`  → Calling Claude...`);
    let excerpt: string;
    let content: string;
    try {
      ({ excerpt, content } = await generateBlogPost(anthropic, systemPrompt, video));
    } catch (err) {
      console.error(`  → Claude API error for "${video.title}":`, err);
      skippedCount++;
      continue;
    }

    // Generate slug (ensure uniqueness by appending videoId if needed)
    const baseSlug = generateSlug(video.title);
    const slug = baseSlug || video.videoId;

    // Check slug collision and append videoId suffix if necessary
    const slugCollision = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(eq(blogPosts.slug, slug))
      .limit(1);

    const finalSlug = slugCollision.length > 0 ? `${slug}-${video.videoId}` : slug;

    // Insert as draft
    await db.insert(blogPosts).values({
      youtubeVideoId: video.videoId,
      title: video.title,
      slug: finalSlug,
      excerpt,
      content,
      thumbnailUrl: video.thumbnailUrl,
      youtubeUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
      isPublished: false,
      isNewsletterSent: false,
    });

    console.log(`  → Imported as draft (slug: "${finalSlug}")`);
    importedCount++;

    // Wait before next Claude call (if more videos remain)
    if (importedCount + skippedCount < videos.length) {
      await sleep(BETWEEN_CALLS_MS);
    }
  }

  // 6. Summary
  console.log(`\n──────────────────────────────`);
  console.log(`Import complete.`);
  console.log(`  Imported : ${importedCount}`);
  console.log(`  Skipped  : ${skippedCount}`);
  console.log(`──────────────────────────────`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
