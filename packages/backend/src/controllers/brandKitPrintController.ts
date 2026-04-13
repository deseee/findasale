/**
 * Brand Kit Print Controller
 *
 * Generates print-ready PDFs personalized with organizer brand colors and logo:
 * - Business cards (10 per page, 3.5" × 2")
 * - Letterhead template (blank page with header/footer)
 * - Social media headers (Facebook, Instagram, Twitter templates)
 * - Branded yard sign (organizer colors + logo)
 *
 * All endpoints require PRO tier subscription.
 */

import { Response } from 'express';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

/**
 * Helper: Fetch image buffer from URL (Cloudinary or similar)
 */
const fetchImageBuffer = async (url: string): Promise<Buffer | null> => {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`Failed to fetch image from ${url}:`, error);
    return null;
  }
};

/**
 * Helper: Check tier and fetch organizer
 */
const getOrganizerOrFail = async (req: AuthRequest, res: Response) => {
  const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
  if (!req.user || !hasOrganizerRole) {
    res.status(403).json({ message: 'Organizer access required.' });
    return null;
  }

  const organizer = await prisma.organizer.findUnique({
    where: { userId: req.user.id },
    include: {
      user: {
        select: { email: true },
      },
    },
  });

  if (!organizer) {
    res.status(404).json({ message: 'Organizer profile not found' });
    return null;
  }

  if (organizer.subscriptionTier !== 'PRO' && organizer.subscriptionTier !== 'TEAMS') {
    res.status(403).json({ message: 'PRO tier required for brand kit print assets' });
    return null;
  }

  return organizer;
};

/**
 * GET /api/brand-kit/organizer/business-card
 * Generates 10 business cards per letter page (2×5 grid, 3.5"×2" each)
 */
export const generateBusinessCards = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await getOrganizerOrFail(req, res);
    if (!organizer) return;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="business-cards-${organizer.id}.pdf"`);
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const marginLeft = 36;
    const marginTop = 36;
    const cardWidth = 252; // 3.5" in points (3.5 * 72)
    const cardHeight = 144; // 2" in points (2 * 72)
    const gapX = 18;
    const gapY = 18;

    // Fetch logo if present
    let logoBuffer: Buffer | null = null;
    if (organizer.brandLogoUrl) {
      logoBuffer = await fetchImageBuffer(organizer.brandLogoUrl);
    }

    const primaryColor = organizer.brandPrimaryColor || '#2563EB';
    const email = organizer.user?.email || '';

    // 10 cards per page in 2×5 grid
    for (let i = 0; i < 10; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);

      const x = marginLeft + col * (cardWidth + gapX);
      const y = marginTop + row * (cardHeight + gapY);

      // Card background
      doc.rect(x, y, cardWidth, cardHeight).fill('#ffffff').stroke('#cccccc');

      // Primary color accent bar on left side
      doc.rect(x, y, 8, cardHeight).fill(primaryColor);

      const contentX = x + 12;
      const contentY = y + 10;

      // Logo (if present)
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, contentX, contentY, { width: 24, height: 24 });
        } catch (e) {
          console.error('Failed to embed logo:', e);
        }
      }

      // Business name (large, bold)
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#000000')
        .text(organizer.businessName, contentX + 32, contentY, { width: 190 });

      // Tagline
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#666666')
        .text('Estate Sale Specialist', contentX + 32, doc.y, { width: 190 });

      // Divider
      doc
        .moveTo(contentX, doc.y + 4)
        .lineTo(x + cardWidth - 10, doc.y + 4)
        .stroke('#e0e0e0');

      // Contact info
      const infoY = doc.y + 6;
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#333333')
        .text(`${organizer.phone}`, contentX, infoY, { width: 190 })
        .text(`${email}`, { width: 190 });

      if (organizer.website) {
        doc.text(`${organizer.website}`, { width: 190 });
      }
    }

    doc.end();
  } catch (error) {
    console.error('Error generating business cards:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate business cards PDF' });
    }
  }
};

/**
 * GET /api/brand-kit/organizer/letterhead
 * Generates blank letterhead template with header/footer
 */
export const generateLetterhead = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await getOrganizerOrFail(req, res);
    if (!organizer) return;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="letterhead-${organizer.id}.pdf"`);
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const margin = 72;
    const contentWidth = pageWidth - margin * 2;

    // Fetch logo if present
    let logoBuffer: Buffer | null = null;
    if (organizer.brandLogoUrl) {
      logoBuffer = await fetchImageBuffer(organizer.brandLogoUrl);
    }

    const primaryColor = organizer.brandPrimaryColor || '#2563EB';

    // ── Header ──────────────────────────────────────────
    // Logo + Business name on left
    let logoX = margin;
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, logoX, margin, { width: 36, height: 36 });
        logoX += 44;
      } catch (e) {
        console.error('Failed to embed logo:', e);
      }
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#000000')
      .text(organizer.businessName, logoX, margin + 6, { width: contentWidth - (logoX - margin) });

    // Contact info on right
    const rightX = pageWidth - margin;
    const contactInfo = [organizer.phone, organizer.user?.email || '', organizer.website || '']
      .filter(Boolean)
      .join('\n');

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#666666')
      .text(contactInfo, margin, margin + 44, { width: contentWidth, align: 'right' });

    // Horizontal divider
    const dividerY = margin + 60;
    doc
      .strokeColor(primaryColor)
      .lineWidth(2)
      .moveTo(margin, dividerY)
      .lineTo(pageWidth - margin, dividerY)
      .stroke();

    // ── Body (intentionally blank for printing + writing) ──

    // ── Footer ──────────────────────────────────────────
    const footerY = doc.page.height - 60;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#999999')
      .text(`${organizer.website || 'FindA.Sale'} • Powered by FindA.Sale`, margin, footerY, {
        width: contentWidth,
        align: 'center',
      });

    doc.end();
  } catch (error) {
    console.error('Error generating letterhead:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate letterhead PDF' });
    }
  }
};

/**
 * GET /api/brand-kit/organizer/social-headers
 * Generates 3 social media header templates (Facebook, Instagram, Twitter)
 */
export const generateSocialHeaders = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await getOrganizerOrFail(req, res);
    if (!organizer) return;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="social-headers-${organizer.id}.pdf"`);
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const margin = 36;
    const contentWidth = pageWidth - margin * 2;

    // Fetch logo if present
    let logoBuffer: Buffer | null = null;
    if (organizer.brandLogoUrl) {
      logoBuffer = await fetchImageBuffer(organizer.brandLogoUrl);
    }

    const primaryColor = organizer.brandPrimaryColor || '#2563EB';

    // ── Facebook Cover (820×312px scaled to fit) ──
    let y = margin;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#000000')
      .text('Facebook Cover (820×312px)', margin, y);

    y = doc.y + 8;

    // Facebook template box
    const fbWidth = contentWidth;
    const fbHeight = 100;
    doc.rect(margin, y, fbWidth, fbHeight).fill(primaryColor);

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, margin + 16, y + 16, { width: 48, height: 48 });
      } catch (e) {
        console.error('Failed to embed logo:', e);
      }
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#ffffff')
      .text(organizer.businessName, margin + 72, y + 24, { width: fbWidth - 100 });

    // Instructions
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#666666')
      .text('Save as facebook-header.png • Crop to 820×312 pixels', margin, doc.y + 12);

    // ── Instagram Profile (320×320px scaled) ──
    y = doc.y + 16;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#000000')
      .text('Instagram Profile (320×320px)', margin, y);

    y = doc.y + 8;

    const igSize = 100;
    doc.rect(margin, y, igSize, igSize).fill(primaryColor);

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, margin + 26, y + 26, { width: 48, height: 48 });
      } catch (e) {
        console.error('Failed to embed logo:', e);
      }
    }

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#666666')
      .text('Save as instagram-profile.png • Crop to 320×320 pixels', margin, y + igSize + 8);

    // ── Twitter/X Header (1500×500px scaled) ──
    y = doc.y + 12;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#000000')
      .text('Twitter/X Header (1500×500px)', margin, y);

    y = doc.y + 8;

    const twitterWidth = contentWidth;
    const twitterHeight = 80;
    doc.rect(margin, y, twitterWidth, twitterHeight).fill(primaryColor);

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#ffffff')
      .text(organizer.businessName, margin + 16, y + 12, { width: twitterWidth - 32 })
      .font('Helvetica')
      .fontSize(10)
      .text('Estate Sale Specialist', { width: twitterWidth - 32 });

    // Instructions
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#666666')
      .text('Save as twitter-header.png • Crop to 1500×500 pixels', margin, y + twitterHeight + 8);

    doc.end();
  } catch (error) {
    console.error('Error generating social headers:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate social headers PDF' });
    }
  }
};

/**
 * GET /api/brand-kit/organizer/yard-sign
 * Generates branded yard sign template with organizer colors + logo
 */
export const generateBrandedYardSign = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await getOrganizerOrFail(req, res);
    if (!organizer) return;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="yard-sign-${organizer.id}.pdf"`);
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 40;

    // Fetch logo if present
    let logoBuffer: Buffer | null = null;
    if (organizer.brandLogoUrl) {
      logoBuffer = await fetchImageBuffer(organizer.brandLogoUrl);
    }

    const primaryColor = organizer.brandPrimaryColor || '#2563EB';
    const secondaryColor = organizer.brandSecondaryColor || '#1E40AF';

    // Has brand colors set?
    const hasBrandColors = organizer.brandPrimaryColor && organizer.brandSecondaryColor;

    // ── Top banner ──────────────────────────────────────
    const topHeight = 140;
    doc.rect(0, 0, pageWidth, topHeight).fill(primaryColor);

    // Logo in top-left
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, margin, margin, { width: 60, height: 60 });
      } catch (e) {
        console.error('Failed to embed logo:', e);
      }
    }

    // Business name centered
    doc
      .font('Helvetica-Bold')
      .fontSize(32)
      .fillColor('#ffffff')
      .text(organizer.businessName, margin, margin + 20, {
        width: pageWidth - margin * 2,
        align: 'center',
      });

    doc
      .font('Helvetica')
      .fontSize(14)
      .fillColor('#ffffff')
      .text('Estate Sale', {
        width: pageWidth - margin * 2,
        align: 'center',
      });

    // ── Middle content area ──────────────────────────────
    const middleY = topHeight + margin;
    const middleHeight = pageHeight - topHeight - margin * 2 - 100;

    // Contact info centered
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#000000')
      .text(organizer.phone, margin, middleY + 20, {
        width: pageWidth - margin * 2,
        align: 'center',
      });

    if (organizer.website) {
      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor('#333333')
        .text(organizer.website, {
          width: pageWidth - margin * 2,
          align: 'center',
        });
    }

    // Brand colors note
    if (!hasBrandColors) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#666666')
        .text('Set your brand colors in Brand Kit to personalize', margin, doc.y + 20, {
          width: pageWidth - margin * 2,
          align: 'center',
        });
    }

    // ── Footer accent bar ──────────────────────────────────
    const footerHeight = 100;
    doc.rect(0, pageHeight - footerHeight, pageWidth, footerHeight).fill(secondaryColor);

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#ffffff')
      .text('Powered by FindA.Sale', margin, pageHeight - footerHeight + 30, {
        width: pageWidth - margin * 2,
        align: 'center',
      });

    doc.end();
  } catch (error) {
    console.error('Error generating branded yard sign:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate branded yard sign PDF' });
    }
  }
};
