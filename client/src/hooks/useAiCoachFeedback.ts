import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import type { JointScore } from "@/lib/pose-comparison";

const PERIODIC_INTERVAL_S = 90; // seconds of active dance time
const THRESHOLD_RED_TICKS = 15; // 5 seconds at 3fps
const COOLDOWN_PERIODIC_S = 20;
const COOLDOWN_THRESHOLD_S = 30;
const AUTO_DISMISS_MS = 10000;

interface FeedbackInput {
  lessonId: number;
  lessonTitle: string;
  score: number;
  jointScores: JointScore[];
  isDancing: boolean;
  isActive: boolean;
  enabled: boolean;
  onFeedbackGenerated: () => void; // increment feedback count
}

interface FeedbackOutput {
  currentFeedback: string | null;
  dismissFeedback: () => void;
  isNonDance: boolean;
}

export function useAiCoachFeedback({
  lessonId, lessonTitle, score, jointScores, isDancing, isActive, enabled, onFeedbackGenerated,
}: FeedbackInput): FeedbackOutput {
  const [currentFeedback, setCurrentFeedback] = useState<string | null>(null);
  const [isNonDance, setIsNonDance] = useState(false);

  const activeTimerRef = useRef(0); // seconds of active dance since last periodic
  const cooldownRef = useRef(0); // seconds remaining in cooldown
  const redStreaksRef = useRef(new Map<string, number>()); // joint name → consecutive red ticks
  const dismissTimerRef = useRef<number | null>(null);
  const tickIntervalRef = useRef<number | null>(null);

  const generateFeedback = trpc.aiCoach.generateFeedback.useMutation();

  const dismissFeedback = useCallback(() => {
    setCurrentFeedback(null);
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const showFeedback = useCallback((text: string) => {
    setCurrentFeedback(text);
    // Auto-dismiss after 10 seconds
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = window.setTimeout(() => {
      setCurrentFeedback(null);
      dismissTimerRef.current = null;
    }, AUTO_DISMISS_MS);
  }, []);

  // Main tick — runs every 333ms (same as analysis loop) when active
  useEffect(() => {
    if (!enabled || !isActive) {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
      return;
    }

    tickIntervalRef.current = window.setInterval(() => {
      const tickSeconds = 0.333;

      // Update non-dance state
      setIsNonDance(!isDancing);

      // Don't accumulate during non-dance segments
      if (!isDancing) return;

      // Tick cooldown
      if (cooldownRef.current > 0) {
        cooldownRef.current = Math.max(0, cooldownRef.current - tickSeconds);
      }

      // Accumulate active time
      activeTimerRef.current += tickSeconds;

      // --- Threshold detection ---
      if (cooldownRef.current <= 0) {
        for (const js of jointScores) {
          const streak = redStreaksRef.current.get(js.name) || 0;
          if (js.score < 0.33) {
            const newStreak = streak + 1;
            redStreaksRef.current.set(js.name, newStreak);

            if (newStreak >= THRESHOLD_RED_TICKS) {
              // Fire threshold alert
              const durationSec = Math.round(newStreak / 3);
              generateFeedback.mutate(
                {
                  lessonId,
                  type: "threshold",
                  data: {
                    avgScore: score,
                    persistentIssue: js.name,
                    issueDurationSeconds: durationSec,
                    lessonTitle,
                  },
                },
                {
                  onSuccess: (result) => {
                    showFeedback(result.feedback);
                    onFeedbackGenerated();
                  },
                }
              );
              cooldownRef.current = COOLDOWN_THRESHOLD_S;
              redStreaksRef.current.set(js.name, 0); // reset streak
              return; // one alert at a time
            }
          } else {
            redStreaksRef.current.set(js.name, 0);
          }
        }
      }

      // --- Periodic summary ---
      if (activeTimerRef.current >= PERIODIC_INTERVAL_S && cooldownRef.current <= 0) {
        // Compute trend from recent scores
        // (scores are accumulated in useAiCoach's accumulatedStats — we derive trend from score)
        const trend = "stable"; // simplified for v1: could compare first/second half averages

        // Find best/worst joints from current jointScores
        let bestJoint = "overall form";
        let worstJoint = "keep going";
        let bestScore = 0;
        let worstScore = 1;
        for (const js of jointScores) {
          if (js.score > bestScore) { bestScore = js.score; bestJoint = js.name; }
          if (js.score < worstScore) { worstScore = js.score; worstJoint = js.name; }
        }

        generateFeedback.mutate(
          {
            lessonId,
            type: "periodic",
            data: {
              avgScore: score,
              bestJoint,
              worstJoint,
              scoreTrend: trend,
              lessonTitle,
            },
          },
          {
            onSuccess: (result) => {
              showFeedback(result.feedback);
              onFeedbackGenerated();
            },
          }
        );

        activeTimerRef.current = 0; // reset timer
        cooldownRef.current = COOLDOWN_PERIODIC_S;
      }
    }, 333);

    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    };
  }, [enabled, isActive, isDancing, score, jointScores, lessonId, lessonTitle, generateFeedback, showFeedback, onFeedbackGenerated]);

  // Reset on disable
  useEffect(() => {
    if (!enabled) {
      setCurrentFeedback(null);
      setIsNonDance(false);
      activeTimerRef.current = 0;
      cooldownRef.current = 0;
      redStreaksRef.current.clear();
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    }
  }, [enabled]);

  return { currentFeedback, dismissFeedback, isNonDance };
}
