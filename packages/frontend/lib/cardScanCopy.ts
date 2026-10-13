/**
 * cardScanCopy (ADR-138 batch B6): every user-facing string of the Scan cards screens, plus plain wording for each
 * error code the /api/card-scan routes can send (ADR-138 section 9).
 *
 * No React, no axios, no env reads, no network: plain data and functions, covered by
 * lib/__tests__/cardScanCopy.test.ts (copy lint: banned words, dashes and placeholder text).
 * Run: npm test   (node:test through tsx)
 *
 * Copy rules (ADR-138 section 12): plain short sentences, Smart or Suggested for anything automatic, and the
 * organizer's own choice always wins over a suggestion. The recognizer is called "Smart scan".
 */

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function cardsWord(n: number): string {
  return plural(n, 'card', 'cards');
}

export const SCAN_FILTER_LABELS: Record<string, string> = {
  NEEDS_DECISION: 'Needs a decision',
  READY: 'Ready',
  SKIPPED: 'Skipped',
  COMMITTED: 'Committed',
};

export const SCAN_NEED_LABELS: Record<string, string> = {
  PRINTING: 'Pick the printing',
  FINISH: 'Choose the finish',
  CONDITION: 'Choose the condition',
  NAME: 'Add the card name',
};

export const SCAN_PHASE_HINTS: Record<string, string> = {
  EMPTY: 'Place the next card on the stand.',
  SETTLING: 'Hold still.',
  CAPTURED: 'Got it. Take the card away.',
  WAIT_CLEAR: 'Take the card away.',
};

export const SCAN_COPY = {
  // Page
  pageTitle: 'Scan cards',
  pageIntro:
    'Put a card on the stand and take a picture. Nothing is added to your stock until you press the save button at the bottom.',
  backToItems: 'Back to add items',
  smartScanName: 'Smart scan',
  scryfallCredit: 'Card data: Scryfall',

  // Tabs
  tabCamera: 'Camera',
  tabUpload: 'Upload pictures',
  tabSearch: 'Search and add',

  // Camera
  cameraStarting: 'Starting the camera',
  cameraDenied:
    'We could not use the camera. Check that this page is allowed to use it, or add cards with Upload pictures or Search and add.',
  cameraUnavailable: 'This device has no camera we can use. You can add cards with Upload pictures or Search and add.',
  cameraRetry: 'Try the camera again',
  switchCamera: 'Switch camera',
  lightOn: 'Light on',
  lightOff: 'Light off',
  shutter: 'Take picture',
  shutterBusy: 'One moment, the last picture is still being taken.',
  autoCaptureLabel: 'Take pictures for me',
  autoCaptureHint:
    'Smart scan waits for the card to hold still, then takes the picture. Take the card away before you place the next one.',
  autoCaptureStartEmpty: 'Start with the stand empty so Smart scan can learn what an empty stand looks like.',
  retake: 'Take this one again',

  // Upload tab
  chooseImages: 'Choose pictures',
  chooseImagesHint: 'Pick one picture for each card. Large pictures are made smaller before they are sent.',
  imageTooBig: 'That picture is too large to send. Take it again or choose a smaller one.',
  imageWrongType: 'Only JPEG, PNG or WebP pictures can be sent.',

  // Search tab
  searchLabel: 'Card name',
  searchButton: 'Search',
  searchNoResults: 'No cards found. Check the spelling or use the typed details.',
  addByHand: 'Add by hand',

  // Send queue
  sendQueueHeading: 'Pictures',
  sendPaused: 'Sending is paused.',
  sendResume: 'Resume sending',
  sendRetry: 'Try again',
  sendDismiss: 'Dismiss',
  sendAllDone: 'All pictures sent.',
  sendHalted: 'Sending stopped. The pictures that are left are kept. You can resume when the problem is fixed.',
  sendWaiting: (n: number) => `${n} ${plural(n, 'picture', 'pictures')} waiting to send.`,
  sendSending: (n: number) => `Sending ${n} ${plural(n, 'picture', 'pictures')}.`,
  sendFailed: (n: number) => `${n} ${plural(n, 'picture', 'pictures')} could not be sent.`,

  // Session
  sessionHeading: 'This scan',
  sessionLabel: 'Name this scan (optional)',
  sessionLabelHint: 'For example Binder 3. Only you see this name.',
  sessionLabelTooLong: 'Use 60 characters or fewer.',
  sessionStart: 'Start scanning',
  sessionResumeHeading: 'Pick up where you left off',
  sessionResume: 'Open this scan',
  sessionNone: 'No scans in progress.',
  sessionUnnamed: 'Unnamed scan',
  sessionClosed: 'This scan is closed.',
  sessionCommitting: 'This scan is being saved. You can not change it right now.',
  sessionDefaultsHeading: 'Defaults for cards you do not set yourself',
  defaultConditionLabel: 'Condition',
  defaultConditionNone: 'No default',
  defaultConditionHint:
    'Only used for cards where you have not chosen a condition. Suggested conditions are never used unless you tap them.',
  defaultFinishLabel: 'Finish',
  defaultFinishNone: 'No default',
  defaultFinishHint: 'Cards that look foil always need your own choice.',
  discardButton: 'Discard this scan',
  discardConfirm: 'Throw away this scan? Your stock is not changed.',
  discardConfirmYes: 'Yes, discard',
  discardConfirmNo: 'Keep scanning',

  // Smart scan status
  smartScanDisabled: 'Smart scan is not turned on yet. You can still search for a card and add it by hand.',
  smartScanQuota: 'You have used this month\'s Smart tags. You can still add cards by search.',
  smartScanPaused: 'Smart scan is paused for today. You can still add cards by search.',
  smartScanTagsLeft: (n: number) => `${n} Smart ${plural(n, 'tag', 'tags')} left this month.`,
  cardListNotReady: 'The card list is not ready, so cards may need to be checked by hand.',

  // Delver
  delverNever: 'Delver has not sent anything yet.',
  delverConnected: (seconds: number) => `Delver connected, last event ${seconds} ${plural(seconds, 'second', 'seconds')} ago.`,
  delverConnectedMinutes: (minutes: number) => `Delver connected, last event ${minutes} ${plural(minutes, 'minute', 'minutes')} ago.`,

  // Queue
  queueHeading: 'Your cards',
  emptyAll: 'No cards yet. Take a picture or search for a card.',
  emptyNeedsDecision: 'Nothing needs a decision.',
  emptyReady: 'No cards are ready yet.',
  emptySkipped: 'No skipped cards.',
  emptyCommitted: 'Nothing saved yet.',
  refreshFailed: 'We could not refresh the list. We will keep trying.',
  loadingEntries: 'Loading your cards',
  filterCount: (label: string, n: number) => `${label} (${n})`,
  groupCount: (n: number) => `${n} ${plural(n, 'copy', 'copies')}`,
  groupHeldNote: (n: number) => `${n} ${plural(n, 'picture is', 'pictures are')} on hold and not counted.`,
  entryConflict: 'This card was changed somewhere else. We loaded the latest version.',
  entrySaving: 'Saving',
  entrySaveFailed: 'We could not save that change. It was put back.',
  unknownCard: 'Unknown card',

  // Entry card
  suggestedChip: 'Suggested',
  suggestedCondition: (conditionLabel: string) => `Suggested: ${conditionLabel}. Tap to use.`,
  useSuggested: 'Use suggested',
  useAsTyped: 'Use as typed',
  useAsTypedHint: 'Save the card with the details you typed. It will not be linked to the card list.',
  pickPrinting: 'Pick the printing',
  pickPrintingHint: 'Check the picture against your card.',
  moreFilters: 'Filter by set',
  quantityLabel: 'Quantity',
  quantityMore: 'One more copy',
  quantityLess: 'One less copy',
  priceLabel: 'Price',
  suggestedPrice: 'Suggested price',
  useSuggestedPrice: 'Use suggested price',
  conditionLabel: 'Condition',
  finishLabel: 'Finish',
  languageLabel: 'Language',
  nameLabel: 'Card name',
  setLabel: 'Set',
  numberLabel: 'Number',
  gradeLabel: 'Grade',
  skipEntry: 'Skip',
  unskipEntry: 'Bring back',
  removeEntry: 'Remove',
  thumbnailAlt: 'Your picture of the card',
  catalogImageAlt: 'The card from the card list',
  readFromPicture: 'Read from your picture',

  // Notices on an entry
  duplicateHeld: 'Looks like the same card as the last one. Count it as another copy?',
  countAsAnother: 'Count as another copy',
  sameCardIgnore: 'Same card, ignore',
  nameMismatch: 'The set and number we read do not match the name. Pick the right printing.',
  nameOnly: 'We found one printing with this name. Check the picture matches your card.',
  nameOnlyDetail: 'Set and number on the photo did not match. Check the picture.',
  gameNotServed: 'We do not have a card list for this game yet. Check the details and use them as typed.',
  catalogOff: 'The card list is not available right now. Check the details and use them as typed.',
  readFoilNote: 'This looks foil, so please choose the finish yourself.',
  entryErrorNote: 'This card could not be read. You can try the picture again or add it by hand.',
  entryCommitting: 'Saving this card.',
  entryCommitted: 'Saved to your stock.',
  entryNeedsHeading: 'Still needed',

  // Bulk bar
  bulkSelected: (n: number) => `${n} selected`,
  selectAll: 'Select all',
  clearSelection: 'Clear selection',
  bulkSetCondition: 'Set condition',
  bulkUseSuggested: 'Use suggested for selected',
  bulkSetFinish: 'Set finish',
  bulkSkip: 'Skip selected',
  bulkUnskip: 'Bring back selected',
  bulkDelete: 'Remove selected',
  bulkDeleteConfirm: 'Remove these cards from this scan? Your stock is not changed.',
  bulkTooMany: (max: number) => `Up to ${max} cards can be changed at once. We will send them in groups.`,
  bulkResult: (updated: number, ignored: number) =>
    ignored > 0
      ? `Changed ${updated} ${cardsWord(updated)}. ${ignored} ${plural(ignored, 'card was', 'cards were')} left as ${plural(ignored, 'it was', 'they were')}.`
      : `Changed ${updated} ${cardsWord(updated)}.`,
  bulkNothingToDo: 'None of the selected cards can take that change.',
  bulkNeedsCondition: 'Choose a condition first.',
  bulkNeedsFinish: 'Choose a finish first.',

  // Commit bar
  commitHeading: 'Add these cards to my stock',
  modeLabel: 'How should we count them?',
  addToStock: 'Add to my stock',
  replaceStock: 'Set my stock to this count',
  modeHintAdd: 'The count is added to what you already have.',
  modeHintReplace: 'The in stock number for each card is set to this count. Cards you have already sold stay counted as sold.',
  chooseModeFirst: 'Choose how to count before you continue.',
  commitButton: (n: number) => `Save ${n} ${cardsWord(n)}`,
  commitButtonIdle: 'Save cards',
  committing: 'Saving your cards. Please keep this page open.',
  commitDisclosureCondition: (n: number, conditionLabel: string) =>
    `${n} ${cardsWord(n)} will be saved as ${conditionLabel} (your default for this session).`,
  commitDisclosureFinish: (n: number, finishLabel: string) =>
    `${n} ${cardsWord(n)} will be saved as ${finishLabel} (your default for this session).`,
  commitNotReady: (n: number) => `${n} ${cardsWord(n)} still ${plural(n, 'needs', 'need')} a decision and will not be saved yet.`,
  commitBlockerMode: 'Choose how to count before you continue.',
  commitBlockerNothingReady: 'No cards are ready yet.',
  commitBlockerUploading: 'Pictures are still sending.',
  commitBlockerSaving: 'Your changes are still saving.',
  commitBlockerNotOpen: 'This scan can not be saved right now.',
  commitDoneHeading: 'Saved',
  commitSummary: (created: number, merged: number, skipped: number, errors: number) =>
    `${created} new, ${merged} added to existing stock, ${skipped} skipped, ${errors} with problems.`,
  commitNeedsPrice: (n: number) => `${n} ${cardsWord(n)} ${plural(n, 'has', 'have')} no price yet.`,
  commitNotCommittedHeading: 'Not saved',
  commitFailedHeading: 'Could not be saved',
  commitScanAgain: 'Start a new scan',
  commitKeepGoing: 'Keep going with this scan',
  commitAlreadyApplied: 'These cards were already saved. Nothing was added twice.',

  // Screens added in B7 (page, camera, upload, search, queue, entry cards)
  pageLoading: 'Loading',
  statusLoading: 'Getting ready',
  statusFailed: 'We could not check whether scanning is ready.',
  loadingScan: 'Opening your scan',
  loadScanFailed: 'We could not open this scan.',
  leaveScan: 'Back to my scans',
  sessionsLoading: 'Looking for scans in progress',
  sessionStarting: 'Starting',
  openScanLabel: (name: string) => `Open scan ${name}`,
  captureHeading: 'Add cards',
  pictureTaken: 'Picture taken.',
  standIsEmpty: 'The stand is empty',
  autoStuck: 'Still waiting for the stand to be empty. Take the card away, or start over.',
  autoReset: 'Start over',
  preparingPictures: 'Getting your pictures ready',
  sendNothingWaiting: 'No pictures waiting.',
  sendRetryAll: 'Try all again',
  gameLabel: 'Game',
  searchNeedsMore: 'Type at least 2 letters of the name, or a set and a number.',
  searching: 'Searching',
  searchError: 'We could not search the card list. Try again.',
  usePrinting: 'Use this printing',
  candidatesMore: 'There are more printings than these. Use Filter by set to find the right one.',
  resultsCapped: 'Only the first 20 are shown. Add more to the name, set or number to narrow it down.',
  addCard: 'Add',
  addPrintingLabel: (name: string) => `Add ${name} to this scan`,
  addedCard: (name: string) => `Added ${name}. Choose its finish and condition in your cards below.`,
  addByHandHint: 'Add by hand saves the name, set and number you typed. It is not linked to the card list.',
  filtersLabel: 'Filter your cards',
  showMore: 'Show more',
  showingCount: (shown: number, total: number) => `Showing ${shown} of ${total}.`,
  selectCard: (name: string) => `Select ${name}`,
  noPicture: 'No picture of your card',
  noCatalogImage: 'No card picture',
  gradeLine: (grader: string, grade: string) => {
    const text = [grader, grade].filter((part) => part !== '').join(' ');
    return text === '' ? 'Graded card' : `Graded: ${text}`;
  },
  chooseCondition: 'Choose a condition',
  chooseFinish: 'Choose a finish',
  bulkApply: 'Apply',
  bulkDeleteYes: 'Yes, remove',
  bulkDeleteNo: 'Keep them',
  suggestedPriceLoading: 'Looking up a price',
  suggestedPriceNone: 'No suggested price for this card.',
  suggestedPriceError: 'We could not look up a price.',
  suggestedPriceValue: (price: string) => `Suggested price: ${price}`,

  // Delver panel labels (used by the B8 settings panel)
  delverPanelHeading: 'Delver',
  delverUrlLabel: 'Your Delver address',
  delverUrlOnce: 'Copy this address now. It is shown only once.',
  delverRevoke: 'Turn this address off',
} as const;

export interface ScanWording {
  message: string;
  help: string;
}

/** Plain wording for every code the /api/card-scan routes can send (ADR-138 section 9), plus failures that never reach the server. */
export const SCAN_ERROR_WORDING: Record<string, ScanWording> = {
  UNAUTHORIZED: { message: 'You need to sign in again.', help: 'Sign in and come back to this scan. Your cards are kept.' },
  SESSION_ENDED: { message: 'Your sign in ended.', help: 'Sign in again. Your cards are kept and your pictures are still waiting to send.' },
  FORBIDDEN: { message: 'This account can not scan cards.', help: 'Sign in with your organizer account.' },
  NOT_YOUR_SALE: { message: 'That sale belongs to a different account.', help: 'Go back and choose one of your own sales.' },
  SALE_NOT_FOUND: { message: 'We could not find that sale.', help: 'Go back and choose a sale from your list.' },
  SESSION_NOT_FOUND: { message: 'We could not find that scan.', help: 'It may have been discarded. Start a new scan.' },
  ENTRY_NOT_FOUND: { message: 'We could not find that card in this scan.', help: 'The list will refresh. Try again.' },
  TOO_MANY_OPEN_SESSIONS: { message: 'This sale already has 5 scans open.', help: 'Open one of them, or discard one you no longer need.' },
  BAD_REQUEST: { message: 'We could not understand that request.', help: 'Reload the page and try again.' },
  BAD_FRAME: { message: 'That picture could not be used.', help: 'Take the picture again. Only JPEG, PNG or WebP pictures work.' },
  FRAME_TOO_LARGE: { message: 'That picture is too large.', help: 'Take the picture again. Pictures must be under 1.5 MB.' },
  AI_QUOTA_EXCEEDED: { message: 'You have used this month\'s Smart tags.', help: 'You can still add cards by search.' },
  SCAN_CAP_REACHED: { message: 'Smart scan is paused for today.', help: 'You can still add cards by search.' },
  RATE_LIMITED: { message: 'That was too fast.', help: 'Wait a moment. Pictures keep sending on their own.' },
  SCAN_DISABLED: { message: 'Smart scan is not turned on yet.', help: 'You can still search for a card and add it by hand.' },
  PROVIDER_UNAVAILABLE: { message: 'Smart scan could not read that picture right now.', help: 'Try the picture again in a minute, or add the card by hand.' },
  SESSION_NOT_OPEN: { message: 'This scan is not open.', help: 'Start a new scan.' },
  SESSION_FULL: { message: 'This scan is full.', help: 'Save the cards that are ready, then start a new scan.' },
  SESSION_COMMITTING: { message: 'This scan is being saved.', help: 'Wait until it finishes. Then you can keep going.' },
  CARD_VALIDATION: { message: 'Some card details are not valid.', help: 'Check the details and try again.' },
  CARD_NOT_FOUND: { message: 'We could not find that card in the card list.', help: 'Search again, or add it with the typed details.' },
  ENTRY_CHANGED: { message: 'This card was changed somewhere else.', help: 'We loaded the latest version. Make your change again.' },
  MODE_REQUIRED: { message: 'Choose how to count the cards.', help: 'Pick Add to my stock or Set my stock to this count.' },
  MODE_MISMATCH: { message: 'This scan was already started with a different count choice.', help: 'Use the same choice you used before.' },
  ALREADY_APPLIED: { message: 'These cards were already saved.', help: 'Nothing was added twice.' },
  DB_SPACE_LOW: { message: 'There is not enough room to save right now.', help: 'Try again later. Your cards are kept.' },
  NOTHING_READY: { message: 'No cards are ready to save.', help: 'Finish the cards that need a decision first.' },
  SERVER_ERROR: { message: 'Something went wrong on our side.', help: 'Try again in a moment. Your cards are kept.' },
  NETWORK_ERROR: { message: 'We could not reach the server.', help: 'Check your connection. Pictures keep trying on their own.' },
  CANCELLED: { message: 'That was stopped.', help: 'Nothing was changed.' },
  BAD_RESPONSE: { message: 'The server sent something we could not read.', help: 'Reload the page and try again.' },
  UNKNOWN: { message: 'Something went wrong.', help: 'Try again. If it keeps happening, reload the page.' },
};

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Wording for a code. Unknown codes and prototype names fall back to the generic message. */
export function wordingForScanError(code: string | null | undefined): ScanWording {
  if (typeof code === 'string' && hasOwn(SCAN_ERROR_WORDING, code)) return SCAN_ERROR_WORDING[code];
  return SCAN_ERROR_WORDING.UNKNOWN;
}

/** The hint for a capture phase (EMPTY, SETTLING, CAPTURED, WAIT_CLEAR). Unknown phases give an empty hint. */
export function phaseHint(phase: string): string {
  return hasOwn(SCAN_PHASE_HINTS, phase) ? SCAN_PHASE_HINTS[phase] : '';
}

/** "Delver connected, last event 12 seconds ago." from the age in whole seconds, or null when nothing has arrived. */
export function delverStatusLine(ageSeconds: number | null): string {
  if (ageSeconds === null || !isFinite(ageSeconds) || ageSeconds < 0) return SCAN_COPY.delverNever;
  if (ageSeconds < 90) return SCAN_COPY.delverConnected(Math.round(ageSeconds));
  return SCAN_COPY.delverConnectedMinutes(Math.round(ageSeconds / 60));
}

/** Every string a person can read in this module, for the copy lint test. */
export function allScanCopy(): string[] {
  const out: string[] = [];
  const push = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
  };
  Object.keys(SCAN_FILTER_LABELS).forEach((k) => push(SCAN_FILTER_LABELS[k]));
  Object.keys(SCAN_NEED_LABELS).forEach((k) => push(SCAN_NEED_LABELS[k]));
  Object.keys(SCAN_PHASE_HINTS).forEach((k) => push(SCAN_PHASE_HINTS[k]));
  Object.keys(SCAN_ERROR_WORDING).forEach((k) => {
    push(SCAN_ERROR_WORDING[k].message);
    push(SCAN_ERROR_WORDING[k].help);
  });
  // Functions that take something other than one number get their own sample arguments.
  const customSamples: Record<string, unknown[][]> = {
    filterCount: [['Ready', 0], ['Ready', 12]],
    suggestedCondition: [['Near Mint']],
    commitDisclosureCondition: [[1, 'Near Mint'], [12, 'Near Mint']],
    commitDisclosureFinish: [[1, 'Foil'], [3, 'Non-foil']],
    commitSummary: [[5, 2, 1, 0], [0, 0, 0, 0]],
    bulkResult: [[2, 0], [1, 1], [0, 3]],
    openScanLabel: [['Binder 3']],
    addPrintingLabel: [['Lightning Bolt']],
    addedCard: [['Lightning Bolt']],
    showingCount: [[40, 120], [1, 1]],
    selectCard: [['Lightning Bolt']],
    gradeLine: [['PSA', '9'], ['', '']],
    suggestedPriceValue: [['$1.25']],
  };
  const numberSamples: unknown[][] = [[0], [1], [2], [12]];
  const copy = SCAN_COPY as unknown as Record<string, unknown>;
  Object.keys(copy).forEach((k) => {
    const v = copy[k];
    if (typeof v === 'string') {
      out.push(v);
    } else if (typeof v === 'function') {
      const fn = v as (...args: unknown[]) => unknown;
      const samples = hasOwn(customSamples, k) ? customSamples[k] : numberSamples;
      samples.forEach((args) => {
        try {
          push(fn(...args));
        } catch {
          /* a sample that does not fit this function */
        }
      });
    }
  });
  push(delverStatusLine(null));
  push(delverStatusLine(12));
  push(delverStatusLine(1));
  push(delverStatusLine(300));
  return out;
}
