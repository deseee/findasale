/**
 * Consignor Self-Serve Intake — Appointments (2026-09-25)
 *
 * Lightweight appointment scheduling for consignor intake drop-off/consult. V1 display is
 * a plain day-grouped chronological list (frontend concern) -- this controller just returns
 * appointments ordered by startsAt. Same auth + TEAMS gating as the rest of the Consignor
 * feature set (see consignorController.ts / consignorIntakeController.ts).
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getOrganizerWorkspace } from './consignorController';

const VALID_STATUSES = ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

/**
 * GET /api/intake-appointments?from=&to=&status=
 */
export const listIntakeAppointments = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }
    const { organizer, workspace } = result;

    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const { from, to, status } = req.query;

    const where: any = { workspaceId: workspace.id };

    if (status !== undefined) {
      const statusStr = String(status).toUpperCase();
      if (!VALID_STATUSES.includes(statusStr)) {
        return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` });
      }
      where.status = statusStr;
    }

    if (from !== undefined || to !== undefined) {
      where.startsAt = {};
      if (from !== undefined) {
        const fromDate = new Date(String(from));
        if (isNaN(fromDate.getTime())) {
          return res.status(400).json({ error: 'from must be a valid date' });
        }
        where.startsAt.gte = fromDate;
      }
      if (to !== undefined) {
        const toDate = new Date(String(to));
        if (isNaN(toDate.getTime())) {
          return res.status(400).json({ error: 'to must be a valid date' });
        }
        where.startsAt.lte = toDate;
      }
    }

    const appointments = await prisma.consignorIntakeAppointment.findMany({
      where,
      include: {
        consignor: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { startsAt: 'asc' },
    });

    return res.status(200).json(appointments);
  } catch (error) {
    console.error('[listIntakeAppointments] Error:', error);
    return res.status(500).json({ error: 'Failed to list appointments' });
  }
};

/**
 * POST /api/intake-appointments
 * Body: { consignorId?, contactName (required if no consignorId), contactEmail?,
 *         contactPhone?, startsAt, endsAt?, notes? }
 * Staff-booked (phone/walk-in) ⇒ created CONFIRMED, createdBy ORGANIZER.
 */
export const createIntakeAppointment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }
    const { organizer, workspace } = result;

    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const { consignorId, contactName, contactEmail, contactPhone, startsAt, endsAt, notes } = req.body;

    let resolvedContactName: string;
    if (consignorId) {
      // Scoped to this organizer's workspace -- a client can never book an appointment
      // against another organizer's consignor.
      const consignor = await prisma.consignor.findFirst({
        where: { id: consignorId, workspaceId: workspace.id },
        select: { id: true, name: true },
      });
      if (!consignor) {
        return res.status(404).json({ error: 'Consignor not found' });
      }
      resolvedContactName = consignor.name;
    } else {
      if (!contactName || typeof contactName !== 'string' || !contactName.trim()) {
        return res.status(400).json({ error: 'contactName is required when consignorId is omitted' });
      }
      resolvedContactName = contactName.trim();
    }

    if (!startsAt) {
      return res.status(400).json({ error: 'startsAt is required' });
    }
    const parsedStartsAt = new Date(startsAt);
    if (isNaN(parsedStartsAt.getTime())) {
      return res.status(400).json({ error: 'startsAt must be a valid date' });
    }

    let parsedEndsAt: Date | null = null;
    if (endsAt !== undefined && endsAt !== null && endsAt !== '') {
      parsedEndsAt = new Date(endsAt);
      if (isNaN(parsedEndsAt.getTime())) {
        return res.status(400).json({ error: 'endsAt must be a valid date' });
      }
      if (parsedEndsAt.getTime() < parsedStartsAt.getTime()) {
        return res.status(400).json({ error: 'endsAt must be on or after startsAt' });
      }
    }

    const appointment = await prisma.consignorIntakeAppointment.create({
      data: {
        workspaceId: workspace.id,
        consignorId: consignorId || null,
        contactName: resolvedContactName,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        startsAt: parsedStartsAt,
        endsAt: parsedEndsAt,
        notes: notes || null,
        status: 'CONFIRMED',
        createdBy: 'ORGANIZER',
      },
      include: {
        consignor: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    return res.status(201).json(appointment);
  } catch (error) {
    console.error('[createIntakeAppointment] Error:', error);
    return res.status(500).json({ error: 'Failed to create appointment' });
  }
};

/**
 * PUT /api/intake-appointments/:id
 * Body: any of { startsAt, endsAt, status, notes, consignorId }
 */
export const updateIntakeAppointment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }
    const { organizer, workspace } = result;

    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const existing = await prisma.consignorIntakeAppointment.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const { startsAt, endsAt, status, notes, consignorId } = req.body;
    const updateData: any = {};

    if (startsAt !== undefined) {
      const parsed = new Date(startsAt);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'startsAt must be a valid date' });
      }
      updateData.startsAt = parsed;
    }

    if (endsAt !== undefined) {
      if (endsAt === null || endsAt === '') {
        updateData.endsAt = null;
      } else {
        const parsed = new Date(endsAt);
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({ error: 'endsAt must be a valid date' });
        }
        updateData.endsAt = parsed;
      }
    }

    if (status !== undefined) {
      const statusStr = String(status).toUpperCase();
      if (!VALID_STATUSES.includes(statusStr)) {
        return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` });
      }
      updateData.status = statusStr;
    }

    if (notes !== undefined) {
      updateData.notes = notes || null;
    }

    if (consignorId !== undefined) {
      if (consignorId === null) {
        updateData.consignorId = null;
      } else {
        const consignor = await prisma.consignor.findFirst({
          where: { id: consignorId, workspaceId: workspace.id },
          select: { id: true },
        });
        if (!consignor) {
          return res.status(404).json({ error: 'Consignor not found' });
        }
        updateData.consignorId = consignorId;
      }
    }

    const updated = await prisma.consignorIntakeAppointment.update({
      where: { id: existing.id },
      data: updateData,
      include: {
        consignor: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    return res.status(200).json(updated);
  } catch (error) {
    console.error('[updateIntakeAppointment] Error:', error);
    return res.status(500).json({ error: 'Failed to update appointment' });
  }
};

/**
 * DELETE /api/intake-appointments/:id
 * Soft-cancel only (status: CANCELLED) -- never a hard delete, so the record stays for
 * history/audit even once cancelled.
 */
export const cancelIntakeAppointment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }
    const { organizer, workspace } = result;

    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const existing = await prisma.consignorIntakeAppointment.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const updated = await prisma.consignorIntakeAppointment.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED' },
    });

    return res.status(200).json(updated);
  } catch (error) {
    console.error('[cancelIntakeAppointment] Error:', error);
    return res.status(500).json({ error: 'Failed to cancel appointment' });
  }
};
