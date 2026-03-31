# Zoom Live Session Booking & Streaming System

## Context

Elizabeth Zolotova needs live dance sessions via Zoom, embedded in her platform. The project already has `@zoom/meetingsdk@5.1.0` installed, a working `ZoomMeeting.tsx` component, server-side OAuth + signature generation, and a `zoom.join` tRPC endpoint. This spec upgrades the existing infrastructure with access control, auto-embed timing, chat, recording, and admin management.

## Architecture

**Reuse existing:**
- `server/_core/zoom.ts` — OAuth tokens, meeting creation, SDK signature generation
- `server/zoomRouter.ts` — secured `zoom.join` endpoint
- `client/src/components/ZoomMeeting.tsx` — embedded Zoom SDK component
- `client/src/pages/SessionView.tsx` — countdown + state machine
- `drizzle/schema.ts` — `availabilitySlots.zoomMeetingId` column

**Delete:**
- `server/zoom.ts` — dead duplicate code with 2hr token expiry (security risk)

**Modify:**
- `server/_core/zoom.ts` — add `auto_recording: "cloud"` to meeting creation
- `server/zoomRouter.ts` — change time window from 15 min to 5 min
- `client/src/pages/SessionView.tsx` — second-by-second countdown, auto-embed at 5 min, remove meetLink fallback
- `client/src/components/ZoomMeeting.tsx` — auto-join on mount (no button), connection monitoring
- Admin Sessions page — add Zoom meeting ID field to create/edit form

## Access Rules

| Session Type | Who Can View Description | Who Can Join Zoom |
|---|---|---|
| Free | Everyone (signed in) | Everyone (signed in) |
| Paid | Everyone (signed in) | Users who purchased that session OR have active premium membership |

Access enforcement happens in `zoomRouter.ts` (server-side). Frontend shows/hides the Zoom embed based on the same rules but server is the authority.

## Time-Based UI (Session Page)

| Time Relative to Start | What User Sees |
|---|---|
| > 5 minutes before | Session description + live countdown (updates every second) |
| 5 min before → during session | Zoom meeting auto-embeds (no join button needed) |
| After session ends | "Session has ended" message |

The countdown switches to Zoom automatically — no user action required.

## Admin Functionality

In Admin → Sessions, when creating/editing an online session:
- Existing fields: title, description, start time, end time, event type, session type, capacity, price
- **New:** "Zoom Meeting ID" text field — admin pastes the numeric meeting ID
- **Alternative:** "Auto-create Zoom Meeting" button — calls `createZoomMeeting()` API and stores the returned meeting ID automatically
- All changes saved to `availabilitySlots.zoomMeetingId` in Supabase

## Chat

The Zoom embedded SDK includes native in-meeting chat. No custom implementation needed. Users can type messages during the meeting, and the host (Elizabeth) sees them in the Zoom interface. Chat is a built-in feature of `@zoom/meetingsdk`.

## Recording

- Meeting creation sets `auto_recording: "cloud"` — Zoom automatically records to cloud
- After the session, Elizabeth can download recordings from her Zoom account (zoom.us → Recordings)
- Admin panel includes a link to the Zoom recordings dashboard for convenience

## Security Fixes

1. **Delete `server/zoom.ts`** — duplicate code with 2-hour SDK signature expiry (vs 60 seconds in `_core/zoom.ts`)
2. **Remove `meetLink` fallback display** in `SessionView.tsx` — currently leaks the direct Zoom URL, defeating the embedded SDK security model
3. **Keep:** Backend-only signature generation, 60-second signature expiry, no join URL exposure

## Files to Modify

| File | Change |
|---|---|
| `server/zoom.ts` | DELETE |
| `server/_core/zoom.ts` | Add `auto_recording: "cloud"` to meeting settings |
| `server/zoomRouter.ts` | Change 15 min → 5 min window, add paid session access check |
| `client/src/pages/SessionView.tsx` | 1-second countdown, auto-embed at 5 min, remove URL fallback |
| `client/src/components/ZoomMeeting.tsx` | Auto-join on mount, add connection quality listener |
| `client/src/pages/admin/AdminSessions.tsx` | Add Zoom Meeting ID field to session form |

## Testing Checklist

1. Admin creates a free online session with Zoom meeting ID → appears in session list
2. Signed-in user opens session page > 5 min before → sees countdown updating every second
3. At exactly 5 min before start → Zoom embed appears automatically
4. Non-signed-in user → cannot access session page (redirect to sign-in)
5. Paid session: user without purchase → sees description but no Zoom embed
6. Paid session: user with purchase → gets Zoom embed at 5-min mark
7. Chat works in embedded meeting
8. Recording starts automatically when host joins
9. After session ends → "Session ended" message replaces Zoom
10. `server/zoom.ts` is deleted, no imports reference it

## Zoom Credential Setup

User needs to:
1. Go to https://marketplace.zoom.us/ → Develop → Build App
2. Choose Server-to-Server OAuth
3. App name: "High Heels Dance Platform"
4. Copy: Account ID, Client ID, Client Secret
5. Scopes: `meeting:write:admin`, `meeting:read:admin`
6. Activate the app
7. Set env vars on Render: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`
