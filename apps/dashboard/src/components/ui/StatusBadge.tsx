import React from 'react';
import { MeetingStatus } from '../../types';

interface StatusBadgeProps {
  status: MeetingStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getBadgeConfig = () => {
    switch (status) {
      case 'RECORDING':
        return {
          bg: 'bg-red-500/10 text-red-400 border-red-500/20',
          dot: 'bg-red-500 animate-pulse',
          label: 'Recording'
        };
      case 'ANALYSIS_COMPLETED':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          dot: 'bg-emerald-500',
          label: 'Analyzed'
        };
      case 'ANALYSIS_PENDING':
      case 'FINALIZING':
      case 'STOPPING':
        return {
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          dot: 'bg-amber-500 animate-spin',
          label: 'Processing'
        };
      case 'COMPLETED':
        return {
          bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          dot: 'bg-blue-500',
          label: 'Completed'
        };
      case 'CONSENT_REQUIRED':
        return {
          bg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
          dot: 'bg-purple-500',
          label: 'Consent Needed'
        };
      default:
        return {
          bg: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
          dot: 'bg-slate-500',
          label: status
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${config.dot}`} />
      {config.label}
    </span>
  );
};
