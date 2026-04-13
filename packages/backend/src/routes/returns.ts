import express from 'express';
import { authenticate } from '../middleware/auth';
import { requestReturnHandler, resolveReturnHandler, getReturnRequests } from '../controllers/returnController';

const router = express.Router();

router.post('/request', authenticate, requestReturnHandler);
router.patch('/:id/resolve', authenticate, resolveReturnHandler);
router.get('/my-returns', authenticate, getReturnRequests);

export default router;
