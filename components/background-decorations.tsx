export function BackgroundDecorations() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {/* Top left - DNA helix inspired shape */}
      <svg
        className="absolute top-20 left-16 w-24 h-24 text-primary/20"
        viewBox="0 0 100 100"
        fill="none"
      >
        <circle cx="20" cy="20" r="4" fill="currentColor" />
        <circle cx="80" cy="20" r="4" fill="currentColor" />
        <circle cx="50" cy="35" r="3" fill="currentColor" />
        <circle cx="20" cy="50" r="4" fill="currentColor" />
        <circle cx="80" cy="50" r="4" fill="currentColor" />
        <circle cx="50" cy="65" r="3" fill="currentColor" />
        <circle cx="20" cy="80" r="4" fill="currentColor" />
        <circle cx="80" cy="80" r="4" fill="currentColor" />
        <path d="M20 20 Q50 35 80 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M20 50 Q50 65 80 50" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M20 80 Q50 65 80 80" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      {/* Top right - pill/capsule shapes */}
      <div className="absolute top-32 right-24">
        <div className="w-12 h-5 rounded-full bg-primary/15 rotate-45" />
        <div className="w-8 h-3 rounded-full bg-accent/20 rotate-12 mt-4 ml-6" />
      </div>

      {/* Left side - medical cross */}
      <svg
        className="absolute top-1/3 left-8 w-16 h-16 text-primary/15"
        viewBox="0 0 60 60"
        fill="none"
      >
        <rect x="22" y="5" width="16" height="50" rx="3" fill="currentColor" />
        <rect x="5" y="22" width="50" height="16" rx="3" fill="currentColor" />
      </svg>

      {/* Right side - heartbeat line */}
      <svg
        className="absolute top-1/4 right-12 w-32 h-12 text-primary/20"
        viewBox="0 0 120 40"
        fill="none"
      >
        <path
          d="M0 20 L20 20 L30 5 L40 35 L50 10 L60 25 L70 20 L120 20"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Bottom left - molecule structure */}
      <svg
        className="absolute bottom-32 left-20 w-20 h-20 text-primary/15"
        viewBox="0 0 80 80"
        fill="none"
      >
        <circle cx="40" cy="40" r="8" fill="currentColor" />
        <circle cx="15" cy="25" r="5" fill="currentColor" />
        <circle cx="65" cy="25" r="5" fill="currentColor" />
        <circle cx="20" cy="60" r="5" fill="currentColor" />
        <circle cx="60" cy="60" r="5" fill="currentColor" />
        <line x1="40" y1="40" x2="15" y2="25" stroke="currentColor" strokeWidth="2" />
        <line x1="40" y1="40" x2="65" y2="25" stroke="currentColor" strokeWidth="2" />
        <line x1="40" y1="40" x2="20" y2="60" stroke="currentColor" strokeWidth="2" />
        <line x1="40" y1="40" x2="60" y2="60" stroke="currentColor" strokeWidth="2" />
      </svg>

      {/* Bottom right - stethoscope inspired curve */}
      <svg
        className="absolute bottom-24 right-20 w-24 h-24 text-accent/25"
        viewBox="0 0 100 100"
        fill="none"
      >
        <path
          d="M20 10 C20 10 20 50 50 70 C80 90 80 50 80 50"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="80" cy="40" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
      </svg>

      {/* Floating dots scattered */}
      <div className="absolute top-48 left-1/4 w-3 h-3 rounded-full bg-primary/20" />
      <div className="absolute top-64 right-1/3 w-2 h-2 rounded-full bg-accent/25" />
      <div className="absolute bottom-48 left-1/3 w-2 h-2 rounded-full bg-primary/15" />
      <div className="absolute top-1/2 right-1/4 w-3 h-3 rounded-full bg-primary/10" />
      <div className="absolute bottom-64 right-1/3 w-2 h-2 rounded-full bg-accent/20" />

      {/* Soft circles/rings */}
      <div className="absolute top-40 right-1/3 w-16 h-16 rounded-full border-2 border-primary/10" />
      <div className="absolute bottom-40 left-1/4 w-12 h-12 rounded-full border border-accent/15" />
    </div>
  )
}
