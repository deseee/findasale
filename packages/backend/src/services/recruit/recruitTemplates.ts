/**
 * recruitTemplates.ts -- ADR-139 recruit channel email copy.
 *
 * Copy source: claude_docs/operations/organizer-recruitment-salesops-review-2026-10-12.md §1 and §2.
 * Rules: sender "The FindA.Sale Team", honest subjects, one CTA per email, no numeric claims,
 * physical mailing address in every footer, plain-text part on every email.
 * No user-supplied text is interpolated into any template.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface SequenceRenderInput {
  step: 1 | 2 | 3;
  source: 'DIRECTORY' | 'OPT_IN_FORM' | 'MANUAL';
  unsubscribeUrl: string;
  mailingAddress: string;
  frontendUrl: string;
}

export interface ConfirmRenderInput {
  confirmUrl: string;
  mailingAddress: string;
}

export const SENDER_LINE = 'The FindA.Sale Team';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function reasonLine(source: SequenceRenderInput['source']): string {
  return source === 'DIRECTORY'
    ? 'You are receiving this because your business email is publicly listed.'
    : 'You are receiving this because you asked for information about listing on FindA.Sale.';
}

const SEQUENCE_COPY: Record<1 | 2 | 3, { subject: string; paragraphs: string[] }> = {
  1: {
    subject: 'Get your next sale found',
    paragraphs: [
      'Thanks for confirming. Here is the short version.',
      'FindA.Sale puts your sale and its items in front of shoppers near you. You list the sale once, add your items with a photo and a price, and shoppers can browse what you have before they ever leave home.',
      'The step that matters most is adding items. A sale with items gets found in searches for the things people want. A sale with only a date and an address does not.',
      'Listing is free. You do not need a card to start.',
    ],
  },
  2: {
    subject: 'Start with five items',
    paragraphs: [
      'You do not have to photograph the whole house. Most organizers start with five items: the pieces shoppers will drive across town for.',
      'Take a photo, add a price, and save. Your sale page updates as you go, and you can keep adding items right up to the day of the sale. Yard sales, auctions, flea markets and consignment all work the same way.',
    ],
  },
  3: {
    subject: 'Last note from us about your next sale',
    paragraphs: [
      'This is our last email unless you sign up.',
      'If you have a sale coming up, now is a good time to list it. Shoppers start planning their weekend early in the week, and sales with items listed give them a reason to put yours on the route.',
      'Create the sale, add a few items, and publish. That is the whole job.',
    ],
  },
};

const CTA_LABEL = 'Create your first sale and add items';

export function ctaUrl(frontendUrl: string, step: number): string {
  return `${frontendUrl}/register?role=organizer&utm_source=recruit&utm_campaign=seq${step}`;
}

function wrapHtml(inner: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;">
${inner}
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${esc(href)}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px;">${esc(label)}</a></p>`;
}

export function renderSequenceEmail(input: SequenceRenderInput): RenderedEmail {
  const copy = SEQUENCE_COPY[input.step];
  const cta = ctaUrl(input.frontendUrl, input.step);
  const reason = reasonLine(input.source);

  const html = wrapHtml(
    [
      '<p>Hi there,</p>',
      ...copy.paragraphs.map((p) => `<p>${esc(p)}</p>`),
      button(cta, CTA_LABEL),
      `<p>${esc(SENDER_LINE)}</p>`,
      '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />',
      `<p style="font-size:12px;color:#6b7280;">${esc(reason)}<br />` +
        `<a href="${esc(input.unsubscribeUrl)}" style="color:#6b7280;">Unsubscribe</a><br />` +
        `${esc(input.mailingAddress)}</p>`,
    ].join('\n')
  );

  const text = [
    'Hi there,',
    '',
    ...copy.paragraphs.flatMap((p) => [p, '']),
    `${CTA_LABEL}: ${cta}`,
    '',
    SENDER_LINE,
    '',
    reason,
    `Unsubscribe: ${input.unsubscribeUrl}`,
    input.mailingAddress,
  ].join('\n');

  return { subject: copy.subject, html, text };
}

export function renderConfirmEmail(input: ConfirmRenderInput): RenderedEmail {
  const subject = 'Confirm your FindA.Sale guide request';
  const lead = 'Hi, please confirm you asked for information about listing your sales on FindA.Sale.';
  const ignore = 'If you did not ask for this, ignore this email and you will not hear from us.';

  const html = wrapHtml(
    [
      `<p>${esc(lead)}</p>`,
      button(input.confirmUrl, 'Confirm my request'),
      `<p>${esc(ignore)}</p>`,
      `<p>${esc(SENDER_LINE)}</p>`,
      '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />',
      `<p style="font-size:12px;color:#6b7280;">${esc(input.mailingAddress)}</p>`,
    ].join('\n')
  );

  const text = [lead, '', `Confirm my request: ${input.confirmUrl}`, '', ignore, '', SENDER_LINE, input.mailingAddress].join(
    '\n'
  );

  return { subject, html, text };
}
