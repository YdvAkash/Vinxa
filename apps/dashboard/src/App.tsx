import React, { useState, useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { Overview } from './pages/Overview';
import { LiveMeetingPage } from './pages/LiveMeetingPage';
import { MeetingDetailsPage } from './pages/MeetingDetailsPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { api } from './services/api';
import { Meeting } from './types';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('overview');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchMeetings = async () => {
    try {
      const data = await api.getMeetings();
      setMeetings(data);
      if (data.length > 0 && !selectedMeeting) {
        setSelectedMeeting(data[0]);
      }
    } catch (err) {
      console.warn('Backend meetings check:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
    const interval = setInterval(fetchMeetings, 10000);
    return () => clearInterval(interval);
  }, []);

  const liveMeeting = meetings.find((m) => m.status === 'RECORDING') || (meetings.length > 0 ? meetings[0] : null);

  const handleSelectMeeting = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setCurrentTab('details');
  };

  const handleCreateMeeting = async (title: string, platform: string, url: string) => {
    const newMeeting = await api.createMeeting(title, platform, url);
    await fetchMeetings();
    setSelectedMeeting(newMeeting);
    setCurrentTab('live');
  };

  const handleStopMeeting = async () => {
    if (!liveMeeting) return;
    try {
      await api.stopMeeting(liveMeeting.id);
      await fetchMeetings();
      setCurrentTab('details');
    } catch (err) {
      console.error('Stop meeting error:', err);
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    try {
      await api.deleteMeeting(meetingId);
      await fetchMeetings();
      if (selectedMeeting?.id === meetingId) {
        setSelectedMeeting(null);
        setCurrentTab('overview');
      }
    } catch (err) {
      console.error('Delete meeting error:', err);
    }
  };

  const filteredMeetings = meetings.filter((m) =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.platform.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar onSearch={(q) => setSearchQuery(q)} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          isRecording={meetings.some((m) => m.status === 'RECORDING')}
        />

        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">
            {loading && meetings.length === 0 ? (
              <div className="py-24 text-center text-slate-400 text-sm animate-pulse">
                Connecting to Vinxa Live Cloud Service...
              </div>
            ) : (
              <>
                {currentTab === 'overview' && (
                  <Overview
                    meetings={filteredMeetings}
                    onSelectMeeting={handleSelectMeeting}
                    onGoToLive={() => setCurrentTab('live')}
                    onCreateMeeting={handleCreateMeeting}
                  />
                )}

                {currentTab === 'live' && (
                  <LiveMeetingPage
                    meeting={liveMeeting}
                    onStopMeeting={handleStopMeeting}
                    onSelectAnotherMeeting={() => setCurrentTab('overview')}
                  />
                )}

                {currentTab === 'details' && selectedMeeting && (
                  <MeetingDetailsPage
                    meeting={selectedMeeting}
                    onBack={() => setCurrentTab('overview')}
                    onDelete={handleDeleteMeeting}
                  />
                )}

                {currentTab === 'history' && (
                  <HistoryPage
                    meetings={filteredMeetings}
                    onSelectMeeting={handleSelectMeeting}
                  />
                )}

                {currentTab === 'settings' && <SettingsPage />}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
