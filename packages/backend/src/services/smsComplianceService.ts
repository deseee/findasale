/**
 * smsComplianceService (2026-09-29): everything the organizer text-message ("SMS update")
 * feature needs to stay inside TCPA / CTIA rules, kept in one place so every SMS sender can
 * reuse it.
 *
 *  - Recorded consent: SaleSubscriber.smsConsentAt (set only by an explicit opt-in).
 *  - STOP / HELP / START handling: classifyInboundKeyword + the SmsOptOut suppression table,
 *    fed by the inbound Twilio webhook (controllers/smsWebhookController.ts) and by Twilio
 *    error 21610 (recipient already blocked the number at the carrier).
 *  - Quiet hours: no sends before 8:00 AM or from 9:00 PM in the organizer's timezone.
 *    (Recipient timezone is not stored; the organizer's timezone is the sale's local time.)
 *  - Cost control: per-organizer rolling 24 hour cap computed from SmsSendLog, message length
 *    and segment limits.
 *  - Twilio inbound signature validation (fail closed).
 *
 * Environment:
 *   SMS_DAILY_CAP_PER_ORGANIZER  max recipient texts per organizer per rolling 24h (default 300)
 *   TWILIO_AUTH_TOKEN            also used to validate inbound webhook signatures
 *   TWILIO_WEBHOOK_BASE_URL      optional, e.g. https://api.finda.sale. Use it when the public URL
 *                                Twilio calls differs from the host Express sees (proxy rewrites).
 *   SMS_ALLOWED_COUNTRY_CODES    comma separated country codes we may text (default "1" = US/Canada).
 *
 * Double opt-in (2026-09-29): a shopper who types a number on the sale page only creates a PENDING
 * consent (SaleSubscriber.smsConsentPendingAt). One confirmation text is sent, and consent
 * (smsConsentAt) is recorded only when that number itself replies YES/START. STOP nulls consent for
 * every row of that number and START/YES never revives it. See confirmPendingSmsConsent and
 * revokeSmsConsentForPhone below and controllers/smsWebhookController.ts.
 */

import crypto from 'crypto';
import type { Request } from 'express';
import twilio from 'twilio';
import { prisma } from '../lib/prisma';
import { regionConfig } from '../config/regionConfig';
import { safeErrorForLog } from '../utils/logMask';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** No texts before this local hour (inclusive start of the allowed window). */
export const SMS_ALLOWED_START_HOUR = 8;
/** No texts from this local hour onward (exclusive end of the allowed window). */
export const SMS_ALLOWED_END_HOUR = 21;
export const SMS_STOP_FOOTER = 'Reply STOP to opt out.';
/** Organizer-written portion only. The sender prefix and STOP footer are added on top. */
export const SMS_MAX_ORGANIZER_MESSAGE_CHARS = 240;
/** Reject anything that would bill more than this many segments per recipient. */
export const SMS_MAX_SEGMENTS = 3;
export const SMS_CONSENT_SOURCE_SALE_PAGE = 'sale_page_opt_in_v1';
/** Consent captured by the double opt-in flow (pending on submit, confirmed by the YES reply). */
export const SMS_CONSENT_SOURCE_DOUBLE_OPT_IN = 'sale_page_double_opt_in_v2';
/** Version of the consent copy shown next to the checkbox (bump when the wording changes). */
export const SMS_CONSENT_VERSION = 'sale_text_updates_copy_2026_09_29';
/** A pending (unconfirmed) opt-in is ignored and never texted after this long. */
export const SMS_CONSENT_PENDING_TTL_MS = 48 * 60 * 60 * 1000;
export const SMS_HELP_REPLY =
  'FindA.Sale sale text updates. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out. Help: support@finda.sale';

export const getSmsDailyCap = (): number => {
  const n = parseInt(process.env.SMS_DAILY_CAP_PER_ORGANIZER || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 300;
};

// ---------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------

/** Country calling codes we are willing to text. Default "1" (US and Canada); override with SMS_ALLOWED_COUNTRY_CODES. */
export function getAllowedCountryCodes(): string[] {
  const codes = (process.env.SMS_ALLOWED_COUNTRY_CODES || '')
    .split(',')
    .map((c) => c.replace(/\D/g, ''))
    .filter((c) => c.length > 0 && c.length <= 3 && !c.startsWith('0'));
  return codes.length > 0 ? codes : ['1'];
};

/**
 * NANP area codes we text (2026-09-30): an explicit allowlist of United States and Canadian geographic area codes.
 * "+1" alone is not "US or Canada": the same country code covers Caribbean nations (242, 246, 264, 268, 284, 345, 441,
 * 473, 649, 664, 721, 758, 767, 784, 809, 829, 849, 868, 869, 876), US territories (PR 787/939, USVI 340, Guam 671,
 * American Samoa 684, Northern Marianas 670) and premium or non-geographic codes (900, 976, 800-series toll free,
 * 500/533/544/566/577/588 personal numbers). Decision: US states + DC and Canada only; everything else is rejected,
 * which also keeps international-rate and premium-rate destinations out of the send path. Territories can be turned on
 * with SMS_EXTRA_AREA_CODES="787,939,340" (comma separated three-digit codes) without a deploy of new code.
 * Sourced from the NANPA assignment list; a brand-new overlay that is missing here fails CLOSED (number rejected), and
 * SMS_EXTRA_AREA_CODES is the release valve.
 */
export const US_AREA_CODES: ReadonlySet<string> = new Set([
  '201', '202', '203', '205', '206', '207', '208', '209', '210', '212', '213', '214',
  '215', '216', '217', '218', '219', '220', '223', '224', '225', '227', '228', '229',
  '231', '234', '239', '240', '248', '251', '252', '253', '254', '256', '260', '262',
  '267', '269', '270', '272', '274', '276', '279', '281', '301', '302', '303', '304',
  '305', '307', '308', '309', '310', '312', '313', '314', '315', '316', '317', '318',
  '319', '320', '321', '323', '324', '325', '326', '327', '329', '330', '331', '332',
  '334', '336', '337', '339', '341', '346', '347', '350', '351', '352', '353', '360',
  '361', '363', '364', '369', '380', '385', '386', '401', '402', '404', '405', '406',
  '407', '408', '409', '410', '412', '413', '414', '415', '417', '419', '423', '424',
  '425', '430', '432', '434', '435', '440', '442', '443', '445', '447', '448', '458',
  '463', '464', '469', '470', '475', '478', '479', '480', '484', '501', '502', '503',
  '504', '505', '507', '508', '509', '510', '512', '513', '515', '516', '517', '518',
  '520', '530', '531', '534', '539', '540', '541', '551', '557', '559', '561', '562',
  '563', '564', '567', '570', '571', '572', '573', '574', '575', '580', '585', '586',
  '601', '602', '603', '605', '606', '607', '608', '609', '610', '612', '614', '615',
  '616', '617', '618', '619', '620', '623', '624', '626', '628', '629', '630', '631',
  '636', '640', '641', '645', '646', '650', '651', '656', '657', '659', '660', '661',
  '662', '667', '669', '678', '679', '680', '681', '682', '689', '701', '702', '703',
  '704', '706', '707', '708', '712', '713', '714', '715', '717', '718', '719', '720',
  '724', '725', '726', '727', '728', '730', '731', '732', '734', '737', '738', '740',
  '743', '747', '754', '757', '760', '762', '763', '764', '765', '769', '770', '771',
  '772', '773', '774', '775', '779', '781', '785', '786', '801', '802', '803', '804',
  '805', '806', '808', '810', '812', '813', '814', '815', '816', '817', '818', '820',
  '828', '830', '831', '832', '835', '838', '839', '840', '843', '845', '847', '848',
  '850', '854', '856', '857', '858', '859', '860', '862', '863', '864', '865', '870',
  '872', '878', '901', '903', '904', '906', '907', '908', '909', '910', '912', '913',
  '914', '915', '916', '917', '918', '919', '920', '925', '928', '929', '930', '931',
  '934', '936', '937', '938', '940', '941', '943', '945', '947', '948', '949', '951',
  '952', '954', '956', '959', '970', '971', '972', '973', '975', '978', '979', '980',
  '983', '984', '985', '986', '989',
]);
export const CA_AREA_CODES: ReadonlySet<string> = new Set([
  '204', '226', '236', '249', '250', '257', '263', '289', '306', '343', '354', '365',
  '367', '368', '382', '403', '416', '418', '428', '431', '437', '438', '450', '468',
  '474', '506', '514', '519', '548', '579', '581', '584', '587', '604', '613', '639',
  '647', '672', '683', '705', '709', '742', '753', '778', '780', '782', '807', '819',
  '825', '867', '873', '879', '902', '905', '942',
]);
/** Never allowed, even through SMS_EXTRA_AREA_CODES: premium-rate and pay-per-call. */
const PREMIUM_AREA_CODES: ReadonlySet<string> = new Set(['900', '976']);

const extraAreaCodes = (): Set<string> =>
  new Set(
    (process.env.SMS_EXTRA_AREA_CODES || '')
      .split(',')
      .map((c) => c.replace(/\D/g, ''))
      .filter((c) => c.length === 3 && /^[2-9]/.test(c) && !PREMIUM_AREA_CODES.has(c))
  );

/** True when the three-digit NANP area code is a US or Canadian geographic code we may text. */
export function isAllowedNanpAreaCode(areaCode: string): boolean {
  if (typeof areaCode !== 'string' || !/^[2-9]\d{2}$/.test(areaCode)) return false;
  if (PREMIUM_AREA_CODES.has(areaCode)) return false;
  return US_AREA_CODES.has(areaCode) || CA_AREA_CODES.has(areaCode) || extraAreaCodes().has(areaCode);
}

/**
 * Normalize to E.164. US/Canada (NANP) numbers may be typed with any punctuation; anything else
 * must already carry a leading + AND be in the SMS_ALLOWED_COUNTRY_CODES allowlist (default: +1 only).
 * Returns null when the number cannot be a valid mobile target. Strict on purpose: only the characters
 * a person types into a phone field (digits, spaces, ( ) . - and one leading +) are accepted, so
 * "tel:+1...", trailing junk, extensions and letters are rejected instead of being silently "cleaned".
 */
export function normalizePhoneE164(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 40) return null;
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  let e164Digits: string;
  if (trimmed.startsWith('+')) {
    if (digits.startsWith('0')) return null;
    if (digits.length < 8 || digits.length > 15) return null;
    e164Digits = digits;
  } else {
    let national = digits;
    if (national.length === 11 && national.startsWith('1')) national = national.slice(1);
    if (national.length !== 10) return null;
    e164Digits = `1${national}`;
  }
  const allowed = getAllowedCountryCodes();
  if (!allowed.some((cc) => e164Digits.startsWith(cc))) return null;
  if (e164Digits.startsWith('1')) {
    // NANP (applies to "+1..." exactly like unprefixed numbers): 11 digits, area code and exchange
    // cannot start with 0 or 1, and N11 area codes / exchanges (211, 911, ...) are service codes.
    if (e164Digits.length !== 11) return null;
    const national = e164Digits.slice(1);
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null;
    if (national.slice(1, 3) === '11' || national.slice(4, 6) === '11') return null;
    // Only US and Canadian geographic area codes: no Caribbean, territories, premium (900/976) or toll-free.
    if (!isAllowedNanpAreaCode(national.slice(0, 3))) return null;
  }
  return `+${e164Digits}`;
}

/** Ways the same US/Canada number may have been stored by older code (used to find rows by phone). */
export function phoneStorageVariants(e164: string): string[] {
  const m = /^\+1([2-9]\d{2})([2-9]\d{2})(\d{4})$/.exec(e164);
  if (!m) return [e164];
  const [, a, b, c] = m;
  return [e164, `1${a}${b}${c}`, `${a}${b}${c}`, `(${a}) ${b}-${c}`, `${a}-${b}-${c}`, `${a}.${b}.${c}`, `${a} ${b} ${c}`, `+1 ${a} ${b} ${c}`, `+1 (${a}) ${b}-${c}`];
}

/** Log-safe form of a phone number (never write full numbers to logs). */
export const maskPhone = (phone: string | null | undefined): string =>
  phone ? `***${phone.replace(/\D/g, '').slice(-4)}` : 'unknown';

// ---------------------------------------------------------------------------
// Inbound keywords (CTIA)
// ---------------------------------------------------------------------------

export type InboundKeyword = 'STOP' | 'START' | 'HELP' | null;

// Single words that are always an opt-out when they are the whole message. STRONG words are also an
// opt-out when they merely start a short message ("STOP texting me"); WEAK words (END, CANCEL, QUIT)
// only when the message is 3 words or fewer, because "end time?" is far more likely a question.
const STOP_STRONG = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'OPTOUT', 'REVOKE']);
const STOP_WEAK = new Set(['CANCEL', 'END', 'QUIT']);
const STOP_PHRASES = ['STOP ALL', 'OPT OUT', 'REMOVE ME'];
const START_WORDS = new Set(['START', 'YES', 'UNSTOP']);
const HELP_WORDS = new Set(['HELP', 'INFO']);
// Phrases anywhere in a short message that mean "stop texting me".
const STOP_CONTAINS: RegExp[] = [
  /\bSTOP\b/,
  /\bSTOPALL\b/,
  /\bUNSUBSCRIBE\b/,
  /\bOPT ?OUT\b/,
  /\bREMOVE ME\b/,
  /\b(DO NOT|DONT|DON'T) (TEXT|MESSAGE|SMS|CONTACT)\b/,
  /\bNO MORE (TEXTS?|MESSAGES?)\b/,
];
// Carrier keywords that opt the number out whenever they are the FIRST word, whatever follows ("STOP, thanks a lot",
// "Stop. I don't want to keep getting these", "END"). Checked before any "this is not an opt-out" pattern: a false
// opt-out costs a subscription, a missed one is a TCPA violation. Strict superset of what CTIA requires as an exact match.
const STOP_FIRST_TOKEN = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE']);
// Obvious non-opt-out uses of the same words. Only consulted when the first word is NOT a carrier keyword.
const STOP_POSITIVE: RegExp[] = [
  /\bSTOP BY\b/,
  /\bSTOP (IN|OVER|ON)\b/,
  /\bBUS STOP\b/,
  /\bNON ?STOP\b/,
  /\b(DON'?T|DO NOT|NEVER|CAN'?T|CANT|WON'?T|NOT) (STOP|UNSUBSCRIBE|CANCEL|QUIT)\b/,
  /\bKEEP\b/,
];

/** NFKC-normalized (fullwidth letters become ASCII), upper-cased, letters/digits/apostrophes only. */
function normalizeInboundWords(body: string): string[] {
  const upper = body
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .toUpperCase()
    .replace(/[^A-Z0-9']+/g, ' ')
    .trim();
  return upper ? upper.split(' ') : [];
}

/**
 * Classify an inbound text. Twilio's own OptOutType param (Advanced Opt-Out) wins when present.
 * Otherwise (industry-conservative, "when in doubt treat it as an opt-out"):
 *  - the FIRST word is a carrier stop keyword (STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, OPTOUT, REVOKE), in any
 *    case or punctuation, whatever follows it: this rule runs before every "means something else" exception, OR
 *  - the whole message is a stop word/phrase (STOP, STOPALL, STOP ALL, UNSUBSCRIBE, CANCEL, END, QUIT,
 *    OPT OUT, OPTOUT, REVOKE, REMOVE ME), fullwidth and punctuation tolerant ("Stop!", "ＳＴＯＰ"), OR
 *  - the message STARTS with a strong stop word (or CANCEL/END/QUIT in a message of 3 words or fewer), OR
 *  - a short message (6 words or fewer) contains stop / unsubscribe / opt out / do not text,
 *  unless it plainly means something else ("stop by at 9", "don't stop", "keep them coming").
 * START/YES/UNSTOP and HELP/INFO are recognised only as the whole message. Everything else returns null
 * and is forwarded to a human by the webhook.
 */
export function classifyInboundKeyword(body: unknown, optOutType?: unknown): InboundKeyword {
  if (typeof optOutType === 'string') {
    const t = optOutType.trim().toUpperCase();
    if (t === 'STOP' || t === 'START' || t === 'HELP') return t;
  }
  if (typeof body !== 'string') return null;
  const words = normalizeInboundWords(body);
  if (words.length === 0) return null;
  const whole = words.join(' ');

  if (STOP_STRONG.has(whole) || STOP_WEAK.has(whole) || STOP_PHRASES.includes(whole)) return 'STOP';
  if (words.length === 1 && START_WORDS.has(whole)) return 'START';
  if (words.length === 1 && HELP_WORDS.has(whole)) return 'HELP';

  const first = words[0];
  if (STOP_FIRST_TOKEN.has(first)) return 'STOP'; // exact carrier keyword as first token always wins
  if (STOP_POSITIVE.some((re) => re.test(whole))) return null;
  if (words.length <= 12 && STOP_STRONG.has(first)) return 'STOP';
  if (words.length <= 3 && STOP_WEAK.has(first)) return 'STOP';
  if (words.length <= 12 && STOP_PHRASES.some((ph) => whole.startsWith(`${ph} `))) return 'STOP';
  if (words.length <= 6 && STOP_CONTAINS.some((re) => re.test(whole))) return 'STOP';
  return null;
}

/** Printable, single-line, length-capped copy of an inbound message for logs. */
export function sanitizeInboundText(body: unknown, maxLen = 160): string {
  if (typeof body !== 'string') return '';
  return body
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// Message composition + segment estimate
// ---------------------------------------------------------------------------

// GSM 03.38 basic character set (escapes so this file stays ASCII) and the extension table.
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[~]|€';

export function estimateSmsSegments(text: string): { encoding: 'GSM-7' | 'UCS-2'; units: number; segments: number } {
  let gsm = true;
  let units = 0;
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch)) units += 1;
    else if (GSM7_EXT.includes(ch)) units += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) {
    return { encoding: 'GSM-7', units, segments: units <= 160 ? 1 : Math.ceil(units / 153) };
  }
  const ucsUnits = text.length; // UTF-16 code units, which is how UCS-2 segments are counted
  return { encoding: 'UCS-2', units: ucsUnits, segments: ucsUnits <= 70 ? 1 : Math.ceil(ucsUnits / 67) };
}

const cleanOrgName = (name: string | null | undefined): string => {
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return n || 'Your organizer';
};

/** Prefix identifies the sender (CTIA); suffix is the mandatory opt-out line. */
export function getSmsFraming(orgName: string | null | undefined): { prefix: string; suffix: string } {
  return { prefix: `${cleanOrgName(orgName)} via FindA.Sale: `, suffix: `\n${SMS_STOP_FOOTER}` };
}

export function composeSmsBody(orgName: string | null | undefined, message: string): string {
  const { prefix, suffix } = getSmsFraming(orgName);
  return `${prefix}${message.trim()}${suffix}`;
}

// ---------------------------------------------------------------------------
// Quiet hours
// ---------------------------------------------------------------------------

const isValidTimeZone = (tz: unknown): tz is string => {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Organizer timezone, else the platform default region timezone, else America/Chicago. */
export function resolveSendTimeZone(organizerTimeZone?: string | null): string {
  for (const tz of [organizerTimeZone, regionConfig?.timeZone, 'America/Chicago']) {
    if (isValidTimeZone(tz)) return tz;
  }
  return 'America/Chicago';
}

export type QuietHoursResult = {
  allowed: boolean;
  timeZone: string;
  localHour: number;
  /** Next moment sends are allowed: 8:00 AM local, DST-correct (null when allowed now). */
  nextAllowedAt: Date | null;
};

const localParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') };
};

/** The next instant (whole seconds) at which the wall clock in `timeZone` reads SMS_ALLOWED_START_HOUR:00:00. */
function nextWindowStart(now: Date, timeZone: string): Date {
  const l = localParts(now, timeZone);
  const targetDay = l.hour < SMS_ALLOWED_START_HOUR ? l.day : l.day + 1;
  // Work in "wall clock as if it were UTC" so day/month rollover is plain arithmetic.
  const targetWall = Date.UTC(l.year, l.month - 1, targetDay, SMS_ALLOWED_START_HOUR, 0, 0);
  const nowWall = Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute, l.second);
  let guess = Math.floor(now.getTime() / 1000) * 1000 + (targetWall - nowWall);
  // A DST change between now and the target moves the offset; converge on the real instant.
  for (let i = 0; i < 4; i++) {
    const g = localParts(new Date(guess), timeZone);
    const gWall = Date.UTC(g.year, g.month - 1, g.day, g.hour, g.minute, g.second);
    const diff = targetWall - gWall;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

export function checkQuietHours(now: Date, timeZone: string): QuietHoursResult {
  const { hour } = localParts(now, timeZone);
  const allowed = hour >= SMS_ALLOWED_START_HOUR && hour < SMS_ALLOWED_END_HOUR;
  if (allowed) return { allowed: true, timeZone, localHour: hour, nextAllowedAt: null };
  return { allowed: false, timeZone, localHour: hour, nextAllowedAt: nextWindowStart(now, timeZone) };
}

export const describeAllowedWindow = (): string => {
  const fmt = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`;
  return `${fmt(SMS_ALLOWED_START_HOUR)} to ${fmt(SMS_ALLOWED_END_HOUR)}`;
};

// ---------------------------------------------------------------------------
// Twilio inbound signature validation (fail closed)
// ---------------------------------------------------------------------------

export function verifyTwilioSignature(req: Request): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('[SMS webhook] TWILIO_AUTH_TOKEN not set, rejecting request (fail closed).');
    return false;
  }
  const signature = req.headers['x-twilio-signature'];
  if (typeof signature !== 'string' || !signature) {
    console.warn('[SMS webhook] Missing X-Twilio-Signature header, rejecting.');
    return false;
  }
  const urls: string[] = [];
  const base = (process.env.TWILIO_WEBHOOK_BASE_URL || '').replace(/\/+$/, '');
  if (base) urls.push(`${base}${req.originalUrl}`);
  urls.push(`${req.protocol}://${req.get('host')}${req.originalUrl}`);
  const params = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, string>;
  return urls.some((u) => {
    try {
      return twilio.validateRequest(authToken, signature, u, params);
    } catch {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// Suppression list + send log (database)
// ---------------------------------------------------------------------------

/** Which of these E.164 numbers are on the suppression list. */
export async function getOptedOutPhoneSet(phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  const rows = await prisma.smsOptOut.findMany({
    where: { phone: { in: phones } },
    select: { phone: true },
  });
  return new Set(rows.map((r: { phone: string }) => r.phone));
}

export async function isPhoneOptedOut(rawPhone: string): Promise<boolean> {
  const phone = normalizePhoneE164(rawPhone);
  if (!phone) return false;
  return (await getOptedOutPhoneSet([phone])).has(phone);
}

/** Stored keyword: printable ASCII, single spaces, upper case, at most 20 characters (never the raw message). */
export function sanitizeOptOutKeyword(keyword: string | null | undefined): string | null {
  if (keyword === null || keyword === undefined) return null;
  const cleaned = String(keyword)
    .normalize('NFKC')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 20);
  return cleaned || null;
}

export async function recordSmsOptOut(phone: string, keyword: string | null, source: 'STOP_REPLY' | 'TWILIO_21610'): Promise<void> {
  const lastKeyword = sanitizeOptOutKeyword(keyword);
  await prisma.smsOptOut.upsert({
    where: { phone },
    update: { source, lastKeyword, optedOutAt: new Date() },
    create: { phone, source, lastKeyword },
  });
  // A STOP ends consent for EVERY row of this number (all sales, all organizers). START/YES later
  // never brings old consent back: the person has to opt in again and confirm by text.
  await revokeSmsConsentForPhone(phone).catch((err: unknown) =>
    // Masked: Prisma errors can embed the phone number in the failing query text.
    console.error(`[SMS] Failed to revoke stored consent for ${maskPhone(phone)}: ${safeErrorForLog(err)}`)
  );
}

export async function clearSmsOptOut(phone: string): Promise<void> {
  await prisma.smsOptOut.deleteMany({ where: { phone } });
}

/** Null out recorded and pending consent on every subscriber row for this number. Returns rows changed. */
export async function revokeSmsConsentForPhone(phone: string): Promise<number> {
  const res = await prisma.saleSubscriber.updateMany({
    where: {
      phone: { in: phoneStorageVariants(phone) },
      OR: [{ smsConsentAt: { not: null } }, { smsConsentPendingAt: { not: null } }],
    },
    data: { smsConsentAt: null, smsConsentPendingAt: null },
  });
  return res?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Confirmation-text ledger (per phone) and scoped YES handling
// ---------------------------------------------------------------------------

/** Confirmation texts to one number per rolling day, across every sale, organizer and account. */
export const SMS_CONFIRMATION_MAX_PER_PHONE_PER_DAY = 3;
/** ...and per rolling hour (stops one sale-per-request burst at a victim's number). */
export const SMS_CONFIRMATION_MAX_PER_PHONE_PER_HOUR = 2;
export const SMS_CONFIRMATION_LOG_TAG = '[confirmation]';

/**
 * Non-reversible per-number key (HMAC-SHA256 of the E.164 number, 24 hex chars). SmsSendLog has no phone column
 * (and must never hold a raw number), so the double opt-in confirmation writes this key into the start of its log
 * message: `[confirmation] [ph_<key>] <sale title>`. Used to count confirmation texts per number and to find the
 * sale a YES reply belongs to.
 */
export function phoneConfirmationKey(e164: string): string {
  const secret = process.env.SMS_PHONE_KEY_SECRET || process.env.JWT_SECRET || 'sms-phone-key-dev-only';
  return `ph_${crypto.createHmac('sha256', secret).update(String(e164)).digest('hex').slice(0, 24)}`;
}

/** Exact start of every SmsSendLog message written by the confirmation text to this number. */
export const confirmationLogPrefix = (e164: string): string => `${SMS_CONFIRMATION_LOG_TAG} [${phoneConfirmationKey(e164)}]`;

/** Confirmation texts attempted to this number since `since`, over ALL sales and organizers (no exclusions). */
export async function countConfirmationTextsToPhone(e164: string, since: Date): Promise<number> {
  return prisma.smsSendLog.count({
    where: { message: { startsWith: confirmationLogPrefix(e164) }, createdAt: { gte: since } },
  });
}

/**
 * True when one more confirmation text to this number would exceed the per-number caps (2 per hour, 3 per day, over
 * all sales). Callers answer exactly as for a normal number (no oracle); throws when the ledger cannot be read, so the
 * caller can fail closed.
 */
export async function isConfirmationThrottled(e164: string, now: Date = new Date()): Promise<boolean> {
  const [lastHour, lastDay] = await Promise.all([
    countConfirmationTextsToPhone(e164, new Date(now.getTime() - 60 * 60 * 1000)),
    countConfirmationTextsToPhone(e164, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
  ]);
  return lastHour >= SMS_CONFIRMATION_MAX_PER_PHONE_PER_HOUR || lastDay >= SMS_CONFIRMATION_MAX_PER_PHONE_PER_DAY;
}

/**
 * The number replied YES/START. Confirms ONLY the pending row(s) that belong to the MOST RECENT confirmation text sent
 * to this number: the SmsSendLog confirmation entry (keyed by phoneConfirmationKey, newest within the 48 hour window)
 * names the organizer and sale that text was about, and only that sale's still-pending row for this number is
 * confirmed. A YES therefore never turns on texts for other sales or other organizers that also have a pending row for
 * the number (someone else may have typed the number there), and never revives expired or STOP-revoked rows.
 * When no confirmation entry exists (log write failed, or a row from before the ledger existed) it falls back to the
 * single most recently submitted pending row, still never more than one sale. Throws when the lookup fails (the webhook
 * answers 500 and confirms nothing). Returns rows confirmed.
 */
export async function confirmPendingSmsConsent(phone: string, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SMS_CONSENT_PENDING_TTL_MS);
  const e164 = normalizePhoneE164(phone) ?? phone;
  const variants = phoneStorageVariants(e164);

  const latestText = await prisma.smsSendLog.findFirst({
    where: { message: { startsWith: confirmationLogPrefix(e164) }, createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'desc' },
    select: { saleId: true, organizerId: true },
  });

  let saleId: string | null = latestText?.saleId ?? null;
  if (!saleId) {
    const latestPending = await prisma.saleSubscriber.findFirst({
      where: { phone: { in: variants }, smsConsentAt: null, smsConsentPendingAt: { gte: cutoff } },
      orderBy: { smsConsentPendingAt: 'desc' },
      select: { saleId: true },
    });
    saleId = latestPending?.saleId ?? null;
  }
  if (!saleId) return 0;

  const res = await prisma.saleSubscriber.updateMany({
    where: {
      phone: { in: variants },
      saleId,
      smsConsentAt: null,
      smsConsentPendingAt: { gte: cutoff },
    },
    data: { smsConsentAt: now, smsConsentPendingAt: null },
  });
  return res?.count ?? 0;
}

export const isPendingConsentActive = (pendingAt: Date | string | null | undefined, now: Date = new Date()): boolean =>
  !!pendingAt && now.getTime() - new Date(pendingAt).getTime() < SMS_CONSENT_PENDING_TTL_MS;

/** Recipient texts this organizer has sent in the rolling last 24 hours. */
export async function getSentInLast24h(organizerId: string, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const agg = await prisma.smsSendLog.aggregate({
    where: { organizerId, createdAt: { gte: since } },
    _sum: { sentCount: true },
  });
  return agg?._sum?.sentCount ?? 0;
}

export type SmsAudience = {
  /** Distinct E.164 numbers that consented and have not opted out. */
  eligible: string[];
  optedOut: number;
  invalidPhone: number;
  /** Subscribers with a phone on file but no recorded consent. Never texted. */
  noConsent: number;
  /** Subset of noConsent that is waiting for the shopper to reply YES (submitted within 48 hours). */
  pendingConfirmation: number;
};

const AUDIENCE_SCAN_LIMIT = 2000;

export async function loadSmsAudience(saleId: string): Promise<SmsAudience> {
  const pendingCutoff = new Date(Date.now() - SMS_CONSENT_PENDING_TTL_MS);
  const [consenting, noConsent, pendingConfirmation] = await Promise.all([
    prisma.saleSubscriber.findMany({
      where: { saleId, phone: { not: null }, smsConsentAt: { not: null } },
      select: { phone: true },
      orderBy: { createdAt: 'asc' },
      take: AUDIENCE_SCAN_LIMIT,
    }),
    prisma.saleSubscriber.count({ where: { saleId, phone: { not: null }, smsConsentAt: null } }),
    prisma.saleSubscriber.count({ where: { saleId, phone: { not: null }, smsConsentAt: null, smsConsentPendingAt: { gte: pendingCutoff } } }),
  ]);
  const seen = new Set<string>();
  let invalidPhone = 0;
  for (const row of consenting as Array<{ phone: string | null }>) {
    const e164 = normalizePhoneE164(row.phone);
    if (!e164) {
      invalidPhone++;
      continue;
    }
    seen.add(e164);
  }
  const all = Array.from(seen);
  const optedOutSet = await getOptedOutPhoneSet(all);
  const eligible = all.filter((p) => !optedOutSet.has(p));
  return { eligible, optedOut: all.length - eligible.length, invalidPhone, noConsent, pendingConfirmation };
}
