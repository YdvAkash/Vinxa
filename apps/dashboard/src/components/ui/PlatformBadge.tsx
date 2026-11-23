import React from 'react';
import { Platform } from '../../types';
import meetIconUrl from '../../assets/meet_icon.png';
import teamsIconUrl from '../../assets/teams_icon.png';
import zoomIconUrl from '../../assets/zoom_icon.png';

interface PlatformBadgeProps {
  platform: Platform;
}

export const getPlatformIconUrl = (platform: Platform): string => {
  switch (platform) {
    case 'GOOGLE_MEET':
      return meetIconUrl;
    case 'MICROSOFT_TEAMS':
      return teamsIconUrl;
    case 'ZOOM':
    default:
      return zoomIconUrl;
  }
};

export const PlatformIcon: React.FC<{ platform: Platform; className?: string }> = ({
  platform,
  className = 'w-8 h-8'
}) => {
  const iconUrl = getPlatformIconUrl(platform);
  const title =
    platform === 'GOOGLE_MEET'
      ? 'Google Meet'
      : platform === 'MICROSOFT_TEAMS'
      ? 'Microsoft Teams'
      : 'Zoom';

  return (
    <div
      className={`${className} rounded-xl bg-white border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs p-1.5`}
      title={title}
    >
      <img src={iconUrl} alt={title} className="w-full h-full object-contain" />
    </div>
  );
};

export const PlatformBadge: React.FC<PlatformBadgeProps> = ({ platform }) => {
  const getStyle = () => {
    switch (platform) {
      case 'GOOGLE_MEET':
        return 'text-emerald-700 bg-emerald-50 border-emerald-200/80';
      case 'MICROSOFT_TEAMS':
        return 'text-indigo-700 bg-indigo-50 border-indigo-200/80';
      case 'ZOOM':
        return 'text-sky-700 bg-sky-50 border-sky-200/80';
      default:
        return 'text-slate-600 bg-slate-100 border-slate-200';
    }
  };

  const getLabel = () => {
    switch (platform) {
      case 'GOOGLE_MEET':
        return 'Google Meet';
      case 'MICROSOFT_TEAMS':
        return 'Teams';
      case 'ZOOM':
        return 'Zoom';
      default:
        return 'Meeting';
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border ${getStyle()}`}
    >
      {getLabel()}
    </span>
  );
};
