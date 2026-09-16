import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { paymentLimiter } from '../middleware/rateLimiter';
import { createGuestInvoice, lookupRecipientForInvoice } from '../controllers/guestInvoiceController';

const router = Router();

// Read-only, not rate-limited like the money-moving send below -- drives the send-invoice
// form's phone auto-fill as the organizer types an email (2026-09-16 follow-up).
router.get('/lookup-recipient', authenticate, lookupRecipientForInvoice);

// Organizer-only, PRO/TEAMS-gated (enforced inside the controller, same as every other
// tier-gated endpoint in this codebase -- see guestInvoiceController.ts). paymentLimiter
// mirrors pos.ts's own money-moving endpoints (payment-request, manual-card-payment).
router.post('/', authenticate, paymentLimiter, createGuestInvoice);

export default router;
