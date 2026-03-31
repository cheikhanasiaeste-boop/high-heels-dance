import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface HlsPlayerProps {
  /** HLS m3u8 URL or direct video URL */
  src: string;
  /** 'hls' for adaptive streaming, 'direct' for plain mp4 */
  type: "hls" | "direct";
  /** Poster/thumbnail image */
  poster?: string | null;
  /** Resume playback from this time (seconds) */
  initialTime?: number;
  /** Callback with current playback time in seconds */
  onTimeUpdate?: (currentTime: number) => void;
  /** Callback when video ends */
  onEnded?: () => void;
  className?: string;
}

export function HlsPlayer({
  src,
  type,
  poster,
  initialTime,
  onTimeUpdate,
  onEnded,
  className = "",
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const seekedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Resume from saved position once metadata is loaded
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !initialTime || initialTime <= 0) return;
    seekedRef.current = false;

    const handleCanPlay = () => {
      if (!seekedRef.current && initialTime > 0) {
        video.currentTime = initialTime;
        seekedRef.current = true;
      }
    };
    video.addEventListener("canplay", handleCanPlay);
    return () => video.removeEventListener("canplay", handleCanPlay);
  }, [initialTime, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);
    seekedRef.current = false;

    // Direct MP4 — just set src
    if (type === "direct") {
      video.src = src;
      return;
    }

    // HLS — use hls.js if native HLS not supported (most browsers except Safari)
    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startLevel: -1, // auto quality selection
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (_event: string, data: { fatal: boolean; type: string }) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error("[HlsPlayer] Network error, attempting recovery...");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error("[HlsPlayer] Media error, attempting recovery...");
              hls.recoverMediaError();
              break;
            default:
              console.error("[HlsPlayer] Fatal error:", data);
              setError("Video playback failed. Please try refreshing the page.");
              hls.destroy();
              break;
          }
        }
      });

      hlsRef.current = hls;

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      video.src = src;
    } else {
      setError("Your browser does not support video playback.");
    }
  }, [src, type]);

  const handleTimeUpdate = () => {
    if (videoRef.current && onTimeUpdate) {
      onTimeUpdate(videoRef.current.currentTime);
    }
  };

  if (error) {
    return (
      <div className={`aspect-video bg-black rounded-lg flex items-center justify-center ${className}`}>
        <p className="text-white/60 text-sm px-6 text-center">{error}</p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      controls
      controlsList="nodownload"
      playsInline
      poster={poster || undefined}
      onTimeUpdate={handleTimeUpdate}
      onEnded={onEnded}
      className={`w-full h-full ${className}`}
    />
  );
}
