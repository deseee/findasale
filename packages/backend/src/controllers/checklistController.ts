import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

interface ChecklistItem {
  id: string;
  phase: 'pre' | 'during' | 'post';
  label: string;
  completed: boolean;
  completedAt?: string;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  // Pre-sale
  { id: 'pre1', phase: 'pre', label: 'Photograph all items', completed: false },
  { id: 'pre2', phase: 'pre', label: 'Price all items', completed: false },
  { id: 'pre3', phase: 'pre', label: 'Publish sale listing', completed: false },
  { id: 'pre4', phase: 'pre', label: 'Print QR code signs', completed: false },
  { id: 'pre5', phase: 'pre', label: 'Set up item displays', completed: false },
  { id: 'pre6', phase: 'pre', label: 'Prepare change + payment system', completed: false },
  // During
  { id: 'dur1', phase: 'during', label: 'Mark items as sold in app', completed: false },
  { id: 'dur2', phase: 'during', label: 'Process payments promptly', completed: false },
  { id: 'dur3', phase: 'during', label: 'Handle holds + reservations', completed: false },
  // Post
  { id: 'post1', phase: 'post', label: 'Mark sale as complete', completed: false },
  { id: 'post2', phase: 'post', label: 'Remove remaining items', completed: false },
  { id: 'post3', phase: 'post', label: 'Review buyer feedback', completed: false },
];

// Validation schemas
const updateChecklistSchema = z.object({
  itemId: z.string(),
  completed: z.boolean(),
  label: z.string().optional(),
});

const addItemSchema = z.object({
  label: z.string().min(1).max(200),
  phase: z.enum(['pre', 'during', 'post']),
});

// GET /api/checklist/:saleId — get checklist, create with defaults if none exists
export const getChecklist = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { saleId } = req.params;

    // Verify sale exists and user owns it
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    // Find or create checklist
    let checklist = await prisma.saleChecklist.findUnique({
      where: { saleId },
    });

    if (!checklist) {
      // Create with defaults
      checklist = await prisma.saleChecklist.create({
        data: {
          saleId,
          items: DEFAULT_CHECKLIST,
        },
      });
    }

    return res.json(checklist);
  } catch (error: any) {
    console.error('Error fetching checklist:', error);
    return res.status(500).json({ message: 'Failed to fetch checklist' });
  }
};

// PATCH /api/checklist/:saleId — update item completion status or label
export const updateChecklist = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { saleId } = req.params;
    const data = updateChecklistSchema.parse(req.body);

    // Verify sale exists and user owns it
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    // Get or create checklist
    let checklist = await prisma.saleChecklist.findUnique({
      where: { saleId },
    });

    if (!checklist) {
      checklist = await prisma.saleChecklist.create({
        data: {
          saleId,
          items: DEFAULT_CHECKLIST,
        },
      });
    }

    // Update items array
    const items = (checklist.items as ChecklistItem[]) || [];
    const itemIndex = items.findIndex(item => item.id === data.itemId);

    if (itemIndex === -1) {
      return res.status(404).json({ message: 'Checklist item not found' });
    }

    // Update the item
    items[itemIndex].completed = data.completed;
    if (data.completed) {
      items[itemIndex].completedAt = new Date().toISOString();
    } else {
      delete items[itemIndex].completedAt;
    }

    // Optionally update label
    if (data.label !== undefined) {
      items[itemIndex].label = data.label;
    }

    // Save updated checklist
    const updated = await prisma.saleChecklist.update({
      where: { saleId },
      data: { items },
    });

    return res.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
    }
    console.error('Error updating checklist:', error);
    return res.status(500).json({ message: 'Failed to update checklist' });
  }
};

// POST /api/checklist/:saleId/items — add a custom checklist item
export const addChecklistItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { saleId } = req.params;
    const data = addItemSchema.parse(req.body);

    // Verify sale exists and user owns it
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    // Get or create checklist
    let checklist = await prisma.saleChecklist.findUnique({
      where: { saleId },
    });

    if (!checklist) {
      checklist = await prisma.saleChecklist.create({
        data: {
          saleId,
          items: DEFAULT_CHECKLIST,
        },
      });
    }

    // Add new item
    const items = (checklist.items as ChecklistItem[]) || [];
    const newItem: ChecklistItem = {
      id: `custom_${Date.now()}`,
      phase: data.phase,
      label: data.label,
      completed: false,
    };
    items.push(newItem);

    // Save updated checklist
    const updated = await prisma.saleChecklist.update({
      where: { saleId },
      data: { items },
    });

    return res.status(201).json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
    }
    console.error('Error adding checklist item:', error);
    return res.status(500).json({ message: 'Failed to add checklist item' });
  }
};

// DELETE /api/checklist/:saleId/items/:itemId — delete a custom checklist item
export const deleteChecklistItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { saleId, itemId } = req.params;

    // Verify sale exists and user owns it
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    // Get checklist
    const checklist = await prisma.saleChecklist.findUnique({
      where: { saleId },
    });

    if (!checklist) {
      return res.status(404).json({ message: 'Checklist not found' });
    }

    // Remove item
    const items = (checklist.items as ChecklistItem[]) || [];
    const filtered = items.filter(item => item.id !== itemId);

    if (filtered.length === items.length) {
      return res.status(404).json({ message: 'Checklist item not found' });
    }

    // Save updated checklist
    const updated = await prisma.saleChecklist.update({
      where: { saleId },
      data: { items: filtered },
    });

    return res.json(updated);
  } catch (error: any) {
    console.error('Error deleting checklist item:', error);
    return res.status(500).json({ message: 'Failed to delete checklist item' });
  }
};
