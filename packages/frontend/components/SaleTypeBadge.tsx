/**
 * SaleTypeBadge — Brief F · Sale type badge system
 *
 * Reusable pill/badge for each sale type. Differentiation via icon + label
 * (not color). Charity/Benefit gets a secondary heart indicator.
 *
 * saleSubtype and isOnlineOnly are both in schema.prisma (Sale model).
 */
import React from 'react';

// ---------- Icon set (SVG inline, no external deps) ----------

const TypeIcon = ({ name, size = 14 }: { name: string; size?: number }) => {
  const paths: Record<string, React.ReactNode> = {
    // Primary type icons (from fs-shared)
    home: <path d="M3 11l9-7 9 7v9a2 2 0 01-2 2h-4v-7h-6v7H5a2 2 0 01-2-2v-9z" />,
    tag: (
      <>
        <path d="M3 12V4h8l10 10-8 8L3 12z" />
        <circle cx="8" cy="9" r="1.2" fill="currentColor" />
      </>
    ),
    gavel: (
      <>
        <path d="M14 4l6 6-3 3-6-6 3-3z" />
        <path d="M11 7l-7 7 3 3 7-7" />
        <path d="M3 21h12" />
      </>
    ),
    bag: (
      <>
        <path d="M5 8h14l-1 13H6L5 8z" />
        <path d="M9 8V6a3 3 0 016 0v2" />
      </>
    ),
    heart: <path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z" />,
    // Subtype icons (custom paths from design)
    truck: (
      <>
        <rect x="2" y="8" width="12" height="9" rx="1" />
        <path d="M14 11h4l3 3v3h-7" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="17" cy="19" r="2" />
      </>
    ),
    storage: (
      <>
        <rect x="3" y="6" width="18" height="14" rx="1" />
        <path d="M3 10h18M9 14h6" />
        <path d="M7 6V4h10v2" />
      </>
    ),
    tent: (
      <>
        <path d="M3 19l9-14 9 14H3z" />
        <path d="M12 5v14M9 19l3-4 3 4" />
      </>
    ),
    market: (
      <>
        <path d="M3 9h18l-1-4H4L3 9z" />
        <path d="M5 9v11h14V9" />
        <path d="M9 13h6v7H9z" />
      </>
    ),
    ship: (
      <>
        <path d="M3 16l1 4h16l1-4" />
        <path d="M5 16h14l-1-7H6l-1 7z" />
        <path d="M12 9V4M8 4h8" />
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

// ---------- Type config (single source of truth for display) ----------

interface TypeConfig {
  label: string;
  icon: string;
  colorClass: string; // Tailwind accent class for the icon
}

const PRIMARY_TYPES: Record<string, TypeConfig> = {
  ESTATE: { label: 'Estate Sale', icon: 'home', colorClass: 'text-amber-700 dark:text-amber-400' },
  YARD: { label: 'Yard Sale', icon: 'tag', colorClass: 'text-green-700 dark:text-green-400' },
  AUCTION: { label: 'Auction', icon: 'gavel', colorClass: 'text-amber-700 dark:text-amber-400' },
  FLEA_MARKET: { label: 'Flea Market', icon: 'market', colorClass: 'text-amber-700 dark:text-amber-400' },
  RETAIL: { label: 'Antique Shop', icon: 'bag', colorClass: 'text-amber-700 dark:text-amber-400' },
};

const SUBTYPE_OVERRIDES: Record<string, Pick<TypeConfig, 'label' | 'icon'>> = {
  moving: { label: 'Moving Sale', icon: 'truck' },
  storage_auction: { label: 'Storage Auction', icon: 'storage' },
  pop_up: { label: 'Pop-Up', icon: 'tent' },
  benefit: { label: 'Benefit Sale', icon: 'heart' },
};

// ---------- Props ----------

export interface SaleTypeBadgeProps {
  saleType: string; // ESTATE | YARD | AUCTION | FLEA_MARKET | RETAIL
  saleSubtype?: string; // 'moving' | 'storage_auction' | 'pop_up' | 'benefit'
  isOnlineOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  theme?: 'dark' | 'light';
}

const SIZE_MAP = {
  sm: { fontSize: '10px', padding: '3px 8px 3px 6px', iconSize: 11, gap: 4 },
  md: { fontSize: '11px', padding: '4px 10px 4px 8px', iconSize: 13, gap: 5 },
  lg: { fontSize: '12px', padding: '5px 12px 5px 10px', iconSize: 15, gap: 6 },
};

// Parchment / dark palette matching fs-shared tokens
const THEME_MAP = {
  light: {
    bg: 'rgba(20,18,14,0.05)',
    border: 'rgba(20,18,14,0.10)',
    text: '#1A1814',
    onlineColor: '#3A6EB4',
  },
  dark: {
    bg: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.08)',
    text: '#F2F0EA',
    onlineColor: '#9BB7E5',
  },
};

// ---------- Component ----------

const SaleTypeBadge: React.FC<SaleTypeBadgeProps> = ({
  saleType,
  saleSubtype,
  isOnlineOnly = false,
  size = 'md',
  theme = 'light',
}) => {
  const s = SIZE_MAP[size];
  const t = THEME_MAP[theme];

  // Online-only overrides everything — shows shipping icon
  if (isOnlineOnly) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: s.gap,
          padding: s.padding,
          borderRadius: 999,
          background: theme === 'dark' ? 'rgba(108,148,210,0.18)' : 'rgba(58,110,180,0.10)',
          border: `1px solid ${theme === 'dark' ? 'rgba(108,148,210,0.25)' : 'rgba(58,110,180,0.20)'}`,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: s.fontSize,
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
          color: t.onlineColor,
        }}
      >
        <TypeIcon name="ship" size={s.iconSize} />
        Ships Nationwide
      </span>
    );
  }

  // Resolve config: subtype overrides label + icon but keeps parent type's color
  const base = PRIMARY_TYPES[saleType] ?? PRIMARY_TYPES['ESTATE'];
  const override = saleSubtype ? SUBTYPE_OVERRIDES[saleSubtype] : null;
  const label = override?.label ?? base.label;
  const icon = override?.icon ?? base.icon;
  const isCharity = saleSubtype === 'benefit';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: s.gap,
        padding: s.padding,
        borderRadius: 999,
        background: t.bg,
        border: `1px solid ${t.border}`,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: s.fontSize,
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
        color: t.text,
        position: 'relative',
      }}
    >
      <span className={base.colorClass} style={{ display: 'flex' }}>
        <TypeIcon name={icon} size={s.iconSize} />
      </span>
      {label}
      {/* Charity heart — secondary indicator per Brief F spec */}
      {isCharity && (
        <span
          style={{
            marginLeft: 2,
            color: theme === 'dark' ? '#E97C4D' : '#C8552B',
            display: 'inline-flex',
          }}
          title="Benefit / Charity Sale"
          aria-label="Benefit sale"
        >
          <TypeIcon name="heart" size={s.iconSize - 1} />
        </span>
      )}
    </span>
  );
};

export default SaleTypeBadge;

/**
 * Charity heart overlay — used on sale card photo (top-right corner)
 * per Brief F spec: "Overlaid on the sale-card photo (top-right)".
 * Separate export so SaleCard can position it independently.
 */
export const CharityHeartBadge: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: '#C8552B',
      color: '#FBF8F2',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
    }}
    title="Benefit / Charity Sale"
    aria-label="Benefit sale"
  >
    <svg
      width={size * 0.5}
      height={size * 0.5}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z" />
    </svg>
  </div>
);

/**
 * Filter strip groups for the homepage explore filter.
 * NOTE (deferred): Update the homepage filter strip to use these groups when Brief F ships.
 * Groups: Estate | Yard & Moving | Auction | Markets & Pop-Ups | Antique Shops | Online | All
 */
export const SALE_TYPE_FILTER_GROUPS = [
  { label: 'All', saleTypes: null, icon: 'grid' },
  { label: 'Estate', saleTypes: ['ESTATE'], icon: 'home' },
  { label: 'Yard & Moving', saleTypes: ['YARD'], icon: 'tag' },
  { label: 'Auction', saleTypes: ['AUCTION'], icon: 'gavel' },
  { label: 'Markets & Pop-Ups', saleTypes: ['FLEA_MARKET'], icon: 'market' },
  { label: 'Antique Shops', saleTypes: ['RETAIL'], icon: 'bag' },
  { label: 'Online', saleTypes: null, isOnlineOnly: true, icon: 'ship' },
] as const;
