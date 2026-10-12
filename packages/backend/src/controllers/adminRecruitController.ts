/**
 * Admin endpoints for the organizer-recruitment cold-send channel
 * (mounted at /api/admin/recruit, authenticate + requireAdmin in routes/adminRecruit.ts).
 *
 *   POST /leads/import            CSV in a JSON body { csv }, sourceUrl required per row
 *   POST /leads/from-organizers   Grand Rapids area Organizer rows with verified contact emails
 *   GET  /queue?status=           leads, optionally filtered by status
 *   GET  /stats                   today vs cap, 7-day bounce / complaint rates, pause state
 *   POST /pause                   { reason }
 *   POST /resume                  refused while health is failing
 *   POST /leads/:id/suppress      suppress one lead (global suppression list too)
 */

import { Response } from 'express';
import { Readable } from 'stream';
import { parse } from 'csv-parse';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { suppressionService } from '../services/suppressionService';
import {
  computeDailyCap,
  computeHealth,
  getPauseState,
  getRecruitSendBlockers,
  recruitDateKey,
  recruitThresholds,
  setPaused,
  tagSuppressionSource,
} from '../services/recruitSendService';

const MAX_IMPORT_ROWS = 5000;
const LEAD_STATUSES = ['NEW', 'VERIFIED', 'RISKY', 'INVALID', 'QUEUED', 'SENT', 'REPLIED', 'SUPPRESSED', 'DONE'] as const;
type LeadStatus = (typeof LEAD_STATUSES)[number];

// Grand Rapids, MI (same point the HERE Places scraper uses for the metro).
const GR_LAT = 42.9632;
const GR_LNG = -85.6789;
// Same verification gate the Gmail outreach channel uses before sending to a scraped address.
const VERIFIED_DISCOVERY_METHODS = ['website_scrape', 'whois_rdap', 'smtp_pattern', 'sale_description'];

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const hit = Object.keys(row).find((h) => h.trim().toLowerCase().replace(/[\s_-]/g, '') === k.toLowerCase());
    if (hit && row[hit] && String(row[hit]).trim()) return String(row[hit]).trim();
  }
  return '';
}

function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Best-effort "..., City, ST 49503" parse of Organizer.address. */
function cityStateFromAddress(address: string | null | undefined): { city: string | null; state: string | null } {
  if (!address) return { city: null, state: null };
  const m = address.match(/,\s*([^,]+?),\s*([A-Z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?\s*(?:,\s*(?:USA|US|United States))?\s*$/i);
  if (!m) return { city: null, state: null };
  return { city: m[1].trim(), state: m[2].toUpperCase() };
}

export const importLeads = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const csv = typeof req.body?.csv === 'string' ? req.body.csv : '';
    if (!csv.trim()) {
      res.status(400).json({ error: 'Send the CSV text as { "csv": "..." }. Columns: email, businessName, sourceUrl (required); contactName, city, state (optional).' });
      return;
    }
    const records: Record<string, string>[] = [];
    const parser = Readable.from(Buffer.from(csv, 'utf-8')).pipe(
      parse({ columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true })
    );
    for await (const record of parser) {
      records.push(record);
      if (records.length > MAX_IMPORT_ROWS) break;
    }
    if (records.length > MAX_IMPORT_ROWS) {
      res.status(400).json({ error: `Too many rows (max ${MAX_IMPORT_ROWS} per import)` });
      return;
    }

    const errors: { row: number; error: string }[] = [];
    const seen = new Set<string>();
    const data: {
      email: string; businessName: string; contactName: string | null; city: string | null; state: string | null;
      source: string; sourceUrl: string;
    }[] = [];
    records.forEach((r, i) => {
      const rowNum = i + 2; // header is row 1
      const email = pick(r, 'email', 'emailaddress').toLowerCase();
      const businessName = pick(r, 'businessname', 'business', 'company');
      const sourceUrl = pick(r, 'sourceurl', 'source');
      if (!email || !email.includes('@')) return void errors.push({ row: rowNum, error: 'missing or invalid email' });
      if (!businessName) return void errors.push({ row: rowNum, error: 'missing businessName' });
      if (!/^https?:\/\//i.test(sourceUrl)) return void errors.push({ row: rowNum, error: 'missing sourceUrl (must be an http(s) URL showing where the address was found)' });
      if (seen.has(email)) return void errors.push({ row: rowNum, error: 'duplicate email in this file' });
      seen.add(email);
      data.push({
        email,
        businessName: businessName.slice(0, 200),
        contactName: pick(r, 'contactname', 'name', 'firstname') || null,
        city: pick(r, 'city') || null,
        state: (pick(r, 'state') || '').toUpperCase() || null,
        source: 'csv_import',
        sourceUrl: sourceUrl.slice(0, 1000),
      });
    });

    const result = data.length > 0 ? await prisma.recruitLead.createMany({ data, skipDuplicates: true }) : { count: 0 };
    res.json({
      rows: records.length,
      created: result.count,
      alreadyPresent: data.length - result.count,
      rejected: errors.length,
      errors: errors.slice(0, 200),
    });
  } catch (err: any) {
    console.error('[AdminRecruit] importLeads error:', err?.message);
    res.status(500).json({ error: 'Import failed' });
  }
};

export const importFromOrganizers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const radiusMiles = Math.min(Math.max(Number(req.body?.radiusMiles) || 40, 5), 100);
    const latPad = radiusMiles / 69;
    const lngPad = radiusMiles / (69 * Math.cos((GR_LAT * Math.PI) / 180));

    const organizers = await prisma.organizer.findMany({
      where: {
        isUnmanagedListing: true, // scraped, unclaimed listings only; real organizers already have accounts
        suppressOutreach: false,
        contactEmail: { not: null },
        emailDiscoveryMethod: { in: VERIFIED_DISCOVERY_METHODS },
        emailDiscoveryConfidence: { gte: 0.5 },
        lat: { gte: GR_LAT - latPad, lte: GR_LAT + latPad },
        lng: { gte: GR_LNG - lngPad, lte: GR_LNG + lngPad },
      },
      select: { id: true, businessName: true, contactEmail: true, address: true, lat: true, lng: true, website: true, listingUrl: true },
      take: 5000,
    });

    const data = organizers
      .filter((o) => o.lat != null && o.lng != null && milesBetween(GR_LAT, GR_LNG, o.lat, o.lng) <= radiusMiles)
      .filter((o) => (o.businessName || '').trim() && (o.contactEmail || '').includes('@'))
      .map((o) => {
        const { city, state } = cityStateFromAddress(o.address);
        return {
          email: (o.contactEmail as string).trim().toLowerCase(),
          businessName: o.businessName.trim().slice(0, 200),
          city,
          state,
          organizerId: o.id,
          source: 'organizer_directory',
          sourceUrl: (o.website || o.listingUrl || `organizer:${o.id}`).slice(0, 1000),
        };
      });

    const result = data.length > 0 ? await prisma.recruitLead.createMany({ data, skipDuplicates: true }) : { count: 0 };
    res.json({ radiusMiles, matched: data.length, created: result.count, alreadyPresent: data.length - result.count });
  } catch (err: any) {
    console.error('[AdminRecruit] importFromOrganizers error:', err?.message);
    res.status(500).json({ error: 'Import failed' });
  }
};

export const getQueue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const statusParam = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
    if (statusParam && !(LEAD_STATUSES as readonly string[]).includes(statusParam)) {
      res.status(400).json({ error: `status must be one of ${LEAD_STATUSES.join(', ')}` });
      return;
    }
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1), 500);
    const where = statusParam ? { status: statusParam as LeadStatus } : {};
    const [leads, counts] = await Promise.all([
      prisma.recruitLead.findMany({ where, orderBy: { updatedAt: 'desc' }, take: limit }),
      prisma.recruitLead.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    res.json({
      leads,
      countsByStatus: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    });
  } catch (err: any) {
    console.error('[AdminRecruit] getQueue error:', err?.message);
    res.status(500).json({ error: 'Failed to load queue' });
  }
};

export const getStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [today, health, pause] = await Promise.all([
      prisma.recruitDailyStat.findUnique({ where: { date: recruitDateKey() } }),
      computeHealth(),
      getPauseState(),
    ]);
    res.json({
      today: {
        date: recruitDateKey(),
        attempted: today?.attempted ?? 0,
        sent: today?.sent ?? 0,
        hardBounced: today?.hardBounced ?? 0,
        softBounced: today?.softBounced ?? 0,
        complained: today?.complained ?? 0,
        cap: computeDailyCap(),
      },
      last7Days: health.metrics,
      thresholds: recruitThresholds(),
      health: { ok: health.ok, reason: health.reason },
      pause,
      configBlockers: getRecruitSendBlockers(),
    });
  } catch (err: any) {
    console.error('[AdminRecruit] getStats error:', err?.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
};

export const pauseRecruit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const reason = typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : 'manual pause';
    await setPaused(true, `manual: ${reason}`, req.user?.id ?? null);
    res.json({ paused: true, reason });
  } catch (err: any) {
    console.error('[AdminRecruit] pause error:', err?.message);
    res.status(500).json({ error: 'Failed to pause' });
  }
};

export const resumeRecruit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const health = await computeHealth();
    if (!health.ok) {
      res.status(409).json({ error: `Cannot resume while health is failing: ${health.reason}`, metrics: health.metrics });
      return;
    }
    await setPaused(false, 'resumed by admin', req.user?.id ?? null);
    res.json({ paused: false });
  } catch (err: any) {
    console.error('[AdminRecruit] resume error:', err?.message);
    res.status(500).json({ error: 'Failed to resume' });
  }
};

export const suppressLead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lead = await prisma.recruitLead.findUnique({ where: { id: req.params.id } });
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    // 'opted_out' (not 'manual'): isSuppressed() only blocks on bounce / complaint / opt-out flags.
    await suppressionService.addSuppression(lead.email, 'opted_out');
    await tagSuppressionSource(lead.email);
    await prisma.recruitLead.update({ where: { id: lead.id }, data: { status: 'SUPPRESSED', nextSendAt: null } });
    res.json({ ok: true, id: lead.id, status: 'SUPPRESSED' });
  } catch (err: any) {
    console.error('[AdminRecruit] suppressLead error:', err?.message);
    res.status(500).json({ error: 'Failed to suppress lead' });
  }
};
