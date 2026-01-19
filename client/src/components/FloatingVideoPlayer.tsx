import { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FloatingVideoPlayerProps {
  videoUrl: string;
  posterUrl?: string;
  thumbnailContainerRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

/**
 * FloatingVideoPlayer - Elegant continuous video viewing while scrolling
 * 
 * Architecture:
 * - Single video element that physically repositions (no cloning = seamless playback)
 * - CSS transforms for GPU-accelerated smooth transitions
 * - Monitors play state + scroll position
 * 
 * Behavior:
 * - Original video scrolled out of view → floats to thumbnail position (regardless of play state)
 * - Scroll back up → returns to original position
 * - Video stays in thumbnail position when paused while floating
 * - Close button → stops video, scrolls back to original position
 * 
 * Performance:
 * - Smooth 500ms transitions with Material Design easing
 * - Separate property timing for refined motion
 * - Passive scroll listeners for 60fps scrolling
 * - Respects reduced-motion preferences
 * - Mobile picture-in-picture fallback
 * 
 * Layout:
 * - Floating video replaces thumbnail position exactly
 * - Does not overlap description or CTA
 * - Maintains all existing sticky behaviors
 */
export function FloatingVideoPlayer({
  videoUrl,
  posterUrl,
  thumbnailContainerRef,
  className = '',
}: FloatingVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const originalContainerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFloating, setIsFloating] = useState(false);
  const [floatingStyle, setFloatingStyle] = useState<React.CSSProperties>({});
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Detect reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Monitor video play/pause state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

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

  // Calculate floating position
  const calculateFloatingPosition = useCallback(() => {
    const originalContainer = originalContainerRef.current;
    const thumbnailContainer = thumbnailContainerRef.current;
    if (!originalContainer || !thumbnailContainer) return null;

    const originalRect = originalContainer.getBoundingClientRect();
    const thumbnailRect = thumbnailContainer.getBoundingClientRect();
    
    // Check if original video is out of view (scrolled past)
    const isOutOfView = originalRect.bottom < 0;
    
    return {
      isOutOfView,
      thumbnailRect,
    };
  }, [thumbnailContainerRef]);

  // Scroll detection and floating logic
  // Now independent of play state - video stays in thumbnail position when scrolled down
  useEffect(() => {
    const handleScroll = () => {
      const position = calculateFloatingPosition();
      if (!position) return;

      const { isOutOfView, thumbnailRect } = position;
      
      if (isOutOfView && !isFloating) {
        // Transition to floating mode - position at thumbnail
        // This happens regardless of play state
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
        // Return to original position when scrolling back up
        setIsFloating(false);
        setFloatingStyle({});
      } else if (isFloating) {
        // Update position if already floating (handles resize, scroll changes)
        // Keep video visible if thumbnail goes off bottom of viewport
        const viewportHeight = window.innerHeight;
        const thumbnailBottom = thumbnailRect.bottom;
        const thumbnailTop = thumbnailRect.top;
        
        // If thumbnail is going off the bottom of viewport, clamp video position
        let finalTop = thumbnailRect.top;
        if (thumbnailBottom > viewportHeight) {
          // Thumbnail is partially or fully below viewport
          // Keep video at bottom of viewport with some padding
          finalTop = viewportHeight - thumbnailRect.height - 16; // 16px padding from bottom
        } else if (thumbnailTop < 0) {
          // Thumbnail is going off the top (shouldn't happen but handle it)
          finalTop = 16; // 16px padding from top
        }
        
        setFloatingStyle(prev => ({
          ...prev,
          top: `${finalTop}px`,
          left: `${thumbnailRect.left}px`,
          width: `${thumbnailRect.width}px`,
          height: `${thumbnailRect.height}px`,
        }));
      }
    };

    // Use passive listeners for better scroll performance
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    
    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isFloating, calculateFloatingPosition]);

  // Handle close - pause video and return to original position
  const handleClose = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsFloating(false);
    setFloatingStyle({});
    
    // Scroll back to original video position for better UX
    if (originalContainerRef.current) {
      originalContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Mobile picture-in-picture support
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isFloating) return;

    // On mobile, prefer native PiP if available
    if ('pictureInPictureEnabled' in document && window.innerWidth < 1024) {
      const enablePiP = async () => {
        try {
          if (document.pictureInPictureElement !== video) {
            await video.requestPictureInPicture();
          }
        } catch (err) {
          // PiP not supported or denied, continue with floating behavior
        }
      };
      enablePiP();
    }

    return () => {
      if (document.pictureInPictureElement === video) {
        document.exitPictureInPicture().catch(() => {});
      }
    };
  }, [isFloating]);

  // Enhanced transition timing for smoother, more premium feel
  const transitionDuration = prefersReducedMotion ? '0ms' : '500ms';
  const transitionEasing = 'cubic-bezier(0.4, 0.0, 0.2, 1)'; // Material Design standard easing

  return (
    <div 
      ref={originalContainerRef}
      className={`aspect-video bg-gradient-to-br from-purple-900 to-pink-900 rounded-lg overflow-hidden shadow-xl relative ${className}`}
      style={{
        // When floating, leave placeholder in original position
        ...(isFloating ? {} : {}),
      }}
    >
      {/* Single video element that repositions */}
      <div
        className="rounded-lg overflow-hidden"
        style={{
          ...(isFloating ? floatingStyle : {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }),
          transition: prefersReducedMotion 
            ? 'none' 
            : `
              top ${transitionDuration} ${transitionEasing},
              left ${transitionDuration} ${transitionEasing},
              width ${transitionDuration} ${transitionEasing},
              height ${transitionDuration} ${transitionEasing},
              box-shadow ${transitionDuration} ${transitionEasing},
              opacity 200ms ease-in-out
            `,
          ...(isFloating ? { 
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          } : {}),
        }}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          preload="metadata"
          poster={posterUrl}
          className="w-full h-full object-cover"
        >
          Your browser does not support the video tag.
        </video>

        {/* Floating controls overlay - only show when floating */}
        {isFloating && (
          <div className="absolute top-2 right-2 z-10">
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/20 shadow-lg"
              onClick={handleClose}
              aria-label="Close floating video"
            >
              <X className="h-4 w-4 text-white" />
            </Button>
          </div>
        )}
      </div>

      {/* Placeholder when video is floating - maintains layout */}
      {isFloating && (
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 to-pink-900/20 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Video playing above</p>
        </div>
      )}
    </div>
  );
}
