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
  GRAILED_POST_URL: 'https://www.grailed.com/sell'
};
