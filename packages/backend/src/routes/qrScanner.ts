import express from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { recordQRScanEvent, getQRFunnel } from '../controllers/qrScannerController';

const router = express.Router();

// Record a QR scan event (optional authentication)
router.post('/event', optionalAuthenticate, recordQRScanEvent);

// Get QR funnel analytics for a sale (organizer only)
router.get('/funnel', authenticate, getQRFunnel);

export default router;
