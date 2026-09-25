import { Router } from 'express';
import {
  listIntakeAppointments,
  createIntakeAppointment,
  updateIntakeAppointment,
  cancelIntakeAppointment,
} from '../controllers/intakeAppointmentController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication + TEAMS (TEAMS check lives in each handler).
router.use(authenticate);

router.get('/', listIntakeAppointments);
router.post('/', createIntakeAppointment);
router.put('/:id', updateIntakeAppointment);
// Soft-cancel only -- never a hard delete (see cancelIntakeAppointment).
router.delete('/:id', cancelIntakeAppointment);

export default router;
