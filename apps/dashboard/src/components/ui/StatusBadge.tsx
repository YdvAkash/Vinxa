import React from 'react';
import { MeetingStatus } from '../../types';
import { Check } from 'lucide-react';

interface StatusBadgeProps {
  status: MeetingStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getBadgeConfig = () => {
    switch (status) {
      case 'RECORDING':
        return {
          bg: 'bg-red-50 text-red-600 border-red-200',
          dot: 'bg-red-500 animate-pulse',
          label: 'Live Recording',
          showCheck: false
        };
      case 'ANALYSIS_COMPLETED':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
          dot: 'bg-emerald-500',
          label: 'Analyzed',
          showCheck: true
        };
      case 'ANALYSIS_PENDING':
      case 'FINALIZING':
      case 'STOPPING':
        return {
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          dot: 'bg-amber-500 animate-spin',
          label: 'Processing',
          showCheck: false
        };
      case 'COMPLETED':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
          dot: 'bg-emerald-500',
          label: 'Analyzed',
          showCheck: true
        };
      case 'CONSENT_REQUIRED':
        return {
          bg: 'bg-violet-50 text-violet-700 border-violet-200',
          dot: 'bg-violet-500',
          label: 'Consent Needed',
          showCheck: false
        };
      default:
        return {
          bg: 'bg-slate-100 text-slate-600 border-slate-200',
          dot: 'bg-slate-400',
          label: status,
          showCheck: false
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${config.bg}`}
    >
      {config.showCheck ? (
        <Check className="w-3 h-3 mr-1 text-emerald-600 stroke-[2.5]" />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${config.dot}`} />
      )}
      {config.label}
    </span>
  );
};
