// FindA.Sale extension config. API_BASE proxies to the Railway backend via
// finda.sale/api/:path* (Vercel rewrite, S651). Cookie 'accessToken' is read
// from the finda.sale domain and sent as a Bearer token (no cross-site cookie).
self.FAS_CONFIG = {
  API_BASE: 'https://finda.sale/api',
  COOKIE_URL: 'https://finda.sale',
  COOKIE_NAME: 'accessToken',
  REFRESH_COOKIE_NAME: 'refreshToken',
  FB_CREATE_URL: 'https://www.facebook.com/marketplace/create/item'
};
