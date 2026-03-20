import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const DEFAULT_TEMPLATES = [
  { title: 'Pickup Hours', body: 'Pickup is available during sale hours. Please bring help for large items — we cannot assist with loading.', category: 'pickup' },
  { title: 'No Holds', body: 'We do not hold items without payment. Items are sold first-come, first-served. Thank you for understanding!', category: 'availability' },
  { title: 'Price is Firm', body: 'Thank you for your interest! The price listed is our best price and is firm. We appreciate your understanding.', category: 'pricing' },
  { title: 'Open to Offers', body: 'We welcome reasonable offers on items. Feel free to make an offer at the sale — all decisions are made in person.', category: 'pricing' },
  { title: 'Item Still Available', body: 'Yes, that item is still available as of now! Items are first-come, first-served so we cannot reserve it, but we hope to see you at the sale.', category: 'availability' },
  { title: 'Item Sold', body: 'We\'re sorry, that item has already been sold. We do have many other great items — we hope you\'ll still stop by!', category: 'availability' },
];

export const getTemplates = async (req: AuthRequest, res: Response) => {
  try {
    const organizerId = req.user?.id;
    if (!organizerId) return res.status(401).json({ message: 'Authentication required' });

    let templates = await prisma.messageTemplate.findMany({
      where: { organizerId },
      orderBy: [{ usageCount: 'desc' }, { createdAt: 'asc' }],
    });

    // Seed defaults on first use
    if (templates.length === 0) {
      await prisma.messageTemplate.createMany({
        data: DEFAULT_TEMPLATES.map(t => ({ ...t, organizerId })),
      });
      templates = await prisma.messageTemplate.findMany({
        where: { organizerId },
        orderBy: [{ usageCount: 'desc' }, { createdAt: 'asc' }],
      });
    }

    res.json({ templates });
  } catch (error) {
    console.error('getTemplates error:', error);
    res.status(500).json({ message: 'Failed to fetch templates' });
  }
};

export const createTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const organizerId = req.user?.id;
    if (!organizerId) return res.status(401).json({ message: 'Authentication required' });

    const { title, body, category } = req.body;
    if (!title || !body) return res.status(400).json({ message: 'title and body are required' });

    const template = await prisma.messageTemplate.create({
      data: { organizerId, title, body, category: category || 'general' },
    });

    res.status(201).json({ template });
  } catch (error) {
    console.error('createTemplate error:', error);
    res.status(500).json({ message: 'Failed to create template' });
  }
};

export const updateTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const organizerId = req.user?.id;
    if (!organizerId) return res.status(401).json({ message: 'Authentication required' });

    const { id } = req.params;
    const { title, body, category } = req.body;

    const result = await prisma.messageTemplate.updateMany({
      where: { id, organizerId },
      data: { ...(title && { title }), ...(body && { body }), ...(category && { category }) },
    });

    if (result.count === 0) return res.status(404).json({ message: 'Template not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('updateTemplate error:', error);
    res.status(500).json({ message: 'Failed to update template' });
  }
};

export const deleteTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const organizerId = req.user?.id;
    if (!organizerId) return res.status(401).json({ message: 'Authentication required' });

    const { id } = req.params;
    await prisma.messageTemplate.deleteMany({ where: { id, organizerId } });
    res.json({ success: true });
  } catch (error) {
    console.error('deleteTemplate error:', error);
    res.status(500).json({ message: 'Failed to delete template' });
  }
};

export const trackTemplateUse = async (req: AuthRequest, res: Response) => {
  try {
    const organizerId = req.user?.id;
    if (!organizerId) return res.status(401).json({ message: 'Authentication required' });

    const { id } = req.params;
    await prisma.messageTemplate.updateMany({
      where: { id, organizerId },
      data: { usageCount: { increment: 1 } },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('trackTemplateUse error:', error);
    res.json({ success: false });
  }
};
