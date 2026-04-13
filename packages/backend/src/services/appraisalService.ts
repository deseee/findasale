import { prisma } from '../lib/prisma';
import { awardXp, checkDailyXpCap } from './xpService';

/**
 * Appraisal Service — Feature #54: Crowdsourced Appraisal API
 * Manages appraisal requests, community responses, and consensus calculation
 */

export interface CreateRequestInput {
  itemTitle: string;
  itemDescription?: string;
  itemCategory?: string;
}

export interface SubmitResponseInput {
  estimatedLow: number;
  estimatedHigh: number;
  expertise?: string;
  reasoning: string;
}

/**
 * Create a new appraisal request
 * Sets expiry to 30 days from now
 */
export const createRequest = async (
  submitterId: string,
  data: CreateRequestInput
) => {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const request = await prisma.appraisalRequest.create({
      data: {
        submittedByUserId: submitterId,
        itemTitle: data.itemTitle,
        itemDescription: data.itemDescription,
        itemCategory: data.itemCategory,
        status: 'PENDING',
        expiresAt,
      },
    });

    return request;
  } catch (error) {
    console.error('[AppraisalService] Failed to create request:', error);
    throw error;
  }
};

/**
 * Add a photo URL to an appraisal request
 */
export const addPhotoUrl = async (
  requestId: string,
  cloudinaryUrl: string
) => {
  try {
    const photo = await prisma.appraisalPhoto.create({
      data: {
        requestId,
        cloudinaryUrl,
      },
    });

    return photo;
  } catch (error) {
    console.error('[AppraisalService] Failed to add photo:', error);
    throw error;
  }
};

/**
 * Submit a community response to an appraisal request
 * One response per user per request (enforced by DB unique constraint)
 */
export const submitResponse = async (
  requestId: string,
  responderId: string,
  data: SubmitResponseInput
) => {
  try {
    // Validate reasoning length
    if (!data.reasoning || data.reasoning.length < 50) {
      throw new Error('Reasoning must be at least 50 characters');
    }

    // Validate price range
    if (data.estimatedLow < 0 || data.estimatedHigh < 0) {
      throw new Error('Estimated prices must be non-negative');
    }

    if (data.estimatedLow > data.estimatedHigh) {
      throw new Error('Estimated low cannot exceed estimated high');
    }

    const response = await prisma.appraisalResponse.create({
      data: {
        requestId,
        responderId,
        estimatedLow: data.estimatedLow,
        estimatedHigh: data.estimatedHigh,
        confidence: 'COMMUNITY',
        expertise: data.expertise,
        reasoning: data.reasoning,
      },
    });

    return response;
  } catch (error) {
    console.error('[AppraisalService] Failed to submit response:', error);
    throw error;
  }
};

/**
 * Calculate consensus from community responses
 * Triggers when request has ≥5 responses
 * Median = (sum of all lows + sum of all highs) / (2 * count)
 * Confidence = min(((responseCount - 5) * 5), 100)
 *
 * P0 SECURITY FIX: Award 20 XP to each responder, with a daily cap of 5 selections (100 XP/day)
 */
export const calculateConsensus = async (requestId: string) => {
  try {
    // Fetch all responses for this request
    const responses = await prisma.appraisalResponse.findMany({
      where: { requestId },
    });

    if (responses.length < 5) {
      console.log(
        `[AppraisalService] Request ${requestId} has only ${responses.length} responses, skipping consensus`
      );
      return null;
    }

    // Calculate median
    const totalLow = responses.reduce((sum, r) => sum + r.estimatedLow, 0);
    const totalHigh = responses.reduce((sum, r) => sum + r.estimatedHigh, 0);
    const finalLow = Math.round(totalLow / responses.length);
    const finalHigh = Math.round(totalHigh / responses.length);

    // Calculate confidence score
    const confidenceScore = Math.min((responses.length - 5) * 5, 100);

    // Create consensus record
    const consensus = await prisma.appraisalConsensus.create({
      data: {
        requestId,
        finalLow,
        finalHigh,
        confidenceScore,
        methodology: 'COMMUNITY_CONSENSUS',
        responseCount: responses.length,
      },
    });

    // Update request status to COMPLETED
    await prisma.appraisalRequest.update({
      where: { id: requestId },
      data: { status: 'COMPLETED' },
    });

    // Award XP to each responder (20 XP per selection, capped at 5 selections/day = 100 XP/day)
    const XP_AWARD_AMOUNT = 20;
    const awardedResponders: string[] = [];
    const cappedResponders: string[] = [];

    for (const response of responses) {
      try {
        // Check daily cap for this responder
        const remainingDaily = await checkDailyXpCap(response.responderId, 'APPRAISAL_SELECTED');

        if (remainingDaily >= XP_AWARD_AMOUNT) {
          // Award XP
          await awardXp(response.responderId, 'APPRAISAL_SELECTED', XP_AWARD_AMOUNT, {
            description: `Appraisal response selected in consensus for request ${requestId}`,
          });
          awardedResponders.push(response.responderId);
        } else {
          // Daily cap reached
          cappedResponders.push(response.responderId);
        }
      } catch (xpError) {
        console.error(
          `[AppraisalService] Failed to award XP to responder ${response.responderId}:`,
          xpError
        );
        // Continue with other responders even if one fails
      }
    }

    console.log(
      `[AppraisalService] Consensus calculated for request ${requestId}: $${finalLow}–$${finalHigh}, confidence ${confidenceScore}%. XP awarded to ${awardedResponders.length} responders${cappedResponders.length > 0 ? `, ${cappedResponders.length} hit daily cap` : ''}.`
    );

    return consensus;
  } catch (error) {
    console.error('[AppraisalService] Failed to calculate consensus:', error);
    throw error;
  }
};

/**
 * Fetch a full appraisal request with photos, responses, and consensus
 */
export const getRequest = async (requestId: string) => {
  try {
    const request = await prisma.appraisalRequest.findUnique({
      where: { id: requestId },
      include: {
        photos: true,
        communityResponses: {
          include: {
            responder: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        consensus: true,
        aiAppraisalRequest: {
          select: {
            id: true,
            paymentStatus: true,
            completedAt: true,
          },
        },
      },
    });

    return request;
  } catch (error) {
    console.error('[AppraisalService] Failed to fetch request:', error);
    throw error;
  }
};

/**
 * Get all appraisal requests submitted by a user (with pagination)
 */
export const getRequestsBySubmitter = async (
  userId: string,
  limit: number = 20,
  offset: number = 0
) => {
  try {
    const [requests, total] = await Promise.all([
      prisma.appraisalRequest.findMany({
        where: { submittedByUserId: userId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          photos: { select: { cloudinaryUrl: true } },
          consensus: {
            select: {
              finalLow: true,
              finalHigh: true,
              confidenceScore: true,
            },
          },
          communityResponses: {
            select: { id: true },
          },
        },
      }),
      prisma.appraisalRequest.count({
        where: { submittedByUserId: userId },
      }),
    ]);

    return { requests, total };
  } catch (error) {
    console.error(
      '[AppraisalService] Failed to fetch requests by submitter:',
      error
    );
    throw error;
  }
};

/**
 * Get open appraisal requests for the community (public feed)
 * Returns PENDING or IN_REVIEW requests for community appraisers
 */
export const getOpenRequests = async (limit: number = 20, offset: number = 0) => {
  try {
    const [requests, total] = await Promise.all([
      prisma.appraisalRequest.findMany({
        where: {
          status: {
            in: ['PENDING', 'IN_REVIEW'],
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          photos: { select: { cloudinaryUrl: true }, take: 1 },
          submittedBy: {
            select: { name: true },
          },
          communityResponses: {
            select: { id: true },
          },
        },
      }),
      prisma.appraisalRequest.count({
        where: {
          status: {
            in: ['PENDING', 'IN_REVIEW'],
          },
        },
      }),
    ]);

    return { requests, total };
  } catch (error) {
    console.error('[AppraisalService] Failed to fetch open requests:', error);
    throw error;
  }
};

/**
 * Vote on a community response (helpful/not helpful)
 */
export const voteOnResponse = async (
  responseId: string,
  helpful: boolean
) => {
  try {
    const response = await prisma.appraisalResponse.findUnique({
      where: { id: responseId },
    });

    if (!response) {
      throw new Error('Response not found');
    }

    const updated = await prisma.appraisalResponse.update({
      where: { id: responseId },
      data: {
        helpfulVotes: helpful ? response.helpfulVotes + 1 : response.helpfulVotes,
        notHelpfulVotes: !helpful
          ? response.notHelpfulVotes + 1
          : response.notHelpfulVotes,
      },
    });

    return {
      helpfulVotes: updated.helpfulVotes,
      notHelpfulVotes: updated.notHelpfulVotes,
    };
  } catch (error) {
    console.error('[AppraisalService] Failed to vote on response:', error);
    throw error;
  }
};
