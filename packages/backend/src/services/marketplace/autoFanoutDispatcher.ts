/**
 * autoFanoutDispatcher.ts — Approve-to-Autolist Fan-Out, API tier (Discogs + Reverb only).
 *
 * See claude_docs/feature-notes/ADR-DRAFT-approve-to-autolist-fanout-2026-09-16.md,
 * "Architect Handoff — 2026-09-17", section C. This is the locked contract this file
 * implements verbatim -- do not re-derive the design here.
 *
 * Called non-blocking (`.catch(...)`, never awaited) from publishItem
 * (itemController.ts) the moment an item is approved/published. The content-script
 * tier (Craigslist, Facebook, Gumtree AU, Grailed, Poshmark, Mercari) is a SEPARATE
 * mechanism -- GET /extension/autolist-queue (extensionController.ts) -- not this file.
 * eBay is unaffected -- already automated via ebayQueueMode/ebayListingQueueCron.ts.
 *
 * Safety posture (deliberate, per the handoff):
 *   - Never trusts a value passed in from the caller -- re-reads the organizer's opt-in
 *     booleans fresh from the DB on every call.
 *   - Re-checks eligibility fresh on every call (TOCTOU-safe) -- never reuses an
 *     eligibility result computed earlier in the request.
 *   - Each platform runs in its own try/catch. One platform's failure/thrown error
 *     never blocks the other -- deliberately NOT Promise.all.
 *   - Never rethrows to the caller. publishItem's response to the organizer must never
 *     be affected by an auto-fanout failure on either platform.
 *   - publish: true -- these are the only two tiers that go straight to a live listing
 *     with no organizer review step, per the handoff's explicit contract.
 */

import type { Item } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { checkDiscogsEligibility, upsertDiscogsListingForItem } from './discogsListingConnector';
import { createReverbListing } from './reverbConnector';
import { checkEligibility } from '../marketplaceEligibilityRules';

export async function dispatchApiTierAutoFanout(organizerId: string, item: Item): Promise<void> {
  let flags: { discogsAutoListEnabled: boolean; reverbAutoListEnabled: boolean } | null = null;
  try {
    flags = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { discogsAutoListEnabled: true, reverbAutoListEnabled: true },
    });
  } catch (err) {
    console.error('[AutoFanout] failed to read organizer opt-in flags for organizer', organizerId, err);
    return;
  }
  if (!flags) return;

  // Discogs -- independent try/catch; a Discogs failure must never block Reverb below.
  if (flags.discogsAutoListEnabled === true) {
    try {
      // 2026-09-22 (duplicate-listing fix): if the item is already on Discogs, the upsert
      // updates that listing (price, Draft -> For Sale) instead of creating a second one, and
      // it persists discogsListingId/discogsListedAt after a create (this path previously
      // dropped the new listing id on the floor). Eligibility is only needed for a create.
      const eligible = item.discogsListingId ? true : (await checkDiscogsEligibility(organizerId, item)).eligible;
      if (eligible) {
        await upsertDiscogsListingForItem(organizerId, item.id, { publish: true });
      }
    } catch (err) {
      console.error('[AutoFanout] Discogs auto-list failed for item', item.id, err);
    }
  }

  // Reverb -- independent try/catch; a Reverb failure must never block Discogs above.
  if (flags.reverbAutoListEnabled === true) {
    try {
      const eligibility = checkEligibility('REVERB', item);
      if (eligibility.eligible) {
        await createReverbListing(organizerId, item, { publish: true });
      }
    } catch (err) {
      console.error('[AutoFanout] Reverb auto-list failed for item', item.id, err);
    }
  }
}
