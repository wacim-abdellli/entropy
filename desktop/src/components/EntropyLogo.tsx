import React from 'react';
import logoUrl from '../assets/logo.png';

interface EntropyLogoProps {
  className?: string;
  size?: number;
}

export const EntropyLogo: React.FC<EntropyLogoProps> = ({ className = '', size = 32 }) => {
  return (
    <img
      src={logoUrl}
      alt="Entropy Logo"
      width={size}
      height={size}
      className={`select-none pointer-events-none object-contain drop-shadow-[0_0_8px_rgba(56,189,248,0.35)] ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    />
  );
};
