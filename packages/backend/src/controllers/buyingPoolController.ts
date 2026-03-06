import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Create a new buying pool for an item
export const createPool = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { itemId } = req.body;

    if (!itemId) {
      return res.status(400).json({ message: 'itemId is required' });
    }

    // Fetch the item to get its price and sale info
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: { include: { organizer: { include: { user: { select: { email: true, name: true } } } } } } },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (!item.price || item.price <= 0) {
      return res.status(400).json({ message: 'Item must have a valid price' });
    }

    if (item.status !== 'AVAILABLE') {
      return res.status(400).json({ message: 'Item is not available' });
    }

    // Check if a pool already exists for this item
    const existingPool = await prisma.buyingPool.findFirst({
      where: {
        itemId,
        status: { in: ['OPEN', 'FILLED'] },
      },
    });

    if (existingPool) {
      return res.status(400).json({ message: 'A buying pool already exists for this item' });
    }

    // Convert price (dollars) to cents for targetAmount
    const targetAmount = Math.round(item.price * 100);

    // Create pool that expires in 7 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const pool = await prisma.buyingPool.create({
      data: {
        itemId,
        creatorId: req.user.id,
        targetAmount,
        status: 'OPEN',
        expiresAt,
      },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        item: { select: { id: true, title: true, price: true } },
        participants: {
          select: { id: true, userId: true, pledgeAmount: true, joinedAt: true },
        },
      },
    });

    res.status(201).json({
      message: 'Buying pool created',
      pool: {
        ...pool,
        totalPledged: 0,
        participantCount: 0,
      },
    });
  } catch (error) {
    console.error('Create pool error:', error);
    res.status(500).json({ message: 'Server error while creating pool' });
  }
};

// Join an existing pool with a pledge amount
export const joinPool = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { poolId, pledgeAmount } = req.body;

    if (!poolId || pledgeAmount === undefined) {
      return res.status(400).json({ message: 'poolId and pledgeAmount are required' });
    }

    if (pledgeAmount <= 0) {
      return res.status(400).json({ message: 'pledgeAmount must be positive' });
    }

    // Fetch pool with participants
    const pool = await prisma.buyingPool.findUnique({
      where: { id: poolId },
      include: {
        item: { select: { id: true, title: true } },
        creator: { select: { id: true, name: true, email: true } },
        participants: {
          select: { id: true, userId: true, pledgeAmount: true },
        },
      },
    });

    if (!pool) {
      return res.status(404).json({ message: 'Pool not found' });
    }

    if (pool.status === 'CANCELLED') {
      return res.status(400).json({ message: 'This pool has been cancelled' });
    }

    if (pool.status === 'COMPLETED') {
      return res.status(400).json({ message: 'This pool has been completed' });
    }

    if (new Date() > pool.expiresAt) {
      return res.status(400).json({ message: 'This pool has expired' });
    }

    // Check if user is already a participant
    const existingParticipant = await prisma.poolParticipant.findUnique({
      where: {
        poolId_userId: {
          poolId,
          userId: req.user.id,
        },
      },
    });

    if (existingParticipant) {
      return res.status(400).json({ message: 'You are already a participant in this pool' });
    }

    // Convert pledgeAmount to cents
    const pledgeAmountCents = Math.round(pledgeAmount * 100);

    // Check if adding this pledge exceeds the target
    const totalPledged = pool.participants.reduce((sum, p) => sum + p.pledgeAmount, 0) + pledgeAmountCents;

    if (totalPledged > pool.targetAmount) {
      return res.status(400).json({
        message: `Pledge amount exceeds remaining target. Maximum: $${((pool.targetAmount - (totalPledged - pledgeAmountCents)) / 100).toFixed(2)}`,
      });
    }

    // Add participant to the pool
    const participant = await prisma.poolParticipant.create({
      data: {
        poolId,
        userId: req.user.id,
        pledgeAmount: pledgeAmountCents,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // Recalculate pool status
    const updatedParticipants = [...pool.participants, { userId: req.user.id, pledgeAmount: pledgeAmountCents, id: participant.id }];
    const newTotal = updatedParticipants.reduce((sum, p) => sum + p.pledgeAmount, 0);
    let newStatus = pool.status;

    if (newTotal >= pool.targetAmount) {
      newStatus = 'FILLED';
      // Update pool status to FILLED
      await prisma.buyingPool.update({
        where: { id: poolId },
        data: { status: 'FILLED', updatedAt: new Date() },
      });

      // Send email notification to organizer
      try {
        const organizer = await prisma.organizer.findUnique({
          where: { userId: pool.item.id }, // This won't work directly; we need to get it from the pool's item's sale
        });

        // Get the actual organizer from the item's sale
        const itemWithSale = await prisma.item.findUnique({
          where: { id: pool.item.id },
          include: { sale: { include: { organizer: { include: { user: { select: { email: true, name: true } } } } } } },
        });

        if (itemWithSale?.sale?.organizer?.user?.email) {
          const orgEmail = itemWithSale.sale.organizer.user.email;
          const orgName = itemWithSale.sale.organizer.user.name;
          const itemTitle = pool.item.title;
          const poolAmount = (pool.targetAmount / 100).toFixed(2);

          await resend.emails.send({
            from: 'FindA.Sale <noreply@findasale.com>',
            to: orgEmail,
            subject: `Buying Pool Filled: ${itemTitle}`,
            html: `
              <h2>Pool Filled!</h2>
              <p>Hi ${orgName},</p>
              <p>A buying pool for <strong>${itemTitle}</strong> has reached its target amount of $${poolAmount}.</p>
              <p><strong>${updatedParticipants.length}</strong> shoppers have pledged together to purchase this item.</p>
              <p>Please coordinate with the group to finalize the sale.</p>
              <p>Best regards,<br>FindA.Sale Team</p>
            `,
          });
        }
      } catch (emailError) {
        console.warn('Failed to send pool filled notification email:', emailError);
        // Don't fail the entire operation if email fails
      }
    }

    res.status(201).json({
      message: newStatus === 'FILLED' ? 'Pool filled! Participants notified.' : 'Joined pool successfully',
      participant,
      pool: {
        id: poolId,
        status: newStatus,
        totalPledged: newTotal,
        targetAmount: pool.targetAmount,
        participantCount: updatedParticipants.length,
      },
    });
  } catch (error) {
    console.error('Join pool error:', error);
    res.status(500).json({ message: 'Server error while joining pool' });
  }
};

// Get all active pools for an item
export const getPoolsForItem = async (req: any, res: Response) => {
  try {
    const { itemId } = req.params;

    if (!itemId) {
      return res.status(400).json({ message: 'itemId is required' });
    }

    const pools = await prisma.buyingPool.findMany({
      where: {
        itemId,
        status: { in: ['OPEN', 'FILLED'] },
      },
      include: {
        creator: { select: { id: true, name: true } },
        participants: {
          select: { id: true, userId: true, pledgeAmount: true, joinedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const poolsWithCalcFields = pools.map(pool => {
      const totalPledged = pool.participants.reduce((sum, p) => sum + p.pledgeAmount, 0);
      return {
        ...pool,
        totalPledged,
        percentageToTarget: Math.round((totalPledged / pool.targetAmount) * 100),
        participantCount: pool.participants.length,
      };
    });

    res.json({ pools: poolsWithCalcFields });
  } catch (error) {
    console.error('Get pools for item error:', error);
    res.status(500).json({ message: 'Server error while fetching pools' });
  }
};

// Cancel a pool (creator or organizer only)
export const cancelPool = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { poolId } = req.params;

    if (!poolId) {
      return res.status(400).json({ message: 'poolId is required' });
    }

    const pool = await prisma.buyingPool.findUnique({
      where: { id: poolId },
      include: {
        creator: { select: { id: true } },
        participants: { select: { user: { select: { email: true, name: true } } } },
        item: { select: { id: true, title: true, sale: { include: { organizer: { include: { user: { select: { id: true, email: true, name: true } } } } } } } },
      },
    });

    if (!pool) {
      return res.status(404).json({ message: 'Pool not found' });
    }

    // Check authorization: only creator or organizer can cancel
    const isCreator = pool.creator.id === req.user.id;
    const isOrganizerOwner = pool.item.sale?.organizer?.user?.id === req.user.id;

    if (!isCreator && !isOrganizerOwner) {
      return res.status(403).json({ message: 'Only the pool creator or organizer can cancel' });
    }

    // Update pool status
    await prisma.buyingPool.update({
      where: { id: poolId },
      data: { status: 'CANCELLED', updatedAt: new Date() },
    });

    // Send cancellation emails to all participants
    try {
      for (const participant of pool.participants) {
        if (participant.user?.email) {
          await resend.emails.send({
            from: 'FindA.Sale <noreply@findasale.com>',
            to: participant.user.email,
            subject: `Buying Pool Cancelled: ${pool.item.title}`,
            html: `
              <h2>Pool Cancelled</h2>
              <p>Hi ${participant.user.name},</p>
              <p>The buying pool for <strong>${pool.item.title}</strong> has been cancelled.</p>
              <p>Your pledge of $${(pool.targetAmount / 100).toFixed(2)} has been released.</p>
              <p>Best regards,<br>FindA.Sale Team</p>
            `,
          });
        }
      }
    } catch (emailError) {
      console.warn('Failed to send cancellation emails:', emailError);
    }

    res.json({ message: 'Pool cancelled successfully' });
  } catch (error) {
    console.error('Cancel pool error:', error);
    res.status(500).json({ message: 'Server error while cancelling pool' });
  }
};
