/**
 * marketplacePosterController.ts — admin-only controller for the Marketplace
 * Poster (ADR-083). Mounted at /api/marketplace-poster, guarded by
 * authenticate + requireAdmin in routes/marketplacePoster.ts (no exceptions —
 * AUTHZ-ON-EVERY-ENDPOINT).
 */

import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { encryptStorageState } from '../services/marketplace/marketplacePlaywrightClient';

/** GET /accounts — list pool accounts (never returns sessionCookie, even encrypted). */
export const listAccounts = async (_req: AuthRequest, res: Response) => {
  const accounts = await prisma.marketplacePosterAccount.findMany({
    select: {
      id: true,
      label: true,
      status: true,
      dailyPostCount: true,
      lastUsedAt: true,
      lastErrorAt: true,
      lastErrorMessage: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ accounts });
};

/**
 * POST /accounts/register — register a new pool account.
 *
 * Body: { label: string, storageState: object }
 *
 * `storageState` must be the JSON produced by Playwright's
 * `context.storageState()` after Patrick has manually logged into a real,
 * dedicated FindA.Sale-owned Facebook account in his OWN browser (never a
 * Claude-controlled session — see ADR-083 "Flagged for Patrick"). This route
 * accepts only the already-exported state object, never a raw
 * email/password — it must never accept or log plaintext credentials.
 */
export const registerAccount = async (req: AuthRequest, res: Response) => {
  const { label, storageState } = req.body as { label?: string; storageState?: object };

  if (!label || typeof label !== 'string') {
    return res.status(400).json({ message: 'label is required.' });
  }
  if (!storageState || typeof storageState !== 'object') {
    return res.status(400).json({ message: 'storageState (Playwright storageState JSON object) is required.' });
  }

  const encrypted = encryptStorageState(storageState);

  const account = await prisma.marketplacePosterAccount.create({
    data: { label, sessionCookie: encrypted, status: 'ACTIVE' },
    select: { id: true, label: true, status: true, createdAt: true },
  });

  res.status(201).json({ account });
};

/** POST /accounts/:id/deactivate — pull an account out of rotation manually. */
export const deactivateAccount = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const account = await prisma.marketplacePosterAccount.update({
    where: { id },
    data: { status: 'BANNED' },
    select: { id: true, label: true, status: true },
  });
  res.json({ account });
};

/** GET /jobs — list recent jobs, most recent first, for admin visibility. */
export const listJobs = async (req: AuthRequest, res: Response) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  const jobs = await prisma.marketplaceListingJob.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      item: { select: { id: true, title: true, saleId: true } },
      account: { select: { id: true, label: true } },
    },
  });
  res.json({ jobs });
};
