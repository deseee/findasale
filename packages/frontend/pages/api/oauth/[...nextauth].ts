/**
 * Phase 31: NextAuth v4 configuration for OAuth social login.
 *
 * Flow:
 *   1. User clicks "Continue with Google/Facebook" on login/register page.
 *   2. NextAuth redirects to the provider and handles the callback.
 *   3. On success, the `jwt` callback exchanges the OAuth profile for our
 *      backend JWT via POST /auth/oauth and stores it in the NextAuth token.
 *   4. The `OAuthBridge` component in _app.tsx reads session.backendJwt,
 *      calls AuthContext.login(), then signs out of NextAuth.
 *
 * WHY /api/oauth/ AND NOT /api/auth/:
 *   The Next.js catch-all [...nextauth].ts at /api/auth/ would intercept ALL
 *   /api/auth/* traffic, including backend routes (login, refresh, me, logout)
 *   that are proxied through Next.js to Railway. Moving to /api/oauth/ avoids
 *   this conflict. The S660 fallback rewrite keeps backend /api/auth/* routes
 *   correctly proxied to Railway.
 *
 * WHY NEXTAUTH_URL INCLUDES /api/oauth (S672 fix):
 *   NextAuth v4 derives its internal basePath from NEXTAUTH_URL.pathname.
 *   With NEXTAUTH_URL=https://finda.sale (no path), basePath defaults to
 *   /api/auth — so even though the handler file lives at /api/oauth/, NextAuth
 *   was building the token-exchange redirect_uri as /api/auth/callback/google,
 *   mismatching the /api/oauth/callback/google sent at authorization. Google
 *   rejected token exchange → OAUTH_CALLBACK_ERROR (S660/S667/S671 chain).
 *   Setting NEXTAUTH_URL=https://finda.sale/api/oauth fixes basePath at the
 *   source — both authorization and token-exchange redirect_uri now match,
 *   and explicit redirect_uri overrides are no longer needed.
 *
 * Required env vars (Vercel + .env.local):
 *   NEXTAUTH_SECRET, NEXTAUTH_URL=https://finda.sale/api/oauth
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET
 */

import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';
import axios from 'axios';

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
      // Only runs on initial sign-in (account is present)
      if (account && profile) {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
          const { data } = await axios.post(`${apiUrl}/auth/oauth`, {
            provider:   account.provider,
            providerId: account.providerAccountId,
            email:      (profile as any).email  ?? null,
            name:       (profile as any).name   ?? 'User',
          });
          token.backendJwt = data.token;
          token.userRole   = data.user?.role ?? 'USER';
          token.userId     = data.user?.id;
        } catch (err: any) {
          console.error('[NextAuth] Backend OAuth exchange failed:', err?.message);
        }
      }
      return token;
    },

    async session({ session, token }) {
      (session as any).backendJwt = token.backendJwt;
      (session as any).userRole   = token.userRole;
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login', // NextAuth v4 hardcodes /api/auth/error — redirect errors here instead
  },

  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
