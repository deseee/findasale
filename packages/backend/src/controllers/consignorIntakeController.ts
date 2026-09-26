/**
 * Consignor Self-Serve Intake — feature (2026-09-25)
 *
 * A self-serve way for a prospective consignor to request to bring items in, plus
 * lightweight appointment scheduling for intake. Deliberately does NOT let a prospective
 * consignor touch inventory/uploads directly -- the organizer photo→AI-tag→review-queue
 * gate is entirely untouched. `message` on the public form is a single free-text note,
 * never structured items or photos.
 *
 * Product decisions (Architect pass, 2026-09-25 -- all reversible, non-money defaults):
 * 1. Approve-then-create: a ConsignorIntakeRequest sits as its own record; a real Consignor
 *    is only created (via createConsignorCore, shared with the manual "Add Consignor" form)
 *    when the organizer clicks Approve.
 * 2. One persistent, reusable intake link per workspace (WorkspaceSettings.intakeLinkToken),
 *    not a one-time invite per person -- rotatable if it leaks.
 * 3. Declining a request does NOT auto-notify the prospective consignor.
 * 4. New-request notifications go to the workspace owner's account email only (V1).
 *
 * Auth/tier gating mirrors consignorController.ts throughout: authenticate + workspace
 * lookup + subscriptionTier === 'TEAMS'.
 */

import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { randomBytes } from 'crypto';
import { getOrganizerWorkspace, createConsignorCore, ConsignorValidationError } from './consignorController';
import { sendConsignorIntakeRequestNotice } from '../services/consignorEmailService';
import { ConsignorIntakeAppointment } from '@prisma/client';

const siteUrl = process.env.FRONTEND_URL || 'https://finda.sale';

function generateIntakeLinkToken(): string {
  // Unguessable, permanent-until-rotated capability token -- same role as
  // Consignor.portalToken, just generated in code (WorkspaceSettings.intakeLinkToken has
  // no @default in schema.prisma since it must stay null until first requested).
  return randomBytes(24).toString('hex');
}

function intakeLinkUrl(token: string): string {
  return `${siteUrl}/consign/${token}`;
}

/**
 * Resolve the workspace owner's own account email (User.email via Organizer.user) --
 * deliberately NOT any per-consignor or per-team-member address. V1 sends new-request
 * notifications to this address only.
 */
async function getWorkspaceOwnerContact(workspaceId: string): Promise<{ email: string; businessName: string } | null> {
  const workspace = await prisma.organizerWorkspace.findUnique({
    where: { id: workspaceId },
    select: { owner: { select: { businessName: true, user: { select: { email: true } } } } },
  });
  if (!workspace?.owner?.user?.email) return null;
  return { email: workspace.owner.user.email, businessName: workspace.owner.businessName };
}

// ---------------------------------------------------------------------------
// Link management (authenticated, TEAMS)
// ---------------------------------------------------------------------------

/**
 * GET /api/consignor-intake/link
 * Generates a token on first call if none exists yet.
 */
export const getIntakeLink = async (req: AuthRequest, res: Response) => {
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

    let settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId: workspace.id } });

    if (!settings?.intakeLinkToken) {
      const token = generateIntakeLinkToken();
      settings = await prisma.workspaceSettings.upsert({
        where: { workspaceId: workspace.id },
        create: { workspaceId: workspace.id, intakeLinkToken: token },
        update: { intakeLinkToken: token },
      });
    }

    return res.status(200).json({
      url: intakeLinkUrl(settings.intakeLinkToken!),
      token: settings.intakeLinkToken,
      enabled: settings.intakeLinkEnabled,
    });
  } catch (error) {
    console.error('[getIntakeLink] Error:', error);
    return res.status(500).json({ error: 'Failed to load intake link' });
  }
};

/**
 * PATCH /api/consignor-intake/link
 * Body: { enabled: boolean } -- organizer kill switch. Keeps the token, just stops the
 * public endpoints from accepting submissions while false.
 */
export const updateIntakeLink = async (req: AuthRequest, res: Response) => {
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

    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) required' });
    }

    const existing = await prisma.workspaceSettings.findUnique({ where: { workspaceId: workspace.id } });
    const token = existing?.intakeLinkToken || generateIntakeLinkToken();

    const settings = await prisma.workspaceSettings.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, intakeLinkToken: token, intakeLinkEnabled: enabled },
      update: {
        intakeLinkEnabled: enabled,
        ...(existing?.intakeLinkToken ? {} : { intakeLinkToken: token }),
      },
    });

    return res.status(200).json({
      url: intakeLinkUrl(settings.intakeLinkToken!),
      token: settings.intakeLinkToken,
      enabled: settings.intakeLinkEnabled,
    });
  } catch (error) {
    console.error('[updateIntakeLink] Error:', error);
    return res.status(500).json({ error: 'Failed to update intake link' });
  }
};

/**
 * POST /api/consignor-intake/link/rotate
 * Fresh token -- the old link stops working immediately (it no longer matches any
 * WorkspaceSettings.intakeLinkToken row).
 */
export const rotateIntakeLink = async (req: AuthRequest, res: Response) => {
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

    const token = generateIntakeLinkToken();
    const settings = await prisma.workspaceSettings.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, intakeLinkToken: token },
      update: { intakeLinkToken: token },
    });

    return res.status(200).json({
      url: intakeLinkUrl(settings.intakeLinkToken!),
      token: settings.intakeLinkToken,
      enabled: settings.intakeLinkEnabled,
    });
  } catch (error) {
    console.error('[rotateIntakeLink] Error:', error);
    return res.status(500).json({ error: 'Failed to rotate intake link' });
  }
};

// ---------------------------------------------------------------------------
// Public submission (no auth) -- mounted before authenticate, same pattern as
// consignorController.ts's getConsignorPortal.
// ---------------------------------------------------------------------------

/**
 * GET /api/consignor-intake/:token
 * PUBLIC. 404 if the token doesn't match any workspace. 200 with acceptingRequests:false
 * (not 403/404) when the organizer has disabled the link, so the public page can render a
 * normal "not accepting requests right now" state instead of a broken-link error.
 */
export const getPublicIntakeInfo = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    const settings = await prisma.workspaceSettings.findUnique({
      where: { intakeLinkToken: token },
      select: {
        intakeLinkEnabled: true,
        workspace: { select: { owner: { select: { businessName: true } } } },
      },
    });

    if (!settings) {
      return res.status(404).json({ error: 'Link not found' });
    }

    return res.status(200).json({
      organizerBusinessName: settings.workspace.owner.businessName,
      acceptingRequests: settings.intakeLinkEnabled,
    });
  } catch (error) {
    console.error('[getPublicIntakeInfo] Error:', error);
    return res.status(500).json({ error: 'Failed to load intake link' });
  }
};

/**
 * POST /api/consignor-intake/:token/submit
 * PUBLIC, rate-limited (consignorIntakeSubmitLimiter — see routes/consignorIntake.ts).
 * Body: { name, email?, phone?, message?, requestedStartsAt? }.
 */
export const submitIntakeRequest = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    const settings = await prisma.workspaceSettings.findUnique({
      where: { intakeLinkToken: token },
      select: { workspaceId: true, intakeLinkEnabled: true },
    });

    if (!settings) {
      return res.status(404).json({ error: 'Link not found' });
    }
    if (!settings.intakeLinkEnabled) {
      // Disabled links stop accepting submissions immediately -- never fall through to
      // create a row just because the token itself is still valid.
      return res.status(403).json({ error: 'This organizer is not currently accepting requests' });
    }

    const { name, email, phone, message, requestedStartsAt } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    if (!trimmedEmail && !trimmedPhone) {
      return res.status(400).json({ error: 'email or phone is required' });
    }

    let parsedStartsAt: Date | null = null;
    if (requestedStartsAt !== undefined && requestedStartsAt !== null && requestedStartsAt !== '') {
      const candidate = new Date(requestedStartsAt);
      if (isNaN(candidate.getTime())) {
        return res.status(400).json({ error: 'requestedStartsAt must be a valid date' });
      }
      if (candidate.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'requestedStartsAt must be in the future' });
      }
      parsedStartsAt = candidate;
    }

    const trimmedName = name.trim();
    const trimmedMessage = typeof message === 'string' && message.trim() ? message.trim() : null;

    // Transaction: the request and its (optional) linked appointment are created together --
    // never a request left with a half-created appointment.
    const { requestId } = await prisma.$transaction(async (tx) => {
      const created = await tx.consignorIntakeRequest.create({
        data: {
          workspaceId: settings.workspaceId,
          name: trimmedName,
          email: trimmedEmail || null,
          phone: trimmedPhone || null,
          message: trimmedMessage,
          requestedStartsAt: parsedStartsAt,
        },
      });

      if (parsedStartsAt) {
        await tx.consignorIntakeAppointment.create({
          data: {
            workspaceId: settings.workspaceId,
            intakeRequestId: created.id,
            contactName: trimmedName,
            contactEmail: trimmedEmail || null,
            contactPhone: trimmedPhone || null,
            startsAt: parsedStartsAt,
            status: 'REQUESTED',
            createdBy: 'CONSIGNOR',
          },
        });
      }

      return { requestId: created.id };
    });

    // Fire-and-forget organizer notification -- never blocks the submitter's response.
    // Matches consignorController.ts's runPayout / sendConsignorPayout call-site shape.
    getWorkspaceOwnerContact(settings.workspaceId)
      .then((owner) => {
        if (!owner) return;
        return sendConsignorIntakeRequestNotice({
          organizerEmail: owner.email,
          organizerName: owner.businessName,
          requesterName: trimmedName,
          requesterContact: trimmedEmail || trimmedPhone || null,
          requestedStartsAt: parsedStartsAt,
        });
      })
      .catch((err) => console.warn('[consignor-intake-email] New request notice failed:', err));

    return res.status(201).json({ id: requestId, status: 'PENDING' });
  } catch (error) {
    console.error('[submitIntakeRequest] Error:', error);
    return res.status(500).json({ error: 'Failed to submit request' });
  }
};

// ---------------------------------------------------------------------------
// Organizer review queue (authenticated, TEAMS)
// ---------------------------------------------------------------------------

/**
 * GET /api/consignor-intake/requests?status=PENDING (default PENDING)
 */
export const listIntakeRequests = async (req: AuthRequest, res: Response) => {
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

    const statusParam = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'PENDING';
    if (!['PENDING', 'APPROVED', 'DECLINED', 'ALL'].includes(statusParam)) {
      return res.status(400).json({ error: "status must be 'PENDING', 'APPROVED', 'DECLINED', or 'ALL'" });
    }

    const requests = await prisma.consignorIntakeRequest.findMany({
      where: {
        workspaceId: workspace.id,
        ...(statusParam === 'ALL' ? {} : { status: statusParam }),
      },
      include: {
        appointment: true,
        resultingConsignor: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(requests);
  } catch (error) {
    console.error('[listIntakeRequests] Error:', error);
    return res.status(500).json({ error: 'Failed to list requests' });
  }
};

/**
 * POST /api/consignor-intake/requests/:id/approve
 * Body: { commissionRate, useTieredCommission?, unsoldItemDisposition?, notes?, confirmAppointment? }
 * confirmAppointment defaults to true when a linked appointment exists.
 * Reuses createConsignorCore (shared with the manual "Add Consignor" form) so the two code
 * paths never validate/create a Consignor two different ways.
 */
export const approveIntakeRequest = async (req: AuthRequest, res: Response) => {
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

    const intakeRequest = await prisma.consignorIntakeRequest.findFirst({
      where: { id, workspaceId: workspace.id },
      include: { appointment: true },
    });
    if (!intakeRequest) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (intakeRequest.status !== 'PENDING') {
      return res.status(409).json({ error: `Request is already ${intakeRequest.status.toLowerCase()}` });
    }

    const { commissionRate, useTieredCommission, unsoldItemDisposition, notes, confirmAppointment } = req.body;
    const shouldConfirmAppointment =
      confirmAppointment !== undefined ? confirmAppointment === true : Boolean(intakeRequest.appointment);

    let consignorId: string;
    try {
      const txResult = await prisma.$transaction(async (tx) => {
        const consignor = await createConsignorCore(
          {
            workspaceId: workspace.id,
            name: intakeRequest.name,
            email: intakeRequest.email,
            phone: intakeRequest.phone,
            commissionRate,
            useTieredCommission,
            unsoldItemDisposition,
            notes: notes || null,
          },
          tx
        );

        await tx.consignorIntakeRequest.update({
          where: { id: intakeRequest.id },
          data: {
            status: 'APPROVED',
            reviewedAt: new Date(),
            reviewedByUserId: req.user!.id,
            resultingConsignorId: consignor.id,
          },
        });

        let appointment: ConsignorIntakeAppointment | null = null;
        if (intakeRequest.appointment && shouldConfirmAppointment) {
          appointment = await tx.consignorIntakeAppointment.update({
            where: { id: intakeRequest.appointment.id },
            data: { consignorId: consignor.id, status: 'CONFIRMED' },
          });
        } else if (intakeRequest.appointment) {
          // Approved but the organizer un-checked "confirm the requested time" --
          // still link the appointment to the new Consignor so it shows on their profile,
          // just leave its status as-is (REQUESTED) instead of auto-confirming it.
          appointment = await tx.consignorIntakeAppointment.update({
            where: { id: intakeRequest.appointment.id },
            data: { consignorId: consignor.id },
          });
        }

        return { consignorId: consignor.id, appointment };
      });
      consignorId = txResult.consignorId;

      const fullConsignor = await prisma.consignor.findUnique({ where: { id: consignorId } });
      return res.status(200).json({ consignor: fullConsignor, appointment: txResult.appointment });
    } catch (err) {
      if (err instanceof ConsignorValidationError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    }
  } catch (error) {
    console.error('[approveIntakeRequest] Error:', error);
    return res.status(500).json({ error: 'Failed to approve request' });
  }
};

/**
 * POST /api/consignor-intake/requests/:id/decline
 * Body: { reason? }. No notification is sent to the prospective consignor (product
 * decision, 2026-09-25) -- the organizer handles that off-platform if they choose.
 */
export const declineIntakeRequest = async (req: AuthRequest, res: Response) => {
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

    const intakeRequest = await prisma.consignorIntakeRequest.findFirst({
      where: { id, workspaceId: workspace.id },
      include: { appointment: true },
    });
    if (!intakeRequest) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (intakeRequest.status !== 'PENDING') {
      return res.status(409).json({ error: `Request is already ${intakeRequest.status.toLowerCase()}` });
    }

    const { reason } = req.body;

    await prisma.$transaction(async (tx) => {
      await tx.consignorIntakeRequest.update({
        where: { id: intakeRequest.id },
        data: {
          status: 'DECLINED',
          declineReason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
          reviewedAt: new Date(),
          reviewedByUserId: req.user!.id,
        },
      });

      if (intakeRequest.appointment) {
        await tx.consignorIntakeAppointment.update({
          where: { id: intakeRequest.appointment.id },
          data: { status: 'CANCELLED' },
        });
      }
    });

    return res.status(200).json({ id: intakeRequest.id, status: 'DECLINED' });
  } catch (error) {
    console.error('[declineIntakeRequest] Error:', error);
    return res.status(500).json({ error: 'Failed to decline request' });
  }
};
