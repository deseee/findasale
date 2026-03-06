import { Router } from 'express';
import {
  createTemplate,
  getTemplates,
  updateTemplate,
  deleteTemplate,
  trackTemplateUse,
} from '../controllers/templateController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All template routes require authentication
router.use(authenticate);

// CRUD operations
router.post('/', createTemplate);
router.get('/', getTemplates);
router.patch('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);
router.post('/:id/use', trackTemplateUse);

export default router;
