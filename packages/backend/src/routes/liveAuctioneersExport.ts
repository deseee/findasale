import { Router } from 'express';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { exportLiveAuctioneersCsv } from '../controllers/liveAuctioneersExportController';

// LiveAuctioneers lot-upload spreadsheet export. LiveAuctioneers has no self-serve API —
// organizers who already have their own LiveAuctioneers account upload a catalog spreadsheet
// through LiveAuctioneers' own web tool. This route only generates that file from the
// organizer's own FindA.Sale inventory; nothing here ever calls liveauctioneers.com.
// See services/liveAuctioneersExportService.ts's file header for full context.
const router = Router();

router.get('/export', authenticate, requireOrganizer, exportLiveAuctioneersCsv);

export default router;
