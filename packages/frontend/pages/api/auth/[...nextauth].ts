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
 * Required env vars (add to Vercel + .env.local):
 *   NEXTAUTH_SECRET=<random 32-byte hex>
 *   NEXTAUTH_URL=https://your-frontend-url.vercel.app
 *   GOOGLE_CLIENT_ID=...
 *   GOOGLE_CLIENT_SECRET=...
 *   FACEBOOK_CLIENT_ID=...
 *   FACEBOOK_CLIENT_SECRET=...
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
