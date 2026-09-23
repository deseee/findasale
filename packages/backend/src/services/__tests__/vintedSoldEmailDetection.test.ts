/**
 * vintedSoldEmailDetection.ts -- unit tests (ADR-131 Vinted branch, 2026-09-23).
 *
 * Fixtures are modeled on the real "You sold an item on Vinted" email observed 2026-09-19
 * (Team Vinted <no-reply@vinted.com>, text/html quoted-printable, Authentication-Results
 * dkim=pass header.i=@vinted.com + dkim=pass header.i=@amazonses.com, dmarc=pass
 * header.from=vinted.com). The buyer handle is replaced with a placeholder. The title in the
 * HTML carries Vinted's double space ("#2  R. Crumb").
 */

jest.mock('../../lib/prisma', () => ({ prisma: {} }));
jest.mock('../facebookNativeSaleService', () => ({ commitFacebookNativeSale: jest.fn() }));
jest.mock('../organizerEmailForwardingService', () => ({
  ...jest.requireActual('../organizerEmailForwardingService'),
  resolveOrganizerIdByForwardingToken: jest.fn(async (token: string) =>
    token.toLowerCase() === 'knowntoken_abc123' ? 'organizer_1' : null,
  ),
}));

import {
  processVintedSoldEmail,
  parseVintedSoldEmailTitle,
  htmlToPlainText,
  decodeHtmlEntities,
  VINTED_SOLD_EMAIL_SENDER,
  VINTED_SOLD_EMAIL_SUBJECT,
  type InboundVintedSoldEmail,
} from '../vintedSoldEmailDetection';
import { buildFacebookSoldForwardingAddress } from '../organizerEmailForwardingService';

const KNOWN_TOKEN = 'KnownToken_abc123';
const TITLE_HTML = 'Mr. Natural #2  R. Crumb (San Francisco Comic Book Company Oct 1971)';
const TITLE_SINGLE = 'Mr. Natural #2 R. Crumb (San Francisco Comic Book Company Oct 1971)';

function soldHtml(title = TITLE_HTML, price = '$14.00', buyer = 'b4yer99'): string {
  return `<!DOCTYPE html><html lang="en-US"><head>
    <meta charset="utf-8"/>
    <title>
      Vinted Email
    </title>
    <style>
      @media screen and (max-width: 480px) { .mobile-button-full-width { display: block !important; } }
    </style>
  </head>
  <body style="margin:0; padding:0; background:#ffffff; font-family:&#39;Helvetica Neue&#39;,Helvetica,Arial,sans-serif;"><img src="https://www.vinted.com/crm/email_track?correlation_id=abc&amp;email_code=INFORM-SELLER-DEBIT-UNIFIED" width="1" height="1" alt=""/>
<table role="presentation"><tbody><tr><td>
<table role="presentation"><!-- Header logo -->
<tbody>
<tr><td style="padding-bottom: 40px;"><a aria-label="Vinted" href="https://links.vinted.com/t/aHR0cHM6"> <img src="https://static-assets.vinted.com/vcrm/vinted_logo.png" alt="" width="86"/> </a></td></tr>
<tr>
<td><p><strong>Hello artifactm,</strong></p>
<p><strong>${buyer}</strong> has bought</p>
<table role="presentation" border="0" cellspacing="0" cellpadding="0">
<tbody><tr>
<td style="padding: 0 12px 0 0;" valign="top">
<div style="width: 48px; height: 48px;"><img src="https://images1.vinted.net/t/x.jpeg" alt="${title}" width="48" height="48"/> </div>
</td>
<td style="padding: 0;" valign="top">
<div style="font-size: 16px; font-weight: bold; color: #000000;">${title}</div>
<div style="margin-top: 2px; font-size: 16px; font-weight: bold; color: #000000;">${price}</div>
</td>
</tr></tbody>
</table>
<p>We will transfer the buyer&#39;s payment to your Vinted Wallet once the order is completed.</p>
<p></p>
<p>Please send this order within 5 days.</p>
<p>Here’s what you need to do: </p>
<ol><li>Go to the <a href="https://links.vinted.com/t/aHR0">message thread</a> between you and the buyer to generate your shipping label.</li></ol>
<p>It’s also a good idea to get in touch with ${buyer} and let them know when you&#39;ve sent the item.</p>
<p> </p>
<p>Team Vinted</p></td>
</tr>
<!-- Footer -->
<tr><td><p>This email was sent by Vinted, Vinted Inc., 1000 N. West Street, Suite 1200, Wilmington, Delaware 19801, USA.</p></td></tr>
</tbody></table></td></tr></tbody></table>
        </body></html>`;
}

const PASSING_AUTH = [
  'mx.google.com; dkim=pass header.i=@vinted.com header.s=zyqarrajf3fcvbj7g6mtbp735f72y6e3 header.b=uhsUw1RB; ' +
    'dkim=pass header.i=@amazonses.com header.s=shh3fegwg5fppqsuzphvschd53n6ihuv header.b=43L7hf+C; ' +
    'spf=pass (google.com: domain of x@aws-bounce.vinted.com designates 69.169.229.220 as permitted sender) smtp.mailfrom=x@aws-bounce.vinted.com; ' +
    'dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=vinted.com',
];

function soldEmail(overrides: Partial<InboundVintedSoldEmail> = {}): InboundVintedSoldEmail {
  return {
    from: VINTED_SOLD_EMAIL_SENDER,
    subject: VINTED_SOLD_EMAIL_SUBJECT,
    rawBody: soldHtml(),
    authenticationResults: PASSING_AUTH,
    recipientAddresses: ['artifactmi@gmail.com', buildFacebookSoldForwardingAddress(KNOWN_TOKEN)],
    ...overrides,
  };
}

function soldReport(result: string, extra: Record<string, any> = {}) {
  return jest.fn(async (_org: string, title: string) => ({ vintedId: '', title, result, matched: result !== 'notFound' && result !== 'ambiguous', ...extra }) as any);
}

describe('htmlToPlainText / decodeHtmlEntities', () => {
  it('drops head/style/comments, strips tags, decodes entities, collapses whitespace', () => {
    const t = htmlToPlainText('<head><title>Vinted Email</title><style>.a{b:c}</style></head><p>A&amp;B&nbsp;&#39;x&#x27;</p><!-- c --><div>\n  y  z</div>');
    expect(t).toBe("A&B 'x' y z");
  });
  it('leaves unknown entities alone', () => {
    expect(decodeHtmlEntities('&bogus; &#0; &lt;')).toBe('&bogus; &#0; <');
  });
});

describe('parseVintedSoldEmailTitle', () => {
  it('extracts the title from the real-shaped HTML (buyer and price discarded, double space collapsed)', () => {
    expect(parseVintedSoldEmailTitle(soldHtml())).toBe(TITLE_SINGLE);
  });

  it('does not pick up the title from the image alt attribute or the head', () => {
    const html = soldHtml().replace(`>${TITLE_HTML}</div>`, '></div>');
    // With the visible title removed, the segment between "has bought" and the price is empty.
    expect(parseVintedSoldEmailTitle(html)).toBeNull();
  });

  it('decodes entities in the title', () => {
    expect(parseVintedSoldEmailTitle(soldHtml('Crosby, Stills &amp; Nash Vinyl Record, Atlantic Records, 1970s'))).toBe(
      'Crosby, Stills & Nash Vinyl Record, Atlantic Records, 1970s',
    );
  });

  it('keeps a price-like token inside the title and strips only the trailing price', () => {
    expect(parseVintedSoldEmailTitle(soldHtml('Comic Lot $5 Each Bundle', '$14.00'))).toBe('Comic Lot $5 Each Bundle');
  });

  it('handles other price formats', () => {
    expect(parseVintedSoldEmailTitle(soldHtml('Vintage Oak Dresser', '14,00 €'))).toBe('Vintage Oak Dresser');
    expect(parseVintedSoldEmailTitle(soldHtml('Vintage Oak Dresser', '£1,250.50'))).toBe('Vintage Oak Dresser');
    expect(parseVintedSoldEmailTitle(soldHtml('Vintage Oak Dresser', 'US$ 14'))).toBe('Vintage Oak Dresser');
  });

  it('treats the buyer name as untrusted and never lets it reach the title', () => {
    expect(parseVintedSoldEmailTitle(soldHtml(TITLE_HTML, '$14.00', '&lt;script&gt;x'))).toBe(TITLE_SINGLE);
  });

  it('works on plain text too', () => {
    const text = `Hello artifactm, b4yer99 has bought ${TITLE_SINGLE} $14.00 We will transfer the buyer's payment to your Vinted Wallet once the order is completed.`;
    expect(parseVintedSoldEmailTitle(text)).toBe(TITLE_SINGLE);
  });

  it('extracts from a Gmail "Fwd:" wrapped body as well (parser only; processing still ignores it by sender)', () => {
    const wrapped = `<div dir="ltr"><br><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">---------- Forwarded message ---------<br>From: <strong>Team Vinted</strong> <span>&lt;<a href="mailto:no-reply@vinted.com">no-reply@vinted.com</a>&gt;</span><br>Date: Sat, Sep 19, 2026 at 3:01 PM<br>Subject: You sold an item on Vinted<br>To: &lt;<a href="mailto:artifactmi@gmail.com">artifactmi@gmail.com</a>&gt;<br></div><br><br><blockquote class="gmail_quote">${soldHtml()}</blockquote></div></div>`;
    expect(parseVintedSoldEmailTitle(wrapped)).toBe(TITLE_SINGLE);
  });

  it('returns null when there is no price token or no sold sentence', () => {
    expect(parseVintedSoldEmailTitle(soldHtml(TITLE_HTML, 'free'))).toBeNull();
    expect(parseVintedSoldEmailTitle('<p>Hello, your package is on its way.</p>')).toBeNull();
    expect(parseVintedSoldEmailTitle('')).toBeNull();
    expect(parseVintedSoldEmailTitle(undefined)).toBeNull();
  });
});

describe('processVintedSoldEmail -- only the sold email counts', () => {
  const nonSale: Array<[string, string, string]> = [
    ['shipping label', `${TITLE_HTML} shipping label – use by 09/28/2026 02:00 AM`, `<p>Hello artifactm, Your shipping label is attached to this message. Item: ${TITLE_HTML}</p>`],
    ['order update', `Order update for ${TITLE_HTML}`, `<p>Hi, Your package is on its way to the buyer! Estimated delivery is Sep 24 - Sep 29 for ${TITLE_HTML}.</p>`],
    ['new offer', `New offer for ${TITLE_HTML}`, `<p>artifactm, b4yer99 just offered to buy ${TITLE_HTML} for a lower price. $14.00 New offer: $14.00 instead of $16.00</p>`],
    ['favorited', `Your ${TITLE_HTML} was just favorited`, `<p>$16.00 someone has favorited your “${TITLE_HTML}”!</p>`],
    ['message', `New message about ${TITLE_HTML}`, `<p>artifactm, b4yer99 just sent you a message about ${TITLE_HTML}. New message: thanks!</p>`],
    ['order completed', 'This order is completed', `<p>artifactm, your sale is complete. Your sale of ${TITLE_HTML} was completed successfully.</p>`],
    ['payout', 'Your payment is being sent to your bank', '<p>Your money is on the way from your Vinted Wallet to your bank account.</p>'],
    ['look-alike subject', 'You sold an item on Vinted!!', soldHtml()],
    ['subject prefix only', 'You sold an item', soldHtml()],
  ];

  it.each(nonSale)('ignores the %s email and never touches the matcher', async (_label, subject, body) => {
    const processTitleReport = soldReport('sold', { itemId: 'item_mr' });
    const r = await processVintedSoldEmail(soldEmail({ subject, rawBody: body }), { processTitleReport });
    expect(r.kind).toBe('ignored');
    expect(processTitleReport).not.toHaveBeenCalled();
  });

  it('ignores marketing mail from team.vinted.com and any other sender', async () => {
    const processTitleReport = soldReport('sold', { itemId: 'item_mr' });
    for (const from of ['no-reply@team.vinted.com', 'no-reply@vinted.com.evil.example', 'artifactmi@gmail.com']) {
      const r = await processVintedSoldEmail(soldEmail({ from }), { processTitleReport });
      expect(r.kind).toBe('ignored');
    }
    expect(processTitleReport).not.toHaveBeenCalled();
  });

  it('ignores a hand-forwarded "Fwd:" copy (sender is the organizer), same as the Facebook branch', async () => {
    const processTitleReport = soldReport('sold', { itemId: 'item_mr' });
    const r = await processVintedSoldEmail(
      soldEmail({
        from: 'artifactmi@gmail.com',
        subject: `Fwd: ${VINTED_SOLD_EMAIL_SUBJECT}`,
        authenticationResults: ['mx.google.com; dkim=pass header.i=@gmail.com; dmarc=pass header.from=gmail.com'],
      }),
      { processTitleReport },
    );
    expect(r.kind).toBe('ignored');
    expect(processTitleReport).not.toHaveBeenCalled();
  });
});

describe('processVintedSoldEmail -- sender authentication (fail closed)', () => {
  const cases: Array<[string, string[] | undefined]> = [
    ['no Authentication-Results at all', undefined],
    ['only the amazonses.com signature passes', ['mx.google.com; dkim=pass header.i=@amazonses.com; dkim=fail header.i=@vinted.com; dmarc=pass header.from=vinted.com']],
    ['dkim=pass but no dmarc=pass', ['mx.google.com; dkim=pass header.i=@vinted.com; dmarc=fail header.from=vinted.com']],
    ['look-alike domain', ['mx.google.com; dkim=pass header.d=notvinted.com; dmarc=pass header.from=notvinted.com']],
    ['untrusted authserv-id', ['attacker.example; dkim=pass header.i=@vinted.com; dmarc=pass header.from=vinted.com']],
    ['forged pass below the real (topmost) fail', ['mx.google.com; dkim=fail header.i=@vinted.com; dmarc=fail header.from=vinted.com', PASSING_AUTH[0]]],
  ];
  it.each(cases)('ignores: %s', async (_label, authenticationResults) => {
    const processTitleReport = soldReport('sold', { itemId: 'item_mr' });
    const r = await processVintedSoldEmail(soldEmail({ authenticationResults }), { processTitleReport });
    expect(r.kind).toBe('ignored');
    expect((r as any).reason).toMatch(/sender authentication failed/);
    expect(processTitleReport).not.toHaveBeenCalled();
  });
});

describe('processVintedSoldEmail -- organizer scoping (fail closed)', () => {
  it('ignores an email with no sold-<token> recipient', async () => {
    const processTitleReport = soldReport('sold', { itemId: 'item_mr' });
    const r = await processVintedSoldEmail(soldEmail({ recipientAddresses: ['artifactmi@gmail.com'] }), { processTitleReport });
    expect(r).toEqual(expect.objectContaining({ kind: 'ignored' }));
    expect(processTitleReport).not.toHaveBeenCalled();
  });
  it('ignores an unknown token', async () => {
    const processTitleReport = soldReport('sold', { itemId: 'item_mr' });
    const r = await processVintedSoldEmail(soldEmail({ recipientAddresses: [buildFacebookSoldForwardingAddress('nope')] }), { processTitleReport });
    expect(r.kind).toBe('ignored');
    expect(processTitleReport).not.toHaveBeenCalled();
  });
  it('ignores tokens that resolve to more than one organizer', async () => {
    const processTitleReport = soldReport('sold', { itemId: 'item_mr' });
    const r = await processVintedSoldEmail(
      soldEmail({ recipientAddresses: [buildFacebookSoldForwardingAddress('tokA'), buildFacebookSoldForwardingAddress('tokB')] }),
      { processTitleReport, resolveOrganizerIdByToken: async (t) => (t === 'tokA' ? 'org_a' : 'org_b') },
    );
    expect(r.kind).toBe('ignored');
    expect(processTitleReport).not.toHaveBeenCalled();
  });
});

describe('processVintedSoldEmail -- match and sell', () => {
  it('passes the parsed title to the matcher, scoped to the token organizer, and reports matched', async () => {
    const processTitleReport = soldReport('sold', { itemId: 'item_mr', via: 'title' });
    const r = await processVintedSoldEmail(soldEmail(), { processTitleReport });
    expect(processTitleReport).toHaveBeenCalledWith('organizer_1', TITLE_SINGLE);
    expect(r).toEqual({ kind: 'matched', organizerId: 'organizer_1', itemId: 'item_mr', title: TITLE_SINGLE, soldVia: 'VINTED', alreadySold: false, result: 'sold' });
  });

  it('reports alreadySold when the extension wardrobe path got there first', async () => {
    const r = await processVintedSoldEmail(soldEmail(), { processTitleReport: soldReport('alreadySold', { itemId: 'item_mr' }) });
    expect(r).toEqual(expect.objectContaining({ kind: 'matched', alreadySold: true, result: 'alreadySold' }));
  });

  it('reports ambiguous without committing anything', async () => {
    const r = await processVintedSoldEmail(soldEmail(), { processTitleReport: soldReport('ambiguous', { candidateCount: 2, via: 'title' }) });
    expect(r).toEqual(expect.objectContaining({ kind: 'ambiguous', candidateCount: 2, title: TITLE_SINGLE }));
  });

  it('reports unmatched for notFound (incl. too-short titles)', async () => {
    const r = await processVintedSoldEmail(soldEmail(), { processTitleReport: soldReport('notFound', { reason: 'no_match' }) });
    expect(r).toEqual({ kind: 'unmatched', organizerId: 'organizer_1', title: TITLE_SINGLE, reason: 'no_match' });
  });

  it('reports unmatched without calling the matcher when the title cannot be parsed', async () => {
    const processTitleReport = soldReport('sold', { itemId: 'item_mr' });
    const r = await processVintedSoldEmail(soldEmail({ rawBody: '<p>Something changed in the template.</p>' }), { processTitleReport });
    expect(r).toEqual(expect.objectContaining({ kind: 'unmatched', title: null }));
    expect(processTitleReport).not.toHaveBeenCalled();
  });

  it('throws on a failed commit so the poller leaves the message unread for retry', async () => {
    await expect(
      processVintedSoldEmail(soldEmail(), { processTitleReport: soldReport('error', { itemId: 'item_mr', reason: 'commit_failed' }) }),
    ).rejects.toThrow(/commit failed/);
  });
});

describe('parseImapMessageToInboundEmail + processVintedSoldEmail on a Gmail auto-forwarded message', () => {
  function qp(s: string): string {
    // Minimal quoted-printable encoder with soft line breaks, like Vinted's real body.
    const enc = Buffer.from(s, 'utf8')
      .toString('binary')
      .split('')
      .map((ch) => {
        const c = ch.charCodeAt(0);
        if (ch === '\n') return '\n';
        if (c === 61 || c > 126 || (c < 32 && ch !== '\t' && ch !== '\r')) return '=' + c.toString(16).toUpperCase().padStart(2, '0');
        return ch;
      })
      .join('');
    return enc
      .split('\n')
      .map((line) => {
        const out: string[] = [];
        let rest = line;
        while (rest.length > 74) {
          let cut = 74;
          const eq = rest.lastIndexOf('=', cut);
          if (eq > cut - 3) cut = eq;
          out.push(rest.slice(0, cut) + '=');
          rest = rest.slice(cut);
        }
        out.push(rest);
        return out.join('\r\n');
      })
      .join('\r\n');
  }

  it('extracts the auth headers and the sold-<token> recipient and matches the item', async () => {
    const { parseImapMessageToInboundEmail } = await import('../facebookMarketplaceEmailPollService');
    const target = buildFacebookSoldForwardingAddress(KNOWN_TOKEN);
    const raw = [
      // Hop 2: Gmail filter forward from artifactmi@gmail.com into the polled Workspace inbox.
      `Delivered-To: ${target}`,
      'Received: by 2002:a05:7022:fe08 with SMTP id x; Sat, 19 Sep 2026 12:01:16 -0700 (PDT)',
      'ARC-Authentication-Results: i=2; mx.google.com;',
      '       dkim=pass header.i=@vinted.com header.s=zyqarrajf3fcvbj7g6mtbp735f72y6e3 header.b=uhsUw1RB;',
      '       arc=pass (i=1 spf=pass spfdomain=aws-bounce.vinted.com dkim=pass dkdomain=vinted.com dmarc=pass fromdomain=vinted.com);',
      '       spf=pass (google.com: domain of artifactmi+caf_=sold@gmail.com designates 209.85.220.41 as permitted sender) smtp.mailfrom="artifactmi+caf_=sold@gmail.com";',
      '       dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=vinted.com',
      'Authentication-Results: mx.google.com;',
      '       dkim=pass header.i=@vinted.com header.s=zyqarrajf3fcvbj7g6mtbp735f72y6e3 header.b=uhsUw1RB;',
      '       dkim=pass header.i=@amazonses.com header.s=shh3fegwg5fppqsuzphvschd53n6ihuv header.b=43L7hf+C;',
      '       arc=pass (i=1 spf=pass spfdomain=aws-bounce.vinted.com dkim=pass dkdomain=vinted.com dmarc=pass fromdomain=vinted.com);',
      '       spf=pass (google.com: domain of artifactmi+caf_=sold@gmail.com designates 209.85.220.41 as permitted sender) smtp.mailfrom="artifactmi+caf_=sold@gmail.com";',
      '       dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=vinted.com',
      'X-Forwarded-To: ' + target,
      'X-Forwarded-For: artifactmi@gmail.com ' + target,
      // Hop 1: original delivery to the organizer's Gmail.
      'Delivered-To: artifactmi@gmail.com',
      'ARC-Authentication-Results: i=1; mx.google.com;',
      '       dkim=pass header.i=@vinted.com header.s=zyqarrajf3fcvbj7g6mtbp735f72y6e3 header.b=uhsUw1RB;',
      '       dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=vinted.com',
      'Authentication-Results: mx.google.com;',
      '       dkim=pass header.i=@vinted.com header.s=zyqarrajf3fcvbj7g6mtbp735f72y6e3 header.b=uhsUw1RB;',
      '       dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=vinted.com',
      'DKIM-Signature: v=1; a=rsa-sha256; q=dns/txt; c=relaxed/simple; s=zyqarrajf3fcvbj7g6mtbp735f72y6e3; d=vinted.com; t=1789844474; bh=x; b=y',
      'Date: Sat, 19 Sep 2026 19:01:14 +0000',
      'MIME-Version: 1.0',
      'Message-ID: <010201a0bb0b49b0@eu-west-1.amazonses.com>',
      `Subject: ${VINTED_SOLD_EMAIL_SUBJECT}`,
      'From: Team Vinted <no-reply@vinted.com>',
      'To: artifactmi@gmail.com',
      'Reply-To: Team Vinted <no-reply@vinted.com>',
      'Content-Transfer-Encoding: quoted-printable',
      'Content-Type: text/html; charset=UTF-8',
      '',
      qp(soldHtml()),
      '',
    ].join('\r\n');

    const email = await parseImapMessageToInboundEmail(Buffer.from(raw));
    expect(email.from).toBe('no-reply@vinted.com');
    expect(email.subject).toBe(VINTED_SOLD_EMAIL_SUBJECT);
    expect(email.authenticationResults).toHaveLength(2);
    expect(email.recipientAddresses).toEqual(expect.arrayContaining([target.toLowerCase(), 'artifactmi@gmail.com']));
    expect(parseVintedSoldEmailTitle(email.rawBody)).toBe(TITLE_SINGLE);

    const processTitleReport = soldReport('sold', { itemId: 'item_mr' });
    const r = await processVintedSoldEmail(email, { processTitleReport });
    expect(processTitleReport).toHaveBeenCalledWith('organizer_1', TITLE_SINGLE);
    expect(r.kind).toBe('matched');
  });
});
