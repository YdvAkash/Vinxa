import React from 'react';
import { Platform } from '../../types';

interface PlatformBadgeProps {
  platform: Platform;
}

export const PlatformBadge: React.FC<PlatformBadgeProps> = ({ platform }) => {
  const getStyle = () => {
    switch (platform) {
      case 'GOOGLE_MEET':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'MICROSOFT_TEAMS':
        return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
      case 'ZOOM':
        return 'text-sky-400 bg-sky-500/10 border-sky-500/20';
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const getLabel = () => {
    switch (platform) {
      case 'GOOGLE_MEET':
        return 'Google Meet';
      case 'MICROSOFT_TEAMS':
        return 'Teams Web';
      case 'ZOOM':
        return 'Zoom Web';
      default:
        return 'Unknown';
    }
  };

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${getStyle()}`}>
      {getLabel()}
    </span>
  );
};
