import { Router } from 'express';
import { 
  createTrail, 
  getTrail, 
  listTrails, 
  addStop, 
  searchNearby, 
  checkInAtStop, 
  postStopPhoto, 
  rateTrail, 
  updateTrail, 
  deleteTrail 
} from '../controllers/trailController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Trail CRUD
router.post('/', authenticate, createTrail);                            // POST   /api/trails
router.get('/:trailId', getTrail);                                      // GET    /api/trails/:trailId (public or auth)
router.get('/', listTrails);                                            // GET    /api/trails (public)
router.patch('/:trailId', authenticate, updateTrail);                   // PATCH  /api/trails/:trailId (organizer)
router.delete('/:trailId', authenticate, deleteTrail);                  // DELETE /api/trails/:trailId (organizer)

// Trail stops
router.post('/:trailId/stops', authenticate, addStop);                  // POST   /api/trails/:trailId/stops (organizer)
router.get('/:trailId/search-nearby', authenticate, searchNearby);      // GET    /api/trails/:trailId/search-nearby (organizer)

// Shopper interactions
router.post('/:trailId/stops/:stopId/checkin', authenticate, checkInAtStop);       // POST /api/trails/:trailId/stops/:stopId/checkin
router.post('/:trailId/stops/:stopId/photo', authenticate, postStopPhoto);         // POST /api/trails/:trailId/stops/:stopId/photo
router.post('/:trailId/rate', authenticate, rateTrail);                            // POST /api/trails/:trailId/rate

export default router;
