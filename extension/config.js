// FindA.Sale extension config. API_BASE proxies to the Railway backend via
// finda.sale/api/:path* (Vercel rewrite, S651). Cookie 'accessToken' is read
// from the finda.sale domain and sent as a Bearer token (no cross-site cookie).
self.FAS_CONFIG = {
  API_BASE: 'https://finda.sale/api',
  COOKIE_URL: 'https://finda.sale',
  COOKIE_NAME: 'accessToken',
  REFRESH_COOKIE_NAME: 'refreshToken',
  FB_CREATE_URL: 'https://www.facebook.com/marketplace/create/item',
  CL_POST_URL: 'https://post.craigslist.org/',
  // ADR-102 (2026-08-09): real, live-confirmed URL (redirects to a sign-in wall when logged
  // out -- see fas-gumtree-au.js's file header). Not a guess.
  GT_POST_URL: 'https://www.gumtree.com.au/p-post-ad.html',
  // 2026-08-18 dispatch (fas-poshmark.js/fas-mercari.js/fas-vinted.js/fas-grailed.js):
  // UNVERIFIED -- best-effort guesses, not live-confirmed (no seller accounts exist yet
  // for any of these four platforms). Each content script also self-checks the DOM before
  // acting (looksLikeListingForm/looksLikeSellForm), so a wrong path here fails safe --
  // it just stays silent instead of guessing at the wrong page.
  POSH_POST_URL: 'https://poshmark.com/create-listing',
  MERC_POST_URL: 'https://www.mercari.com/sell/',
  VINTED_POST_URL: 'https://www.vinted.com/items/new',
  GRAILED_POST_URL: 'https://www.grailed.com/sell',
  // S-EXT-CROSS-PLATFORM-AUTOREMOVE (2026-08-22, Patrick-directed): entry points for each
  // platform's own "my listings" management view, used to auto-remove a listing once the item
  // sells elsewhere -- same purpose as FAS_YOU_SELLING_SOLD_FILTER_URL (background.js) does for
  // Facebook. UNVERIFIED like the *_POST_URL entries above -- none of these have a live seller
  // account with an actual sold item to confirm the real management-page URL/DOM against yet.
  // Deliberately generic entry points (feed/home, not a guessed deep path) -- each platform's own
  // removal content-script function discovers the real "my listings"/closet link from the DOM
  // itself (same defensive pattern as fas-remove.js's ensureFilteredThenRun: navigate to something
  // safe, let the content script find its own way from there) rather than trusting a guessed URL
  // that could easily 404 and silently strand the whole flow.
  POSH_MANAGE_URL: 'https://poshmark.com/feed',
  MERC_MANAGE_URL: 'https://www.mercari.com/',
  VINTED_MANAGE_URL: 'https://www.vinted.com/',
  GRAILED_MANAGE_URL: 'https://www.grailed.com/sell',
  GUMTREE_AU_MANAGE_URL: 'https://www.gumtree.com.au/',
  // Patrick-confirmed (2026-08-22, not a guess): this account page lists every one of the
  // organizer's own Craigslist postings, so it doubles as the Craigslist "my listings" page.
  CRAIG_MANAGE_URL: 'https://www.craigslist.org/account'
};
