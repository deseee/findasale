/**
 * E2E Outreach Test Email
 *
 * Sends one isolated touch1 email to a test recipient using the same SMTP +
 * template + tracking-URL code as the cron, WITHOUT touching the production
 * 3,301-row queue.
 *
 * Creates a temp Organizer + DirectoryClaimEmail pair, sends the email, then
 * leaves the rows in place so you can verify pixel + unsubscribe behavior end-
 * to-end. Cleanup query is printed at the end.
 *
 * Required env vars (set on PowerShell before running):
 *   DATABASE_URL                      Railway public proxy
 *   OUTREACH_WORKSPACE_EMAIL          find@outreach.finda.sale
 *   OUTREACH_WORKSPACE_APP_PASSWORD   Gmail app password (no spaces)
 *   RAILWAY_BACKEND_URL               https://backend-production-xxx.up.railway.app
 *
 * Optional:
 *   TEST_EMAIL                        Where to send (default: deseee@yahoo.com)
 *   FRONTEND_URL                      Default: https://finda.sale
 *   OUTREACH_SECRET                   JWT signing secret (default: 'default-secret')
 *   OUTREACH_PHYSICAL_ADDRESS         CAN-SPAM address (default placeholder)
 *
 * Usage:
 *   $env:DATABASE_URL="postgresql://..."
 *   $env:OUTREACH_WORKSPACE_EMAIL="find@outreach.finda.sale"
 *   $env:OUTREACH_WORKSPACE_APP_PASSWORD="yzyuligzwtqdtqwk"
 *   $env:RAILWAY_BACKEND_URL="https://<your-railway-backend>.up.railway.app"
 *   npx ts-node src/scripts/triggerOutreachTestEmail.ts
 */

import nodemailer from 'nodemailer';
import { v4 as uuid } from 'uuid';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

const TEST_EMAIL = process.env.TEST_EMAIL || 'deseee@yahoo.com';
const TEST_BUSINESS_NAME = '[E2E TEST] FindASale Outreach Test Recipient';

// Same touch1 template as the cron (kept in sync manually for now).
const TOUCH1_TEMPLATE = {
  subject: 'Where do buyers find [Business Name]?',
  html: '<p>Your sale may be fantastic, but if your buyers don\'t know when and where to find you, it won\'t matter.</p><p>We built [Business Name] a free storefront on FindA.Sale — it puts you on the map before shoppers start searching, not after.</p><p>Take a look: <a href="[preview link]">[preview link]</a></p><p>2-minute walkthrough: <a href="[video link]?src=outreach-a">[video link]</a></p><p>It\'s free to claim your page. No credit card needed.</p><p>— The FindA.Sale Team</p><p>[physical address] · <a href="[unsubscribe link]">Unsubscribe</a></p>',
};

const renderTemplate = (template: string, vars: Record<string, string>): string => {
  let result = template;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(`[${k}]`, v);
  }
  return result;
};

async function main() {
  console.log('[e2e] Starting outreach e2e test');
  console.log(`[e2e] Target: ${TEST_EMAIL}`);

  // Validate required env vars
  if (!process.env.OUTREACH_WORKSPACE_EMAIL || !process.env.OUTREACH_WORKSPACE_APP_PASSWORD) {
    console.error('[e2e] FAIL: OUTREACH_WORKSPACE_EMAIL or OUTREACH_WORKSPACE_APP_PASSWORD not set');
    process.exit(1);
  }
  const backendUrl =
    process.env.RAILWAY_BACKEND_URL ||
    process.env.BACKEND_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined);
  if (!backendUrl) {
    console.error('[e2e] FAIL: no backend URL (set RAILWAY_BACKEND_URL or BACKEND_URL)');
    process.exit(1);
  }
  const frontendUrl = process.env.FRONTEND_URL || 'https://finda.sale';

  console.log(`[e2e] Backend URL: ${backendUrl}`);
  console.log(`[e2e] Frontend URL: ${frontendUrl}`);

  // 1. Create test User (required FK on Organizer)
  const testUser = await prisma.user.create({
    data: {
      email: `e2e-test-${Date.now()}@findasale-internal.test`,
      name: 'E2E Test User',
      role: 'ORGANIZER',
      roles: ['USER', 'ORGANIZER'],
    },
  });
  console.log(`[e2e] Created test User: ${testUser.id}`);

  // 2. Create temp Organizer
  const testOrganizer = await prisma.organizer.create({
    data: {
      businessName: TEST_BUSINESS_NAME,
      contactEmail: TEST_EMAIL,
      address: '123 Test Lane, Grand Rapids, MI 49503',
      userId: testUser.id,
      isClaimed: false,
      isUnmanagedListing: true,
      claimStatus: 'UNCLAIMED',
      directoryStatus: 'ACTIVE',
      businessCategory: 'ESTATE_SALE_CO',
      suppressOutreach: false,
    },
  });
  console.log(`[e2e] Created test Organizer: ${testOrganizer.id}`);

  // 2. Generate tracking IDs (same format as cron)
  const trackingPixelId = `${uuid()}:${Buffer.from(TEST_EMAIL).toString('base64').substring(0, 12)}`;
  const trackingToken = jwt.sign(
    { organizerId: testOrganizer.id, email: TEST_EMAIL },
    process.env.OUTREACH_SECRET || 'default-secret',
    { expiresIn: '90d' }
  );

  // 3. Create DirectoryClaimEmail row (numbering rolled forward — was step 3, now still 3 after User insert)
  const testClaim = await prisma.directoryClaimEmail.create({
    data: {
      organizerId: testOrganizer.id,
      emailAddress: TEST_EMAIL,
      status: 'PENDING',
      attemptCount: 0,
      trackingPixelId,
      trackingToken,
    },
  });
  console.log(`[e2e] Created DirectoryClaimEmail: ${testClaim.id}`);

  // 4. Build URLs (same as cron)
  const previewLink = `${frontendUrl}/organizers/${testOrganizer.id}`;
  const videoLink = `${frontendUrl}/video`;
  const unsubscribeLink = `${backendUrl}/api/outreach/unsubscribe?token=${trackingToken}`;
  const trackingPixelUrl = `${backendUrl}/api/outreach/pixel?trackingId=${trackingPixelId}`;
  const physicalAddress =
    process.env.OUTREACH_PHYSICAL_ADDRESS || '123 Main St, Grand Rapids, MI 49503';

  console.log(`[e2e] Tracking pixel URL: ${trackingPixelUrl}`);
  console.log(`[e2e] Unsubscribe URL:    ${unsubscribeLink}`);

  // 5. Render template
  const html = renderTemplate(TOUCH1_TEMPLATE.html, {
    'Business Name': TEST_BUSINESS_NAME,
    'preview link': previewLink,
    'video link': videoLink,
    'unsubscribe link': unsubscribeLink,
    'physical address': physicalAddress,
  });
  const subject = renderTemplate(TOUCH1_TEMPLATE.subject, {
    'Business Name': TEST_BUSINESS_NAME,
  });
  const htmlWithPixel = `${html}<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;

  // 6. Send via Gmail SMTP
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.OUTREACH_WORKSPACE_EMAIL,
      pass: process.env.OUTREACH_WORKSPACE_APP_PASSWORD,
    },
  });

  console.log('[e2e] Sending via Gmail SMTP...');
  const info = await transport.sendMail({
    from: `The FindA.Sale Team <${process.env.OUTREACH_WORKSPACE_EMAIL}>`,
    to: TEST_EMAIL,
    subject,
    html: htmlWithPixel,
  });

  // 7. Mark touch1 sent (mirrors cron behavior)
  await prisma.directoryClaimEmail.update({
    where: { id: testClaim.id },
    data: { touch1SentAt: new Date() },
  });

  console.log('[e2e] ✓ Sent. SMTP messageId:', info.messageId);
  console.log('');
  console.log('=== Verification steps ===');
  console.log(`1. Open inbox at ${TEST_EMAIL}. The email should arrive within 30 seconds.`);
  console.log('   (Check spam too — first send from new domain may land there.)');
  console.log('');
  console.log('2. Open the email. The tracking pixel will fire.');
  console.log('   Check pixel registered (touch1Opened should flip to true):');
  console.log('');
  console.log(`     SELECT id, "touch1SentAt", "touch1Opened", "touch1OpenedAt"`);
  console.log(`     FROM "DirectoryClaimEmail" WHERE id = '${testClaim.id}';`);
  console.log('');
  console.log('3. Click the unsubscribe link in the email.');
  console.log('   Check it created a suppression row:');
  console.log('');
  console.log(`     SELECT * FROM "EmailSuppression" WHERE "emailAddress" = '${TEST_EMAIL}';`);
  console.log('');
  console.log('=== Cleanup (run after verification) ===');
  console.log('');
  console.log(`     DELETE FROM "EmailSuppression" WHERE "emailAddress" = '${TEST_EMAIL}';`);
  console.log(`     DELETE FROM "DirectoryClaimEmail" WHERE id = '${testClaim.id}';`);
  console.log(`     DELETE FROM "Organizer" WHERE id = '${testOrganizer.id}';`);
  console.log(`     DELETE FROM "User" WHERE id = '${testUser.id}';`);
  console.log('');
  console.log('[e2e] Done. Test row IDs:');
  console.log(`  User:                ${testUser.id}`);
  console.log(`  Organizer:           ${testOrganizer.id}`);
  console.log(`  DirectoryClaimEmail: ${testClaim.id}`);
  console.log(`  trackingPixelId:     ${trackingPixelId}`);
}

main()
  .catch((err) => {
    console.error('[e2e] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
