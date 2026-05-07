/**
 * S673 Path C: NextAuth v4 at standard /api/auth/ location.
 *
 * Flow:
 *   1. User clicks "Continue with Google/Facebook" on login/register page.
 *   2. NextAuth redirects to the provider and handles the callback at
 *      /api/auth/callback/[provider] — already registered in Google + Facebook consoles.
 *   3. On success, the `jwt` callback exchanges the OAuth profile for our
 *      backend JWT via POST /auth/oauth and stores it in the NextAuth token.
 *   4. The `OAuthBridge` component in _app.tsx reads session.backendJwt,
 *      calls AuthContext.login(), then signs out of NextAuth.
 *
 * WHY /api/auth/ WORKS NOW (S673 fix):
 *   The catch-all pages/api/auth/[...nextauth].ts would intercept backend routes
 *   (login, refresh, me, logout, etc.) before the fallback rewrite could proxy them
 *   to Railway. S673 fixes this by adding `beforeFiles` rewrites in next.config.js
 *   for each backend auth path. beforeFiles run BEFORE all filesystem routes, so
 *   backend paths reach Railway directly; NextAuth only sees its own paths
 *   (session, csrf, providers, callback, signin, signout, _log, error).
 *
 * NEXTAUTH_URL must be https://finda.sale (no path suffix).
 * Google + Facebook consoles: /api/auth/callback/[provider] already registered.
 *
 * Required env vars (Vercel + .env.local):
 *   NEXTAUTH_SECRET, NEXTAUTH_URL=https://finda.sale
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET
 */

import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    FacebookProvider({
      clientId:     process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    async jwt({ token, account, profile }) {
      // Store OAuth profile for browser-side exchange (not server-side)
      // This avoids the server→server cookie problem where Railway's Set-Cookie
      // headers reach Vercel but never the browser.
      if (account && profile) {
        token.oauthProvider   = account.provider;
        token.oauthProviderId = account.providerAccountId;
        token.oauthEmail      = (profile as any).email  ?? null;
        token.oauthName       = (profile as any).name   ?? 'User';
        token.oauthPending    = true; // Signal that browser-side exchange is needed
      }
      return token;
    },

    async session({ session, token }) {
      if (token.oauthPending) {
        (session as any).oauthProfile = {
          provider:   token.oauthProvider,
          providerId: token.oauthProviderId,
          email:      token.oauthEmail,
          name:       token.oauthName,
        };
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login', // NextAuth v4 hardcodes /api/auth/error — redirect errors to login page
  },

  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
