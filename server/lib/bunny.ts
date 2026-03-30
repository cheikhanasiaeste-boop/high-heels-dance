/**
 * Bunny.net Stream API integration.
 *
 * Handles video upload, status polling, thumbnail retrieval,
 * and signed playback URL generation.
 *
 * Docs: https://docs.bunny.net/reference/api-overview
 */

const BUNNY_API_BASE = "https://video.bunnycdn.com";

function getConfig() {
  const apiKey = process.env.BUNNY_STREAM_API_KEY ?? "";
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID ?? "";
  const cdnHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME ?? "";
  const tokenAuthKey = process.env.BUNNY_STREAM_TOKEN_AUTH_KEY ?? "";

  if (!apiKey || !libraryId) {
    throw new Error(
      "Bunny.net Stream not configured: set BUNNY_STREAM_API_KEY and BUNNY_STREAM_LIBRARY_ID"
    );
  }

  return { apiKey, libraryId, cdnHostname, tokenAuthKey };
}

function headers() {
  return { AccessKey: getConfig().apiKey, accept: "application/json" };
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type BunnyVideoStatus =
  | 0 // Queued
  | 1 // Processing
  | 2 // Encoding
  | 3 // Finished (ready)
  | 4 // Resolution finished
  | 5 // Failed
  | 6; // Presigned upload started

export interface BunnyVideo {
  guid: string;
  title: string;
  status: BunnyVideoStatus;
  length: number; // duration in seconds
  thumbnailFileName: string;
  width: number;
  height: number;
  storageSize: number;
  encodeProgress: number; // 0-100
  dateUploaded: string;
}

// ─── API Methods ────────────────────────────────────────────────────────────

/**
 * Step 1: Create a video object in the Bunny library.
 * This reserves a GUID and returns upload credentials.
 */
export async function createVideo(title: string): Promise<BunnyVideo> {
  const { libraryId } = getConfig();
  const res = await fetch(
    `${BUNNY_API_BASE}/library/${libraryId}/videos`,
    {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ title }),
    }
  );

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Bunny createVideo failed (${res.status}): ${msg}`);
  }

  return res.json();
}

/**
 * Step 2: Upload the actual video file to the created video object.
 * Accepts a Buffer (the raw video bytes).
 */
export async function uploadVideoFile(
  videoGuid: string,
  data: Buffer
): Promise<void> {
  const { libraryId } = getConfig();
  const res = await fetch(
    `${BUNNY_API_BASE}/library/${libraryId}/videos/${videoGuid}`,
    {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/octet-stream" },
      body: new Uint8Array(data),
    }
  );

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Bunny uploadVideoFile failed (${res.status}): ${msg}`);
  }
}

/**
 * Get video metadata (status, duration, thumbnail, etc.)
 */
export async function getVideo(videoGuid: string): Promise<BunnyVideo> {
  const { libraryId } = getConfig();
  const res = await fetch(
    `${BUNNY_API_BASE}/library/${libraryId}/videos/${videoGuid}`,
    { headers: headers() }
  );

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Bunny getVideo failed (${res.status}): ${msg}`);
  }

  return res.json();
}

/**
 * Delete a video from the Bunny library.
 */
export async function deleteVideo(videoGuid: string): Promise<void> {
  const { libraryId } = getConfig();
  const res = await fetch(
    `${BUNNY_API_BASE}/library/${libraryId}/videos/${videoGuid}`,
    { method: "DELETE", headers: headers() }
  );

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Bunny deleteVideo failed (${res.status}): ${msg}`);
  }
}

/**
 * Get the Bunny CDN thumbnail URL for a video.
 * Bunny auto-generates thumbnails at thumbnail.jpg
 */
export function getThumbnailUrl(videoGuid: string): string {
  const { cdnHostname, libraryId } = getConfig();
  const host = cdnHostname || `${libraryId}.b-cdn.net`;
  return `https://${host}/${videoGuid}/thumbnail.jpg`;
}

/**
 * Generate a time-limited signed playback URL for HLS streaming.
 *
 * Uses Bunny's token authentication:
 * https://docs.bunny.net/docs/stream-security
 *
 * The token is an SHA256 HMAC of the path + expiry + security key.
 */
export async function getSignedPlaybackUrl(
  videoGuid: string,
  expiresInSeconds = 14400 // 4 hours default
): Promise<string> {
  const { cdnHostname, libraryId, tokenAuthKey } = getConfig();
  const host = cdnHostname || `${libraryId}.b-cdn.net`;

  // If no token auth key is set, return unsigned URL (for development)
  if (!tokenAuthKey) {
    return `https://${host}/${videoGuid}/playlist.m3u8`;
  }

  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const path = `/${videoGuid}/playlist.m3u8`;

  // Bunny token auth: SHA256(tokenAuthKey + path + expiresAt)
  const { createHash } = await import("node:crypto");
  const hashableBase = tokenAuthKey + path + expiresAt;
  const token = createHash("sha256")
    .update(hashableBase)
    .digest("hex");

  return `https://${host}${path}?token=${token}&expires=${expiresAt}`;
}

/**
 * Map Bunny status codes to human-readable strings.
 */
export function statusLabel(status: BunnyVideoStatus): string {
  switch (status) {
    case 0: return "queued";
    case 1: return "processing";
    case 2: return "encoding";
    case 3: return "ready";
    case 4: return "ready";
    case 5: return "failed";
    case 6: return "uploading";
    default: return "unknown";
  }
}
