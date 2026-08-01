// One-off diagnostic for S1184 (Vivitar-flash silent push failure root cause).
//
// Background: EbayPolicyMapping.weightTierMappings is a manually-saved snapshot
// (saveEbayPolicyMapping / POST /api/ebay/policy-mapping) that is NEVER auto-refreshed.
// It goes stale the moment an organizer edits/renames/deletes/consolidates policies
// directly on eBay's own Business Policies page -- exactly what happened on Artifact's
// account 2026-07-29 (4oz/8oz/12oz/15oz tiers consolidated into one "Ground Advantage
// Under 1lb $9.99" policy). A dead policyId sent straight to eBay used to fail the
// offer/publish call with a generic, undetailed error (fixed this session in
// ebayController.ts / ebayPublishService.ts -- see git log "S1184").
//
// This script answers the "how many OTHER items are affected" question that couldn't
// be answered from the Cowork sandbox (no network access to Railway or eBay from
// there -- see handoff notes). Run it from Patrick's own machine, which has real
// internet access.
//
// For every FLAT_TIERS organizer with eBay connected:
//   1. Fetch their CURRENT live eBay fulfillment policies.
//   2. Diff against EbayPolicyMapping.weightTierMappings -- report any tier whose
//      policyId is no longer live on eBay (renamed / deleted / consolidated away).
//   3. For each stale tier, count live+queued Items whose packageWeightOz would
//      currently match that tier (i.e. would hit the same silent-failure class).
//
// Run from project root:
//   npx tsx packages/backend/scripts/check-stale-shipping-policies-2026-08-01.ts
//
// Read-only. Makes zero writes and zero eBay mutations. Requires EBAY_PROXY_SECRET
// in the environment if the Vercel eBay proxy requires it (same as other scripts).

import { PrismaClient } from '../../database/node_modules/@prisma/client';
import { matchWeightTier, WeightTierMapping } from '../src/utils/ebayPolicyParser';

const prisma = new PrismaClient();

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://finda.sale';
const PROXY_SECRET = process.env.EBAY_PROXY_SECRET;

function ebayProxyUrl(path: string): string {
  return `${FRONTEND_URL}/api/proxy/ebay?path=${encodeURIComponent(path)}`;
}

async function refreshAccessToken(organizerId: string): Promise<string | null> {
  const conn = await prisma.ebayConnection.findUnique({ where: { organizerId } });
  if (!conn) return null;
  const now = new Date();
  const expiresIn = (conn.tokenExpiresAt.getTime() - now.getTime()) / 1000;
  if (expiresIn > 300) return conn.accessToken;

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.warn(`[refresh] organizer=${organizerId} missing EBAY_CLIENT_ID/SECRET in env — using possibly-stale stored token`);
    return conn.accessToken;
  }
  const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken });
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!res.ok) {
    console.warn(`[refresh] organizer=${organizerId} token refresh failed HTTP ${res.status} — using stored token`);
    return conn.accessToken;
  }
  const data = (await res.json()) as any;
  const newToken = data.access_token as string;
  await prisma.ebayConnection.update({
    where: { organizerId },
    data: { accessToken: newToken, tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000) },
  });
  return newToken;
}

async function fetchLiveFulfillmentPolicies(accessToken: string): Promise<Array<{ fulfillmentPolicyId: string; name: string }>> {
  const res = await fetch(ebayProxyUrl('/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US&limit=100'), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(PROXY_SECRET ? { 'X-Proxy-Secret': PROXY_SECRET } : {}),
    },
  });
  if (!res.ok) {
    console.warn(`[fetch] fulfillment_policy fetch failed HTTP ${res.status}`);
    return [];
  }
  const data = (await res.json()) as any;
  return data.fulfillmentPolicies || [];
}

async function main() {
  const mappings = await prisma.ebayPolicyMapping.findMany({
    where: { shippingMode: 'FLAT_TIERS' },
    include: { organizer: { select: { id: true, businessName: true, ebayConnection: { select: { organizerId: true } } } } },
  });

  const report: any[] = [];
  let totalStaleTiers = 0;
  let totalAffectedItems = 0;

  for (const mapping of mappings) {
    const tiers = (mapping.weightTierMappings as unknown as WeightTierMapping[]) || [];
    if (tiers.length === 0) continue;
    if (!mapping.organizer.ebayConnection) continue;

    const accessToken = await refreshAccessToken(mapping.organizer.id);
    if (!accessToken) {
      console.warn(`[skip] organizer=${mapping.organizer.businessName} (${mapping.organizer.id}) — no usable access token`);
      continue;
    }

    const live = await fetchLiveFulfillmentPolicies(accessToken);
    const liveIds = new Set(live.map((p) => p.fulfillmentPolicyId));

    const staleTiers = tiers.filter((t) => !liveIds.has(t.policyId));
    if (staleTiers.length === 0) continue;

    totalStaleTiers += staleTiers.length;

    // Count items (live + queued) whose weight currently matches a stale tier.
    const items = await prisma.item.findMany({
      where: {
        sale: { organizerId: mapping.organizer.id },
        packageWeightOz: { not: null, gt: 0 },
        OR: [{ ebayListingId: { not: null } }, { ebayOfferId: { not: null } }, { ebayQueuedAt: { not: null } }],
      },
      select: { id: true, title: true, ebayListingId: true, ebayOfferId: true, packageWeightOz: true },
      take: 2000,
    });

    const affected = items.filter((item) => {
      if (item.packageWeightOz == null) return false;
      const matched = matchWeightTier(item.packageWeightOz, tiers);
      return matched != null && staleTiers.some((s) => s.policyId === matched.policyId);
    });

    totalAffectedItems += affected.length;

    report.push({
      organizerId: mapping.organizer.id,
      organizerName: mapping.organizer.businessName,
      staleTiers: staleTiers.map((t) => ({ policyId: t.policyId, policyName: t.policyName, maxOz: t.maxOz })),
      affectedItemCount: affected.length,
      affectedItems: affected.map((i) => ({ id: i.id, title: i.title, weightOz: i.packageWeightOz, live: Boolean(i.ebayListingId) })),
    });
  }

  console.log(JSON.stringify({ queriedAt: new Date().toISOString(), organizersWithStaleTiers: report.length, totalStaleTiers, totalAffectedItems, report }, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
