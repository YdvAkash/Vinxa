import React from 'react';
import {
  Home,
  Sparkles,
  Radio,
  Calendar,
  BarChart2,
  CheckSquare,
  Settings
} from 'lucide-react';

export type NavTab =
  | 'overview'
  | 'copilot'
  | 'live'
  | 'history'
  | 'details'
  | 'action-items'
  | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isRecording?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  meetingCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isRecording,
  mobileOpen = false,
  onCloseMobile,
  meetingCount = 0
}) => {
  const navItems: {
    id: NavTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: string;
  }[] = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'copilot', label: 'Ask Vinxa AI', icon: Sparkles },
    { id: 'live', label: 'Live Session', icon: Radio, badge: isRecording ? 'LIVE' : undefined },
    {
      id: 'history',
      label: 'Meetings',
      icon: Calendar,
      badge: meetingCount > 0 ? String(meetingCount) : undefined
    },
    { id: 'details', label: 'Analysis', icon: BarChart2 },
    { id: 'action-items', label: 'Action Items', icon: CheckSquare },
    { id: 'settings', label: 'Settings & Privacy', icon: Settings }
  ];

  const handleSelect = (id: NavTab) => {
    onSelectTab(id);
    onCloseMobile?.();
  };

  const sidebarContent = (
    <div className="h-full flex flex-col p-4 bg-white select-none">
      <div className="space-y-6">
        {/* Top Brand Row */}
        <div className="flex items-center space-x-2.5 px-2 pt-1">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-violet-500/25">
            V
          </div>
          <span className="font-extrabold text-lg tracking-tight text-slate-900">Vinxa</span>
          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
            Live Intelligence
          </span>
        </div>

        {/* Navigation List */}
        <nav className="space-y-1" aria-label="Main Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            const isLiveBadge = item.badge === 'LIVE';

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition cursor-pointer ${
                  active
                    ? 'bg-violet-100/90 text-violet-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-violet-50/60'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${active ? 'text-violet-600' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </div>

                {isLiveBadge ? (
                  <span className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                    <span>LIVE</span>
                  </span>
                ) : item.badge ? (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      active
                        ? 'bg-violet-200/80 text-violet-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-60 border-r border-slate-200/80 bg-white shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile & Tablet Slide-Over Navigation Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <aside className="relative w-64 max-w-[82vw] bg-white border-r border-slate-200 h-full z-10 shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
