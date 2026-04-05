interface AiCoachScoreWheelProps {
  score: number; // 0-100
}

export function AiCoachScoreWheel({ score }: AiCoachScoreWheelProps) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;
  const isExcellent = score > 85;

  // Color based on score
  const strokeColor =
    score >= 70 ? "#E879F9" :
    score >= 40 ? "#F59E0B" :
    "#F43F5E";

  return (
    <div
      className={`
        absolute top-3 right-3 z-20
        w-16 h-16 rounded-full
        bg-black/40 backdrop-blur-md
        flex items-center justify-center
        transition-all duration-300
        ${isExcellent ? "shadow-[0_0_24px_rgba(232,121,249,0.4)]" : ""}
      `}
    >
      <svg width="64" height="64" className="absolute inset-0">
        {/* Background track */}
        <circle
          cx="32" cy="32" r={radius}
          fill="none" stroke="white" strokeOpacity="0.1"
          strokeWidth="3"
        />
        {/* Progress arc */}
        <circle
          cx="32" cy="32" r={radius}
          fill="none" stroke={strokeColor}
          strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 32 32)"
          style={{ transition: "stroke-dashoffset 300ms ease, stroke 300ms ease" }}
        />
      </svg>
      <span className="text-white font-bold text-base z-10">{score}</span>
    </div>
  );
}
