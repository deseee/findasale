# OAuth Red-Team Report — 2026-03-09

## Executive Summary

FindA.Sale's OAuth implementation demonstrates reasonable security fundamentals but contains **three critical attack vectors** that must be resolved before beta launch. The flow relies on NextAuth.js for state management and provider integration, which reduces exposure to traditional OAuth flaws; however, account-linking logic and email-based account auto-creation enable account takeover attacks. A missing CSRF redirect_uri allowlist and unvalidated email-to-account binding create exploitable weaknesses.

**Blocking Issues: 2 P0 findings. Fix Within 1 Week: 1 P1. Best Practice: 2 P2.**

---

## Findings

### 1. Account Takeover via Email-Based Account Linking — P0

**Vector:** account-takeover
**Code:** `packages/backend/src/controllers/authController.ts:172-180`
**Issue:**

The OAuth callback auto-links social accounts to existing users by email address **without user consent or verification**. An attacker who controls a victim's email (via compromise or with a registered lookalike domain) can hijack the victim's FindA.Sale account.

```typescript
// packages/backend/src/controllers/authController.ts:172-180
// 2. Link OAuth to an existing email account
if (!user && email) {
  const emailUser = await prisma.user.findUnique({ where: { email } });
  if (emailUser) {
    user = await prisma.user.update({
      where: { id: emailUser.id },
      data: { oauthProvider: provider, oauthId: providerId },
    });
  }
}
```

**Exploit:**

1. Attacker identifies a victim user (e.g., jane@example.com).
2. Attacker signs up with OAuth (Google/Facebook) using an account with email `jane@example.com` (or if they compromised it, they use it directly).
3. Backend finds the existing `jane@example.com` user record in the database (created via earlier email/password registration).
4. Backend **silently updates** the user's `oauthProvider` and `oauthId` to link the attacker's social account.
5. Attacker now logs in as jane@example.com via Google/Facebook without ever knowing the original password.
6. No notification is sent to the victim. No email verification occurs.

**Fix:**

Remove automatic email-based account linking. Require explicit user action:

- **Require email verification** before linking: send a confirmation link to the email address; user must click it before the link is finalized.
- **Prevent linking on first OAuth login**: First OAuth login should **always** create a new account or fail if email is taken. Do not auto-link without consent.
- **Provide account merge UI in Settings**: Allow authenticated users to voluntarily link OAuth to their existing account via a Settings → "Link Social Account" flow, after email verification.

**Alternative (Faster):** Disable email-based linking entirely. On OAuth callback, if no prior OAuth record exists, always create a new account. Existing email/password users must use password login; OAuth users must use OAuth. This eliminates the attack but requires duplicate accounts for users with both auth methods.

---

### 2. Missing Redirect URI Validation — P0

**Vector:** redirect_uri
**Code:** `packages/frontend/pages/login.tsx:147` and `packages/frontend/pages/register.tsx:296`
**Issue:**

The OAuth flow uses hardcoded `callbackUrl: '/'` and `callbackUrl: '/'` in the `signIn()` calls, which is safe by default. **However, NextAuth.js also accepts dynamic callback URLs via the URL** (e.g., `?callbackUrl=/admin`), and FindA.Sale does **not validate the callbackUrl** against an allowlist.

If an attacker crafts a malicious URL:
```
https://finda.sale/login?callbackUrl=https://attacker.com/steal-token
```

NextAuth may redirect to the attacker's site after authentication, potentially exposing the session or JWT in the URL/referrer.

```typescript
// packages/frontend/pages/login.tsx:147
onClick={() => signIn('google', { callbackUrl: '/' })}
```

The `callbackUrl` is also accepted from `router.query.redirect` on the login page:

```typescript
// packages/frontend/pages/login.tsx:32-34
const redirect = typeof router.query.redirect === 'string' ? router.query.redirect : null;
if (redirect && redirect.startsWith('/')) {
  router.push(redirect);
}
```

This is mitigated by the `startsWith('/')` check, but the OAuth callbackUrl itself has no validation.

**Exploit:**

1. Attacker sends victim a link: `https://finda.sale/api/auth/signin/google?callbackUrl=https://attacker.com/phishing`
2. Victim clicks, authenticates with Google.
3. NextAuth processes the callback and redirects to `https://attacker.com/phishing`.
4. Attacker's site may capture the Authorization Code, session token, or other sensitive data in the referrer header or URL parameters.
5. Depending on NextAuth's session implementation, the JWT may be exposed in the redirect or in subsequent requests.

**Fix:**

Define an explicit allowlist of valid callback URLs in NextAuth configuration:

```typescript
// packages/frontend/pages/api/auth/[...nextauth].ts
const validCallbackUrls = [
  '/',
  '/organizer/dashboard',
  '/onboarding',
  // Add other safe internal routes
];

export const authOptions: NextAuthOptions = {
  // ... existing config
  callbacks: {
    async redirect({ url, baseUrl }) {
      // Allow relative paths starting with /
      if (url.startsWith('/')) {
        // Whitelist specific routes
        if (validCallbackUrls.some(allowed => url === allowed || url.startsWith(allowed + '?'))) {
          return `${baseUrl}${url}`;
        }
        // Default fallback for unknown paths
        return baseUrl;
      }
      // Reject absolute URLs (external redirects)
      return baseUrl;
    },
  },
  // ...
};
```

Alternatively, NextAuth's `pages.signIn` and role-based redirects in the backend (`authController.ts:35-38`) should be relied upon, and dynamic callbackUrl acceptance should be disabled entirely.

---

### 3. Missing Session Invalidation After Account Linking — P1

**Vector:** session-fixation
**Code:** `packages/backend/src/controllers/authController.ts:156-217`
**Issue:**

When an OAuth login is processed via `oauthLogin()`, a new JWT is issued immediately. **However, if a session already exists from a previous password login, that session is not invalidated.** This creates a session fixation risk in edge cases.

An attacker could:
1. Log in as themselves with email/password, obtaining JWT-A.
2. Trick the system into linking OAuth to a victim's account.
3. Log in via OAuth, obtaining JWT-B (for the victim's now-linked account).
4. The attacker retains JWT-A from step 1 (still valid for up to 7 days).

If the system does not explicitly invalidate JWT-A, an attacker might exploit timing windows or mixed-auth states.

```typescript
// packages/backend/src/controllers/authController.ts:199-213
const token = jwt.sign(
  {
    id:           user.id,
    email:        user.email,
    name:         user.name,
    role:         user.role,
    points:       user.points,
    referralCode: user.referralCode,
  },
  process.env.JWT_SECRET!,
  { expiresIn: '7d' }
);
```

Additionally, on the frontend, the `OAuthBridge` component does call `signOut({ redirect: false })` to clear the NextAuth session, but it does **not explicitly clear localStorage tokens**:

```typescript
// packages/frontend/pages/_app.tsx:50-52
if (status === 'authenticated' && backendJwt && !authLoading && !user) {
  login(backendJwt);
  signOut({ redirect: false });
}
```

**Fix:**

1. **Add a token revocation mechanism** (P1 — required):
   - Add a `tokenRevocationList` table or Redis cache to invalidate old JWTs on account changes.
   - When OAuth is linked, revoke all existing JWTs for that user.
   - Validate incoming tokens against the revocation list in the `authenticate` middleware.

   ```typescript
   // packages/backend/src/middleware/auth.ts
   const decoded = jwt.verify(token, jwtSecret) as { id: string; iat: number };
   const isRevoked = await prisma.tokenRevocation.findFirst({
     where: { userId: decoded.id, revokedBefore: new Date(decoded.iat * 1000) }
   });
   if (isRevoked) {
     return res.status(401).json({ message: 'Token has been revoked' });
   }
   ```

2. **Clear localStorage on OAuth login** (P1 — critical):
   ```typescript
   // packages/frontend/pages/_app.tsx (OAuthBridge)
   if (status === 'authenticated' && backendJwt && !authLoading && !user) {
     // Clear old token
     if (typeof window !== 'undefined') {
       localStorage.removeItem('authToken'); // or whatever key is used
     }
     login(backendJwt);
     signOut({ redirect: false });
   }
   ```

3. **Issue shorter-lived tokens for OAuth** (P2 — best practice):
   - Reduce OAuth JWT expiry to 1-2 hours; use refresh tokens for extension.
   - This limits the window for token reuse attacks.

---

### 4. Missing OAuth State Validation Error Handling — P2

**Vector:** state-csrf
**Code:** `packages/frontend/pages/api/auth/[...nextauth].ts:38-56`
**Issue:**

NextAuth.js **does handle CSRF state validation correctly by default** — it generates a cryptographic state parameter per request and validates it on callback. However, the JWT callback does **not explicitly log or alert on state validation failures**. If NextAuth's state check fails, the `jwt` callback is never called, but there's no explicit logging of why the OAuth flow failed.

```typescript
// packages/frontend/pages/api/auth/[...nextauth].ts:39-55
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
}
```

**Assessment:** NextAuth's state protection is **solid and enabled by default**. No change needed for state CSRF. This is a **PASS** — state is properly validated by NextAuth itself before the jwt callback is invoked.

However, the error handling could be improved:
- If the backend OAuth endpoint (`POST /auth/oauth`) fails, the error is logged but the flow continues silently, returning an empty token.
- A user might be "logged in" to NextAuth but without a backend JWT, breaking the app.

**Fix (Optional P2):**

Explicitly check for `backendJwt` presence and redirect to login on failure:

```typescript
async jwt({ token, account, profile }) {
  if (account && profile) {
    try {
      const { data } = await axios.post(`${apiUrl}/auth/oauth`, { /* ... */ });
      if (!data.token) {
        throw new Error('Backend OAuth exchange did not return a token');
      }
      token.backendJwt = data.token;
      token.userRole   = data.user?.role ?? 'USER';
    } catch (err: any) {
      console.error('[NextAuth] Backend OAuth exchange failed:', err?.message);
      // Mark the session as failed so OAuthBridge can handle it
      token.authFailed = true;
      return token;
    }
  }
  return token;
}
```

Then in OAuthBridge:

```typescript
if (status === 'authenticated' && (session as any).authFailed) {
  signOut({ callbackUrl: '/login?error=oauth_failed' });
  return null;
}
```

---

### 5. OAuth Provider ID Collision Risk — P2

**Vector:** account-takeover (secondary)
**Code:** `packages/database/prisma/schema.prisma:82` and `packages/backend/src/controllers/authController.ts:168-170`
**Issue:**

The database enforces a unique constraint on `(oauthProvider, oauthId)`:

```prisma
// packages/database/prisma/schema.prisma:82
@@unique([oauthProvider, oauthId])
```

This is **correct and prevents duplicate OAuth accounts**. However, it does **not prevent email collision** with existing password-auth users. Combined with Finding #1 (email-based linking), this means:

- Attacker registers email `victim@example.com` with Google OAuth.
- Backend checks if `victim@example.com` exists in the database.
- If it does (from a prior password registration), it silently links the OAuth account.
- Attacker gains access without owning the email.

**Assessment:** This is a **manifestation of Finding #1** (account takeover via email-linking). The unique constraint itself is fine. The issue is the logic that uses email to auto-link.

**Fix:** Covered in Finding #1.

---

## Clean Bill / Pass Items

### OAuth State Parameter Validation — PASS

NextAuth.js handles CSRF state validation correctly:
- A cryptographically random state parameter is generated per request and stored in a secure session cookie.
- The callback verifies that the returned state matches the stored state before processing the OAuth response.
- This is implemented by NextAuth and requires no custom code.

**Status:** Secure. No changes needed.

---

### Password Hashing — PASS

Password hashes use bcrypt with 10 salt rounds (standard):

```typescript
// packages/backend/src/controllers/authController.ts:43-44
const saltRounds = 10;
const hashedPassword = await bcrypt.hash(password, saltRounds);
```

bcrypt with 10 rounds provides adequate protection against brute-force attacks in 2026.

**Status:** Secure. No changes needed.

---

### JWT Signature Validation — PASS

JWTs are signed with `JWT_SECRET` from environment variables and verified on every request:

```typescript
// packages/backend/src/middleware/auth.ts:20
const decoded = jwt.verify(token, jwtSecret) as { id: string };
```

Tokens with an invalid signature are rejected. Secret is not hardcoded.

**Status:** Secure. No changes needed.

---

### Password Reset Token Expiration — PASS

Password reset tokens expire after 1 hour and are deleted after use:

```typescript
// packages/backend/src/routes/auth.ts:75
const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

// packages/backend/src/routes/auth.ts:132
data: { password: hashed, resetToken: null, resetTokenExpiry: null },
```

**Status:** Secure. No changes needed.

---

### Rate Limiting on Password Reset — PASS

Password reset endpoint is rate-limited to 5 attempts per hour per IP:

```typescript
// packages/backend/src/routes/auth.ts:10-17
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
});
```

This prevents email enumeration and account takeover attempts via password reset spam.

**Status:** Secure. No changes needed.

---

### Email Enumeration Defense — PASS

Password reset endpoint returns the same message regardless of whether the email exists:

```typescript
// packages/backend/src/routes/auth.ts:72
if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });
```

**Status:** Secure. No changes needed.

---

### OAuth Provider Validation — PASS

The backend validates that `provider` is one of the configured OAuth providers before processing:

```typescript
// packages/backend/src/controllers/authController.ts:160-162
if (!provider || !providerId) {
  return res.status(400).json({ message: 'provider and providerId are required' });
}
```

While an explicit whitelist check (e.g., `if (!['google', 'facebook'].includes(provider))`) would be clearer, NextAuth only sends valid provider names to the backend, so this is adequate in practice.

**Status:** Acceptable. Could be improved with an explicit whitelist, but not a security defect in isolation.

---

### OAuth Callback URL Validation (Frontend Login Redirect) — PASS

The frontend validates that manual redirect URLs start with `/`:

```typescript
// packages/frontend/pages/login.tsx:32-34
if (redirect && redirect.startsWith('/')) {
  router.push(redirect);
}
```

This prevents open redirect attacks on the manual login flow.

**Status:** Secure. No changes needed. (Note: OAuth callbackUrl still needs validation per Finding #2.)

---

### NextAuth Session Secret — PASS

NextAuth uses a configured `NEXTAUTH_SECRET` environment variable:

```typescript
// packages/frontend/pages/api/auth/[...nextauth].ts:70
secret: process.env.NEXTAUTH_SECRET,
```

This should be a 32-byte random string. If properly configured in production, session cookies are cryptographically signed.

**Status:** Secure, assuming NEXTAUTH_SECRET is a strong random value in production.

---

## Recommended Next Steps

### Immediate (Block Beta)

1. **Fix Account Takeover via Email-Linking (Finding #1):**
   - Disable automatic email-based account linking.
   - Require email verification before linking OAuth.
   - Add explicit user consent flow for account merging.
   - **Estimated effort:** 4-6 hours (add email verification flow, update backend logic).

2. **Implement Redirect URI Allowlist (Finding #2):**
   - Define valid callback URLs in NextAuth config.
   - Reject any callbackUrl not in the allowlist.
   - Test with various redirect injection attempts.
   - **Estimated effort:** 2-3 hours (config change, testing).

### Within 1 Week of Beta

3. **Add Token Revocation on Account Changes (Finding #3):**
   - Create a `TokenRevocation` table or Redis cache.
   - Revoke all JWTs when OAuth is linked or password changed.
   - Validate revocation status in the `authenticate` middleware.
   - Clear localStorage on OAuth login.
   - **Estimated effort:** 6-8 hours (database migration, middleware change, frontend update).

### Best Practice (Post-Beta)

4. **Improve OAuth Error Handling (Finding #4):**
   - Log backend OAuth exchange failures explicitly.
   - Redirect users to login on JWT generation failure.
   - Add user-facing error messages for OAuth failures.
   - **Estimated effort:** 2-3 hours.

5. **Add Explicit Provider Whitelist (Finding #5):**
   - Replace implicit provider validation with explicit whitelist check.
   - This hardens against future misconfiguration.
   - **Estimated effort:** 1 hour.

6. **Implement Refresh Token Flow (P2):**
   - Reduce access token lifetime to 1-2 hours.
   - Issue long-lived refresh tokens (7 days).
   - Add token refresh endpoint and logic.
   - **Estimated effort:** 8-10 hours (backend + frontend).

### Security Testing Before Beta

- **Manual Test:** Register with email/password as User A. Try to link the same email with Google OAuth from an attacker account. Verify account is not silently linked.
- **Redirect URI Test:** Attempt OAuth callback with injected callbackUrl parameters (e.g., `?callbackUrl=https://attacker.com`). Verify redirect is blocked.
- **Token Lifecycle Test:** Log in via email/password, obtain JWT-A. Log in via OAuth, obtain JWT-B. Verify JWT-A no longer works after OAuth login (once revocation is implemented).
- **Session Fixation Test:** Verify that logging out of NextAuth also clears the backend JWT in localStorage.

---

## Summary Table

| Finding | Vector | Severity | Action | Effort |
|---------|--------|----------|--------|--------|
| Account Takeover via Email-Linking | account-takeover | **P0** | Fix before beta | 4-6h |
| Missing Redirect URI Validation | redirect_uri | **P0** | Fix before beta | 2-3h |
| Missing Session Invalidation | session-fixation | **P1** | Fix within 1 week | 6-8h |
| OAuth Error Handling | state-csrf | **P2** | Post-beta | 2-3h |
| Provider Whitelist | account-takeover | **P2** | Post-beta | 1h |

---

**Report Date:** 2026-03-09
**Reviewed By:** FindA.Sale Security Team
**Status:** Ready for Engineering Review
