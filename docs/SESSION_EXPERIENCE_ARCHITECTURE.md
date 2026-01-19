# Session Experience UX Architecture

**Document Purpose:** Define the user experience architecture for viewing and accessing upcoming sessions with clear previews, rich information display, and premium session detail pages.

**Design Philosophy:** Clarity, confidence, and premium experience through visual hierarchy, calm navigation, and consistent layouts.

---

## 1. Information Architecture

### Session Data Model

```typescript
interface Session {
  id: number;
  title: string;
  description: string; // NEW: Rich description visible in list
  date: Date;
  startTime: string;
  endTime: string;
  duration: number; // in minutes
  type: 'online' | 'in-person';
  status: 'upcoming' | 'live' | 'completed' | 'cancelled';
  location?: string; // For in-person sessions
  zoomMeetingId?: string; // For online sessions
  zoomPassword?: string;
  enrollmentStatus: 'confirmed' | 'pending' | 'cancelled';
}
```

### Navigation Flow

```
My Sessions (List View)
  ↓ Click session card
Session Detail Page
  ├─ Online → Embedded Zoom + Side Panel
  └─ In-person → Embedded Map + Side Panel
```

---

## 2. Upcoming Sessions List (My Sessions Page)

### Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│ Header: "My Sessions" 🧑‍💻                                │
│ Subtitle: "View and manage your booked dance sessions" │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 📅 Upcoming Sessions                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ [Session Card 1 - Clickable]                      │ │
│  │                                                   │ │
│  │ 💃 One-on-One Dance Session    [confirmed]       │ │
│  │ 🕐 17/01/2026 at 01:50                           │ │
│  │ 🌐 Online Session                                │ │
│  │                                                   │ │
│  │ Description:                                      │ │
│  │ Personalized high heels dance technique session  │ │
│  │ focusing on posture, balance, and confidence.    │ │
│  │                                                   │ │
│  │ [View Session Details →]                         │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ [Session Card 2 - Clickable]                      │ │
│  │ ...                                               │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Session Card Design

**Visual Hierarchy:**
1. **Session Title** - Large, bold, primary color
2. **Status Badge** - Color-coded (green=confirmed, amber=pending, red=cancelled)
3. **Date & Time** - Prominent with clock icon
4. **Session Type** - Icon + label (🌐 Online / 📍 In-person)
5. **Description** - 2-3 lines, readable font size, muted color
6. **Action Button** - "View Session Details" with arrow

**Interaction States:**
- **Default:** White background, subtle border, shadow on hover
- **Hover:** Elevated shadow, border color change, cursor pointer
- **Active/Clicked:** Brief scale animation, navigate to detail page

**Status Badge Colors:**
- `confirmed` → Green (`bg-green-100 text-green-700`)
- `pending` → Amber (`bg-amber-100 text-amber-700`)
- `cancelled` → Red (`bg-red-100 text-red-700`)
- `completed` → Gray (`bg-gray-100 text-gray-700`)

**Card Spacing:**
- Gap between cards: `16px` (space-y-4)
- Card padding: `24px` (p-6)
- Border radius: `12px` (rounded-xl)

---

## 3. Session Detail Page

### URL Structure
```
/session/:sessionId
```

### Access Control
- Verify user is enrolled in the session
- Redirect to /my-sessions if not enrolled
- Show appropriate error message

### Layout Structure (Desktop)

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back to My Sessions                                           │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────┬──────────────────────────────┐
│                                  │  SESSION DETAILS             │
│  MAIN CONTENT AREA               │  ┌────────────────────────┐  │
│  (70% width)                     │  │ 📋 Session Info        │  │
│                                  │  ├────────────────────────┤  │
│  ┌────────────────────────────┐  │  │ Type: Online           │  │
│  │ Session Title              │  │  │ Duration: 60 min       │  │
│  │ 📅 17/01/2026 at 01:50    │  │  │ Platform: Zoom         │  │
│  └────────────────────────────┘  │  │                        │  │
│                                  │  │ Status: [Live]         │  │
│  Description:                    │  └────────────────────────┘  │
│  Personalized high heels dance   │                              │
│  technique session focusing on   │  ┌────────────────────────┐  │
│  posture, balance, confidence.   │  │ 🎯 Quick Actions       │  │
│                                  │  ├────────────────────────┤  │
│  ┌────────────────────────────┐  │  │ [Join Session]         │  │
│  │                            │  │  │ [Add to Calendar]      │  │
│  │  EMBEDDED ZOOM WINDOW      │  │  │ [Contact Instructor]   │  │
│  │  (if online & joinable)    │  │  └────────────────────────┘  │
│  │                            │  │                              │
│  │  OR                        │  │  ┌────────────────────────┐  │
│  │                            │  │  │ 📍 Location            │  │
│  │  EMBEDDED GOOGLE MAPS      │  │  ├────────────────────────┤  │
│  │  (if in-person)            │  │  │ Dance Studio XYZ       │  │
│  │                            │  │  │ 123 Main St            │  │
│  └────────────────────────────┘  │  │ Amsterdam, NL          │  │
│                                  │  │                        │  │
│                                  │  │ [Get Directions]       │  │
│                                  │  └────────────────────────┘  │
│                                  │                              │
└──────────────────────────────────┴──────────────────────────────┘
```

### Layout Structure (Mobile)

```
┌─────────────────────────────────┐
│ ← Back                          │
├─────────────────────────────────┤
│ Session Title                   │
│ 📅 17/01/2026 at 01:50         │
├─────────────────────────────────┤
│ Description...                  │
├─────────────────────────────────┤
│                                 │
│  [EMBEDDED ZOOM/MAP]            │
│  (Full width)                   │
│                                 │
├─────────────────────────────────┤
│ 📋 Session Details              │
│ • Type: Online                  │
│ • Duration: 60 min              │
│ • Status: Live                  │
├─────────────────────────────────┤
│ [Join Session]                  │
│ [Add to Calendar]               │
└─────────────────────────────────┘
```

---

## 4. Session State Logic

### State Determination

```typescript
function getSessionState(session: Session): SessionState {
  const now = new Date();
  const sessionStart = new Date(session.date + ' ' + session.startTime);
  const sessionEnd = new Date(session.date + ' ' + session.endTime);
  const joinWindowStart = new Date(sessionStart.getTime() - 15 * 60 * 1000); // 15 min before
  
  if (session.status === 'cancelled') return 'cancelled';
  if (now > sessionEnd) return 'completed';
  if (now >= joinWindowStart && now <= sessionEnd) return 'live';
  return 'upcoming';
}
```

### State-Based UI Behavior

| State | Badge Color | Join Button | Zoom/Map Display |
|-------|------------|-------------|------------------|
| **Upcoming** | Blue | Disabled ("Starts in X min") | Hidden/Placeholder |
| **Live** | Green (pulsing) | Enabled ("Join Now") | Visible & Interactive |
| **Completed** | Gray | Hidden | Hidden/Static screenshot |
| **Cancelled** | Red | Hidden | Hidden |

---

## 5. Embedded Content Integration

### Online Sessions - Zoom Embed

**Implementation:**
- Use existing `SessionView` component with Zoom SDK
- Pass `sessionId` as prop
- Component handles signature generation and SDK initialization
- Show loading state while Zoom initializes

**Fallback Behavior:**
- If Zoom SDK fails → Show "Join via Zoom App" button with direct link
- If session not yet joinable → Show countdown timer with session preview

### In-Person Sessions - Google Maps Embed

**Implementation:**
- Use existing `Map` component from `client/src/components/Map.tsx`
- Display location marker at session venue
- Show venue name and address in info window
- Enable directions button

**Map Configuration:**
```typescript
<MapView
  onMapReady={({ map, google }) => {
    const marker = new google.maps.Marker({
      position: { lat: venue.lat, lng: venue.lng },
      map: map,
      title: session.location
    });
    
    const infoWindow = new google.maps.InfoWindow({
      content: `
        <div>
          <h3>${session.location}</h3>
          <p>${venue.address}</p>
        </div>
      `
    });
    
    marker.addListener('click', () => {
      infoWindow.open(map, marker);
    });
  }}
  center={{ lat: venue.lat, lng: venue.lng }}
  zoom={15}
  className="w-full h-96 rounded-lg"
/>
```

---

## 6. Side Panel Design

### Session Info Card

```typescript
<Card>
  <CardHeader>
    <CardTitle>📋 Session Details</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <div>
      <Label>Type</Label>
      <p>{session.type === 'online' ? '🌐 Online' : '📍 In-person'}</p>
    </div>
    <div>
      <Label>Duration</Label>
      <p>{session.duration} minutes</p>
    </div>
    <div>
      <Label>Platform/Location</Label>
      <p>{session.type === 'online' ? 'Zoom' : session.location}</p>
    </div>
    <div>
      <Label>Status</Label>
      <Badge variant={getStatusVariant(sessionState)}>
        {sessionState}
      </Badge>
    </div>
  </CardContent>
</Card>
```

### Quick Actions Card

```typescript
<Card>
  <CardHeader>
    <CardTitle>🎯 Quick Actions</CardTitle>
  </CardHeader>
  <CardContent className="space-y-2">
    {sessionState === 'live' && (
      <Button className="w-full" size="lg">
        Join Session
      </Button>
    )}
    <Button variant="outline" className="w-full">
      Add to Calendar
    </Button>
    <Button variant="outline" className="w-full">
      Contact Instructor
    </Button>
  </CardContent>
</Card>
```

---

## 7. Visual Design Tokens

### Colors

```css
/* Session State Colors */
--session-upcoming: hsl(217, 91%, 60%);     /* Blue */
--session-live: hsl(142, 71%, 45%);        /* Green */
--session-completed: hsl(215, 14%, 34%);   /* Gray */
--session-cancelled: hsl(0, 84%, 60%);     /* Red */

/* Card Styling */
--card-border: hsl(214, 32%, 91%);
--card-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
--card-shadow-hover: 0 10px 15px -3px rgb(0 0 0 / 0.1);
```

### Typography

```css
/* Session Card */
.session-title {
  font-size: 1.25rem;     /* 20px */
  font-weight: 600;
  line-height: 1.4;
}

.session-description {
  font-size: 0.875rem;    /* 14px */
  line-height: 1.6;
  color: hsl(215, 16%, 47%);
}

.session-metadata {
  font-size: 0.875rem;    /* 14px */
  font-weight: 500;
}
```

### Spacing

```css
/* Session List */
--session-card-gap: 1rem;           /* 16px between cards */
--session-card-padding: 1.5rem;     /* 24px internal padding */

/* Session Detail */
--detail-main-width: 70%;
--detail-sidebar-width: 30%;
--detail-gap: 2rem;                 /* 32px between main and sidebar */
```

---

## 8. Responsive Breakpoints

### Desktop (≥1024px)
- Two-column layout (main content + sidebar)
- Zoom/Map: 800px width, 500px height
- Side panel: Fixed width 320px

### Tablet (768px - 1023px)
- Two-column layout (60/40 split)
- Zoom/Map: 100% width, 400px height
- Side panel: Flexible width

### Mobile (<768px)
- Single column stack
- Zoom/Map: 100% width, 300px height
- Side panel: Full width below main content

---

## 9. Accessibility Requirements

### Keyboard Navigation
- All session cards must be keyboard accessible (tab navigation)
- Enter key opens session detail
- Escape key returns to session list

### Screen Reader Support
- Session cards have descriptive `aria-label`
- Session state announced clearly
- Embedded content has proper ARIA roles

### Focus Management
- Focus trapped within Zoom embed when active
- Clear focus indicators on all interactive elements
- Skip links for long session lists

---

## 10. Performance Considerations

### Session List
- Paginate if >20 sessions
- Lazy load session descriptions
- Optimize images/thumbnails

### Session Detail
- Lazy load Zoom SDK only when needed
- Preload Google Maps API on page mount
- Cache session data in tRPC query

---

## 11. Implementation Checklist

### Backend
- [x] Add `description` field to `availability_slots` table
- [x] Add `location` field to `availability_slots` table
- [ ] Create `getSessionDetail` tRPC procedure with enrollment check
- [ ] Update `myBookings` query to include descriptions

### Frontend
- [ ] Update MyBookings page with rich session cards
- [ ] Make session cards clickable (navigate to `/session/:id`)
- [ ] Create `SessionDetail.tsx` page component
- [ ] Implement main content area with title, date, description
- [ ] Add conditional Zoom embed for online sessions
- [ ] Add conditional Google Maps embed for in-person sessions
- [ ] Create side panel with session info card
- [ ] Create side panel with quick actions card
- [ ] Implement session state logic and UI
- [ ] Add enrollment verification
- [ ] Test responsive layouts
- [ ] Test accessibility features

---

## 12. Success Metrics

**User Experience:**
- Session detail page load time < 2 seconds
- Zero confusion about session type (online vs in-person)
- Clear understanding of session status at a glance

**Engagement:**
- Increased session join rate (target: >90% for confirmed bookings)
- Reduced support tickets about "how to join"
- Positive user feedback on session clarity

---

## 13. Future Enhancements

1. **Session Recording Access** - For completed online sessions, show recording link
2. **Session Notes** - Allow users to add private notes to sessions
3. **Session Rescheduling** - Quick reschedule button with calendar picker
4. **Instructor Bio** - Show instructor profile in side panel
5. **Session Materials** - Upload/download session materials (PDFs, videos)
6. **Session Chat** - Pre-session chat with instructor
7. **Session Feedback** - Post-session rating and review form

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-19  
**Author:** Senior Product Designer & Session-Experience UX Architect
