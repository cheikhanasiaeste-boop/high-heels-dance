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
 * - Provides fallback on error
 * - Respects reduced motion preferences
 */
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

        if (
          urlWithoutParams.endsWith('.webp') ||
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

          if (contentTypeHeader.includes('video')) {
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

  const handleVideoError = () => {
    console.error('Video failed to load:', src);
    setHasError(true);
    onError?.();
  };

  const handleImageError = () => {
    console.error('Image failed to load:', src);
    setHasError(true);
    onError?.();
  };

  if (hasError || !src) {
    return null;
  }

  if (isLoading) {
    return <div className={className} style={style} />;
  }

  // Render video for video content (if not preferring reduced motion)
  if (contentType === 'video' && !prefersReducedMotion) {
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
        <source src={src} type="video/mp4" />
      </video>
    );
  }

  // Render image for all other cases (static images, gifs, webp)
  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className={className}
      style={style}
      onError={handleImageError}
      loading="eager"
      decoding="async"
    />
  );
}
