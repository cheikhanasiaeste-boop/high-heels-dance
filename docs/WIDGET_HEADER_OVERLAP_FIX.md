# Upcoming Events Widget Header Overlap Fix

## Problem
The Upcoming Events widget was overlapping with the white navigation bar at the top of the page when scrolling, creating a visual conflict and poor user experience.

## Root Cause
The widget's scroll constraint logic only considered the hero section bottom position but did not account for the header height. When the hero section scrolled past the default widget position (96px from top), the widget would move up but could go above the header.

## Solution
Updated the scroll constraint calculation in `UpcomingSessionsWidget.tsx` to:

1. **Detect header height dynamically**: Query the header element and get its `offsetHeight`
2. **Calculate minimum top position**: `headerHeight + 16px spacing`
3. **Apply constraint**: Use `Math.max(minTop, calculatedPosition)` to ensure widget never goes above the header

```typescript
const header = document.querySelector('header');
const headerHeight = header ? header.offsetHeight : 64; // Default 64px if header not found
const minTop = headerHeight + 16; // Header height + 16px spacing

// Constrain widget to never go above header
setWidgetTop(Math.max(minTop, calculatedPosition));
```

## Testing
Verified widget behavior:
- ✅ Widget stays visible at top-right corner at all scroll positions
- ✅ Widget never overlaps white navigation bar
- ✅ Widget stops at hero section bottom when scrolling down
- ✅ Widget maintains 16px spacing below header

## Files Modified
- `/home/ubuntu/high-heels-dance/client/src/components/UpcomingSessionsWidget.tsx`

## Date
January 19, 2026
