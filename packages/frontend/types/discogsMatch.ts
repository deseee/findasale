// ADR-132 Discogs release matching: local copy of the backend contract (section 11.1).
// Source of truth: packages/backend/src/services/marketplace/discogsListingConnector.ts
// (DiscogsMatchView, DiscogsCorrectionResult, DiscogsSweepReport) and
// discogsReleaseMatcher.ts (DiscogsCandidate). Copied here on purpose: the frontend
// must never import @findasale/shared or backend code.

export type DiscogsMatchStatus = 'auto_high' | 'needs_selection' | 'confirmed' | 'not_in_discogs';

export type DiscogsFormatClass = 'LP' | '7in' | '10in' | '12in_single' | 'CD' | 'Cassette' | 'Box' | null;

export type DiscogsVeto = 'format' | 'script' | 'artist' | 'title';

export interface DiscogsCandidate {
  releaseId: number;
  masterId: number | null;
  artist: string;
  title: string;
  formats: string[];
  formatClass: DiscogsFormatClass;
  labels: string[];
  catno: string | null;
  year: number | null;
  country: string | null;
  thumb: string | null;
  uri: string;
  tier: 0 | 1 | 2 | 3 | 4 | 5;
  composite: number;
  fieldScores: {
    artist: number | null;
    title: number | null;
    catno: boolean;
    label: number | null;
    yearDelta: number | null;
  };
  vetoes: DiscogsVeto[];
  warnings: string[];
  community: { have: number; want: number } | null;
  autoSelectedPressing?: boolean;
  currentlyListed?: boolean;
  fromPastedUrl?: boolean;
}

export type RecordIdentityFormat = 'LP' | '7in' | '10in' | '12in_single' | 'CD' | 'Cassette' | 'Box' | 'Other';

export interface RecordIdentityValues {
  artist: string | null;
  releaseTitle: string | null;
  label: string | null;
  catalogNumber: string | null;
  year: number | null;
  format: RecordIdentityFormat | null;
  script: string | null;
}

export type RecordIdentitySource = 'ai' | 'ocr' | 'organizer' | 'title_parse';

export type RecordIdentitySources = Partial<Record<keyof RecordIdentityValues, RecordIdentitySource>>;

export interface DiscogsMatchView {
  itemId: string;
  status: DiscogsMatchStatus | null;
  releaseId: number | null;
  selected: DiscogsCandidate | null;
  candidates: DiscogsCandidate[];
  reason: string | null;
  rule: string | null;
  draftOnly: boolean;
  canPush: boolean;
  matchedAt: string | null;
  recordIdentity: RecordIdentityValues;
  recordIdentitySources: RecordIdentitySources;
  listing: { listingId: string | null; listingReleaseId: number | null; releaseMismatch: boolean };
}

export type DiscogsCorrectionAction =
  | 'already_correct'
  | 'edited_in_place'
  | 'recreated'
  | 'recreated_old_listing_not_deleted'
  | 'listing_gone';

export interface DiscogsCorrectionResult {
  action: DiscogsCorrectionAction;
  listingId: string | null;
  previousListingId: string;
  listingReleaseId: number | null;
  listingStatus: string | null;
  message: string;
}

/** select endpoint wraps a failed correction instead of failing the whole request. */
export interface DiscogsCorrectionFailure {
  action: 'failed';
  code: string;
  message: string;
}

export type DiscogsSweepClassification =
  | 'AGREE'
  | 'MISMATCH'
  | 'NEEDS_SELECTION'
  | 'CONFIRMED_AGREE'
  | 'CONFIRMED_MISMATCH'
  | 'NOT_IN_DISCOGS'
  | 'LISTING_GONE'
  | 'ERROR';

export interface DiscogsSweepRow {
  itemId: string;
  title: string;
  organizerId: string | null;
  listingId: string;
  listingStatus: string | null;
  listedRelease: Pick<DiscogsCandidate, 'releaseId' | 'artist' | 'title' | 'formatClass' | 'vetoes' | 'fieldScores'> | null;
  listedHasHardVeto: boolean;
  proposed: {
    status: string;
    releaseId: number | null;
    reason: string;
    rule: string | null;
    draftOnly: boolean;
    candidates: Array<
      Pick<DiscogsCandidate, 'releaseId' | 'artist' | 'title' | 'formatClass' | 'composite' | 'vetoes' | 'catno' | 'year' | 'country'>
    >;
  } | null;
  recordIdentity: RecordIdentityValues | null;
  classification: DiscogsSweepClassification;
  error?: string;
  wrote: boolean;
}

export interface DiscogsSweepReport {
  dryRun: boolean;
  offset: number;
  limit: number;
  total: number;
  nextOffset: number | null;
  summary: Record<DiscogsSweepClassification, number>;
  rows: DiscogsSweepRow[];
}

/** Human label for a matcher format class ("7in" reads badly in UI copy). */
export const formatClassLabel = (fc: string | null | undefined): string | null => {
  switch (fc) {
    case 'LP': return 'LP';
    case '7in': return '7" single';
    case '10in': return '10"';
    case '12in_single': return '12" single';
    case 'CD': return 'CD';
    case 'Cassette': return 'Cassette';
    case 'Box': return 'Box set';
    case 'Other': return 'Other';
    default: return null;
  }
};

export const discogsReleaseUrl = (releaseId: number): string => `https://www.discogs.com/release/${releaseId}`;

/**
 * Parses a pasted Discogs link. Mirrors the backend rule (discogs.com/(xx/)?release/<digits>)
 * so obvious mistakes are caught before a round-trip. The backend still validates.
 */
export const parseDiscogsReleaseLink = (
  raw: string
): { ok: true; releaseId: number } | { ok: false; error: string } => {
  const text = raw.trim();
  if (!text) return { ok: false, error: 'Paste a link from discogs.com first.' };
  if (!/discogs\.com/i.test(text)) return { ok: false, error: 'That doesn\'t look like a discogs.com link.' };
  if (/discogs\.com\/(?:[a-z]{2}\/)?master\//i.test(text)) {
    return {
      ok: false,
      error: 'That link is for a master release (every pressing). Open it on Discogs, pick the exact pressing you have, and paste that link.',
    };
  }
  const m = text.match(/discogs\.com\/(?:[a-z]{2}\/)?release\/(\d+)/i);
  if (!m) return { ok: false, error: 'Use a Discogs release link, like discogs.com/release/1234567.' };
  return { ok: true, releaseId: Number(m[1]) };
};

const DISCOGS_ERROR_COPY: Record<string, string> = {
  needs_selection: 'Choose the matching Discogs release first.',
  listing_release_mismatch: 'Your Discogs listing is on a different release. Fix the listing before updating it.',
  not_connected: 'Your Discogs account isn\'t connected. Connect it in Settings, then try again.',
  not_eligible: 'This record is marked as not in Discogs, so it can\'t be listed there.',
  master_url: 'That link is for a master release (every pressing). Open it on Discogs, pick the exact pressing you have, and paste that link.',
  invalid_url: 'That doesn\'t look like a Discogs release link.',
  release_not_found: 'Discogs couldn\'t find that release. Check the link and try again.',
  not_a_candidate: 'That release is no longer in the suggestions. Re-check and pick again.',
  item_not_found: 'This item couldn\'t be found.',
};

/** Friendly message for an API error from the /discogs routes ({ message, code } body). */
export const discogsErrorMessage = (error: any, fallback: string): string => {
  const data = error?.response?.data;
  const code: string | undefined = data?.code;
  if (code && DISCOGS_ERROR_COPY[code]) return DISCOGS_ERROR_COPY[code];
  return data?.message || fallback;
};

export const discogsErrorCode = (error: any): string | null => error?.response?.data?.code ?? null;
