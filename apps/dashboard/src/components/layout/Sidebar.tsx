import React from 'react';
import {
  Home,
  Sparkles,
  Radio,
  Calendar,
  BarChart2,
  CheckSquare,
  Settings,
  X
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
    shortLabel: string;
    icon: React.FC<{ className?: string }>;
    badge?: string;
  }[] = [
    { id: 'overview', label: 'Overview', shortLabel: 'Home', icon: Home },
    { id: 'copilot', label: 'Ask Vinxa AI', shortLabel: 'Ask AI', icon: Sparkles },
    { id: 'live', label: 'Live Session', shortLabel: 'Live', icon: Radio, badge: isRecording ? 'LIVE' : undefined },
    {
      id: 'history',
      label: 'Meetings',
      shortLabel: 'Meetings',
      icon: Calendar,
      badge: meetingCount > 0 ? String(meetingCount) : undefined
    },
    { id: 'details', label: 'Analysis', shortLabel: 'Analysis', icon: BarChart2 },
    { id: 'action-items', label: 'Action Items', shortLabel: 'Tasks', icon: CheckSquare },
    { id: 'settings', label: 'Settings & Privacy', shortLabel: 'Settings', icon: Settings }
  ];

  const mobileBottomItems = navItems.filter((item) =>
    ['overview', 'live', 'history', 'action-items', 'copilot'].includes(item.id)
  );

  const handleSelect = (id: NavTab) => {
    onSelectTab(id);
    onCloseMobile?.();
  };

  const sidebarContent = (showCloseButton = false) => (
    <div className="h-full flex flex-col justify-between p-4 bg-white select-none overflow-y-auto">
      <div className="space-y-6">
        {/* Top Brand Row */}
        <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-violet-500/25 shrink-0">
              V
            </div>
            <span className="font-extrabold text-lg tracking-tight text-slate-900">Vinxa</span>
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 truncate">
              Live Intelligence
            </span>
          </div>
          {showCloseButton && onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation drawer"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
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
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-[13px] font-semibold transition cursor-pointer ${
                  active
                    ? 'bg-violet-100/90 text-violet-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-violet-50/60'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-violet-600' : 'text-slate-500'}`} />
                  <span className="truncate">{item.label}</span>
                </div>

                {isLiveBadge ? (
                  <span className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 text-[10px] font-bold shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                    <span>LIVE</span>
                  </span>
                ) : item.badge ? (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
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
        {sidebarContent(false)}
      </aside>

      {/* Mobile & Tablet Slide-Over Navigation Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white border-r border-slate-200 h-full z-10 shadow-2xl">
            {sidebarContent(true)}
          </aside>
        </div>
      )}

      {/* Mobile & Tablet Bottom Quick Navigation Bar */}
      <nav
        aria-label="Mobile quick navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-2 py-1.5 flex items-center justify-around shadow-lg"
      >
        {mobileBottomItems.map((item) => {
          const Icon = item.icon;
          const active = currentTab === item.id;
          const isLiveBadge = item.badge === 'LIVE';
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`relative flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl min-w-[56px] transition cursor-pointer ${
                active ? 'text-violet-700 bg-violet-50/90 font-bold' : 'text-slate-500 hover:text-slate-900 font-semibold'
              }`}
            >
              <div className="relative">
                <Icon className={`w-4 h-4 ${active ? 'text-violet-600' : 'text-slate-500'}`} />
                {isLiveBadge && (
                  <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-red-500 animate-ping" />
                )}
              </div>
              <span className="text-[10px] mt-1 leading-none truncate">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
