import { Router } from 'express';
import {
  registerBegin,
  registerComplete,
  authenticateBegin,
  authenticateComplete,
  deletePasskey,
  listPasskeys,
} from '../controllers/passkeyController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Registration flow — requires authentication
router.post('/register/begin', authenticate, registerBegin);
router.post('/register/complete', authenticate, registerComplete);

// Authentication flow — public
router.post('/authenticate/begin', authenticateBegin);
router.post('/authenticate/complete', authenticateComplete);

// Management — requires authentication
router.get('/list', authenticate, listPasskeys);
router.delete('/:credentialId', authenticate, deletePasskey);

export default router;
