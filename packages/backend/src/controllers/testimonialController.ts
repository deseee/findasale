/**
 * Testimonial Controller — Outward Email Automation #2a capture endpoint.
 *
 * Receives organizer testimonials submitted from the on-site /testimonial page
 * (linked from the post-sale recap + testimonial-ask emails). Stores them PENDING
 * for later admin moderation (admin approval UI is a follow-up — see report).
 */

import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const testimonialSchema = z.object({
  body: z.string().min(3, 'Please share a few words.').max(2000, 'Please keep it under 2000 characters.'),
  rating: z.number().int().min(1).max(5).optional(),
  saleId: z.string().optional(),
});

// POST /api/testimonials — authenticated organizer submits a testimonial
export const createTestimonial = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Authentication required.' });

    const data = testimonialSchema.parse(req.body);

    // Resolve organizerId + validate saleId ownership if provided
    let organizerId: string | null = null;
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (organizer) organizerId = organizer.id;

    let saleId: string | null = null;
    if (data.saleId) {
      const sale = await prisma.sale.findUnique({
        where: { id: data.saleId },
        select: { id: true, organizerId: true },
      });
      // Only attach the sale if it belongs to this organizer (avoid spoofed IDs).
      if (sale && organizerId && sale.organizerId === organizerId) {
        saleId = sale.id;
      }
    }

    const testimonial = await prisma.testimonial.create({
      data: {
        userId,
        organizerId,
        saleId,
        rating: data.rating ?? null,
        body: data.body,
        status: 'PENDING',
      },
      select: { id: true, status: true },
    });

    return res.status(201).json({
      message: 'Thank you — your testimonial has been received.',
      testimonial,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('[testimonial] create error:', error);
    return res.status(500).json({ message: 'Failed to submit testimonial. Please try again.' });
  }
};
