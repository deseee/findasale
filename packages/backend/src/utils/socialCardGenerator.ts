/**
 * socialCardGenerator.ts — ADR-116: builds a branded weekly "what we shipped" card
 * image via Cloudinary URL-based text-overlay transformations (l_text:) — the exact
 * mechanism already live in utils/cloudinaryWatermark.ts. No new dependency, no
 * upload, no network call at generation time: this is pure URL construction against
 * the Cloudinary account already in production use for item photos.
 *
 * Used by socialPublisherService.stageApprovedContent() whenever a week's
 * build-in-public content has no real screenshot to attach. Instagram and Pinterest
 * both hard-require at least one image (see platforms/instagram.ts,
 * platforms/pinterest.ts — both throw "refusing to publish" without one), so this is
 * what makes those two platforms postable on a text-only week.
 *
 * Requires ONE background template image Patrick uploads to Cloudinary in advance
 * (a portrait brand card — pin logo + brand colors — sized to CARD_WIDTH x
 * CARD_HEIGHT below) and its public_id set as SOCIAL_TOKEN env var
 * SOCIAL_CARD_TEMPLATE_PUBLIC_ID. Deliberately NOT defaulted to a guessed public_id:
 * an unverified base image could 404 at Cloudinary and silently ship a broken image
 * URL into a real post. Until the env var is set, generateWeeklyCardUrl() throws a
 * clear, catchable error — stageApprovedContent() catches it and skips
 * media-requiring platforms with that message as the skip reason, rather than risking
 * a broken post.
 */

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CARD_TEMPLATE_PUBLIC_ID = process.env.SOCIAL_CARD_TEMPLATE_PUBLIC_ID;

// Portrait, ~4:5, works reasonably as posted across Pinterest/Instagram/Facebook/Threads
// without needing a separate template per platform for v1.
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

// Same brand orange used elsewhere in the codebase (services/video/templateRenderer.ts
// BRAND_ORANGE) — not imported directly to avoid a cross-dependency between this static
// card generator and the unrelated ffmpeg video-render pipeline; kept as a literal with
// this note so the two don't silently drift without someone noticing.
const BRAND_ORANGE_HEX = 'F97316';

/**
 * Cloudinary text layers auto-wrap when a width (`w_`) is set on the text layer
 * (c_fit keeps the text inside that width). Comma and slash are transformation-syntax
 * delimiters in Cloudinary URLs, so the headline is URL-encoded — a real shipped-
 * feature title may contain either and must not be able to break the transformation
 * chain.
 */
function buildHeadlineLayer(headline: string): string {
  const safeText = encodeURIComponent(headline.trim().slice(0, 140));
  return `l_text:Montserrat_64_bold:${safeText},co_white,w_900,c_fit,g_center,y_-60`;
}

/**
 * Returns a Cloudinary URL for a branded card with the week's headline overlaid.
 * Pure URL construction — no upload, no network call, mirrors the pattern in
 * utils/cloudinaryWatermark.ts (getWatermarkedUrl).
 *
 * Throws if the Cloudinary cloud name or the one-time template public_id isn't
 * configured — callers must catch this and treat it as "no card available this
 * week", never emit an unverified URL.
 */
export function generateWeeklyCardUrl(headline: string): string {
  if (!CLOUDINARY_CLOUD_NAME) {
    throw new Error('[socialCardGenerator] CLOUDINARY_CLOUD_NAME not set — cannot build a card URL');
  }
  if (!CARD_TEMPLATE_PUBLIC_ID) {
    throw new Error(
      '[socialCardGenerator] SOCIAL_CARD_TEMPLATE_PUBLIC_ID not set — Patrick must upload a ' +
        'branded background template to Cloudinary once (portrait, ~1080x1350) and set this ' +
        'env var to its public_id before any platform requiring an image (Instagram, Pinterest) ' +
        'can receive a generated weekly card.'
    );
  }

  const headlineLayer = buildHeadlineLayer(headline);
  const wordmarkLayer = `l_text:Montserrat_40_bold:FindA.Sale,co_rgb:${BRAND_ORANGE_HEX},g_south,y_60`;

  return (
    `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/` +
    `w_${CARD_WIDTH},h_${CARD_HEIGHT},c_fill/${headlineLayer}/${wordmarkLayer}/${CARD_TEMPLATE_PUBLIC_ID}`
  );
}
