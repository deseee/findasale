/**
 * Unified Email Template Builder — FindA.Sale Design System v2
 *
 * Rebuilt with the Session 4 design system:
 * - Parchment background #F4EFE7
 * - Accent #C8552B
 * - System font stack (no web fonts — Outlook compatibility)
 * - Table-based structural layout
 * - Apple Mail dark mode overrides via @media
 *
 * Backward compatible: all existing callers of buildEmail() and buildItemCard()
 * continue to work unchanged. The `accentColor` param is accepted but ignored
 * in favour of the design-system accent — callers may still pass it without error.
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

// ─────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────
const T = {
  outer:       '#F4EFE7',
  surface:     '#FFFFFF',
  ink:         '#1A1814',
  inkDim:      'rgba(26,24,20,0.62)',
  inkFaint:    'rgba(26,24,20,0.40)',
  accent:      '#C8552B',
  accentSoft:  'rgba(200,85,43,0.10)',
  border:      'rgba(20,18,14,0.10)',
  borderSolid: '#E8E2D8',
  success:     '#3F7A4B',
  successSoft: 'rgba(63,122,75,0.10)',
  font:        `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
};

// ─────────────────────────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────────────────────────

export interface EmailOptions {
  preheader?: string;
  headline: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
  sender?: string;
  /** @deprecated Accepted but ignored — design system uses #C8552B accent */
  accentColor?: string;
  /** @deprecated Kept for legacy callers */
  modules?: string[];
  unsubLabel?: string;
  unsubUrl?: string;
}

export interface ItemCardData {
  title: string;
  price: number;   // in cents (e.g. 1500 = $15.00)
  photoUrl?: string;
  url: string;
  category?: string;
}

// ─────────────────────────────────────────────────────────────────
// Dark-mode override block (Apple Mail via @media only)
// ─────────────────────────────────────────────────────────────────
const DARK_MODE_CSS = `
  @media (prefers-color-scheme: dark) {
    .em-body      { background-color: #1A1814 !important; }
    .em-card      { background-color: #252219 !important; }
    .em-surface   { background-color: #2C2820 !important; }
    .em-ink       { color: #F0EAE0 !important; }
    .em-ink-dim   { color: rgba(240,234,224,0.62) !important; }
    .em-accent    { color: #E8724A !important; }
    .em-btn       { background-color: #E8724A !important; }
    .em-footer    { background-color: #1A1814 !important; }
    .em-outer-bg  { background-color: #141210 !important; }
    .em-accent-soft { background-color: rgba(232,114,74,0.12) !important; }
  }
`;

// ─────────────────────────────────────────────────────────────────
// Base template wrapper
// ─────────────────────────────────────────────────────────────────

function baseWrapper(opts: {
  preheader?: string;
  content: string;
  unsubLabel?: string;
  unsubUrl?: string;
}): string {
  const unsubLabel = opts.unsubLabel || 'Unsubscribe from these emails';
  const unsubUrl   = opts.unsubUrl   || `${FRONTEND_URL}/unsubscribe`;

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>FindA.Sale</title>
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  <![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; display: block; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    ${DARK_MODE_CSS}
  </style>
</head>
<body class="em-body" style="margin:0; padding:0; background-color:${T.outer}; font-family:${T.font}; -webkit-font-smoothing:antialiased;">

  ${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${opts.preheader}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>` : ''}

  <table class="em-outer-bg" width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:${T.outer}; padding:32px 16px;">
    <tr>
      <td align="center">
        <table class="em-card" width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="background-color:${T.surface}; border-radius:10px; overflow:hidden;
                      box-shadow:0 1px 0 rgba(20,18,14,0.04), 0 8px 32px -16px rgba(20,18,14,0.18);"
               align="center">

          <!-- HEADER -->
          <tr>
            <td style="padding:18px 28px; border-bottom:2px solid ${T.accent};">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="font-size:17px; font-weight:700; letter-spacing:-0.01em; color:${T.ink};" class="em-ink">
                    Find<span style="color:${T.accent};">A</span>.Sale
                  </td>
                  <td align="right">
                    <a href="${FRONTEND_URL}" style="font-size:11px; color:${T.inkDim}; text-decoration:none;
                       font-family:${T.font}; letter-spacing:0.07em; text-transform:uppercase;" class="em-ink-dim">VIEW IN BROWSER</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BODY CONTENT -->
          ${opts.content}

          <!-- FOOTER -->
          <tr>
            <td class="em-footer" style="padding:24px 28px 28px; background-color:${T.outer};
                border-top:1px solid ${T.borderSolid}; text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding-bottom:12px;">
                    <a href="https://instagram.com/findasale" style="font-size:12px; color:${T.inkDim}; text-decoration:none; margin:0 8px;" class="em-ink-dim">Instagram</a>
                    <span style="color:${T.inkFaint};">&middot;</span>
                    <a href="https://facebook.com/findasale" style="font-size:12px; color:${T.inkDim}; text-decoration:none; margin:0 8px;" class="em-ink-dim">Facebook</a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:11px; color:${T.inkFaint}; padding-bottom:10px;" class="em-ink-dim">
                    219 E Michigan Ave, Suite F &middot; Paw Paw, MI 49079
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:10px;">
                    <a href="${unsubUrl}" style="font-size:12px; color:${T.inkDim}; text-decoration:underline;" class="em-ink-dim">${unsubLabel}</a>
                    <span style="color:${T.inkFaint};"> &middot; </span>
                    <a href="${FRONTEND_URL}/settings/notifications" style="font-size:12px; color:${T.inkDim}; text-decoration:underline;" class="em-ink-dim">Manage preferences</a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:10.5px; color:${T.inkFaint}; letter-spacing:0.05em;" class="em-ink-dim">
                    &copy; FindA.Sale 2026
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────
// Internal layout helpers
// ─────────────────────────────────────────────────────────────────

function buildHero(opts: { eyebrow?: string; title: string; sub?: string; accentBg?: boolean }): string {
  const bg = opts.accentBg ? `background-color:${T.accentSoft};` : '';
  const eyebrow = opts.eyebrow
    ? `<div style="font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:${T.accent}; margin-bottom:10px; font-family:${T.font};">${opts.eyebrow}</div>`
    : '';
  const sub = opts.sub
    ? `<p style="margin:12px 0 0; font-size:15px; line-height:1.55; color:${T.inkDim};">${opts.sub}</p>`
    : '';
  return `
<tr><td style="padding:28px 28px 8px; ${bg}">
  ${eyebrow}
  <h1 style="margin:0; font-size:26px; font-weight:700; letter-spacing:-0.02em; line-height:1.15; color:${T.ink}; font-family:${T.font};">${opts.title}</h1>
  ${sub}
</td></tr>`;
}

function buildDivider(): string {
  return `<tr><td style="padding:0 28px;"><div style="height:1px; background-color:${T.borderSolid};"></div></td></tr>`;
}

function buildSpacer(px = 16): string {
  return `<tr><td style="height:${px}px; line-height:${px}px; font-size:1px;">&nbsp;</td></tr>`;
}

function buildCTARow(text: string, url: string, secondaryHtml?: string): string {
  return `
<tr><td align="center" style="padding:8px 28px 28px;">
  ${buildCTAButton(text, url)}
  ${secondaryHtml ? `<div style="margin-top:14px; font-size:13px; color:${T.inkDim};">${secondaryHtml}</div>` : ''}
</td></tr>`;
}

function buildStepIndicator(step: number, total = 3): string {
  const pct = Math.round((step / total) * 100);
  return `
<tr><td style="padding:16px 28px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:${T.inkFaint}; white-space:nowrap; padding-right:10px; font-family:${T.font};">
        Step ${step} of ${total}
      </td>
      <td style="width:100%;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:${T.borderSolid}; border-radius:2px;">
          <tr>
            <td width="${pct}%" style="height:2px; background-color:${T.accent}; border-radius:2px;">&nbsp;</td>
            <td></td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</td></tr>`;
}

// ─────────────────────────────────────────────────────────────────
// CTA Button helper (exported — used by other services)
// ─────────────────────────────────────────────────────────────────

export function buildCTAButton(text: string, url: string, _accent = T.accent): string {
  return `
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
  href="${url}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="12%"
  stroke="f" fillcolor="${T.accent}">
  <w:anchorlock/>
  <center style="color:#ffffff;font-family:${T.font};font-size:15px;font-weight:600;">${text}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${url}" class="em-btn"
   style="display:inline-block; padding:14px 28px; background-color:${T.accent}; color:#ffffff;
          font-size:15px; font-weight:600; border-radius:6px; text-decoration:none;
          letter-spacing:-0.005em; line-height:1; font-family:${T.font};">
  ${text}
</a>
<!--<![endif]-->`;
}

// ─────────────────────────────────────────────────────────────────
// Content modules (exported)
// ─────────────────────────────────────────────────────────────────

export function buildSaleCardModule(sale: {
  title: string;
  dateRange: string;
  address: string;
  photoUrl?: string;
  ctaUrl: string;
  ctaLabel?: string;
  saleType?: string;
  hours?: string;
  statusLabel?: string;
}): string {
  const photoBlock = sale.photoUrl
    ? `<img src="${sale.photoUrl}" alt="${sale.title}" width="536" style="width:100%; max-height:200px; object-fit:cover; display:block;" />`
    : `<div style="width:100%; height:140px; background:${T.accentSoft}; text-align:center; line-height:140px; font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:${T.accent}; font-family:${T.font};">FindA.Sale</div>`;

  const statusBadge = sale.statusLabel
    ? `<span style="display:inline-block; padding:3px 8px; font-size:10.5px; letter-spacing:0.05em; text-transform:uppercase; background:${T.successSoft}; color:${T.success}; border-radius:999px; margin-right:6px; font-family:${T.font};">${sale.statusLabel}</span>`
    : '';
  const typeBadge = sale.saleType
    ? `<span style="display:inline-block; padding:3px 8px; font-size:10.5px; letter-spacing:0.05em; text-transform:uppercase; background:rgba(20,18,14,0.05); color:${T.inkDim}; border-radius:999px; font-family:${T.font};">${sale.saleType}</span>`
    : '';
  const hoursLine = sale.hours
    ? `<div style="font-size:13px; color:${T.inkDim}; padding:2px 0;">&#128336; ${sale.hours}</div>`
    : '';

  return `
<tr><td style="padding:12px 28px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="border:1px solid ${T.borderSolid}; border-radius:10px; overflow:hidden; background-color:${T.surface};">
    <tr><td style="padding:0;">${photoBlock}</td></tr>
    <tr><td style="padding:14px 16px 16px;">
      <div style="margin-bottom:8px;">${statusBadge}${typeBadge}</div>
      <div style="font-size:17px; font-weight:600; letter-spacing:-0.01em; line-height:1.25; color:${T.ink}; margin-bottom:10px;">${sale.title}</div>
      <div style="font-size:13px; color:${T.inkDim}; line-height:1.7;">
        <div>&#128197; ${sale.dateRange}</div>
        ${hoursLine}
        <div>&#128205; ${sale.address}</div>
      </div>
      <div style="margin-top:14px;">
        <a href="${sale.ctaUrl}" style="color:${T.accent}; font-weight:600; font-size:14px; text-decoration:none;">${sale.ctaLabel || 'View the sale'} &rarr;</a>
      </div>
    </td></tr>
  </table>
</td></tr>`;
}

export function buildItemCardModule(item: {
  title: string;
  price: number;
  photoUrl?: string;
  category?: string;
  rarity?: 'RARE' | 'UNUSUAL' | 'HOT';
  ctaUrl: string;
}): string {
  const rarityMap: Record<string, { bg: string; fg: string; label: string }> = {
    RARE:    { bg: 'rgba(168,116,32,0.12)', fg: '#A87420', label: 'Rare find' },
    UNUSUAL: { bg: T.successSoft,           fg: T.success,  label: 'Unusual' },
    HOT:     { bg: T.accentSoft,            fg: T.accent,   label: 'Hot' },
  };
  const rarity = item.rarity ? rarityMap[item.rarity] : null;
  const rarityBadge = rarity
    ? `<span style="display:inline-block; padding:2px 7px; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; background:${rarity.bg}; color:${rarity.fg}; border-radius:999px; margin-bottom:6px; font-family:${T.font};">${rarity.label}</span><br>`
    : '';

  const photo = item.photoUrl
    ? `<img src="${item.photoUrl}" alt="${item.title}" width="110" style="width:110px; height:110px; object-fit:cover; display:block;" />`
    : `<div style="width:110px; height:110px; background:${T.accentSoft}; text-align:center; line-height:110px; font-size:9px; letter-spacing:0.08em; text-transform:uppercase; color:${T.accent}; font-family:${T.font};">FindA.Sale</div>`;

  const priceStr = `$${item.price.toFixed(2)}`;
  const categoryLine = item.category
    ? `<div style="font-size:12px; color:${T.inkFaint}; margin-bottom:8px;">${item.category}</div>`
    : '';

  return `
<tr><td style="padding:0 28px 12px;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="border:1px solid ${T.borderSolid}; border-radius:8px; overflow:hidden; background-color:${T.surface};">
    <tr>
      <td width="110" valign="top" style="width:110px; padding:0;">${photo}</td>
      <td valign="top" style="padding:12px 14px 12px 12px;">
        ${rarityBadge}
        <div style="font-size:15px; font-weight:600; line-height:1.3; color:${T.ink}; margin-bottom:4px; letter-spacing:-0.005em;">${item.title}</div>
        ${categoryLine}
        <div style="font-size:16px; font-weight:700; color:${T.ink}; margin-bottom:10px;">${priceStr}</div>
        <a href="${item.ctaUrl}" style="color:${T.accent}; font-weight:600; font-size:13px; text-decoration:none;">View item &rarr;</a>
      </td>
    </tr>
  </table>
</td></tr>`;
}

export function buildMetricRowModule(metrics: Array<{
  icon: string;
  stat: string;
  label: string;
  context: string;
  delta?: string;
  deltaPositive?: boolean;
}>): string {
  return metrics.map((m, i) => {
    const deltaBadge = m.delta
      ? `<span style="display:inline-block; font-size:11px; padding:2px 7px; border-radius:999px; background:${m.deltaPositive !== false ? T.successSoft : 'rgba(20,18,14,0.05)'}; color:${m.deltaPositive !== false ? T.success : T.inkDim}; font-family:${T.font}; margin-left:8px;">${m.delta}</span>`
      : '';
    const border = i < metrics.length - 1 ? `border-bottom:1px solid ${T.borderSolid};` : '';
    return `
<tr><td style="padding:14px 28px; ${border}">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td width="40" valign="middle" style="width:40px; padding-right:12px;">
        <div style="width:36px; height:36px; border-radius:8px; background:${T.accentSoft}; text-align:center; line-height:36px; font-size:16px;">${m.icon}</div>
      </td>
      <td valign="middle">
        <div style="margin-bottom:3px;">
          <span style="font-size:22px; font-weight:700; letter-spacing:-0.02em; color:${T.ink}; line-height:1;">${m.stat}</span>
          <span style="font-size:13px; color:${T.inkDim}; margin-left:6px;">${m.label}</span>
          ${deltaBadge}
        </div>
        <div style="font-size:13px; color:${T.inkDim}; line-height:1.5;">${m.context}</div>
      </td>
    </tr>
  </table>
</td></tr>`;
  }).join('');
}

export function buildTextBlockModule(content: {
  headline?: string;
  body: string;
  linkText?: string;
  linkUrl?: string;
}): string {
  const headlineHtml = content.headline
    ? `<div style="font-size:16px; font-weight:600; color:${T.ink}; margin-bottom:8px; letter-spacing:-0.005em;">${content.headline}</div>`
    : '';
  const linkHtml = content.linkText && content.linkUrl
    ? `<div style="margin-top:10px;"><a href="${content.linkUrl}" style="color:${T.accent}; font-weight:600; font-size:14px; text-decoration:none;">${content.linkText} &rarr;</a></div>`
    : '';
  return `
<tr><td style="padding:12px 28px 16px;">
  ${headlineHtml}
  <div style="font-size:14.5px; line-height:1.6; color:${T.inkDim};">${content.body}</div>
  ${linkHtml}
</td></tr>`;
}

export function buildQuickWinsModule(wins: Array<{
  icon: string;
  text: string;
  linkText: string;
  linkUrl: string;
}>): string {
  const items = wins.map((w, i) => {
    const border = i < wins.length - 1 ? `border-bottom:1px solid ${T.borderSolid};` : '';
    return `
<tr><td style="padding:12px 14px; ${border}">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td width="32" valign="top" style="width:32px; padding-right:10px; padding-top:2px;">
        <div style="width:28px; height:28px; border-radius:6px; background:${T.accentSoft}; text-align:center; line-height:28px; font-size:14px;">${w.icon}</div>
      </td>
      <td valign="top">
        <div style="font-size:14px; color:${T.ink}; line-height:1.5;">${w.text}</div>
      </td>
      <td width="90" valign="top" align="right" style="padding-left:8px; white-space:nowrap;">
        <a href="${w.linkUrl}" style="color:${T.accent}; font-size:13px; font-weight:600; text-decoration:none;">${w.linkText} &rarr;</a>
      </td>
    </tr>
  </table>
</td></tr>`;
  }).join('');

  return `
<tr><td style="padding:12px 28px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid ${T.borderSolid}; border-radius:10px; overflow:hidden;">
    <tr><td style="padding:10px 14px; background:${T.outer}; border-bottom:1px solid ${T.borderSolid};">
      <span style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:${T.inkDim}; font-family:${T.font};">Quick wins</span>
    </td></tr>
    ${items}
  </table>
</td></tr>`;
}

// ─────────────────────────────────────────────────────────────────
// Main backward-compatible buildEmail()
// ─────────────────────────────────────────────────────────────────

export function buildEmail(options: EmailOptions): string {
  const {
    preheader = '',
    headline,
    body,
    ctaText,
    ctaUrl,
    footerNote,
    unsubLabel,
    unsubUrl,
  } = options;

  const ctaRow = ctaText && ctaUrl
    ? buildCTARow(ctaText, ctaUrl, footerNote)
    : footerNote
      ? `<tr><td style="padding:0 28px 20px; text-align:center; font-size:13px; color:${T.inkDim};">${footerNote}</td></tr>`
      : '';

  const content = `
    ${buildHero({ title: headline })}
    <tr><td style="padding:16px 28px 8px;">
      <div style="font-size:15px; color:${T.inkDim}; line-height:1.6;">${body}</div>
    </td></tr>
    ${buildSpacer(8)}
    ${ctaRow}
  `;

  return baseWrapper({ preheader, content, unsubLabel, unsubUrl });
}

// ─────────────────────────────────────────────────────────────────
// Backward-compatible buildItemCard() — price in cents
// ─────────────────────────────────────────────────────────────────

export function buildItemCard(item: ItemCardData): string {
  const price = (item.price / 100).toFixed(2);
  const photoHtml = item.photoUrl
    ? `<img src="${item.photoUrl}" alt="${item.title}" width="536" style="width:100%; max-height:160px; object-fit:cover; border-radius:6px; margin-bottom:10px; display:block;" />`
    : `<div style="width:100%; height:80px; background:${T.accentSoft}; border-radius:6px; margin-bottom:10px; text-align:center; line-height:80px; font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:${T.accent};">FindA.Sale</div>`;

  return `
<div style="border:1px solid ${T.borderSolid}; border-radius:8px; padding:14px; margin-bottom:12px; background-color:${T.surface}; overflow:hidden;">
  ${photoHtml}
  <div style="font-weight:600; font-size:15px; color:${T.ink}; margin-bottom:4px;">${item.title}</div>
  <div style="color:${T.accent}; font-weight:700; font-size:16px; margin-bottom:4px;">$${price}</div>
  ${item.category ? `<div style="color:${T.inkDim}; font-size:13px; margin-bottom:10px;">${item.category}</div>` : ''}
  <a href="${item.url}" style="display:inline-block; padding:6px 14px; background-color:${T.accent}; color:#ffffff; border-radius:6px; text-decoration:none; font-size:13px; font-weight:600;">View Item</a>
</div>`;
}

// ─────────────────────────────────────────────────────────────────
// Named email builders — used by specific services
// ─────────────────────────────────────────────────────────────────

/** Email 1 — Shopper: New sale from followed organizer */
export function buildNewSaleAlertEmail(opts: {
  organizerName: string;
  sale: {
    title: string;
    dateRange: string;
    address: string;
    photoUrl?: string;
    saleUrl: string;
    saleType?: string;
    hours?: string;
  };
  featuredItems?: Array<{
    title: string;
    price: number;
    photoUrl?: string;
    category?: string;
    rarity?: 'RARE' | 'UNUSUAL' | 'HOT';
    itemUrl: string;
  }>;
  referralUrl?: string;
  unsubUrl?: string;
}): string {
  const { organizerName, sale, featuredItems = [], referralUrl } = opts;

  const itemsSection = featuredItems.length > 0
    ? `<tr><td style="padding:4px 28px 4px;"><div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:${T.inkDim}; font-family:${T.font};">Featured items</div></td></tr>
       ${featuredItems.slice(0, 3).map(it => buildItemCardModule({ title: it.title, price: it.price, photoUrl: it.photoUrl, category: it.category, rarity: it.rarity, ctaUrl: it.itemUrl })).join('')}`
    : '';

  const referralLine = referralUrl
    ? `Know someone who&rsquo;d love this? <a href="${referralUrl}" style="color:${T.accent}; font-weight:600; text-decoration:none;">Share the sale &rarr;</a>`
    : '';

  const content = `
    ${buildHero({ eyebrow: 'From an organizer you follow', title: `${organizerName} just posted something near you.`, sub: `Here are the details &mdash; and a few items worth a look.` })}
    ${buildSaleCardModule({ title: sale.title, dateRange: sale.dateRange, address: sale.address, photoUrl: sale.photoUrl, ctaUrl: sale.saleUrl, ctaLabel: 'View the sale', saleType: sale.saleType, hours: sale.hours })}
    ${itemsSection}
    ${buildCTARow('View the sale →', sale.saleUrl, referralLine)}
  `;

  return baseWrapper({ preheader: `${organizerName} just posted a new sale — ${sale.title}`, content, unsubLabel: 'Stop alerts from organizers I follow', unsubUrl: opts.unsubUrl });
}

/** Email 2 — Shopper: Sale day reminder */
export function buildSaleDayReminderEmail(opts: {
  saleName: string;
  saleDate: string;
  saleTime: string;
  saleAddress: string;
  mapUrl?: string;
  organizerNotes?: string;
  savedItems?: Array<{ title: string; price: number; photoUrl?: string; category?: string; itemUrl: string }>;
  ctaUrl: string;
  reminderType: 'one-day' | 'two-hours';
  unsubUrl?: string;
}): string {
  const { saleName, saleDate, saleTime, saleAddress, mapUrl, organizerNotes, savedItems = [], ctaUrl, reminderType } = opts;
  const eyebrow = reminderType === 'two-hours' ? 'Starting in 2 hours' : 'Tomorrow morning';
  const mapLink = mapUrl ? ` <a href="${mapUrl}" style="color:${T.accent}; font-weight:600; font-size:13px; text-decoration:none;">Map &rarr;</a>` : '';

  const infoBlock = `
<tr><td style="padding:16px 28px 0;">
  <div style="font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:${T.accent}; margin-bottom:10px; font-family:${T.font};">${eyebrow}</div>
  <h1 style="margin:0; font-size:28px; font-weight:700; letter-spacing:-0.025em; line-height:1.15; color:${T.ink}; font-family:${T.font};">${saleName}</h1>
  <div style="margin-top:16px; padding:14px 16px; background:${T.outer}; border-radius:8px;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr><td style="font-size:15px; color:${T.ink}; padding:4px 0;">&#128197; <strong>${saleDate}</strong> <span style="color:${T.inkDim};">&middot; ${saleTime}</span></td></tr>
      <tr><td style="font-size:15px; color:${T.ink}; padding:4px 0;">&#128205; ${saleAddress}${mapLink}</td></tr>
    </table>
  </div>
</td></tr>`;

  const notesBlock = organizerNotes ? buildTextBlockModule({ headline: 'A note from the organizer', body: `&ldquo;${organizerNotes}&rdquo;` }) : '';

  const savedSection = savedItems.length > 0
    ? `${buildDivider()}<tr><td style="padding:20px 28px 4px;"><div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:${T.inkDim}; font-family:${T.font};">Your saved items at this sale</div></td></tr>
       ${savedItems.slice(0, 3).map(it => buildItemCardModule({ title: it.title, price: it.price, photoUrl: it.photoUrl, category: it.category, ctaUrl: it.itemUrl })).join('')}`
    : '';

  const content = `${infoBlock}${notesBlock}${savedSection}${buildSpacer(8)}${buildCTARow(reminderType === 'two-hours' ? 'Get directions →' : 'View sale →', ctaUrl)}`;

  return baseWrapper({ preheader: `${eyebrow}: ${saleName} · ${saleAddress}`, content, unsubLabel: 'Stop sale-day reminders', unsubUrl: opts.unsubUrl });
}

/** Email 4 — Organizer: Weekly digest */
export function buildOrganizerWeeklyDigestEmail(opts: {
  businessName: string;
  weekLabel: string;
  metrics: Array<{ icon: string; stat: string; label: string; context: string; delta?: string; deltaPositive?: boolean }>;
  upcomingSale?: { title: string; dateRange: string; address: string; photoUrl?: string; saleUrl: string; saleType?: string };
  quickWins?: Array<{ icon: string; text: string; linkText: string; linkUrl: string }>;
  dashboardUrl: string;
  unsubUrl?: string;
}): string {
  const { businessName, weekLabel, metrics, upcomingSale, quickWins = [], dashboardUrl } = opts;

  const upcomingSection = upcomingSale
    ? `<tr><td style="padding:8px 28px 0;"><div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:${T.inkDim}; font-family:${T.font};">Coming up</div></td></tr>
       ${buildSaleCardModule({ title: upcomingSale.title, dateRange: upcomingSale.dateRange, address: upcomingSale.address, photoUrl: upcomingSale.photoUrl, ctaUrl: upcomingSale.saleUrl, saleType: upcomingSale.saleType, statusLabel: 'Upcoming' })}`
    : '';

  const content = `
    ${buildHero({ eyebrow: weekLabel, title: `Here&rsquo;s how <span style="color:${T.accent};">${businessName}</span> did this week.` })}
    ${buildSpacer(8)}
    ${buildMetricRowModule(metrics)}
    ${buildSpacer(12)}
    ${upcomingSection}
    ${quickWins.length > 0 ? buildQuickWinsModule(quickWins) : ''}
    ${buildCTARow('View your dashboard →', dashboardUrl)}
  `;

  return baseWrapper({ preheader: `Your week at FindA.Sale — ${metrics[0]?.stat || ''} ${metrics[0]?.label || 'views'}`, content, unsubLabel: 'Manage email preferences', unsubUrl: opts.unsubUrl });
}

/** Email 6 — Shopper: Smart match alert */
export function buildSmartMatchEmail(opts: {
  matchCategory?: string;
  item: { title: string; price: number; photoUrl?: string; category?: string; rarity?: 'RARE' | 'UNUSUAL' | 'HOT'; itemUrl: string };
  sale: { title: string; dateRange: string; address: string; photoUrl?: string; saleUrl: string; saleType?: string };
  updateInterestsUrl?: string;
  unsubUrl?: string;
}): string {
  const { matchCategory, item, sale } = opts;
  const updateUrl = opts.updateInterestsUrl || `${FRONTEND_URL}/settings/interests`;
  const secondaryLink = `Not interested? <a href="${updateUrl}" style="color:${T.accent}; font-weight:600; text-decoration:none;">Update your interests &rarr;</a>`;

  const content = `
    ${buildHero({ eyebrow: matchCategory ? `Smart match · ${matchCategory}` : 'Smart match', title: 'Thought you&rsquo;d want to know.', sub: 'A new item just posted matches what you&rsquo;re watching for.' })}
    ${buildItemCardModule({ title: item.title, price: item.price, photoUrl: item.photoUrl, category: item.category, rarity: item.rarity, ctaUrl: item.itemUrl })}
    <tr><td style="padding:4px 28px 4px;"><div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:${T.inkDim}; font-family:${T.font};">At this sale</div></td></tr>
    ${buildSaleCardModule({ title: sale.title, dateRange: sale.dateRange, address: sale.address, photoUrl: sale.photoUrl, ctaUrl: sale.saleUrl, saleType: sale.saleType })}
    ${buildCTARow('View this item →', item.itemUrl, secondaryLink)}
  `;

  return baseWrapper({ preheader: `Found something that might be yours — ${item.title}`, content, unsubLabel: 'Stop smart match alerts', unsubUrl: opts.unsubUrl });
}

// Re-export buildStepIndicator for use in onboarding service
export { buildStepIndicator, buildHero, buildDivider, buildSpacer, buildCTARow, baseWrapper, T as EMAIL_TOKENS };
