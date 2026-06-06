import { Router } from 'express';
import { createTestimonial } from '../controllers/testimonialController';
import { authenticate } from '../middleware/auth';

const router = Router();

// POST /api/testimonials — authenticated organizer testimonial capture
router.post('/', authenticate, createTestimonial);

export default router;
