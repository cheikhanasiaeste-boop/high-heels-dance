import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";

interface AiCoachFeedbackProps {
  feedback: string | null;
  onDismiss: () => void;
  isNonDance: boolean;
}

export function AiCoachFeedback({ feedback, onDismiss, isNonDance }: AiCoachFeedbackProps) {
  return (
    <>
      {/* Non-dance indicator */}
      {isNonDance && !feedback && (
        <div className="absolute top-3 left-3 z-20 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm">
          <span className="text-[11px] text-white/40 italic">Listening...</span>
        </div>
      )}

      {/* Feedback speech bubble */}
      <AnimatePresence mode="wait">
        {feedback && (
          <motion.div
            key={feedback}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="absolute top-3 left-3 z-20 max-w-[280px] bg-black/60 backdrop-blur-md rounded-2xl border border-[#E879F9]/20 p-3 pr-8"
          >
            {/* Header */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3 h-3 text-[#E879F9]" />
              <span className="text-[10px] font-medium text-[#E879F9]">Elizabeth</span>
            </div>

            {/* Feedback text */}
            <p className="text-[13px] text-white/90 leading-relaxed">
              {feedback}
            </p>

            {/* Dismiss button */}
            <button
              onClick={onDismiss}
              className="absolute top-2 right-2 p-1 text-white/30 hover:text-white/60 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
