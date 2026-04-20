import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import { useQuery } from '@tanstack/react-query';

// ── Types ───────────────────────────────────────────────────────────────────

interface BriefingSale {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  entranceNote: string | null;
  cashFloat: number | null;
  status: string;
  saleType: string;
}

interface TeamMemberInfo {
  id: string;
  teamMemberId: string;
  name: string;
  role: string;
  teamRole: string;
  department: string | null;
  ownsArea: string | null;
  status: string;
  eta: string | null;
  lastSeenAt: string | null;
  avatarInitial: string;
}

interface PrepTaskInfo {
  id: string;
  title: string;
  assigneeId: string | null;
  done: boolean;
  doneAt: string | null;
  urgent: boolean;
  sortOrder: number;
  phase: string;
  checklistItemId: string | null;
}

interface BriefingData {
  sale: BriefingSale;
  rsvpCount: number;
  team: TeamMemberInfo[];
  prep: { total: number; done: number; tasks: PrepTaskInfo[] };
  lastChatMessage: { content: string; author: string; createdAt: string } | null;
}

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  organizer: { id: string; businessName: string };
}

interface MorningBriefingProps {
  briefing: BriefingData;
  workspaceId: string;
  workspaceName: string;
  onExitBriefing?: () => void;
}

// ── Constants ───────────────────────────────────────────────────────────────

const COLORS = {
  paper: '#F4EFE6',
  ink: '#1E2A24',
  sage: '#5E7A5A',
  coral: '#C5634A',
  amber: '#C79A3F',
  card: '#FBF8F2',
  line: 'rgba(30,42,36,0.10)',
  purple: '#7A6B8E',
  teal: '#4A7B8C',
} as const;

const AVATAR_COLORS = [COLORS.sage, COLORS.coral, COLORS.amber, COLORS.purple, COLORS.teal];

const STATUS_COLORS: Record<string, string> = {
  ON_SITE: COLORS.sage,
  EN_ROUTE: COLORS.amber,
  RUNNING_LATE: COLORS.coral,
  CONFIRMED: COLORS.purple,
};

const STATUS_LABELS: Record<string, string> = {
  ON_SITE: 'On site',
  EN_ROUTE: 'En route',
  RUNNING_LATE: 'Running late',
  CONFIRMED: 'Confirmed',
};

// ── Weather approximation (Grand Rapids, MI by month) ─────────────────────

function getApproxWeather(dateStr: string): { tempHigh: number; condition: string; icon: string } | null {
  const month = new Date(dateStr).getMonth();
  const data: Record<number, { tempHigh: number; condition: string; icon: string }> = {
    0: { tempHigh: 31, condition: 'Cold & snowy', icon: '❄️' },
    1: { tempHigh: 34, condition: 'Cold & snowy', icon: '❄️' },
    2: { tempHigh: 45, condition: 'Chilly', icon: '🌥️' },
    3: { tempHigh: 58, condition: 'Cool', icon: '🌤️' },
    4: { tempHigh: 70, condition: 'Mild', icon: '☀️' },
    5: { tempHigh: 79, condition: 'Warm', icon: '☀️' },
    6: { tempHigh: 83, condition: 'Hot', icon: '☀️' },
    7: { tempHigh: 81, condition: 'Warm', icon: '⛅' },
    8: { tempHigh: 74, condition: 'Pleasant', icon: '🌤️' },
    9: { tempHigh: 61, condition: 'Cool', icon: '🍂' },
    10: { tempHigh: 47, condition: 'Chilly', icon: '🌥️' },
    11: { tempHigh: 34, condition: 'Cold', icon: '❄️' },
  };
  return data[month] || null;
}

// ── Team role labels ──────────────────────────────────────────────────────

const TEAM_ROLE_LABELS: Record<string, string> = {
  MANAGER: 'Manager',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
  OWNER: 'Owner',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCountdown(startDate: string): { label: string; state: 'upcoming' | 'open' | 'ended' } {
  const now = Date.now();
  const start = new Date(startDate).getTime();
  const diff = start - now;

  if (diff <= 0) {
    return { label: 'DOORS OPEN', state: 'open' };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours === 0) {
    return { label: `${minutes} min`, state: 'upcoming' };
  }
  return { label: `${hours} hr ${String(minutes).padStart(2, '0')} min`, state: 'upcoming' };
}

function formatCashFloat(cents: number | null): string {
  if (cents === null || cents === undefined) return '--';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatAddress(sale: BriefingSale): string {
  return `${sale.address}, ${sale.city}, ${sale.state} ${sale.zip}`;
}

function mapsUrl(sale: BriefingSale): string {
  const q = encodeURIComponent(formatAddress(sale));
  return `https://maps.google.com/?q=${q}`;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Countdown({ startDate }: { startDate: string }) {
  const [countdown, setCountdown] = useState(() => formatCountdown(startDate));

  useEffect(() => {
    const id = setInterval(() => setCountdown(formatCountdown(startDate)), 30000);
    return () => clearInterval(id);
  }, [startDate]);

  if (countdown.state === 'open') {
    return (
      <div className="text-center py-6">
        <div className="font-serif text-5xl font-medium text-sage-600 dark:text-sage-400" style={{ letterSpacing: -1 }}>
          {countdown.label}
        </div>
      </div>
    );
  }

  const parts = countdown.label.split(' ');
  return (
    <div className="py-6">
      <div className="text-xs font-medium tracking-widest text-gray-500 dark:text-gray-400 uppercase mb-2">
        Doors open in
      </div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        {parts.map((part, i) => {
          const isNum = /^\d+$/.test(part);
          return (
            <span
              key={i}
              className={isNum
                ? 'font-serif text-[80px] font-medium text-warm-900 dark:text-warm-100 leading-none'
                : 'font-sans text-xl italic text-gray-500 dark:text-gray-400 leading-none'}
              style={isNum ? { letterSpacing: -3 } : undefined}
            >
              {part}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function VitalsStrip({ rsvpCount, cashFloat, startDate }: { rsvpCount: number; cashFloat: number | null; startDate: string }) {
  const weather = getApproxWeather(startDate);
  const weatherLabel = weather ? `${weather.icon} ${weather.tempHigh}°F` : '--°F';
  const pills = [
    { label: weatherLabel, sublabel: weather?.condition || 'Weather' },
    { label: String(rsvpCount), sublabel: 'RSVPs' },
    { label: formatCashFloat(cashFloat), sublabel: 'Cash float' },
  ];

  return (
    <div className="flex gap-2.5 flex-wrap my-4">
      {pills.map((pill) => (
        <div
          key={pill.sublabel}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 flex-1 min-w-[90px] text-center"
        >
          <div className="font-serif text-[22px] font-medium text-warm-900 dark:text-warm-100">{pill.label}</div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{pill.sublabel}</div>
        </div>
      ))}
    </div>
  );
}

function PrepThermometer({
  tasks,
  onToggle,
  onAddTask,
}: {
  tasks: PrepTaskInfo[];
  onToggle: (taskId: string, currentDone: boolean) => void;
  onAddTask: (title: string, urgent: boolean) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrgent, setNewUrgent] = useState(false);

  const handleSubmit = () => {
    if (!newTitle.trim()) return;
    onAddTask(newTitle.trim(), newUrgent);
    setNewTitle('');
    setNewUrgent(false);
    setShowAdd(false);
  };

  const doneCount = tasks.filter((t) => t.done).length;
  const urgentIncomplete = tasks.filter((t) => t.urgent && !t.done);
  const nonUrgentIncomplete = tasks.filter((t) => !t.urgent && !t.done);

  return (
    <div className="my-5">
      {/* Section heading + add button */}
      <div className="flex items-center justify-between mb-3">
        <div className="font-serif text-lg font-medium text-warm-900 dark:text-warm-100">
          Prep
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-sm font-medium px-3 py-1.5 rounded-full border border-sage-500 dark:border-sage-400 text-sage-600 dark:text-sage-400 hover:bg-sage-50 dark:hover:bg-sage-900/20 transition"
        >
          {showAdd ? 'Cancel' : '+ Add task'}
        </button>
      </div>

      {/* Add task form */}
      {showAdd && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-4">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder="Task name..."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-warm-900 dark:text-warm-100 text-sm outline-none focus:ring-2 focus:ring-sage-500 mb-3"
            autoFocus
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={newUrgent}
                onChange={(e) => setNewUrgent(e.target.checked)}
                className="accent-coral-500"
              />
              Urgent (before doors open)
            </label>
            <button
              onClick={handleSubmit}
              disabled={!newTitle.trim()}
              className="px-4 py-2 rounded-full bg-sage-600 text-white text-sm font-medium disabled:opacity-50 hover:bg-sage-700 transition"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {tasks.length === 0 && !showAdd && (
        <div className="py-4 text-gray-500 dark:text-gray-400 text-sm italic">
          No prep tasks yet — tap &quot;+ Add task&quot; to get started
        </div>
      )}

      {tasks.length > 0 && (
        <>
          {/* Segmented bar */}
          <div className="flex gap-1 mb-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`flex-1 h-3.5 rounded-sm ${
                  task.done
                    ? 'bg-sage-500 dark:bg-sage-600'
                    : task.urgent
                    ? 'bg-red-200 dark:bg-red-900/30 border border-red-300 dark:border-red-700'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
                title={task.title}
              />
            ))}
          </div>

          {/* Fraction */}
          <div className="text-[13px] text-gray-500 dark:text-gray-400 mb-4">
            {doneCount} of {tasks.length} ready
          </div>

          {/* Urgent incomplete panel */}
          {urgentIncomplete.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3.5 mb-3">
              <div className="text-[13px] font-semibold text-red-600 dark:text-red-400 mb-2.5 uppercase tracking-wider">
                Before doors open
              </div>
              {urgentIncomplete.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={onToggle} />
              ))}
            </div>
          )}

          {/* Non-urgent incomplete */}
          {nonUrgentIncomplete.length > 0 && (
            <div className="opacity-60">
              {nonUrgentIncomplete.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={onToggle} />
              ))}
            </div>
          )}

          {/* Done tasks (collapsed) */}
          {doneCount > 0 && (
            <div className="opacity-40 mt-2">
              {tasks.filter((t) => t.done).map((task) => (
                <TaskRow key={task.id} task={task} onToggle={onToggle} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TaskRow({ task, onToggle }: { task: PrepTaskInfo; onToggle: (id: string, done: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 py-2 cursor-pointer min-h-[44px]">
      <input
        type="checkbox"
        checked={task.done}
        onChange={() => onToggle(task.id, task.done)}
        className="w-5 h-5 accent-sage-600 cursor-pointer flex-shrink-0"
        aria-label={`Mark "${task.title}" as ${task.done ? 'incomplete' : 'complete'}`}
      />
      <span className={`text-sm text-warm-900 dark:text-warm-100 flex-1 ${task.done ? 'line-through' : ''}`}>
        {task.title}
      </span>
      {task.urgent && !task.done && (
        <span className="text-[11px] text-red-600 dark:text-red-400 font-semibold">URGENT</span>
      )}
    </label>
  );
}

function TeamRoster({
  team,
  currentUserId,
  currentOrganizerId,
  saleId,
  workspaceId,
  onStatusUpdate,
}: {
  team: TeamMemberInfo[];
  currentUserId: string | undefined;
  currentOrganizerId: string | undefined;
  saleId: string;
  workspaceId: string;
  onStatusUpdate: (status: string) => void;
}) {
  return (
    <div className="my-5">
      <div className="font-serif text-lg font-medium text-warm-900 dark:text-warm-100 mb-3">
        Team
      </div>
      {team.map((member, idx) => (
        <TeamCard
          key={member.id}
          member={member}
          colorIndex={idx}
          isSelf={false}
          onStatusUpdate={onStatusUpdate}
        />
      ))}
      {team.length === 0 && (
        <div className="text-gray-500 dark:text-gray-400 text-sm italic py-2">
          No team assignments yet
        </div>
      )}
    </div>
  );
}

function TeamCard({
  member,
  colorIndex,
  isSelf,
  onStatusUpdate,
}: {
  member: TeamMemberInfo;
  colorIndex: number;
  isSelf: boolean;
  onStatusUpdate: (status: string) => void;
}) {
  const avatarColor = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  const statusColor = STATUS_COLORS[member.status] || COLORS.purple;
  const roleLabel = TEAM_ROLE_LABELS[member.teamRole] || member.teamRole;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-200 dark:border-gray-700">
      {/* Avatar */}
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: avatarColor }}
      >
        <span className="font-serif text-xl font-medium text-white">
          {member.avatarInitial}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-warm-900 dark:text-warm-100">{member.name}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{roleLabel}</span>
          {member.department && (
            <span className="text-xs text-gray-400 dark:text-gray-500">· {member.department}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className="w-2 h-2 rounded-full inline-block flex-shrink-0"
            style={{ background: statusColor }}
          />
          <span className="text-[13px] font-medium" style={{ color: statusColor }}>
            {STATUS_LABELS[member.status] || member.status}
          </span>
          {member.status === 'EN_ROUTE' && member.eta && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              · ETA {new Date(member.eta).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>
        {member.ownsArea && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Owns: {member.ownsArea}
          </div>
        )}
      </div>

      {/* Message button */}
      <button
        className="w-11 h-11 rounded-full border border-gray-200 dark:border-gray-600 bg-transparent cursor-pointer flex items-center justify-center flex-shrink-0 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        aria-label={`Message ${member.name}`}
        title={`Message ${member.name}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-warm-900 dark:text-warm-100">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </div>
  );
}

function ChatPanel({
  workspaceId,
  saleId,
  isSheet,
  onClose,
}: {
  workspaceId: string;
  saleId: string;
  isSheet?: boolean;
  onClose?: () => void;
}) {
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: chatData, refetch } = useQuery({
    queryKey: ['briefing-chat', workspaceId, saleId],
    queryFn: async () => {
      const { data } = await api.get(`/workspace/${workspaceId}/sales/${saleId}/chat`);
      return data as { messages: ChatMessage[] };
    },
    refetchInterval: 10000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatData?.messages]);

  const handleSend = async () => {
    if (!messageInput.trim()) return;
    setIsSending(true);
    try {
      await api.post(`/workspace/${workspaceId}/sales/${saleId}/chat`, { message: messageInput });
      setMessageInput('');
      await refetch();
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={isSheet
      ? 'fixed inset-0 z-[1000] bg-warm-50 dark:bg-gray-900 flex flex-col'
      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col h-full min-h-[300px]'
    }>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <span className="font-serif text-base font-medium text-warm-900 dark:text-warm-100">
          Team Chat
        </span>
        {isSheet && onClose && (
          <button
            onClick={onClose}
            className="w-11 h-11 border-none bg-transparent cursor-pointer text-xl text-warm-900 dark:text-warm-100"
            aria-label="Close chat"
          >
            ✕
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {(!chatData?.messages || chatData.messages.length === 0) && (
          <div className="text-gray-500 dark:text-gray-400 text-sm italic text-center py-6">
            No messages yet — say something!
          </div>
        )}
        {chatData?.messages?.map((msg) => (
          <div key={msg.id} className="mb-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[13px] font-semibold text-warm-900 dark:text-warm-100">{msg.organizer.businessName}</span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            <div className="text-sm text-warm-900 dark:text-warm-200 mt-0.5">{msg.content}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="flex gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <input
          type="text"
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Type a message..."
          className="flex-1 px-3.5 py-2.5 rounded-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-warm-900 dark:text-warm-100 outline-none focus:ring-2 focus:ring-sage-500 min-h-[44px]"
          disabled={isSending}
          aria-label="Chat message"
        />
        <button
          onClick={handleSend}
          disabled={isSending || !messageInput.trim()}
          className="w-11 h-11 rounded-full border-none bg-sage-600 cursor-pointer flex items-center justify-center flex-shrink-0 disabled:opacity-50 hover:bg-sage-700 transition"
          aria-label="Send message"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function StatusButtons({ currentStatus, onUpdate }: { currentStatus: string; onUpdate: (status: string) => void }) {
  const buttons = [
    { status: 'ON_SITE', label: 'On site', color: COLORS.sage },
    { status: 'EN_ROUTE', label: 'On my way', color: COLORS.amber },
    { status: 'RUNNING_LATE', label: 'Running late', color: COLORS.coral },
  ];

  return (
    <div className="flex gap-2 my-3 flex-wrap">
      {buttons.map((btn) => {
        const isActive = currentStatus === btn.status;
        return (
          <button
            key={btn.status}
            onClick={() => onUpdate(btn.status)}
            className="px-4 py-2.5 rounded-full text-sm font-semibold cursor-pointer min-h-[44px] transition-all duration-150"
            style={{
              border: `2px solid ${btn.color}`,
              background: isActive ? btn.color : 'transparent',
              color: isActive ? '#fff' : btn.color,
            }}
            aria-label={`Set status to ${btn.label}`}
            aria-pressed={isActive}
          >
            {btn.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function MorningBriefing({ briefing, workspaceId, workspaceName, onExitBriefing }: MorningBriefingProps) {
  const { user } = useAuth();
  const [team, setTeam] = useState(briefing.team);
  const [tasks, setTasks] = useState(briefing.prep.tasks);
  const [chatOpen, setChatOpen] = useState(false);
  const [myStatus, setMyStatus] = useState('CONFIRMED');
  const socketRef = useRef<Socket | null>(null);

  const sale = briefing.sale;

  // Socket connection
  useEffect(() => {
    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/^http/, 'ws');

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    const socket = io(socketUrl, {
      auth: { token: token || undefined },
      transports: ['websocket'],
      upgrade: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      socket.emit('JOIN_BRIEFING', sale.id);
    });

    socket.on('briefing:statusChanged', (data: { teamMemberId: string; status: string; eta: string | null }) => {
      setTeam((prev) =>
        prev.map((m) =>
          m.teamMemberId === data.teamMemberId ? { ...m, status: data.status, eta: data.eta } : m
        )
      );
    });

    socket.on('briefing:prepToggled', (data: { taskId: string; done: boolean; doneAt: string | null }) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === data.taskId ? { ...t, done: data.done, doneAt: data.doneAt } : t))
      );
    });

    socket.on('briefing:taskCreated', (data: { task: PrepTaskInfo }) => {
      setTasks((prev) => [...prev, data.task]);
    });

    socketRef.current = socket;

    return () => {
      socket.emit('LEAVE_BRIEFING', sale.id);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sale.id]);

  // Optimistic prep task toggle
  const handleToggleTask = useCallback(
    async (taskId: string, currentDone: boolean) => {
      const newDone = !currentDone;
      // Optimistic
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, done: newDone, doneAt: newDone ? new Date().toISOString() : null } : t))
      );
      try {
        await api.patch(`/workspace/${workspaceId}/briefing/prep/${taskId}`, { done: newDone });
      } catch (err) {
        // Revert
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, done: currentDone, doneAt: currentDone ? t.doneAt : null } : t))
        );
        console.error('Error toggling prep task:', err);
      }
    },
    [workspaceId]
  );

  // Status self-update
  const handleStatusUpdate = useCallback(
    async (status: string) => {
      const prevStatus = myStatus;
      setMyStatus(status); // Optimistic
      try {
        await api.patch(`/workspace/${workspaceId}/briefing/status`, { saleId: sale.id, status });
      } catch (err) {
        setMyStatus(prevStatus); // Revert
        console.error('Error updating status:', err);
      }
    },
    [workspaceId, sale.id, myStatus]
  );

  // Add prep task
  const handleAddTask = useCallback(
    async (title: string, urgent: boolean) => {
      try {
        const { data } = await api.post(`/workspace/${workspaceId}/briefing/prep`, {
          saleId: sale.id,
          title,
          urgent,
        });
        if (data.task) {
          setTasks((prev) => [...prev, data.task]);
        }
      } catch (err) {
        console.error('Error creating prep task:', err);
      }
    },
    [workspaceId, sale.id]
  );

  const doneCount = tasks.filter((t) => t.done).length;
  const fullAddress = formatAddress(sale);

  // ── Desktop (>=1024px) ──────────────────────────────────────────────────
  // ── Mobile (<1024px) ────────────────────────────────────────────────────
  // Both rendered; CSS handles visibility via media queries in inline styles
  // We use a simple approach: render both layouts, wrap in responsive divs

  return (
    <div className="bg-warm-50 dark:bg-gray-900 min-h-screen text-warm-900 dark:text-warm-100">
      {/* ── Desktop Layout ── */}
      <div className="hidden lg:block max-w-[1280px] mx-auto px-8">
        {/* Header */}
        <div className="py-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium tracking-widest text-gray-500 dark:text-gray-400 uppercase">
                FindA.Sale · Day of
              </div>
              <h1 className="font-serif text-[32px] font-medium text-warm-900 dark:text-warm-100 my-1">
                {sale.title}
              </h1>
              <a
                href={mapsUrl(sale)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-sage-600 dark:text-sage-400 underline"
              >
                {fullAddress}
              </a>
            </div>
            <div className="flex items-center gap-3">
              {onExitBriefing && (
                <button
                  onClick={onExitBriefing}
                  className="text-sm font-medium px-4 py-2 rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  Dashboard view
                </button>
              )}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-3.5 py-1.5 text-[13px] text-warm-900 dark:text-warm-100 font-medium">
                {team.length} team member{team.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="flex gap-8 pt-6">
          {/* Left column — morning read */}
          <div className="flex-[0_0_58%] min-w-0">
            <Countdown startDate={sale.startDate} />
            <VitalsStrip rsvpCount={briefing.rsvpCount} cashFloat={sale.cashFloat} startDate={sale.startDate} />

            {/* My status */}
            <div className="my-4">
              <div className="text-[13px] font-medium text-gray-500 dark:text-gray-400 mb-1">Your status</div>
              <StatusButtons currentStatus={myStatus} onUpdate={handleStatusUpdate} />
            </div>

            <PrepThermometer tasks={tasks} onToggle={handleToggleTask} onAddTask={handleAddTask} />

            {/* Footer */}
            <div className="py-8 text-right">
              <span className="italic text-gray-500 dark:text-gray-400 text-sm">Good luck today!</span>
            </div>
          </div>

          {/* Right column — live room */}
          <div className="flex-[0_0_38%] min-w-0 flex flex-col gap-4">
            <TeamRoster
              team={team}
              currentUserId={user?.id}
              currentOrganizerId={undefined}
              saleId={sale.id}
              workspaceId={workspaceId}
              onStatusUpdate={handleStatusUpdate}
            />

            {/* Persistent chat panel */}
            <div className="flex-1 min-h-[350px]">
              <ChatPanel workspaceId={workspaceId} saleId={sale.id} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile Layout ── */}
      <div className="block lg:hidden max-w-[600px] mx-auto px-4 pb-20">
        {/* Top bar */}
        <div className="pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium tracking-widest text-gray-500 dark:text-gray-400 uppercase">
              FindA.Sale · Day of
            </div>
            {onExitBriefing && (
              <button
                onClick={onExitBriefing}
                className="text-xs font-medium px-3 py-1.5 rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                Dashboard
              </button>
            )}
          </div>
          <h1 className="font-serif text-2xl font-medium text-warm-900 dark:text-warm-100 my-1">
            {sale.title}
          </h1>
        </div>

        {/* Address */}
        <a
          href={mapsUrl(sale)}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-sage-600 dark:text-sage-400 underline py-1.5 pb-4 min-h-[44px] leading-8"
        >
          {fullAddress}
        </a>

        <Countdown startDate={sale.startDate} />
        <VitalsStrip rsvpCount={briefing.rsvpCount} cashFloat={sale.cashFloat} startDate={sale.startDate} />

        {/* My status */}
        <div className="my-3">
          <div className="text-[13px] font-medium text-gray-500 dark:text-gray-400 mb-1">Your status</div>
          <StatusButtons currentStatus={myStatus} onUpdate={handleStatusUpdate} />
        </div>

        <PrepThermometer tasks={tasks} onToggle={handleToggleTask} onAddTask={handleAddTask} />
        <TeamRoster
          team={team}
          currentUserId={user?.id}
          currentOrganizerId={undefined}
          saleId={sale.id}
          workspaceId={workspaceId}
          onStatusUpdate={handleStatusUpdate}
        />

        {/* Footer */}
        <div className="py-8 text-center">
          <span className="italic text-gray-500 dark:text-gray-400 text-sm">Good luck today!</span>
        </div>

        {/* Chat FAB (mobile) */}
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-5 right-5 w-14 h-14 rounded-full bg-sage-600 border-none cursor-pointer shadow-lg flex items-center justify-center z-[100] hover:bg-sage-700 transition"
          aria-label="Open team chat"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        {/* Last message preview badge */}
        {briefing.lastChatMessage && !chatOpen && (
          <div className="fixed bottom-[82px] right-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 max-w-[220px] text-xs text-warm-900 dark:text-warm-100 shadow-md z-[99]">
            <span className="font-semibold">{briefing.lastChatMessage.author}: </span>
            {briefing.lastChatMessage.content.length > 60
              ? briefing.lastChatMessage.content.slice(0, 60) + '…'
              : briefing.lastChatMessage.content}
          </div>
        )}

        {/* Chat sheet (mobile) */}
        {chatOpen && (
          <ChatPanel workspaceId={workspaceId} saleId={sale.id} isSheet onClose={() => setChatOpen(false)} />
        )}
      </div>
    </div>
  );
}
