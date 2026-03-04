import { Request, Response } from 'express';
import QRCode from 'qrcode';
// pdfkit is loaded lazily inside the handler so the server doesn't crash
// before the Docker image is rebuilt with the new dependency.
import { prisma } from '../lib/prisma';

interface AuthRequest extends Request {
  user?: any;
}

const formatDate = (dateStr: string | Date): string => {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
};

export const generateMarketingKit = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'ORGANIZER' && req.user.role !== 'ADMIN')) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        organizer: {
          select: { id: true, userId: true, businessName: true },
        },
      },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (req.user.role !== 'ADMIN') {
      const organizerProfile = await prisma.organizer.findUnique({
        where: { userId: req.user.id },
      });
      if (!organizerProfile || sale.organizerId !== organizerProfile.id) {
        return res
          .status(403)
          .json({ message: 'Access denied. You can only generate marketing kits for your own sales.' });
      }
    }

    // Build QR URL with UTM params per spec
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const saleUrl = `${frontendUrl}/sales/${id}?utm_source=qr_sign&utm_medium=print&utm_campaign=${id}`;

    // Generate QR code as PNG buffer
    const qrBuffer = await QRCode.toBuffer(saleUrl, {
      type: 'png',
      width: 300,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    // pdfkit is a lazy dynamic import — only loaded on first request
    // (avoids crashing the server before the Docker image rebuild)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    // Create PDF
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="marketing-kit-${id}.pdf"`);
    doc.pipe(res);

    const pageWidth = doc.page.width;   // 612 pts
    const pageHeight = doc.page.height; // 792 pts
    const margin = 60;
    const contentWidth = pageWidth - margin * 2;

    // ── Header bar ────────────────────────────────────────────────────────────
    doc.rect(0, 0, pageWidth, 90).fill('#1d4ed8');
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(30)
      .text('FindA.Sale', margin, 22, { lineBreak: false });
    doc
      .fillColor('#bfdbfe')
      .font('Helvetica')
      .fontSize(12)
      .text('Estate Sale Marketing Kit', margin, 60, { lineBreak: false });

    // ── Sale title ───────────────────────────────────────────────────────────────
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(24)
      .text(sale.title, margin, 118, { width: contentWidth, align: 'center' });

    const afterTitle = doc.y + 10;

    // ── Divider ──────────────────────────────────────────────────────────────────
    doc
      .strokeColor('#d1d5db')
      .lineWidth(1)
      .moveTo(margin, afterTitle)
      .lineTo(pageWidth - margin, afterTitle)
      .stroke();

    // ── Location ────────────────────────────────────────────────────────────────
    const locY = afterTitle + 24;
    doc
      .fillColor('#374151')
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('LOCATION', margin, locY, { width: contentWidth, align: 'center' });
    doc
      .fillColor('#4b5563')
      .font('Helvetica')
      .fontSize(15)
      .text(sale.address, margin, doc.y + 6, { width: contentWidth, align: 'center' })
      .text(`${sale.city}, ${sale.state} ${sale.zip}`, { width: contentWidth, align: 'center' });

    // ── Dates ────────────────────────────────────────────────────────────────────
    const datesY = doc.y + 22;
    doc
      .fillColor('#374151')
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('DATES & TIMES', margin, datesY, { width: contentWidth, align: 'center' });
    doc
      .fillColor('#4b5563')
      .font('Helvetica')
      .fontSize(14)
      .text(`Start: ${formatDate(sale.startDate)}`, margin, doc.y + 6, { width: contentWidth, align: 'center' })
      .text(`End:    ${formatDate(sale.endDate)}`, { width: contentWidth, align: 'center' });

    // ── QR section ────────────────────────────────────────────────────────────────
    const qrLabelY = doc.y + 26;
    doc
      .fillColor('#374151')
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('SCAN TO VIEW ONLINE', margin, qrLabelY, { width: contentWidth, align: 'center' });

    const qrSize = 180;
    const qrX = (pageWidth - qrSize) / 2;
    const qrImageY = doc.y + 12;
    doc.image(qrBuffer, qrX, qrImageY, { width: qrSize, height: qrSize });

    // Advance cursor past the image
    doc.text('', margin, qrImageY + qrSize + 10);

    // URL under QR
    doc
      .fillColor('#1d4ed8')
      .font('Helvetica')
      .fontSize(9)
      .text(saleUrl, margin, doc.y + 4, { width: contentWidth, align: 'center' });

    // ── Organizer line ───────────────────────────────────────────────────────────────
    const orgY = doc.y + 20;
    doc
      .fillColor('#6b7280')
      .font('Helvetica')
      .fontSize(11)
      .text(`Organized by ${sale.organizer.businessName}`, margin, orgY, {
        width: contentWidth,
        align: 'center',
      });

    // ── Footer bar ───────────────────────────────────────────────────────────────
    doc.rect(0, pageHeight - 50, pageWidth, 50).fill('#f3f4f6');
    doc
      .fillColor('#9ca3af')
      .font('Helvetica')
      .fontSize(9)
      .text('Generated by FindA.Sale  ·  finda.sale', margin, pageHeight - 32, {
        width: contentWidth,
        align: 'center',
      });

    doc.end();
  } catch (error) {
    console.error('Error generating marketing kit:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error while generating marketing kit' });
    }
  }
};
