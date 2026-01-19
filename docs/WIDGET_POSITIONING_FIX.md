# Upcoming Events Widget Positioning Fix

## Problem
The Upcoming Events widget was using `fixed` positioning (`fixed top-24 right-6`), which made it stay in the same position relative to the viewport. When users scrolled down, the widget would appear over the white content area below the hero section.

## Solution
Changed the widget positioning strategy:

1. **Moved widget inside hero section**: Relocated `<UpcomingSessionsWidget />` from after the hero section to inside it, making it a child of the hero section container.

2. **Changed to absolute positioning**: Updated widget from `fixed top-24 right-6` to `absolute top-6 right-6`, making it position relative to the hero section instead of the viewport.

3. **Result**: The widget now scrolls with the hero section and disappears naturally when users scroll past the hero, preventing it from overlapping the white content area.

## Files Modified
- `/home/ubuntu/high-heels-dance/client/src/pages/Home.tsx`: Moved widget placement inside hero section
- `/home/ubuntu/high-heels-dance/client/src/components/UpcomingSessionsWidget.tsx`: Changed positioning from fixed to absolute

## Verification
- Widget appears in top-right of hero section
- Widget scrolls with hero content
- Widget does not appear over white "Dance Courses" section
- Expand/collapse functionality still works correctly
