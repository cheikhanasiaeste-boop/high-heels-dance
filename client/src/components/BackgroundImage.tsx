import { useState, useEffect, useRef } from 'react';

interface BackgroundImageProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  prefersReducedMotion?: boolean;
  onError?: () => void;
}

/**
 * Robust background image component that:
 * - Handles any file format (webp, png, jpg, gif, mp4)
 * - Works with presigned URLs (with query parameters)
 * - Automatically detects content type
 * - Preloads assets before displaying to prevent stutter
 * - Provides fallback on error
 * - Respects reduced motion preferences
 * - Plays animated webp smoothly via video element (NOT img tag)
 * - Properly encodes URLs with spaces and special characters
 * 
 * CRITICAL: Animated webp MUST be rendered via <video> element for smooth playback.
 * Using <img> tag causes stuttering and discontinuous animation.
 * 
 * PRELOADING: Assets are preloaded before display to ensure smooth animation from start.
 * Videos wait for 'canplaythrough' event, images wait for 'load' event.
 * Preload errors are non-fatal - if preload fails, the actual element will still attempt to load.
 */

// Helper function to encode spaces and special characters in URL
// Simple approach: just replace spaces with %20 and other problematic chars
function encodeUrlProperly(url: string): string {
  try {
    // Simply replace spaces with %20
    // This is the most reliable approach for URLs that are already mostly valid
    return url.replace(/ /g, '%20');
  } catch (error) {
    console.warn('Error encoding URL, returning original:', error);
    return url;
  }
}

export function BackgroundImage({
  src,
  alt = '',
  className = '',
  style = {},
  prefersReducedMotion = false,
  onError,
}: BackgroundImageProps) {
  const [contentType, setContentType] = useState<'video' | 'image' | 'unknown'>('unknown');
  const [isLoading, setIsLoading] = useState(true);
  const [isPreloaded, setIsPreloaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!src) {
      setIsLoading(false);
      return;
    }

    // Detect content type from URL
    const detectContentType = async () => {
      try {
        // First, try to determine from URL (remove query parameters for extension check)
        const urlWithoutParams = src.split('?')[0].toLowerCase();
        
        // Check file extension
        if (urlWithoutParams.endsWith('.mp4') || urlWithoutParams.endsWith('.webm')) {
          setContentType('video');
          setIsLoading(false);
          return;
        }

        // CRITICAL: Treat webp as video for smooth animation playback
        // Animated webp rendered as img tag causes stuttering/discontinuous animation
        // Video element provides hardware-accelerated smooth continuous playback
        if (urlWithoutParams.endsWith('.webp')) {
          setContentType('video');
          setIsLoading(false);
          return;
        }

        if (
          urlWithoutParams.endsWith('.gif') ||
          urlWithoutParams.endsWith('.png') ||
          urlWithoutParams.endsWith('.jpg') ||
          urlWithoutParams.endsWith('.jpeg')
        ) {
          setContentType('image');
          setIsLoading(false);
          return;
        }

        // If extension is unclear, try HEAD request to check Content-Type header
        try {
          const response = await fetch(src, { method: 'HEAD' });
          const contentTypeHeader = response.headers.get('content-type') || '';

          if (contentTypeHeader.includes('video') || contentTypeHeader.includes('webp')) {
            setContentType('video');
          } else if (contentTypeHeader.includes('image')) {
            setContentType('image');
          } else {
            // Default to image if unclear
            setContentType('image');
          }
        } catch {
          // If HEAD fails, default to image
          setContentType('image');
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Error detecting content type:', error);
        setContentType('image');
        setIsLoading(false);
      }
    };

    detectContentType();
  }, [src]);

  // Preload video when content type is determined
  useEffect(() => {
    if (contentType === 'video' && !prefersReducedMotion && !isPreloaded) {
      const encodedSrc = encodeUrlProperly(src);
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      
      const handleCanPlayThrough = () => {
        setIsPreloaded(true);
        video.removeEventListener('canplaythrough', handleCanPlayThrough);
        video.removeEventListener('error', handlePreloadError);
      };
      
      const handlePreloadError = () => {
        console.warn('Video preload failed, will try direct loading:', encodedSrc);
        // Don't change content type - let the actual video element try loading
        // Preload is just an optimization, not a requirement
        setIsPreloaded(true);
        video.removeEventListener('canplaythrough', handleCanPlayThrough);
        video.removeEventListener('error', handlePreloadError);
      };
      
      video.addEventListener('canplaythrough', handleCanPlayThrough);
      video.addEventListener('error', handlePreloadError);
      video.src = encodedSrc;
      video.load();
      
      return () => {
        video.removeEventListener('canplaythrough', handleCanPlayThrough);
        video.removeEventListener('error', handlePreloadError);
      };
    } else if (contentType === 'image' && !isPreloaded) {
      const encodedSrc = encodeUrlProperly(src);
      const img = new Image();
      
      const handleLoad = () => {
        setIsPreloaded(true);
        img.removeEventListener('load', handleLoad);
        img.removeEventListener('error', handlePreloadError);
      };
      
      const handlePreloadError = () => {
        console.error('Image preload failed:', encodedSrc);
        setHasError(true);
        onError?.();
        img.removeEventListener('load', handleLoad);
        img.removeEventListener('error', handlePreloadError);
      };
      
      img.addEventListener('load', handleLoad);
      img.addEventListener('error', handlePreloadError);
      img.src = encodedSrc;
      
      return () => {
        img.removeEventListener('load', handleLoad);
        img.removeEventListener('error', handlePreloadError);
      };
    } else if (contentType === 'video' && prefersReducedMotion) {
      // If reduced motion is preferred, skip video preload and go straight to image
      setIsPreloaded(true);
    }
  }, [contentType, src, prefersReducedMotion, isPreloaded, onError]);

  const handleVideoError = () => {
    const encodedSrc = encodeUrlProperly(src);
    console.error('Video failed to load. Original:', src, 'Encoded:', encodedSrc);
    // Try to fall back to image rendering if video fails
    if (contentType === 'video') {
      console.log('Attempting fallback to image rendering');
      setContentType('image');
      setIsPreloaded(false); // Reset to preload as image
    } else {
      setHasError(true);
      onError?.();
    }
  };

  const handleImageError = () => {
    const encodedSrc = encodeUrlProperly(src);
    console.error('Image failed to load. Original:', src, 'Encoded:', encodedSrc);
    setHasError(true);
    onError?.();
  };

  if (hasError || !src) {
    return null;
  }

  // Show loading state while detecting content type or preloading
  if (isLoading || !isPreloaded) {
    return (
      <div 
        className={className} 
        style={{
          ...style,
          background: 'linear-gradient(135deg, rgba(219, 39, 119, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%)',
        }} 
      />
    );
  }

  // Render video for video content and webp (if not preferring reduced motion)
  if (contentType === 'video' && !prefersReducedMotion) {
    const encodedSrc = encodeUrlProperly(src);
    const isWebp = src.toLowerCase().includes('.webp');
    
    return (
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className={className}
        style={{
          ...style,
          willChange: 'transform',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
        onError={handleVideoError}
      >
        {/* Don't specify type for webp - let browser auto-detect from Content-Type header */}
        <source src={encodedSrc} type={isWebp ? undefined : 'video/mp4'} />
      </video>
    );
  }

  // Render image for all other cases (static images, gifs) or when reduced motion is preferred
  const encodedImgSrc = encodeUrlProperly(src);
  
  return (
    <img
      ref={imgRef}
      src={encodedImgSrc}
      alt={alt}
      className={className}
      style={style}
      onError={handleImageError}
      loading="eager"
      decoding="async"
    />
  );
}
