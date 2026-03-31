import { ENV } from "./env";
import crypto from "crypto";
import { KJUR } from "jsrsasign";

/**
 * Zoom API Integration
 * 
 * This module handles:
 * 1. Creating Zoom meetings via API
 * 2. Generating SDK signatures for Web Meeting SDK
 * 3. Access control and security
 */

// Zoom OAuth token cache
let cachedToken: { access_token: string; expires_at: number } | null = null;

/**
 * Get Zoom OAuth access token (Server-to-Server OAuth)
 */
async function getZoomAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && cachedToken.expires_at > Date.now()) {
    return cachedToken.access_token;
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Zoom credentials not configured");
  }

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Zoom access token: ${error}`);
  }

  const data = await response.json();
  
  // Cache token (expires in 1 hour, we cache for 55 minutes to be safe)
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + 55 * 60 * 1000,
  };

  return data.access_token;
}

/**
 * Create a Zoom meeting via API
 * 
 * @param title - Meeting title
 * @param startTime - Meeting start time (ISO 8601 format)
 * @param duration - Meeting duration in minutes
 * @returns Meeting ID (NOT the join URL - we never expose that)
 */
export async function createZoomMeeting(
  title: string,
  startTime: string,
  duration: number
): Promise<{ meetingId: string; meetingNumber: number; password: string }> {
  const accessToken = await getZoomAccessToken();

  const response = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic: title,
      type: 2, // Scheduled meeting
      start_time: startTime,
      duration: duration,
      timezone: "UTC",
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false, // CRITICAL: Users cannot join before host
        waiting_room: true, // CRITICAL: Waiting room enabled for security
        mute_upon_entry: true,
        auto_recording: "cloud",
        meeting_authentication: false, // We handle auth on our side
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create Zoom meeting: ${error}`);
  }

  const data = await response.json();

  return {
    meetingId: data.id.toString(),
    meetingNumber: data.id,
    password: data.password || data.encrypted_password || "",
  };
}

/**
 * Generate Zoom Web SDK signature
 * 
 * This signature is required for the Zoom Web Meeting SDK to join a meeting.
 * It must be generated server-side and expire quickly (60-120 seconds).
 * 
 * @param meetingNumber - Numeric meeting ID
 * @param role - User role (0 = participant, 1 = host)
 * @returns SDK signature (short-lived, expires in 60 seconds)
 */
export function generateZoomSDKSignature(
  meetingNumber: number,
  role: 0 | 1 = 0
): string {
  const sdkKey = process.env.ZOOM_CLIENT_ID;
  const sdkSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!sdkKey || !sdkSecret) {
    throw new Error("Zoom SDK credentials not configured");
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60; // Expire in 60 seconds (CRITICAL for security)

  const payload = {
    sdkKey: sdkKey,
    mn: meetingNumber,
    role: role,
    iat: iat,
    exp: exp,
    tokenExp: exp,
  };

  const header = { alg: "HS256", typ: "JWT" };

  const signature = KJUR.jws.JWS.sign(
    "HS256",
    JSON.stringify(header),
    JSON.stringify(payload),
    sdkSecret
  );

  return signature;
}

/**
 * Verify if user can join meeting based on time window
 * 
 * Users can only join 5 minutes before the session starts
 *
 * @param startTime - Session start time
 * @returns true if user can join, false otherwise
 */
export function canJoinMeeting(startTime: Date): boolean {
  const now = new Date();
  const joinWindowStart = new Date(startTime.getTime() - 5 * 60 * 1000); // 5 min before
  
  return now >= joinWindowStart;
}
