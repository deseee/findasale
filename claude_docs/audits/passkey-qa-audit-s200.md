# Passkey Authentication (Feature #19) — QA Audit Report

**Date:** 2026-03-18
**Auditor:** findasale-qa
**Session:** S200
**Overall Verdict:** FAIL (P0 blocker identified)

---

## Executive Summary

Feature #19 (Passkey/WebAuthn authentication) is feature-complete with solid security fundamentals, but has **one critical P0 blocker that must be fixed before production deployment:**

- **P0 Blocker:** authenticateBegin uses a fixed key ('passkey-auth-current') for challenge storage, causing a race condition where concurrent login attempts overwrite each other's challenges.

Three additional issues identified:
- P1: WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN env vars undocumented (silent failure in production)
- P2: Unknown credential returns 404 instead of 401 (enumeration vulnerability)
- P2: Counter regression not logged (reduced security visibility)

---

## Audit Scorecard

| Category | Status | Notes |
|----------|--------|-------|
| **Security** | PASS | 5/6 checks. Challenge handling, replay prevention, auth enforcement all solid. RP ID/origin validated. |
| **Flow Correctness** | FAIL | P0 blocker: concurrent session race condition in authenticateBegin. |
| **Error Handling** | PASS | 4/4 checks. Clear error messages, proper HTTP status codes (minor P2 on 404 vs 401). |
| **UX** | PASS | 3/3 checks. Browser compatibility, fallback to password, loading states all present. |
| **OVERALL** | FAIL | Feature-complete but requires fix before merge. |

---

## Detailed Findings

### Security Audit

#### [✓ PASS] Challenge stored server-side before verification

**Location:** `packages/backend/src/lib/webauthnChallenges.ts:25–31`

- `generateAndStoreChallenge()` creates random 32-byte challenge using `crypto.randomBytes(32)`
- Converted to base64url and stored in in-memory Map
- Challenges are NOT transmitted to client in plain form
- Only PublicKeyCredentialCreationOptions/RequestOptions (containing challenge) are sent
- 5-minute TTL enforced (`CHALLENGE_TTL = 5 * 60 * 1000`)

**Risk Mitigated:** Server-side challenge prevents client-side spoofing.

---

#### [✓ PASS] Challenge cleared after use

**Location:** `packages/backend/src/lib/webauthnChallenges.ts:39–57`

- `getAndValidateChallenge()` performs one-time deletion immediately after retrieval
- `challengeMap.delete(userId)` called on line 54, before returning
- `clearChallenge(userId)` also called on verification failure (passkeyController.ts:113)
- Expired challenges cleaned up periodically via `setInterval()` (line 79)

**Risk Mitigated:** One-time use prevents replay attacks.

---

#### [✓ PASS] rpID and origin validated against environment config

**Location:** `packages/backend/src/controllers/passkeyController.ts:17–19`

```typescript
const WEBAUTHN_RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const WEBAUTHN_ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000';
```

Both verified in:
- `verifyRegistrationResponse()` call (line 108–109)
- `verifyAuthenticationResponse()` call (line 334–335)

**Issue:** Falls back to hardcoded localhost for dev, but **env vars NOT documented in SECURITY.md or .env.example**. If deployer forgets to set vars in production, auth will fail silently.

**FLAG:** P1 (documented in RECOMMENDED FIXES section)

---

#### [⚠ PARTIAL] User verification set to "preferred" (should be "required")

**Location:** `packages/backend/src/controllers/passkeyController.ts:47, 189`

```typescript
// registerBegin (line 47)
userVerification: 'preferred',

// authenticateBegin (line 189)
userVerification: 'preferred',
```

**Issue:** "preferred" means user verification is optional. Industry best practice is "required" to force biometric/PIN on every sign-in. Current setting reduces security posture.

**FLAG:** P2 (UX trade-off; discuss with Patrick — "preferred" is easier, "required" is stricter)

---

#### [✓ PASS] Credential counter checked and updated

**Location:** `packages/backend/src/controllers/passkeyController.ts:336–340, 347–353`

- Counter passed to `verifyAuthenticationResponse()` as part of authenticator object
- `newCounter` extracted from `verified.authenticationInfo` and updated in DB
- Prevents cloned authenticator attacks
- Validation delegated to `@simplewebauthn/server` library

---

#### [✓ PASS] User must be authenticated to register a new passkey

**Location:** `packages/backend/src/routes/passkey.ts:15–16`

```typescript
router.post('/register/begin', authenticate, registerBegin);
router.post('/register/complete', authenticate, registerComplete);
```

Both routes:
- Require `authenticate` middleware (Bearer token + JWT verification)
- Validate `tokenVersion` to prevent stale tokens
- Support `organizer.tokenVersion` invalidation
- User lookup confirmed before challenge generation

---

#### [✓ PASS] Auth middleware properly applied to protected routes

**Location:** `packages/backend/src/middleware/auth.ts:35–79`

- `authenticate` middleware enforces Bearer token requirement
- JWT signature verified against `JWT_SECRET`
- `tokenVersion` mismatch invalidates token (line 57–59)
- `organizerTokenVersion` mismatch invalidates organizer tokens (line 62–66)
- Route mounting: `app.use('/api/auth/passkey', authLimiter, passkeyRoutes)` applies rate limiting (index.ts:264)
- Rate limit: 10 requests / 15 minutes per IP (stricter auth limiter)

---

### Flow Correctness Audit

#### [✓ PASS] registerBegin flow

**Endpoint:** `POST /api/auth/passkey/register/begin` (authenticated)

**Flow:**
1. User sends authenticated request
2. Server generates PublicKeyCredentialCreationOptions via `generateRegistrationOptions()`
3. Random challenge generated and stored via `generateAndStoreChallenge(userId)`
4. Returns `{ publicKeyOptions }` to client
5. Client calls `startRegistration(options)` via simplewebauthn/browser

**Status:** ✓ Correct

---

#### [✓ PASS] registerComplete flow

**Endpoint:** `POST /api/auth/passkey/register/complete` (authenticated)

**Flow:**
1. Client sends: `id`, `rawId`, `response`, `type`, `deviceName`
2. Server retrieves and validates challenge via `getAndValidateChallenge(userId)`
3. Verifies attestation via `verifyRegistrationResponse()`
4. Extracts `credentialID` and `credentialPublicKey` from verified.registrationInfo
5. Converts public key (Uint8Array) to base64url string with proper +/= replacement
6. Stores PasskeyCredential with userId, credentialId, publicKey, counter=0, deviceName
7. Returns 201 with credential metadata
8. **Challenge cleared on failure** (line 113)

**Status:** ✓ Correct

---

#### [✓ PASS] authenticateBegin flow

**Endpoint:** `POST /api/auth/passkey/authenticate/begin` (public)

**Flow:**
1. Server generates challenge via `generateAndStoreChallenge('passkey-auth-current')`
2. Generates PublicKeyCredentialRequestOptions (empty allowCredentials for discoverable credential flow)
3. Returns `{ publicKeyOptions }` to client
4. Client calls `startAuthentication(options)`

**Issue:** **Uses fixed key 'passkey-auth-current' for challenge storage**

```typescript
// Line 182 — PROBLEMATIC
const challenge = generateAndStoreChallenge('passkey-auth-current');
```

**Problem:** In production with concurrent users:
- User A starts auth, server stores challenge with key 'passkey-auth-current'
- User B starts auth before User A completes, overwrites the challenge
- User A's authenticateComplete retrieves User B's challenge
- Verification fails: User A's assertion doesn't match User B's challenge

**Reproducibility:** Sequential logins fine. Simultaneous logins from different users will fail.

**FLAG:** P0 BLOCKER

---

#### [✓ PASS] authenticateComplete flow

**Endpoint:** `POST /api/auth/passkey/authenticate/complete` (public)

**Flow:**
1. Client sends: `id`, `response`
2. Server converts credentialId to base64url format
3. Looks up PasskeyCredential by credentialId (includes user)
4. Retrieves challenge via `getAndValidateChallenge('passkey-auth-current')`
5. Verifies assertion via `verifyAuthenticationResponse()`
6. Updates counter in DB
7. Generates JWT with user claims (id, email, name, role, points, subscriptionTier, tokenVersion, organizerTokenVersion, onboardingComplete)
8. Returns `{ token, user }`

**Public key reconstruction (lines 323–328):**
```typescript
const publicKeyBuffer = Buffer.from(
  credential.publicKey
    .replace(/-/g, '+')
    .replace(/_/g, '/'),
  'base64'
);
```

✓ Handles base64url → base64 conversion correctly (restores +//)

**Status:** ✓ Correct (except for shared challenge key issue noted above)

---

#### [✓ PASS] Redirect after login

**Frontend:** `packages/frontend/pages/login.tsx:49–69`

**Flow:**
1. `handlePasskeySignin()` calls `authenticatePasskey()`
2. Receives `{ token, user }`
3. Stores token via `login(result.token)` in AuthContext + localStorage
4. Honors `?redirect=` query param
5. Falls back to role-based redirect: `/organizer/dashboard` for ORGANIZER, `/` for others
6. Same flow as password login — consistent UX

**Status:** ✓ Correct

---

### Error Handling Audit

#### [✓ PASS] Invalid/expired challenge returns 400

**registerComplete (lines 98–100):**
```
"Challenge expired or invalid. Please start registration again."
```

**authenticateComplete (line 318):**
```
"Challenge not found. Start authentication again."
```

**Status:** ✓ Correct

---

#### [⚠ PARTIAL] Unknown credential returns 401 (should not be 404)

**authenticateComplete (line 295):**
```typescript
if (!credential) {
  return res.status(404).json({ message: 'Passkey not found' });
}
```

**Issue:** Returns 404, which confirms to attacker that credential doesn't exist. Security best practice: return 401 to avoid enumeration attacks.

**FLAG:** P2 (minor security issue)

---

#### [✓ PASS] Verification failures return proper codes

**Registration failure (line 116):**
```
"Registration verification failed" → 400
```

**Authentication failure (line 344):**
```
"Authentication verification failed" → 401
```

**Note:** Counter regression caught by library, returns 401 but doesn't distinguish from other failures.

**Status:** ✓ Correct

---

#### [✓ PASS] Missing fields return clear error messages

- Missing credentialId/response: 400 "Missing credential data"
- Invalid attestation: 400 "Invalid credential response"
- Unauthenticated on registration: 401 "Not authenticated"

**Status:** ✓ Correct

---

### UX Audit

#### [✓ PASS] Browser compatibility check present

**usePasskey hook (lines 20–24):**
```typescript
useEffect(() => {
  if (typeof window !== 'undefined' && window.PublicKeyCredential) {
    setIsSupported(true);
  }
}, []);
```

**PasskeyManager component (lines 35–39):**
Same check, returns fallback UI if unsupported.

**Login page (line 159):**
```typescript
{passkeySupported && (
  // Render passkey button
)}
```

**Status:** ✓ Correct

---

#### [✓ PASS] Fallback to password login if passkey fails

**Login page:**
- Password + email fields shown as primary method
- Passkey button rendered below as secondary option
- If passkey fails, error message displays, user can still try password

**PasskeyManager (lines 100–106):**
User-friendly error messages for different failure reasons (NotAllowedError, NotSupportedError, etc.)

**Status:** ✓ Correct

---

#### [✓ PASS] Loading state during WebAuthn ceremony

**usePasskey hook:**
- `isLoading` state set/cleared around `startRegistration()` and `startAuthentication()`

**PasskeyManager:**
- `isRegistering` flag during registration (disabled button state, loading text)

**Login page:**
- `passkeyLoading` state + disabled button + "Signing in..." text

**Status:** ✓ Correct

---

## Database Schema Audit

**Location:** `packages/database/prisma/schema.prisma:1398–1409`

```prisma
model PasskeyCredential {
  id           String   @id @default(cuid())
  userId       String
  credentialId String   @unique  // base64url encoded
  publicKey    String   // stored as base64url
  counter      Int      @default(0)
  deviceName   String?
  createdAt    DateTime @default(now())
  lastUsedAt   DateTime?
  updatedAt    DateTime @updatedAt
  user         User     @relation("UserPasskeys", fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

**Audit Results:**
- ✓ credentialId unique (prevents duplicate registrations)
- ✓ userId indexed (faster queries)
- ✓ Cascade delete on user deletion
- ✓ counter tracked (for replay detection)
- ✓ deviceName for UX
- ⚠ lastUsedAt present but never updated in controller (see POST AUDIT NOTE)

**POST AUDIT NOTE:** `lastUsedAt` field exists but is never updated in authenticateComplete. Consider adding update to enhance PasskeyManager UI (shows "Last used X days ago").

---

## Recommended Fixes (For findasale-dev Dispatch)

### [P0] Fix concurrent session support in authenticateBegin

**File:** `packages/backend/src/controllers/passkeyController.ts:182`

**Current (broken):**
```typescript
const challenge = generateAndStoreChallenge('passkey-auth-current');
```

**Issue:** Fixed key causes race condition with concurrent logins.

**Solution Options:**

**Option A — Session-based (recommended if express-session available):**
```typescript
const sessionId = req.sessionID || generateId();
const challenge = generateAndStoreChallenge(`passkey-auth-${sessionId}`);
// Return sessionId to client
res.json({ publicKeyOptions: optionsWithChallenge, sessionId });
```

Then in authenticateComplete:
```typescript
const { id, response, sessionId } = req.body;
const challenge = getAndValidateChallenge(`passkey-auth-${sessionId}`);
```

**Option B — UUID echo-back (if express-session not available):**
```typescript
const sessionId = generateUUID();
const challenge = generateAndStoreChallenge(sessionId);
res.json({ publicKeyOptions: optionsWithChallenge, sessionId });
```

Client echoes back sessionId in authenticateComplete.

**Option C — Timestamp window (simpler, less precise):**
```typescript
const minute = Math.floor(Date.now() / 60000);
const challenge = generateAndStoreChallenge(`passkey-auth-${minute}`);
```

Allows 1-minute window for auth to complete. Risk: if clock skew occurs, challenge lookup fails.

**Recommendation:** Use Option A (session-based) if express-session is available, else Option B.

---

### [P1] Document WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN env vars

**Files to update:**
1. `packages/backend/.env.example` — Add:
   ```
   WEBAUTHN_RP_ID=findasale.com
   WEBAUTHN_ORIGIN=https://findasale.com
   ```

2. `claude_docs/SECURITY.md` — Add section:
   ```markdown
   ## WebAuthn Configuration

   Passkey authentication requires two environment variables:
   - WEBAUTHN_RP_ID: The domain name (e.g., findasale.com)
   - WEBAUTHN_ORIGIN: The full origin URL (e.g., https://findasale.com)

   If not set, falls back to localhost (dev mode only).
   Production deployments MUST set these vars or passkey auth will fail.
   ```

3. (Optional) `packages/backend/src/index.ts` — Add fail-fast check:
   ```typescript
   if (process.env.NODE_ENV === 'production') {
     if (!process.env.WEBAUTHN_RP_ID || !process.env.WEBAUTHN_ORIGIN) {
       console.error('❌ FATAL: WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN required in production');
       process.exit(1);
     }
   }
   ```

---

### [P2] Change authenticateComplete 404 → 401

**File:** `packages/backend/src/controllers/passkeyController.ts:295`

**Current:**
```typescript
if (!credential) {
  return res.status(404).json({ message: 'Passkey not found' });
}
```

**Fix:**
```typescript
if (!credential) {
  return res.status(401).json({ message: 'Authentication failed' });
}
```

**Rationale:** Prevents credential enumeration attacks. Use 401 for unknown credentials.

---

### [P2] Add counter regression logging

**File:** `packages/backend/src/controllers/passkeyController.ts:343–345`

**Current:**
```typescript
if (!verified.verified) {
  return res.status(401).json({ message: 'Authentication verification failed' });
}
```

**Add logging before return:**
```typescript
if (!verified.verified) {
  console.warn(`[SECURITY] Passkey verification failed for credential ${credentialIdBase64url} — possible counter regression (cloned authenticator)`);
  return res.status(401).json({ message: 'Authentication verification failed' });
}
```

**Rationale:** Provides visibility if authenticators are cloned (counter regression detected).

---

### [OPTIONAL P2] Consider changing userVerification to "required"

**Files:** `packages/backend/src/controllers/passkeyController.ts:47, 189`

**Current:**
```typescript
userVerification: 'preferred'
```

**Alternative (stricter):**
```typescript
userVerification: 'required'
```

**Trade-off:**
- `preferred`: Easier UX, user may skip biometric/PIN, weaker security
- `required`: Forces biometric/PIN on every sign-in, stricter security, slightly worse UX

**Recommendation:** Leave as-is for now (UX-friendly) unless Patrick requests stricter security.

---

### [OPTIONAL] Update lastUsedAt on authentication

**File:** `packages/backend/src/controllers/passkeyController.ts:348–353`

**Current:**
```typescript
await prisma.passkeyCredential.update({
  where: { id: credential.id },
  data: {
    counter: verified.authenticationInfo?.newCounter || credential.counter,
  },
});
```

**Enhancement:**
```typescript
await prisma.passkeyCredential.update({
  where: { id: credential.id },
  data: {
    counter: verified.authenticationInfo?.newCounter || credential.counter,
    lastUsedAt: new Date(),
  },
});
```

**Rationale:** PasskeyManager component displays lastUsedAt; currently always null.

---

## Test Plan (For QA Re-verification)

After fixes are applied, run:

1. **P0 Fix — Concurrent Login Test:**
   - Start login flow on User A (receive publicKeyOptions)
   - Immediately start login flow on User B (receive publicKeyOptions)
   - Complete User A's assertion
   - Complete User B's assertion
   - Both should succeed with correct tokens

2. **P1 Fix — Env Var Validation:**
   - Unset WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN
   - Deploy to staging (if fail-fast check added, server should not start)
   - Set env vars correctly
   - Passkey auth should succeed

3. **P2 Fix — Unknown Credential:**
   - Try authenticateComplete with unknown credentialId
   - Expect 401 status, not 404

4. **P2 Fix — Counter Regression:**
   - Clone a security key (simulator or physical)
   - Authenticate with original, increment counter
   - Try to authenticate with clone (counter not incremented)
   - Should fail with "Authentication verification failed"
   - Check server logs for counter regression warning

5. **UX Tests:**
   - Test passkey registration in PasskeyManager
   - Test passkey login on login.tsx
   - Test browser unsupported fallback message
   - Test error handling (cancel, timeout, etc.)

---

## Files Reviewed

**Backend:**
- `/packages/backend/src/controllers/passkeyController.ts` (397 lines)
- `/packages/backend/src/routes/passkey.ts` (27 lines)
- `/packages/backend/src/lib/webauthnChallenges.ts` (82 lines)
- `/packages/backend/src/middleware/auth.ts` (80 lines)
- `/packages/backend/src/index.ts` (lines 57, 264)

**Frontend:**
- `/packages/frontend/hooks/usePasskey.ts` (148 lines)
- `/packages/frontend/components/PasskeyManager.tsx` (219 lines)
- `/packages/frontend/pages/login.tsx` (232 lines)

**Database:**
- `/packages/database/prisma/schema.prisma` (PasskeyCredential model, lines 1398–1409)

---

## Conclusion

Feature #19 is **feature-complete and functionally correct**, with good security fundamentals. However, **the P0 blocker (concurrent session race condition) must be fixed before production deployment.**

After fixes are applied and re-tested, this feature is ready for general availability.

---

**Audit Sign-off:** findasale-qa (S200)
**Next Steps:** Dispatch to findasale-dev for P0/P1/P2 fixes, then retest.
