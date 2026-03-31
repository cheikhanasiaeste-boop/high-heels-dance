/**
 * Video processing utilities using ffprobe (duration) and ffmpeg (thumbnails).
 *
 * These operate on temporary files written to /tmp and clean up after themselves.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

function getFfprobePath(): string {
  try {
    // ffprobe-static exports the path directly
    return require("ffprobe-static").path;
  } catch {
    throw new Error("ffprobe-static not installed — run: pnpm add ffprobe-static");
  }
}

function getFfmpegPath(): string {
  try {
    return require("@ffmpeg-installer/ffmpeg").path;
  } catch {
    throw new Error("@ffmpeg-installer/ffmpeg not installed — run: pnpm add @ffmpeg-installer/ffmpeg");
  }
}

/**
 * Extract video duration in seconds using ffprobe.
 * Accepts raw video bytes — writes to a temp file, probes, cleans up.
 */
export async function getVideoDuration(videoBuffer: Buffer): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), "vid-"));
  const tmpPath = join(dir, "input.mp4");

  try {
    await writeFile(tmpPath, videoBuffer);

    const { stdout } = await execFileAsync(getFfprobePath(), [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      tmpPath,
    ], { timeout: 30_000 });

    const seconds = parseFloat(stdout.trim());
    if (isNaN(seconds) || seconds <= 0) {
      throw new Error(`ffprobe returned invalid duration: "${stdout.trim()}"`);
    }
    return Math.round(seconds);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/**
 * Generate a JPEG thumbnail from a video buffer.
 *
 * @param videoBuffer  Raw video bytes
 * @param atPercent    Where to grab the frame (0–100). Default 10%.
 *                     Falls back to first frame if seeking fails.
 * @returns            { buffer: Buffer, contentType: 'image/jpeg' }
 */
export async function generateThumbnail(
  videoBuffer: Buffer,
  atPercent = 10
): Promise<{ buffer: Buffer; contentType: string }> {
  const dir = await mkdtemp(join(tmpdir(), "thumb-"));
  const inputPath = join(dir, "input.mp4");
  const outputPath = join(dir, "thumbnail.jpg");

  try {
    await writeFile(inputPath, videoBuffer);

    // First, get duration so we can seek to the right spot
    let seekSeconds = 0;
    try {
      const duration = await getVideoDurationFromFile(inputPath);
      seekSeconds = Math.max(0, Math.floor(duration * (atPercent / 100)));
    } catch {
      // If we can't determine duration, use first frame (seekSeconds stays 0)
    }

    await execFileAsync(getFfmpegPath(), [
      "-y",
      "-ss", String(seekSeconds),
      "-i", inputPath,
      "-vframes", "1",
      "-q:v", "2",        // High quality JPEG
      "-vf", "scale=640:-2", // 640px wide, maintain aspect ratio
      outputPath,
    ], { timeout: 30_000 });

    const buffer = await readFile(outputPath);
    return { buffer, contentType: "image/jpeg" };
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Internal helper: get duration from an on-disk file path (avoids double-write).
 */
async function getVideoDurationFromFile(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(getFfprobePath(), [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ], { timeout: 30_000 });

  const seconds = parseFloat(stdout.trim());
  if (isNaN(seconds) || seconds <= 0) {
    throw new Error(`ffprobe returned invalid duration: "${stdout.trim()}"`);
  }
  return seconds;
}
