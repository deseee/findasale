import { Router } from 'express';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate, trackTemplateUse } from '../controllers/templateController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getTemplates);
router.post('/', authenticate, createTemplate);
router.put('/:id', authenticate, updateTemplate);
router.delete('/:id', authenticate, deleteTemplate);
router.post('/:id/use', authenticate, trackTemplateUse);

export default router;
