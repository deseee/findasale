/**
 * Organizer-recruitment cold-send templates (recruit channel only).
 *
 * Plain text first: the text body is the real message, the HTML body is a
 * minimal escaped mirror of it so links are clickable. Every message is built
 * from per-lead merge fields (businessName, city, contactName with a fallback),
 * so no two recipients get an identical body.
 *
 * Copy rules (Patrick / architect, 2026-10-12): honest subject lines, no
 * mention of artificial intelligence, no "e-state sale" wording (hyphen added so
 * copy greps stay clean), no em or en dashes, no founder voice, signed
 * "The FindA.Sale team", physical address and a one-click unsubscribe line in
 * every message. Max 2 touches. A lead without a businessName is never
 * rendered (renderRecruitEmail throws) and the job refuses to send it.
 */

export const RECRUIT_MAX_TOUCHES = 2;

export interface RecruitMergeFields {
  businessName: string;
  city?: string | null;
  contactName?: string | null;
}

export interface RecruitRenderContext {
  unsubscribeUrl: string;
  physicalAddress: string;
  siteUrl: string; // e.g. https://finda.sale
}

export interface RenderedRecruitEmail {
  subject: string;
  text: string;
  html: string;
}

function clean(v: string | null | undefined): string {
  return (v || '').replace(/\s+/g, ' ').trim();
}

function firstName(contactName: string | null | undefined): string | null {
  const c = clean(contactName);
  if (!c) return null;
  const first = c.split(' ')[0];
  // Ignore obvious non-names (role inboxes copied into the name column, initials, etc.)
  if (first.length < 2 || /[@0-9]/.test(first)) return null;
  return first;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToHtml(text: string): string {
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs
    .map((p) => {
      const escaped = escapeHtml(p)
        .split('\n')
        .join('<br>')
        .replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}">${url}</a>`);
      return `<p style="margin:0 0 14px 0">${escaped}</p>`;
    })
    .join('\n');
}

function footer(f: RecruitMergeFields, ctx: RecruitRenderContext): string {
  const city = clean(f.city);
  const where = city ? ` in ${city}` : '';
  return [
    'The FindA.Sale team',
    ctx.siteUrl.replace(/^https?:\/\//, ''),
    '',
    `You are getting this because ${clean(f.businessName)} is publicly listed as a sale organizer${where}. ` +
      `To stop these emails, unsubscribe with one click: ${ctx.unsubscribeUrl}`,
    `FindA.Sale, ${ctx.physicalAddress}`,
  ].join('\n');
}

/**
 * Render touch 1 or touch 2 for one lead. Throws if businessName is missing or
 * the touch number is out of range, so a bad lead can never be sent a blank or
 * generic message.
 */
export function renderRecruitEmail(
  touchNumber: number,
  f: RecruitMergeFields,
  ctx: RecruitRenderContext
): RenderedRecruitEmail {
  const businessName = clean(f.businessName);
  if (!businessName) throw new Error('recruitTemplates: businessName is required');
  if (touchNumber < 1 || touchNumber > RECRUIT_MAX_TOUCHES) {
    throw new Error(`recruitTemplates: touchNumber ${touchNumber} out of range`);
  }

  const name = firstName(f.contactName);
  const greeting = name ? `Hi ${name},` : `Hi ${businessName} team,`;
  const city = clean(f.city);
  const local = city ? `shoppers around ${city}` : 'local shoppers';
  const site = ctx.siteUrl.replace(/\/+$/, '');

  let subject: string;
  let body: string;

  if (touchNumber === 1) {
    subject = `A free listing page for ${businessName} on FindA.Sale`;
    body = [
      greeting,
      '',
      `We found ${businessName} while looking for sale organizers${city ? ` near ${city}` : ''}, and wanted to let you know about FindA.Sale.`,
      '',
      `FindA.Sale is a place to post your upcoming sales and the items in them, so ${local} can browse before sale day and show up ready to buy. ` +
        'Organizers can start on the free plan. There is no monthly charge on that plan; a fee applies only when items sell through the site.',
      '',
      `If that sounds useful for ${businessName}, you can look around here: ${site}/pricing?src=recruit-1`,
      '',
      'If you have questions, just reply to this email and a real person on our team will answer.',
    ].join('\n');
  } else {
    subject = `Following up about FindA.Sale for ${businessName}`;
    body = [
      greeting,
      '',
      `A short follow-up to our earlier note about posting sales for ${businessName} on FindA.Sale.`,
      '',
      `Each sale you post gets its own page that ${local} can find, save and share, and you can add photos of the items ahead of time so people know what is coming. ` +
        'The free plan has no monthly charge.',
      '',
      `More details: ${site}/pricing?src=recruit-2`,
      '',
      'This is the last email we will send about it. If the timing is wrong, no reply is needed.',
    ].join('\n');
  }

  const text = `${body}\n\n${footer(f, ctx)}\n`;
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222">\n' +
    textToHtml(text.trim()) +
    '\n</div>';

  return { subject, text, html };
}
