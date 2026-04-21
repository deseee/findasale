import express from 'express';
import { authenticate, requireOrganizer } from '../middleware/auth';
import {
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  transferItems,
  getLocationInventory,
} from '../controllers/locationController';

// #311: Multi-Location Inventory View — location management routes

const router = express.Router();

// All routes require authentication and ORGANIZER role
router.use(authenticate, requireOrganizer);

// GET /api/locations — list locations for workspace
router.get('/', listLocations);

// POST /api/locations — create new location
router.post('/', createLocation);

// PUT /api/locations/:id — update location
router.put('/:id', updateLocation);

// DELETE /api/locations/:id — delete location
router.delete('/:id', deleteLocation);

// POST /api/locations/:id/transfer — bulk transfer items
router.post('/:id/transfer', transferItems);

// GET /api/locations/:id/inventory — get items at location
router.get('/:id/inventory', getLocationInventory);

export default router;
