import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from '../lib/notificationService';

// GET /api/messages — list all conversations for the current user
export const getConversations = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const userId = req.user.id;
    const isOrganizer = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';

    let conversations;

    if (isOrganizer) {
      // Organizer: fetch via their organizer record
      const organizer = await prisma.organizer.findUnique({ where: { userId } });
      if (!organizer) return res.status(404).json({ message: 'Organizer profile not found' });

      conversations = await prisma.conversation.findMany({
        where: { organizerId: organizer.id },
        include: {
          shopperUser: { select: { id: true, name: true } },
          sale: { select: { id: true, title: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: { select: { messages: { where: { isRead: false, senderId: { not: userId } } } } },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 100, // M2: inbox hard cap — prevents memory spike for high-volume organizers
      });
    } else {
      // Shopper: fetch their conversations directly
      conversations = await prisma.conversation.findMany({
        where: { shopperUserId: userId },
        include: {
          organizer: {
            select: { id: true, businessName: true, userId: true },
          },
          sale: { select: { id: true, title: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: { select: { messages: { where: { isRead: false, senderId: { not: userId } } } } },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 100, // M2: inbox hard cap — prevents memory spike for shoppers with many threads
      });
    }

    res.json(conversations);
  } catch (error) {
    console.error('[messages] getConversations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/messages/:conversationId — get all messages in a thread
export const getThread = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        shopperUser: { select: { id: true, name: true } },
        organizer: { select: { id: true, businessName: true, userId: true } },
        sale: { select: { id: true, title: true } },
      },
    });

    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    // Access check: user must be shopper or organizer in this conversation
    const isOrganizer = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    const ownedByUser = isOrganizer
      ? conversation.organizer.userId === userId
      : conversation.shopperUserId === userId;

    if (!ownedByUser) return res.status(403).json({ message: 'Access denied' });

    const messages = await prisma.message.findMany({
      where: { conversationId },
      include: { sender: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200, // M1: cap thread history — prevents runaway queries on long threads
    });

    // Mark unread messages from the other party as read
    await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true },
    });

    res.json({ conversation, messages });
  } catch (error) {
    console.error('[messages] getThread error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/messages — start or continue a conversation
export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const userId = req.user.id;
    const { organizerId, saleId, body } = req.body;

    if (!organizerId || !body?.trim()) {
      return res.status(400).json({ message: 'organizerId and body are required' });
    }

    // Shoppers send to organizers. Organizers reply via conversationId route.
    // Find or create conversation
    const conversation = await prisma.conversation.upsert({
      where: {
        shopperUserId_organizerId_saleId: {
          shopperUserId: userId,
          organizerId,
          saleId: saleId ?? null,
        },
      },
      update: { lastMessageAt: new Date() },
      create: {
        shopperUserId: userId,
        organizerId,
        saleId: saleId ?? null,
        lastMessageAt: new Date(),
      },
    });

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        body: body.trim(),
      },
      include: { sender: { select: { id: true, name: true } } },
    });

    res.status(201).json({ conversation, message });
  } catch (error) {
    console.error('[messages] sendMessage error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/messages/:conversationId/reply — organizer or shopper replies in thread
export const replyInThread = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { conversationId } = req.params;
    const { body } = req.body;
    const userId = req.user.id;

    if (!body?.trim()) return res.status(400).json({ message: 'body is required' });

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { organizer: { select: { userId: true } } },
    });

    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    const isOrganizer = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    const ownedByUser = isOrganizer
      ? conversation.organizer.userId === userId
      : conversation.shopperUserId === userId;

    if (!ownedByUser) return res.status(403).json({ message: 'Access denied' });

    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          body: body.trim(),
        },
        include: { sender: { select: { id: true, name: true } } },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    // Notify the recipient of the new message
    const recipientId = isOrganizer ? conversation.shopperUserId : conversation.organizer.userId;
    createNotification({
      userId: recipientId,
      type: 'message',
      title: 'New message from ' + message.sender.name,
      body: message.body.substring(0, 100),
      link: `/messages/${conversationId}`,
    }).catch(() => {});

    res.status(201).json(message);
  } catch (error) {
    console.error('[messages] replyInThread error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/messages/unread-count — total unread across all conversations
export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const userId = req.user.id;
    const isOrganizer = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';

    let count: number;

    if (isOrganizer) {
      const organizer = await prisma.organizer.findUnique({ where: { userId } });
      if (!organizer) return res.json({ unread: 0 });

      const conversations = await prisma.conversation.findMany({
        where: { organizerId: organizer.id },
        select: { id: true },
      });
      const ids = conversations.map(c => c.id);

      count = await prisma.message.count({
        where: { conversationId: { in: ids }, senderId: { not: userId }, isRead: false },
      });
    } else {
      const conversations = await prisma.conversation.findMany({
        where: { shopperUserId: userId },
        select: { id: true },
      });
      const ids = conversations.map(c => c.id);

      count = await prisma.message.count({
        where: { conversationId: { in: ids }, senderId: { not: userId }, isRead: false },
      });
    }

    res.json({ unread: count });
  } catch (error) {
    console.error('[messages] getUnreadCount error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
