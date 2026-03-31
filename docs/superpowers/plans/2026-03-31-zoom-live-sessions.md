# Zoom Live Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete live session system where Elizabeth hosts Zoom dance classes embedded in the platform, with auto-creation, access control (free/paid), real-time countdown, auto-embed at 5 minutes before start, in-meeting chat, and cloud recording.

**Architecture:** New `liveSessions` table in Drizzle schema. New `liveSessionRouter` for tRPC backend (admin CRUD, public get, join). New frontend pages: `/live-session/:id` (public) and admin Live Sessions management. Reuses existing `@zoom/meetingsdk`, `server/_core/zoom.ts` (OAuth + signatures), and `ZoomMeeting.tsx` (embedded SDK component). Deletes dead `server/zoom.ts`.

**Tech Stack:** Drizzle ORM + Supabase PostgreSQL, tRPC, React, @zoom/meetingsdk@5.1.0, Tailwind CSS

---

### Task 1: Delete dead Zoom code & fix `_core/zoom.ts`

**Files:**
- Delete: `server/zoom.ts`
- Modify: `server/_core/zoom.ts`

- [ ] **Step 1: Delete `server/zoom.ts`**

This file is dead code with a dangerous 2-hour signature expiry (vs 60 seconds in `_core/zoom.ts`). Remove it entirely.

```bash
rm server/zoom.ts
```

Verify no imports reference it:
```bash
grep -r "from.*[\"']\.\.\/zoom[\"']" server/ --include="*.ts" | grep -v "_core/zoom" | grep -v "zoomRouter" | grep -v node_modules
grep -r "from.*[\"']\.\/zoom[\"']" server/ --include="*.ts" | grep -v "_core/zoom" | grep -v node_modules
```

Expected: No matches (the file was never imported by active code).

- [ ] **Step 2: Add `auto_recording: "cloud"` to meeting creation**

In `server/_core/zoom.ts`, change line 96 from:
```typescript
        auto_recording: "none",
```
to:
```typescript
        auto_recording: "cloud",
```

- [ ] **Step 3: Change join window from 15 min to 5 min**

In `server/_core/zoom.ts`, change the `canJoinMeeting` function (line 172):
```typescript
export function canJoinMeeting(startTime: Date): boolean {
  const now = new Date();
  const joinWindowStart = new Date(startTime.getTime() - 5 * 60 * 1000); // 5 min before
  return now >= joinWindowStart;
}
```

- [ ] **Step 4: Build and verify**

```bash
pnpm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete dead server/zoom.ts, add cloud recording, change join to 5min

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add `liveSessions` database table

**Files:**
- Modify: `drizzle/schema.ts`
- Modify: `server/db.ts` (add CRUD functions with REST fallback)

- [ ] **Step 1: Add schema definition**

In `drizzle/schema.ts`, add after the existing table definitions:

```typescript
/**
 * Live Sessions — Zoom-based live dance classes
 */
export const liveSessions = pgTable("live_sessions", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime").notNull(),
  isFree: boolean("isFree").default(true).notNull(),
  price: varchar("price", { length: 20 }),
  capacity: integer("capacity").default(100).notNull(),
  zoomMeetingId: varchar("zoomMeetingId", { length: 50 }),
  zoomMeetingNumber: varchar("zoomMeetingNumber", { length: 50 }),
  status: text("status").$type<"scheduled" | "live" | "ended" | "cancelled">().default("scheduled").notNull(),
  recordingUrl: text("recordingUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LiveSession = typeof liveSessions.$inferSelect;
export type InsertLiveSession = typeof liveSessions.$inferInsert;
```

- [ ] **Step 2: Push schema to database**

```bash
npx drizzle-kit push
```

Expected: Table `live_sessions` created in Supabase.

- [ ] **Step 3: Add DB functions in `server/db.ts`**

Add these functions to `server/db.ts` (with REST API fallback pattern matching existing code):

```typescript
// ==================== Live Sessions ====================

export async function getAllLiveSessions(): Promise<LiveSession[]> {
  const db = await getDb();
  if (db) {
    try {
      return await db.select().from(liveSessions).orderBy(desc(liveSessions.startTime));
    } catch (e) { console.warn("[DB Fallback] getAllLiveSessions:", (e as Error).message); }
  }
  const { data } = await restFrom("live_sessions").select("*").order("startTime", { ascending: false });
  return (data ?? []) as LiveSession[];
}

export async function getLiveSessionById(id: number): Promise<LiveSession | undefined> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(liveSessions).where(eq(liveSessions.id, id)).limit(1);
      return result[0];
    } catch (e) { console.warn("[DB Fallback] getLiveSessionById:", (e as Error).message); }
  }
  const { data } = await restFrom("live_sessions").select("*").eq("id", id).limit(1).single();
  return (data ?? undefined) as LiveSession | undefined;
}

export async function createLiveSession(session: InsertLiveSession): Promise<LiveSession> {
  const db = await getDb();
  if (db) {
    try { return (await db.insert(liveSessions).values(session).returning())[0]; }
    catch (e) { console.warn("[DB Fallback] createLiveSession:", (e as Error).message); }
  }
  const { data, error } = await restFrom("live_sessions").insert(session as any).select("*").single();
  if (error || !data) throw new Error(error?.message || "Insert failed");
  return data as LiveSession;
}

export async function updateLiveSession(id: number, updates: Partial<InsertLiveSession>): Promise<LiveSession | undefined> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.update(liveSessions).set(updates).where(eq(liveSessions.id, id)).returning();
      return result[0];
    } catch (e) { console.warn("[DB Fallback] updateLiveSession:", (e as Error).message); }
  }
  const { data } = await restFrom("live_sessions").update(updates as any).eq("id", id).select("*").single();
  return (data ?? undefined) as LiveSession | undefined;
}

export async function deleteLiveSession(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try { await db.delete(liveSessions).where(eq(liveSessions.id, id)); return; }
    catch (e) { console.warn("[DB Fallback] deleteLiveSession:", (e as Error).message); }
  }
  await restFrom("live_sessions").delete().eq("id", id);
}

export async function getUpcomingLiveSessions(limit: number = 10): Promise<LiveSession[]> {
  const now = new Date();
  const db = await getDb();
  if (db) {
    try {
      return await db.select().from(liveSessions)
        .where(and(
          gte(liveSessions.startTime, now),
          eq(liveSessions.status, "scheduled")
        ))
        .orderBy(liveSessions.startTime)
        .limit(limit);
    } catch (e) { console.warn("[DB Fallback] getUpcomingLiveSessions:", (e as Error).message); }
  }
  const { data } = await restFrom("live_sessions").select("*")
    .gte("startTime", now.toISOString())
    .eq("status", "scheduled")
    .order("startTime", { ascending: true })
    .limit(limit);
  return (data ?? []) as LiveSession[];
}
```

Add the import at the top of `server/db.ts`:
```typescript
import { liveSessions, LiveSession, InsertLiveSession } from "../drizzle/schema";
```

- [ ] **Step 4: Build and verify**

```bash
pnpm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add live_sessions table and DB functions with REST fallback

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Create `liveSessionRouter` tRPC backend

**Files:**
- Create: `server/liveSessionRouter.ts`
- Modify: `server/routers.ts` (mount the router)

- [ ] **Step 1: Create the router file**

Create `server/liveSessionRouter.ts`:

```typescript
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { createZoomMeeting, generateZoomSDKSignature, canJoinMeeting } from "./_core/zoom";

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next();
});

export const liveSessionRouter = router({
  // Public: get session by ID (description visible to everyone)
  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const session = await db.getLiveSessionById(input.id);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      return session;
    }),

  // Public: list upcoming sessions
  upcoming: publicProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return await db.getUpcomingLiveSessions(input?.limit ?? 10);
    }),

  // Public: list all sessions (for session listing page)
  list: publicProcedure.query(async () => {
    return await db.getAllLiveSessions();
  }),

  // Protected: join a live session (get Zoom SDK credentials)
  join: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const session = await db.getLiveSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      // Access control for paid sessions
      if (!session.isFree) {
        // Check if user has premium membership
        const isPremium = ctx.user.membershipStatus === "monthly" || ctx.user.membershipStatus === "annual";
        // TODO: Check if user purchased this specific session (when purchase system is connected)
        if (!isPremium) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This session requires purchase or premium membership",
          });
        }
      }

      // Verify Zoom meeting is configured
      if (!session.zoomMeetingId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Zoom meeting not configured" });
      }

      // Verify time window (5 minutes before start)
      if (!canJoinMeeting(new Date(session.startTime))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Session has not started yet" });
      }

      // Check if session ended
      if (new Date() > new Date(session.endTime)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Session has ended" });
      }

      // Generate SDK signature
      const meetingNumber = parseInt(session.zoomMeetingId);
      const signature = generateZoomSDKSignature(meetingNumber, 0);

      return {
        meetingNumber,
        sdkKey: process.env.ZOOM_CLIENT_ID!,
        signature,
        userName: ctx.user.name || ctx.user.email || "Participant",
        userEmail: ctx.user.email || "",
      };
    }),

  // Admin: create session
  create: adminProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      startTime: z.string(),
      endTime: z.string(),
      isFree: z.boolean(),
      price: z.string().optional(),
      capacity: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return await db.createLiveSession({
        title: input.title,
        description: input.description || null,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
        isFree: input.isFree,
        price: input.isFree ? null : (input.price || null),
        capacity: input.capacity || 100,
      });
    }),

  // Admin: auto-create Zoom meeting for a session
  createZoom: adminProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const session = await db.getLiveSessionById(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      const durationMinutes = Math.ceil(
        (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000
      );

      const zoom = await createZoomMeeting(
        session.title,
        new Date(session.startTime).toISOString(),
        durationMinutes
      );

      await db.updateLiveSession(session.id, {
        zoomMeetingId: zoom.meetingId,
        zoomMeetingNumber: zoom.meetingNumber.toString(),
      });

      return { meetingId: zoom.meetingId, meetingNumber: zoom.meetingNumber };
    }),

  // Admin: update session
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      isFree: z.boolean().optional(),
      price: z.string().optional(),
      capacity: z.number().optional(),
      status: z.enum(["scheduled", "live", "ended", "cancelled"]).optional(),
      zoomMeetingId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, startTime, endTime, ...rest } = input;
      const updates: any = { ...rest };
      if (startTime) updates.startTime = new Date(startTime);
      if (endTime) updates.endTime = new Date(endTime);
      return await db.updateLiveSession(id, updates);
    }),

  // Admin: delete session
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteLiveSession(input.id);
    }),

  // Admin: list all sessions (including past)
  adminList: adminProcedure.query(async () => {
    return await db.getAllLiveSessions();
  }),
});
```

- [ ] **Step 2: Mount the router in `server/routers.ts`**

Add import at top:
```typescript
import { liveSessionRouter } from "./liveSessionRouter";
```

Add to the `appRouter` definition (alongside existing routers):
```typescript
  liveSessions: liveSessionRouter,
```

- [ ] **Step 3: Build and verify**

```bash
pnpm run build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add liveSessionRouter — CRUD, join with access control, auto-create Zoom

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Create public `/live-session/:id` page

**Files:**
- Create: `client/src/pages/LiveSession.tsx`
- Modify: `client/src/App.tsx` (add route)

- [ ] **Step 1: Create the LiveSession page**

Create `client/src/pages/LiveSession.tsx`:

```typescript
import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ZoomMeeting } from "@/components/ZoomMeeting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Video, Users, Lock, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

type PageState = "countdown" | "live" | "ended" | "no-access";

export default function LiveSessionPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const [pageState, setPageState] = useState<PageState>("countdown");
  const [countdown, setCountdown] = useState("");
  const [canAccess, setCanAccess] = useState(false);

  const { data: session, isLoading } = trpc.liveSessions.getById.useQuery(
    { id: parseInt(id!) },
    { enabled: !!id }
  );

  // Determine access
  useEffect(() => {
    if (!session) return;
    if (session.isFree) {
      setCanAccess(true);
    } else if (isAuthenticated && user) {
      const isPremium = user.membershipStatus === "monthly" || user.membershipStatus === "annual";
      setCanAccess(isPremium); // TODO: also check specific purchase
    } else {
      setCanAccess(false);
    }
  }, [session, isAuthenticated, user]);

  // Countdown & state machine (updates every second)
  useEffect(() => {
    if (!session) return;

    const tick = () => {
      const now = Date.now();
      const start = new Date(session.startTime).getTime();
      const end = new Date(session.endTime).getTime();
      const fiveMinBefore = start - 5 * 60 * 1000;

      if (now > end) {
        setPageState("ended");
        return;
      }

      if (now >= fiveMinBefore) {
        setPageState(canAccess ? "live" : "no-access");
        return;
      }

      // Countdown
      setPageState("countdown");
      const diff = start - now;
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (days > 0) setCountdown(`${days}d ${hours}h ${minutes}m ${seconds}s`);
      else if (hours > 0) setCountdown(`${hours}h ${minutes}m ${seconds}s`);
      else setCountdown(`${minutes}m ${seconds}s`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session, canAccess]);

  if (isLoading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-fuchsia-50 to-white">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Back button */}
        <Link href="/">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </Link>

        {/* Session Info (always visible) */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl">{session.title}</CardTitle>
              {session.isFree ? (
                <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full">FREE</span>
              ) : (
                <span className="bg-fuchsia-100 text-fuchsia-800 text-xs font-bold px-3 py-1 rounded-full">
                  {session.price ? `€${session.price}` : "PREMIUM"}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {session.description && (
              <p className="text-muted-foreground mb-4">{session.description}</p>
            )}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {new Date(session.startTime).toLocaleString()} — {new Date(session.endTime).toLocaleTimeString()}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                Up to {session.capacity} participants
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Time-based content */}
        {pageState === "countdown" && (
          <Card className="text-center py-16">
            <CardContent>
              <Video className="h-16 w-16 mx-auto text-fuchsia-400 mb-6" />
              <h2 className="text-2xl font-bold mb-2">Session Starts Soon</h2>
              <p className="text-muted-foreground mb-6">Get ready for your live dance class!</p>
              <div className="text-5xl font-mono font-bold text-fuchsia-600 mb-4">{countdown}</div>
              <p className="text-sm text-muted-foreground">
                The live stream will begin automatically 5 minutes before the session starts.
              </p>
            </CardContent>
          </Card>
        )}

        {pageState === "live" && canAccess && (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <LiveZoomEmbed sessionId={session.id} />
            </CardContent>
          </Card>
        )}

        {pageState === "no-access" && !session.isFree && (
          <Card className="text-center py-16">
            <CardContent>
              <Lock className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
              <h2 className="text-xl font-bold mb-2">Access Required</h2>
              {!isAuthenticated ? (
                <p className="text-muted-foreground">
                  Sign in or create an account to purchase access to this live session.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  This session requires purchase or premium membership.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {pageState === "ended" && (
          <Card className="text-center py-16">
            <CardContent>
              <Video className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
              <h2 className="text-xl font-bold mb-2">Session Has Ended</h2>
              <p className="text-muted-foreground">Thank you for attending! Check back for upcoming sessions.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/** Zoom embed sub-component — auto-joins on mount */
function LiveZoomEmbed({ sessionId }: { sessionId: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "joined" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const joinMutation = trpc.liveSessions.join.useMutation();

  useEffect(() => {
    let client: any = null;

    async function init() {
      try {
        const ZoomMtgEmbedded = (await import("@zoom/meetingsdk/embedded")).default;
        const creds = await joinMutation.mutateAsync({ sessionId });

        client = ZoomMtgEmbedded.createClient();
        await client.init({
          zoomAppRoot: containerRef.current!,
          language: "en-US",
          patchJsMedia: true,
          leaveOnPageUnload: true,
        });

        await client.join({
          sdkKey: creds.sdkKey,
          signature: creds.signature,
          meetingNumber: creds.meetingNumber.toString(),
          userName: creds.userName,
          userEmail: creds.userEmail,
          tk: "",
          zak: "",
        });

        setStatus("joined");
      } catch (err: any) {
        console.error("[LiveSession] Zoom join failed:", err);
        setErrorMsg(err.message || "Failed to connect");
        setStatus("error");
      }
    }

    init();

    return () => {
      if (client) {
        try { client.leaveMeeting(); } catch {}
      }
    };
  }, [sessionId]);

  if (status === "error") {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50">
        <div className="text-center">
          <Video className="h-12 w-12 mx-auto text-red-400 mb-4" />
          <p className="font-medium">Unable to connect</p>
          <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-fuchsia-500 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Connecting to live session...</p>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full min-h-[500px] sm:min-h-[600px]" />
    </div>
  );
}
```

- [ ] **Step 2: Add route in `client/src/App.tsx`**

Add import:
```typescript
import LiveSession from "./pages/LiveSession";
```

Add route inside the `<Switch>`:
```typescript
<Route path="/live-session/:id" component={LiveSession} />
```

- [ ] **Step 3: Build and verify**

```bash
pnpm run build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add /live-session/:id page — countdown, auto-embed, access control

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Create Admin Live Sessions management page

**Files:**
- Create: `client/src/pages/admin/LiveSessions.tsx`
- Modify: `client/src/components/AdminLayout.tsx` (add nav item)
- Modify: `client/src/App.tsx` (add admin route)

- [ ] **Step 1: Create the admin page**

Create `client/src/pages/admin/LiveSessions.tsx`:

```typescript
import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Video, Trash2, Edit, ExternalLink } from "lucide-react";

interface FormData {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  isFree: boolean;
  price: string;
  capacity: number;
}

const defaultForm: FormData = {
  title: "", description: "", startTime: "", endTime: "",
  isFree: true, price: "", capacity: 100,
};

export default function AdminLiveSessions() {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);

  const { data: sessions = [], isLoading } = trpc.liveSessions.adminList.useQuery();

  const createMut = trpc.liveSessions.create.useMutation({
    onSuccess: (session) => {
      toast.success("Session created!");
      utils.liveSessions.adminList.invalidate();
      setShowForm(false);
      setForm(defaultForm);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.liveSessions.update.useMutation({
    onSuccess: () => {
      toast.success("Session updated!");
      utils.liveSessions.adminList.invalidate();
      setShowForm(false);
      setEditId(null);
      setForm(defaultForm);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.liveSessions.delete.useMutation({
    onSuccess: () => { toast.success("Session deleted"); utils.liveSessions.adminList.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const createZoomMut = trpc.liveSessions.createZoom.useMutation({
    onSuccess: (data) => {
      toast.success(`Zoom meeting created! ID: ${data.meetingId}`);
      utils.liveSessions.adminList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (editId) {
      updateMut.mutate({ id: editId, ...form, startTime: form.startTime, endTime: form.endTime });
    } else {
      createMut.mutate(form);
    }
  };

  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({
      title: s.title, description: s.description || "",
      startTime: new Date(s.startTime).toISOString().slice(0, 16),
      endTime: new Date(s.endTime).toISOString().slice(0, 16),
      isFree: s.isFree, price: s.price || "", capacity: s.capacity,
    });
    setShowForm(true);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "scheduled": return "bg-blue-100 text-blue-800";
      case "live": return "bg-green-100 text-green-800";
      case "ended": return "bg-gray-100 text-gray-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Live Sessions</h1>
            <p className="text-muted-foreground mt-1">Manage Zoom live dance classes</p>
          </div>
          <Button onClick={() => { setEditId(null); setForm(defaultForm); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New Session
          </Button>
        </div>

        {/* Session List */}
        <div className="space-y-3">
          {sessions.length === 0 && !isLoading && (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No live sessions yet</CardContent></Card>
          )}
          {sessions.map((s: any) => (
            <Card key={s.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{s.title}</h3>
                      <Badge className={statusColor(s.status)}>{s.status}</Badge>
                      {s.isFree ? (
                        <Badge className="bg-green-100 text-green-800">Free</Badge>
                      ) : (
                        <Badge className="bg-fuchsia-100 text-fuchsia-800">€{s.price}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(s.startTime).toLocaleString()} — {new Date(s.endTime).toLocaleTimeString()}
                    </p>
                    {s.zoomMeetingId && (
                      <p className="text-xs text-muted-foreground mt-1">Zoom ID: {s.zoomMeetingId}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!s.zoomMeetingId && (
                      <Button size="sm" variant="outline" onClick={() => createZoomMut.mutate({ sessionId: s.id })}
                        disabled={createZoomMut.isPending}>
                        <Video className="h-3 w-3 mr-1" /> Create Zoom
                      </Button>
                    )}
                    {s.status === "ended" && (
                      <a href="https://zoom.us/recording" target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline">
                          <ExternalLink className="h-3 w-3 mr-1" /> Recordings
                        </Button>
                      </a>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500"
                      onClick={() => { if (confirm("Delete this session?")) deleteMut.mutate({ id: s.id }); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editId ? "Edit Session" : "New Live Session"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Time</Label>
                  <Input type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input type="datetime-local" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.isFree} onCheckedChange={(v) => setForm({ ...form, isFree: v })} />
                <Label>Free session</Label>
              </div>
              {!form.isFree && (
                <div>
                  <Label>Price (€)</Label>
                  <Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </div>
              )}
              <div>
                <Label>Capacity</Label>
                <Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 100 })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
                {editId ? "Save Changes" : "Create Session"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
```

- [ ] **Step 2: Add nav item in AdminLayout.tsx**

In `client/src/components/AdminLayout.tsx`, find the navigation items array and add:
```typescript
{ href: "/admin/live-sessions", label: "Live Sessions", icon: Video },
```

Add `Video` to the lucide-react imports.

- [ ] **Step 3: Add admin route in App.tsx**

Add import:
```typescript
import AdminLiveSessions from "./pages/admin/LiveSessions";
```

Add route:
```typescript
<Route path="/admin/live-sessions" component={AdminLiveSessions} />
```

- [ ] **Step 4: Build and verify**

```bash
pnpm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add admin Live Sessions page — create, edit, delete, auto-create Zoom

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Fix existing SessionView.tsx security leak

**Files:**
- Modify: `client/src/pages/SessionView.tsx`

- [ ] **Step 1: Remove meetLink fallback that leaks Zoom URL**

In `SessionView.tsx`, find the section that displays `slot.meetLink` as an anchor tag with `target="_blank"` (around lines 195-215) and remove it entirely. Replace with:

```typescript
{/* Session link removed for security — meetings must be joined via embedded SDK */}
```

- [ ] **Step 2: Update countdown to 1-second interval**

Find `setInterval(checkSessionState, 30000)` and change to:
```typescript
const interval = setInterval(checkSessionState, 1000);
```

Also update the time display to show seconds (not just minutes).

- [ ] **Step 3: Update time window from 15 min to 5 min**

Find `15 * 60 * 1000` in the time calculation and change to:
```typescript
const fiveMinutesBefore = sessionStart - 5 * 60 * 1000;
```

Update all references to this value.

- [ ] **Step 4: Build and verify**

```bash
pnpm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: SessionView — remove URL leak, 1-second countdown, 5-min window

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Push schema & deploy to production

- [ ] **Step 1: Push database schema**

```bash
npx drizzle-kit push
```

Verify `live_sessions` table exists in Supabase.

- [ ] **Step 2: Push code to GitHub**

```bash
git push origin main
```

- [ ] **Step 3: Deploy to Render**

Trigger deploy via MCP or env var update.

- [ ] **Step 4: Verify on production**

1. Navigate to `/admin/live-sessions` — should show empty state
2. Create a test session — should save
3. Navigate to `/live-session/:id` — should show countdown
4. Verify no build errors in Render logs

---

### Task 8: Post-deployment — Zoom credential setup

This task is manual (user action):

- [ ] **Step 1: Create Zoom app**

Go to https://marketplace.zoom.us/ → Develop → Build App → Server-to-Server OAuth
- App name: "High Heels Dance Platform"
- Scopes: `meeting:write:admin`, `meeting:read:admin`
- Activate

- [ ] **Step 2: Set environment variables on Render**

```
ZOOM_ACCOUNT_ID=<from Zoom>
ZOOM_CLIENT_ID=<from Zoom>
ZOOM_CLIENT_SECRET=<from Zoom>
```

- [ ] **Step 3: Test auto-create Zoom meeting**

In Admin → Live Sessions, create a session and click "Create Zoom" — should auto-populate meeting ID.
