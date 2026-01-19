# Sticky Widget Positioning Solution

## Problem
The Upcoming Events widget needed to stay visible when scrolling but should not extend into the white content area below the hero section.

## Solution
Used CSS `position: sticky` with the widget placed inside the hero section container:

1. **Moved widget inside hero section** - The widget is now a child of the hero `<section>` element
2. **Changed to sticky positioning** - Used `position: sticky` with `top: 96px` (6rem = 24 * 4px)
3. **Container constraint** - The sticky element automatically stops at the bottom of its parent container (hero section)

## How It Works
- When scrolling down, the widget stays at `top: 96px` from the viewport top
- When the hero section scrolls past, the widget stops at the hero section's bottom edge
- The widget naturally disappears when the hero section is completely scrolled past
- No JavaScript scroll listeners needed - pure CSS solution

## Files Modified
- `/client/src/components/UpcomingSessionsWidget.tsx` - Changed from `fixed` to `sticky` positioning
- `/client/src/pages/Home.tsx` - Moved widget inside hero section

## Result
Widget stays visible while in hero section, automatically stops at hero bottom, never overlaps white content area.
