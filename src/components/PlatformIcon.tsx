import React from 'react';
import { PlatformId } from '../types';

interface PlatformIconProps {
  platform: PlatformId;
  size?: number;
  className?: string;
  variant?: 'color' | 'mono' | 'white';
}

export const PlatformIcon: React.FC<PlatformIconProps> = ({
  platform,
  size = 20,
  className = '',
  variant = 'color',
}) => {
  const iconStyle = { width: size, height: size };

  switch (platform) {
    case 'instagram':
      if (variant === 'mono') {
        return (
          <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
          </svg>
        );
      }
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" className={className}>
          <defs>
            <radialGradient id="igGrad" cx="30%" cy="107%" r="150%">
              <stop offset="0%" stopColor="#fdf497" />
              <stop offset="5%" stopColor="#fdf497" />
              <stop offset="45%" stopColor="#fd5949" />
              <stop offset="60%" stopColor="#d6249f" />
              <stop offset="90%" stopColor="#285AEB" />
            </radialGradient>
          </defs>
          <rect width="20" height="20" x="2" y="2" rx="5.5" fill="url(#igGrad)" />
          <rect width="14" height="14" x="5" y="5" rx="3.8" fill="none" stroke="#ffffff" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="3.4" fill="none" stroke="#ffffff" strokeWidth="1.6" />
          <circle cx="15.8" cy="8.2" r="0.9" fill="#ffffff" />
        </svg>
      );

    case 'facebook':
      if (variant === 'mono') {
        return (
          <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
          </svg>
        );
      }
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" className={className}>
          <circle cx="12" cy="12" r="10" fill="#1877F2" />
          <path
            d="M13.5 21.8v-7.6h2.5l.4-3h-2.9V9.3c0-.9.2-1.5 1.5-1.5h1.6V5.1c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6v7.6c1-.1 2-.1 3.1 0z"
            fill="#ffffff"
          />
        </svg>
      );

    case 'threads':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor" className={className}>
          <path d="M12.003 2c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10-4.477-10-10-10zm4.582 12.355c-.24 1.832-1.63 3.125-3.52 3.125-2.023 0-3.578-1.545-3.578-3.69 0-2.33 1.76-3.87 4.14-3.87.893 0 1.693.226 2.378.672v-.652c0-1.545-1.04-2.434-2.5-2.434-.997 0-1.84.44-2.28 1.182l-1.464-.996c.783-1.285 2.22-1.92 3.86-1.92 2.457 0 4.225 1.48 4.225 4.09v4.932h-1.84v-.439zm-3.048-2.67c-1.312 0-2.23.774-2.23 2.062 0 1.217.842 2.028 2.052 2.028 1.173 0 2.083-.774 2.223-1.875v-.865c-.567-.84-1.317-1.35-2.045-1.35z" />
        </svg>
      );

    case 'tiktok':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" className={className}>
          <g fill={variant === 'mono' ? 'currentColor' : '#000000'}>
            <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.67c0 1.95-1.59 3.535-3.54 3.535a3.543 3.543 0 0 1-3.54-3.535 3.543 3.543 0 0 1 3.54-3.535c.37 0 .723.06 1.054.17V8.76a7.027 7.027 0 0 0-1.054-.08c-3.868 0-7 3.126-7 6.985s3.132 6.985 7 6.985c3.868 0 7-3.126 7-6.985V9.43a8.212 8.212 0 0 0 4.755 1.51v-3.48a4.83 4.83 0 0 1-4.544-.774z" />
          </g>
        </svg>
      );

    case 'youtube':
      if (variant === 'mono') {
        return (
          <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
            <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="#ffffff" />
          </svg>
        );
      }
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" className={className}>
          <path
            d="M21.58 7.19a2.5 2.5 0 0 0-1.76-1.77C18.26 5 12 5 12 5s-6.26 0-7.82.42A2.5 2.5 0 0 0 2.42 7.2 26.2 26.2 0 0 0 2 12c0 1.62.14 3.23.42 4.81.24.9.95 1.6 1.76 1.81C5.74 19 12 19 12 19s6.26 0 7.82-.4c.81-.22 1.52-.92 1.76-1.81.28-1.58.42-3.19.42-4.81 0-1.62-.14-3.23-.42-4.79z"
            fill="#FF0000"
          />
          <polygon points="10 15 15.5 12 10 9" fill="#ffffff" />
        </svg>
      );

    default:
      return null;
  }
};
