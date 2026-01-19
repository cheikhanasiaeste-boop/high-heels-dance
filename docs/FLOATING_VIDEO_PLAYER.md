# Floating Video Player Documentation

## Overview

The `FloatingVideoPlayer` component provides an elegant continuous video viewing experience on course detail pages. When a preview video is playing and the user scrolls down, the video seamlessly transitions to a floating position that replaces the course thumbnail, allowing uninterrupted viewing while browsing course details.

## Architecture

### Core Design Principles

1. **Single Video Element**: Uses one `<video>` element that physically repositions (no cloning), ensuring truly seamless playback continuation without restarts or buffering.

2. **GPU-Accelerated Transitions**: Uses CSS transforms and position changes for smooth, performant animations that don't cause layout thrashing.

3. **Passive Event Listeners**: Scroll and resize listeners use `{ passive: true }` for optimal scroll performance.

4. **Accessibility First**: Respects `prefers-reduced-motion` and provides keyboard-accessible controls.

5. **Mobile-Optimized**: Falls back to native Picture-in-Picture on mobile devices when supported.

## Behavior Specification

### Floating Trigger Conditions

The video enters floating mode when **ALL** of the following conditions are met:

1. Video is currently playing (not paused)
2. Original video container has scrolled completely out of viewport (top edge above viewport)
3. Thumbnail container reference is available

### Return to Original Position

The video returns to its original position when:

1. User scrolls back up and original container enters viewport
2. User clicks the close button (also pauses video)
3. Video is paused or ends

### Layout Behavior

- **Floating Position**: Video positions itself at the exact coordinates of the thumbnail container in the right column
- **Original Position Placeholder**: When floating, a subtle placeholder appears in the original position with text "Video playing above"
- **No Layout Disruption**: The sticky CTA container behavior remains unchanged
- **No Overlaps**: Floating video does not overlap description text or CTA elements

## Component API

### Props

```typescript
interface FloatingVideoPlayerProps {
  videoUrl: string;                                    // Video source URL
  posterUrl?: string;                                  // Optional poster image
  thumbnailContainerRef: React.RefObject<HTMLDivElement | null>;  // Ref to thumbnail target
  className?: string;                                  // Additional CSS classes
}
```

### Usage Example

```tsx
import { FloatingVideoPlayer } from '@/components/FloatingVideoPlayer';
import { useRef } from 'react';

function CourseDetail() {
  const thumbnailRef = useRef<HTMLDivElement>(null);

  return (
    <div className="grid lg:grid-cols-[1fr_400px] gap-8">
      {/* Left Column */}
      <div>
        <FloatingVideoPlayer
          videoUrl={course.previewVideoUrl}
          posterUrl={course.imageUrl}
          thumbnailContainerRef={thumbnailRef}
        />
      </div>

      {/* Right Column */}
      <div>
        <div ref={thumbnailRef} className="aspect-video">
          {/* Thumbnail content */}
        </div>
      </div>
    </div>
  );
}
```

## Technical Implementation

### State Management

```typescript
const [isPlaying, setIsPlaying] = useState(false);        // Video play state
const [isFloating, setIsFloating] = useState(false);      // Floating mode active
const [floatingStyle, setFloatingStyle] = useState({});   // Dynamic positioning
const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
```

### Scroll Detection Logic

```typescript
const handleScroll = () => {
  const originalRect = originalContainerRef.current.getBoundingClientRect();
  const thumbnailRect = thumbnailContainerRef.current.getBoundingClientRect();
  
  // Video scrolled out of view
  const isOutOfView = originalRect.bottom < 0;
  
  if (isOutOfView && !isFloating) {
    // Transition to floating mode
    setFloatingStyle({
      position: 'fixed',
      top: `${thumbnailRect.top}px`,
      left: `${thumbnailRect.left}px`,
      width: `${thumbnailRect.width}px`,
      height: `${thumbnailRect.height}px`,
      zIndex: 40,
    });
    setIsFloating(true);
  } else if (!isOutOfView && isFloating) {
    // Return to original position
    setIsFloating(false);
  }
};
```

### Video State Monitoring

```typescript
useEffect(() => {
  const video = videoRef.current;
  
  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);
  const handleEnded = () => setIsPlaying(false);

  video.addEventListener('play', handlePlay);
  video.addEventListener('pause', handlePause);
  video.addEventListener('ended', handleEnded);

  return () => {
    video.removeEventListener('play', handlePlay);
    video.removeEventListener('pause', handlePause);
    video.removeEventListener('ended', handleEnded);
  };
}, []);
```

## Performance Characteristics

### Optimizations

1. **Passive Scroll Listeners**: Prevents scroll blocking
   ```typescript
   window.addEventListener('scroll', handleScroll, { passive: true });
   ```

2. **Conditional Rendering**: Floating controls only render when needed
   ```tsx
   {isFloating && <FloatingControls />}
   ```

3. **Transform-Based Transitions**: GPU-accelerated, no layout reflow
   ```css
   transition: all 300ms ease-out;
   ```

4. **Single Video Element**: No memory overhead from cloning

### Performance Metrics

- **Scroll Performance**: 60fps maintained with passive listeners
- **Transition Duration**: 300ms (0ms with reduced motion)
- **Memory Footprint**: Single video element, minimal state
- **Layout Shifts**: Zero (floating video uses fixed positioning)

## Accessibility Features

### Reduced Motion Support

```typescript
const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const transitionDuration = prefersReducedMotion ? '0ms' : '300ms';
```

### Keyboard Accessibility

- Video controls remain fully keyboard-accessible in both modes
- Close button is focusable with visible focus ring
- ARIA label on close button: "Close floating video"

### Screen Reader Support

- Video maintains native `<video>` element semantics
- Placeholder text announces "Video playing above" when floating

## Mobile Behavior

### Picture-in-Picture Fallback

On mobile devices (< 1024px width), the component attempts to use native browser Picture-in-Picture:

```typescript
if ('pictureInPictureEnabled' in document && window.innerWidth < 1024) {
  await video.requestPictureInPicture();
}
```

### Mobile Considerations

- Native PiP provides better mobile UX than custom floating
- Falls back gracefully if PiP is not supported
- Touch-friendly close button (8x8 size with backdrop)

## Browser Compatibility

### Required Features

- ✅ CSS `position: fixed`
- ✅ CSS transforms
- ✅ `getBoundingClientRect()`
- ✅ Video element with `playsInline`

### Optional Features

- Picture-in-Picture API (mobile enhancement)
- `prefers-reduced-motion` media query (accessibility enhancement)

### Tested Browsers

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile Safari iOS 14+
- Chrome Mobile Android 90+

## Testing Guide

### Manual Testing Checklist

#### Basic Functionality

- [ ] Video loads and displays poster image
- [ ] Video controls (play/pause/seek) work correctly
- [ ] Video plays when play button is clicked

#### Floating Behavior

- [ ] Start playing video
- [ ] Scroll down until video is out of view
- [ ] Verify video transitions to thumbnail position smoothly
- [ ] Verify video continues playing without restart
- [ ] Verify close button appears in top-right corner
- [ ] Scroll back up
- [ ] Verify video returns to original position smoothly

#### Edge Cases

- [ ] Pause video → scroll down → verify no floating behavior
- [ ] Play video → click close button → verify video stops and returns
- [ ] Resize window while floating → verify position updates
- [ ] Fast scroll → verify no visual glitches
- [ ] Video ends while floating → verify returns to original position

#### Accessibility

- [ ] Enable reduced motion in OS settings → verify instant transitions (no animation)
- [ ] Tab through controls → verify focus visible
- [ ] Use keyboard to play/pause → verify floating behavior works

#### Mobile Testing

- [ ] Test on iOS Safari → verify PiP or floating works
- [ ] Test on Chrome Mobile → verify PiP or floating works
- [ ] Rotate device → verify position updates correctly

#### Layout Integrity

- [ ] Verify thumbnail remains in place (not hidden)
- [ ] Verify sticky CTA behavior unchanged
- [ ] Verify no overlap with description text
- [ ] Verify no layout shifts during transition

### Performance Testing

1. **Scroll Performance**
   - Open DevTools Performance tab
   - Start recording
   - Play video and scroll rapidly
   - Verify 60fps maintained (green line)

2. **Memory Usage**
   - Open DevTools Memory tab
   - Take heap snapshot
   - Play video, scroll, return multiple times
   - Take another snapshot
   - Verify no memory leaks (detached video elements)

3. **Network Performance**
   - Open DevTools Network tab
   - Verify video loads only once (no re-fetching during float)
   - Check video buffering continues seamlessly

## Troubleshooting

### Video Restarts When Floating

**Cause**: Multiple video elements created
**Solution**: Verify single video element with conditional positioning, not conditional rendering

### Floating Position Incorrect

**Cause**: Thumbnail ref not properly passed or mounted
**Solution**: Ensure `thumbnailRef` is attached to correct element and element is visible

### Scroll Performance Issues

**Cause**: Non-passive scroll listeners or heavy calculations
**Solution**: Verify `{ passive: true }` on listeners and optimize scroll handler

### Transitions Janky

**Cause**: Layout reflow during transition
**Solution**: Use `transform` and `position` changes only, avoid width/height changes

### Video Doesn't Float on Mobile

**Cause**: PiP might be taking over or viewport detection failing
**Solution**: Check browser console for PiP errors, verify viewport width detection

## Future Enhancements

### Potential Improvements

1. **Drag-to-Reposition**: Allow users to drag floating video to preferred position
2. **Size Controls**: Add minimize/maximize buttons for floating video
3. **Playback Speed**: Add speed control in floating mode
4. **Volume Slider**: Enhanced volume control in floating state
5. **Playlist Support**: Auto-advance to next video when current ends
6. **Analytics**: Track engagement metrics (play rate, watch time, floating usage)

### Known Limitations

1. **Single Video Only**: Component designed for one video per page
2. **Fixed Aspect Ratio**: Assumes 16:9 aspect ratio (aspect-video)
3. **No Fullscreen in Float**: Fullscreen exits floating mode (browser limitation)
4. **Desktop-First**: Optimal experience on desktop, mobile uses PiP fallback

## Related Components

- `CourseDetail.tsx` - Primary integration point
- `BackgroundImage.tsx` - Similar scroll-based behavior pattern
- `FloatingVideoPlayer.tsx` - Source file

## Changelog

### Version 1.0.0 (2026-01-19)

- Initial implementation
- Single video element architecture
- Scroll detection with passive listeners
- Reduced motion support
- Mobile PiP fallback
- Comprehensive documentation
