/**
 * Monthly Trend Report Email Template — #442
 *
 * Generates the subject line and HTML body for the monthly organizer
 * search engine visibility report.
 *
 * Tone: Professional, encouraging. No "AI" language (D-006 — use
 * "Search Engine Visibility" / "Discovery Views"). Inclusive sale-type
 * language (not "estate sales" only). Sender: The FindA.Sale Team.
 */

import type { OrganizerTrendData } from '../jobs/monthlyTrendReportJob';

const BRAND_COLOR = '#1a6b4a';
const ACCENT_COLOR = '#f0fdf4';

function formatChange(current: number, prior: number): string {
  if (prior === 0 && current === 0) return '';
  if (prior === 0) return ` (new this month)`;
  const delta = current - prior;
  if (delta === 0) return ' (same as last month)';
  const pct = Math.round(Math.abs(delta / prior) * 100);
  return delta > 0 ? ` (+${pct}% vs. last month)` : ` (−${pct}% vs. last month)`;
}

function formatCrawlerBreakdown(breakdown: Record<string, number>): string {
  const entries = Object.entries(breakdown)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => `${name}: ${count}`)
    .join(', ');
  return entries || 'None recorded yet';
}

function crawlerSummaryLine(count: number, prior: number): string {
  if (count === 0) {
    return 'No search engine visits were recorded for your listings this month. This often means your listings are still being indexed — visibility typically builds over the first 60–90 days.';
  }
  const changeStr = formatChange(count, prior);
  return `Your listings received <strong>${count} search engine visit${count !== 1 ? 's' : ''}</strong> this month${changeStr}.`;
}

function cityCoverageSection(saleCities: string[], frontendUrl: string): string {
  if (saleCities.length === 0) return '';
  const links = saleCities
    .map(slug => `<a href="${frontendUrl}/city/${slug}" style="color:${BRAND_COLOR};">${slug}</a>`)
    .join(', ');
  return `
    <tr>
      <td style="padding:16px 0; border-bottom:1px solid #e5e7eb;">
        <strong style="color:#111827;">City Page Coverage</strong><br>
        <span style="color:#6b7280; font-size:14px;">Your sales appear in ${saleCities.length} city ${saleCities.length === 1 ? 'directory' : 'directories'} on FindA.Sale, helping local shoppers find you by location.</span><br>
        <span style="font-size:13px; color:#374151; margin-top:6px; display:block;">${links}</span>
      </td>
    </tr>`;
}

export function buildMonthlyTrendReportEmail(
  data: OrganizerTrendData,
  frontendUrl: string
): { subject: string; html: string } {
  const {
    organizerName,
    crawlerVisitCount,
    crawlerBreakdown,
    priorMonthCrawlerVisitCount,
    indexedSaleCount,
    priorMonthIndexedSaleCount,
    saleCities,
    periodLabel,
  } = data;

  const subject = `Your ${periodLabel} Search Visibility Report — FindA.Sale`;

  const indexedChange = formatChange(indexedSaleCount, priorMonthIndexedSaleCount);
  const crawlerSummary = crawlerSummaryLine(crawlerVisitCount, priorMonthCrawlerVisitCount);
  const breakdownText = formatCrawlerBreakdown(crawlerBreakdown);
  const citySection = cityCoverageSection(saleCities, frontendUrl);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0; padding:0; background-color:#f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#111827;">

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f9fafb;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Card -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px; background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND_COLOR}; padding:28px 32px;">
              <p style="margin:0; color:#ffffff; font-size:13px; font-weight:500; text-transform:uppercase; letter-spacing:0.05em;">Monthly Visibility Report</p>
              <h1 style="margin:8px 0 0; color:#ffffff; font-size:24px; font-weight:700; line-height:1.3;">${periodLabel}</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">

              <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#374151;">
                Hi ${organizerName},
              </p>
              <p style="margin:0 0 28px; font-size:15px; line-height:1.6; color:#374151;">
                Here's a look at how your sales performed in search engine discovery over the past month.
              </p>

              <!-- Metrics table -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">

                <!-- Crawler visits -->
                <tr>
                  <td style="padding:16px 0; border-bottom:1px solid #e5e7eb;">
                    <strong style="color:#111827;">Search Engine Views</strong><br>
                    <span style="color:#6b7280; font-size:14px;">How many times search engines and web crawlers visited your active listings.</span><br>
                    <span style="font-size:15px; color:#374151; margin-top:8px; display:block;">${crawlerSummary}</span>
                    ${crawlerVisitCount > 0 ? `<span style="font-size:13px; color:#6b7280; margin-top:4px; display:block;">Breakdown: ${breakdownText}</span>` : ''}
                  </td>
                </tr>

                <!-- Indexed sales -->
                <tr>
                  <td style="padding:16px 0; border-bottom:1px solid #e5e7eb;">
                    <strong style="color:#111827;">Listings Indexed</strong><br>
                    <span style="color:#6b7280; font-size:14px;">Active sales eligible to appear in search results.</span><br>
                    <span style="font-size:15px; color:#374151; margin-top:8px; display:block;">
                      <strong>${indexedSaleCount} sale${indexedSaleCount !== 1 ? 's' : ''}</strong>${indexedChange ? `<span style="color:#6b7280; font-size:13px;"> ${indexedChange}</span>` : ''}
                    </span>
                  </td>
                </tr>

                ${citySection}

              </table>

              <!-- Tip block -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top:28px;">
                <tr>
                  <td style="background-color:${ACCENT_COLOR}; border-left:4px solid ${BRAND_COLOR}; border-radius:4px; padding:16px 20px;">
                    <p style="margin:0; font-size:14px; line-height:1.6; color:#374151;">
                      <strong style="color:${BRAND_COLOR};">Grow your visibility:</strong>
                      The more listings you add — including photos, descriptions, and prices — the more content search engines can index. Sales with complete details consistently rank higher in local search results.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top:28px;">
                <tr>
                  <td align="center">
                    <a href="${frontendUrl}/organizer/dashboard"
                       style="display:inline-block; background-color:${BRAND_COLOR}; color:#ffffff; font-size:15px; font-weight:600; text-decoration:none; padding:14px 28px; border-radius:6px;">
                      View Your Dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:32px 0 0; font-size:14px; line-height:1.6; color:#6b7280;">
                You're receiving this monthly report because you have an active organizer account on FindA.Sale.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb; border-top:1px solid #e5e7eb; padding:20px 32px;">
              <p style="margin:0; font-size:13px; color:#9ca3af; line-height:1.6;">
                The FindA.Sale Team &mdash; <a href="${frontendUrl}" style="color:#9ca3af;">finda.sale</a><br>
                219 E Michigan Ave, Suite F, Paw Paw, MI 49079
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

  return { subject, html };
}
