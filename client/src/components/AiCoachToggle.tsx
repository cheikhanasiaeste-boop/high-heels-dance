import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";

interface AiCoachToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  isReady: boolean;
  error: string | null;
}

export function AiCoachToggle({ enabled, onToggle, isReady, error }: AiCoachToggleProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  // First-time tooltip
  useEffect(() => {
    if (enabled && isReady && !localStorage.getItem("hh-coach-tooltip-seen")) {
      setShowTooltip(true);
      const timer = setTimeout(() => {
        setShowTooltip(false);
        localStorage.setItem("hh-coach-tooltip-seen", "1");
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [enabled, isReady]);

  return (
    <div className="relative flex items-center gap-3">
      <button
        onClick={() => onToggle(!enabled)}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300
          ${enabled
            ? "bg-gradient-to-r from-[#E879F9] to-[#A855F7] text-white shadow-[0_0_20px_rgba(232,121,249,0.3)]"
            : "border border-white/20 text-white/60 hover:border-white/40 hover:text-white/80"
          }
        `}
      >
        <Sparkles className="w-4 h-4" />
        {enabled ? (
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Coach Active
          </span>
        ) : (
          "Live Movement Coach"
        )}
      </button>

      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}

      {/* First-time tooltip */}
      {showTooltip && (
        <div className="absolute left-0 top-full mt-2 z-50 px-4 py-3 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 text-xs text-white/80 max-w-[260px] shadow-lg animate-in fade-in slide-in-from-top-1">
          <p className="font-medium text-white mb-1">Color Guide</p>
          <p><span className="inline-block w-2 h-2 rounded-full bg-[#22C55E] mr-1.5" />Green = good alignment</p>
          <p><span className="inline-block w-2 h-2 rounded-full bg-[#F59E0B] mr-1.5" />Amber = minor adjustment</p>
          <p><span className="inline-block w-2 h-2 rounded-full bg-[#F43F5E] mr-1.5" />Red = focus here</p>
        </div>
      )}
    </div>
  );
}
