# Zoom Live Session Booking & Streaming System — v2

## Context

Elizabeth Zolotova needs live dance sessions via Zoom, embedded in her platform. The project has `@zoom/meetingsdk@5.1.0`, server-side OAuth + signature generation in `server/_core/zoom.ts`, and an embedded `ZoomMeeting.tsx` component. This spec upgrades the existing infrastructure with a dedicated `live_sessions` table, auto-creation, access control, auto-embed timing, chat, and cloud recording.

## Current Codebase Assessment

**Reuse:**
- `server/_core/zoom.ts` — OAuth token caching, `createZoomMeeting()`, `generateZoomSDKSignature()`, `canJoinMeeting()`
- `client/src/components/ZoomMeeting.tsx` — embedded Zoom SDK component (needs modifications)
- `@zoom/meetingsdk@5.1.0` — already installed

**Delete:**
- `server/zoom.ts` — dead duplicate with 2-hour signature expiry (security risk vs 60s in `_core/zoom.ts`)

**Modify:**
- `server/_core/zoom.ts` — add `auto_recording: "cloud"` to meeting creation settings
- `client/src/components/ZoomMeeting.tsx` — auto-join on mount, ensure chat panel visible
- `client/src/pages/SessionView.tsx` — rewrite: 1-second countdown, auto-embed at 5 min, remove meetLink fallback

**Create new:**
- `drizzle/schema.ts` — new `live_sessions` table
- `server/routers.ts` — new `liveSessions` tRPC router (admin CRUD, public get, join)
- `client/src/pages/LiveSession.tsx` — new dedicated session page
- `client/src/pages/admin/LiveSessions.tsx` — admin management page with create/edit form
- Route: `/live-session/:id`

## Database: `live_sessions` Table

```
id              SERIAL PRIMARY KEY
title           VARCHAR(200) NOT NULL
description     TEXT
startTime       TIMESTAMP NOT NULL
endTime         TIMESTAMP NOT NULL
isFree          BOOLEAN DEFAULT true
price           VARCHAR(20)
capacity        INTEGER DEFAULT 100
zoomMeetingId   VARCHAR(50)
zoomMeetingNumber BIGINT
status          TEXT DEFAULT 'scheduled'  -- scheduled | live | ended | cancelled
recordingUrl    TEXT                       -- populated after session ends
createdAt       TIMESTAMP DEFAULT NOW()
```

No RLS needed — access control handled in tRPC procedures.

## Access Rules

| Session Type | Description Visible To | Zoom Embed Accessible To |
|---|---|---|
| Free | Everyone (including non-logged-in) | Everyone (including non-logged-in) |
| Paid | Everyone (including non-logged-in) | Signed-in users who purchased OR have premium membership |

Server-side enforcement in the `join` procedure. Frontend shows/hides based on same rules.

## Time-Based UI (Session Page `/live-session/:id`)

| Time Relative to Start | What User Sees |
|---|---|
| > 5 minutes before | Session info + beautiful countdown (every second) + "Session starts soon" |
| 5 min before → session end | Zoom auto-embeds with chat visible. No join button. |
| After endTime | "Session has ended" + link to recording (if available) |

Countdown uses `setInterval(1000)` with `requestAnimationFrame` for smooth display.

## Admin Functionality

### Admin → Sessions page (new `LiveSessions` admin tab)

**Create/Edit form:**
- Title, description, start datetime, end datetime
- "Free session" toggle (default: true)
- Price field (shown when not free)
- Capacity
- **"Create Zoom Meeting" button** — primary flow:
  - Calls `createZoomMeeting()` server-side
  - Stores returned `meetingId` and `meetingNumber` in `live_sessions`
  - Shows success toast with meeting ID
- Manual Zoom Meeting ID field — fallback for pre-existing meetings

**Session list:**
- Shows all sessions with status badges (scheduled/live/ended)
- "Recording" link appears for ended sessions (links to Zoom cloud recordings dashboard)

### Recording Access

- `auto_recording: "cloud"` set on meeting creation
- Admin panel shows link: `https://zoom.us/recording` for the Zoom account
- Future enhancement: use Zoom API to fetch recording URL and store in `recordingUrl` column

## Chat

Native Zoom embedded SDK chat — no custom implementation. The SDK's chat panel is visible by default in the embedded meeting. Users type messages, host (Elizabeth) sees and responds in real-time.

To ensure chat is visible: initialize the Zoom SDK with chat features enabled (default behavior of `ZoomMtgEmbedded`).

## Security

1. **Delete `server/zoom.ts`** — duplicate code with 2hr token expiry
2. **Remove `meetLink` fallback** in SessionView.tsx — leaks direct Zoom URL
3. **Backend signature-only** — 60-second expiry, no join URLs exposed
4. **Paid session check** — server verifies purchase/membership before issuing signature

## Files Summary

| Action | File | What |
|---|---|---|
| DELETE | `server/zoom.ts` | Dead duplicate, security risk |
| MODIFY | `server/_core/zoom.ts` | Add `auto_recording: "cloud"` |
| MODIFY | `drizzle/schema.ts` | Add `live_sessions` table |
| CREATE | `server/liveSessionRouter.ts` | tRPC CRUD + join + recording endpoints |
| CREATE | `client/src/pages/LiveSession.tsx` | Public session page with countdown + auto-embed |
| CREATE | `client/src/pages/admin/LiveSessions.tsx` | Admin create/edit/list sessions |
| MODIFY | `client/src/components/ZoomMeeting.tsx` | Auto-join on mount, chat visible |
| MODIFY | `client/src/pages/SessionView.tsx` | Fix countdown, remove URL leak |
| MODIFY | `client/src/App.tsx` | Add `/live-session/:id` route |
| MODIFY | `client/src/components/AdminLayout.tsx` | Add "Live Sessions" nav item |

## Testing Checklist

### Admin Flow
1. Admin creates free session with "Create Zoom Meeting" → meeting ID auto-populated
2. Admin creates paid session with price → saved correctly
3. Admin edits session title/time → changes reflected
4. Admin sees session list with status badges
5. Ended session shows recording link

### Free Session Flow
6. Non-logged-in user visits `/live-session/:id` → sees description + countdown
7. At 5-min mark → Zoom embed appears automatically
8. User can use in-meeting chat
9. After session ends → "Session ended" message

### Paid Session Flow
10. Non-logged-in user → sees description, no Zoom embed, "Sign in to access" prompt
11. Signed-in user without purchase → sees description, "Purchase required" message
12. Signed-in user with purchase → gets Zoom embed at 5-min mark
13. Premium member → gets Zoom embed regardless of purchase

### Timing & Edge Cases
14. Countdown updates every second accurately
15. Page opened exactly at 5-min mark → embed loads immediately
16. Late joiner (session already started) → embed loads immediately
17. Session cancelled → shows "Session cancelled" state
18. Invalid session ID → 404 page

### Mobile
19. Session page responsive on iPhone
20. Zoom embed works on mobile browsers
21. Chat accessible on mobile

## Zoom Credential Setup (User Action Required)

1. Go to https://marketplace.zoom.us/ → Develop → Build App
2. Choose **Server-to-Server OAuth**
3. App name: "High Heels Dance Platform"
4. Copy: Account ID, Client ID, Client Secret
5. Scopes: `meeting:write:admin`, `meeting:read:admin`
6. Activate the app
7. Set on Render: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`
