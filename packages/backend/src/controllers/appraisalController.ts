import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  createRequest,
  addPhotoUrl,
  submitResponse,
  calculateConsensus,
  getRequest,
  getRequestsBySubmitter,
  getOpenRequests,
  voteOnResponse,
} from '../services/appraisalService';
import { spendXp, XP_SINKS } from '../services/xpService';
import { prisma } from '../lib/prisma';

/**
 * POST /api/appraisals
 * Create a new appraisal request
 * Auth required: USER+
 *
 * Pricing:
 * - PRO/TEAMS tier: free (included in plan)
 * - SIMPLE (FREE) tier: costs 50 XP per appraisal request
 */
export const createAppraisalRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { itemTitle, itemDescription, itemCategory, photoUrls } = req.body;

    // Validate required fields
    if (!itemTitle || typeof itemTitle !== 'string') {
      return res.status(400).json({ message: 'itemTitle is required' });
    }

    if (!Array.isArray(photoUrls) || photoUrls.length < 1 || photoUrls.length > 5) {
      return res.status(400).json({
        message: 'Must provide between 1 and 5 photo URLs',
      });
    }

    // Fetch full user record to check subscription tier
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        guildXp: true,
        roleSubscriptions: {
          where: { role: 'SHOPPER' },
          select: { subscriptionTier: true },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const APPRAISAL_XP_COST = 50;

    // All tiers pay XP for appraisals
    if (user.guildXp < APPRAISAL_XP_COST) {
      return res.status(402).json({
        message: `Insufficient XP. Need ${APPRAISAL_XP_COST} XP to request appraisal.`,
        required: APPRAISAL_XP_COST,
        current: user.guildXp,
        cost: APPRAISAL_XP_COST,
      });
    }

    const spendSuccess = await spendXp(
      req.user.id,
      APPRAISAL_XP_COST,
      'APPRAISAL_REQUEST',
      {
        description: `Appraisal request for: ${itemTitle}`,
      }
    );

    if (!spendSuccess) {
      return res.status(402).json({
        message: 'Failed to deduct XP. Please check your balance and try again.',
        cost: APPRAISAL_XP_COST,
      });
    }

    // Create request
    const request = await createRequest(req.user.id, {
      itemTitle,
      itemDescription,
      itemCategory,
    });

    // Add photos
    for (const photoUrl of photoUrls) {
      if (typeof photoUrl !== 'string') {
        return res.status(400).json({
          message: 'All photo URLs must be strings',
        });
      }
      await addPhotoUrl(request.id, photoUrl);
    }

    res.status(201).json({
      id: request.id,
      status: 'PENDING',
      expiresAt: request.expiresAt,
      message: 'Appraisal request created. Community members can submit estimates.',
      xpDeducted: userSubscriptionTier === 'SIMPLE' ? APPRAISAL_XP_COST : 0,
      tier: userSubscriptionTier,
    });
  } catch (error) {
    console.error('[Appraisal] Failed to create request:', error);
    res.status(500).json({ message: 'Failed to create appraisal request' });
  }
};

/**
 * GET /api/appraisals/:requestId
 * Fetch a specific appraisal request with responses and consensus
 * Auth required: Requester or admin only
 */
export const getAppraisalRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { requestId } = req.params;
    const request = await getRequest(requestId);

    if (!request) {
      return res.status(404).json({ message: 'Appraisal request not found' });
    }

    // Check permission: only requester or admin can view
    if (req.user.id !== request.submittedByUserId && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        message: 'You do not have permission to view this request',
      });
    }

    res.json(request);
  } catch (error) {
    console.error('[Appraisal] Failed to fetch request:', error);
    res.status(500).json({ message: 'Failed to fetch appraisal request' });
  }
};

/**
 * POST /api/appraisals/:requestId/responses
 * Submit a community response to an appraisal request
 * Auth required: USER+
 */
export const submitAppraisalResponse = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { requestId } = req.params;
    const { estimatedLow, estimatedHigh, expertise, reasoning } = req.body;

    // Validate required fields
    if (
      typeof estimatedLow !== 'number' ||
      typeof estimatedHigh !== 'number'
    ) {
      return res.status(400).json({
        message: 'estimatedLow and estimatedHigh must be numbers (cents)',
      });
    }

    if (!reasoning || typeof reasoning !== 'string' || reasoning.length < 50) {
      return res.status(400).json({
        message: 'reasoning is required and must be at least 50 characters',
      });
    }

    // Verify request exists
    const request = await getRequest(requestId);
    if (!request) {
      return res.status(404).json({ message: 'Appraisal request not found' });
    }

    // Submit response (will fail with 409 if user already responded)
    try {
      const response = await submitResponse(requestId, req.user.id, {
        estimatedLow,
        estimatedHigh,
        expertise,
        reasoning,
      });

      // Check if we should calculate consensus (5+ responses)
      if (request.communityResponses.length + 1 >= 5) {
        await calculateConsensus(requestId);
      }

      res.status(201).json({
        id: response.id,
        status: 'POSTED',
        helpfulVotes: 0,
        notHelpfulVotes: 0,
      });
    } catch (error: any) {
      if (
        error.message?.includes('Unique constraint failed') ||
        error.code === 'P2002'
      ) {
        return res.status(409).json({
          message: 'You have already submitted a response for this request',
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('[Appraisal] Failed to submit response:', error);
    res.status(500).json({ message: 'Failed to submit appraisal response' });
  }
};

/**
 * GET /api/appraisals/my
 * List all appraisal requests submitted by the authenticated user
 * Auth required: USER+
 */
export const getMyAppraisalRequests = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;

    const { requests, total } = await getRequestsBySubmitter(
      req.user.id,
      limit,
      offset
    );

    res.json({
      requests,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error('[Appraisal] Failed to fetch user requests:', error);
    res.status(500).json({ message: 'Failed to fetch appraisal requests' });
  }
};

/**
 * GET /api/appraisals
 * Public feed of open appraisal requests for community appraisers
 * No auth required
 */
export const getOpenAppraisalsForCommunity = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;

    const { requests, total } = await getOpenRequests(limit, offset);

    res.json({
      requests,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error('[Appraisal] Failed to fetch open requests:', error);
    res.status(500).json({ message: 'Failed to fetch appraisal requests' });
  }
};

/**
 * POST /api/appraisals/:requestId/responses/:responseId/vote
 * Vote on a community response (helpful/not helpful)
 * Auth required: USER+
 */
export const voteAppraisalResponse = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { responseId } = req.params;
    const { helpful } = req.body;

    if (typeof helpful !== 'boolean') {
      return res.status(400).json({
        message: 'helpful must be a boolean',
      });
    }

    const result = await voteOnResponse(responseId, helpful);

    res.json(result);
  } catch (error) {
    console.error('[Appraisal] Failed to vote on response:', error);
    res.status(500).json({ message: 'Failed to vote on appraisal response' });
  }
};
