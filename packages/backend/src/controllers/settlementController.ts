import { Response } from 'express';
import PDFDocument from 'pdfkit';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Decimal } from '@prisma/client/runtime/library';
import { canRemoveWatermark } from '../utils/watermarkPolicy';

// Helper: convert Decimal fields to number for JSON response
const toNumber = (val: Decimal | null | undefined): number | null =>
  val != null ? Number(val) : null;

// GET /api/sales/:saleId/settlement
export const getSettlement = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const userId = req.user?.id;

    // Verify organizer owns this sale
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizer: { userId } },
      select: { id: true, title: true, saleType: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found or access denied.' });

    const settlement = await prisma.saleSettlement.findUnique({
      where: { saleId },
      include: {
        expenses: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        clientPayout: true,
      },
    });

    if (!settlement) return res.status(404).json({ message: 'No settlement found for this sale.' });

    return res.json({
      id: settlement.id,
      saleId: settlement.saleId,
      saleTitle: sale.title,
      saleType: sale.saleType,
      lifecycleStage: settlement.lifecycleStage,
      settledAt: settlement.settledAt?.toISOString() ?? null,
      totalRevenue: toNumber(settlement.totalRevenue),
      platformFeeAmount: toNumber(settlement.platformFeeAmount),
      totalExpenses: toNumber(settlement.totalExpenses),
      netProceeds: toNumber(settlement.netProceeds),
      commissionRate: toNumber(settlement.commissionRate),
      buyerPremiumRate: toNumber(settlement.buyerPremiumRate),
      buyerPremiumCollected: toNumber(settlement.buyerPremiumCollected),
      notes: settlement.notes,
      settlementNotes: settlement.settlementNotes,
      internalNotes: settlement.internalNotes,
      expenses: settlement.expenses.map((e) => ({
        id: e.id,
        category: e.category,
        description: e.description,
        amount: toNumber(e.amount),
        vendorName: e.vendorName,
        receiptUrl: e.receiptUrl,
        receiptDate: e.receiptDate?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
      clientPayout: settlement.clientPayout
        ? {
            id: settlement.clientPayout.id,
            clientName: settlement.clientPayout.clientName,
            clientEmail: settlement.clientPayout.clientEmail,
            clientPhone: settlement.clientPayout.clientPhone,
            amount: toNumber(settlement.clientPayout.amount),
            status: settlement.clientPayout.status,
            method: settlement.clientPayout.method,
            stripeTransferId: settlement.clientPayout.stripeTransferId,
            bankAccountLast4: settlement.clientPayout.bankAccountLast4,
            failureReason: settlement.clientPayout.failureReason,
            processedAt: settlement.clientPayout.processedAt?.toISOString() ?? null,
            paidAt: settlement.clientPayout.paidAt?.toISOString() ?? null,
            createdAt: settlement.clientPayout.createdAt.toISOString(),
          }
        : null,
      createdAt: settlement.createdAt.toISOString(),
      updatedAt: settlement.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('getSettlement error:', error);
    return res.status(500).json({ message: 'Failed to fetch settlement.' });
  }
};

// POST /api/sales/:saleId/settlement
export const createSettlement = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const userId = req.user?.id;

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizer: { userId } },
      include: {
        organizer: { select: { defaultCommissionRate: true } },
        purchases: { select: { amount: true } },
      },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found or access denied.' });

    // Check if settlement already exists
    const existing = await prisma.saleSettlement.findUnique({ where: { saleId } });
    if (existing) return res.status(409).json({ message: 'Settlement already exists for this sale.' });

    // Calculate revenue from purchases
    const totalRevenue = sale.purchases.reduce((sum: number, p: { amount: number }) => sum + (p.amount || 0), 0);
    const defaultRate = sale.organizer?.defaultCommissionRate
      ? Number(sale.organizer.defaultCommissionRate)
      : null;

    const settlement = await prisma.saleSettlement.create({
      data: {
        saleId,
        totalRevenue: new Decimal(totalRevenue),
        commissionRate: defaultRate != null ? new Decimal(defaultRate) : null,
        lifecycleStage: 'POST_SALE',
      },
    });

    // Update sale lifecycle stage
    await prisma.sale.update({
      where: { id: saleId },
      data: { lifecycleStage: 'POST_SALE' },
    });

    return res.status(201).json({
      id: settlement.id,
      saleId: settlement.saleId,
      totalRevenue: toNumber(settlement.totalRevenue),
      commissionRate: toNumber(settlement.commissionRate),
      lifecycleStage: settlement.lifecycleStage,
      createdAt: settlement.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('createSettlement error:', error);
    return res.status(500).json({ message: 'Failed to create settlement.' });
  }
};

// PATCH /api/sales/:saleId/settlement
export const updateSettlement = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const userId = req.user?.id;
    const { notes, settlementNotes, internalNotes, commissionRate, lifecycleStage } = req.body;

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizer: { userId } },
      select: { id: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found or access denied.' });

    const settlement = await prisma.saleSettlement.findUnique({ where: { saleId } });
    if (!settlement) return res.status(404).json({ message: 'No settlement found.' });

    const updateData: Record<string, any> = {};
    if (notes !== undefined) updateData.notes = notes;
    if (settlementNotes !== undefined) updateData.settlementNotes = settlementNotes;
    if (internalNotes !== undefined) updateData.internalNotes = internalNotes;
    if (commissionRate !== undefined) updateData.commissionRate = new Decimal(commissionRate);
    if (lifecycleStage !== undefined) {
      updateData.lifecycleStage = lifecycleStage;
      // Sync lifecycle stage to Sale model
      await prisma.sale.update({
        where: { id: saleId },
        data: { lifecycleStage },
      });
    }

    // Recalculate net proceeds if commission rate changed
    if (commissionRate !== undefined) {
      const rate = Number(commissionRate) / 100;
      const revenue = Number(settlement.totalRevenue);
      const expenses = Number(settlement.totalExpenses);
      const commission = revenue * rate;
      updateData.platformFeeAmount = new Decimal(commission);
      updateData.netProceeds = new Decimal(revenue - commission - expenses);
    }

    const updated = await prisma.saleSettlement.update({
      where: { id: settlement.id },
      data: updateData,
    });

    return res.json({
      id: updated.id,
      saleId: updated.saleId,
      lifecycleStage: updated.lifecycleStage,
      commissionRate: toNumber(updated.commissionRate),
      platformFeeAmount: toNumber(updated.platformFeeAmount),
      netProceeds: toNumber(updated.netProceeds),
      notes: updated.notes,
      settlementNotes: updated.settlementNotes,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('updateSettlement error:', error);
    return res.status(500).json({ message: 'Failed to update settlement.' });
  }
};

// POST /api/sales/:saleId/settlement/expenses
export const addExpense = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const userId = req.user?.id;
    const { category, description, amount, vendorName, receiptUrl, receiptDate } = req.body;

    if (!category || !description || amount == null) {
      return res.status(400).json({ message: 'category, description, and amount are required.' });
    }

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizer: { userId } },
      select: { id: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found or access denied.' });

    const settlement = await prisma.saleSettlement.findUnique({ where: { saleId } });
    if (!settlement) return res.status(404).json({ message: 'No settlement found. Create settlement first.' });

    const expense = await prisma.saleExpense.create({
      data: {
        settlementId: settlement.id,
        category,
        description,
        amount: new Decimal(amount),
        vendorName: vendorName || null,
        receiptUrl: receiptUrl || null,
        receiptDate: receiptDate ? new Date(receiptDate) : null,
      },
    });

    // Recalculate totals
    const allExpenses = await prisma.saleExpense.findMany({
      where: { settlementId: settlement.id, deletedAt: null },
    });
    const totalExpenses = allExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const revenue = Number(settlement.totalRevenue);
    const fees = Number(settlement.platformFeeAmount);

    await prisma.saleSettlement.update({
      where: { id: settlement.id },
      data: {
        totalExpenses: new Decimal(totalExpenses),
        netProceeds: new Decimal(revenue - fees - totalExpenses),
      },
    });

    return res.status(201).json({
      id: expense.id,
      category: expense.category,
      description: expense.description,
      amount: toNumber(expense.amount),
      vendorName: expense.vendorName,
      receiptUrl: expense.receiptUrl,
      receiptDate: expense.receiptDate?.toISOString() ?? null,
      createdAt: expense.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('addExpense error:', error);
    return res.status(500).json({ message: 'Failed to add expense.' });
  }
};

// DELETE /api/sales/:saleId/settlement/expenses/:expenseId
export const removeExpense = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId, expenseId } = req.params;
    const userId = req.user?.id;

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizer: { userId } },
      select: { id: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found or access denied.' });

    const settlement = await prisma.saleSettlement.findUnique({ where: { saleId } });
    if (!settlement) return res.status(404).json({ message: 'No settlement found.' });

    // Soft delete
    await prisma.saleExpense.update({
      where: { id: expenseId },
      data: { deletedAt: new Date() },
    });

    // Recalculate totals
    const allExpenses = await prisma.saleExpense.findMany({
      where: { settlementId: settlement.id, deletedAt: null },
    });
    const totalExpenses = allExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const revenue = Number(settlement.totalRevenue);
    const fees = Number(settlement.platformFeeAmount);

    await prisma.saleSettlement.update({
      where: { id: settlement.id },
      data: {
        totalExpenses: new Decimal(totalExpenses),
        netProceeds: new Decimal(revenue - fees - totalExpenses),
      },
    });

    return res.json({ message: 'Expense removed.' });
  } catch (error) {
    console.error('removeExpense error:', error);
    return res.status(500).json({ message: 'Failed to remove expense.' });
  }
};

// POST /api/sales/:saleId/settlement/payout
export const initiateClientPayout = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const userId = req.user?.id;
    const { clientName, clientEmail, clientPhone, amount, method } = req.body;

    if (!clientName || amount == null || !method) {
      return res.status(400).json({ message: 'clientName, amount, and method are required.' });
    }

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizer: { userId } },
      select: { id: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found or access denied.' });

    const settlement = await prisma.saleSettlement.findUnique({ where: { saleId } });
    if (!settlement) return res.status(404).json({ message: 'No settlement found.' });

    // Check if payout already exists
    const existingPayout = await prisma.clientPayout.findUnique({
      where: { settlementId: settlement.id },
    });
    if (existingPayout) return res.status(409).json({ message: 'Payout already initiated.' });

    const payout = await prisma.clientPayout.create({
      data: {
        settlementId: settlement.id,
        clientName,
        clientEmail: clientEmail || null,
        clientPhone: clientPhone || null,
        amount: new Decimal(amount),
        method,
        status: method === 'MANUAL' ? 'COMPLETED' : 'PENDING',
        paidAt: method === 'MANUAL' ? new Date() : null,
      },
    });

    // Update settlement payout tracking
    await prisma.saleSettlement.update({
      where: { id: settlement.id },
      data: {
        clientPayoutRequested: new Date(),
        clientPayoutStatus: payout.status,
        clientPayoutAmount: new Decimal(amount),
        clientPayoutMethod: method,
      },
    });

    return res.status(201).json({
      id: payout.id,
      clientName: payout.clientName,
      amount: toNumber(payout.amount),
      status: payout.status,
      method: payout.method,
      paidAt: payout.paidAt?.toISOString() ?? null,
      createdAt: payout.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('initiateClientPayout error:', error);
    return res.status(500).json({ message: 'Failed to initiate payout.' });
  }
};

// GET /api/sales/:saleId/settlement/receipt
export const getSettlementReceipt = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const userId = req.user?.id;

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizer: { userId } },
      select: { id: true, title: true, saleType: true, startDate: true, endDate: true, address: true, organizerId: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found or access denied.' });

    // Fetch organizer for watermark policy
    const organizer = await prisma.organizer.findUnique({
      where: { id: sale.organizerId },
      select: { subscriptionTier: true, removeWatermarkEnabled: true },
    });

    const settlement = await prisma.saleSettlement.findUnique({
      where: { saleId },
      include: {
        expenses: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        clientPayout: true,
      },
    });
    if (!settlement) return res.status(404).json({ message: 'No settlement found.' });

    // Generate PDF
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="settlement-receipt-${saleId}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Settlement Receipt', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(sale.title, { align: 'center' });
    doc.moveDown();

    // Sale info
    doc.fontSize(11).font('Helvetica-Bold').text('Sale Information');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Sale Type: ${sale.saleType?.replace('_', ' ') || 'N/A'}`);
    doc.text(`Start Date: ${sale.startDate.toLocaleDateString()}`);
    doc.text(`End Date: ${sale.endDate.toLocaleDateString()}`);
    if (sale.address) {
      doc.text(`Address: ${sale.address}`);
    }
    doc.moveDown();

    // Financial summary table
    doc.fontSize(11).font('Helvetica-Bold').text('Financial Summary');
    doc.fontSize(10).font('Helvetica');
    const colX1 = 50;
    const colX2 = 450;
    doc.text('Total Revenue', colX1, doc.y, { width: 200 });
    doc.text(`$${toNumber(settlement.totalRevenue)?.toFixed(2) ?? '0.00'}`, colX2, doc.y - 10, { align: 'right' });
    doc.moveDown(0.5);

    const commRate = toNumber(settlement.commissionRate) ?? 0;
    doc.text(`Organizer Commission (${Math.round(commRate)}%)`, colX1, doc.y, { width: 200 });
    doc.text(`-$${toNumber(settlement.platformFeeAmount)?.toFixed(2) ?? '0.00'}`, colX2, doc.y - 10, { align: 'right' });
    doc.moveDown(0.5);

    doc.text('Expenses', colX1, doc.y, { width: 200 });
    doc.text(`-$${toNumber(settlement.totalExpenses)?.toFixed(2) ?? '0.00'}`, colX2, doc.y - 10, { align: 'right' });
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').text('Net Proceeds', colX1, doc.y, { width: 200 });
    doc.text(`$${toNumber(settlement.netProceeds)?.toFixed(2) ?? '0.00'}`, colX2, doc.y - 10, { align: 'right' });
    doc.moveDown();

    // Expenses list
    if (settlement.expenses && settlement.expenses.length > 0) {
      doc.fontSize(11).font('Helvetica-Bold').text('Expenses');
      doc.fontSize(9).font('Helvetica');
      settlement.expenses.forEach((expense) => {
        doc.text(`• ${expense.description} - $${toNumber(expense.amount)?.toFixed(2) ?? '0.00'}`);
        if (expense.vendorName) {
          doc.text(`  Vendor: ${expense.vendorName}`, { indent: 20 });
        }
      });
      doc.moveDown();
    }

    // Client payout
    if (settlement.clientPayout) {
      doc.fontSize(11).font('Helvetica-Bold').text('Client Payout');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Name: ${settlement.clientPayout.clientName}`);
      doc.text(`Amount: $${toNumber(settlement.clientPayout.amount)?.toFixed(2) ?? '0.00'}`);
      doc.text(`Method: ${settlement.clientPayout.method}`);
      doc.text(`Status: ${settlement.clientPayout.status}`);
      if (settlement.clientPayout.paidAt) {
        doc.text(`Paid: ${new Date(settlement.clientPayout.paidAt).toLocaleDateString()}`);
      }
      doc.moveDown();
    }

    // Footer
    if (!canRemoveWatermark(organizer)) {
      doc.fontSize(9).font('Helvetica').text(
        `Generated by FindA.Sale on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
        { align: 'center' }
      );
    }

    doc.end();
  } catch (error) {
    console.error('getSettlementReceipt error:', error);
    return res.status(500).json({ message: 'Failed to generate receipt.' });
  }
};
