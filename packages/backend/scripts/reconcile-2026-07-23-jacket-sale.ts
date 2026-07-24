// One-off reconciliation for the 2026-07-23 "Camel Cigarette Yellow Tyvek
// Windbreaker Jacket" stranded POS sale -- same failure shape as the
// 2026-07-22 $14.47 incident (checkout.session.completed never visibly
// processed the POS Payment Link, so FindA.Sale never recorded the sale
// even though Stripe captured the charge). Confirmed via:
//   - Stripe: charge py_3TwQU0LIWHQCHu750sBaf3E3, $28.99, captured, destination
//     acct_1Tr2qwLpIQaEWoSK, via Payment Link plink_1TwQS5LIWHQCHu75yI1xanTZ,
//     created 2026-07-23 17:32:32 UTC.
//   - DB: POSPaymentLink cmrxseqdp004sc635lolxkzp0, status ACTIVE, itemIds=
//     [cmrl2owl1004rtoh5g8ld595z], purchaseIds=[], createdAt 2026-07-23 17:30:33.
//   - Railway logs 17:28-17:45 UTC: exactly 2 POST /api/stripe/webhook calls
//     (200, 23ms and 183ms) with ZERO [pos]-tagged or error log output from
//     either -- unlike the first incident, we could not even confirm
//     checkout.session.completed was the event type delivered. A diagnostic
//     logging fix (unconditional event.id/event.type log at the top of
//     webhookHandler) is being shipped alongside this script so the NEXT
//     occurrence is immediately diagnosable instead of a mystery again.
//
// Unlike the first incident, this item's ebayOfferId is already known and
// non-null (207017284011) -- no SKU lookup or Trading API fallback needed,
// straight Inventory API withdraw.
//
// Run from packages/backend, dry-run by default:
//   npx tsx scripts/reconcile-2026-07-23-jacket-sale.ts
//   npx tsx scripts/reconcile-2026-07-23-jacket-sale.ts --apply

import { PrismaClient, Prisma } from '../../database/node_modules/@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const ITEM_ID = 'cmrl2owl1004rtoh5g8ld595z';
const POS_LINK_ID = 'cmrxseqdp004sc635lolxkzp0';
const EXPECTED_STRIPE_PAYMENT_LINK_ID = 'plink_1TwQS5LIWHQCHu75yI1xanTZ';
const EXPECTED_AMOUNT_CENTS = 2899;
const PLATFORM_FEE_RATE = 0.10; // CLAUDE.md STACK.md: 10% flat, all sale types, locked S106

const ebayProxyUrl = (path: string): string => `https://finda.sale/api/proxy/ebay?path=${path}`;
const ebayProxyHeaders = (): Record<string, string> => {
  const secret = process.env.EBAY_PROXY_SECRET;
  return secret ? { 'X-Proxy-Secret': secret } : {};
};
const ebayUserHeaders = (accessToken: string): Record<string, string> => ({
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
  'Accept-Language': 'en-US',
  'Content-Language': 'en-US',
});

async function refreshEbayAccessToken(organizerId: string): Promise<string | null> {
  const connection = await prisma.ebayConnection.findUnique({ where: { organizerId } });
  if (!connection) {
    console.warn(`[eBay] No connection found for organizer ${organizerId}`);
    return null;
  }
  const now = new Date();
  const expiresIn = (connection.tokenExpiresAt.getTime() - now.getTime()) / 1000;
  if (expiresIn > 300) return connection.accessToken;

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('[eBay] EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not configured');
    return null;
  }
  const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: connection.refreshToken });
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(ebayProxyUrl('/identity/v1/oauth2/token'), {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded', ...ebayProxyHeaders() },
    body: params.toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    console.error(`[eBay] Token refresh failed: ${response.status}`);
    return null;
  }
  const data = (await response.json()) as any;
  await prisma.ebayConnection.update({
    where: { organizerId },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || connection.refreshToken,
      tokenExpiresAt: new Date(Date.now() + (data.expires_in || 7200) * 1000),
      lastRefreshedAt: new Date(),
      lastErrorAt: null,
      lastErrorMessage: null,
    },
  });
  return data.access_token;
}

async function main() {
  const item = await prisma.item.findUnique({ where: { id: ITEM_ID } });
  const link = await prisma.pOSPaymentLink.findUnique({ where: { id: POS_LINK_ID } });

  if (!item || !link) {
    console.error('ABORT: item or POSPaymentLink not found.');
    process.exit(1);
  }
  if (link.stripePaymentLinkId !== EXPECTED_STRIPE_PAYMENT_LINK_ID) {
    console.error(`ABORT: stripePaymentLinkId mismatch. Expected ${EXPECTED_STRIPE_PAYMENT_LINK_ID}, got ${link.stripePaymentLinkId}`);
    process.exit(1);
  }
  if (link.amount !== EXPECTED_AMOUNT_CENTS) {
    console.error(`ABORT: amount mismatch. Expected ${EXPECTED_AMOUNT_CENTS}, got ${link.amount}`);
    process.exit(1);
  }
  if (link.status === 'COMPLETED') {
    console.log('Link is already COMPLETED -- nothing to do. Someone else may have fixed this already.');
    process.exit(0);
  }
  if (link.status !== 'ACTIVE') {
    console.error(`ABORT: unexpected link status "${link.status}" (expected ACTIVE). Needs manual review.`);
    process.exit(1);
  }
  if (item.status !== 'AVAILABLE') {
    console.error(`ABORT: item status is "${item.status}", not AVAILABLE. Needs manual review -- may already be handled.`);
    process.exit(1);
  }

  const price = item.price || EXPECTED_AMOUNT_CENTS / 100;
  const platformFeeAmount = parseFloat((price * PLATFORM_FEE_RATE).toFixed(2));

  console.log('--- DRY RUN ---'.concat(APPLY ? ' (will APPLY)' : ' (pass --apply to execute)'));
  console.log(`Item: ${item.id} "${item.title}" price=$${price} status=${item.status} saleId=${item.saleId}`);
  console.log(`POSPaymentLink: ${link.id} status=${link.status} amount=$${(link.amount / 100).toFixed(2)}`);
  console.log(`Will create Purchase: amount=$${price} platformFeeAmount=$${platformFeeAmount} source=POS stripePaymentIntentId=pos_${link.id}`);
  console.log(`Will mark item SOLD (via guarded stockSold increment) and POSPaymentLink COMPLETED.`);
  console.log(`Will withdraw eBay offer ${item.ebayOfferId} (listing ${item.ebayListingId}) via Inventory API.`);

  if (!APPLY) {
    console.log('\nDry run only -- no changes made. Re-run with --apply to execute.');
    process.exit(0);
  }

  // 1. Atomic stock decrement + Purchase creation + link update, in one transaction.
  let purchaseId: string;
  await prisma.$transaction(async (tx) => {
    const guarded = await tx.$executeRaw`
      UPDATE "Item"
      SET "stockSold" = "stockSold" + 1
      WHERE "id" = ${ITEM_ID}
        AND "stockSold" + 1 <= COALESCE("stockTotal", 1)
    `;
    if (guarded === 0) {
      throw new Error(`Guarded stock update matched 0 rows for item ${ITEM_ID} -- oversold or item changed since dry run. Aborting transaction.`);
    }
    const updatedItem = await tx.item.findUniqueOrThrow({
      where: { id: ITEM_ID },
      select: { stockTotal: true, stockSold: true, status: true },
    });
    const total = updatedItem.stockTotal ?? 1;
    if (updatedItem.stockSold >= total && updatedItem.status !== 'SOLD') {
      await tx.item.update({ where: { id: ITEM_ID }, data: { status: 'SOLD' } });
    }

    const purchase = await tx.purchase.create({
      data: {
        itemId: ITEM_ID,
        saleId: item.saleId,
        amount: price,
        platformFeeAmount,
        status: 'PAID',
        source: 'POS',
        stripePaymentIntentId: `pos_${link.id}`,
      },
    });
    purchaseId = purchase.id;

    await tx.pOSPaymentLink.update({
      where: { id: link.id },
      data: { status: 'COMPLETED', completedAt: new Date(), purchaseIds: [purchase.id] },
    });
  });

  console.log(`DONE: Purchase ${purchaseId!} created, item marked SOLD, POSPaymentLink marked COMPLETED.`);

  // 2. Withdraw the eBay offer (Inventory API -- offerId already known and non-null).
  if (item.ebayOfferId && item.saleId) {
    const sale = await prisma.sale.findUnique({ where: { id: item.saleId }, select: { organizerId: true } });
    if (sale) {
      const accessToken = await refreshEbayAccessToken(sale.organizerId);
      if (accessToken) {
        const response = await fetch(
          ebayProxyUrl(encodeURIComponent(`/sell/inventory/v1/offer/${item.ebayOfferId}/withdraw`)),
          { method: 'POST', headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() }, body: '{}' }
        );
        if (response.ok) {
          console.log(`[eBay] Successfully withdrew offer ${item.ebayOfferId} for item ${ITEM_ID}.`);
        } else {
          const errText = await response.text();
          console.error(`[eBay] Failed to withdraw offer ${item.ebayOfferId}: ${response.status} ${errText}`);
        }
      } else {
        console.error('[eBay] Could not get access token -- eBay listing NOT withdrawn, needs manual follow-up.');
      }
    } else {
      console.error('[eBay] Could not resolve sale/organizer -- eBay listing NOT withdrawn.');
    }
  } else {
    console.warn('[eBay] Item has no ebayOfferId or saleId -- nothing to withdraw.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
