/**
 * cardIntakeCopy (ADR-134 #642, batch B8): every user-facing string of the card intake screens, plus the
 * plain-wording map for every error code the backend can send (routes/cardIntake.ts, controllers/cardIntakeController.ts,
 * services/cardIntake/messages.ts) and the row error codes of ADR-134 section 4.8.
 *
 * No React, no axios, no env reads, no network: plain data and functions, covered by
 * lib/__tests__/cardIntakeCopy.test.ts (copy lint: no "AI", no "estate sale", no em dashes, no placeholder text).
 * Run: npm test   (node:test through tsx)
 *
 * The screens show the server's own `error` text first (the backend wording is already plain) and add the
 * short "what to do" line from this map. When the server sent no text (a dropped connection, a proxy page)
 * the message in this map is shown instead.
 */

export const INTAKE_STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'conditions', label: 'Condition mapping' },
  { id: 'rows', label: 'Ambiguous rows' },
  { id: 'confirm', label: 'Confirm' },
] as const;

export type IntakeStepId = (typeof INTAKE_STEPS)[number]['id'];

/** The button label that starts a new import. Named once so the hint that points at it cannot drift from it. */
const IMPORT_ANOTHER_LABEL = 'Import another file';
const ERRORS_FILE_NAME = 'errors.csv';

export const INTAKE_COPY = {
  pageTitle: 'Import cards from a spreadsheet',
  pageIntro:
    'Upload a CSV from ManaBox, Moxfield or TCGplayer, or any other spreadsheet of cards. You check everything first, and nothing is added until you press Import.',
  backToItems: 'Back to add items',
  stepsLabel: 'Import steps',
  stepDone: 'done',
  stepCurrent: 'current step',

  // Upload step
  uploadHeading: 'Choose your spreadsheet',
  formatsHeading: 'Files we can read',
  formatsLoading: 'Loading the list of file types',
  formatsError: 'We could not load the list of file types. You can still choose a file and check it.',
  formatsRetry: 'Try again',
  chooseFile: 'Choose a CSV file',
  changeFile: 'Choose a different file',
  fileInputLabel: 'Spreadsheet file (CSV, TSV or TXT)',
  noFileChosen: 'No file chosen yet.',
  checkFile: 'Check my file',
  checkingFile: 'Checking your file',
  cancelCheck: 'Stop checking',
  checkStopped: 'The check was stopped. Nothing was added. Choose Check my file to try again.',
  restoredNote: 'Your earlier choices for this file were put back. Look them over before you import.',
  uploading: 'Uploading your file',
  parsing: 'Reading your file and matching cards',
  parsingHint: 'A big file can take a minute or two. Please keep this page open.',
  optionsHeading: 'Options',
  optionsHint: 'Most files need none of these. Leave them as they are unless a check tells you otherwise.',
  formatLabel: 'File type',
  formatAuto: 'Detect it for me',
  gameLabel: 'Game',
  gameAuto: 'Use the file or the usual choice',
  defaultConditionLabel: 'Condition for rows that have none',
  defaultConditionNone: 'Leave the condition blank',
  defaultConditionHint: 'Only used for rows where the condition cell is empty. Nothing is assumed.',
  resumeHeading: 'Closed this page in the middle of an import?',
  resumeBody:
    'Choose the same file again and check it. On the last step you will see where the earlier import stopped, and Import continues from there. Cards that were already added are not added twice. Your earlier choices come back on this device when you pick the same file.',
  limitsRows: (rows: number) => `Up to ${rows.toLocaleString('en-US')} rows per file.`,
  limitsSize: (mb: number) => `Up to ${mb} MB per file.`,
  fileTooBig: (mb: number) => `That file is larger than ${mb} MB. Split it into smaller files and import them one at a time.`,
  fileWrongType: 'Only CSV, TSV or TXT files can be imported. In your spreadsheet app, choose Save As or Export and pick CSV.',
  fileEmpty: 'That file is empty. Choose a file that has your cards in it.',

  // Column chooser
  columnsHeading: 'Which column is which?',
  columnsIntro: 'Tell us which column of your file holds each detail. Only the card name is required.',
  columnsNone: 'Not in my file',
  columnsMore: 'Show more columns',
  columnsLess: 'Show fewer columns',
  columnsApply: 'Check my file with these columns',
  columnsChange: 'Change which column is which',
  columnsChangeWarning: 'Checking again starts the review over, so the choices you made in the next steps are cleared.',
  columnsNeedName: 'Choose the column that holds the card name.',
  columnsNoHeaders: 'We could not read the column names from this file.',

  // Preview summary
  previewHeading: 'What we found',
  previewFile: (name: string) => `File: ${name}`,
  previewFormat: (label: string) => `Looks like: ${label}`,
  previewRows: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'} in your file`,
  previewEmptyHeading: 'This file has no card rows',
  previewEmptyBody: 'The file has a header row but no cards under it. Check that you chose the right file, then choose it again.',
  previewEmptyAction: 'Choose a different file',
  catalogOff:
    'Card lookup is off right now, so cards are added with the details from your file. You can fill in more details on each card later.',
  catalogNoGame: 'Card lookup does not cover this game yet, so cards are added with the details from your file.',
  statWillCreate: 'New cards to add',
  statWillMerge: 'Already in this sale',
  statNeedsLook: 'Need your choice',
  statNoMatch: 'No catalog match',
  statProblems: 'Rows with problems',
  statNeedsPrice: 'With no price',
  sampleHeading: 'First rows of your file',
  sampleEmpty: 'There are no rows to show.',
  sampleQty: 'Qty',
  sampleSet: 'Set',
  sampleNumber: 'Number',
  sampleFinish: 'Finish',
  sampleCondition: 'Condition',
  samplePrice: 'Price',
  sampleRowLabel: (row: number) => `Row ${row}`,
  sampleRowColumn: 'Row',
  sampleCardColumn: 'Card',
  nextToConditions: 'Next: condition mapping',

  // Step 2: condition mapping
  conditionsHeading: 'Check the condition words',
  conditionsIntro:
    'Condition words mean different things in different apps, so we show each one from your file and a suggestion. We never turn a word into Near Mint on our own.',
  conditionsNone: 'Your file has no condition words to check. Cards with no condition are added with the condition left blank.',
  conditionsNoneDefault: (label: string) => `Cards with an empty condition cell are added as ${label}.`,
  conditionsColSource: 'In your file',
  conditionsColRows: 'Rows',
  conditionsColSuggested: 'Suggested',
  conditionsColChoice: 'Your choice',
  conditionsRowsCount: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'}`,
  conditionsMatched: 'Matched',
  conditionsNeedsCheck: 'Needs your check',
  conditionsNoSuggestion: 'No suggestion',
  conditionsChoose: 'Choose a condition',
  conditionsBlank: 'Leave blank',
  conditionsUseSuggestion: (label: string) => `Use ${label}`,
  conditionsUseAll: 'Use every suggestion',
  conditionsPending: (n: number) => `${n} ${n === 1 ? 'condition word still needs' : 'condition words still need'} your choice before you can import.`,
  conditionsAllSet: 'Every condition word has a choice.',
  conditionsChoiceFor: (source: string) => `Condition for ${source} in your file`,
  nextToRows: 'Next: ambiguous rows',

  // Step 3: ambiguous rows
  rowsHeading: 'Rows that need a look',
  rowsIntro:
    'Pick the right printing or finish for each card, or skip the row. A row that needs a choice and has none is skipped and listed in the errors file, never guessed. A card that is not in the catalog needs no choice: it is added with the details from your file.',
  rowsNone: 'No rows need your choice. Every card matched, or will be added with the details from your file.',
  rowsGroupPrinting: 'More than one printing matches',
  rowsGroupFinish: 'Choose the finish',
  rowsGroupNoMatch: 'No catalog match',
  rowsGroupNoMatchBody: 'These cards are not in the catalog. They are added with the details from your file. You can skip any of them.',
  rowsGroupNoMatchSample: (shown: number, total: number) =>
    `These cards are not in the catalog. All ${total.toLocaleString('en-US')} are added with the details from your file. Here are the first ${shown.toLocaleString('en-US')}. You can skip any of the rows shown. To leave out the others, take them out of your file first.`,
  rowsGroupCount: (n: number, pending: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'}, ${pending.toLocaleString('en-US')} still to choose`,
  rowsGroupCountSimple: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'}`,
  rowsShowGroup: 'Show these rows',
  rowsHideGroup: 'Hide these rows',
  rowsRowLabel: (row: number, name: string) => `Row ${row}: ${name}`,
  rowsFromFile: (set: string, number: string) => {
    const parts: string[] = [];
    if (set) parts.push(`set ${set}`);
    if (number) parts.push(`number ${number}`);
    return parts.length ? `In your file: ${parts.join(', ')}` : 'In your file: name only';
  },
  rowsNoMatchRow: 'No catalog match, will import with your details',
  rowsPick: 'Use this printing',
  rowsPicked: 'Chosen',
  rowsChooseFinish: 'Finish',
  rowsFinishPlaceholder: 'Choose a finish',
  rowsFinishFromFile: 'Use the finish in my file',
  rowsFinishNeeded: 'This printing comes in more than one finish. Choose one.',
  rowsSkip: 'Skip this row',
  rowsUnskip: 'Do not skip',
  rowsSkipped: 'Skipped',
  rowsPending: 'Needs a choice',
  rowsDecided: 'Chosen',
  rowsNoImage: 'No image',
  rowsMoreCandidates: 'More printings match than are shown. If yours is not here, skip this row and add the card by hand later.',
  rowsApplyHeading: 'Apply to all rows like this',
  rowsApplySkip: 'Skip every row here that has no choice',
  rowsApplySameSet: (setName: string) => `Use the ${setName} printing in every row where it is one of the choices`,
  rowsApplyFinishUnset: 'Apply this finish',
  rowsTabPending: 'rows still to choose',
  rowsTabRows: 'rows',
  rowsApplyFinish: (label: string) => `Use ${label} in every row here that offers it`,
  rowsApplied: (n: number) => `Applied to ${n} ${n === 1 ? 'row' : 'rows'}.`,
  rowsAppliedNone: 'No other rows matched.',
  rowsListLabel: 'Rows that need a look',
  rowsListHint: 'Scroll this list to see more rows. Use Tab to move between the choices.',
  rowsTruncated: (shown: number, hidden: number) =>
    `${shown > 0 ? `This page lists the first ${shown.toLocaleString('en-US')} rows that need a choice. ` : ''}${hidden.toLocaleString('en-US')} more ${hidden === 1 ? 'row needs' : 'rows need'} a choice but cannot be listed here. ${hidden === 1 ? 'It is' : 'They are'} skipped in this import and listed in the errors file. To finish ${hidden === 1 ? 'it' : 'them'}, download ${ERRORS_FILE_NAME} after the import, choose "${IMPORT_ANOTHER_LABEL}", and upload ${ERRORS_FILE_NAME}. Cards that are added now are not in that file, so they are not added twice.`,
  rowsPendingNote: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'row has' : 'rows have'} no choice yet and will be skipped and listed in the errors file.`,
  nextToConfirm: 'Next: confirm',

  // Step 4: confirm
  confirmHeading: 'Confirm your import',
  modeHeading: 'If a card is already in this sale',
  modeHint: 'There is no automatic choice. Pick one so quantities come out the way you expect.',
  modeAddTitle: 'Add to existing quantity',
  modeAddBody: 'The number in your file is added to the quantity you already have.',
  modeReplaceTitle: 'Replace quantity with file value',
  modeReplaceBody: 'The quantity is set to the number in your file. It never goes below the number already sold.',
  modeExampleHeading: 'Example from your file',
  modeExample: (name: string, existing: number, file: number, addResult: number | null, replaceResult: number | null) => {
    const add = addResult === null ? 'cannot be worked out' : `${existing} in stock plus ${file} = ${addResult}`;
    const rep = replaceResult === null ? 'cannot be worked out' : `set to ${replaceResult}`;
    return `${name} has ${existing} in stock and your file says ${file}. Add: ${add}. Replace: ${rep}.`;
  },
  modeNoExample: 'None of the cards in your file are in this sale yet, so both choices give the same result.',
  modeNotChosen: 'Choose how to handle cards you already have.',
  priceHeading: 'Prices',
  priceFile: 'Use the price from my file',
  priceNone: 'Leave prices blank',
  priceFileHint: 'Cards with a price in your file get that price.',
  priceNoneHint: 'Every new card is added with no price. Add prices before you publish.',
  priceNoColumn: 'Your file has no price column, so new cards are added with no price either way.',
  priceNeedsPrice: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'card has' : 'cards have'} no price in your file. Cards need a price before you can publish them.`,
  summaryHeading: 'What will happen',
  summaryCreate: (n: number) => `${n.toLocaleString('en-US')} new ${n === 1 ? 'card' : 'cards'} added to this sale`,
  summaryMerge: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'card' : 'cards'} already in this sale will be updated`,
  summaryDecided: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'} where you chose a printing or finish`,
  summarySkip: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'} you chose to skip`,
  summaryUnchosen: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'} with no choice, skipped`,
  summaryUnlisted: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'row needs' : 'rows need'} a choice but could not be listed, so ${n === 1 ? 'it is' : 'they are'} skipped and put in the errors file`,
  summaryNoMatch: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'card is' : 'cards are'} not in the catalog and will be added with the details from your file`,
  unlistedNote: (n: number) =>
    `To finish the ${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'} that could not be listed, download ${ERRORS_FILE_NAME} after this import, choose "${IMPORT_ANOTHER_LABEL}", and upload ${ERRORS_FILE_NAME}. Cards added now are not in that file, so they are not added twice.`,
  summaryProblems: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'} with problems, skipped`,
  summaryDraft: 'Cards are added as drafts. Nothing is published, and no photos are needed.',
  problemsHeading: 'Rows that cannot be imported',
  problemsBody: 'These rows are skipped. After the import you can download them as an errors file, fix them, and import that file.',
  problemsShown: (shown: number, total: number) => `Showing ${shown} of ${total}.`,
  problemRow: (row: number) => `Row ${row}`,
  problemsFirstBlank: 'No name',
  blockersHeading: 'Before you can import',
  goToConditions: 'Go to condition mapping',
  blockMode: 'Choose how to handle cards you already have.',
  blockConditions: (n: number) => `Choose a condition for ${n} ${n === 1 ? 'word' : 'words'} in step 2.`,
  blockNothing: 'There are no cards to import in this file.',
  blockBusy: 'An import is already running.',
  importButton: 'Import cards',
  importButtonBusy: 'Importing',
  backButton: 'Back',
  startOver: 'Start over with another file',

  // Existing batches
  earlierStopped: (done: number, total: number) =>
    `An earlier import of this file stopped at row ${done.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}. Import continues from there and does not add those cards again.`,
  earlierCompleted: 'This file was already imported with this choice. Importing it again changes nothing unless you choose to import it again anyway.',

  // Running
  progressHeading: 'Importing your cards',
  progressReading: 'Reading your file',
  progressWriting: 'Adding cards to your sale',
  progressStarting: 'Starting',
  progressOf: (done: number, total: number) => `${done.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} rows`,
  progressLabel: 'Import progress',
  progressKeepOpen: 'Keep this page open until the import finishes.',
  progressStalled: 'Still working. Big files can pause for a while. Your progress is saved as it goes.',
  progressCounts: (created: number, merged: number, skipped: number, errors: number) =>
    `${created.toLocaleString('en-US')} added, ${merged.toLocaleString('en-US')} updated, ${skipped.toLocaleString('en-US')} skipped, ${errors.toLocaleString('en-US')} with problems`,
  stopButton: 'Stop import',
  stopping: 'Stopping',

  // Result
  doneHeading: 'Import finished',
  doneStoppedHeading: 'Import stopped',
  doneStoppedBody: 'Some of your cards were added. Choose Resume to continue where it stopped. Cards already added are not added twice.',
  doneCreated: (n: number) => `${n.toLocaleString('en-US')} new ${n === 1 ? 'card' : 'cards'} added`,
  doneMerged: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'card' : 'cards'} matched to a card already in this sale or listed twice in your file`,
  doneSkipped: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'} skipped`,
  doneErrors: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'} with problems`,
  doneNoMatch: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'card was' : 'cards were'} added with the details from your file because there was no catalog match`,
  doneNeedsPrice: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'card has' : 'cards have'} no price yet. Add a price before you publish.`,
  doneResumed: 'This import continued from an earlier one.',
  doneNoErrors: 'Every row was imported or skipped on purpose.',
  doneViewItems: 'See my items',
  doneImportAnother: IMPORT_ANOTHER_LABEL,
  errorsDownload: 'Download errors.csv',
  errorsDownloadHint: 'The errors file has your original columns plus a column that says what went wrong. Fix it and import it again.',
  errorsChoiceHint: `Rows that were skipped because they needed a choice are in ${ERRORS_FILE_NAME} as they were, so nothing needs fixing. To finish them, download it, choose "${IMPORT_ANOTHER_LABEL}", upload ${ERRORS_FILE_NAME}, and go through the steps again, choosing a printing or finish for those rows.`,
  errorsIncomplete: 'The errors file is incomplete because there were too many problems to keep on this page. Fix these and import again to find the rest.',
  errorsListHeading: 'First problems',
  errorsFileName: ERRORS_FILE_NAME,
  alreadyHeading: 'Already imported',
  alreadyBody: 'This file was already imported with this choice, so nothing was changed.',
  alreadySummary: (created: number, merged: number, skipped: number, errors: number) =>
    `Earlier result: ${created.toLocaleString('en-US')} added, ${merged.toLocaleString('en-US')} updated, ${skipped.toLocaleString('en-US')} skipped, ${errors.toLocaleString('en-US')} with problems.`,
  forceHeading: 'Import it again anyway',
  forceBody: 'This starts a brand new import of the same file. With Add to existing quantity, the quantities are added a second time.',
  forceCheck: 'I understand and want to import this file again',
  forceButton: 'Import again',
  failedHeading: 'The import did not finish',
  interruptedBody: 'The connection dropped before we heard back. Your progress is saved. Choose Resume to continue where it stopped.',
  resumeButton: 'Resume import',
  retryButton: 'Try again',

  // Generic states
  loading: 'Loading',
  errorHeading: 'Something needs your attention',
  dismiss: 'Dismiss',
} as const;

// ---------------------------------------------------------------------------
// Error wording
// ---------------------------------------------------------------------------

export interface ErrorWording {
  /** Shown when the server sent no text of its own. */
  message: string;
  /** What to do next, one short sentence. */
  help: string;
}

/** Whole-request codes: JSON failures before or instead of a stream, and the fatal stream event. */
export const ERROR_WORDING: Record<string, ErrorWording> = {
  UNAUTHORIZED: { message: 'Organizer access is needed to import cards.', help: 'Log in with your organizer account and try again.' },
  FORBIDDEN: { message: 'Organizer access is needed to import cards.', help: 'Log in with your organizer account and try again.' },
  SALE_NOT_FOUND: { message: 'We could not find this sale.', help: 'Go back to your sales and open the sale again.' },
  NOT_YOUR_SALE: { message: 'This sale belongs to another organizer.', help: 'Open one of your own sales to import cards.' },
  NO_FILE: { message: 'Choose a CSV file first.', help: 'Pick the file from your computer or phone.' },
  FILE_TOO_LARGE: { message: 'That file is too large.', help: 'Split it into smaller files and import them one at a time.' },
  UNSUPPORTED_FILE_TYPE: { message: 'Only CSV, TSV or TXT files can be imported.', help: 'In your spreadsheet app, choose Save As or Export and pick CSV.' },
  UPLOAD_FAILED: { message: 'The file could not be uploaded.', help: 'Check your connection and try again.' },
  NOT_A_CSV_FILE: { message: 'This does not look like a CSV file.', help: 'Open it in a spreadsheet app and export it as CSV.' },
  PARSE_ERROR: { message: 'We could not read this file.', help: 'Check that it is a normal CSV export. A stray quote mark in the file can cause this.' },
  EMPTY_FILE: { message: 'This file has no card rows.', help: 'Check that you chose the right file and that it has a header row and at least one card.' },
  NO_NAME_COLUMN: { message: 'We could not find a column with the card name.', help: 'Choose which column holds the card name, then check the file again.' },
  BAD_COLUMN_MAPPING: { message: 'The column choices do not match your file.', help: 'Choose the columns again.' },
  BAD_FORMAT: { message: 'That file type is not one we can import.', help: 'Choose Detect it for me, or pick one of the listed types.' },
  BAD_GAME: { message: 'That game is not one we can import.', help: 'Choose a game from the list, or leave it on the usual choice.' },
  BAD_PRICE_SOURCE: { message: 'Choose whether to use the prices from your file or leave prices blank.', help: 'Pick one of the two price choices.' },
  BAD_DEFAULT_CONDITION: { message: 'That condition is not one we can use.', help: 'Pick a condition from the list, or leave it blank.' },
  BAD_MODE: { message: 'Choose how to handle cards you already have.', help: 'Pick Add to existing quantity or Replace quantity with file value.' },
  MODE_REQUIRED: { message: 'Choose how to handle cards you already have.', help: 'Pick Add to existing quantity or Replace quantity with file value.' },
  FILE_HASH_REQUIRED: { message: 'We need to check this file again before importing it.', help: 'Choose the file again and check it.' },
  BAD_JSON: { message: 'Some of the choices sent with your file could not be read.', help: 'Check the file again, then try the import once more.' },
  BAD_CONDITION_MAPPING: { message: 'One of the condition choices is not valid.', help: 'Go back to the condition step and choose again.' },
  BAD_DECISIONS: { message: 'One of the row choices is not valid.', help: 'Check the file again, then try the import once more.' },
  FILE_CHANGED: { message: 'This file is different from the one you checked.', help: 'Check the file again before importing.' },
  TOO_MANY_ROWS: { message: 'This file has too many rows.', help: 'Split it into smaller files and import them one at a time.' },
  ALREADY_APPLIED: { message: 'This file was already imported.', help: 'Nothing was changed.' },
  DB_SPACE_LOW: { message: 'We cannot import this many cards right now.', help: 'Storage is nearly full. Please contact support.' },
  RATE_LIMITED: { message: 'Too many tries in a short time.', help: 'Wait a while and try again.' },
  SERVER_ERROR: { message: 'Something went wrong on our side.', help: 'Your progress is saved. Try again and the import continues where it stopped.' },
  CANCELLED: { message: 'The import was stopped.', help: 'Choose Resume to continue where it stopped.' },
  // Failures that never reach the server
  NETWORK_ERROR: { message: 'We could not reach the server.', help: 'Check your connection and try again. If an import was running, your progress is saved.' },
  SESSION_ENDED: { message: 'Your login ended.', help: 'Log in again, then choose your file again.' },
  UNKNOWN: { message: 'Something went wrong.', help: 'Please try again.' },
};

export interface RowErrorWording {
  /** Short name for a group of rows ("No card name"). */
  label: string;
  /** One plain sentence for a single row. */
  help: string;
}

/**
 * Row error codes. The first twelve are the codes the backend sends (services/cardIntake/types.ts ROW_ERROR_CODES);
 * UNMATCHED_CARD and UNKNOWN_CONDITION are named in ADR-134 section 4.8 but the backend does not send them
 * (a card with no catalog match is imported with the file's details, and an unconfirmed condition is CONDITION_UNMAPPED).
 */
export const ROW_ERROR_WORDING: Record<string, RowErrorWording> = {
  MISSING_NAME: { label: 'No card name', help: 'This row has no card name, so it was skipped.' },
  BAD_QUANTITY: { label: 'Quantity is not a whole number from 1 to 10,000', help: 'The quantity must be a whole number from 1 to 10,000.' },
  BAD_PRICE: { label: 'Price is not a valid amount', help: 'The price is not a valid amount, so this row was skipped.' },
  AMBIGUOUS_PRINTING: { label: 'No printing chosen', help: 'Several printings match this card and none was chosen, so this row was skipped.' },
  UNKNOWN_FINISH: { label: 'Finish not chosen', help: 'We could not tell if this card is foil or non-foil and none was chosen, so this row was skipped.' },
  CONDITION_UNMAPPED: { label: 'Condition not matched', help: 'The condition in this row was not matched to a condition, so this row was skipped instead of guessing.' },
  SKU_CONFLICT: { label: 'SKU already used', help: 'Another card in this sale already uses this SKU, so this row was skipped.' },
  GRADED_MISSING_GRADE: { label: 'Graded card missing its grade', help: 'A graded card needs both a grading company and a grade, so this row was skipped.' },
  CERT_TOO_LONG: { label: 'Certification number too long', help: 'The certification number is longer than 30 characters, so this row was skipped.' },
  ROW_TOO_LONG: { label: 'Row has too much text', help: 'This row has more text than we can store, so it was skipped.' },
  INVALID_DECISION: { label: 'Choice did not match', help: 'The choice made for this row does not match any of its options, so this row was skipped.' },
  INVALID_CARD_DATA: { label: 'Card details not valid', help: 'Some card details in this row are not valid, so it was skipped.' },
  UNMATCHED_CARD: { label: 'No catalog match', help: 'This card was not found in the catalog.' },
  UNKNOWN_CONDITION: { label: 'Condition not recognized', help: 'The condition in this row is not one we recognize.' },
};

export const WARNING_WORDING: Record<string, string> = {
  DUPLICATE_IN_FILE_MERGED: 'The same card appears more than once in your file. The quantities were added together.',
  MULTIPLE_MATCHES: 'More than one card in this sale matched. The oldest one was updated.',
  MISSING_CONDITION: 'No condition was given for this card, so the condition was left blank.',
  UNKNOWN_LANGUAGE: 'The language was not recognized, so it was left blank.',
};

export function wordingForError(code: string | null | undefined): ErrorWording {
  if (code && Object.prototype.hasOwnProperty.call(ERROR_WORDING, code)) return ERROR_WORDING[code];
  return ERROR_WORDING.UNKNOWN;
}

export function wordingForRowError(code: string | null | undefined): RowErrorWording {
  if (code && Object.prototype.hasOwnProperty.call(ROW_ERROR_WORDING, code)) return ROW_ERROR_WORDING[code];
  return { label: 'Row could not be imported', help: 'This row could not be imported, so it was skipped.' };
}

/** Plain text for a warning code, or the generic fallback. */
export function wordingForWarning(code: string): string {
  if (Object.prototype.hasOwnProperty.call(WARNING_WORDING, code)) return WARNING_WORDING[code];
  return 'This row needed a small adjustment.';
}

/** Every string above, flattened (template functions are called with sample values), for the copy-lint test. */
export function allIntakeCopy(): string[] {
  const out: string[] = [];
  INTAKE_STEPS.forEach((s) => out.push(s.label));
  Object.keys(INTAKE_COPY).forEach((k) => {
    const v = (INTAKE_COPY as Record<string, unknown>)[k];
    if (typeof v === 'string') {
      out.push(v);
    } else if (typeof v === 'function') {
      const fn = v as (...args: any[]) => string;
      const samples: any[][] = [
        [1],
        [2, 3],
        ['Sample', 'Sample'],
        [1, 2, 3, 4],
        ['Lightning Bolt', 4, 3, 7, 3],
        ['Lightning Bolt', 4, 3, null, null],
      ];
      samples.forEach((args) => {
        try {
          const text = fn(...args);
          if (typeof text === 'string') out.push(text);
        } catch {
          /* a sample that does not fit this function */
        }
      });
    }
  });
  out.push(INTAKE_COPY.rowsFromFile('', ''), INTAKE_COPY.rowsFromFile('m10', ''), INTAKE_COPY.rowsFromFile('', '141'));
  Object.keys(ERROR_WORDING).forEach((k) => out.push(ERROR_WORDING[k].message, ERROR_WORDING[k].help));
  Object.keys(ROW_ERROR_WORDING).forEach((k) => out.push(ROW_ERROR_WORDING[k].label, ROW_ERROR_WORDING[k].help));
  Object.keys(WARNING_WORDING).forEach((k) => out.push(WARNING_WORDING[k]));
  return out;
}
