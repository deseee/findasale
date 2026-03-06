import { Router } from 'express';
import {
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplate,
} from '../controllers/templateController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All template routes require authentication
router.use(authenticate);

// CRUD operations
router.post('/', createTemplate);
router.get('/', listTemplates);
router.get('/:id', getTemplate);
router.patch('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);

// Apply template to create new sale
router.post('/:id/apply', applyTemplate);

export default router;
