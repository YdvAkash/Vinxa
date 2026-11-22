import React, { useState } from 'react';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { Overview } from './pages/Overview';
import { LiveMeetingPage } from './pages/LiveMeetingPage';
import { MeetingDetailsPage } from './pages/MeetingDetailsPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { mockMeetings, mockTranscript } from './services/mockData';
import { Meeting } from './types';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('overview');
  const [meetings, setMeetings] = useState<Meeting[]>(mockMeetings);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(mockMeetings[0]);
  const [searchQuery, setSearchQuery] = useState('');

  const liveMeeting = meetings.find((m) => m.status === 'RECORDING') || meetings[1];

  const handleSelectMeeting = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setCurrentTab('details');
  };

  const handleStopMeeting = () => {
    setMeetings((prev) =>
      prev.map((m) =>
        m.id === liveMeeting.id
          ? { ...m, status: 'ANALYSIS_COMPLETED', endedAt: new Date().toISOString() }
          : m
      )
    );
  };

  const handleDeleteMeeting = (meetingId: string) => {
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
    if (selectedMeeting?.id === meetingId) {
      setSelectedMeeting(null);
      setCurrentTab('overview');
    }
  };

  const filteredMeetings = meetings.filter((m) =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.summary?.overview.toLowerCase().includes(searchQuery.toLowerCase())
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
            {currentTab === 'overview' && (
              <Overview
                meetings={filteredMeetings}
                onSelectMeeting={handleSelectMeeting}
                onGoToLive={() => setCurrentTab('live')}
              />
            )}

            {currentTab === 'live' && (
              <LiveMeetingPage
                meeting={liveMeeting}
                transcript={mockTranscript}
                onStopMeeting={handleStopMeeting}
              />
            )}

            {currentTab === 'details' && selectedMeeting && (
              <MeetingDetailsPage
                meeting={selectedMeeting}
                transcript={mockTranscript}
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
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
