/**
 * Zoom Meeting SDK Integration
 * 
 * This module provides functions for:
 * - Generating SDK signatures for embedded Zoom sessions
 * - Creating Zoom meetings via API
 * - Managing Zoom meeting credentials
 */

import crypto from 'crypto';

/**
 * Generate Zoom SDK JWT signature for client-side SDK initialization
 * 
 * @param meetingNumber - The Zoom meeting number
 * @param role - User role: '0' for participant, '1' for host
 * @returns JWT signature string
 */
export function generateZoomSignature(
  meetingNumber: string,
  role: '0' | '1'
): string {
  const sdkKey = process.env.ZOOM_CLIENT_ID!;
  const sdkSecret = process.env.ZOOM_CLIENT_SECRET!;

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60 * 60 * 2; // 2 hours expiration

  const oHeader = { alg: 'HS256', typ: 'JWT' };
  const oPayload = {
    sdkKey,
    mn: meetingNumber,
    role,
    iat,
    exp,
    appKey: sdkKey,
    tokenExp: exp,
  };

  const sHeader = JSON.stringify(oHeader);
  const sPayload = JSON.stringify(oPayload);

  const sdkJWT =
    base64url(sHeader) + '.' +
    base64url(sPayload) + '.' +
    base64url(
      crypto
        .createHmac('sha256', sdkSecret)
        .update(base64url(sHeader) + '.' + base64url(sPayload))
        .digest()
    );

  return sdkJWT;
}

/**
 * Base64URL encoding helper
 */
function base64url(input: string | Buffer): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Get Zoom OAuth access token for API calls
 * Required for creating/managing meetings via Zoom API
 */
async function getZoomAccessToken(): Promise<string> {
  const clientId = process.env.ZOOM_CLIENT_ID!;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET!;
  const accountId = process.env.ZOOM_ACCOUNT_ID!;

  const tokenResponse = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'account_credentials',
      account_id: accountId,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.json();
    throw new Error(`Failed to get Zoom access token: ${JSON.stringify(error)}`);
  }

  const { access_token } = await tokenResponse.json();
  return access_token;
}

/**
 * Create a Zoom meeting via API
 * 
 * @param params - Meeting parameters
 * @returns Meeting details including ID, password, and join URLs
 */
export async function createZoomMeeting(params: {
  topic: string;
  start_time: string; // ISO 8601 format
  duration: number; // in minutes
  settings?: {
    join_before_host?: boolean;
    waiting_room?: boolean;
    mute_upon_entry?: boolean;
    approval_type?: number; // 0 = automatically approve, 1 = manually approve, 2 = no registration required
  };
}): Promise<{
  id: number;
  password: string;
  join_url: string;
  start_url: string;
}> {
  const accessToken = await getZoomAccessToken();

  const meetingResponse = await fetch(
    'https://api.zoom.us/v2/users/me/meetings',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: params.topic,
        type: 2, // Scheduled meeting
        start_time: params.start_time,
        duration: params.duration,
        timezone: 'UTC',
        settings: {
          join_before_host: params.settings?.join_before_host ?? false,
          waiting_room: params.settings?.waiting_room ?? true,
          mute_upon_entry: params.settings?.mute_upon_entry ?? true,
          approval_type: params.settings?.approval_type ?? 2,
          ...params.settings,
        },
      }),
    }
  );

  if (!meetingResponse.ok) {
    const error = await meetingResponse.json();
    throw new Error(`Failed to create Zoom meeting: ${JSON.stringify(error)}`);
  }

  const meeting = await meetingResponse.json();
  
  return {
    id: meeting.id,
    password: meeting.password,
    join_url: meeting.join_url,
    start_url: meeting.start_url,
  };
}

/**
 * Delete a Zoom meeting
 * 
 * @param meetingId - The Zoom meeting ID to delete
 */
export async function deleteZoomMeeting(meetingId: string): Promise<void> {
  const accessToken = await getZoomAccessToken();

  const response = await fetch(
    `https://api.zoom.us/v2/meetings/${meetingId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    const error = await response.json();
    throw new Error(`Failed to delete Zoom meeting: ${JSON.stringify(error)}`);
  }
}

/**
 * Update a Zoom meeting
 * 
 * @param meetingId - The Zoom meeting ID to update
 * @param params - Meeting parameters to update
 */
export async function updateZoomMeeting(
  meetingId: string,
  params: {
    topic?: string;
    start_time?: string;
    duration?: number;
    settings?: {
      join_before_host?: boolean;
      waiting_room?: boolean;
      mute_upon_entry?: boolean;
    };
  }
): Promise<void> {
  const accessToken = await getZoomAccessToken();

  const response = await fetch(
    `https://api.zoom.us/v2/meetings/${meetingId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to update Zoom meeting: ${JSON.stringify(error)}`);
  }
}
