import { Response } from 'express';
import { prisma } from '../lib/prisma';
import * as Sentry from '@sentry/node';
import { AuthRequest } from '../middleware/auth';
import { getIO } from '../lib/socket';

// ── Morning Briefing: Day-of-Sale operational view ──────────────────────────

/**
 * GET /api/workspace/:workspaceId/briefing
 *
 * Returns the morning briefing payload if a qualifying sale exists
 * (startDate within 12h future or 6h past). Otherwise returns { briefing: null }.
 */
export const getBriefing = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const organizerId = req.user?.organizerProfile?.id;

    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    // Verify workspace membership
    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, ownerId: true, members: { select: { organizerId: true } } },
    });
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    const isMember =
      workspace.ownerId === organizerId ||
      workspace.members.some((m) => m.organizerId === organizerId);
    if (!isMember) return res.status(403).json({ message: 'Not a workspace member' });

    // Detection window: startDate within 12h future or 6h past
    const now = new Date();
    const windowStart = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 12 * 60 * 60 * 1000);

    // Find qualifying sale (owner's sales scoped to this workspace)
    const sale = await prisma.sale.findFirst({
      where: {
        organizerId: workspace.ownerId,
        status: 'PUBLISHED',
        deletedAt: null,
        startDate: { gte: windowStart, lte: windowEnd },
      },
      select: {
        id: true,
        title: true,
        startDate: true,
        endDate: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        lat: true,
        lng: true,
        entranceNote: true,
        cashFloat: true,
        status: true,
        saleType: true,
      },
      orderBy: { startDate: 'asc' },
    });

    if (!sale) {
      return res.json({ briefing: null });
    }

    // Aggregate briefing data in parallel
    const [rsvpCount, assignments, prepTasks, lastChatMessage] = await Promise.all([
      // RSVP count
      prisma.saleRSVP.count({ where: { saleId: sale.id } }),

      // Team assignments with member details
      prisma.saleAssignment.findMany({
        where: { saleId: sale.id },
        select: {
          id: true,
          teamMemberId: true,
          role: true,
          ownsArea: true,
          status: true,
          eta: true,
          lastSeenAt: true,
          teamMember: {
            select: {
              id: true,
              role: true,
              department: true,
              workspaceMember: {
                select: {
                  organizer: { select: { id: true, businessName: true } },
                  user: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),

      // Prep tasks ordered by sortOrder
      prisma.prepTask.findMany({
        where: { saleId: sale.id },
        select: {
          id: true,
          title: true,
          assigneeId: true,
          done: true,
          doneAt: true,
          urgent: true,
          sortOrder: true,
          phase: true,
          checklistItemId: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),

      // Last chat message
      (async () => {
        const chat = await prisma.workspaceSaleChat.findUnique({
          where: { workspaceId_saleId: { workspaceId, saleId: sale.id } },
          select: { id: true },
        });
        if (!chat) return null;
        const msg = await prisma.workspaceChatMessage.findFirst({
          where: { chatId: chat.id },
          select: {
            content: true,
            createdAt: true,
            organizer: { select: { businessName: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!msg) return null;
        return {
          content: msg.content,
          author: msg.organizer.businessName,
          createdAt: msg.createdAt,
        };
      })(),
    ]);

    // Map team assignments to briefing-friendly shape
    const team = assignments.map((a) => {
      const wm = a.teamMember.workspaceMember;
      const name = wm.organizer?.businessName || wm.user?.name || 'Team Member';
      const initial = name.charAt(0).toUpperCase();
      return {
        id: a.id,
        teamMemberId: a.teamMemberId,
        name,
        role: a.role,
        ownsArea: a.ownsArea,
        status: a.status,
        eta: a.eta,
        lastSeenAt: a.lastSeenAt,
        avatarInitial: initial,
      };
    });

    const doneTasks = prepTasks.filter((t) => t.done).length;

    return res.json({
      briefing: {
        sale,
        rsvpCount,
        team,
        prep: {
          total: prepTasks.length,
          done: doneTasks,
          tasks: prepTasks,
        },
        lastChatMessage,
      },
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching briefing:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * PATCH /api/workspace/:workspaceId/briefing/status
 *
 * Updates the calling user's SaleAssignment status + eta.
 * Emits briefing:statusChanged to the briefing room.
 */
export const updateStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { saleId, status, eta } = req.body;
    const organizerId = req.user?.organizerProfile?.id;
    const userId = req.user?.id;

    if (!organizerId && !userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!workspaceId || !saleId) return res.status(400).json({ message: 'Workspace ID and Sale ID required' });

    const validStatuses = ['CONFIRMED', 'EN_ROUTE', 'ON_SITE', 'RUNNING_LATE'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    // Find the calling user's TeamMember via WorkspaceMember
    const workspaceMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        OR: [
          { organizerId: organizerId || undefined },
          { userId: userId || undefined },
        ],
      },
      select: { teamMember: { select: { id: true } } },
    });

    if (!workspaceMember?.teamMember) {
      return res.status(404).json({ message: 'Team member not found for this workspace' });
    }

    const teamMemberId = workspaceMember.teamMember.id;

    // Update or create SaleAssignment
    const assignment = await prisma.saleAssignment.upsert({
      where: { saleId_teamMemberId: { saleId, teamMemberId } },
      update: {
        status,
        eta: eta ? new Date(eta) : null,
        lastSeenAt: new Date(),
      },
      create: {
        saleId,
        teamMemberId,
        status,
        eta: eta ? new Date(eta) : null,
        lastSeenAt: new Date(),
      },
    });

    // Emit socket event
    try {
      const io = getIO();
      io.to(`briefing:${saleId}`).emit('briefing:statusChanged', {
        teamMemberId,
        status: assignment.status,
        eta: assignment.eta,
        updatedAt: assignment.updatedAt,
      });
    } catch (socketErr) {
      console.warn('[briefing] Socket emit failed:', socketErr);
    }

    return res.json({ assignment });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error updating briefing status:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * POST /api/workspace/:workspaceId/briefing/prep
 *
 * Creates a new PrepTask. Emits briefing:taskCreated.
 */
export const createPrepTask = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { saleId, title, assigneeId, urgent, phase, checklistItemId } = req.body;
    const organizerId = req.user?.organizerProfile?.id;

    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    if (!workspaceId || !saleId) return res.status(400).json({ message: 'Workspace ID and Sale ID required' });
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length > 200) {
      return res.status(400).json({ message: 'Title cannot exceed 200 characters' });
    }

    // Get max sortOrder for this sale to append at end
    const maxOrder = await prisma.prepTask.findFirst({
      where: { saleId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const task = await prisma.prepTask.create({
      data: {
        saleId,
        title: trimmedTitle,
        assigneeId: assigneeId || null,
        urgent: urgent === true,
        phase: ['pre', 'during', 'post'].includes(phase) ? phase : 'pre',
        checklistItemId: checklistItemId || null,
        sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
      },
    });

    // Emit socket event
    try {
      const io = getIO();
      io.to(`briefing:${saleId}`).emit('briefing:taskCreated', { task });
    } catch (socketErr) {
      console.warn('[briefing] Socket emit failed:', socketErr);
    }

    return res.status(201).json({ task });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error creating prep task:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * PATCH /api/workspace/:workspaceId/briefing/prep/:taskId
 *
 * Updates a PrepTask. Syncs to SaleChecklist if checklistItemId is set.
 * Emits briefing:prepToggled.
 */
export const updatePrepTask = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, taskId } = req.params;
    const { done, assigneeId, title, urgent } = req.body;
    const organizerId = req.user?.organizerProfile?.id;

    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    if (!workspaceId || !taskId) return res.status(400).json({ message: 'Workspace ID and Task ID required' });

    // Fetch existing task to get saleId and checklistItemId
    const existing = await prisma.prepTask.findUnique({
      where: { id: taskId },
      select: { saleId: true, checklistItemId: true, done: true },
    });
    if (!existing) return res.status(404).json({ message: 'Prep task not found' });

    // Build update data
    const updateData: any = {};
    if (typeof done === 'boolean') {
      updateData.done = done;
      updateData.doneAt = done ? new Date() : null;
    }
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;
    if (title !== undefined && typeof title === 'string' && title.trim().length > 0) {
      updateData.title = title.trim();
    }
    if (typeof urgent === 'boolean') updateData.urgent = urgent;

    const task = await prisma.prepTask.update({
      where: { id: taskId },
      data: updateData,
    });

    // SaleChecklist sync: if this task links to a checklist item, update the JSON blob
    if (typeof done === 'boolean' && existing.checklistItemId) {
      try {
        const checklist = await prisma.saleChecklist.findUnique({
          where: { saleId: existing.saleId },
        });
        if (checklist && Array.isArray(checklist.items)) {
          const items = checklist.items as Array<{
            id: string;
            phase: string;
            label: string;
            completed: boolean;
            completedAt?: string;
          }>;
          const idx = items.findIndex((item) => item.id === existing.checklistItemId);
          if (idx !== -1) {
            items[idx].completed = done;
            items[idx].completedAt = done ? new Date().toISOString() : undefined;
            await prisma.saleChecklist.update({
              where: { saleId: existing.saleId },
              data: { items: items as any },
            });
          }
        }
      } catch (syncErr) {
        // Non-fatal: log but don't fail the prep task update
        console.warn('[briefing] SaleChecklist sync failed:', syncErr);
      }
    }

    // Emit socket event
    try {
      const io = getIO();
      io.to(`briefing:${existing.saleId}`).emit('briefing:prepToggled', {
        taskId: task.id,
        done: task.done,
        doneAt: task.doneAt,
        doneBy: organizerId,
      });
    } catch (socketErr) {
      console.warn('[briefing] Socket emit failed:', socketErr);
    }

    return res.json({ task });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error updating prep task:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
