import { prisma } from '../lib/prisma';
import { getConsignorMarkdownPolicyNotice } from './commissionCalcService';
import { getConsignmentMinimumPriceCents } from '../controllers/itemController';

/**
 * In-app consignor agreement (Patrick, 2026-09-25): the consignor agreement now lives in
 * the product itself -- stored, versioned, and accepted here -- rather than as a
 * standalone document. See ConsignorAgreementVersion / Consignor.agreementAcceptedAt /
 * Consignor.agreementAcceptedVersion in schema.prisma.
 *
 * Deliberately does NOT include a "cashier discretionary markdown" clause -- that feature
 * (an additional POS-time discount) is still being decided by Patrick and isn't ready to
 * be represented to consignors as policy yet.
 *
 * {{consignmentMinimumPrice}} (2026-09-26 fix): the intake floor used to be a fixed $40
 * baked into this text; it's been organizer-configurable since 2026-09-25
 * (WorkspaceSettings.consignmentMinimumPriceCents, see itemController.ts's
 * getConsignmentMinimumPriceCents) and the template never caught up. Rendered per
 * organizer via that same helper so this line always matches what intake actually
 * enforces.
 */
export const CONSIGNOR_AGREEMENT_TEMPLATE = `# Consignor Agreement

## 1. Item Intake

Intake is by appointment only. Every item, collection, or lot priced under {{consignmentMinimumPrice}} may be declined at intake and returned to you, or donated at your direction, at {{businessName}}'s discretion. There is no minimum on what an item may later sell for once it's on the floor (see Automatic Markdowns below). {{businessName}} determines final listed price, tags, and displays for each item; you may suggest a price, but {{businessName}} has final say.

## 2. Revenue Split

You receive {{commissionRate}} of the actual price each item sells for, with no fees or deductions taken off the top first. Because the split is based on actual sale price, markdowns (below) reduce what you are paid if the item sells at the marked-down price.

## 3. Automatic Markdowns

Items that haven't sold within a set number of days are automatically discounted on a schedule. {{markdownPolicySummary}}

## 4. Unsold Items

At intake you choose whether unsold items are returned, donated, or relisted. Your current preference on file: {{unsoldItemDisposition}}. Items are considered unclaimed {{returnPeriodDays}} days after intake.

## 5. Consignor Representations

You represent that each item you bring is yours to sell and is accurately described. {{businessName}} is not an insurer of your items and is not liable for loss, theft, or damage beyond ordinary care, except for its own negligence.
`;

export interface RenderedConsignorAgreement {
  version: number;
  bodyMarkdown: string; // raw template as stored (with {{placeholders}})
  renderedMarkdown: string; // same text with this consignor's real values substituted
  createdAt: Date;
}

/**
 * Returns the workspace's current (highest-version) agreement, lazily creating version 1
 * from CONSIGNOR_AGREEMENT_TEMPLATE the first time any consignor in that workspace needs
 * one. There is no authoring UI yet (out of scope for this build) -- a future organizer-
 * facing editor would create version 2+ through this same table.
 */
async function ensureCurrentAgreementVersion(workspaceId: string, fallbackCreatedByUserId: string) {
  const latest = await prisma.consignorAgreementVersion.findFirst({
    where: { workspaceId },
    orderBy: { version: 'desc' },
  });
  if (latest) return latest;

  return prisma.consignorAgreementVersion.create({
    data: {
      workspaceId,
      version: 1,
      bodyMarkdown: CONSIGNOR_AGREEMENT_TEMPLATE,
      createdByUserId: fallbackCreatedByUserId,
    },
  });
}

function humanizeDisposition(disposition: string | null): string {
  switch (disposition) {
    case 'RETURN':
      return 'Unsold items will be returned to you.';
    case 'DONATE':
      return 'Unsold items will be donated on your behalf.';
    case 'RELIST':
      return 'Unsold items will be relisted for continued sale.';
    default:
      return 'Not yet set -- please confirm your preference (return, donate, or relist) with the organizer.';
  }
}

/**
 * Renders the current agreement for a given consignor, substituting their real
 * commissionRate, returnPeriodDays, unsoldItemDisposition, and the organizer's real
 * configured markdown schedule (via getConsignorMarkdownPolicyNotice). Returns null if the
 * consignor doesn't exist.
 */
export async function renderConsignorAgreementForConsignor(
  consignorId: string
): Promise<RenderedConsignorAgreement | null> {
  const consignor = await prisma.consignor.findUnique({
    where: { id: consignorId },
    select: {
      id: true,
      workspaceId: true,
      commissionRate: true,
      returnPeriodDays: true,
      unsoldItemDisposition: true,
      workspace: {
        select: {
          owner: { select: { id: true, userId: true, businessName: true } },
        },
      },
    },
  });
  if (!consignor) return null;

  const organizerId = consignor.workspace.owner.id;
  const markdownPolicy = await getConsignorMarkdownPolicyNotice(organizerId);
  const version = await ensureCurrentAgreementVersion(consignor.workspaceId, consignor.workspace.owner.userId);
  const minimumPriceCents = await getConsignmentMinimumPriceCents(organizerId);
  const minimumPriceDisplay = `$${(minimumPriceCents / 100).toFixed(minimumPriceCents % 100 === 0 ? 0 : 2)}`;

  const renderedMarkdown = version.bodyMarkdown
    .replace(/\{\{\s*commissionRate\s*\}\}/g, `${consignor.commissionRate.toNumber()}%`)
    .replace(/\{\{\s*returnPeriodDays\s*\}\}/g, String(consignor.returnPeriodDays))
    .replace(/\{\{\s*unsoldItemDisposition\s*\}\}/g, humanizeDisposition(consignor.unsoldItemDisposition))
    .replace(/\{\{\s*markdownPolicySummary\s*\}\}/g, markdownPolicy.summary)
    .replace(/\{\{\s*consignmentMinimumPrice\s*\}\}/g, minimumPriceDisplay)
    .replace(/\{\{\s*businessName\s*\}\}/g, consignor.workspace.owner.businessName);

  return {
    version: version.version,
    bodyMarkdown: version.bodyMarkdown,
    renderedMarkdown,
    createdAt: version.createdAt,
  };
}
