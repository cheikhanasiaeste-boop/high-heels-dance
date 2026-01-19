# Zoom Online Session Integration Architecture

**Date:** January 19, 2026  
**Author:** Senior Product Manager & Video Platform Integration Architect  
**Project:** High Heels Dance Platform

---

## Executive Summary

This document outlines the comprehensive architecture for integrating Zoom Web SDK into the High Heels Dance platform, enabling users to join and attend online dance sessions directly within the website without leaving the platform. The solution prioritizes security, seamless UX, and enrollment-based access control.

---

## 1. Integration Approach: Zoom Meeting SDK for Web

### Recommended Solution: **Zoom Meeting SDK for Web (Component View)**

**Why Zoom Meeting SDK?**

- **Fully Embedded Experience**: Renders the complete Zoom meeting interface (video, audio, chat, participants) directly within a `<div>` on your website
- **No Redirects**: Users never leave your domain—maintains brand consistency and trust
- **Rich Features**: Supports video/audio, screen sharing, chat, reactions, breakout rooms (if needed)
- **Official SDK**: Maintained by Zoom with regular updates and security patches
- **Browser Support**: Works on Chrome, Firefox, Safari, Edge (with graceful fallback for unsupported browsers)
- **Mobile Support**: Works on mobile browsers with fallback to Zoom app when necessary

**Alternative Considered: Zoom Web SDK (Video SDK)**
- More lightweight but requires custom UI development
- Better for custom-branded video experiences
- **Decision**: Meeting SDK is better for our use case as it provides complete meeting functionality out-of-the-box

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     User Journey Flow                        │
└─────────────────────────────────────────────────────────────┘

1. User browses available sessions → Sees "Book" button
2. User books session → Payment processed (if paid)
3. User receives confirmation → Booking stored in database
4. Session appears in "My Sessions" dashboard
5. Before session start → "Join Session" button disabled (Upcoming state)
6. 15 minutes before start → Button becomes active (Live state)
7. User clicks "Join Session" → Access control verification
8. If authorized → Embedded Zoom interface loads in modal/dedicated page
9. User attends session → Full Zoom functionality available
10. Session ends → Interface closes, "Ended" state displayed


┌─────────────────────────────────────────────────────────────┐
│                   Technical Architecture                     │
└─────────────────────────────────────────────────────────────┘

Frontend (React)                Backend (tRPC)              Zoom API
─────────────────              ──────────────────          ──────────
                                                           
SessionView Component    →     zoom.getSignature    →     Generate
  - Zoom SDK init                - Verify enrollment        SDK JWT
  - Access control UI            - Check time window        
  - Embedded interface           - Return signature
                                                           
BookingCard Component    →     zoom.createMeeting   →     Create
  - Join button                  - Store meeting data       Meeting
  - State indicators             - Return meeting info
  - Time validation
                                                           
MyBookings Page          →     bookings.list        →     Database
  - List user sessions           - Filter by user           Query
  - Show session states          - Include Zoom data
```

---

## 3. Database Schema Updates

### Update `availability_slots` table

Add Zoom meeting fields to store meeting credentials:

```typescript
// drizzle/schema.ts

export const availabilitySlots = sqliteTable('availability_slots', {
  // ... existing fields ...
  
  // Zoom Integration Fields
  zoomMeetingId: text('zoom_meeting_id'),           // Zoom meeting ID (e.g., "123456789")
  zoomMeetingPassword: text('zoom_meeting_password'), // Meeting password
  zoomJoinUrl: text('zoom_join_url'),               // Fallback join URL
  zoomStartUrl: text('zoom_start_url'),             // Host start URL (for admin)
  zoomCreatedAt: integer('zoom_created_at', { mode: 'timestamp' }), // When meeting was created
});
```

**Why store this data?**
- **Performance**: Avoid creating Zoom meetings on-the-fly during join (slow, error-prone)
- **Reliability**: Meeting credentials persist even if Zoom API is temporarily unavailable
- **Admin Control**: Admin can create/update meetings in advance
- **Consistency**: Same meeting ID for all enrolled users

---

## 4. Backend API Implementation

### 4.1 Zoom API Integration Setup

**Required Zoom Credentials** (to be requested via `webdev_request_secrets`):

```env
ZOOM_ACCOUNT_ID=your_account_id
ZOOM_CLIENT_ID=your_client_id
ZOOM_CLIENT_SECRET=your_client_secret
```

**How to obtain:**
1. Go to [Zoom App Marketplace](https://marketplace.zoom.us/)
2. Create a "Meeting SDK" app
3. Get Account ID, Client ID, Client Secret from app credentials page

### 4.2 Backend Procedures

```typescript
// server/routers.ts

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import crypto from 'crypto';

// ============================================
// Zoom SDK Signature Generation
// ============================================

/**
 * Generate Zoom SDK JWT signature for client-side SDK initialization
 * This is required for secure authentication with Zoom Meeting SDK
 */
export const zoomRouter = router({
  
  // Get SDK signature for joining a meeting
  getSignature: protectedProcedure
    .input(z.object({
      meetingNumber: z.string(),
      role: z.enum(['0', '1']), // 0 = participant, 1 = host
    }))
    .mutation(async ({ input, ctx }) => {
      const { meetingNumber, role } = input;
      
      // Verify user has access to this meeting
      const booking = await db.query.bookings.findFirst({
        where: (bookings, { and, eq }) => and(
          eq(bookings.userId, ctx.user.id),
          eq(bookings.meetingNumber, meetingNumber),
          eq(bookings.status, 'confirmed')
        ),
      });
      
      if (!booking) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this session',
        });
      }
      
      // Check time window (allow joining 15 minutes before start)
      const session = await db.query.availabilitySlots.findFirst({
        where: (slots, { eq }) => eq(slots.zoomMeetingId, meetingNumber),
      });
      
      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }
      
      const now = Date.now();
      const sessionStart = new Date(session.startTime).getTime();
      const sessionEnd = new Date(session.endTime).getTime();
      const fifteenMinutesBefore = sessionStart - 15 * 60 * 1000;
      
      if (now < fifteenMinutesBefore) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Session is not yet available. You can join 15 minutes before start time.',
        });
      }
      
      if (now > sessionEnd) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This session has ended',
        });
      }
      
      // Generate SDK JWT signature
      const signature = generateZoomSignature(
        process.env.ZOOM_CLIENT_ID!,
        process.env.ZOOM_CLIENT_SECRET!,
        meetingNumber,
        role
      );
      
      return {
        signature,
        sdkKey: process.env.ZOOM_CLIENT_ID!,
        meetingNumber,
        password: session.zoomMeetingPassword || '',
        userName: ctx.user.name || ctx.user.email,
        userEmail: ctx.user.email,
      };
    }),
  
  // Create Zoom meeting for a session (admin only)
  createMeeting: adminProcedure
    .input(z.object({
      slotId: z.string(),
      topic: z.string(),
      startTime: z.string(), // ISO 8601 format
      duration: z.number(), // in minutes
    }))
    .mutation(async ({ input }) => {
      const { slotId, topic, startTime, duration } = input;
      
      // Call Zoom API to create meeting
      const meeting = await createZoomMeeting({
        topic,
        start_time: startTime,
        duration,
        settings: {
          join_before_host: false, // Require host to start
          waiting_room: true,      // Enable waiting room for security
          mute_upon_entry: true,   // Mute participants on join
        },
      });
      
      // Update availability slot with Zoom meeting data
      await db.update(availabilitySlots)
        .set({
          zoomMeetingId: meeting.id.toString(),
          zoomMeetingPassword: meeting.password,
          zoomJoinUrl: meeting.join_url,
          zoomStartUrl: meeting.start_url,
          zoomCreatedAt: new Date(),
        })
        .where(eq(availabilitySlots.id, slotId));
      
      return {
        success: true,
        meetingId: meeting.id,
        joinUrl: meeting.join_url,
      };
    }),
});

// ============================================
// Zoom Signature Generation Helper
// ============================================

function generateZoomSignature(
  sdkKey: string,
  sdkSecret: string,
  meetingNumber: string,
  role: string
): string {
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

function base64url(input: string | Buffer): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ============================================
// Zoom API Meeting Creation Helper
// ============================================

async function createZoomMeeting(params: {
  topic: string;
  start_time: string;
  duration: number;
  settings: {
    join_before_host: boolean;
    waiting_room: boolean;
    mute_upon_entry: boolean;
  };
}) {
  // Get Zoom OAuth token
  const tokenResponse = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(
        `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
      ).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'account_credentials',
      account_id: process.env.ZOOM_ACCOUNT_ID!,
    }),
  });
  
  const { access_token } = await tokenResponse.json();
  
  // Create meeting
  const meetingResponse = await fetch(
    'https://api.zoom.us/v2/users/me/meetings',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: params.topic,
        type: 2, // Scheduled meeting
        start_time: params.start_time,
        duration: params.duration,
        timezone: 'UTC',
        settings: params.settings,
      }),
    }
  );
  
  return await meetingResponse.json();
}
```

---

## 5. Frontend Implementation

### 5.1 Install Zoom Meeting SDK

```bash
pnpm add @zoom/meetingsdk
```

### 5.2 SessionView Component (Embedded Interface)

```typescript
// client/src/pages/SessionView.tsx

import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import ZoomMtgEmbedded from '@zoom/meetingsdk/embedded';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, AlertCircle, Video, Clock, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function SessionView() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [, navigate] = useLocation();
  
  const [sessionState, setSessionState] = useState<'loading' | 'upcoming' | 'ready' | 'live' | 'ended' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [timeUntilStart, setTimeUntilStart] = useState('');
  
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<any>(null);
  
  // Fetch booking and session details
  const { data: booking, isLoading } = trpc.bookings.getById.useQuery(
    { id: bookingId! },
    { enabled: !!bookingId }
  );
  
  const joinMutation = trpc.zoom.getSignature.useMutation();
  
  // Check session state and time window
  useEffect(() => {
    if (!booking || !booking.session) return;
    
    const checkSessionState = () => {
      const now = Date.now();
      const sessionStart = new Date(booking.session.startTime).getTime();
      const sessionEnd = new Date(booking.session.endTime).getTime();
      const fifteenMinutesBefore = sessionStart - 15 * 60 * 1000;
      
      if (now > sessionEnd) {
        setSessionState('ended');
      } else if (now >= fifteenMinutesBefore && now <= sessionEnd) {
        setSessionState('ready');
      } else {
        setSessionState('upcoming');
        
        // Calculate time until session
        const minutesUntil = Math.floor((sessionStart - now) / 1000 / 60);
        const hoursUntil = Math.floor(minutesUntil / 60);
        
        if (hoursUntil > 0) {
          setTimeUntilStart(`${hoursUntil}h ${minutesUntil % 60}m`);
        } else {
          setTimeUntilStart(`${minutesUntil}m`);
        }
      }
    };
    
    checkSessionState();
    const interval = setInterval(checkSessionState, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, [booking]);
  
  // Initialize and join Zoom meeting
  const handleJoinSession = async () => {
    if (!booking?.session?.zoomMeetingId) {
      setErrorMessage('Meeting information is not available');
      setSessionState('error');
      return;
    }
    
    try {
      setSessionState('loading');
      
      // Get signature from backend
      const signatureData = await joinMutation.mutateAsync({
        meetingNumber: booking.session.zoomMeetingId,
        role: '0', // Participant
      });
      
      // Initialize Zoom SDK
      const client = ZoomMtgEmbedded.createClient();
      clientRef.current = client;
      
      // Initialize the embedded view
      await client.init({
        zoomAppRoot: zoomContainerRef.current!,
        language: 'en-US',
        patchJsMedia: true,
        leaveOnPageUnload: true,
      });
      
      // Join the meeting
      await client.join({
        signature: signatureData.signature,
        sdkKey: signatureData.sdkKey,
        meetingNumber: signatureData.meetingNumber,
        password: signatureData.password,
        userName: signatureData.userName,
        userEmail: signatureData.userEmail,
        tk: '', // Registration token (not needed for our use case)
      });
      
      setSessionState('live');
      
    } catch (error: any) {
      console.error('Failed to join session:', error);
      setErrorMessage(error.message || 'Failed to join session. Please try again.');
      setSessionState('error');
    }
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.leaveMeeting();
      }
    };
  }, []);
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 max-w-md">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-center mb-2">Session Not Found</h2>
          <p className="text-muted-foreground text-center mb-4">
            This session does not exist or you don't have access to it.
          </p>
          <Button onClick={() => navigate('/')} className="w-full">
            Back to Home
          </Button>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Session Header */}
      <div className="border-b bg-card">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{booking.session.title || 'Online Session'}</h1>
              <p className="text-muted-foreground">
                {new Date(booking.session.startTime).toLocaleString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate('/my-sessions')}>
              Back to My Sessions
            </Button>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="container py-8">
        {/* Upcoming State */}
        {sessionState === 'upcoming' && (
          <Card className="p-8 max-w-2xl mx-auto text-center">
            <Clock className="h-16 w-16 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Session Starts Soon</h2>
            <p className="text-muted-foreground mb-4">
              You can join this session {timeUntilStart} before it starts.
            </p>
            <p className="text-lg font-medium text-primary">
              Time until session: {timeUntilStart}
            </p>
          </Card>
        )}
        
        {/* Ready to Join State */}
        {sessionState === 'ready' && (
          <Card className="p-8 max-w-2xl mx-auto text-center">
            <Video className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Ready to Join</h2>
            <p className="text-muted-foreground mb-6">
              Your session is ready. Click the button below to join.
            </p>
            <Button 
              size="lg" 
              onClick={handleJoinSession}
              disabled={joinMutation.isPending}
              className="px-8"
            >
              {joinMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Video className="h-5 w-5 mr-2" />
                  Join Session
                </>
              )}
            </Button>
          </Card>
        )}
        
        {/* Live Session State */}
        {sessionState === 'live' && (
          <div className="max-w-7xl mx-auto">
            <Alert className="mb-4 bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                You're now in the live session. Enjoy your dance class!
              </AlertDescription>
            </Alert>
            
            {/* Zoom Embedded Container */}
            <div 
              ref={zoomContainerRef}
              className="w-full bg-black rounded-lg overflow-hidden shadow-2xl"
              style={{ height: 'calc(100vh - 250px)', minHeight: '600px' }}
            />
          </div>
        )}
        
        {/* Ended State */}
        {sessionState === 'ended' && (
          <Card className="p-8 max-w-2xl mx-auto text-center">
            <CheckCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Session Ended</h2>
            <p className="text-muted-foreground mb-6">
              This session has ended. Thank you for attending!
            </p>
            <Button onClick={() => navigate('/my-sessions')}>
              Back to My Sessions
            </Button>
          </Card>
        )}
        
        {/* Error State */}
        {sessionState === 'error' && (
          <Card className="p-8 max-w-2xl mx-auto text-center">
            <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Unable to Join Session</h2>
            <p className="text-muted-foreground mb-4">{errorMessage}</p>
            <div className="flex gap-4 justify-center">
              <Button variant="outline" onClick={() => navigate('/my-sessions')}>
                Back to My Sessions
              </Button>
              <Button onClick={handleJoinSession}>
                Try Again
              </Button>
            </div>
            
            {/* Fallback: Open in Zoom App */}
            {booking.session.zoomJoinUrl && (
              <div className="mt-6 pt-6 border-t">
                <p className="text-sm text-muted-foreground mb-3">
                  Having trouble? Open the session in the Zoom app:
                </p>
                <Button 
                  variant="secondary"
                  onClick={() => window.open(booking.session.zoomJoinUrl, '_blank')}
                >
                  Open in Zoom App
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
```

### 5.3 Update MyBookings Page (Add Join Button)

```typescript
// client/src/pages/MyBookings.tsx (excerpt)

{bookings.map((booking) => {
  const now = Date.now();
  const sessionStart = new Date(booking.session.startTime).getTime();
  const sessionEnd = new Date(booking.session.endTime).getTime();
  const fifteenMinutesBefore = sessionStart - 15 * 60 * 1000;
  
  const canJoin = now >= fifteenMinutesBefore && now <= sessionEnd;
  const hasEnded = now > sessionEnd;
  const isUpcoming = now < fifteenMinutesBefore;
  
  return (
    <Card key={booking.id}>
      {/* ... session details ... */}
      
      {/* Session State Badge */}
      {hasEnded && (
        <Badge variant="secondary">Ended</Badge>
      )}
      {isUpcoming && (
        <Badge variant="outline">Upcoming</Badge>
      )}
      {canJoin && (
        <Badge className="bg-green-600">Live Now</Badge>
      )}
      
      {/* Join Button */}
      {booking.session.eventType === 'online' && (
        <Link href={`/session/${booking.id}`}>
          <Button 
            disabled={!canJoin}
            className={canJoin ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            {hasEnded ? 'Session Ended' : canJoin ? 'Join Session' : 'Not Yet Available'}
          </Button>
        </Link>
      )}
    </Card>
  );
})}
```

---

## 6. Security & Access Control

### 6.1 Multi-Layer Security

**Layer 1: Backend Verification**
- Verify user enrollment before generating signature
- Check booking status (must be 'confirmed')
- Validate time window (15 minutes before to end time)

**Layer 2: Zoom SDK Authentication**
- SDK signature expires after 2 hours
- Signature tied to specific meeting number and user role
- Cannot be reused for different meetings

**Layer 3: Zoom Meeting Settings**
- Waiting room enabled (host can admit participants)
- Join before host disabled (prevents unauthorized early access)
- Meeting password required

**Layer 4: Frontend Protection**
- Join button only appears for enrolled users
- Meeting credentials never exposed in frontend code
- All sensitive data fetched via authenticated tRPC calls

### 6.2 Preventing Link Leakage

- **Never expose** `zoomJoinUrl` in public API responses
- Store meeting credentials server-side only
- Generate SDK signatures on-demand (not pre-generated)
- Use short-lived tokens (2-hour expiration)

---

## 7. UX Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    User Journey States                       │
└─────────────────────────────────────────────────────────────┘

State 1: UPCOMING
┌──────────────────────────────┐
│  📅 Session Starts Soon       │
│                              │
│  You can join 15 minutes     │
│  before the session starts   │
│                              │
│  Time until session: 2h 30m  │
│                              │
│  [Join Session] (disabled)   │
└──────────────────────────────┘

State 2: READY TO JOIN (15 min before → end time)
┌──────────────────────────────┐
│  🎥 Ready to Join            │
│                              │
│  Your session is ready.      │
│  Click below to join.        │
│                              │
│  [Join Session] (enabled)    │
└──────────────────────────────┘

State 3: JOINING (loading)
┌──────────────────────────────┐
│  ⏳ Connecting...            │
│                              │
│  Please wait while we        │
│  connect you to the session  │
└──────────────────────────────┘

State 4: LIVE SESSION
┌──────────────────────────────────────────────────┐
│  ✅ You're in the live session                   │
│                                                  │
│  ┌────────────────────────────────────────────┐ │
│  │                                            │ │
│  │        [Zoom Embedded Interface]          │ │
│  │                                            │ │
│  │  - Video grid                             │ │
│  │  - Audio controls                         │ │
│  │  - Chat panel                             │ │
│  │  - Participant list                       │ │
│  │  - Screen share                           │ │
│  │                                            │ │
│  └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘

State 5: ENDED
┌──────────────────────────────┐
│  ✓ Session Ended             │
│                              │
│  Thank you for attending!    │
│                              │
│  [Back to My Sessions]       │
└──────────────────────────────┘

State 6: ERROR (with fallback)
┌──────────────────────────────┐
│  ⚠️ Unable to Join Session   │
│                              │
│  [Try Again] [Go Back]       │
│                              │
│  ─────────────────────────   │
│  Having trouble?             │
│  [Open in Zoom App]          │
└──────────────────────────────┘
```

---

## 8. Admin Workflow: Creating Zoom Meetings

### Admin Panel Integration

Add "Create Zoom Meeting" functionality to the admin session management:

```typescript
// Admin creates availability slot
1. Admin fills out session form (title, date, time, duration, type=online)
2. Admin clicks "Create Session"
3. Backend automatically creates Zoom meeting via API
4. Meeting credentials stored in availability_slots table
5. Admin can see meeting ID and join URL in session details
6. Admin can use "Start URL" to host the session
```

### Automated Meeting Creation

```typescript
// server/routers.ts - Enhanced session creation

export const adminRouter = router({
  createSession: adminProcedure
    .input(sessionSchema)
    .mutation(async ({ input }) => {
      // Create availability slot
      const slot = await db.insert(availabilitySlots).values({
        ...input,
      }).returning();
      
      // If online session, create Zoom meeting automatically
      if (input.eventType === 'online') {
        const meeting = await createZoomMeeting({
          topic: input.title || 'Dance Session',
          start_time: input.startTime,
          duration: input.duration,
          settings: {
            join_before_host: false,
            waiting_room: true,
            mute_upon_entry: true,
          },
        });
        
        // Update slot with Zoom data
        await db.update(availabilitySlots)
          .set({
            zoomMeetingId: meeting.id.toString(),
            zoomMeetingPassword: meeting.password,
            zoomJoinUrl: meeting.join_url,
            zoomStartUrl: meeting.start_url,
            zoomCreatedAt: new Date(),
          })
          .where(eq(availabilitySlots.id, slot[0].id));
      }
      
      return slot[0];
    }),
});
```

---

## 9. Browser & Device Compatibility

### Supported Browsers (Embedded View)

✅ **Fully Supported:**
- Chrome 86+ (Desktop & Mobile)
- Firefox 78+ (Desktop)
- Safari 14+ (Desktop & Mobile)
- Edge 86+ (Desktop)

⚠️ **Fallback Required:**
- Older browser versions
- iOS Safari (may require Zoom app)
- Android Chrome (may require Zoom app)

### Fallback Strategy

```typescript
// Detect browser support
const isBrowserSupported = () => {
  const ua = navigator.userAgent;
  const isChrome = /Chrome/.test(ua) && /Google Inc/.test(navigator.vendor);
  const isFirefox = /Firefox/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
  const isEdge = /Edg/.test(ua);
  
  // Check version numbers (simplified)
  return isChrome || isFirefox || isSafari || isEdge;
};

// In SessionView component
useEffect(() => {
  if (!isBrowserSupported()) {
    // Show fallback UI
    setShowFallback(true);
  }
}, []);

// Fallback UI
{showFallback && (
  <Alert>
    <AlertDescription>
      Your browser may not support embedded sessions. 
      <Button onClick={() => window.open(booking.session.zoomJoinUrl, '_blank')}>
        Open in Zoom App
      </Button>
    </AlertDescription>
  </Alert>
)}
```

---

## 10. Performance Optimization

### Best Practices

1. **Lazy Load Zoom SDK**
   ```typescript
   const ZoomMtgEmbedded = lazy(() => import('@zoom/meetingsdk/embedded'));
   ```

2. **Preload Meeting Data**
   - Fetch booking and session details on page load
   - Cache signature generation result

3. **Optimize Video Quality**
   - Let Zoom SDK auto-adjust based on bandwidth
   - Provide quality toggle in UI if needed

4. **Monitor Connection Quality**
   ```typescript
   client.on('connection-change', (payload) => {
     console.log('Connection quality:', payload.state);
     // Show warning if connection is poor
   });
   ```

---

## 11. Testing Checklist

### Functional Testing

- [ ] User can see "Join Session" button only for enrolled sessions
- [ ] Button is disabled before 15-minute window
- [ ] Button becomes enabled at correct time
- [ ] Clicking button successfully loads Zoom interface
- [ ] Video and audio work correctly
- [ ] Chat and participant list are functional
- [ ] User can leave meeting and return to website
- [ ] Session state updates correctly (Upcoming → Ready → Live → Ended)

### Security Testing

- [ ] Non-enrolled user cannot access session page
- [ ] Signature generation fails for unauthorized users
- [ ] Expired signatures are rejected
- [ ] Meeting credentials are not exposed in network requests
- [ ] Direct URL access to session page is protected

### Browser Testing

- [ ] Test on Chrome (Desktop & Mobile)
- [ ] Test on Firefox (Desktop)
- [ ] Test on Safari (Desktop & Mobile)
- [ ] Test on Edge (Desktop)
- [ ] Verify fallback behavior on unsupported browsers

### Performance Testing

- [ ] Page loads in < 3 seconds
- [ ] Zoom SDK initializes in < 5 seconds
- [ ] Video quality is acceptable on standard broadband
- [ ] No memory leaks during long sessions

---

## 12. Implementation Timeline

### Phase 1: Setup & Backend (Day 1-2)
- Request Zoom credentials from user
- Update database schema
- Implement backend API (signature generation, meeting creation)
- Write unit tests for access control logic

### Phase 2: Frontend Development (Day 3-4)
- Install Zoom SDK
- Build SessionView component
- Implement state management and time window logic
- Add Join button to MyBookings page

### Phase 3: Admin Integration (Day 5)
- Add Zoom meeting creation to admin panel
- Implement automated meeting creation on session creation
- Add meeting management UI (view/edit meeting details)

### Phase 4: Testing & Polish (Day 6-7)
- Cross-browser testing
- Security testing
- UX refinements
- Error handling improvements
- Documentation

---

## 13. Cost Considerations

### Zoom Meeting SDK Pricing

- **Free Plan**: Up to 100 participants, 40-minute limit
- **Pro Plan**: $149.90/year, up to 100 participants, unlimited duration
- **Business Plan**: $199.90/year/license, up to 300 participants

**Recommendation**: Start with Pro Plan for professional dance sessions with no time limits.

---

## 14. Future Enhancements

### Phase 2 Features (Post-MVP)

1. **Session Recordings**
   - Automatically record sessions
   - Store recordings in S3
   - Allow enrolled users to replay sessions

2. **Breakout Rooms**
   - Enable breakout rooms for group practice
   - Admin can assign participants to rooms

3. **Analytics Dashboard**
   - Track attendance rates
   - Monitor session duration
   - Measure engagement metrics

4. **Automated Reminders**
   - Send email/SMS reminders 24h before session
   - Send "Join Now" notification 15 minutes before

5. **Virtual Backgrounds**
   - Provide branded virtual backgrounds
   - Allow users to upload custom backgrounds

---

## 15. Summary & Recommendations

### ✅ Recommended Approach

**Integration Method**: Zoom Meeting SDK for Web (Component View)

**Key Benefits**:
- Fully embedded, no redirects
- Professional, branded experience
- Complete Zoom functionality
- Official SDK with ongoing support

**Security**: Multi-layer access control with enrollment verification, time window checks, and SDK authentication

**UX**: Clear state indicators (Upcoming → Ready → Live → Ended) with intuitive join flow

**Fallback**: Graceful degradation to Zoom app for unsupported browsers

### 📋 Next Steps

1. **Request Zoom Credentials** via `webdev_request_secrets`
2. **Update Database Schema** with Zoom meeting fields
3. **Implement Backend API** for signature generation and meeting creation
4. **Build Frontend Components** (SessionView, updated MyBookings)
5. **Test Thoroughly** across browsers and devices
6. **Deploy & Monitor** with user feedback collection

---

**Document Version**: 1.0  
**Last Updated**: January 19, 2026  
**Status**: Ready for Implementation
