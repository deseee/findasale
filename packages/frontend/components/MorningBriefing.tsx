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
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 48, fontWeight: 500, color: COLORS.sage, letterSpacing: -1 }}>
          {countdown.label}
        </div>
      </div>
    );
  }

  // Split into number + unit pairs for styling
  const parts = countdown.label.split(' ');
  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: 2, color: '#6B7670', textTransform: 'uppercase' as const, marginBottom: 8 }}>
        Doors open in
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' as const }}>
        {parts.map((part, i) => {
          const isNum = /^\d+$/.test(part);
          return (
            <span
              key={i}
              style={{
                fontFamily: isNum ? 'Fraunces, serif' : 'Inter, sans-serif',
                fontSize: isNum ? 80 : 20,
                fontWeight: isNum ? 500 : 400,
                fontStyle: isNum ? 'normal' : 'italic',
                color: isNum ? COLORS.ink : '#6B7670',
                letterSpacing: isNum ? -3 : 0,
                lineHeight: 1,
              }}
            >
              {part}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function VitalsStrip({ rsvpCount, cashFloat }: { rsvpCount: number; cashFloat: number | null }) {
  const pills = [
    { label: '--°F', sublabel: 'Weather' },
    { label: String(rsvpCount), sublabel: 'RSVPs' },
    { label: formatCashFloat(cashFloat), sublabel: 'Cash float' },
  ];

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, margin: '16px 0' }}>
      {pills.map((pill) => (
        <div
          key={pill.sublabel}
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.line}`,
            borderRadius: 10,
            padding: '10px 16px',
            flex: '1 1 0',
            minWidth: 90,
            textAlign: 'center' as const,
          }}
        >
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500, color: COLORS.ink }}>{pill.label}</div>
          <div style={{ fontSize: 11, color: '#6B7670', marginTop: 2 }}>{pill.sublabel}</div>
        </div>
      ))}
    </div>
  );
}

function PrepThermometer({
  tasks,
  onToggle,
}: {
  tasks: PrepTaskInfo[];
  onToggle: (taskId: string, currentDone: boolean) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div style={{ padding: '16px 0', color: '#6B7670', fontSize: 14, fontStyle: 'italic' }}>
        No prep tasks yet
      </div>
    );
  }

  const doneCount = tasks.filter((t) => t.done).length;
  const urgentIncomplete = tasks.filter((t) => t.urgent && !t.done);
  const nonUrgentIncomplete = tasks.filter((t) => !t.urgent && !t.done);

  return (
    <div style={{ margin: '20px 0' }}>
      {/* Section heading */}
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 500, color: COLORS.ink, marginBottom: 12 }}>
        Prep
      </div>

      {/* Segmented bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {tasks.map((task) => {
          let bg: string;
          let border: string | undefined;
          if (task.done) {
            bg = COLORS.sage;
            border = undefined;
          } else if (task.urgent) {
            bg = 'rgba(197,99,74,0.22)';
            border = `1.5px solid rgba(197,99,74,0.5)`;
          } else {
            bg = 'rgba(30,42,36,0.07)';
            border = undefined;
          }
          return (
            <div
              key={task.id}
              style={{
                flex: 1,
                height: 14,
                borderRadius: 3,
                background: bg,
                border: border || 'none',
              }}
              title={task.title}
            />
          );
        })}
      </div>

      {/* Fraction */}
      <div style={{ fontSize: 13, color: '#6B7670', marginBottom: 16 }}>
        {doneCount} of {tasks.length} ready
      </div>

      {/* Urgent incomplete panel */}
      {urgentIncomplete.length > 0 && (
        <div
          style={{
            background: 'rgba(197,99,74,0.08)',
            border: `1px solid rgba(197,99,74,0.25)`,
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.coral, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: 1 }}>
            Before doors open
          </div>
          {urgentIncomplete.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={onToggle} />
          ))}
        </div>
      )}

      {/* Non-urgent incomplete */}
      {nonUrgentIncomplete.length > 0 && (
        <div style={{ opacity: 0.6 }}>
          {nonUrgentIncomplete.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={onToggle} />
          ))}
        </div>
      )}

      {/* Done tasks (collapsed) */}
      {doneCount > 0 && (
        <div style={{ opacity: 0.4, marginTop: 8 }}>
          {tasks
            .filter((t) => t.done)
            .map((task) => (
              <TaskRow key={task.id} task={task} onToggle={onToggle} />
            ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onToggle }: { task: PrepTaskInfo; onToggle: (id: string, done: boolean) => void }) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0',
        cursor: 'pointer',
        minHeight: 44,
      }}
    >
      <input
        type="checkbox"
        checked={task.done}
        onChange={() => onToggle(task.id, task.done)}
        style={{ width: 20, height: 20, accentColor: COLORS.sage, cursor: 'pointer', flexShrink: 0 }}
        aria-label={`Mark "${task.title}" as ${task.done ? 'incomplete' : 'complete'}`}
      />
      <span
        style={{
          fontSize: 14,
          color: COLORS.ink,
          textDecoration: task.done ? 'line-through' : 'none',
          flex: 1,
        }}
      >
        {task.title}
      </span>
      {task.urgent && !task.done && (
        <span style={{ fontSize: 11, color: COLORS.coral, fontWeight: 600 }}>URGENT</span>
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
    <div style={{ margin: '20px 0' }}>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 500, color: COLORS.ink, marginBottom: 12 }}>
        Team
      </div>
      {team.map((member, idx) => (
        <TeamCard
          key={member.id}
          member={member}
          colorIndex={idx}
          isSelf={false /* TODO: match by userId when available */}
          onStatusUpdate={onStatusUpdate}
        />
      ))}
      {team.length === 0 && (
        <div style={{ color: '#6B7670', fontSize: 14, fontStyle: 'italic', padding: '8px 0' }}>
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

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 0',
        borderBottom: `1px solid ${COLORS.line}`,
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: avatarColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 500, color: '#fff' }}>
          {member.avatarInitial}
        </span>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.ink }}>{member.name}</span>
          <span style={{ fontSize: 12, color: '#6B7670' }}>{member.role}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {/* Status dot */}
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: statusColor,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, color: statusColor, fontWeight: 500 }}>
            {STATUS_LABELS[member.status] || member.status}
          </span>
          {member.status === 'EN_ROUTE' && member.eta && (
            <span style={{ fontSize: 12, color: '#6B7670' }}>
              · ETA {new Date(member.eta).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>
        {member.ownsArea && (
          <div style={{ fontSize: 12, color: '#6B7670', marginTop: 2 }}>
            Owns: {member.ownsArea}
          </div>
        )}
      </div>

      {/* Message button */}
      <button
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: `1px solid ${COLORS.line}`,
          background: 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-label={`Message ${member.name}`}
        title={`Message ${member.name}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

  const containerStyle: React.CSSProperties = isSheet
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: COLORS.paper,
        display: 'flex',
        flexDirection: 'column',
      }
    : {
        background: COLORS.card,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 300,
      };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${COLORS.line}`,
        }}
      >
        <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 500, color: COLORS.ink }}>
          Team Chat
        </span>
        {isSheet && onClose && (
          <button
            onClick={onClose}
            style={{ width: 44, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: COLORS.ink }}
            aria-label="Close chat"
          >
            ✕
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {(!chatData?.messages || chatData.messages.length === 0) && (
          <div style={{ color: '#6B7670', fontSize: 14, fontStyle: 'italic', textAlign: 'center', padding: 24 }}>
            No messages yet — say something!
          </div>
        )}
        {chatData?.messages?.map((msg) => (
          <div key={msg.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{msg.organizer.businessName}</span>
              <span style={{ fontSize: 11, color: '#6B7670' }}>
                {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            <div style={{ fontSize: 14, color: COLORS.ink, marginTop: 2 }}>{msg.content}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '12px 16px',
          borderTop: `1px solid ${COLORS.line}`,
          background: COLORS.card,
        }}
      >
        <input
          type="text"
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Type a message..."
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 22,
            border: `1px solid ${COLORS.line}`,
            background: COLORS.paper,
            fontSize: 14,
            color: COLORS.ink,
            outline: 'none',
            minHeight: 44,
          }}
          disabled={isSending}
          aria-label="Chat message"
        />
        <button
          onClick={handleSend}
          disabled={isSending || !messageInput.trim()}
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: 'none',
            background: COLORS.sage,
            cursor: isSending || !messageInput.trim() ? 'default' : 'pointer',
            opacity: isSending || !messageInput.trim() ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
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
    <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' as const }}>
      {buttons.map((btn) => {
        const isActive = currentStatus === btn.status;
        return (
          <button
            key={btn.status}
            onClick={() => onUpdate(btn.status)}
            style={{
              padding: '10px 18px',
              borderRadius: 22,
              border: `2px solid ${btn.color}`,
              background: isActive ? btn.color : 'transparent',
              color: isActive ? '#fff' : btn.color,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 44,
              transition: 'all 0.15s ease',
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

export default function MorningBriefing({ briefing, workspaceId, workspaceName }: MorningBriefingProps) {
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

  const doneCount = tasks.filter((t) => t.done).length;
  const fullAddress = formatAddress(sale);

  // ── Desktop (>=1024px) ──────────────────────────────────────────────────
  // ── Mobile (<1024px) ────────────────────────────────────────────────────
  // Both rendered; CSS handles visibility via media queries in inline styles
  // We use a simple approach: render both layouts, wrap in responsive divs

  return (
    <div style={{ background: COLORS.paper, minHeight: '100vh', color: COLORS.ink }}>
      {/* ── Desktop Layout ── */}
      <div className="hidden lg:block" style={{ maxWidth: 1280, margin: '0 auto', padding: '0 32px' }}>
        {/* Header */}
        <div style={{ padding: '24px 0 16px', borderBottom: `1px solid ${COLORS.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: 2, color: '#6B7670', textTransform: 'uppercase' as const }}>
                FindA.Sale · Day of
              </div>
              <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 32, fontWeight: 500, color: COLORS.ink, margin: '4px 0' }}>
                {sale.title}
              </h1>
              <a
                href={mapsUrl(sale)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 14, color: COLORS.sage, textDecoration: 'underline' }}
              >
                {fullAddress}
              </a>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 20,
                  padding: '6px 14px',
                  fontSize: 13,
                  color: COLORS.ink,
                  fontWeight: 500,
                }}
              >
                {team.length} team member{team.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'flex', gap: 32, paddingTop: 24 }}>
          {/* Left column — morning read */}
          <div style={{ flex: '0 0 58%', minWidth: 0 }}>
            <Countdown startDate={sale.startDate} />
            <VitalsStrip rsvpCount={briefing.rsvpCount} cashFloat={sale.cashFloat} />

            {/* My status */}
            <div style={{ margin: '16px 0' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#6B7670', marginBottom: 4 }}>Your status</div>
              <StatusButtons currentStatus={myStatus} onUpdate={handleStatusUpdate} />
            </div>

            <PrepThermometer tasks={tasks} onToggle={handleToggleTask} />

            {/* Footer */}
            <div style={{ padding: '32px 0 24px', textAlign: 'right' as const }}>
              <span style={{ fontStyle: 'italic', color: '#6B7670', fontSize: 14 }}>Good luck today!</span>
            </div>
          </div>

          {/* Right column — live room */}
          <div style={{ flex: '0 0 38%', minWidth: 0, display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
            <TeamRoster
              team={team}
              currentUserId={user?.id}
              currentOrganizerId={undefined}
              saleId={sale.id}
              workspaceId={workspaceId}
              onStatusUpdate={handleStatusUpdate}
            />

            {/* Persistent chat panel */}
            <div style={{ flex: 1, minHeight: 350 }}>
              <ChatPanel workspaceId={workspaceId} saleId={sale.id} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile Layout ── */}
      <div className="block lg:hidden" style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px', paddingBottom: 80 }}>
        {/* Top bar */}
        <div style={{ padding: '16px 0 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: 2, color: '#6B7670', textTransform: 'uppercase' as const }}>
            FindA.Sale · Day of
          </div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 500, color: COLORS.ink, margin: '4px 0' }}>
            {sale.title}
          </h1>
        </div>

        {/* Address */}
        <a
          href={mapsUrl(sale)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            fontSize: 14,
            color: COLORS.sage,
            textDecoration: 'underline',
            padding: '6px 0 16px',
            minHeight: 44,
            lineHeight: '32px',
          }}
        >
          {fullAddress}
        </a>

        <Countdown startDate={sale.startDate} />
        <VitalsStrip rsvpCount={briefing.rsvpCount} cashFloat={sale.cashFloat} />

        {/* My status */}
        <div style={{ margin: '12px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#6B7670', marginBottom: 4 }}>Your status</div>
          <StatusButtons currentStatus={myStatus} onUpdate={handleStatusUpdate} />
        </div>

        <PrepThermometer tasks={tasks} onToggle={handleToggleTask} />
        <TeamRoster
          team={team}
          currentUserId={user?.id}
          currentOrganizerId={undefined}
          saleId={sale.id}
          workspaceId={workspaceId}
          onStatusUpdate={handleStatusUpdate}
        />

        {/* Footer */}
        <div style={{ padding: '32px 0 16px', textAlign: 'center' as const }}>
          <span style={{ fontStyle: 'italic', color: '#6B7670', fontSize: 14 }}>Good luck today!</span>
        </div>

        {/* Chat FAB (mobile) */}
        <button
          onClick={() => setChatOpen(true)}
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: COLORS.sage,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(30,42,36,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          aria-label="Open team chat"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        {/* Last message preview badge */}
        {briefing.lastChatMessage && !chatOpen && (
          <div
            style={{
              position: 'fixed',
              bottom: 82,
              right: 16,
              background: COLORS.card,
              border: `1px solid ${COLORS.line}`,
              borderRadius: 12,
              padding: '8px 12px',
              maxWidth: 220,
              fontSize: 12,
              color: COLORS.ink,
              boxShadow: '0 2px 8px rgba(30,42,36,0.1)',
              zIndex: 99,
            }}
          >
            <span style={{ fontWeight: 600 }}>{briefing.lastChatMessage.author}: </span>
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
