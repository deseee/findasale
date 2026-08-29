import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  getPlatformFeeRate,
  isAuctionListing,
  resolveOrganizerFeeReport,
  SubscriptionTier,
} from '../utils/feeCalculator';
import { canRemoveWatermark } from '../utils/watermarkPolicy';

// GET /api/earnings/pdf?year=2025
export const getEarningsPdf = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer only' });
    }

    const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
    const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
    const endDate = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { id: true, subscriptionTier: true, businessName: true },
    });
    if (!organizer) return res.status(404).json({ message: 'Organizer not found' });

    const tierRate = getPlatformFeeRate(organizer.subscriptionTier as SubscriptionTier);

    const sales = await prisma.sale.findMany({
      where: { organizerId: organizer.id },
      include: {
        // isTestTransaction exclusion (2026-08-29): test-transaction rows must never count as a real sale here
        purchases: {
          where: {
            status: 'PAID',
            isTestTransaction: false,
            createdAt: { gte: startDate, lt: endDate },
          },
          // listingType + auctionStartPrice let the reporting helper below recognise an
          // auction and strip the buyer's 5% premium out of Purchase.amount.
          include: { item: { select: { title: true, listingType: true, auctionStartPrice: true } } },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    /**
     * TWO SEPARATE FEES (Patrick ruling, 2026-08-17 — see utils/feeCalculator.ts header).
     * The organizer's commission (10% SIMPLE / 8% PRO+TEAMS) applies to EVERY sale, auctions
     * included. What does NOT belong on their statement is the auction buyer's 5% premium —
     * that came out of the WINNER's pocket — so both the revenue and the fee for an auction are
     * computed on the hammer price, with the premium stripped back out of Purchase.amount.
     *
     * REVERSAL NOTICE: an earlier pass the same day reported the stored
     * Purchase.platformFeeAmount for auctions and treated the premium as the entire platform
     * take with no organizer commission. That was wrong; this is the corrected model.
     *
     * Shape note: the non-auction subtotal is multiplied by the rate and rounded ONCE, exactly
     * as this file did originally, rather than rounding per purchase and summing. With zero
     * auction purchases in the set this returns a byte-identical number to the pre-2026-08-17
     * behaviour, for both revenue and fees.
     */
    type ReportablePurchaseRow = {
      amount: number;
      item: { listingType: string | null; auctionStartPrice: number | null } | null;
      // Fee snapshot (2026-08-17) — present on rows charged after the snapshot shipped, and
      // preferred by resolveOrganizerFeeReport over recomputing from today's tier rate.
      buyerPremiumAmount?: number | null;
      commissionAmount?: number | null;
      organizerAbsorbedPremium?: boolean | null;
    };

    const revenueAndFees = (
      purchases: ReportablePurchaseRow[],
      coversFee: boolean
    ): { revenue: number; fees: number } => {
      let nonAuctionRevenue = 0;
      let auctionRevenue = 0;
      let auctionFees = 0;
      // ROUTING (2026-08-17): a purchase goes through resolveOrganizerFeeReport when it is an
      // auction lot (the premium has to come back out of `amount`) OR when it carries a fee
      // SNAPSHOT (what the platform actually took, which beats any recomputation). Everything
      // else — every pre-snapshot regular sale — stays on the batched multiply below, which is
      // multiplied and rounded ONCE for the whole set. That is deliberate: rounding per purchase
      // instead would shift historical totals by cents, so existing rows keep byte-identical
      // numbers and only newly-snapshotted rows change how they are computed.
      for (const p of purchases) {
        const hasFeeSnapshot = p.commissionAmount !== null && p.commissionAmount !== undefined;
        if (isAuctionListing(p.item) || hasFeeSnapshot) {
          const report = resolveOrganizerFeeReport({ ...p, sale: { coversFee } }, tierRate);
          auctionRevenue += report.grossSalePrice;
          auctionFees += report.platformFee;
        } else {
          nonAuctionRevenue += p.amount;
        }
      }
      return {
        revenue: parseFloat((nonAuctionRevenue + auctionRevenue).toFixed(2)),
        fees: parseFloat((nonAuctionRevenue * tierRate + auctionFees).toFixed(2)),
      };
    };

    const perSale = sales.map((s) => ({
      sale: s,
      ...revenueAndFees(s.purchases as any, (s as any).coversFee === true),
    }));

    const totalRevenue = parseFloat(perSale.reduce((sum, r) => sum + r.revenue, 0).toFixed(2));
    const totalFees = parseFloat(perSale.reduce((sum, r) => sum + r.fees, 0).toFixed(2));
    const netEarnings = parseFloat((totalRevenue - totalFees).toFixed(2));

    const saleRows = perSale
      .filter((r) => r.sale.purchases.length > 0)
      .map(({ sale: s, revenue, fees }) => {
        return `
<tr style="border-bottom:1px solid #e5e7eb;">
  <td style="padding:10px 12px;color:#111827;">${s.title}</td>
  <td style="padding:10px 12px;color:#6b7280;">${new Date(s.startDate).toLocaleDateString()}</td>
  <td style="padding:10px 12px;text-align:right;color:#111827;">${s.purchases.length}</td>
  <td style="padding:10px 12px;text-align:right;color:#111827;">$${revenue.toFixed(2)}</td>
  <td style="padding:10px 12px;text-align:right;color:#dc2626;">($${fees.toFixed(2)})</td>
  <td style="padding:10px 12px;text-align:right;font-weight:600;color:#059669;">$${(revenue - fees).toFixed(2)}</td>
</tr>`;
      })
      .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>FindA.Sale Earnings Summary ${year}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 32px; color: #111827; }
  .header { border-bottom: 2px solid #d97706; padding-bottom: 16px; margin-bottom: 24px; }
  .logo { font-size: 24px; font-weight: 700; color: #d97706; }
  h1 { font-size: 20px; margin: 8px 0 4px; }
  .meta { color: #6b7280; font-size: 13px; }
  .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 24px 0; }
  .summary-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: center; }
  .summary-card .label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .summary-card .value { font-size: 24px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #f9fafb; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
  th:last-child, td:last-child { text-align: right; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
<div class="header">
  <div class="logo">FindA.Sale</div>
  <h1>Earnings Summary (${year})</h1>
  <div class="meta">Organizer: ${organizer.businessName} &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString()}</div>
</div>

<div class="summary-grid">
  <div class="summary-card">
    <div class="label">Gross Revenue</div>
    <div class="value" style="color:#111827;">$${totalRevenue.toFixed(2)}</div>
  </div>
  <div class="summary-card">
    <div class="label">Platform Fees</div>
    <div class="value" style="color:#dc2626;">($${totalFees.toFixed(2)})</div>
  </div>
  <div class="summary-card">
    <div class="label">Net Earnings</div>
    <div class="value" style="color:#059669;">$${netEarnings.toFixed(2)}</div>
  </div>
</div>

<h2 style="font-size:16px;margin-bottom:8px;">Sale Breakdown</h2>
<table>
  <thead>
    <tr>
      <th>Sale</th>
      <th>Date</th>
      <th style="text-align:right;">Sales</th>
      <th style="text-align:right;">Revenue</th>
      <th style="text-align:right;">Fees</th>
      <th style="text-align:right;">Net</th>
    </tr>
  </thead>
  <tbody>
    ${saleRows || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#9ca3af;">No sales with transactions in ${year}</td></tr>'}
  </tbody>
</table>

<div class="footer">
  <p>This report is provided for informational purposes only. Consult a tax professional for advice on reporting requirements.</p>
  <p>Platform fee: ${Math.round(tierRate * 100)}% on every sale, auctions included. On an auction the winning bidder separately pays a buyer's premium on top of their bid — that comes out of their pocket, not yours, so it is not included in the amounts above. All amounts in USD.</p>
  ${!canRemoveWatermark(organizer) ? `<p style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af;">Generated by FindA.Sale · ${organizer.businessName} · ${new Date().toLocaleDateString()}</p>` : ''}
</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="findasale-earnings-${year}.html"`);
    return res.send(html);
  } catch (err) {
    console.error('getEarningsPdf error:', err);
    return res.status(500).json({ message: 'Failed to generate earnings report' });
  }
};
