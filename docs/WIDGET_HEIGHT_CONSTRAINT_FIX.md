# Upcoming Events Widget Height Constraint Fix

## Issue
The Upcoming Events widget expanded panel was extending into the white content area below the hero section, overlapping with the "Dance Courses" section.

## Solution
Changed the widget's max-height from a fixed pixel value to viewport-based units to ensure it adapts to different screen sizes and stays within the hero section boundaries.

### Changes Made

**File:** `client/src/components/UpcomingSessionsWidget.tsx`

1. **Expanded Panel Container (Line 98)**
   ```tsx
   // Before:
   w-80 max-h-[480px]
   
   // After:
   w-80 max-h-[65vh]
   ```
   - Changed from fixed 480px to 65% of viewport height
   - Ensures widget scales appropriately on different screen sizes
   - Prevents extension beyond hero section

2. **Sessions List Scrollable Area (Line 120)**
   ```tsx
   // Before:
   <div className="overflow-y-auto max-h-[400px]">
   
   // After:
   <div className="overflow-y-auto" style={{ maxHeight: 'calc(65vh - 120px)' }}>
   ```
   - Dynamically calculates max height based on viewport
   - Subtracts 120px for header and footer space
   - Maintains scrollability for long session lists

## Benefits

✅ Widget stays within hero section boundaries
✅ Responsive to different viewport heights
✅ No overlap with white content area below
✅ Maintains scrollability for session list
✅ Consistent user experience across screen sizes

## Testing Results

- Widget expands properly on desktop (1920x1080)
- Bottom of widget stays above "Dance Courses" section
- Scrolling works correctly when session list exceeds visible area
- Footer "View All Available Sessions" link remains visible
- No visual overflow into white content area

## Component Location

File: `client/src/components/UpcomingSessionsWidget.tsx`
Lines modified: 98, 120
