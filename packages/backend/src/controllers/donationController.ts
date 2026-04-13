import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

// POST /api/organizer/sales/:saleId/donate — create charity donation and mark items as DONATED
export const createDonation = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { saleId } = req.params;
    const { charityName, charityEin, charityAddress, notes, itemIds } = req.body;

    if (!charityName || typeof charityName !== 'string') {
      return res.status(400).json({ message: 'charityName is required' });
    }

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'itemIds array is required with at least one item' });
    }

    // Get organizer
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Verify sale exists and belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    // Fetch all items to verify they exist and belong to this sale
    const items = await prisma.item.findMany({
      where: {
        id: { in: itemIds },
        saleId: saleId,
      },
    });

    if (items.length !== itemIds.length) {
      return res.status(400).json({ message: 'Some items do not belong to this sale' });
    }

    // Verify all items are AVAILABLE (not already sold or donated)
    const unavailableItems = items.filter((item) => item.status !== 'AVAILABLE');
    if (unavailableItems.length > 0) {
      return res.status(400).json({
        message: `Cannot donate ${unavailableItems.length} items that are not AVAILABLE`,
        unavailableIds: unavailableItems.map((i) => i.id),
      });
    }

    // Calculate total estimated value
    const totalEstimatedValue = items.reduce((sum, item) => {
      const itemValue = item.price || 0;
      return sum + itemValue;
    }, 0);

    // Create SaleDonation record
    const donation = await prisma.saleDonation.create({
      data: {
        saleId,
        organizerId: organizer.id,
        charityName,
        charityEin: charityEin || null,
        charityAddress: charityAddress || null,
        notes: notes || null,
        totalEstimatedValue: new Prisma.Decimal(totalEstimatedValue),
      },
      include: {
        items: true,
      },
    });

    // Create DonatedItem records and update Item statuses
    await Promise.all(
      items.map((item) =>
        Promise.all([
          prisma.donatedItem.create({
            data: {
              donationId: donation.id,
              itemId: item.id,
              estimatedValue: new Prisma.Decimal(item.price || 0),
            },
          }),
          prisma.item.update({
            where: { id: item.id },
            data: { status: 'DONATED' },
          }),
        ])
      )
    );

    // Fetch updated donation with all items
    const updatedDonation = await prisma.saleDonation.findUnique({
      where: { id: donation.id },
      include: {
        items: {
          include: {
            item: {
              select: {
                id: true,
                title: true,
                price: true,
                description: true,
                condition: true,
              },
            },
          },
        },
        organizer: {
          select: {
            id: true,
            businessName: true,
            address: true,
            phone: true,
          },
        },
        sale: {
          select: {
            id: true,
            title: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    return res.status(201).json({
      message: 'Donation created successfully',
      donation: updatedDonation,
    });
  } catch (error) {
    console.error('Error creating donation:', error);
    res.status(500).json({ message: 'Failed to create donation' });
  }
};

// GET /api/organizer/sales/:saleId/donations — list all donations for a sale
export const getDonations = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { saleId } = req.params;

    // Get organizer
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Verify sale exists and belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    const donations = await prisma.saleDonation.findMany({
      where: { saleId },
      include: {
        items: {
          include: {
            item: {
              select: {
                id: true,
                title: true,
                price: true,
                description: true,
                condition: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ donations });
  } catch (error) {
    console.error('Error fetching donations:', error);
    res.status(500).json({ message: 'Failed to fetch donations' });
  }
};

// GET /api/organizer/donations/:donationId/receipt — generate and stream tax receipt PDF
export const generateReceipt = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { donationId } = req.params;

    // Get organizer
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Fetch donation with all related data
    const donation = await prisma.saleDonation.findUnique({
      where: { id: donationId },
      include: {
        items: {
          include: {
            item: {
              select: {
                id: true,
                title: true,
                price: true,
                condition: true,
              },
            },
          },
        },
        organizer: {
          select: {
            businessName: true,
            phone: true,
            address: true,
          },
        },
        sale: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!donation) {
      return res.status(404).json({ message: 'Donation not found' });
    }

    // Verify ownership
    if (donation.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'You do not own this donation' });
    }

    // Generate PDF using PDFKit
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="tax-receipt-${donationId}.pdf"`);
    doc.pipe(res);

    // Header with organizer info
    doc.fontSize(16).font('Helvetica-Bold').text('DONATION TAX RECEIPT', { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text('For Tax Deduction Purposes', { align: 'left' });
    doc.moveDown(1);

    // Organizer info (left column)
    doc.fontSize(10).font('Helvetica-Bold').text('Donated By:', { underline: true });
    doc.fontSize(9).font('Helvetica');
    doc.text(donation.organizer.businessName || 'Unknown');
    doc.text(donation.organizer.address || '');
    doc.text(`Phone: ${donation.organizer.phone || 'N/A'}`);

    // Charity info (right column)
    const charityX = doc.page.width / 2 + 18;
    doc.fontSize(10).font('Helvetica-Bold').text('Donated To:', charityX, doc.y - 30);
    doc.fontSize(9).font('Helvetica');
    doc.text(donation.charityName, charityX);
    if (donation.charityAddress) {
      doc.text(donation.charityAddress, charityX);
    }
    if (donation.charityEin) {
      doc.text(`Tax ID: ${donation.charityEin}`, charityX);
    }

    doc.moveDown(2);

    // Donation details
    doc.fontSize(10).font('Helvetica-Bold').text('Donation Details:', { underline: true });
    doc.fontSize(9).font('Helvetica');
    doc.text(`Sale: ${donation.sale.title}`);
    doc.text(`Date of Donation: ${new Date(donation.donationDate).toLocaleDateString()}`);
    doc.text(`Total Estimated Value: $${parseFloat(donation.totalEstimatedValue.toString()).toFixed(2)}`);

    doc.moveDown(1);

    // Itemized list
    doc.fontSize(10).font('Helvetica-Bold').text('Donated Items:', { underline: true });
    doc.moveDown(0.5);

    // Table header
    doc.fontSize(9).font('Helvetica-Bold');
    const headerY = doc.y;
    const col1X = 36;
    const col2X = 360;
    const col3X = 450;
    doc.text('Item', col1X, headerY);
    doc.text('Condition', col2X, headerY);
    doc.text('Est. Value', col3X, headerY);

    doc.moveTo(36, headerY + 14).lineTo(doc.page.width - 36, headerY + 14).stroke();
    doc.moveDown(1);

    // Item rows
    doc.fontSize(8).font('Helvetica');
    donation.items.forEach((donatedItem) => {
      const item = donatedItem.item;
      const rowY = doc.y;
      const title = item.title.length > 40 ? item.title.substring(0, 37) + '...' : item.title;
      doc.text(title, col1X, rowY, { width: col2X - col1X - 10 });
      doc.text(item.condition || 'Unknown', col2X, rowY);
      doc.text(`$${parseFloat(donatedItem.estimatedValue.toString()).toFixed(2)}`, col3X, rowY, {
        align: 'right',
      });
      doc.moveDown(0.8);
    });

    doc.moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).stroke();
    doc.moveDown(0.5);

    // Total
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text(
      `Total Estimated Value: $${parseFloat(donation.totalEstimatedValue.toString()).toFixed(2)}`,
      col3X - 150
    );

    doc.moveDown(2);

    // Disclaimer
    doc.fontSize(8).font('Helvetica').fillColor('#666666');
    doc.text(
      'IMPORTANT DISCLAIMER: This receipt is provided for your records only and is not an appraisal. Please consult a qualified tax professional to determine the deductibility of this donation. FindA.Sale and the organizer make no representations regarding the valuation or deductibility of these items.',
      { width: doc.page.width - 72 }
    );

    doc.moveDown(2);

    // Footer with date/time
    doc.fontSize(7).fillColor('#999999');
    doc.text(
      `Generated: ${new Date().toLocaleString()} | Receipt ID: ${donationId}`,
      36,
      doc.page.height - 36
    );

    // Finalize PDF
    doc.end();

    // Update receipt URL (optional — for storing in DB)
    // Note: In a real scenario, you might upload the PDF to cloud storage and save the URL
    // For now, we're just streaming it directly
  } catch (error) {
    console.error('Error generating receipt:', error);
    res.status(500).json({ message: 'Failed to generate receipt' });
  }
};
