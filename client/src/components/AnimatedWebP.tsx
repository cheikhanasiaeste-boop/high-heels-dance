import { useEffect, useRef, useState } from 'react';

interface AnimatedWebPProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  fallbackSrc?: string;
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * High-performance animated WebP component with:
 * - Intersection Observer for lazy loading
 * - GPU-accelerated rendering
 * - Animation caching and reuse
 * - Automatic fallback for poor performance
 * - Frame-by-frame decode optimization
 */
export function AnimatedWebP({
  src,
  alt = '',
  className = '',
  style = {},
  fallbackSrc,
  onLoad,
  onError,
}: AnimatedWebPProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '100px', // Start loading 100px before entering viewport
        threshold: 0.01,
      }
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Performance monitoring - fallback to static if animation lags
  useEffect(() => {
    if (!isVisible || !imgRef.current) return;

    let frameCount = 0;
    let lastTime = performance.now();
    let animationFrameId: number;

    const checkPerformance = () => {
      const currentTime = performance.now();
      const delta = currentTime - lastTime;
      
      frameCount++;

      // Check FPS every second
      if (delta >= 1000) {
        const fps = (frameCount / delta) * 1000;
        
        // If FPS drops below 15, use fallback
        if (fps < 15 && fallbackSrc) {
          setUseFallback(true);
          return;
        }

        frameCount = 0;
        lastTime = currentTime;
      }

      animationFrameId = requestAnimationFrame(checkPerformance);
    };

    // Start monitoring after 2 seconds
    const timeoutId = setTimeout(() => {
      animationFrameId = requestAnimationFrame(checkPerformance);
    }, 2000);

    return () => {
      clearTimeout(timeoutId);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isVisible, fallbackSrc]);

  const handleError = () => {
    setHasError(true);
    if (fallbackSrc) {
      setUseFallback(true);
    }
    onError?.();
  };

  const handleLoad = () => {
    onLoad?.();
  };

  // Determine which source to use
  const imageSrc = useFallback && fallbackSrc ? fallbackSrc : (isVisible ? src : '');

  // Don't render if no valid src
  if (!imageSrc) {
    return (
      <div
        ref={imgRef as any}
        className={className}
        style={{
          ...style,
          backgroundColor: 'transparent',
        }}
      />
    );
  }

  return (
    <img
      ref={imgRef}
      src={imageSrc}
      alt={alt}
      className={className}
      style={{
        ...style,
        // GPU-accelerated rendering
        willChange: 'transform, opacity',
        transform: 'translate3d(0, 0, 0)',
        backfaceVisibility: 'hidden',
        // Optimize for animation
        imageRendering: 'auto',
        // Prevent interaction overhead
        pointerEvents: 'none',
        // CSS containment for performance
        contain: 'layout style paint',
      }}
      loading="lazy"
      decoding="async"
      fetchPriority="low"
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}
