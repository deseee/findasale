import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export const getBrandFollows = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    if (!req.user || req.user.id !== userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    const brandFollows = await prisma.brandFollow.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, brandName: true, notifyEmail: true, notifyPush: true, createdAt: true },
    });
    res.json(brandFollows);
  } catch (error) {
    console.error('Error fetching brand follows:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const addBrandFollow = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { brandName } = req.body;
    if (!req.user || req.user.id !== userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    if (!brandName || typeof brandName !== 'string' || !brandName.trim()) {
      return res.status(400).json({ message: 'Brand name is required' });
    }
    const trimmed = brandName.trim();
    const existing = await prisma.brandFollow.findUnique({
      where: { userId_brandName: { userId, brandName: trimmed } },
    });
    if (existing) {
      return res.status(400).json({ message: 'Already following this brand' });
    }
    const follow = await prisma.brandFollow.create({
      data: { userId, brandName: trimmed },
      select: { id: true, brandName: true, notifyEmail: true, notifyPush: true, createdAt: true },
    });
    res.status(201).json(follow);
  } catch (error) {
    console.error('Error adding brand follow:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const removeBrandFollow = async (req: AuthRequest, res: Response) => {
  try {
    const { userId, brandFollowId } = req.params;
    if (!req.user || req.user.id !== userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    const follow = await prisma.brandFollow.findUnique({ where: { id: brandFollowId } });
    if (!follow || follow.userId !== userId) {
      return res.status(404).json({ message: 'Not found' });
    }
    await prisma.brandFollow.delete({ where: { id: brandFollowId } });
    res.json({ message: 'Removed' });
  } catch (error) {
    console.error('Error removing brand follow:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
