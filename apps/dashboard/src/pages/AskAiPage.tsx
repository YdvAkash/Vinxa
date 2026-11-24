import React, { useState, useRef, useEffect } from 'react';
import { Meeting, CopilotAskResponse, CopilotChatTurn } from '../types';
import { api } from '../services/api';
import {
  Sparkles,
  Send,
  Bot,
  User,
  ArrowRight,
  RotateCcw,
  Filter,
  ShieldCheck,
  MessageSquare
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  responseMeta?: CopilotAskResponse;
}

interface AskAiPageProps {
  meetings: Meeting[];
  fixedMeeting?: Meeting;
  initialPrompt?: string | null;
  onClearInitialPrompt?: () => void;
  onSelectCitation?: (meetingId: string, segmentId?: string | null) => void;
}

const STARTER_QUESTIONS = [
  'What key decisions were confirmed across our past meetings?',
  'List all action items, who they are assigned to, and their priorities.',
  'What launch dates, milestones, or deadlines were discussed?',
  'Summarize the main discussion highlights and any open questions.'
];

function renderFormattedText(text: string) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-slate-700">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;

        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="text-violet-700 font-bold text-sm pt-2 pb-0.5">
              {trimmed.replace('### ', '')}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={idx} className="text-slate-900 font-extrabold text-base pt-2 pb-1">
              {trimmed.replace('## ', '')}
            </h3>
          );
        }

        const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ');
        const cleanLine = isBullet ? trimmed.substring(2) : trimmed;

        const parts = cleanLine.split(/(\*\*.*?\*\*|`.*?`)/g);
        const formattedParts = parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={pIdx} className="text-slate-900 font-bold">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return (
              <code
                key={pIdx}
                className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 font-mono text-xs"
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          return <span key={pIdx}>{part}</span>;
        });

        if (isBullet) {
          return (
            <div key={idx} className="flex items-start space-x-2 pl-1">
              <span className="text-violet-600 font-bold mt-0.5">•</span>
              <span className="flex-1">{formattedParts}</span>
            </div>
          );
        }

        return <p key={idx}>{formattedParts}</p>;
      })}
    </div>
  );
}

export const AskAiPage: React.FC<AskAiPageProps> = ({
  meetings,
  fixedMeeting,
  initialPrompt,
  onClearInitialPrompt
}) => {
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>(
    fixedMeeting ? fixedMeeting.id : 'ALL'
  );
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fixedMeeting) {
      setSelectedMeetingId(fixedMeeting.id);
    }
  }, [fixedMeeting]);

  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      const promptToRun = initialPrompt.trim();
      onClearInitialPrompt?.();
      handleAsk(promptToRun);
    }
  }, [initialPrompt]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleAsk = async (promptText?: string) => {
    const q = (promptText ?? question).trim();
    if (!q || isLoading) return;

    setError(null);
    if (!promptText) setQuestion('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const historyTurns: CopilotChatTurn[] = messages.map((m) => ({
      role: m.role,
      content: m.content
    }));

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const targetId = selectedMeetingId === 'ALL' ? null : selectedMeetingId;
      const res = await api.askCopilot(q, targetId, historyTurns);

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: res.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        responseMeta: res
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setError(err.message || 'Failed to get an answer from Vinxa AI Copilot.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setError(null);
  };

  const activeScopeMeeting =
    selectedMeetingId !== 'ALL'
      ? meetings.find((m) => m.id === selectedMeetingId) || fixedMeeting
      : null;

  return (
    <div className="flex flex-col h-full space-y-5">
      {/* Header Banner */}
      {!fixedMeeting && (
        <div className="p-6 rounded-3xl bg-gradient-to-r from-[#f3effe] via-[#ebe4ff] to-[#e4dcff] border border-violet-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-violet-600 text-[11px] font-extrabold uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>Vinxa AI Meeting Copilot · Powered by Google Gemini</span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Ask Anything Across Your Past Meetings
            </h1>
            <p className="text-slate-600 text-xs">
              Grounded in your real-time transcripts, confirmed decisions, and action items stored in Neon PostgreSQL.
            </p>
          </div>

          {/* Scope Selector */}
          <div className="flex items-center space-x-2.5 shrink-0">
            <div className="flex items-center space-x-2 bg-white border border-violet-200 rounded-xl px-3.5 py-2 shadow-2xs">
              <Filter className="w-3.5 h-3.5 text-violet-600 shrink-0" />
              <span className="text-xs text-slate-500 font-medium">Scope:</span>
              <select
                value={selectedMeetingId}
                onChange={(e) => setSelectedMeetingId(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none max-w-[230px]"
              >
                <option value="ALL">All Past Meetings ({meetings.length} sessions)</option>
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} ({new Date(m.createdAt).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>

            {messages.length > 0 && (
              <button
                onClick={handleClear}
                title="Clear conversation"
                className="p-2.5 rounded-xl bg-white hover:bg-violet-50 text-slate-700 border border-slate-200 transition text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Chat Container */}
      <div className="flex-1 rounded-3xl bg-white border border-slate-200/80 shadow-2xs flex flex-col overflow-hidden min-h-[480px]">
        {/* Scope status bar */}
        <div className="px-5 py-3 bg-[#fbfaff] border-b border-slate-200/70 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-slate-500">
            <ShieldCheck className="w-4 h-4 text-violet-600" />
            <span>
              Knowledge Base:{' '}
              <strong className="text-slate-800">
                {activeScopeMeeting
                  ? `Single Meeting — "${activeScopeMeeting.title}"`
                  : `All Past Meetings (${meetings.length} sessions)`}
              </strong>
            </span>
          </div>
          {fixedMeeting && messages.length > 0 && (
            <button
              onClick={handleClear}
              className="text-slate-500 hover:text-violet-700 flex items-center space-x-1 text-xs font-semibold"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Chat</span>
            </button>
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="py-8 max-w-2xl mx-auto text-center space-y-6">
              <div className="w-14 h-14 rounded-2xl bg-violet-100 border border-violet-200 flex items-center justify-center mx-auto text-violet-600 shadow-sm">
                <Bot className="w-7 h-7" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-extrabold text-slate-900">
                  {activeScopeMeeting
                    ? `Ask AI about "${activeScopeMeeting.title}"`
                    : 'What would you like to know from your past meetings?'}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  Vinxa AI analyzes your diarized transcripts, decisions, and action items to give you instant answers with verifiable speaker citations.
                </p>
              </div>

              {/* Starter Question Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left pt-2">
                {STARTER_QUESTIONS.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAsk(q)}
                    className="p-3.5 rounded-2xl bg-[#fbfaff] hover:bg-violet-50/70 border border-slate-200/80 hover:border-violet-300 transition group flex items-start justify-between gap-2 cursor-pointer"
                  >
                    <div className="flex items-start space-x-2.5">
                      <MessageSquare className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
                      <span className="text-xs text-slate-700 group-hover:text-slate-950 font-semibold leading-snug">
                        {q}
                      </span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-violet-600 shrink-0 mt-0.5 transition" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-3.5 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl bg-violet-100 border border-violet-200 flex items-center justify-center text-violet-600 shrink-0 mt-1">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-3xl rounded-2xl p-4 ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium ml-12 shadow-sm'
                      : 'bg-[#fbfaff] border border-slate-200/90 text-slate-800 mr-4 w-full'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  ) : (
                    renderFormattedText(msg.content)
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-violet-100 border border-violet-200 flex items-center justify-center text-violet-700 shrink-0 mt-1">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-xl bg-violet-100 border border-violet-200 flex items-center justify-center text-violet-600 shrink-0">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-4 rounded-2xl bg-[#fbfaff] border border-slate-200 text-xs text-slate-600 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-violet-600 animate-ping" />
                <span>
                  Analyzing meeting transcripts, decisions, and action items with Google Gemini...
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          className="p-4 bg-[#fbfaff] border-t border-slate-200/80 flex items-center gap-3"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={isLoading}
            placeholder={
              activeScopeMeeting
                ? `Ask a question about "${activeScopeMeeting.title}"...`
                : 'Ask any question across your past meetings (e.g., "What did we decide about the launch date?")...'
            }
            className="flex-1 bg-white border border-slate-200 focus:border-violet-400 rounded-xl px-4 py-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none transition"
          />
          <button
            type="submit"
            disabled={!question.trim() || isLoading}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:opacity-40 text-white font-bold text-xs flex items-center space-x-2 shadow-md shadow-violet-500/20 transition shrink-0 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Ask AI</span>
          </button>
        </form>
      </div>
    </div>
  );
};
