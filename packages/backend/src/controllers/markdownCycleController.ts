import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

/**
 * Feature: Automatic Markdown Cycles (PRO Tier)
 * Time-based automatic price reductions. Organizers define when prices drop by percentage.
 * Example: 10% off after 30 days, 20% off after 60 days, 30% off after 90 days.
 *
 * ADR-markdown-cycle-n-steps (2026-09-28): a cycle takes 1-6 ordered steps
 * (`steps: [{ dayThreshold, pctOff }]`) instead of the old fixed first/second pair.
 * `dayThreshold` and `pctOff` must both strictly increase across the array -- a markdown
 * schedule that doesn't cut deeper at each later step isn't a markdown schedule.
 */

const MAX_STEPS = 6;

interface StepInput {
  dayThreshold: number;
  pctOff: number;
}

/**
 * Validate a steps array for create/update. Returns an error message string, or null if valid.
 */
function validateSteps(steps: unknown): string | null {
  if (!Array.isArray(steps) || steps.length === 0) {
    return 'steps must be a non-empty array';
  }
  if (steps.length > MAX_STEPS) {
    return `steps cannot exceed ${MAX_STEPS} (got ${steps.length})`;
  }

  let prevDayThreshold = -Infinity;
  let prevPctOff = -Infinity;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] as Partial<StepInput>;
    const dayThreshold = step?.dayThreshold;
    const pctOff = step?.pctOff;

    if (typeof dayThreshold !== 'number' || !Number.isFinite(dayThreshold) || dayThreshold < 0) {
      return `steps[${i}].dayThreshold must be a number >= 0`;
    }
    if (typeof pctOff !== 'number' || !Number.isFinite(pctOff) || pctOff <= 0 || pctOff > 100) {
      return `steps[${i}].pctOff must be a number > 0 and <= 100`;
    }
    if (dayThreshold <= prevDayThreshold) {
      return `steps[${i}].dayThreshold must be greater than the previous step's dayThreshold`;
    }
    if (pctOff <= prevPctOff) {
      return `steps[${i}].pctOff must be greater than the previous step's pctOff`;
    }
    prevDayThreshold = dayThreshold;
    prevPctOff = pctOff;
  }

  return null;
}

// GET /api/markdown-cycles — list all markdown cycles for authenticated organizer
export const listMarkdownCycles = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Get organizer record
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(403).json({ message: 'Organizer profile not found' });
    }

    // No tier check (2026-09-29, Patrick D1): any organizer may list their own cycles, including
    // after a downgrade, so they can see what is paused. Ownership is enforced by the organizerId
    // filter below. Creating/updating cycles stays PRO (requireTier('PRO') in routes/markdownCycles.ts).

    // List all markdown cycles for this organizer, with steps ordered ascending
    const cycles = await prisma.markdownCycle.findMany({
      where: { organizerId: organizer.id },
      include: {
        sale: { select: { id: true, title: true } },
        steps: { orderBy: { stepOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(cycles);
  } catch (error) {
    console.error('Error listing markdown cycles:', error);
    res.status(500).json({ message: 'Server error while listing markdown cycles' });
  }
};

// POST /api/markdown-cycles — create a new markdown cycle
export const createMarkdownCycle = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { saleId, steps } = req.body;

    const stepsError = validateSteps(steps);
    if (stepsError) {
      return res.status(400).json({ message: stepsError });
    }

    // Get organizer record
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(403).json({ message: 'Organizer profile not found' });
    }

    // Tier check handled by requireTier('PRO') on POST in routes/markdownCycles.ts

    // If saleId is provided, verify organizer owns the sale
    if (saleId) {
      const sale = await prisma.sale.findUnique({
        where: { id: saleId },
        select: { organizerId: true },
      });

      if (!sale) {
        return res.status(404).json({ message: 'Sale not found' });
      }

      if (sale.organizerId !== organizer.id) {
        return res.status(403).json({ message: 'You do not own this sale' });
      }
    }

    const stepInputs = steps as StepInput[];

    // Create markdown cycle + its steps together. The deprecated daysUntilFirst/firstPct
    // columns are still NOT NULL in the schema (see ADR-markdown-cycle-n-steps) so they're
    // populated from step 1 for compatibility, but nothing reads them going forward.
    const cycle = await prisma.markdownCycle.create({
      data: {
        organizerId: organizer.id,
        saleId: saleId || null,
        daysUntilFirst: stepInputs[0].dayThreshold,
        firstPct: stepInputs[0].pctOff,
        daysUntilSecond: stepInputs.length > 1 ? stepInputs[1].dayThreshold : null,
        secondPct: stepInputs.length > 1 ? stepInputs[1].pctOff : null,
        steps: {
          create: stepInputs.map((step, index) => ({
            stepOrder: index + 1,
            dayThreshold: step.dayThreshold,
            pctOff: step.pctOff,
          })),
        },
      },
      include: {
        sale: { select: { id: true, title: true } },
        steps: { orderBy: { stepOrder: 'asc' } },
      },
    });

    res.status(201).json(cycle);
  } catch (error) {
    console.error('Error creating markdown cycle:', error);
    res.status(500).json({ message: 'Server error while creating markdown cycle' });
  }
};

// PUT /api/markdown-cycles/:id — update a markdown cycle
// PRO required to change steps or turn a cycle ON (requireProUnlessTurningOff in
// routes/markdownCycles.ts). A body that ONLY sets isActive:false is allowed for every tier
// (Patrick D1: any tier may always turn automation OFF); DELETE is open to every tier as well.
export const updateMarkdownCycle = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;
    const { steps, isActive } = req.body;

    if (steps !== undefined) {
      const stepsError = validateSteps(steps);
      if (stepsError) {
        return res.status(400).json({ message: stepsError });
      }
    }

    // Get organizer record
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(403).json({ message: 'Organizer profile not found' });
    }

    // Verify ownership of the cycle
    const cycle = await prisma.markdownCycle.findUnique({
      where: { id },
    });

    if (!cycle) {
      return res.status(404).json({ message: 'Markdown cycle not found' });
    }

    if (cycle.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'You do not own this markdown cycle' });
    }

    // Replace all steps atomically when a new steps array is provided (simplest correct
    // approach for a small, organizer-edited list — delete-then-recreate, same transaction).
    const stepInputs = steps as StepInput[] | undefined;

    const updatedCycle = await prisma.$transaction(async (tx) => {
      if (stepInputs) {
        await tx.markdownCycleStep.deleteMany({ where: { cycleId: id } });
        await tx.markdownCycleStep.createMany({
          data: stepInputs.map((step, index) => ({
            cycleId: id,
            stepOrder: index + 1,
            dayThreshold: step.dayThreshold,
            pctOff: step.pctOff,
          })),
        });
      }

      return tx.markdownCycle.update({
        where: { id },
        data: {
          ...(stepInputs && {
            daysUntilFirst: stepInputs[0].dayThreshold,
            firstPct: stepInputs[0].pctOff,
            daysUntilSecond: stepInputs.length > 1 ? stepInputs[1].dayThreshold : null,
            secondPct: stepInputs.length > 1 ? stepInputs[1].pctOff : null,
          }),
          ...(isActive !== undefined && { isActive }),
        },
        include: {
          sale: { select: { id: true, title: true } },
          steps: { orderBy: { stepOrder: 'asc' } },
        },
      });
    });

    res.json(updatedCycle);
  } catch (error) {
    console.error('Error updating markdown cycle:', error);
    res.status(500).json({ message: 'Server error while updating markdown cycle' });
  }
};

// DELETE /api/markdown-cycles/:id — delete a markdown cycle
// Any tier (authenticate + ownership only, 2026-09-29): turning automation off must never be paywalled.
export const deleteMarkdownCycle = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;

    // Get organizer record
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(403).json({ message: 'Organizer profile not found' });
    }

    // Verify ownership of the cycle
    const cycle = await prisma.markdownCycle.findUnique({
      where: { id },
    });

    if (!cycle) {
      return res.status(404).json({ message: 'Markdown cycle not found' });
    }

    if (cycle.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'You do not own this markdown cycle' });
    }

    // Delete the cycle (MarkdownCycleStep rows cascade via onDelete: Cascade)
    await prisma.markdownCycle.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting markdown cycle:', error);
    res.status(500).json({ message: 'Server error while deleting markdown cycle' });
  }
};
