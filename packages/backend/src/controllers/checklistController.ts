import { Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

interface ChecklistItem {
  id: string;
  stage: string; // "Setup", "Cataloging", "Pre-Sale", "Live", "Wrapping Up", "Complete"
  label: string;
  completed: boolean;
  isAuto: boolean; // true = auto-detected from real data, false = manual
  link?: string; // for tasks with links (e.g., settlement)
  tier?: string; // "PRO" or "TEAMS" if tier-gated
}

interface StageProgress {
  stageId: string;
  label: string;
  total: number;
  completed: number;
  isComplete: boolean;
}

// Legacy format for stored manual states (backward compatibility)
interface StoredManualState {
  [taskId: string]: boolean; // taskId -> completed
}

// Define all tasks with their properties
interface TaskDefinition {
  id: string;
  stage: string;
  label: string;
  isAuto: boolean;
  requiredTier?: 'PRO' | 'TEAMS'; // undefined = all tiers
  link?: string;
  autoCheck?: (data: TaskEvaluationData) => boolean;
}

interface TaskEvaluationData {
  sale: any;
  itemCount: number;
  unpricedCount: number;
  soldCount: number;
  clueCount: number;
  settlement: any;
  organizerTier: string;
  hasTestTransaction: boolean;
}

// Define all tasks
const ALL_TASKS: TaskDefinition[] = [
  // Stage 1: Setup (auto-detected from sale data)
  { id: 'setup_title', stage: 'Setup', label: 'Sale title & description written', isAuto: true, autoCheck: (d) => !!(d.sale.description && d.sale.description.length > 0), link: '/organizer/edit-sale/{saleId}' },
  { id: 'setup_type', stage: 'Setup', label: 'Sale type selected', isAuto: true, autoCheck: (d) => !!d.sale.saleType, link: '/organizer/edit-sale/{saleId}' },
  { id: 'setup_dates', stage: 'Setup', label: 'Dates & hours confirmed', isAuto: true, autoCheck: (d) => !!d.sale.startDate, link: '/organizer/edit-sale/{saleId}' },
  { id: 'setup_location', stage: 'Setup', label: 'Address & location confirmed', isAuto: true, autoCheck: (d) => !!(d.sale.lat && d.sale.lng), link: '/organizer/edit-sale/{saleId}' },
  { id: 'setup_cover', stage: 'Setup', label: 'Cover photo uploaded', isAuto: true, autoCheck: (d) => d.sale.photoUrls.length > 0, link: '/organizer/edit-sale/{saleId}' },
  // Stage 2: Cataloging
  { id: 'cat_rapidfire', stage: 'Cataloging', label: 'First items uploaded via Rapidfire', isAuto: true, autoCheck: (d) => d.itemCount >= 1, link: '/organizer/add-items/{saleId}' },
  { id: 'cat_tags', stage: 'Cataloging', label: 'Tags & categories reviewed', isAuto: false, link: '/organizer/add-items/{saleId}' },
  { id: 'cat_pricing', stage: 'Cataloging', label: 'All items priced', isAuto: true, autoCheck: (d) => d.unpricedCount === 0 && d.itemCount > 0, link: '/organizer/add-items/{saleId}' },
  { id: 'cat_smartpricing', stage: 'Cataloging', label: 'Smart Pricing suggestions reviewed', isAuto: false, requiredTier: 'PRO', link: '/organizer/inventory' },

  // Stage 3: Pre-Sale
  { id: 'pub_pricetags', stage: 'Pre-Sale', label: 'Price tags printed', isAuto: false, link: '/organizer/print-kit/{saleId}' },
  { id: 'pub_queue_qr', stage: 'Pre-Sale', label: 'Check-in / Queue QR printed & posted', isAuto: false, link: '/organizer/print-kit/{saleId}' },
  { id: 'pub_treasure', stage: 'Pre-Sale', label: 'Treasure Hunt clues printed & placed', isAuto: false, link: '/organizer/print-kit/{saleId}' },
  { id: 'setup_photo_qr', stage: 'Pre-Sale', label: 'QR code placed at photo station', isAuto: false, link: '/organizer/print-kit/{saleId}' },
  { id: 'pub_preview', stage: 'Pre-Sale', label: 'Sale previewed on mobile', isAuto: false, link: '/organizer/edit-sale/{saleId}' },
  { id: 'pub_signs', stage: 'Pre-Sale', label: 'Neighborhood signs made and placed', isAuto: false, link: '/organizer/print-kit/{saleId}' },
  { id: 'pub_published', stage: 'Pre-Sale', label: 'Sale published', isAuto: true, autoCheck: (d) => d.sale.status === 'PUBLISHED' || d.sale.status === 'LIVE', link: '/organizer/edit-sale/{saleId}' },
  { id: 'pub_social', stage: 'Pre-Sale', label: 'Sale shared on social media', isAuto: false, link: '/organizer/promote/{saleId}' },
  { id: 'pre_online_checkout', stage: 'Pre-Sale', label: 'Online checkout tested', isAuto: false, link: '/organizer/pos' },
  { id: 'pre_auction_checkout', stage: 'Pre-Sale', label: 'Auction checkout tested', isAuto: false, link: '/organizer/pos' },
  { id: 'pre_in_app_payment', stage: 'Pre-Sale', label: 'In-app payment tested', isAuto: false, link: '/organizer/pos' },

  // Stage 4: Live
  { id: 'live_internet', stage: 'Live', label: 'Internet connection tested', isAuto: false },
  { id: 'live_queue', stage: 'Live', label: 'Virtual Queue active', isAuto: false, requiredTier: 'PRO', link: '/organizer/line-queue/{saleId}' },
  { id: 'live_pos', stage: 'Live', label: 'POS open and test transaction done', isAuto: true, autoCheck: (d) => d.hasTestTransaction, link: '/organizer/pos' },
  { id: 'live_float', stage: 'Live', label: 'Bills and coins ready for making change', isAuto: false },
  { id: 'live_helpers', stage: 'Live', label: 'Helpers briefed on their roles', isAuto: false },
  { id: 'live_first_sold', stage: 'Live', label: 'First item sold', isAuto: true, autoCheck: (d) => d.soldCount >= 1 },
  { id: 'live_qr_check', stage: 'Live', label: 'QR scan activity checked', isAuto: false, link: '/organizer/qr-codes' },

  // Stage 5: Wrapping Up
  { id: 'wrap_signs_down', stage: 'Wrapping Up', label: 'Signs taken down', isAuto: false },
  { id: 'wrap_property_cleared', stage: 'Wrapping Up', label: 'Property cleaned up and cleared', isAuto: false },
  { id: 'wrap_items_sorted', stage: 'Wrapping Up', label: 'Unsold items sorted — donate, relist, or discard', isAuto: false, link: '/organizer/inventory' },
  { id: 'wrap_donation_scheduled', stage: 'Wrapping Up', label: 'Donation pickup scheduled', isAuto: false },
  { id: 'wrap_relist', stage: 'Wrapping Up', label: 'Valuable items relisted for sale', isAuto: false, link: '/organizer/sales/{saleId}' },
  { id: 'wrap_messages', stage: 'Wrapping Up', label: 'Shopper messages answered', isAuto: false, link: '/organizer/messages' },
  { id: 'wrap_flip', stage: 'Wrapping Up', label: 'Flip Report reviewed', isAuto: false, requiredTier: 'PRO', link: '/organizer/flip-report/{saleId}' },
  { id: 'wrap_closed', stage: 'Wrapping Up', label: 'Sale marked complete', isAuto: true, autoCheck: (d) => d.sale.status === 'ENDED' },

  // Stage 6: Complete
  { id: 'done_settlement', stage: 'Complete', label: 'Settlement Wizard completed', isAuto: false, link: '/organizer/settlement/{saleId}' },
  { id: 'done_earnings', stage: 'Complete', label: 'Earnings reviewed', isAuto: false, link: '/organizer/earnings' },
  { id: 'done_payout', stage: 'Complete', label: 'Client payout confirmed', isAuto: true, autoCheck: (d) => d.settlement?.lifecycleStage === 'CLOSED' },
  { id: 'done_reviews', stage: 'Complete', label: 'Shopper reviews responded to', isAuto: false, link: '/organizer/reviews' },
  { id: 'done_next', stage: 'Complete', label: 'Next sale ready to start?', isAuto: false },
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

// GET /api/checklist/:saleId — get progress tracker checklist with auto+manual merge
export const getChecklist = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { saleId } = req.params;

    // Step 1: Verify sale ownership and fetch sale + organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: true, settlement: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    // Step 2: Fetch item counts
    const itemCount = await prisma.item.count({
      where: { saleId, deletedAt: null },
    });

    const unpricedCount = await prisma.item.count({
      where: { saleId, price: null, deletedAt: null },
    });

    const soldCount = await prisma.item.count({
      where: { saleId, status: 'SOLD', deletedAt: null },
    });

    // Step 3: Fetch treasure hunt clue count
    const clueCount = await prisma.treasureHuntQRClue.count({
      where: { saleId },
    });

    const hasTestTransaction = !!(await prisma.purchase.findFirst({
      where: { saleId, isTestTransaction: true },
    }));

    // Step 4: Load stored checklist (for manual task states)
    let storedChecklist = await prisma.saleChecklist.findUnique({
      where: { saleId },
    });

    // Guard: old schema stored items as an array; new code uses {taskId: boolean} object.
    // If it's an array (or null), start fresh — old IDs don't map to new task IDs anyway.
    const rawItems = storedChecklist?.items;
    const manualStates: StoredManualState =
      !rawItems || Array.isArray(rawItems) ? {} : (rawItems as unknown as StoredManualState);

    // Step 5: Build task evaluation data
    const evalData: TaskEvaluationData = {
      sale,
      itemCount,
      unpricedCount,
      soldCount,
      clueCount,
      settlement: sale.settlement,
      organizerTier: sale.organizer.subscriptionTier || 'SIMPLE',
      hasTestTransaction,
    };

    // Step 6: Build items list (filtered by tier, merging auto+manual)
    const items: ChecklistItem[] = [];
    const stageGroups: Record<string, { total: number; completed: number }> = {};

    for (const taskDef of ALL_TASKS) {
      // Skip pub_treasure if no clues
      if (taskDef.id === 'pub_treasure' && clueCount === 0) {
        continue;
      }

      // Skip if tier-gated and organizer doesn't have access
      if (taskDef.requiredTier) {
        const tierRank: Record<string, number> = { SIMPLE: 0, PRO: 1, TEAMS: 2 };
        const tierMap: Record<string, number> = { PRO: 1, TEAMS: 2 };
        const required = tierMap[taskDef.requiredTier];
        const current = tierRank[evalData.organizerTier];
        if (current < required) {
          continue;
        }
      }

      // Determine completion state
      let completed = false;
      if (taskDef.isAuto && taskDef.autoCheck) {
        completed = taskDef.autoCheck(evalData);
      } else {
        // Manual task: check stored state
        completed = manualStates[taskDef.id] || false;
      }

      // Build item
      const item: ChecklistItem = {
        id: taskDef.id,
        stage: taskDef.stage,
        label: taskDef.label,
        completed,
        isAuto: taskDef.isAuto,
      };

      if (taskDef.link) {
        item.link = taskDef.link.replace('{saleId}', saleId);
      }

      if (taskDef.requiredTier) {
        item.tier = taskDef.requiredTier;
      }

      items.push(item);

      // Track stage progress
      if (!stageGroups[taskDef.stage]) {
        stageGroups[taskDef.stage] = { total: 0, completed: 0 };
      }
      stageGroups[taskDef.stage].total++;
      if (completed) {
        stageGroups[taskDef.stage].completed++;
      }
    }

    // Step 7: Build stage progress
    const stageOrder = ['Setup', 'Cataloging', 'Pre-Sale', 'Live', 'Wrapping Up', 'Complete'];
    const stageProgress: StageProgress[] = stageOrder.map((stageName) => {
      const group = stageGroups[stageName];
      if (!group) {
        return { stageId: stageName.toLowerCase().replace(/ /g, '_'), label: stageName, total: 0, completed: 0, isComplete: false };
      }
      return {
        stageId: stageName.toLowerCase().replace(/ /g, '_'),
        label: stageName,
        total: group.total,
        completed: group.completed,
        isComplete: group.total > 0 && group.completed === group.total,
      };
    });

    // Create checklist in DB if it doesn't exist (for backward compatibility)
    if (!storedChecklist) {
      storedChecklist = await prisma.saleChecklist.create({
        data: {
          saleId,
          items: {} as unknown as Prisma.InputJsonValue,
        },
      });
    }

    return res.json({
      id: storedChecklist.id,
      saleId,
      items,
      stageProgress,
      updatedAt: storedChecklist.updatedAt,
    });
  } catch (error: any) {
    console.error('Error fetching checklist:', error);
    return res.status(500).json({ message: 'Failed to fetch checklist' });
  }
};

// PATCH /api/checklist/:saleId — update manual task completion state
export const updateChecklist = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
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
          items: {} as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // Update manual states (only for non-auto tasks).
    // Guard: old schema stored items as an array; treat it as empty to avoid JSON stringify losing named props.
    const rawItems = checklist.items;
    const manualStates: StoredManualState =
      !rawItems || Array.isArray(rawItems) ? {} : (rawItems as unknown as StoredManualState);
    const taskDef = ALL_TASKS.find(t => t.id === data.itemId);

    if (!taskDef) {
      return res.status(404).json({ message: 'Checklist item not found' });
    }

    // Only allow updating manual tasks
    if (taskDef.isAuto) {
      return res.status(400).json({ message: 'Cannot manually update auto-detected tasks' });
    }

    manualStates[data.itemId] = data.completed;

    // Save updated checklist
    const updated = await prisma.saleChecklist.update({
      where: { saleId },
      data: { items: manualStates as unknown as Prisma.InputJsonValue },
    });

    // Fetch fresh and return full checklist (for consistency with getChecklist)
    return getChecklist(req, res);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
    }
    console.error('Error updating checklist:', error);
    return res.status(500).json({ message: 'Failed to update checklist' });
  }
};

// POST /api/checklist/:saleId/items — (deprecated, kept for backward compat)
export const addChecklistItem = async (req: AuthRequest, res: Response) => {
  return res.status(400).json({ message: 'Custom checklist items no longer supported. Use the progress tracker.' });
};

// DELETE /api/checklist/:saleId/items/:itemId — (deprecated, kept for backward compat)
export const deleteChecklistItem = async (req: AuthRequest, res: Response) => {
  return res.status(400).json({ message: 'Custom checklist items no longer supported. Use the progress tracker.' });
};
