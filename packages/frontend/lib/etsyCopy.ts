/**
 * lib/etsyCopy.ts -- every organizer-facing string for the Etsy connector UI (ADR-135 D7.4, D8, batch E-B5).
 *
 * Copy rules (CLAUDE.md and the ADR): never the word "AI", never "estate sale" (say "sale"), no em dashes,
 * no placeholder text, plain words. lib/__tests__/etsyCopy.test.ts walks every export in this file and
 * fails on a violation, so add new strings HERE (not inline in a component) to keep them covered.
 *
 * Pure module: no imports, no env reads, no clock reads.
 *
 * ETSY_ATTRIBUTION must stay identical to ETSY_ATTRIBUTION in
 * packages/backend/src/services/marketplace/etsyAuth.ts (ADR-135 D7.4: Etsy's own trademark sentence,
 * "fetched twice" from https://www.etsy.com/legal/api; legal confirms the live wording at review, ADR D9).
 * The test compares the two files when the backend source is present.
 */

/** Trademark sentence. Shown as a footnote in the Etsy settings tab and in the draft review modal. */
export const ETSY_ATTRIBUTION =
  "The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.";

export const ETSY_LISTING_FEE_AMOUNT = '$0.20';

/** Etsy's listing life (4 months, ADR-135 D2.4) and our choice not to auto-renew (ADR D-10). */
export const ETSY_FEE_NOTICE =
  'Etsy charges a $0.20 listing fee when your item goes live on Etsy. The listing runs for 4 months and will not renew on its own.';

/** Attestation shown next to a checkbox the organizer must tick (ADR-135 D8, verbatim). */
export const ETSY_ATTESTATION_TEXT =
  'I confirm this item is at least 20 years old, or is a craft or party supply, and that these details are accurate. Etsy charges a $0.20 listing fee when it goes live.';

export const ETSY_ELIGIBILITY_NOTE =
  'Etsy only accepts items that are 20 or more years old, items you made or designed, or craft and party supplies.';

export const ETSY_GENERIC_ERROR = 'Etsy could not complete this step. Try again, or contact support.';
export const ETSY_BUSY_ERROR = 'Etsy is busy. Try again in a moment.';

// ---------------------------------------------------------------------------------------------
// Connect panel (Settings, Etsy tab).
// ---------------------------------------------------------------------------------------------

export const ETSY_PANEL_COPY = {
  heading: 'Etsy shop',
  intro:
    'Connect your Etsy shop to send vintage items and craft supplies from FindA.Sale to Etsy. You review every draft yourself and decide when it goes live.',
  loading: 'Checking your Etsy connection...',
  loadError: 'We could not check your Etsy connection right now.',
  retry: 'Try again',
  connect: 'Connect Etsy',
  connecting: 'Taking you to Etsy...',
  connectFailed: 'We could not start the Etsy connection. Try again in a moment.',
  reconnect: 'Reconnect Etsy',
  needsReconnect: 'Etsy needs you to reconnect your shop.',
  reconnectHelp: 'Your listings are safe. Reconnecting lets FindA.Sale keep them up to date.',
  expiresSoon: 'Your Etsy connection will run out soon. Reconnect to keep it working.',
  disabled: 'Etsy is not available right now.',
  notAllowed: 'Etsy is not enabled for your account yet.',
  busy: 'Etsy is busy. Some actions may take longer.',
  connectedTitle: 'Etsy connected',
  shopLabel: 'Shop',
  connectedOn: 'Connected on',
  setupHeading: 'Shipping and processing',
  setupIntro: 'Choose the Etsy profiles to use for new drafts. You can change them for each item.',
  setupNeeded: 'Choose your shipping and processing profiles to start sending items to Etsy.',
  setupDone: 'Your Etsy shipping and processing choices are saved.',
  setupLoading: 'Loading your Etsy profiles...',
  setupLoadError: 'We could not load your Etsy profiles right now.',
  setupEmpty: 'Create a shipping profile and a processing profile in your Etsy shop settings, then come back.',
  setupCheckAgain: 'Check again',
  shippingLabel: 'Shipping profile',
  returnLabel: 'Return policy',
  processingLabel: 'Processing profile',
  choose: 'Choose one',
  noReturnPolicies: 'Your Etsy shop has no return policy yet. You can add one in your Etsy shop settings.',
  saveSetup: 'Save choices',
  savingSetup: 'Saving...',
  setupSaveFailed: 'We could not save your choices. Check them and try again.',
  disconnect: 'Disconnect Etsy',
  disconnecting: 'Disconnecting...',
  keepConnected: 'Keep connected',
  confirmDisconnect: 'Disconnect anyway',
  disconnectFailed: 'We could not disconnect Etsy right now. Try again in a moment.',
  disconnectNotice:
    "Your Etsy listings stay live on Etsy. FindA.Sale can no longer end them for you. To remove FindA.Sale's access, open Etsy account settings, Apps.",
  dismiss: 'Dismiss',
} as const;

export function etsyCurrencyMessage(code: string): string {
  return `Your Etsy shop uses ${code}. Etsy listings from FindA.Sale currently need a USD shop.`;
}

export function etsyConfirmDisconnectMessage(activeListingCount: number): string {
  const noun = activeListingCount === 1 ? 'listing is' : 'listings are';
  return `${activeListingCount} Etsy ${noun} live or waiting to be published. Disconnecting leaves live listings on Etsy. Confirm to continue.`;
}

// ---------------------------------------------------------------------------------------------
// Banners shown in the Etsy tab after the callback page sends the organizer back (keys are a
// fixed whitelist, never text taken from the address bar).
// ---------------------------------------------------------------------------------------------

export const ETSY_BANNER_MESSAGES = {
  connected: 'Your Etsy shop is connected.',
  denied: 'The Etsy connection was cancelled. Nothing was changed.',
  missing: 'We did not get a reply from Etsy. Start the connection again from this page.',
  ETSY_CONNECT_FAILED: 'We could not complete the Etsy connection. Please start the connection again.',
  ETSY_NO_SHOP: 'We could not find an Etsy shop on that Etsy account. Open a shop on Etsy, then connect again.',
  ETSY_SHOP_IN_USE: 'That Etsy shop is already connected to another FindA.Sale account.',
  ETSY_NOT_ALLOWED: 'Etsy is not enabled for your account yet.',
  ETSY_DISABLED: 'Etsy is not available right now.',
  ETSY_BUSY: ETSY_BUSY_ERROR,
  generic: 'We could not complete the Etsy connection. Please start the connection again.',
} as const;

export type EtsyBannerKey = keyof typeof ETSY_BANNER_MESSAGES;

// ---------------------------------------------------------------------------------------------
// OAuth callback page.
// ---------------------------------------------------------------------------------------------

export const ETSY_CALLBACK_COPY = {
  pageTitle: 'Connecting Etsy',
  workingTitle: 'Finishing your Etsy connection',
  workingBody: 'This only takes a moment. Please keep this page open.',
  redirecting: 'Taking you back to your settings...',
  continueLabel: 'Go to Etsy settings',
} as const;

// ---------------------------------------------------------------------------------------------
// Listing status chip and per-item section.
// ---------------------------------------------------------------------------------------------

export const ETSY_STATUS_LABELS = {
  PREPARING: 'Preparing',
  DRAFT_PENDING: 'Creating draft',
  DRAFT_READY: 'Draft ready',
  PUBLISHING: 'Publishing',
  ACTIVE: 'Live on Etsy',
  ENDED: 'Ended on Etsy',
  SOLD: 'Sold on Etsy',
  FAILED: 'Needs attention',
  ORPHANED: 'Left on Etsy',
} as const;

export const ETSY_STATUS_DETAILS = {
  PREPARING: 'Your details are saved. The draft has not been created yet.',
  DRAFT_PENDING: 'We are creating your draft on Etsy. This can take a minute.',
  DRAFT_READY: 'Needs your confirmation before it goes live.',
  PUBLISHING: 'We are publishing this item on Etsy.',
  ACTIVE: 'This item is for sale on Etsy.',
  ENDED: 'This listing is no longer on Etsy. You can prepare it again.',
  SOLD: 'This item sold on Etsy.',
  ORPHANED: 'This listing is still on Etsy, but FindA.Sale no longer manages it.',
} as const;

export const ETSY_FAILED_STEP_MESSAGES = {
  CREATE: 'Etsy could not create the draft for this item.',
  IMAGES: "Etsy could not take this item's photos.",
  PUBLISH: 'Etsy could not publish this item.',
  UPDATE: 'We could not update this listing on Etsy. Check the price and quantity on Etsy.',
  DELETE: 'We could not remove this listing from Etsy.',
  UNKNOWN: 'Something went wrong with this Etsy listing.',
} as const;

export const ETSY_SECTION_COPY = {
  heading: 'Etsy',
  prepare: 'Prepare for Etsy',
  prepareHelp: 'Etsy lists vintage items and craft supplies. You review a draft first, and nothing goes live until you publish it.',
  seeProgress: 'See progress',
  reviewAndPublish: 'Review and publish',
  viewDetails: 'View details',
  fixAndRetry: 'Fix and try again',
  reconnectLink: 'Open Etsy settings',
  pushPaused: 'Sending items to Etsy is paused right now. Check back soon.',
  loading: 'Checking Etsy...',
  loadError: 'We could not check this item for Etsy right now.',
  retry: 'Try again',
  priceNote: 'Price changes you make here are sent to Etsy. Price edits made directly on Etsy will be replaced.',
} as const;

// ---------------------------------------------------------------------------------------------
// Draft review modal.
// ---------------------------------------------------------------------------------------------

export const ETSY_MODAL_COPY = {
  title: 'Prepare this item for Etsy',
  close: 'Close',
  stepDraft: 'Step 1: Save a draft',
  stepPublish: 'Step 2: Publish',
  draftHelp: 'Saving a draft sends this item to your Etsy shop but does not list it for sale. Nothing is charged until you publish.',
  eraLabel: 'When was this item made?',
  eraChoose: 'Choose a time period',
  eraHelpVintage: 'Etsy accepts items that are 20 or more years old. Only qualifying periods are listed.',
  eraHelpSupply: 'Craft and party supplies can be any age, so every time period is listed.',
  supplyLabel: 'This is a craft or party supply',
  categoryLabel: 'Etsy category',
  categorySearch: 'Search categories',
  categoryChoose: 'Choose a category',
  categorySuggested: 'Suggested',
  categoryLoading: 'Loading categories...',
  categoryEmpty: 'No categories match your search.',
  categoryLoadError: 'We could not load Etsy categories right now.',
  categoryConfirmHint: 'Pick the category that fits best. We cannot choose it for you.',
  shippingLabel: 'Shipping profile',
  returnLabel: 'Return policy',
  returnNone: 'No return policy',
  processingLabel: 'Processing profile',
  choose: 'Choose one',
  optionsLoading: 'Loading your Etsy profiles...',
  optionsLoadError: 'We could not load your Etsy profiles right now.',
  retry: 'Try again',
  previewHeading: 'What Etsy will receive',
  previewNote: 'Links and email addresses are removed from the description, and Etsy may adjust some characters in the title.',
  previewTitle: 'Title',
  previewPrice: 'Price',
  previewQuantity: 'Quantity',
  previewTags: 'Tags',
  previewDescription: 'Description',
  previewPhotos: 'Photos',
  previewNoTags: 'No tags',
  previewNoDescription: 'No description',
  photoCountOne: '1 photo will be sent.',
  photoCountMany: (count: number, max: number): string =>
    count > max ? `${max} of ${count} photos will be sent. Etsy takes up to ${max}.` : `${count} photos will be sent.`,
  stillNeeded: 'Still needed:',
  saveDraft: 'Save draft on Etsy',
  savingDraft: 'Saving draft...',
  draftSaved: 'Draft saved on Etsy',
  lastPublishFailed: 'The last publish try did not go through.',
  draftPendingTitle: 'Creating your draft on Etsy',
  draftPendingBody: 'You can close this window. We will keep working and the status will update here.',
  draftPendingPhotos: (done: number, total: number): string => `${done} of ${total} photos sent`,
  draftSlow: 'This is taking longer than usual. Check back in a few minutes.',
  readyTitle: 'Your draft is ready on Etsy',
  readyBody: 'Look it over on Etsy if you like. It is not for sale until you publish it here.',
  publish: 'Publish on Etsy',
  publishing: 'Publishing...',
  publishFeeHeading: 'Before you publish',
  discard: 'Discard draft',
  discarding: 'Discarding...',
  discardConfirm: 'Discard this draft?',
  discardConfirmBody: 'The draft is removed from your Etsy shop. Your item in FindA.Sale is not changed.',
  discardYes: 'Yes, discard',
  discardNo: 'Keep draft',
  liveTitle: 'This item is live on Etsy',
  liveUntil: (date: string): string => `The listing runs until ${date}. It will not renew on its own.`,
  liveNoDate: 'It will not renew on its own.',
  remove: 'Remove from Etsy',
  removing: 'Removing...',
  removeConfirm: 'Remove this item from Etsy?',
  removeConfirmBody: 'The listing is deleted on Etsy. This cannot be undone.',
  removeYes: 'Yes, remove',
  removeNo: 'Keep listing',
  soldTitle: 'This item sold on Etsy',
  orphanedTitle: 'This listing is no longer managed here',
  failedTitle: 'This listing needs attention',
  tryAgain: 'Try again',
  publishBlockedFallback: 'Etsy would not publish this draft. Check your shipping profile and photos on Etsy, then try again.',
  attestationMissing: 'This draft has no confirmation on file. Discard it and save a new draft.',
  endedNote: 'The earlier listing is no longer on Etsy. Saving a new draft starts fresh.',
  closeAria: 'Close this window',
  blockedHeading: 'This item cannot go to Etsy yet',
  categorySelected: 'Chosen category',
  categoryChange: 'Change category',
  categoryUse: 'Use this category',
  categorySavedEarlier: 'Category chosen earlier',
  photosNone: 'No photos yet',
  feeLabel: 'Listing fee',
  summaryHeading: 'Draft details',
  summaryEra: 'Time period',
  summarySupply: 'Marked as a craft or party supply.',
  loading: 'Loading...',
} as const;

/** Short names for the "Still needed" list (all lower case, joined with commas by the modal). */
export const ETSY_MISSING_LABELS = {
  era: 'time period',
  category: 'Etsy category',
  shipping: 'shipping profile',
  processing: 'processing profile',
  attestation: 'confirmation box',
} as const;

/** Plain-word reasons the draft cannot be started (ADR-135 D4, D2.6, D7.1). */
export const ETSY_PROBLEM_MESSAGES = {
  notConnected: 'Connect your Etsy shop in Settings first.',
  needsReconnect: 'Etsy needs you to reconnect your shop. Open Settings, then the Etsy tab.',
  notAllowed: 'Etsy is not enabled for your account yet.',
  disabled: 'Etsy is not available right now.',
  pushPaused: 'Sending items to Etsy is paused right now. Check back soon.',
  titleMissing: 'Add a title to this item before listing it on Etsy.',
  priceMissing: 'Add a price to this item before listing it on Etsy.',
  noPhotos: 'Add at least one photo to this item before listing it on Etsy.',
  soldOut: 'All units of this item are sold, so there is nothing left to list on Etsy.',
} as const;
