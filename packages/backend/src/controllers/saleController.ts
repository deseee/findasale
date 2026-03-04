import { Request, Response } from 'express';
import { prisma } from '../index';
import ical from 'ical-generator';

// H1: QR code tracking
const generateQRCode = (saleId: string): string => {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
    `${process.env.FRONTEND_URL || 'http://localhost:3000'}/sales/${saleId}`
  )}`;
};

export const createSale = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, startDate, endDate, address, city, state, zip, organizerId } =
      req.body;

    const sale = await prisma.sale.create({
      data: {
        title,
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        address,
        city,
        state,
        zip,
        organizerId,
        status: 'DRAFT',
      },
    });

    res.status(201).json(sale);
  } catch (error) {
    console.error('Create sale error:', error);
    res.status(500).json({ error: 'Failed to create sale' });
  }
};

export const getSaleById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        items: true,
        organizer: {
          include: {
            badges: true,
          },
        },
      },
    });

    if (!sale) {
      res.status(404).json({ error: 'Sale not found' });
      return;
    }

    // Aggregate organizer rating and badge count
    const badgeCount = sale.organizer.badges.length;
    const avgRating =
      sale.organizer.badges.length > 0
        ? sale.organizer.badges.reduce((sum, b) => sum + (b.rating || 0), 0) / badgeCount
        : 0;

    res.json({
      ...sale,
      organizer: {
        ...sale.organizer,
        badgeCount,
        avgRating,
      },
    });
  } catch (error) {
    console.error('Get sale error:', error);
    res.status(500).json({ error: 'Failed to fetch sale' });
  }
};

// H1: Generate iCal format for sale
export const getSaleAsCalendar = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id },
    });

    if (!sale) {
      res.status(404).json({ error: 'Sale not found' });
      return;
    }

    const cal = ical({
      name: sale.title,
      events: [
        {
          id: sale.id,
          title: sale.title,
          description: sale.description,
          start: sale.startDate,
          end: sale.endDate,
          location: `${sale.address}, ${sale.city}, ${sale.state} ${sale.zip}`,
        },
      ],
    });

    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Content-Disposition', `attachment; filename="${sale.title}.ics"`);
    res.send(cal.toString());
  } catch (error) {
    console.error('Get calendar error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
};

export const publishSale = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const sale = await prisma.sale.update({
      where: { id },
      data: { status: 'PUBLISHED' },
    });

    res.json(sale);
  } catch (error) {
    console.error('Publish sale error:', error);
    res.status(500).json({ error: 'Failed to publish sale' });
  }
};
