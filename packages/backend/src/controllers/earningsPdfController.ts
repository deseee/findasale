import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

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
    });
    if (!organizer) return res.status(404).json({ message: 'Organizer not found' });

    const sales = await prisma.sale.findMany({
      where: { organizerId: organizer.id },
      include: {
        purchases: {
          where: {
            status: 'PAID',
            createdAt: { gte: startDate, lt: endDate },
          },
          include: { item: { select: { title: true } } },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    const totalRevenue = sales.reduce(
      (sum, s) => sum + s.purchases.reduce((ps, p) => ps + p.amount, 0),
      0
    );
    const totalFees = sales.reduce(
      (sum, s) => sum + s.purchases.reduce((ps, p) => ps + (p.platformFeeAmount || 0), 0),
      0
    );
    const netEarnings = totalRevenue - totalFees;

    const saleRows = sales
      .filter((s) => s.purchases.length > 0)
      .map((s) => {
        const revenue = s.purchases.reduce((sum, p) => sum + p.amount, 0);
        const fees = s.purchases.reduce((sum, p) => sum + (p.platformFeeAmount || 0), 0);
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
  <h1>Earnings Summary — ${year}</h1>
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
  <p>Platform fee: 10% flat. All amounts in USD.</p>
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
