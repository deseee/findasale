/**
 * BroadcastComposer — Brief E · Broadcast Composer
 *
 * Two-panel desktop composer (compose left, live preview right).
 * Mobile: single column with Compose / Preview tab toggle.
 * Send confirmation modal with 7-day frequency guardrail.
 * Tier gate: SIMPLE organizers see a locked/upgrade prompt.
 *
 * Schema confirmed: OrganizerBroadcast has subject, message, sentAt, recipientCount.
 * API: POST /organizers/me/broadcast  { subject, message }
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';

// ---------- Icon (self-contained, no external dep) ----------

const Icon = ({ name, size = 16 }: { name: string; size?: number }) => {
  const paths: Record<string, React.ReactNode> = {
    x: <path d="M6 6l12 12M18 6l-12 12" />,
    bell: (
      <>
        <path d="M6 16V11a6 6 0 0112 0v5l1.5 2H4.5L6 16z" />
        <path d="M10 20a2 2 0 004 0" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v.01M11 12h1v5h1" />
      </>
    ),
    check: <path d="M5 12l4 4 10-10" />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    chevronDown: <path d="M6 9l6 6 6-6" />,
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </>
    ),
    bag: (
      <>
        <path d="M5 8h14l-1 13H6L5 8z" />
        <path d="M9 8V6a3 3 0 016 0v2" />
      </>
    ),
    web: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
      </>
    ),
    star: <path d="M12 3l2.6 5.8 6.4.7-4.8 4.4 1.4 6.3L12 17l-5.6 3.2 1.4-6.3L3 9.5l6.4-.7L12 3z" />,
    spark: <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />,
    lock: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 018 0v4" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block' }}
      aria-hidden="true"
    >
      {paths[name] ?? null}
    </svg>
  );
};

// ---------- Templates ----------

const TEMPLATES = [
  {
    key: 'sale_day',
    label: 'Sale day',
    subject: 'We open today at 8am — come find something great',
    message:
      "Doors open this morning at 8am sharp. We've got a full house — furniture, collectibles, and plenty of surprises. First come, first served. See you there.",
  },
  {
    key: 'new_inventory',
    label: 'New inventory',
    subject: 'Fresh inventory just added — first look inside',
    message:
      "We've added new items this week — some great finds across furniture, art, and vintage pieces. Stop in or browse the listing for a preview. We'd love to see you.",
  },
  {
    key: 'flash_deal',
    label: 'Flash deal',
    subject: 'Flash deal — 20% off everything today only',
    message:
      'Quick heads-up: we\'re running a one-day deal — 20% off all remaining items today. No code needed, just mention this message at checkout. Ends at 4pm.',
  },
];

// ---------- Attached sale shape ----------

interface AttachedSale {
  id: string;
  title: string;
  address: string;
  startDate?: string;
  saleType?: string;
}

interface PublishedSale {
  id: string;
  title: string;
  address?: string;
  city?: string;
  state?: string;
  startDate?: string;
  saleType?: string;
}

// ---------- Email preview (desktop right panel) ----------

const EmailPreview = ({
  subject,
  body,
  attachedSale,
  attachedLink,
  organizerName,
}: {
  subject: string;
  body: string;
  attachedSale: AttachedSale | null;
  attachedLink: string;
  organizerName: string;
}) => {
  const initials = organizerName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="h-full bg-[#E8E2D6] dark:bg-[#0F1118] p-5 overflow-auto">
      <p className="font-mono text-[10px] uppercase tracking-widest text-warm-400 dark:text-gray-500 mb-3">
        Email preview · how it lands in their inbox
      </p>

      {/* Inbox chrome */}
      <div className="rounded-xl border border-warm-200 dark:border-gray-700 overflow-hidden shadow-md">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#F4EFE7] dark:bg-[#19202F] border-b border-warm-200 dark:border-gray-700">
          <div className="w-9 h-9 rounded-full bg-[#C8552B] dark:bg-[#E97C4D] text-white flex items-center justify-center font-semibold text-sm flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-warm-900 dark:text-gray-100 truncate">{organizerName}</p>
            <p className="text-xs text-warm-400 dark:text-gray-500">via FindA.Sale · to you · just now</p>
          </div>
          <Icon name="star" size={14} />
        </div>

        {/* Email body — always parchment per design */}
        <div className="bg-[#F4EFE7] text-[#1A1814] px-8 py-6">
          <h3
            className="font-display text-xl font-semibold leading-tight"
            style={{ color: subject ? '#1A1814' : 'rgba(26,24,20,0.35)', fontStyle: subject ? 'normal' : 'italic' }}
          >
            {subject || 'Your subject line shows up here'}
          </h3>
          <div
            className="mt-3 text-sm leading-relaxed whitespace-pre-wrap"
            style={{ color: body ? '#1A1814' : 'rgba(26,24,20,0.35)', fontStyle: body ? 'normal' : 'italic' }}
          >
            {body ||
              'Your message will appear here as you type. Keep it short — 3 to 5 sentences works best for follower opens.'}
          </div>

          {attachedSale && (
            <div className="mt-4 p-3 rounded-lg border border-black/10 bg-[#FBF8F2] flex gap-3">
              <div className="w-20 h-16 bg-[#E8E2D6] rounded flex-shrink-0 flex items-center justify-center text-[10px] font-mono uppercase tracking-widest text-warm-400">
                [cover]
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[#C8552B] mb-1">
                  {attachedSale.saleType?.replace('_', ' ') ?? 'Sale'}
                </p>
                <p className="font-display text-sm font-semibold leading-snug">{attachedSale.title}</p>
                <p className="text-xs text-[#1A1814]/60 mt-0.5 truncate">{attachedSale.address}</p>
                <p className="mt-2 text-xs font-semibold text-[#C8552B]">See the listing →</p>
              </div>
            </div>
          )}

          {attachedLink && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-[#C8552B]/8 text-[#C8552B] text-sm flex items-center gap-2">
              <Icon name="web" size={13} />
              {attachedLink}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-black/10 flex justify-between text-[11px] text-[#1A1814]/50">
            <span>Sent via FindA.Sale</span>
            <span className="underline">Unsubscribe</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- Push preview ----------

const PushPreview = ({ subject, body }: { subject: string; body: string }) => (
  <div className="h-full bg-[#E8E2D6] dark:bg-[#0F1118] p-6 flex flex-col items-center overflow-auto">
    <p className="font-mono text-[10px] uppercase tracking-widest text-warm-400 dark:text-gray-500 mb-4">
      Push preview · phone notification
    </p>

    {/* Lock-screen look */}
    <div
      className="w-80 p-5 rounded-3xl text-white"
      style={{ background: 'linear-gradient(180deg, rgba(20,18,14,0.85), rgba(20,18,14,0.65))' }}
    >
      <p className="text-center text-sm opacity-80 mb-4 font-display">9:41 · Sat, Apr 18</p>
      <div
        className="rounded-2xl p-3 flex gap-2.5"
        style={{ background: 'rgba(255,255,255,0.18)' }}
      >
        <div className="w-9 h-9 rounded-lg flex-shrink-0 bg-[#C8552B] text-white flex items-center justify-center font-semibold text-sm">
          FS
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs opacity-85 font-semibold">FINDA.SALE</span>
            <span className="text-[11px] opacity-60">now</span>
          </div>
          <p className="text-sm font-semibold mt-0.5">{subject || 'Your subject line'}</p>
          <p
            className="text-[13px] mt-0.5 opacity-85 overflow-hidden"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
            }}
          >
            {body || 'First line of your message…'}
          </p>
        </div>
      </div>
    </div>

    <p className="mt-4 text-xs text-warm-400 dark:text-gray-500 text-center max-w-xs">
      Subject becomes the notification title. First sentence becomes the preview body.
    </p>
  </div>
);

// ---------- Frequency guardrail helpers ----------

function daysSinceLastBroadcast(sentAt: string | null): number | null {
  if (!sentAt) return null;
  const ms = Date.now() - new Date(sentAt).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function nextAllowedDate(sentAt: string): string {
  const next = new Date(new Date(sentAt).getTime() + 7 * 24 * 60 * 60 * 1000);
  return next.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ---------- Send confirmation modal ----------

const SendConfirmModal = ({
  count,
  lastSentAt,
  onConfirm,
  onCancel,
  isSending,
}: {
  count: number;
  lastSentAt: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  isSending: boolean;
}) => {
  const daysSince = daysSinceLastBroadcast(lastSentAt);
  const tooSoon = daysSince !== null && daysSince < 7;
  const nextDate = lastSentAt ? nextAllowedDate(lastSentAt) : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 dark:bg-black/60">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl border border-warm-200 dark:border-gray-700 shadow-2xl overflow-hidden">
        <div className="px-7 pt-7 pb-3 text-center">
          <div className="w-14 h-14 rounded-full mx-auto mb-4 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Icon name="bell" size={26} />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-warm-400 dark:text-gray-500 mb-1">
            Confirm
          </p>
          <h2 className="font-display text-xl font-semibold text-warm-900 dark:text-gray-100">
            Send to <span className="text-amber-600 dark:text-amber-400">{count} followers</span>?
          </h2>
          <p className="text-sm text-warm-500 dark:text-gray-400 mt-2 leading-relaxed">
            Your broadcast goes out as email and push right now. You can&apos;t unsend it.
          </p>
        </div>

        <div className="px-7 py-4">
          {tooSoon ? (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm">
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                You sent a broadcast {daysSince} {daysSince === 1 ? 'day' : 'days'} ago.
              </p>
              <p className="text-amber-700 dark:text-amber-400 mt-1">
                You can send again on <strong>{nextDate}</strong>. One per 7 days protects your
                follower list.
              </p>
            </div>
          ) : (
            <div className="px-3 py-2.5 rounded-lg bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 text-xs text-warm-500 dark:text-gray-400 flex items-center gap-2">
              <Icon name="clock" size={12} />
              After this, you can send again in 7 days
              {nextDate ? ` · ${nextDate}` : ''}
            </div>
          )}
        </div>

        <div className="px-7 py-4 border-t border-warm-200 dark:border-gray-700 bg-warm-50 dark:bg-gray-900 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-warm-600 dark:text-gray-400 hover:text-warm-900 dark:hover:text-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={tooSoon || isSending}
            className="px-4 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSending ? 'Sending…' : 'Send now'}
            <Icon name="arrow" size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------- Sent confirmation ----------

const SentState = ({
  count,
  subject,
  message,
  onDone,
}: {
  count: number;
  subject: string;
  message: string;
  onDone: () => void;
}) => (
  <div className="h-full flex items-center justify-center p-10">
    <div className="max-w-lg w-full text-center">
      <div className="w-14 h-14 rounded-full mx-auto mb-4 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 flex items-center justify-center">
        <Icon name="check" size={28} />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-green-600 dark:text-green-400 mb-1">
        Sent
      </p>
      <h2 className="font-display text-2xl font-semibold text-warm-900 dark:text-gray-100">
        Broadcast sent to {count} followers
      </h2>
      <p className="text-sm text-warm-500 dark:text-gray-400 mt-2 mb-6">
        Email is on its way · push fired now.
      </p>

      {/* Sent message echo */}
      <div className="text-left bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-xl p-5 mb-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-warm-400 dark:text-gray-500 mb-2">
          What you sent
        </p>
        <h3 className="font-display text-base font-semibold text-warm-900 dark:text-gray-100 mb-1">
          {subject}
        </h3>
        <p className="text-sm text-warm-500 dark:text-gray-400 leading-relaxed">{message}</p>
      </div>

      <button
        onClick={onDone}
        className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 mx-auto"
      >
        View broadcasts
        <Icon name="arrow" size={13} />
      </button>
    </div>
  </div>
);

// ---------- Upgrade gate (SIMPLE tier) ----------

const UpgradeGate = ({ followerCount }: { followerCount: number }) => (
  <div className="relative rounded-xl border border-warm-200 dark:border-gray-700 overflow-hidden">
    {/* Blurred preview */}
    <div className="p-6 blur-sm pointer-events-none select-none" aria-hidden="true">
      <div className="mb-3 h-4 w-40 bg-warm-200 dark:bg-gray-700 rounded" />
      <div className="h-10 w-full bg-warm-100 dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg mb-3" />
      <div className="h-24 w-full bg-warm-100 dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg" />
    </div>

    {/* Overlay */}
    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm text-center">
      <div className="w-11 h-11 rounded-full mb-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
        <Icon name="lock" size={20} />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-1">
        Pro feature
      </p>
      <h3 className="font-display text-lg font-semibold text-warm-900 dark:text-gray-100 mb-2">
        Message your {followerCount} followers
      </h3>
      <p className="text-sm text-warm-500 dark:text-gray-400 max-w-xs leading-relaxed mb-4">
        Broadcasts let you send a sale-day reminder or a flash deal to everyone following your
        storefront. One per 7 days, email + push.
      </p>
      <a
        href="/organizer/settings?tab=billing"
        className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2"
      >
        Upgrade to Pro
        <Icon name="arrow" size={13} />
      </a>
    </div>
  </div>
);

// ---------- Main BroadcastComposer ----------

export interface BroadcastComposerProps {
  /** Organizer's subscription tier — 'SIMPLE' | 'PRO' | 'TEAMS' */
  tier?: string;
  /** Number of followers this organizer has */
  followerCount?: number;
  /** Organizer display name (for email preview) */
  organizerName?: string;
  /** Published sales available to attach */
  publishedSales?: PublishedSale[];
  /** Timestamp of the last sent broadcast (ISO string) */
  lastSentAt?: string | null;
  /** Called after a successful send — parent should refresh broadcasts list */
  onSent?: (recipientCount: number) => void;
  /** Called when user clicks "Back" / close */
  onClose?: () => void;
  /** If provided, pre-loads the Sale Day template and attaches this sale */
  quickComposeSaleId?: string;
}

type Step = 'compose' | 'confirm' | 'sent';
type PreviewMode = 'email' | 'push';
type MobileTab = 'compose' | 'preview';

const BroadcastComposer: React.FC<BroadcastComposerProps> = ({
  tier = 'PRO',
  followerCount = 0,
  organizerName = 'Your Organization',
  publishedSales = [],
  lastSentAt = null,
  onSent,
  onClose,
  quickComposeSaleId,
}) => {
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('compose');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('email');
  const [mobileTab, setMobileTab] = useState<MobileTab>('compose');
  const [isSending, setIsSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachedSale, setAttachedSale] = useState<AttachedSale | null>(null);
  const [attachedLink, setAttachedLink] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaleDropdown, setShowSaleDropdown] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);

  // Debounced preview — updates 300ms after user stops typing
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewBody, setPreviewBody] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreviewSubject(subject);
      setPreviewBody(body);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [subject, body]);

  // Quick-compose: pre-load Sale Day template + attach sale
  useEffect(() => {
    if (!quickComposeSaleId) return;
    const tpl = TEMPLATES.find((t) => t.key === 'sale_day');
    if (tpl) {
      setSubject(tpl.subject);
      setBody(tpl.message);
    }
    const sale = publishedSales.find((s) => s.id === quickComposeSaleId);
    if (sale) {
      setAttachedSale({
        id: sale.id,
        title: sale.title,
        address: [sale.address, sale.city, sale.state].filter(Boolean).join(', '),
        startDate: sale.startDate,
        saleType: sale.saleType,
      });
    }
  }, [quickComposeSaleId, publishedSales]);

  const applyTemplate = useCallback(
    (key: string) => {
      const tpl = TEMPLATES.find((t) => t.key === key);
      if (!tpl) return;
      setSubject(tpl.subject);
      setBody(tpl.message);
      setShowTemplates(false);
    },
    []
  );

  const handleSend = async () => {
    try {
      setIsSending(true);
      const res = await api.post('/organizers/me/broadcast', {
        subject: subject.trim(),
        message: body.trim(),
      });
      const count: number = res.data?.recipientCount ?? followerCount;
      setSentCount(count);
      setStep('sent');
      onSent?.(count);
    } catch (err: unknown) {
      const msg =
        err instanceof Error && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response?: { data?: { message?: string } } }).response!.data!.message!
          : 'Failed to send broadcast';
      showToast(msg, 'error');
    } finally {
      setIsSending(false);
    }
  };

  const canSend = subject.trim().length > 0 && body.trim().length > 0;

  // Tier gate for SIMPLE
  if (tier === 'SIMPLE') {
    return (
      <div className="p-6">
        <UpgradeGate followerCount={followerCount} />
      </div>
    );
  }

  // Sent state
  if (step === 'sent') {
    return (
      <SentState
        count={sentCount}
        subject={subject}
        message={body}
        onDone={() => {
          setStep('compose');
          setSubject('');
          setBody('');
          setAttachedSale(null);
          setAttachedLink('');
          onClose?.();
        }}
      />
    );
  }

  // ---------- Compose view ----------

  const daysSince = daysSinceLastBroadcast(lastSentAt);
  const tooSoon = daysSince !== null && daysSince < 7;

  const ComposePanel = (
    <div className="flex flex-col gap-4 h-full overflow-y-auto">
      {/* Recipients banner */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 text-sm">
        <Icon name="bell" size={14} />
        <span>
          Sending to{' '}
          <strong className="text-amber-600 dark:text-amber-400">{followerCount} followers</strong>{' '}
          · Email + Push
        </span>
      </div>

      {/* Frequency warning */}
      {tooSoon && (
        <div className="px-3 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 text-sm flex gap-2.5">
          <Icon name="info" size={14} />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-300">
              You sent a broadcast {daysSince} {daysSince === 1 ? 'day' : 'days'} ago.
            </p>
            <p className="text-amber-700 dark:text-amber-400 mt-0.5">
              You can send again on{' '}
              <strong>{lastSentAt ? nextAllowedDate(lastSentAt) : '—'}</strong>. One per 7 days
              protects your follower list.
            </p>
          </div>
        </div>
      )}

      {/* Subject */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label
            className="font-mono text-[10px] uppercase tracking-widest text-warm-400 dark:text-gray-500"
            htmlFor="bc-subject"
          >
            Subject
          </label>
          <span
            className={`font-mono text-[10px] ${
              subject.length > 60
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-warm-400 dark:text-gray-500'
            }`}
          >
            {subject.length} / 60
          </span>
        </div>
        <input
          id="bc-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="A clear, friendly headline"
          maxLength={120}
          className="w-full px-3.5 py-3 font-display text-base font-medium bg-white dark:bg-gray-800 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-warm-900 dark:text-gray-100 placeholder:text-warm-300 dark:placeholder:text-gray-600 placeholder:italic outline-none"
        />
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between mb-1.5">
          <label
            className="font-mono text-[10px] uppercase tracking-widest text-warm-400 dark:text-gray-500"
            htmlFor="bc-body"
          >
            Message · 3–5 sentences works best
          </label>
          <span className="font-mono text-[10px] text-warm-400 dark:text-gray-500">
            {body.length} chars
          </span>
        </div>
        <textarea
          id="bc-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Tell your followers what's new. A sale day reminder, a teaser for fresh inventory, or a flash deal closing soon — keep it short and warm."
          maxLength={2000}
          rows={6}
          className="flex-1 w-full px-3.5 py-3 text-sm leading-relaxed bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-warm-900 dark:text-gray-100 placeholder:text-warm-300 dark:placeholder:text-gray-600 placeholder:italic resize-none outline-none"
        />
      </div>

      {/* Attach */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-warm-400 dark:text-gray-500 mb-2">
          Attach (optional)
        </p>
        <div className="flex gap-2">
          {/* Sale dropdown */}
          <div className="relative flex-1">
            <button
              type="button"
              onClick={() => {
                setShowSaleDropdown((v) => !v);
                setShowLinkInput(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                attachedSale
                  ? 'bg-amber-50 dark:bg-amber-900/15 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
                  : 'bg-white dark:bg-gray-800 border-warm-200 dark:border-gray-700 text-warm-500 dark:text-gray-400'
              }`}
            >
              <Icon name="bag" size={14} />
              <span className="flex-1 text-left truncate">
                {attachedSale ? attachedSale.title : 'Attach a sale'}
              </span>
              <Icon name="chevronDown" size={11} />
            </button>
            {showSaleDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    setAttachedSale(null);
                    setShowSaleDropdown(false);
                  }}
                  className="w-full px-3 py-2.5 text-sm text-left text-warm-400 dark:text-gray-500 hover:bg-warm-50 dark:hover:bg-gray-700 border-b border-warm-100 dark:border-gray-700"
                >
                  No sale attached
                </button>
                {publishedSales.length === 0 && (
                  <p className="px-3 py-2.5 text-sm text-warm-400 dark:text-gray-500 italic">
                    No published sales found
                  </p>
                )}
                {publishedSales.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setAttachedSale({
                        id: s.id,
                        title: s.title,
                        address: [s.address, s.city, s.state].filter(Boolean).join(', '),
                        startDate: s.startDate,
                        saleType: s.saleType,
                      });
                      setShowSaleDropdown(false);
                    }}
                    className="w-full px-3 py-2.5 text-sm text-left text-warm-900 dark:text-gray-100 hover:bg-warm-50 dark:hover:bg-gray-700"
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Link */}
          <div className="relative flex-1">
            <button
              type="button"
              onClick={() => {
                setShowLinkInput((v) => !v);
                setShowSaleDropdown(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                attachedLink
                  ? 'bg-amber-50 dark:bg-amber-900/15 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
                  : 'bg-white dark:bg-gray-800 border-warm-200 dark:border-gray-700 text-warm-500 dark:text-gray-400'
              }`}
            >
              <Icon name="web" size={14} />
              <span className="flex-1 text-left truncate">
                {attachedLink || 'Add a link'}
              </span>
            </button>
            {showLinkInput && (
              <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg shadow-lg p-2">
                <input
                  type="url"
                  value={attachedLink}
                  onChange={(e) => setAttachedLink(e.target.value)}
                  placeholder="https://…"
                  className="w-full px-3 py-2 text-sm bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg text-warm-900 dark:text-gray-100 outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ---------- Desktop two-panel ----------

  return (
    <>
      {/* Desktop: two-panel layout */}
      <div className="hidden md:flex flex-col h-full bg-[#F4EFE7] dark:bg-[#0B0F17] min-h-[600px]">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-warm-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-warm-500 dark:text-gray-400 hover:text-warm-900 dark:hover:text-gray-100 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Icon name="x" size={14} />
                Close
              </button>
            )}
            <span className="font-mono text-[10px] uppercase tracking-widest text-warm-400 dark:text-gray-500">
              Broadcasts / New
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Templates dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTemplates((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-gray-300 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
              >
                Templates
                <Icon name="chevronDown" size={11} />
              </button>
              {showTemplates && (
                <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => applyTemplate(t.key)}
                      className="w-full px-4 py-2.5 text-sm text-left text-warm-900 dark:text-gray-100 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => canSend && setStep('confirm')}
              disabled={!canSend || tooSoon}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Review &amp; send
              <Icon name="arrow" size={13} />
            </button>
          </div>
        </div>

        {/* Two-panel body */}
        <div className="flex flex-1 min-h-0 gap-0 divide-x divide-warm-200 dark:divide-gray-700">
          {/* Compose panel */}
          <div className="flex-1 p-5 overflow-y-auto">
            {ComposePanel}
          </div>

          {/* Preview panel */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Preview toggle */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-warm-200 dark:border-gray-700">
              <span className="font-mono text-[10px] uppercase tracking-widest text-warm-400 dark:text-gray-500">
                Live preview
              </span>
              <div className="inline-flex bg-warm-100 dark:bg-gray-700 p-0.5 rounded-lg">
                {(['email', 'push'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPreviewMode(mode)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      previewMode === mode
                        ? 'bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100 shadow-sm'
                        : 'text-warm-500 dark:text-gray-400 hover:text-warm-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <Icon name={mode === 'email' ? 'mail' : 'bell'} size={11} />
                    {mode === 'email' ? 'Email' : 'Push'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              {previewMode === 'email' ? (
                <EmailPreview
                  subject={previewSubject}
                  body={previewBody}
                  attachedSale={attachedSale}
                  attachedLink={attachedLink}
                  organizerName={organizerName}
                />
              ) : (
                <PushPreview subject={previewSubject} body={previewBody} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: single column with tabs */}
      <div className="flex md:hidden flex-col h-full bg-[#F4EFE7] dark:bg-[#0B0F17] min-h-screen">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-warm-200 dark:border-gray-700">
          {onClose ? (
            <button type="button" onClick={onClose} className="text-warm-500 dark:text-gray-400">
              <Icon name="x" size={18} />
            </button>
          ) : (
            <span />
          )}
          <span className="font-mono text-[10px] uppercase tracking-widest text-warm-400 dark:text-gray-500">
            New broadcast
          </span>
          <button
            type="button"
            onClick={() => canSend && setStep('confirm')}
            disabled={!canSend || tooSoon}
            className="text-sm font-semibold text-amber-600 dark:text-amber-400 disabled:opacity-40"
          >
            Send
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 px-3 py-2.5 border-b border-warm-200 dark:border-gray-700">
          {(['compose', 'preview'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMobileTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                mobileTab === t
                  ? 'bg-white dark:bg-gray-800 border-warm-300 dark:border-gray-600 text-warm-900 dark:text-gray-100'
                  : 'border-transparent text-warm-500 dark:text-gray-400'
              }`}
            >
              {t === 'compose' ? 'Compose' : 'Preview'}
            </button>
          ))}
        </div>

        {/* Templates bar (mobile) */}
        <div className="px-3 py-2 border-b border-warm-100 dark:border-gray-800 flex gap-2 overflow-x-auto">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => applyTemplate(t.key)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {mobileTab === 'compose' ? (
            <div className="p-4 h-full overflow-y-auto">{ComposePanel}</div>
          ) : (
            <EmailPreview
              subject={previewSubject}
              body={previewBody}
              attachedSale={attachedSale}
              attachedLink={attachedLink}
              organizerName={organizerName}
            />
          )}
        </div>
      </div>

      {/* Send confirmation modal */}
      {step === 'confirm' && (
        <SendConfirmModal
          count={followerCount}
          lastSentAt={lastSentAt}
          onConfirm={handleSend}
          onCancel={() => setStep('compose')}
          isSending={isSending}
        />
      )}
    </>
  );
};

export default BroadcastComposer;
