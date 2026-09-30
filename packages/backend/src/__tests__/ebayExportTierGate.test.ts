/**
 * GET /sales/:saleId/ebay-export is PRO gated like its sibling marketplace exports (2026-09-30).
 * The route file is inspected at the source level (mounting routes/sales.ts pulls in ~100 controllers), and the
 * real requireTier middleware is exercised for a SIMPLE and a PRO organizer.
 */
import fs from 'fs';
import path from 'path';
import { requireTier } from '../middleware/requireTier';

describe('ebay-export route gate', () => {
  it('registers requireTier(PRO) before the controller', () => {
    const src = fs.readFileSync(path.join(__dirname, '../routes/sales.ts'), 'utf8');
    const line = src.split('\n').find((l) => l.includes("router.get('/:saleId/ebay-export'"));
    expect(line).toBeDefined();
    expect(line).toContain("requireTier('PRO')");
    expect(line!.indexOf("requireTier('PRO')")).toBeLessThan(line!.indexOf('exportSaleToEbay'));
    expect(line!.indexOf('authenticate')).toBeLessThan(line!.indexOf("requireTier('PRO')"));
  });

  const run = async (tier: string) => {
    const req: any = { user: { organizerProfile: { subscriptionTier: tier } } };
    const res: any = { statusCode: 200, body: undefined };
    res.status = (c: number) => { res.statusCode = c; return res; };
    res.json = (b: unknown) => { res.body = b; return res; };
    const next = jest.fn();
    await requireTier('PRO')(req, res, next);
    return { res, next };
  };

  it('blocks a SIMPLE organizer with 403 TIER_REQUIRED', async () => {
    const { res, next } = await run('SIMPLE');
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('TIER_REQUIRED');
    expect(res.body.requiredTier).toBe('PRO');
  });

  it('lets PRO and TEAMS through', async () => {
    expect((await run('PRO')).next).toHaveBeenCalled();
    expect((await run('TEAMS')).next).toHaveBeenCalled();
  });
});
