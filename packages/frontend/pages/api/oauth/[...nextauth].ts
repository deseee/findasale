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
 * WHY redirect_uri OVERRIDE:
 *   NextAuth v4 hardcodes /api/auth/ in callback URLs regardless of handler
 *   location. Explicit redirect_uri in provider config forces the correct path.
 *   Google/Facebook Cloud Console must have /api/oauth/callback/[provider] registered.
 *
 * Required env vars (Vercel + .env.local):
 *   NEXTAUTH_SECRET, NEXTAUTH_URL=https://finda.sale
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
      // NextAuth v4 hardcodes /api/auth/ in callback URLs — override required.
      authorization: {
        params: {
          redirect_uri: `${process.env.NEXTAUTH_URL}/api/oauth/callback/google`,
        },
      },
    }),
    FacebookProvider({
      clientId:     process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
      // Same override required for Facebook.
      authorization: {
        params: {
          redirect_uri: `${process.env.NEXTAUTH_URL}/api/oauth/callback/facebook`,
        },
      },
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
  },

  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
