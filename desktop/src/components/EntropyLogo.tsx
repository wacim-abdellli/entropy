import React from 'react';

interface EntropyLogoProps {
  className?: string;
  size?: number;
}

export const EntropyLogo: React.FC<EntropyLogoProps> = ({ className = '', size = 32 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Main Gradient: Cyan -> Electric Blue -> Violet */}
        <linearGradient id="entropy-grad-primary" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>

        {/* Chaos Strands Gradient */}
        <linearGradient id="entropy-grad-chaos" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
          <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="1" />
        </linearGradient>

        {/* Crystalline Glow */}
        <filter id="entropy-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Chaotic Swirling Nodes Converging (Left) */}
      <path
        d="M 12 30 C 22 18, 38 22, 48 32 C 34 38, 20 48, 14 62 C 24 78, 42 74, 52 68"
        stroke="url(#entropy-grad-chaos)"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 18 20 C 30 12, 44 26, 36 42 C 26 56, 12 68, 28 82"
        stroke="url(#entropy-grad-chaos)"
        strokeWidth="2.5"
        strokeDasharray="4 3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 8 45 C 16 35, 32 40, 42 50 C 30 60, 18 68, 26 80"
        stroke="#06b6d4"
        strokeWidth="2"
        strokeOpacity="0.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Sharp Crystalline 'E' Structure (Right - Order out of Chaos) */}
      {/* Top Arm of E */}
      <path
        d="M 45 22 L 88 22 L 72 36 L 45 36 Z"
        fill="url(#entropy-grad-primary)"
        filter="url(#entropy-glow)"
      />
      
      {/* Middle Arm of E */}
      <path
        d="M 45 44 L 78 44 L 66 56 L 45 56 Z"
        fill="url(#entropy-grad-primary)"
      />

      {/* Bottom Arm of E */}
      <path
        d="M 45 64 L 88 64 L 72 78 L 45 78 Z"
        fill="url(#entropy-grad-primary)"
        filter="url(#entropy-glow)"
      />

      {/* Vertical Backbone of E (Connecting Order & Chaos) */}
      <path
        d="M 42 22 L 52 22 L 52 78 L 42 78 Z"
        fill="url(#entropy-grad-primary)"
      />

      {/* High-Tech Accent Nodes */}
      <circle cx="88" cy="22" r="2.5" fill="#38bdf8" />
      <circle cx="78" cy="44" r="2" fill="#60a5fa" />
      <circle cx="88" cy="64" r="2.5" fill="#a78bfa" />
    </svg>
  );
};
