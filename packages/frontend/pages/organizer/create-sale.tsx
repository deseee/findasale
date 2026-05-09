/**
 * Create Sale — 5-Step Wizard
 *
 * Redesigned from a long-scroll form to a linear 5-step stepper.
 * All existing API submission logic, validation, and field shapes are preserved.
 *
 * Step 1 — Sale type + name
 * Step 2 — Dates & location (Online Only toggle wired to UI; TODO: schema field)
 * Step 3 — Photos
 * Step 4 — Details (type-progressive)
 * Step 5 — Review + publish
 *
 * Design tokens: Session 3 handoff (wizard.jsx / fs-shared.jsx)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Tooltip from '../../components/Tooltip';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import LocationSelector from '../../components/LocationSelector';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import Head from 'next/head';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS (from fs-shared.jsx Session 3)
// ─────────────────────────────────────────────────────────────────────────────

const DARK = {
  bg: '#0B0F17',
  surface: '#121826',
  surfaceElevated: '#19202F',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#F2F0EA',
  textDim: 'rgba(242,240,234,0.62)',
  textFaint: 'rgba(242,240,234,0.4)',
  accent: '#E97C4D',
  accentSoft: 'rgba(233,124,77,0.14)',
  accentInk: '#0B0F17',
  success: '#7BB07B',
  warn: '#E0A85B',
  chipBg: 'rgba(255,255,255,0.06)',
};

const LIGHT = {
  bg: '#F4EFE7',
  surface: '#FBF8F2',
  surfaceElevated: '#FFFFFF',
  border: 'rgba(20,18,14,0.10)',
  borderStrong: 'rgba(20,18,14,0.18)',
  text: '#1A1814',
  textDim: 'rgba(26,24,20,0.62)',
  textFaint: 'rgba(26,24,20,0.4)',
  accent: '#C8552B',
  accentSoft: 'rgba(200,85,43,0.10)',
  accentInk: '#FBF8F2',
  success: '#3F7A4B',
  warn: '#A87420',
  chipBg: 'rgba(20,18,14,0.05)',
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

type SaleTypeKey = 'ESTATE' | 'YARD' | 'AUCTION' | 'FLEA_MARKET' | 'RETAIL';

interface DayHours {
  date: string; // ISO date
  label: string;
  startTime: string;
  endTime: string;
}

interface WizardFormData {
  // Step 1
  saleType: SaleTypeKey;
  saleSubtype: string;
  title: string;
  description: string;
  isCharitySale: boolean;
  // Step 2
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  sameHoursEachDay: boolean;
  dayHours: DayHours[];
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  isOnlineOnly: boolean; // TODO: wire to isOnlineOnly field once schema migration lands
  entranceNote: string;
  entranceLat: number | null;
  entranceLng: number | null;
  // Step 3 — photos handled separately via photoUrls
  // Step 4
  tags: string[];
  customTagInput: string;
  notes: string;
  holdDurationHours: number;
  returnWindowHours: number | null;
  // Auction extras
  buyersPremiumPct: number | null;
  biddingType: string;
  // Flea market extras
  vendorCount: string;
  isRecurring: boolean;
  // Retail
  retailAutoRenewDays: number;
  locationId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const WIZARD_STEPS = [
  { n: 1, key: 'type', label: 'Type & name' },
  { n: 2, key: 'where', label: 'Dates & location' },
  { n: 3, key: 'photos', label: 'Photos' },
  { n: 4, key: 'details', label: 'Details' },
  { n: 5, key: 'review', label: 'Review & publish' },
];

const SALE_TYPE_TILES = [
  {
    key: 'ESTATE' as SaleTypeKey,
    label: 'Estate Sale',
    desc: 'A whole-house sale, often after a downsize or a passing.',
    icon: '🏠',
    subs: [{ value: 'estate', label: 'Estate Sale' }],
    hasCharityToggle: true,
  },
  {
    key: 'YARD' as SaleTypeKey,
    label: 'Yard & Moving',
    desc: 'A weekend sale at your home — stuff you no longer need.',
    icon: '🏷️',
    subs: [
      { value: 'yard', label: 'Yard / Garage Sale' },
      { value: 'moving', label: 'Moving Sale' },
    ],
    hasCharityToggle: false,
  },
  {
    key: 'AUCTION' as SaleTypeKey,
    label: 'Auction',
    desc: 'Bidding event — live, online, or storage unit lots.',
    icon: '🔨',
    subs: [
      { value: 'auction', label: 'Auction House' },
      { value: 'storage', label: 'Storage Auction' },
    ],
    hasCharityToggle: false,
  },
  {
    key: 'FLEA_MARKET' as SaleTypeKey,
    label: 'Market & Pop-Up',
    desc: 'Recurring vendor market or temporary pop-up event.',
    icon: '🛍️',
    subs: [
      { value: 'flea', label: 'Flea Market' },
      { value: 'popup', label: 'Pop-Up Event' },
    ],
    hasCharityToggle: false,
  },
];

const TAG_OPTIONS = [
  'Furniture', 'Jewelry', 'Vintage', 'Tools', 'Clothing',
  'Books', 'Collectibles', 'Kitchen', 'Mid-century', 'Toys',
  'Records', 'Art',
];

const DEFAULT_FORM: WizardFormData = {
  saleType: 'ESTATE',
  saleSubtype: 'estate',
  title: '',
  description: '',
  isCharitySale: false,
  startDate: '',
  endDate: '',
  startTime: '09:00',
  endTime: '15:00',
  sameHoursEachDay: true,
  dayHours: [],
  address: '',
  city: '',
  state: '',
  zip: '',
  lat: null,
  lng: null,
  isOnlineOnly: false,
  entranceNote: '',
  entranceLat: null,
  entranceLng: null,
  tags: [],
  customTagInput: '',
  notes: '',
  holdDurationHours: 48,
  returnWindowHours: null,
  buyersPremiumPct: null,
  biddingType: 'Timed online',
  vendorCount: '',
  isRecurring: false,
  retailAutoRenewDays: 30,
  locationId: null,
};

const DRAFT_KEY = 'findasale_create_sale_draft';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const check = () => setDark(document.documentElement.classList.contains('dark'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

interface ToggleSwitchProps {
  on: boolean;
  onToggle: () => void;
  accent: string;
  borderStrong: string;
}
function ToggleSwitch({ on, onToggle, accent, borderStrong }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      style={{
        width: 36, height: 20, borderRadius: 999,
        background: on ? accent : borderStrong,
        padding: 2, flexShrink: 0,
        display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
        border: 'none', cursor: 'pointer', transition: 'background 0.18s',
      }}
    >
      <div style={{ width: 16, height: 16, borderRadius: 999, background: '#fff' }} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR (desktop step indicator)
// ─────────────────────────────────────────────────────────────────────────────

interface SidebarProps {
  current: number;
  c: typeof LIGHT;
  lastSaved: Date | null;
}
function WizardSidebar({ current, c, lastSaved }: SidebarProps) {
  const secondsAgo = lastSaved
    ? Math.floor((Date.now() - lastSaved.getTime()) / 1000)
    : null;
  const savedLabel = secondsAgo === null
    ? 'Not yet saved'
    : secondsAgo < 60
    ? `${secondsAgo}s ago`
    : `${Math.floor(secondsAgo / 60)}m ago`;

  return (
    <aside style={{
      width: 240, padding: '28px 20px',
      borderRight: `1px solid ${c.border}`,
      background: c.surface, flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      minHeight: '100vh',
    }}>
      <div style={{
        fontFamily: '"Inter Tight", "Inter", sans-serif',
        fontWeight: 700, fontSize: 16, marginBottom: 4,
        color: c.text,
      }}>
        Find<span style={{ color: c.accent }}>A</span>.Sale
        <span style={{
          marginLeft: 8,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 9, letterSpacing: '0.08em',
          color: c.textFaint, padding: '2px 6px',
          border: `1px solid ${c.border}`, borderRadius: 4,
        }}>ORG</span>
      </div>
      <div style={{ fontSize: 11, color: c.textDim, marginBottom: 28, fontFamily: 'Inter, sans-serif' }}>
        New Sale · Draft
      </div>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          position: 'absolute', left: 11, top: 14, bottom: 14, width: 2,
          background: c.border,
        }} />
        {WIZARD_STEPS.map(s => {
          const done = s.n < current;
          const active = s.n === current;
          return (
            <div key={s.n} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 0', position: 'relative', zIndex: 1,
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: 999, flexShrink: 0,
                background: done ? c.success : (active ? c.accent : c.surfaceElevated),
                color: done || active ? c.accentInk : c.textFaint,
                border: done || active ? 'none' : `1.5px solid ${c.borderStrong}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 600,
              }}>
                {done ? '✓' : s.n}
              </div>
              <span style={{
                fontSize: 13, fontFamily: 'Inter, sans-serif',
                color: active ? c.text : (done ? c.textDim : c.textFaint),
                fontWeight: active ? 500 : 400,
              }}>{s.label}</span>
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{
        marginTop: 24, padding: 14, borderRadius: 10,
        background: c.chipBg, fontSize: 12, color: c.textDim, lineHeight: 1.5,
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          color: c.text, fontWeight: 500, fontSize: 12, marginBottom: 4,
        }}>
          ✓ Auto-saved
        </div>
        {savedLabel}. Close this and your draft will be here when you come back.
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE STEP BAR
// ─────────────────────────────────────────────────────────────────────────────

function MobileStepBar({ current, c }: { current: number; c: typeof LIGHT }) {
  const step = WIZARD_STEPS.find(s => s.n === current) || WIZARD_STEPS[0];
  const pct = Math.round(((current - 1) / (WIZARD_STEPS.length - 1)) * 100);
  return (
    <div style={{
      padding: '12px 16px 0',
      background: c.surface,
      borderBottom: `1px solid ${c.border}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, fontFamily: 'Inter, sans-serif',
      }}>
        <span style={{ fontSize: 12, color: c.textFaint }}>
          Step {current} of {WIZARD_STEPS.length}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{step.label}</span>
      </div>
      <div style={{
        height: 3, borderRadius: 999, background: c.chipBg, overflow: 'hidden', marginBottom: 12,
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: c.accent, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WIZARD HEADER
// ─────────────────────────────────────────────────────────────────────────────

function WizardHeader({ eyebrow, title, sub, c }: {
  eyebrow?: string; title: string; sub?: string; c: typeof LIGHT;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      {eyebrow && (
        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: c.accent, marginBottom: 10,
        }}>{eyebrow}</div>
      )}
      <h1 style={{
        fontFamily: '"Inter Tight", "Inter", sans-serif',
        fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 600,
        letterSpacing: '-0.025em', margin: 0, lineHeight: 1.1,
        color: c.text,
      }}>{title}</h1>
      {sub && (
        <p style={{
          margin: '10px 0 0', fontSize: 14, color: c.textDim,
          lineHeight: 1.55, maxWidth: 580, fontFamily: 'Inter, sans-serif',
        }}>{sub}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WIZARD FOOTER
// ─────────────────────────────────────────────────────────────────────────────

interface FooterProps {
  c: typeof LIGHT;
  onBack?: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  nextLabel?: string;
  backLabel?: string;
  warn?: string;
  nextDisabled?: boolean;
}
function WizardFooter({ c, onBack, onNext, onSaveDraft, nextLabel = 'Continue', backLabel = 'Back', warn, nextDisabled }: FooterProps) {
  return (
    <div style={{
      borderTop: `1px solid ${c.border}`,
      padding: '16px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: c.bg, gap: 12,
      flexWrap: 'wrap',
    }}>
      <button
        type="button"
        onClick={onSaveDraft}
        style={{
          fontSize: 13, color: c.textFaint, cursor: 'pointer',
          background: 'none', border: 'none', padding: '6px 0',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        💾 Save draft &amp; exit
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {warn && (
          <span style={{
            fontSize: 12, color: c.warn,
            fontFamily: 'Inter, sans-serif',
          }}>⚠ {warn}</span>
        )}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: '9px 16px', borderRadius: 8,
              background: 'transparent', color: c.text,
              border: `1px solid ${c.borderStrong}`,
              fontWeight: 500, fontSize: 13, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >{backLabel}</button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          style={{
            padding: '11px 22px', borderRadius: 8,
            background: nextDisabled ? c.chipBg : c.accent,
            color: nextDisabled ? c.textFaint : c.accentInk,
            border: 'none', fontWeight: 600, fontSize: 14,
            cursor: nextDisabled ? 'not-allowed' : 'pointer',
            fontFamily: 'Inter, sans-serif',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >{nextLabel} →</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Sale type + name
// ─────────────────────────────────────────────────────────────────────────────

interface Step1Props {
  c: typeof LIGHT;
  form: WizardFormData;
  setForm: React.Dispatch<React.SetStateAction<WizardFormData>>;
}
function Step1({ c, form, setForm }: Step1Props) {
  const [showDescription, setShowDescription] = useState(!!form.description);

  const selectedTile = SALE_TYPE_TILES.find(t => t.key === form.saleType);

  const titleSuggestions: Record<SaleTypeKey, string[]> = {
    ESTATE: ['Smith Family Estate Sale', 'Walden Estate · Main St', '3-Day Estate Sale'],
    YARD: ['Weekend Yard Sale', 'Spring Garage Sale', 'Moving Sale — All Must Go'],
    AUCTION: ['Walden Estate Auction', 'Antiques & Collectibles Auction', 'Live Auction Event'],
    FLEA_MARKET: ['Riverside Flea Market', 'Monthly Pop-Up Market', 'Vintage Vendor Market'],
    RETAIL: ['Antique & Vintage Shop', 'Estate Finds Store', 'Consignment Boutique'],
  };

  return (
    <div style={{ padding: '0 0 24px' }}>
      <WizardHeader
        eyebrow="Step 1 of 5"
        title="What kind of sale are you putting on?"
        sub="Pick the closest fit — you can fine-tune the details after."
        c={c}
      />

      {/* 2×2 tile grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 14, marginBottom: 28,
      }}>
        {SALE_TYPE_TILES.map(tile => {
          const isOpen = form.saleType === tile.key;
          return (
            <div
              key={tile.key}
              onClick={() => setForm(f => ({
                ...f,
                saleType: tile.key,
                saleSubtype: tile.subs[0].value,
                title: '',
              }))}
              style={{
                background: isOpen ? c.surface : c.surfaceElevated,
                border: `1.5px solid ${isOpen ? c.accent : c.border}`,
                borderRadius: 14, padding: 20,
                cursor: 'pointer',
                boxShadow: isOpen ? `0 0 0 3px ${c.accentSoft}` : 'none',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, fontSize: 20,
                  background: isOpen ? c.accent : c.chipBg,
                  color: isOpen ? c.accentInk : c.text,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>{tile.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: '"Inter Tight", "Inter", sans-serif',
                    fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em',
                    color: c.text,
                  }}>{tile.label}</div>
                  <div style={{ marginTop: 3, fontSize: 13, color: c.textDim, lineHeight: 1.4, fontFamily: 'Inter, sans-serif' }}>
                    {tile.desc}
                  </div>
                </div>
                <div style={{
                  width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                  border: `2px solid ${isOpen ? c.accent : c.borderStrong}`,
                  background: isOpen ? c.accent : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: c.accentInk,
                }}>
                  {isOpen && <span style={{ fontSize: 12 }}>✓</span>}
                </div>
              </div>

              {/* Expanded subtypes */}
              {isOpen && tile.subs.length > 1 && (
                <div style={{
                  marginTop: 14, paddingTop: 14,
                  borderTop: `1px solid ${c.border}`,
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: c.textFaint, marginBottom: 2,
                  }}>Pick the closest fit</div>
                  {tile.subs.map((s, i) => (
                    <div
                      key={s.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        setForm(f => ({ ...f, saleSubtype: s.value }));
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 12px', borderRadius: 8,
                        background: form.saleSubtype === s.value ? c.chipBg : 'transparent',
                        border: `1px solid ${form.saleSubtype === s.value ? c.borderStrong : c.border}`,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: 999,
                        border: `2px solid ${form.saleSubtype === s.value ? c.accent : c.borderStrong}`,
                        background: form.saleSubtype === s.value ? c.accent : 'transparent',
                        flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 13.5, color: c.text,
                        fontWeight: form.saleSubtype === s.value ? 500 : 400,
                        fontFamily: 'Inter, sans-serif',
                      }}>{s.label}</span>
                    </div>
                  ))}

                  {/* Charity toggle for Estate */}
                  {tile.hasCharityToggle && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setForm(f => ({ ...f, isCharitySale: !f.isCharitySale }));
                      }}
                      style={{
                        marginTop: 2,
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 12px', borderRadius: 8,
                        background: form.isCharitySale ? c.accentSoft : 'transparent',
                        border: `1px dashed ${form.isCharitySale ? c.accent : c.borderStrong}`,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: 4,
                        border: `2px solid ${c.accent}`,
                        background: form.isCharitySale ? c.accent : 'transparent',
                        flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {form.isCharitySale && <span style={{ fontSize: 9, color: c.accentInk }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 13, color: c.text, fontFamily: 'Inter, sans-serif' }}>
                        ♥ This is a benefit or charity sale
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info note about online-only */}
      <div style={{
        marginBottom: 20, padding: '11px 14px', borderRadius: 8,
        background: c.surface, border: `1px solid ${c.border}`,
        fontSize: 12.5, color: c.textDim, fontFamily: 'Inter, sans-serif',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        ℹ Online-only sales? Set that on the next step — "No physical address — items ship to buyers".
      </div>

      {/* Title section */}
      <div style={{
        padding: 24,
        background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14,
      }}>
        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: c.textFaint, marginBottom: 14,
        }}>Now name it</div>

        <label style={{
          display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12,
          fontFamily: 'Inter, sans-serif',
        }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>
            Sale title{' '}
            <span style={{ fontSize: 11, color: c.textFaint, fontWeight: 400 }}>
              — shows on the map and in search
            </span>
          </span>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder={selectedTile ? `e.g., ${titleSuggestions[selectedTile.key][0]}` : 'e.g., Smith Family Estate Sale'}
            required
            style={{
              padding: '11px 14px', borderRadius: 8,
              background: c.surfaceElevated,
              border: `1.5px solid ${c.accent}`,
              fontSize: 14, color: c.text, fontFamily: 'Inter, sans-serif',
              outline: 'none',
            }}
          />
        </label>

        {/* Suggestions */}
        {selectedTile && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            <span style={{
              fontSize: 10.5, color: c.textFaint, alignSelf: 'center',
              fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.05em',
              marginRight: 4, textTransform: 'uppercase',
            }}>Suggestions</span>
            {titleSuggestions[selectedTile.key].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setForm(f => ({ ...f, title: s }))}
                style={{
                  padding: '6px 12px', borderRadius: 999,
                  background: c.chipBg, color: c.text,
                  border: '1px solid transparent',
                  fontSize: 12.5, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}
              >{s}</button>
            ))}
          </div>
        )}

        {/* Description expander */}
        {!showDescription ? (
          <button
            type="button"
            onClick={() => setShowDescription(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '11px 14px', background: c.surfaceElevated,
              border: `1px dashed ${c.border}`, borderRadius: 8,
              color: c.textFaint, fontSize: 13.5, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', width: '100%',
            }}
          >
            + Add a description for shoppers (optional)
          </button>
        ) : (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'Inter, sans-serif' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>
              Description <span style={{ fontSize: 11, color: c.textFaint, fontWeight: 400 }}>Optional</span>
            </span>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Tell shoppers what to expect — highlights, specialty items, condition of goods."
              rows={3}
              style={{
                padding: '11px 14px', borderRadius: 8,
                background: c.surfaceElevated,
                border: `1.5px solid ${c.border}`,
                fontSize: 14, color: c.text, fontFamily: 'Inter, sans-serif',
                resize: 'vertical', outline: 'none',
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Dates & location
// ─────────────────────────────────────────────────────────────────────────────

interface Step2Props {
  c: typeof LIGHT;
  form: WizardFormData;
  setForm: React.Dispatch<React.SetStateAction<WizardFormData>>;
  validationErrors: Record<string, string>;
  setValidationErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}
function Step2({ c, form, setForm, validationErrors, setValidationErrors }: Step2Props) {
  const [showEntrance, setShowEntrance] = useState(!!(form.entranceNote));

  const isRetail = form.saleType === 'RETAIL';

  const validateDates = () => {
    const errs: Record<string, string> = {};
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (form.startDate) {
      const sd = new Date(form.startDate); sd.setHours(0, 0, 0, 0);
      if (sd < today) errs.startDate = 'Start date must be today or in the future';
    }
    if (form.startDate && form.endDate) {
      const sd = new Date(form.startDate); sd.setHours(0, 0, 0, 0);
      const ed = new Date(form.endDate); ed.setHours(0, 0, 0, 0);
      if (ed <= sd) errs.endDate = 'End date must be after start date';
    }
    setValidationErrors(prev => ({ ...prev, ...errs }));
    return Object.keys(errs).length === 0;
  };

  const inputStyle: React.CSSProperties = {
    padding: '11px 14px', borderRadius: 8, width: '100%', boxSizing: 'border-box',
    background: c.surfaceElevated, border: `1.5px solid ${c.border}`,
    fontSize: 14, color: c.text, fontFamily: 'Inter, sans-serif', outline: 'none',
  };

  return (
    <div style={{ padding: '0 0 24px' }}>
      <WizardHeader
        eyebrow="Step 2 of 5"
        title="When and where?"
        sub={isRetail ? 'Set your store address. Retail stores stay live automatically.' : 'Pick the day(s) you\'ll be open and the address shoppers should drive to.'}
        c={c}
      />

      {/* Online Only toggle */}
      <div style={{
        marginBottom: 20, padding: '14px 18px',
        background: form.isOnlineOnly ? c.accentSoft : c.surface,
        border: `1px solid ${form.isOnlineOnly ? c.accent : c.border}`,
        borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: c.text, fontFamily: 'Inter, sans-serif' }}>
            Online Only — No physical address
          </div>
          <div style={{ fontSize: 12, color: c.textDim, marginTop: 2, fontFamily: 'Inter, sans-serif' }}>
            Items ship to buyers. Address section hides.
            {/* TODO: wire to isOnlineOnly field once schema migration lands */}
          </div>
        </div>
        <ToggleSwitch
          on={form.isOnlineOnly}
          onToggle={() => setForm(f => ({ ...f, isOnlineOnly: !f.isOnlineOnly }))}
          accent={c.accent}
          borderStrong={c.borderStrong}
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 20,
      }}>
        {/* DATES panel */}
        {!isRetail && (
          <div style={{
            background: c.surface, border: `1px solid ${c.border}`,
            borderRadius: 14, padding: 22,
          }}>
            <div style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: c.textFaint, marginBottom: 14,
            }}>Dates</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontFamily: 'Inter, sans-serif' }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: c.text }}>Start date</span>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  onBlur={validateDates}
                  min={new Date().toISOString().split('T')[0]}
                  required
                  style={{ ...inputStyle }}
                />
                {validationErrors.startDate && (
                  <span style={{ fontSize: 11, color: '#D44' }}>{validationErrors.startDate}</span>
                )}
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontFamily: 'Inter, sans-serif' }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: c.text }}>End date</span>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  onBlur={validateDates}
                  min={form.startDate || new Date().toISOString().split('T')[0]}
                  required
                  style={{ ...inputStyle }}
                />
                {validationErrors.endDate && (
                  <span style={{ fontSize: 11, color: '#D44' }}>{validationErrors.endDate}</span>
                )}
              </label>
            </div>

            <div style={{
              paddingTop: 16, borderTop: `1px solid ${c.border}`,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
              }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: c.text, fontFamily: 'Inter, sans-serif' }}>Hours</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: c.textDim, fontFamily: 'Inter, sans-serif' }}>
                  Same each day
                  <ToggleSwitch
                    on={form.sameHoursEachDay}
                    onToggle={() => setForm(f => ({ ...f, sameHoursEachDay: !f.sameHoursEachDay }))}
                    accent={c.accent}
                    borderStrong={c.borderStrong}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontFamily: 'Inter, sans-serif' }}>
                  <span style={{ fontSize: 11.5, color: c.textDim }}>Open</span>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                    style={{ ...inputStyle, fontFamily: '"JetBrains Mono", monospace' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontFamily: 'Inter, sans-serif' }}>
                  <span style={{ fontSize: 11.5, color: c.textDim }}>Close</span>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    style={{ ...inputStyle, fontFamily: '"JetBrains Mono", monospace' }}
                  />
                </label>
              </div>
              <p style={{ fontSize: 11, color: c.textFaint, marginTop: 8, fontFamily: 'Inter, sans-serif' }}>
                Times are in your local timezone.
              </p>
            </div>
          </div>
        )}

        {/* LOCATION panel */}
        {!form.isOnlineOnly && (
          <div style={{
            background: c.surface, border: `1px solid ${c.border}`,
            borderRadius: 14, padding: 22,
          }}>
            <div style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: c.textFaint, marginBottom: 14,
            }}>Location</div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, fontFamily: 'Inter, sans-serif' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>
                Sale address{' '}
                <Tooltip content="Your exact address is shown to shoppers after the sale is published. It's used to show your sale on the map." />
              </span>
              <AddressAutocomplete
                id="address"
                name="address"
                value={form.address}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setForm(f => ({ ...f, address: e.target.value }))
                }
                onSuggestionSelected={(suggestion: {
                  address: string; city: string; state: string; zip: string; lat: number; lng: number;
                }) => {
                  setForm(f => ({
                    ...f,
                    address: suggestion.address,
                    city: suggestion.city,
                    state: suggestion.state,
                    zip: suggestion.zip,
                    lat: suggestion.lat,
                    lng: suggestion.lng,
                  }));
                }}
                placeholder="123 Main St"
                required
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 10, marginBottom: 16 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontFamily: 'Inter, sans-serif' }}>
                <span style={{ fontSize: 11.5, color: c.textDim }}>City</span>
                <input
                  type="text"
                  value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  required
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontFamily: 'Inter, sans-serif' }}>
                <span style={{ fontSize: 11.5, color: c.textDim }}>State</span>
                <input
                  type="text"
                  value={form.state}
                  onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                  maxLength={2}
                  required
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontFamily: 'Inter, sans-serif' }}>
                <span style={{ fontSize: 11.5, color: c.textDim }}>ZIP</span>
                <input
                  type="text"
                  value={form.zip}
                  onChange={e => setForm(f => ({ ...f, zip: e.target.value }))}
                  required
                  style={inputStyle}
                />
              </label>
            </div>

            {/* Map pin preview placeholder */}
            {form.lat && form.lng && (
              <div style={{
                height: 120, borderRadius: 10, overflow: 'hidden',
                border: `1px solid ${c.border}`, marginBottom: 14,
                background: 'linear-gradient(135deg, #e8e2d6 0%, #d6cfc0 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, color: c.textDim, fontFamily: 'Inter, sans-serif',
              }}>
                📍 {form.address}
              </div>
            )}

            {/* Entrance / parking */}
            <div style={{
              padding: 14, background: c.surfaceElevated, borderRadius: 10,
              border: `1px solid ${c.border}`,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showEntrance ? 10 : 0,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: c.text, fontFamily: 'Inter, sans-serif' }}>
                    Entrance &amp; parking
                  </div>
                  <div style={{ fontSize: 12, color: c.textDim, fontFamily: 'Inter, sans-serif' }}>
                    Optional — note for shoppers on how to get in.
                  </div>
                </div>
                <ToggleSwitch
                  on={showEntrance}
                  onToggle={() => setShowEntrance(v => !v)}
                  accent={c.accent}
                  borderStrong={c.borderStrong}
                />
              </div>
              {showEntrance && (
                <textarea
                  value={form.entranceNote}
                  onChange={e => setForm(f => ({ ...f, entranceNote: e.target.value }))}
                  placeholder="Park on Caldwell. Side gate by the magnolia tree."
                  rows={2}
                  maxLength={150}
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* Online Only message */}
        {form.isOnlineOnly && (
          <div style={{
            background: c.surface, border: `1px solid ${c.border}`,
            borderRadius: 14, padding: 22,
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{ fontSize: 36 }}>🚢</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: c.text, fontFamily: '"Inter Tight", "Inter", sans-serif' }}>
                Ships nationwide
              </div>
              <div style={{ fontSize: 13, color: c.textDim, marginTop: 4, fontFamily: 'Inter, sans-serif' }}>
                No physical address required. Buyers will see "Ships nationwide" on your sale listing.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Multi-location selector */}
      <div style={{ marginTop: 16 }}>
        <LocationSelector
          value={form.locationId}
          onChange={(locationId: string | null) => setForm(f => ({ ...f, locationId }))}
          label="Location (optional)"
          placeholder="Link to an existing location"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Photos
// ─────────────────────────────────────────────────────────────────────────────

interface Step3Props {
  c: typeof LIGHT;
  photoUrls: string[];
  setPhotoUrls: React.Dispatch<React.SetStateAction<string[]>>;
}
function Step3({ c, photoUrls, setPhotoUrls }: Step3Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploads = Array.from(files).slice(0, 20 - photoUrls.length);
      const uploadPromises = uploads.map(async (file) => {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', 'findasale_unsigned');
        const res = await fetch('https://api.cloudinary.com/v1_1/findasale/image/upload', {
          method: 'POST', body: fd,
        });
        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        return data.secure_url as string;
      });
      const urls = await Promise.all(uploadPromises);
      setPhotoUrls(prev => [...prev, ...urls].slice(0, 20));
    } catch {
      // silently handle — toast handled by parent
    } finally {
      setUploading(false);
    }
  }, [photoUrls.length, setPhotoUrls]);

  const removePhoto = (idx: number) => {
    setPhotoUrls(prev => prev.filter((_, i) => i !== idx));
  };

  const movePhoto = (from: number, to: number) => {
    if (to < 0 || to >= photoUrls.length) return;
    setPhotoUrls(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  };

  const recommended = 3;
  const count = photoUrls.length;
  const pct = Math.min(count / recommended, 1) * 100;

  return (
    <div style={{ padding: '0 0 24px' }}>
      <WizardHeader
        eyebrow="Step 3 of 5 · the most important step"
        title="Photos do the selling."
        sub="Upload at least 3 to publish. Drag to reorder — the first becomes your cover. We'll resize and optimize automatically."
        c={c}
      />

      {/* Counter strip */}
      <div style={{
        marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 18px', background: c.surface,
        border: `1px solid ${c.border}`, borderRadius: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: '"Inter Tight", "Inter", sans-serif',
            fontSize: 22, fontWeight: 600, color: c.text,
          }}>{count}</span>
          <span style={{ fontSize: 12.5, color: c.textDim, fontFamily: 'Inter, sans-serif' }}>
            of {recommended} recommended
          </span>
        </div>
        <div style={{ flex: 1, height: 6, borderRadius: 999, background: c.chipBg, overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: count >= recommended ? c.success : c.accent,
            transition: 'width 0.3s',
          }} />
        </div>
        {count >= recommended && (
          <span style={{
            fontSize: 11.5, color: c.success,
            fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.03em',
          }}>✓ Above target</span>
        )}
      </div>

      {/* Photo grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 12, marginBottom: 20,
      }}>
        {photoUrls.map((url, idx) => (
          <div key={url} style={{ position: 'relative', aspectRatio: '1/1' }}>
            <img
              src={url}
              alt={`Photo ${idx + 1}`}
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                borderRadius: 10, border: `1.5px solid ${idx === 0 ? c.accent : c.border}`,
              }}
            />
            {idx === 0 && (
              <div style={{
                position: 'absolute', top: 8, left: 8,
                padding: '3px 7px', borderRadius: 4,
                background: c.accent, color: c.accentInk,
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
              }}>Cover</div>
            )}
            <div style={{
              position: 'absolute', bottom: 6, right: 6,
              display: 'flex', gap: 4,
            }}>
              {idx > 0 && (
                <button
                  type="button"
                  onClick={() => movePhoto(idx, idx - 1)}
                  style={{
                    width: 24, height: 24, borderRadius: 6,
                    background: 'rgba(0,0,0,0.55)', color: '#fff',
                    border: 'none', cursor: 'pointer', fontSize: 11,
                  }}
                >←</button>
              )}
              {idx < photoUrls.length - 1 && (
                <button
                  type="button"
                  onClick={() => movePhoto(idx, idx + 1)}
                  style={{
                    width: 24, height: 24, borderRadius: 6,
                    background: 'rgba(0,0,0,0.55)', color: '#fff',
                    border: 'none', cursor: 'pointer', fontSize: 11,
                  }}
                >→</button>
              )}
              <button
                type="button"
                onClick={() => removePhoto(idx)}
                style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: 'rgba(180,0,0,0.7)', color: '#fff',
                  border: 'none', cursor: 'pointer', fontSize: 12,
                }}
              >×</button>
            </div>
          </div>
        ))}

        {/* Upload drop zone */}
        {photoUrls.length < 20 && (
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              aspectRatio: '1/1', borderRadius: 10,
              border: `1.5px dashed ${c.borderStrong}`,
              background: c.surface,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 8, cursor: 'pointer', color: c.textDim,
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 999, background: c.chipBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
            }}>
              {uploading ? '⏳' : '📷'}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: c.text, fontFamily: 'Inter, sans-serif' }}>
              {uploading ? 'Uploading…' : 'Add photos'}
            </div>
            <div style={{
              fontSize: 11, color: c.textFaint,
              fontFamily: '"JetBrains Mono", monospace',
            }}>JPG · PNG · HEIC · up to 20</div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={e => handleFileChange(e.target.files)}
        style={{ display: 'none' }}
        aria-label="Upload photos"
      />

      {/* Camera button (mobile primary) */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            flex: 1, padding: '13px', borderRadius: 10,
            background: c.accent, color: c.accentInk,
            border: 'none', fontWeight: 600, fontSize: 15,
            cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          📷 Take / Upload Photo
        </button>
      </div>

      {/* Photo tips */}
      <div style={{
        padding: 18, background: c.accentSoft,
        border: `1px solid ${c.accentSoft}`,
        borderRadius: 10,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
          color: c.accent, fontWeight: 500, fontSize: 13, fontFamily: 'Inter, sans-serif',
        }}>
          ✨ Photo tips that move the needle
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}>
          {[
            { stat: '3×', text: 'more saves when your cover is a wide room shot, not a single object.' },
            { stat: '+47%', text: 'view-through when photos show 3+ rooms or sale areas.' },
            { stat: '15s', text: 'Smart tagging scans your photos and pre-fills item titles & prices.' },
          ].map((t, i) => (
            <div key={i} style={{ fontSize: 12.5, color: c.textDim, fontFamily: 'Inter, sans-serif' }}>
              <div style={{
                fontFamily: '"Inter Tight", "Inter", sans-serif',
                fontSize: 18, fontWeight: 600, color: c.text, marginBottom: 3,
              }}>{t.stat}</div>
              {t.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Details
// ─────────────────────────────────────────────────────────────────────────────

interface Step4Props {
  c: typeof LIGHT;
  form: WizardFormData;
  setForm: React.Dispatch<React.SetStateAction<WizardFormData>>;
}
function Step4({ c, form, setForm }: Step4Props) {
  const isAuction = form.saleType === 'AUCTION';
  const isFlea = form.saleType === 'FLEA_MARKET';
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customTag, setCustomTag] = useState('');

  const toggleTag = (tag: string) => {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tag)
        ? f.tags.filter(t => t !== tag)
        : [...f.tags, tag],
    }));
  };

  const addCustomTag = () => {
    const t = customTag.trim();
    if (t && !form.tags.includes(t)) {
      setForm(f => ({ ...f, tags: [...f.tags, t] }));
    }
    setCustomTag('');
  };

  const inputStyle: React.CSSProperties = {
    padding: '11px 14px', borderRadius: 8, width: '100%', boxSizing: 'border-box',
    background: c.surfaceElevated, border: `1.5px solid ${c.border}`,
    fontSize: 14, color: c.text, fontFamily: 'Inter, sans-serif', outline: 'none',
  };

  return (
    <div style={{ padding: '0 0 24px' }}>
      <WizardHeader
        eyebrow={isAuction ? 'Step 4 of 5 · auction details' : isFlea ? 'Step 4 of 5 · market details' : 'Step 4 of 5'}
        title={isAuction ? 'Bidding, lots, and previews.' : 'What will shoppers find?'}
        sub={isAuction
          ? 'Auction-specific settings. These appear on the public listing and shape how items get added next.'
          : 'Tags help shoppers filter; notes go directly on the public listing. Both are optional but help conversion.'}
        c={c}
      />

      {/* TAGS */}
      <div style={{
        background: c.surface, border: `1px solid ${c.border}`,
        borderRadius: 14, padding: 22, marginBottom: 16,
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'Inter, sans-serif' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>
            Tags — what you'll find{' '}
            <span style={{ fontSize: 11, color: c.textFaint, fontWeight: 400 }}>Pick a few or type your own.</span>
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {TAG_OPTIONS.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                style={{
                  padding: '7px 12px', borderRadius: 999,
                  background: form.tags.includes(tag) ? c.accentSoft : c.chipBg,
                  color: form.tags.includes(tag) ? c.accent : c.text,
                  border: `1px solid ${form.tags.includes(tag) ? c.accent : 'transparent'}`,
                  fontWeight: form.tags.includes(tag) ? 500 : 400,
                  fontSize: 12.5, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}
              >{tag}</button>
            ))}
            {/* Custom tags */}
            {form.tags.filter(t => !TAG_OPTIONS.includes(t)).map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                style={{
                  padding: '7px 12px', borderRadius: 999,
                  background: c.accentSoft, color: c.accent,
                  border: `1px solid ${c.accent}`,
                  fontWeight: 500, fontSize: 12.5, cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                }}
              >{tag} ×</button>
            ))}
            {/* Custom tag input */}
            <div style={{ display: 'flex', gap: 0 }}>
              <input
                type="text"
                value={customTag}
                onChange={e => setCustomTag(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
                placeholder="+ Add custom"
                style={{
                  padding: '6px 10px', borderRadius: '999px 0 0 999px',
                  background: 'transparent', color: c.textFaint,
                  border: `1px dashed ${c.borderStrong}`,
                  fontSize: 12.5, outline: 'none', fontFamily: 'Inter, sans-serif',
                  width: 120,
                }}
              />
              <button
                type="button"
                onClick={addCustomTag}
                style={{
                  padding: '6px 10px', borderRadius: '0 999px 999px 0',
                  background: c.chipBg, color: c.text,
                  border: `1px dashed ${c.borderStrong}`, borderLeft: 'none',
                  fontSize: 12.5, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}
              >Add</button>
            </div>
          </div>
        </label>
      </div>

      {/* AUCTION extras */}
      {isAuction && (
        <div style={{
          background: c.surface, border: `1px solid ${c.border}`,
          borderRadius: 14, padding: 22, marginBottom: 16,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'Inter, sans-serif' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Bidding type</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {['Timed online', 'Live in-person', 'Both'].map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, biddingType: opt }))}
                  style={{
                    padding: '8px 14px', borderRadius: 999,
                    background: form.biddingType === opt ? c.accent : c.chipBg,
                    color: form.biddingType === opt ? c.accentInk : c.text,
                    border: 'none', fontSize: 13, cursor: 'pointer',
                    fontWeight: form.biddingType === opt ? 500 : 400,
                    fontFamily: 'Inter, sans-serif',
                  }}
                >{opt}</button>
              ))}
            </div>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'Inter, sans-serif', maxWidth: 200 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>
              Buyer&apos;s premium %{' '}
              <Tooltip content="Percentage added to the hammer price at checkout. Required disclosure for auction buyers." />
            </span>
            <input
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={form.buyersPremiumPct ?? ''}
              onChange={e => setForm(f => ({
                ...f,
                buyersPremiumPct: e.target.value ? parseFloat(e.target.value) : null,
              }))}
              placeholder="0"
              style={{ ...inputStyle }}
            />
          </label>
        </div>
      )}

      {/* FLEA MARKET extras */}
      {isFlea && (
        <div style={{
          background: c.surface, border: `1px solid ${c.border}`,
          borderRadius: 14, padding: 22, marginBottom: 16,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'Inter, sans-serif' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Approximate vendors</span>
            <input
              type="number"
              min={0}
              value={form.vendorCount}
              onChange={e => setForm(f => ({ ...f, vendorCount: e.target.value }))}
              placeholder="e.g., 40"
              style={inputStyle}
            />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'Inter, sans-serif' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Recurring event</span>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 14px', background: c.surfaceElevated,
              border: `1px solid ${c.border}`, borderRadius: 8,
            }}>
              <ToggleSwitch
                on={form.isRecurring}
                onToggle={() => setForm(f => ({ ...f, isRecurring: !f.isRecurring }))}
                accent={c.accent}
                borderStrong={c.borderStrong}
              />
              <span style={{ fontSize: 13, color: c.text }}>
                {form.isRecurring ? 'Recurring event' : 'One-time event'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* NOTES */}
      <div style={{
        background: c.surface, border: `1px solid ${c.border}`,
        borderRadius: 14, padding: 22, marginBottom: 16,
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'Inter, sans-serif' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>
            Day-of notes for shoppers{' '}
            <span style={{ fontSize: 11, color: c.textFaint, fontWeight: 400 }}>Parking, entrance, sale rules. Public.</span>
          </span>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Park along Caldwell. Side gate is open at 7:30 Friday for early-bird. Cash and Venmo preferred."
            rows={4}
            style={{
              ...inputStyle,
              resize: 'vertical',
            }}
          />
        </label>
      </div>

      {/* ADVANCED settings */}
      <button
        type="button"
        onClick={() => setShowAdvanced(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 13, color: c.textDim, cursor: 'pointer',
          background: 'none', border: 'none', padding: '6px 0',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {showAdvanced ? '▾' : '▸'} Advanced settings — holds, returns, branding overrides
      </button>

      {showAdvanced && (
        <div style={{
          marginTop: 12, background: c.surface, border: `1px solid ${c.border}`,
          borderRadius: 14, padding: 22,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'Inter, sans-serif' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>
              Hold duration (hours){' '}
              <Tooltip content="How long a shopper can hold an item before it's released. Default 48h." />
            </span>
            <input
              type="number"
              min={1}
              max={168}
              value={form.holdDurationHours}
              onChange={e => setForm(f => ({ ...f, holdDurationHours: parseInt(e.target.value) || 48 }))}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'Inter, sans-serif' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>
              Return window (hours) <span style={{ fontWeight: 400, color: c.textFaint }}>Optional</span>
            </span>
            <input
              type="number"
              min={0}
              value={form.returnWindowHours ?? ''}
              onChange={e => setForm(f => ({
                ...f,
                returnWindowHours: e.target.value ? parseInt(e.target.value) : null,
              }))}
              placeholder="None"
              style={inputStyle}
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — Review + publish
// ─────────────────────────────────────────────────────────────────────────────

interface Step5Props {
  c: typeof LIGHT;
  form: WizardFormData;
  photoCount: number;
  onPublish: () => void;
  onSaveDraft: () => void;
  onSchedule: () => void;
  isSubmitting: boolean;
  canSchedule: boolean;
  tierLimitError: null | { current: number; tier: string; limit: number; upgradeUrl: string; message: string };
  onDismissTierError: () => void;
}
function Step5({
  c, form, photoCount, onPublish, onSaveDraft, onSchedule,
  isSubmitting, canSchedule, tierLimitError, onDismissTierError,
}: Step5Props) {
  const typeLabel = SALE_TYPE_TILES.find(t => t.key === form.saleType)?.label || form.saleType;

  const summaryRows = [
    { icon: '🏷️', label: 'Sale type & title', value: `${typeLabel} · ${form.title || '(no title)'}` },
    {
      icon: '📅', label: 'Dates',
      value: form.saleType === 'RETAIL'
        ? 'Retail — always live'
        : (form.startDate && form.endDate
          ? `${form.startDate} → ${form.endDate} · ${form.startTime}–${form.endTime}`
          : '(dates not set)'),
    },
    {
      icon: '📍', label: 'Location',
      value: form.isOnlineOnly
        ? 'Ships nationwide'
        : (form.address ? `${form.address}, ${form.city}, ${form.state}` : '(address not set)'),
    },
    { icon: '📷', label: 'Photos', value: `${photoCount} photo${photoCount !== 1 ? 's' : ''}${photoCount > 0 ? ' · cover set' : ' · none added'}` },
    { icon: '✨', label: 'Tags', value: form.tags.length > 0 ? form.tags.join(', ') : 'None' },
    {
      icon: '📝', label: 'Notes',
      value: form.notes ? form.notes.substring(0, 80) + (form.notes.length > 80 ? '…' : '') : 'None',
    },
  ];

  return (
    <div style={{ padding: '0 0 24px' }}>
      <WizardHeader
        eyebrow="Step 5 of 5"
        title="Looks good. Ready to publish?"
        sub="Once you publish, the sale appears on the map, in search, and goes out to your followers. You can edit anything after."
        c={c}
      />

      {/* Tier limit error */}
      {tierLimitError && (
        <div style={{
          marginBottom: 20, padding: 18, borderRadius: 12,
          background: '#FFF3CD', border: '1px solid #F5C542',
          fontFamily: 'Inter, sans-serif',
        }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6, color: '#856404' }}>
            Concurrent Sales Limit Reached
          </div>
          <p style={{ fontSize: 13, color: '#664D03', marginBottom: 10 }}>
            You&apos;re running <strong>{tierLimitError.current}</strong> active sales. Your{' '}
            <strong>{tierLimitError.tier}</strong> tier allows{' '}
            <strong>{tierLimitError.limit}</strong>.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link
              href={tierLimitError.upgradeUrl}
              style={{
                padding: '8px 16px', borderRadius: 8,
                background: c.accent, color: c.accentInk,
                fontWeight: 600, fontSize: 13, textDecoration: 'none',
              }}
            >Upgrade to PRO</Link>
            <button
              type="button"
              onClick={onDismissTierError}
              style={{
                padding: '8px 12px', borderRadius: 8,
                background: 'transparent', border: '1px solid #856404',
                color: '#856404', cursor: 'pointer', fontSize: 13,
              }}
            >Dismiss</button>
          </div>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 340px)',
        gap: 24, alignItems: 'start',
      }}>
        {/* Summary card */}
        <div style={{
          background: c.surface, border: `1px solid ${c.border}`,
          borderRadius: 14, padding: '4px 22px 20px',
        }}>
          {summaryRows.map((row, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '13px 0',
                borderBottom: i < summaryRows.length - 1 ? `1px solid ${c.border}` : 'none',
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: c.chipBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, fontSize: 14,
              }}>{row.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 10.5, color: c.textFaint,
                  fontFamily: '"JetBrains Mono", monospace',
                  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3,
                }}>{row.label}</div>
                <div style={{ fontSize: 13.5, color: c.text, fontFamily: 'Inter, sans-serif' }}>{row.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Publish rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: c.surfaceElevated, border: `1px solid ${c.border}`,
            borderRadius: 14, padding: 20,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{
              fontFamily: '"Inter Tight", "Inter", sans-serif',
              fontSize: 17, fontWeight: 600, color: c.text,
            }}>Publish options</div>

            <button
              type="button"
              onClick={onPublish}
              disabled={isSubmitting}
              style={{
                width: '100%', padding: '14px', borderRadius: 10,
                background: isSubmitting ? c.chipBg : c.accent,
                color: isSubmitting ? c.textFaint : c.accentInk,
                border: 'none', fontWeight: 600, fontSize: 15,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontFamily: 'Inter, sans-serif',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {isSubmitting ? 'Publishing…' : 'Publish now →'}
            </button>

            {/* Schedule (Pro/Teams only) */}
            <div style={{
              padding: 14, borderRadius: 10,
              background: c.surface, border: `1px solid ${c.border}`,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
              }}>
                <div style={{
                  fontSize: 13, fontWeight: 500, color: c.text, fontFamily: 'Inter, sans-serif',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  Schedule
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 999,
                    background: c.chipBg, color: c.textDim,
                    fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.04em',
                  }}>Pro · Teams</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onSchedule}
                disabled={!canSchedule}
                style={{
                  width: '100%', padding: '10px', borderRadius: 8,
                  background: canSchedule ? c.chipBg : 'transparent',
                  color: canSchedule ? c.text : c.textFaint,
                  border: `1px solid ${c.borderStrong}`,
                  fontSize: 13, cursor: canSchedule ? 'pointer' : 'not-allowed',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {canSchedule ? 'Pick a date & time to go live' : 'Upgrade to schedule'}
              </button>
            </div>

            <button
              type="button"
              onClick={onSaveDraft}
              style={{
                width: '100%', padding: '11px', borderRadius: 10,
                background: 'transparent', color: c.text,
                border: `1px solid ${c.borderStrong}`,
                fontWeight: 500, fontSize: 13, cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              💾 Save as draft
            </button>
          </div>

          {/* Preview link */}
          <div style={{
            padding: '14px', borderRadius: 10,
            border: `1px dashed ${c.borderStrong}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 13, fontWeight: 500, color: c.text,
            cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          }}>
            👁 See how your sale page looks →
          </div>

          {photoCount === 0 && (
            <div style={{
              padding: 12, borderRadius: 8,
              background: c.accentSoft, border: `1px solid ${c.accentSoft}`,
              fontSize: 12, color: c.accent, fontFamily: 'Inter, sans-serif',
            }}>
              ⚠ Sales without photos get far fewer views. Consider adding photos before publishing.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUCCESS STATE
// ─────────────────────────────────────────────────────────────────────────────

interface SuccessStateProps {
  c: typeof LIGHT;
  saleTitle: string;
  saleId: string;
  onAddItems: () => void;
}
function SuccessState({ c, saleTitle, saleId, onAddItems }: SuccessStateProps) {
  return (
    <div style={{
      minHeight: '100vh', background: c.bg, color: c.text,
      fontFamily: 'Inter, sans-serif', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 50% 0%, ${c.accentSoft} 0%, transparent 55%)`,
      }} />
      <div style={{
        position: 'relative', maxWidth: 860, margin: '0 auto',
        padding: '64px 24px 48px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 64, height: 64, margin: '0 auto 20px',
            borderRadius: 999, background: c.success, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28,
            boxShadow: `0 0 0 8px ${c.accentSoft}`,
          }}>✓</div>
          <div style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: c.success, marginBottom: 10,
          }}>Live now</div>
          <h1 style={{
            fontFamily: '"Inter Tight", "Inter", sans-serif',
            fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 600,
            letterSpacing: '-0.025em', margin: 0, lineHeight: 1.1, color: c.text,
          }}>
            {saleTitle || 'Your sale'} is live.
          </h1>
          <p style={{
            fontSize: 15, color: c.textDim, marginTop: 12, lineHeight: 1.55,
            maxWidth: 520, margin: '12px auto 0',
          }}>
            Shoppers can now see it on the map. Share the link to drive more traffic.
          </p>
        </div>

        {/* Next step */}
        <div style={{
          marginTop: 28, padding: 22,
          background: c.accentSoft, border: `1px solid ${c.accentSoft}`,
          borderRadius: 14, display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: c.accent, color: c.accentInk,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, fontSize: 20,
          }}>🛒</div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: '"Inter Tight", "Inter", sans-serif',
              fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: c.text,
            }}>Now add your items</div>
            <div style={{ fontSize: 13, color: c.textDim, marginTop: 3 }}>
              Snap a photo — Smart will suggest a title &amp; price. Review, save, repeat. About 15 seconds per item.
            </div>
          </div>
          <button
            type="button"
            onClick={onAddItems}
            style={{
              padding: '12px 22px', borderRadius: 10,
              background: c.accent, color: c.accentInk,
              border: 'none', fontWeight: 600, fontSize: 14,
              cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              flexShrink: 0,
            }}
          >Add items →</button>
        </div>

        <div style={{
          marginTop: 18, display: 'flex', alignItems: 'center', gap: 16,
          justifyContent: 'center', fontSize: 13, color: c.textFaint,
        }}>
          <Link href="/organizer/dashboard" style={{ color: c.textFaint }}>
            Skip for now — go to dashboard
          </Link>
          <span>·</span>
          <Link href={`/sales/${saleId}`} style={{ color: c.accent }}>
            View public listing
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRO MODAL (first sale free pro)
// ─────────────────────────────────────────────────────────────────────────────

function ProModal({ c, saleId, onClose }: { c: typeof LIGHT; saleId: string; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50, padding: 16,
    }}>
      <div style={{
        background: c.surfaceElevated, border: `1px solid ${c.border}`,
        borderRadius: 16, maxWidth: 420, width: '100%', padding: 32,
        fontFamily: 'Inter, sans-serif',
      }}>
        <h2 style={{
          fontFamily: '"Inter Tight", "Inter", sans-serif',
          fontSize: 22, fontWeight: 600, marginBottom: 12, color: c.text,
        }}>
          Your first sale is on PRO — on us 🎉
        </h2>
        <p style={{ fontSize: 14, color: c.textDim, marginBottom: 20, lineHeight: 1.6 }}>
          We&apos;ve unlocked PRO features for your first sale. Unlimited item listings, up to 10 photos per item, Smart auto-tagging, and priority placement on FindA.Sale.
        </p>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%', padding: '14px', borderRadius: 10,
            background: c.accent, color: c.accentInk,
            border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer',
          }}
        >
          Start Adding Items →
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

const CreateSalePage: React.FC = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { canAccess } = useOrganizerTier();
  const { showToast } = useToast();
  const isDark = useIsDark();
  const c = isDark ? DARK : LIGHT;

  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState<WizardFormData>(() => {
    // Restore draft from localStorage
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) return { ...DEFAULT_FORM, ...JSON.parse(saved) };
      } catch { /* ignore */ }
    }
    return DEFAULT_FORM;
  });
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [tierLimitError, setTierLimitError] = useState<null | {
    current: number; tier: string; limit: number; upgradeUrl: string; message: string;
  }>(null);
  const [showProModal, setShowProModal] = useState(false);
  const [publishedSaleId, setPublishedSaleId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [published, setPublished] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  // Auth guard — after all hooks
  useEffect(() => {
    if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Auto-save to localStorage on every step transition
  const saveDraft = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
      setLastSaved(new Date());
    } catch { /* ignore */ }
  }, [form]);

  // Auto-save periodically
  useEffect(() => {
    const id = setInterval(saveDraft, 30_000);
    return () => clearInterval(id);
  }, [saveDraft]);

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      if (!form.title.trim()) {
        showToast('Please enter a sale title.', 'error');
        return false;
      }
    }
    if (step === 2) {
      const isRetail = form.saleType === 'RETAIL';
      if (!isRetail && !form.isOnlineOnly) {
        if (!form.startDate || !form.endDate) {
          showToast('Please set start and end dates.', 'error');
          return false;
        }
        const errs: Record<string, string> = {};
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const sd = new Date(form.startDate); sd.setHours(0, 0, 0, 0);
        if (sd < today) errs.startDate = 'Start date must be today or in the future';
        if (form.endDate) {
          const ed = new Date(form.endDate); ed.setHours(0, 0, 0, 0);
          if (ed <= sd) errs.endDate = 'End date must be after start date';
        }
        if (Object.keys(errs).length > 0) {
          setValidationErrors(errs);
          showToast('Please fix date errors.', 'error');
          return false;
        }
        if (!form.address.trim()) {
          showToast('Please enter a sale address.', 'error');
          return false;
        }
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep(currentStep)) return;
    saveDraft();
    setCurrentStep(s => Math.min(s + 1, 5));
    window.scrollTo(0, 0);
  };

  const handleBack = () => {
    saveDraft();
    setCurrentStep(s => Math.max(s - 1, 1));
    window.scrollTo(0, 0);
  };

  const handleSaveDraft = () => {
    saveDraft();
    showToast('Draft saved. Come back any time.', 'success');
    router.push('/organizer/dashboard');
  };

  const buildPayload = () => {
    const isRetail = form.saleType === 'RETAIL';
    const { lat, lng, buyersPremiumPct, entranceLat, entranceLng, ...rest } = form;

    return {
      title: form.title,
      description: form.description || undefined,
      saleType: form.saleType,
      startDate: isRetail
        ? new Date().toISOString()
        : form.startDate
          ? new Date(`${form.startDate}T${form.startTime}`).toISOString()
          : undefined,
      endDate: isRetail
        ? new Date(Date.now() + form.retailAutoRenewDays * 24 * 60 * 60 * 1000).toISOString()
        : form.endDate
          ? new Date(`${form.endDate}T${form.endTime}`).toISOString()
          : undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      zip: form.zip || undefined,
      ...(lat !== null ? { lat } : {}),
      ...(lng !== null ? { lng } : {}),
      photoUrls,
      tags: form.tags,
      notes: form.notes || undefined,
      holdDurationHours: form.holdDurationHours,
      ...(form.returnWindowHours !== null ? { returnWindowHours: form.returnWindowHours } : {}),
      ...(buyersPremiumPct !== null ? { buyersPremiumPct } : {}),
      ...(form.locationId ? { locationId: form.locationId } : {}),
      ...(form.entranceNote ? { entranceNote: form.entranceNote } : {}),
      ...(entranceLat !== null ? { entranceLat } : {}),
      ...(entranceLng !== null ? { entranceLng } : {}),
      retailAutoRenewDays: form.retailAutoRenewDays,
      status: 'DRAFT',
    };
  };

  const handlePublish = async () => {
    if (!validateStep(currentStep)) return;
    setIsSubmitting(true);
    setTierLimitError(null);
    try {
      const payload = { ...buildPayload(), status: 'PUBLISHED' };
      const response = await api.post('/sales', payload);
      const saleId = response.data.id;
      setPublishedSaleId(saleId);

      // Clear draft from storage
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }

      const firstSaleUnlocked = response.data.achievements?.some(
        (a: { key: string }) => a.key === 'FIRST_SALE_CREATED'
      );
      if (response.data.isFirstSaleFreePro) {
        setShowProModal(true);
      } else if (firstSaleUnlocked) {
        showToast('🚀 Achievement Unlocked: Sale Launcher! +25 XP', 'success');
        setPublished(true);
      } else {
        setPublished(true);
      }
    } catch (error: unknown) {
      const err = error as { response?: { status: number; data: { code?: string; message?: string; current?: number; tier?: string; limit?: number; upgradeUrl?: string } } };
      if (err.response?.status === 409 && err.response?.data?.code === 'TIER_LIMIT_EXCEEDED') {
        const data = err.response.data;
        setTierLimitError({
          current: data.current ?? 0,
          tier: data.tier ?? '',
          limit: data.limit ?? 0,
          upgradeUrl: data.upgradeUrl ?? '/pricing',
          message: data.message ?? 'Tier limit exceeded',
        });
        showToast(data.message || 'Tier limit exceeded', 'error');
      } else {
        const msg = err.response?.data?.message;
        showToast(msg || 'Failed to create sale', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAsDraft = async () => {
    setIsSubmitting(true);
    try {
      const payload = buildPayload();
      const response = await api.post('/sales', payload);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      showToast('Sale created! Add items next.', 'success');
      router.push(`/organizer/edit-sale/${response.data.id}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      showToast(err.response?.data?.message || 'Failed to save draft', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSchedule = () => {
    showToast('Scheduling coming soon on Pro plan.', 'info');
  };

  if (!isClient || authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', color: c.textDim }}>
        Loading…
      </div>
    );
  }

  // Post-publish success screen
  if (published && publishedSaleId) {
    return (
      <>
        <Head><title>Sale Published — FindA.Sale</title></Head>
        {showProModal && (
          <ProModal
            c={c}
            saleId={publishedSaleId}
            onClose={() => {
              setShowProModal(false);
              router.push(`/organizer/edit-sale/${publishedSaleId}`);
            }}
          />
        )}
        <SuccessState
          c={c}
          saleTitle={form.title}
          saleId={publishedSaleId}
          onAddItems={() => router.push(`/organizer/edit-sale/${publishedSaleId}`)}
        />
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Create Sale — FindA.Sale</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {showProModal && publishedSaleId && (
        <ProModal
          c={c}
          saleId={publishedSaleId}
          onClose={() => {
            setShowProModal(false);
            router.push(`/organizer/edit-sale/${publishedSaleId}`);
          }}
        />
      )}

      <div style={{
        minHeight: '100vh', background: c.bg, color: c.text,
        fontFamily: 'Inter, sans-serif',
      }}>
        {/* Mobile step bar */}
        <div className="md:hidden">
          <MobileStepBar current={currentStep} c={c} />
        </div>

        <div style={{ display: 'flex', minHeight: '100vh' }}>
          {/* Desktop sidebar */}
          <div className="hidden md:block">
            <WizardSidebar current={currentStep} c={c} lastSaved={lastSaved} />
          </div>

          {/* Main content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <main style={{
              flex: 1, padding: '36px 28px 24px',
              maxWidth: 900, width: '100%', margin: '0 auto', boxSizing: 'border-box',
            }}>
              {currentStep === 1 && (
                <Step1 c={c} form={form} setForm={setForm} />
              )}
              {currentStep === 2 && (
                <Step2
                  c={c} form={form} setForm={setForm}
                  validationErrors={validationErrors}
                  setValidationErrors={setValidationErrors}
                />
              )}
              {currentStep === 3 && (
                <Step3 c={c} photoUrls={photoUrls} setPhotoUrls={setPhotoUrls} />
              )}
              {currentStep === 4 && (
                <Step4 c={c} form={form} setForm={setForm} />
              )}
              {currentStep === 5 && (
                <Step5
                  c={c}
                  form={form}
                  photoCount={photoUrls.length}
                  onPublish={handlePublish}
                  onSaveDraft={handleSaveAsDraft}
                  onSchedule={handleSchedule}
                  isSubmitting={isSubmitting}
                  canSchedule={canAccess('PRO')}
                  tierLimitError={tierLimitError}
                  onDismissTierError={() => setTierLimitError(null)}
                />
              )}
            </main>

            <WizardFooter
              c={c}
              onBack={currentStep > 1 ? handleBack : undefined}
              onNext={currentStep < 5 ? handleNext : handlePublish}
              onSaveDraft={handleSaveDraft}
              nextLabel={
                currentStep === 5
                  ? (isSubmitting ? 'Publishing…' : 'Publish now')
                  : currentStep === 3 && photoUrls.length === 0
                  ? 'Skip photos →'
                  : 'Continue'
              }
              warn={
                currentStep === 3 && photoUrls.length === 0
                  ? 'Sales without photos get far fewer views'
                  : undefined
              }
              nextDisabled={currentStep === 5 && isSubmitting}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default CreateSalePage;
