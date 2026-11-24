import React, { useState } from 'react';
import { ActionItem, WebhookDispatchResult } from '../../types';
import { api } from '../../services/api';
import {
  CheckSquare,
  Square,
  Calendar,
  User,
  AlertCircle,
  Send,
  Check,
  Webhook
} from 'lucide-react';

interface ActionItemsViewProps {
  meetingId?: string;
  actionItems?: ActionItem[];
  onToggleStatus?: (id: string) => void;
  onEvidenceClick?: (segmentId: string) => void;
}

function formatDeadline(deadline: any): string | null {
  if (!deadline) return null;
  const str = String(deadline).trim();
  if (!str) return null;

  const d = new Date(str);
  if (!isNaN(d.getTime()) && str.includes('-')) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return str;
}

export function parseJiraTaskDetails(rawText: string, index: number) {
  const ticketKey = `VX-${101 + index}`;
  let cleaned = (rawText || 'Action Item Deliverable').trim();
  let issueType = 'TASK';

  const typeMatch = cleaned.match(/^\[([A-Z0-9_-]+)\]\s*(.*)$/);
  if (typeMatch) {
    issueType = typeMatch[1].replace('JIRA-', '');
    cleaned = typeMatch[2].trim();
  }

  let summary = cleaned;
  let acceptanceCriteria =
    'Complete implementation according to meeting requirements, verify functionality, and update Jira issue status.';

  const splitParts = cleaned.split(/\s*(?:—|--|-)\s*(?:Deliverable|Acceptance Criteria|Scope):\s*/i);
  if (splitParts.length >= 2) {
    summary = splitParts[0].trim();
    acceptanceCriteria = splitParts.slice(1).join(' — ').trim();
  } else if (cleaned.includes(' — ')) {
    const dashParts = cleaned.split(' — ');
    summary = dashParts[0].trim();
    acceptanceCriteria = dashParts.slice(1).join(' — ').trim();
  }

  return {
    ticketKey,
    issueType,
    summary,
    acceptanceCriteria
  };
}

export const ActionItemsView: React.FC<ActionItemsViewProps> = ({
  meetingId,
  actionItems = [],
  onToggleStatus
}) => {
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [pushedMap, setPushedMap] = useState<Record<string, WebhookDispatchResult>>({});
  const [pushErrorMap, setPushErrorMap] = useState<Record<string, string>>({});
  const [pushingAll, setPushingAll] = useState(false);
  const [pushAllSummary, setPushAllSummary] = useState<string | null>(null);

  const getPriorityBadge = (priority: string = 'MEDIUM') => {
    switch (priority.toUpperCase()) {
      case 'HIGH':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'LOW':
        return 'text-slate-600 bg-slate-100 border-slate-200';
      default:
        return 'text-amber-700 bg-amber-50 border-amber-200';
    }
  };

  const itemsList = Array.isArray(actionItems) ? actionItems : [];

  const handlePushSingle = async (item: ActionItem) => {
    const targetMeetingId = meetingId || item.meetingId;
    if (!targetMeetingId) return;
    setPushingId(item.id);
    setPushErrorMap((prev) => ({ ...prev, [item.id]: '' }));
    try {
      const res = await api.pushActionItemToWebhook(targetMeetingId, item.id);
      setPushedMap((prev) => ({ ...prev, [item.id]: res }));
      if (!res.success) {
        setPushErrorMap((prev) => ({
          ...prev,
          [item.id]: res.responseMessage || `HTTP ${res.statusCode}`
        }));
      }
    } catch (err: any) {
      setPushErrorMap((prev) => ({
        ...prev,
        [item.id]: err.message || 'Webhook dispatch failed'
      }));
    } finally {
      setPushingId(null);
    }
  };

  const handlePushAll = async () => {
    if (!meetingId || itemsList.length === 0) return;
    setPushingAll(true);
    setPushAllSummary(null);
    try {
      const res = await api.pushAllMeetingActionsToWebhook(meetingId);
      setPushAllSummary(`Dispatched ${res.succeeded}/${res.total} Jira task(s) to Webhook.`);
      const nextMap: Record<string, WebhookDispatchResult> = { ...pushedMap };
      itemsList.forEach((it, idx) => {
        if (res.results && res.results[idx]) {
          nextMap[it.id] = res.results[idx];
        }
      });
      setPushedMap(nextMap);
    } catch (err: any) {
      setPushAllSummary(`Error: ${err.message || 'Webhook dispatch failed'}`);
    } finally {
      setPushingAll(false);
    }
  };

  if (itemsList.length === 0) {
    return (
      <div className="p-10 text-center text-slate-500 bg-white border border-dashed border-slate-200 rounded-2xl space-y-2">
        <AlertCircle className="w-6 h-6 mx-auto text-violet-400" />
        <p className="text-sm font-semibold text-slate-700">
          No Jira action items extracted for this meeting.
        </p>
        <p className="text-xs text-slate-500">
          Jira tasks are generated automatically when deliverables, owners, or deadlines are discussed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 font-sans">
      {meetingId && itemsList.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center space-x-2 text-xs text-slate-600">
            <Webhook className="w-4 h-4 text-violet-600" />
            <span className="font-semibold">
              Jira Backlog Tasks Ready for Jira Automation & Azure DevOps
            </span>
          </div>
          <div className="flex items-center gap-3">
            {pushAllSummary && (
              <span className="text-xs font-bold text-emerald-700">{pushAllSummary}</span>
            )}
            <button
              type="button"
              onClick={handlePushAll}
              disabled={pushingAll}
              className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold flex items-center space-x-1.5 shadow-xs transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {pushingAll
                  ? 'Pushing All...'
                  : `Push All (${itemsList.length}) to DevOps / Jira`}
              </span>
            </button>
          </div>
        </div>
      )}

      {itemsList.map((item, idx) => {
        const isDone = (item.status || '').toUpperCase() === 'DONE';
        const rawTaskText = item.task || item.title || 'Action Item';
        const jira = parseJiraTaskDetails(rawTaskText, idx);
        const priority = (item.priority || 'MEDIUM').toUpperCase();
        const formattedDeadline = formatDeadline(item.deadline);
        const pushResult = pushedMap[item.id];
        const pushError = pushErrorMap[item.id];
        const isPushing = pushingId === item.id;

        return (
          <div
            key={item.id}
            className={`p-4 sm:p-5 rounded-2xl border transition shadow-xs ${
              isDone
                ? 'bg-slate-50 border-slate-200/70 opacity-75'
                : 'bg-white border-slate-200/90 hover:border-violet-300'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => onToggleStatus?.(item.id)}
                  title={isDone ? 'Mark Jira task as TO DO' : 'Mark Jira task as DONE'}
                  className={`mt-0.5 p-1 rounded-lg hover:bg-violet-50 transition cursor-pointer ${
                    isDone ? 'text-emerald-600' : 'text-slate-400 hover:text-violet-600'
                  }`}
                >
                  {isDone ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                </button>

                <div className="flex-1 min-w-0 space-y-2">
                  {/* Jira Ticket Header Row: Issue Key + Type + Status + Priority */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 font-mono text-[11px] font-bold">
                      <span>☑</span>
                      <span>{jira.ticketKey}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-extrabold uppercase tracking-wider">
                      {jira.issueType}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${
                        isDone
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {isDone ? 'DONE' : 'TO DO'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${getPriorityBadge(
                        priority
                      )}`}
                    >
                      {priority} PRIORITY
                    </span>
                  </div>

                  {/* Jira Issue Summary Title */}
                  <p
                    className={`text-sm sm:text-base font-extrabold break-words ${
                      isDone ? 'line-through text-slate-400' : 'text-slate-900'
                    }`}
                  >
                    {jira.summary}
                  </p>

                  {/* Jira Description / Deliverable & Acceptance Criteria Box */}
                  <div className="p-3 rounded-xl bg-[#fbfaff] border border-slate-200/70 text-xs text-slate-600 leading-relaxed">
                    <span className="font-bold text-slate-800">Deliverable & Acceptance Criteria: </span>
                    <span>{jira.acceptanceCriteria}</span>
                  </div>

                  {/* Jira Metadata Footer: Assignee & Sprint Due Date */}
                  <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-500">
                    <div className="flex items-center space-x-1.5">
                      <User className="w-3.5 h-3.5 text-violet-600" />
                      <span>Assignee:</span>
                      <span className="text-slate-800 font-bold">
                        {item.assignee || 'Unassigned'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-500" />
                      <span>Target Due:</span>
                      <span className="text-slate-800 font-semibold">
                        {formattedDeadline || 'Current Sprint'}
                      </span>
                    </div>
                  </div>

                  {pushError && (
                    <p className="mt-2 text-xs text-red-600 font-semibold">{pushError}</p>
                  )}

                  {pushResult?.success && (
                    <details className="mt-2.5 text-xs">
                      <summary className="text-emerald-700 font-bold cursor-pointer select-none">
                        ✓ Dispatched to Webhook (HTTP {pushResult.statusCode}) — View Jira Payload
                      </summary>
                      <pre className="mt-1.5 p-2.5 rounded-xl bg-slate-900 text-violet-100 text-[11px] font-mono overflow-x-auto">
                        {JSON.stringify(pushResult.payloadSent, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-start shrink-0">
                <button
                  type="button"
                  onClick={() => handlePushSingle(item)}
                  disabled={isPushing}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 border transition cursor-pointer ${
                    pushResult?.success
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-violet-50 hover:bg-violet-100 text-violet-700 border-violet-200'
                  }`}
                >
                  {pushResult?.success ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Synced to Jira</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>{isPushing ? 'Syncing...' : 'Push to Jira / DevOps'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
