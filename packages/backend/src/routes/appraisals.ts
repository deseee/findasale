import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import {
  createAppraisalRequest,
  getAppraisalRequest,
  submitAppraisalResponse,
  getMyAppraisalRequests,
  getOpenAppraisalsForCommunity,
  voteAppraisalResponse,
} from '../controllers/appraisalController';

const router = Router();

// GET /api/appraisals — public feed of open appraisal requests for community
router.get('/', getOpenAppraisalsForCommunity);

// POST /api/appraisals — create new appraisal request (PAID_ADDON tier required)
router.post('/', authenticate, requireTier('PAID_ADDON'), createAppraisalRequest);

// GET /api/appraisals/my — get user's own appraisal requests (auth required)
router.get('/my', authenticate, getMyAppraisalRequests);

// GET /api/appraisals/:requestId — get specific appraisal request (auth required)
router.get('/:requestId', authenticate, getAppraisalRequest);

// POST /api/appraisals/:requestId/responses — submit community response (auth required)
router.post('/:requestId/responses', authenticate, submitAppraisalResponse);

// POST /api/appraisals/:requestId/responses/:responseId/vote — vote on response (auth required)
router.post(
  '/:requestId/responses/:responseId/vote',
  authenticate,
  voteAppraisalResponse
);

export default router;
